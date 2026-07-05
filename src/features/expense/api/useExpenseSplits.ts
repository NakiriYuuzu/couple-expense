import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import type { ExpenseSplitRow } from '@/shared/lib/database.types'

// 單筆費用的分帳明細（對照 Vue splitStore.fetchSplitsForExpense split.ts:13-38）。
// key = ['splits', expenseId]；expenseId 空值時停用查詢。
export async function fetchExpenseSplits(expenseId: string): Promise<ExpenseSplitRow[]> {
    const { data, error } = await supabase
        .from('expense_splits')
        .select('*')
        .eq('expense_id', expenseId)

    if (error) throw error
    return data ?? []
}

export function useExpenseSplits(expenseId: string | null | undefined) {
    return useQuery({
        queryKey: queryKeys.splits(expenseId ?? ''),
        queryFn: () => fetchExpenseSplits(expenseId as string),
        enabled: !!expenseId
    })
}

export interface UserSplitShare {
    expense_id: string
    amount: number
}

export async function fetchUserSplitShares(userId: string, expenseIds: string[]): Promise<UserSplitShare[]> {
    if (expenseIds.length === 0) return []

    const { data, error } = await supabase
        .from('expense_splits')
        .select('expense_id, amount')
        .eq('user_id', userId)
        .in('expense_id', expenseIds)

    if (error) throw error
    return (data ?? []).map((row) => ({
        expense_id: row.expense_id,
        amount: Number(row.amount)
    }))
}

export async function fetchUserSplitShare(userId: string, expenseIds: string[]): Promise<number> {
    const shares = await fetchUserSplitShares(userId, expenseIds)
    return shares.reduce((sum, row) => sum + row.amount, 0)
}

export function useUserSplitShares(userId: string | null | undefined, expenseIds: string[]) {
    const expenseIdsKey = [...expenseIds].sort().join(',')

    return useQuery({
        queryKey: queryKeys.expenseSplitShares(userId ?? '', expenseIdsKey),
        queryFn: () => fetchUserSplitShares(userId as string, expenseIds),
        enabled: !!userId && expenseIds.length > 0
    })
}

export function useUserSplitShare(userId: string | null | undefined, expenseIds: string[]) {
    const expenseIdsKey = [...expenseIds].sort().join(',')

    return useQuery({
        queryKey: queryKeys.expenseSplitShares(userId ?? '', expenseIdsKey),
        queryFn: () => fetchUserSplitShares(userId as string, expenseIds),
        enabled: !!userId && expenseIds.length > 0,
        select: (shares) => shares.reduce((sum, row) => sum + row.amount, 0)
    })
}
