import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { invalidateExpenseScope } from './invalidation'
import type { SplitInput } from './useAddExpense'
import type { CategoryType, CurrencyType, SplitMethod, Json } from '@/shared/lib/database.types'

// 費用可更新的白名單欄位（對照 update_group_expense v3-03 的 p_updates 白名單；
// title/description 別名由 RPC 端處理，個人 update 走 title）。
export interface UpdateExpenseInput {
    title?: string
    description?: string
    amount?: number
    category?: CategoryType
    icon?: string
    date?: string
    currency?: CurrencyType
    split_method?: SplitMethod | null
    paid_by?: string | null
    notes?: string | null
    is_settled?: boolean
}

export interface UpdateExpenseVariables {
    id: string
    groupId: string | null
    updates: UpdateExpenseInput
    splits?: SplitInput[]
}

// 更新費用。對照 Vue expenseStore.updateExpense（expense.ts:502-539，裸表 update，群組費用無守恆）：
//   群組費用（groupId 非 null）走新 update_group_expense RPC（v3-03 簽章：p_expense_id, p_updates
//   jsonb, p_splits jsonb）——單一 transaction UPDATE + 重建 splits + 整數分守恆斷言；
//   splits 不守恆時 RPC RAISE → mutation reject（錯誤上拋）。
//   個人費用（groupId 為 null）維持裸表 update。
export function useUpdateExpense() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: async (variables: UpdateExpenseVariables): Promise<void> => {
            const { id, groupId, updates, splits } = variables

            if (groupId) {
                // update_group_expense 為原子重建：DELETE 舊 splits + INSERT 新 splits + 守恆斷言。
                // 未提供 splits（＝只改 title/notes/is_settled 等 metadata）時，必須帶回「現有 splits」，
                // 否則送 p_splits:[] 會清空分帳且守恆斷言對非零金額 RAISE（審查 B#3 空 splits 陷阱）。
                let effectiveSplits = splits
                if (!effectiveSplits || effectiveSplits.length === 0) {
                    const { data: existing, error: fetchError } = await supabase
                        .from('expense_splits')
                        .select('user_id, amount, percentage, shares')
                        .eq('expense_id', id)
                    if (fetchError) throw fetchError
                    effectiveSplits = (existing ?? []).map((s) => ({
                        userId: s.user_id,
                        amount: s.amount,
                        percentage: s.percentage ?? undefined,
                        shares: s.shares ?? undefined
                    }))
                }

                const { error } = await supabase.rpc('update_group_expense', {
                    p_expense_id: id,
                    p_updates: updates as unknown as Json,
                    p_splits: effectiveSplits.map((s) => ({
                        user_id: s.userId,
                        amount: s.amount,
                        percentage: s.percentage ?? null,
                        shares: s.shares ?? null
                    }))
                })
                if (error) throw error
                return
            }

            // 個人費用無 description 欄位（title/description 別名僅群組 RPC 端處理）；
            // 剝除後再送裸表 update，避免 PostgREST 回 column expenses.description does not exist（審查 A#7/B#7）。
            const personalUpdates = { ...updates }
            delete personalUpdates.description

            const { error } = await supabase
                .from('expenses')
                .update(personalUpdates as never)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
        },
        onSuccess: (_data, variables) => {
            invalidateExpenseScope(client, variables.groupId)
        }
    })
}
