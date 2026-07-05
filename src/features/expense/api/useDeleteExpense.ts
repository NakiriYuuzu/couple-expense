import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { invalidateExpenseScope, invalidateExpenseScopes } from './invalidation'
import type { ExpenseRow, ExpenseSplitRow } from '@/shared/lib/database.types'

// 刪除前的完整快照：expense 全欄位 + 其 splits（含 paid_by / notes / currency）。
// 修 P1-2：Vue 版 undo 只重放 expense 列、丟失 splits（群組費用復原後變成無分帳的孤兒）。
export interface ExpenseSnapshot {
    expense: ExpenseRow
    splits: ExpenseSplitRow[]
}

// 刪除單筆費用：先撈完整快照（expense + splits）再刪，回傳快照供 undo 全量重建。
export async function snapshotAndDelete(expenseId: string): Promise<ExpenseSnapshot> {
    const [expenseResult, splitsResult] = await Promise.all([
        supabase.from('expenses').select('*').eq('id', expenseId).single(),
        supabase.from('expense_splits').select('*').eq('expense_id', expenseId)
    ])

    if (expenseResult.error) throw expenseResult.error
    if (splitsResult.error) throw splitsResult.error
    if (!expenseResult.data) throw new Error('Expense not found')

    const snapshot: ExpenseSnapshot = {
        expense: expenseResult.data as ExpenseRow,
        splits: (splitsResult.data ?? []) as ExpenseSplitRow[]
    }

    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expenseId)
    if (deleteError) throw deleteError

    return snapshot
}

// 以快照全量重建。群組費用（group_id 非 null）經 add_group_expense RPC 原子重建
// expense + splits（帶回 paid_by / notes / currency / split_method）；個人費用直接 insert。
export async function restoreExpense(snapshot: ExpenseSnapshot): Promise<void> {
    const { expense, splits } = snapshot

    if (expense.group_id) {
        const { data: newId, error } = await supabase.rpc('add_group_expense', {
            p_group_id: expense.group_id,
            p_title: expense.title,
            p_amount: expense.amount,
            p_category: expense.category,
            p_icon: expense.icon ?? '',
            p_date: expense.date,
            p_currency: expense.currency,
            p_split_method: expense.split_method ?? 'equal',
            p_paid_by: expense.paid_by ?? expense.user_id,
            p_notes: expense.notes ?? undefined,
            p_splits: splits.map((s) => ({
                user_id: s.user_id,
                amount: s.amount,
                percentage: s.percentage,
                shares: s.shares
            }))
        })
        if (error) throw error

        // add_group_expense 無 is_settled 參數，重建列一律落預設 is_settled=false。
        // 還原「已結算」群組費用時補一次對齊（expense + 其 splits），否則已付清的分帳
        // 會以未結算狀態復活 → 誘發使用者二次結算、破壞金額守恆（審查 A#1/B#1）。
        // best-effort：對齊為次要改善（主 restore 已成功），且 expense_splits 對齊在多人群組
        // 可能撞 RLS（無法從 client 更新他人的 split）。完全正確版需 add_group_expense/restore RPC
        // 支援 is_settled 參數，隨 Phase 1 live-DB migration 一併處理（見 plan 追蹤項）。
        // 故對齊失敗不上拋、不讓 undo 整體失敗——至少 expense 本身的 is_settled 由擁有者對齊成功。
        if (expense.is_settled && newId) {
            const id = newId as string
            await Promise.all([
                supabase.from('expenses').update({ is_settled: true } as never).eq('id', id),
                supabase.from('expense_splits').update({ is_settled: true } as never).eq('expense_id', id)
            ])
        }
        return
    }

    const { error } = await supabase.from('expenses').insert([
        {
            user_id: expense.user_id,
            group_id: null,
            title: expense.title,
            amount: expense.amount,
            category: expense.category,
            icon: expense.icon,
            date: expense.date,
            currency: expense.currency,
            split_method: expense.split_method,
            paid_by: expense.paid_by,
            notes: expense.notes,
            is_settled: expense.is_settled
        }
    ])
    if (error) throw error
}

// 批次刪除：以 .delete().in().select() 回傳的列為準（修 Vue 版 deleteExpensesByDate 的樂觀移除，
// expense.ts:567-595 先本地 filter 再刪，畫面與 DB 可能不一致）。回傳實際被刪除的 id。
// ⚠️ 不快照 expense/splits，故「不可 undo」（與 Vue deleteExpensesByDate 同為單向，parity-neutral）。
//    Phase 5 不得對批次刪除提供 undo 入口；若日後需要，須改為批次快照 expense+splits（審查 A#4/B#8）。
export async function deleteExpensesByIds(expenseIds: string[]): Promise<string[]> {
    if (expenseIds.length === 0) return []

    const { data, error } = await supabase
        .from('expenses')
        .delete()
        .in('id', expenseIds)
        .select('id')

    if (error) throw error
    return (data ?? []).map((row) => row.id)
}

// 刪除 + undo + 批次刪除的整合 hook。remove 回傳快照；undo 吃快照全量重建。
export function useDeleteExpense() {
    const client = useQueryClient()

    const remove = useMutation({
        mutationFn: (input: { expenseId: string; groupId: string | null }) =>
            snapshotAndDelete(input.expenseId),
        onSuccess: (_snapshot, input) => {
            invalidateExpenseScope(client, input.groupId)
        }
    })

    const undo = useMutation({
        mutationFn: (snapshot: ExpenseSnapshot) => restoreExpense(snapshot),
        onSuccess: (_data, snapshot) => {
            invalidateExpenseScope(client, snapshot.expense.group_id)
        }
    })

    const deleteByDate = useMutation({
        mutationFn: (input: { expenseIds: string[]; groupId?: string | null; groupIds?: string[] }) =>
            deleteExpensesByIds(input.expenseIds),
        onSuccess: (_deletedIds, input) => {
            invalidateExpenseScopes(client, input.groupIds ?? (input.groupId ? [input.groupId] : []))
        }
    })

    return { remove, undo, deleteByDate }
}
