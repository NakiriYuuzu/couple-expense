import { useMemo } from 'react'
import { useExpenses } from './useExpenses'
import { CategoryUtils } from '@/features/expense/lib/categories'

export interface RecentExpense {
    title: string
    category: string
    icon: string
    amount: number
}

// 最近 N 筆去重（以 title 去重）的費用，供 AddExpenseDrawer 快速複製。
// 對照 Vue useRecentExpenses.ts：從 expenses 以 date desc 排序後逐筆去重。派生自 ['expenses'] cache。
export function useRecentExpenses(count = 3): RecentExpense[] {
    const { data } = useExpenses()

    return useMemo(() => {
        const seen = new Set<string>()
        const result: RecentExpense[] = []
        const sorted = [...(data ?? [])].sort((a, b) => b.date.localeCompare(a.date))

        for (const expense of sorted) {
            if (seen.has(expense.title)) continue
            seen.add(expense.title)
            result.push({
                title: expense.title,
                category: expense.category,
                icon: CategoryUtils.getIconKey(expense.category),
                amount: expense.amount
            })
            if (result.length >= count) break
        }

        return result
    }, [data, count])
}
