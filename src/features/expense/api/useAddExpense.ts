import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useSessionStore } from '@/shared/stores/session'
import { invalidateExpenseScope } from './invalidation'
import type { ExpenseRow, CategoryType, CurrencyType, SplitMethod } from '@/shared/lib/database.types'

export interface SplitInput {
    userId: string
    amount: number
    percentage?: number
    shares?: number
}

export interface CreateExpenseInput {
    title: string
    amount: number
    category: CategoryType
    icon: string
    date: string
    group_id?: string | null
    currency?: CurrencyType
    split_method?: SplitMethod
    paid_by?: string
    notes?: string
    splits?: SplitInput[]
}

// 新增費用。對照 Vue expenseStore.addExpense（expense.ts:393-499）但收斂 P2：
//   群組分帳走原子 add_group_expense RPC（單一 transaction 建立 expense + splits），
//   取代 Vue 的「insert expense → upsert splits 失敗再補償刪除」兩步式（會留下孤兒/競態窗口）。
//   個人費用（無 groupId 或無 splits）維持直接 insert。
export function useAddExpense() {
    const client = useQueryClient()

    return useMutation({
        // 回傳 { id, groupId }：groupId 於 mutationFn 起始一次算定並隨結果帶出，
        // onSuccess 用同一定值 invalidate——避免 mutation 飛行中切換群組時，onSuccess 重讀
        // activeGroupId 而 invalidate 到與實際寫入不同的 scope（審查 A#8 race）。
        mutationFn: async (
            input: CreateExpenseInput
        ): Promise<{ id: string; groupId: string | null }> => {
            const { data: userData, error: userError } = await supabase.auth.getUser()
            if (userError) throw userError
            const userId = userData.user?.id
            if (!userId) throw new Error('用戶未登入')

            const groupId =
                input.group_id !== undefined ? input.group_id : useSessionStore.getState().activeGroupId

            const currency: CurrencyType = input.currency ?? 'TWD'
            const paidBy = input.paid_by ?? userId

            if (groupId && input.splits && input.splits.length > 0) {
                const { data, error } = await supabase.rpc('add_group_expense', {
                    p_group_id: groupId,
                    p_title: input.title,
                    p_amount: input.amount,
                    p_category: input.category,
                    p_icon: input.icon,
                    p_date: input.date,
                    p_currency: currency,
                    p_split_method: input.split_method ?? 'equal',
                    p_paid_by: paidBy,
                    p_notes: input.notes,
                    p_splits: input.splits.map((s) => ({
                        user_id: s.userId,
                        amount: s.amount,
                        percentage: s.percentage ?? null,
                        shares: s.shares ?? null
                    }))
                })
                if (error) throw error
                return { id: data as string, groupId }
            }

            const insertRow = {
                user_id: userId,
                group_id: groupId ?? null,
                title: input.title,
                amount: input.amount,
                category: input.category,
                icon: input.icon,
                date: input.date,
                currency,
                split_method: input.split_method ?? null,
                paid_by: paidBy,
                notes: input.notes ?? null
            }

            const { data, error } = await supabase
                .from('expenses')
                .insert([insertRow])
                .select('*')
                .single()

            if (error) throw error
            return { id: (data as ExpenseRow).id, groupId }
        },
        onSuccess: (result) => {
            invalidateExpenseScope(client, result.groupId)
            // GroupSwitcher 已移除：activeGroupId 僅剩「上次記帳使用的範疇」語意，
            // 供 AddExpenseDrawer / RecurringExpenseDrawer 預設群組使用，於此寫回。
            useSessionStore.getState().setActiveGroup(result.groupId)
        }
    })
}
