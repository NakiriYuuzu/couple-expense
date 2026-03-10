import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import type { ExpenseSplitInsert, ExpenseSplitRow } from '@/shared/lib/database.types'

export const useSplitStore = defineStore('split', () => {
    // 狀態
    const splitsByExpense = ref<Record<string, ExpenseSplitRow[]>>({})
    const loading = ref(false)
    const error = ref<string | null>(null)

    // 獲取單筆費用的分帳記錄
    const fetchSplitsForExpense = async (expenseId: string) => {
        try {
            loading.value = true
            error.value = null

            const { data, error: fetchError } = await supabase
                .from('expense_splits')
                .select('*')
                .eq('expense_id', expenseId)

            if (fetchError) {
                throw fetchError
            }

            splitsByExpense.value = {
                ...splitsByExpense.value,
                [expenseId]: (data ?? []) as ExpenseSplitRow[]
            }

        } catch (err) {
            console.error('獲取分帳記錄失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取分帳記錄失敗'
        } finally {
            loading.value = false
        }
    }

    // 批次獲取多筆費用的分帳記錄
    const fetchSplitsForExpenses = async (expenseIds: string[]) => {
        if (expenseIds.length === 0) return

        try {
            loading.value = true
            error.value = null

            const { data, error: fetchError } = await supabase
                .from('expense_splits')
                .select('*')
                .in('expense_id', expenseIds)

            if (fetchError) {
                throw fetchError
            }

            // 以 expense_id 為 key 分組結果
            const rows = (data ?? []) as ExpenseSplitRow[]
            const grouped: Record<string, ExpenseSplitRow[]> = {}
            for (const split of rows) {
                if (!grouped[split.expense_id]) {
                    grouped[split.expense_id] = []
                }
                grouped[split.expense_id]!.push(split)
            }

            splitsByExpense.value = {
                ...splitsByExpense.value,
                ...grouped
            }

        } catch (err) {
            console.error('批次獲取分帳記錄失敗:', err)
            error.value = err instanceof Error ? err.message : '批次獲取分帳記錄失敗'
        } finally {
            loading.value = false
        }
    }

    // 取得指定費用的分帳記錄（同步 getter）
    const getSplitsForExpense = (expenseId: string): ExpenseSplitRow[] => {
        return splitsByExpense.value[expenseId] ?? []
    }

    const updateExpenseSplits = async (
        expenseId: string,
        splits: Array<{
            userId: string
            amount: number
            percentage?: number
            shares?: number
        }>
    ) => {
        try {
            loading.value = true
            error.value = null

            const rows: ExpenseSplitInsert[] = splits.map(split => ({
                expense_id: expenseId,
                user_id: split.userId,
                amount: split.amount,
                percentage: split.percentage ?? null,
                shares: split.shares ?? null,
                is_settled: false
            }))

            const upsertResult = rows.length > 0
                ? await supabase
                    .from('expense_splits')
                    .upsert(rows, { onConflict: 'expense_id,user_id' })
                    .select('*')
                : { data: [], error: null }

            if (upsertResult.error) {
                throw upsertResult.error
            }

            const incomingUserIds = new Set(rows.map(row => row.user_id))

            if (incomingUserIds.size === 0) {
                const { error: deleteAllError } = await supabase
                    .from('expense_splits')
                    .delete()
                    .eq('expense_id', expenseId)

                if (deleteAllError) {
                    throw deleteAllError
                }
            } else {
                // 安全方式：先查出現有 splits，再用 .in() 刪除需移除的
                const { data: currentSplits, error: fetchCurrentError } = await supabase
                    .from('expense_splits')
                    .select('id, user_id')
                    .eq('expense_id', expenseId)

                if (fetchCurrentError) throw fetchCurrentError

                const toDeleteIds = (currentSplits ?? [])
                    .filter(s => !incomingUserIds.has(s.user_id))
                    .map(s => s.id)

                if (toDeleteIds.length > 0) {
                    const { error: deleteRemovedError } = await supabase
                        .from('expense_splits')
                        .delete()
                        .in('id', toDeleteIds)

                    if (deleteRemovedError) {
                        throw deleteRemovedError
                    }
                }
            }

            splitsByExpense.value = {
                ...splitsByExpense.value,
                [expenseId]: (upsertResult.data ?? []) as ExpenseSplitRow[]
            }

            return splitsByExpense.value[expenseId]
        } catch (err) {
            console.error('更新分帳記錄失敗:', err)
            error.value = err instanceof Error ? err.message : '更新分帳記錄失敗'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 清除所有分帳資料
    const clearSplits = () => {
        splitsByExpense.value = {}
    }

    // 清除錯誤狀態
    const clearError = () => {
        error.value = null
    }

    return {
        // 狀態
        splitsByExpense,
        loading,
        error,

        // 方法
        fetchSplitsForExpense,
        fetchSplitsForExpenses,
        updateExpenseSplits,
        getSplitsForExpense,
        clearSplits,
        clearError
    }
})
