import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'

// 結算後的目標式 invalidate，取代 Vue 版手工清空 monthDebtCache（settlement.ts:282 等處
// `monthDebtCache.value = {}`）。monthDebts 以 ['monthDebts', groupId] 前綴作廢所有月份
// （一筆結算可歸屬任一月），等效於 Vue 的整批 cache 清空但改由 Query 重算。
function invalidateSettlementScope(client: QueryClient, groupId: string): void {
    void client.invalidateQueries({ queryKey: queryKeys.balances(groupId) })
    void client.invalidateQueries({ queryKey: queryKeys.simplifiedDebts(groupId) })
    void client.invalidateQueries({ queryKey: queryKeys.snapshots(groupId) })
    void client.invalidateQueries({ queryKey: queryKeys.settlements(groupId) })
    void client.invalidateQueries({ queryKey: queryKeys.monthDebtsRoot(groupId) })
    // settle_expense 會翻轉 splits.is_settled；作廢 splits root 讓詳情頁分帳狀態同步
    void client.invalidateQueries({ queryKey: queryKeys.splitsRoot() })
}

// 結算一筆債務（settle_debt RPC，對照 settlement.ts:260-297）。
export function useSettleDebt() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: {
            groupId: string
            paidTo: string
            amount: number
            notes?: string
        }): Promise<string> => {
            const { data, error } = await supabase.rpc('settle_debt', {
                p_group_id: input.groupId,
                p_paid_to: input.paidTo,
                p_amount: input.amount,
                p_notes: input.notes
            })
            if (error) throw error
            return data as string
        },
        onSuccess: (_data, input) => invalidateSettlementScope(client, input.groupId)
    })
}

// 結算指定月份的債務（settle_monthly_debt RPC，對照 settlement.ts:511-543）。
export function useSettleMonthlyDebt() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: {
            groupId: string
            paidTo: string
            amount: number
            yearMonth: string
            notes?: string
        }): Promise<string> => {
            const { data, error } = await supabase.rpc('settle_monthly_debt', {
                p_group_id: input.groupId,
                p_paid_to: input.paidTo,
                p_amount: input.amount,
                p_notes: input.notes,
                p_year_month: input.yearMonth
            })
            if (error) throw error
            return data as string
        },
        onSuccess: (_data, input) => invalidateSettlementScope(client, input.groupId)
    })
}

// 一鍵結算整筆費用（settle_expense RPC，對照 settlement.ts:618-651）。
// 費用 is_settled 會翻轉，故一併作廢 expenses。
export function useSettleExpense() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: {
            expenseId: string
            groupId: string
            notes?: string
        }): Promise<number> => {
            const { data, error } = await supabase.rpc('settle_expense', {
                p_expense_id: input.expenseId,
                p_notes: input.notes
            })
            if (error) throw error
            return (data as number | null) ?? 0
        },
        onSuccess: (_data, input) => {
            invalidateSettlementScope(client, input.groupId)
            void client.invalidateQueries({ queryKey: queryKeys.expensesRoot() })
        }
    })
}

// 更新既有結算（update_settlement RPC，對照 settlement.ts:546-581）。
export function useUpdateSettlement() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: {
            settlementId: string
            groupId: string
            amount: number
            notes?: string
        }): Promise<void> => {
            const { error } = await supabase.rpc('update_settlement', {
                p_settlement_id: input.settlementId,
                p_amount: input.amount,
                p_notes: input.notes
            })
            if (error) throw error
        },
        onSuccess: (_data, input) => invalidateSettlementScope(client, input.groupId)
    })
}

// 刪除結算（delete_settlement RPC，對照 settlement.ts:584-615）。
export function useDeleteSettlement() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: { settlementId: string; groupId: string }): Promise<void> => {
            const { error } = await supabase.rpc('delete_settlement', {
                p_settlement_id: input.settlementId
            })
            if (error) throw error
        },
        onSuccess: (_data, input) => invalidateSettlementScope(client, input.groupId)
    })
}
