import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import type { ExpenseSplitRow } from '@/shared/lib/database.types'

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
        getSplitsForExpense,
        clearSplits,
        clearError
    }
})
