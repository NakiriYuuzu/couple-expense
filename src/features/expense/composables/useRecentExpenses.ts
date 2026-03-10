import { computed } from 'vue'
import { useExpenseStore } from '@/features/expense/stores/expense'
import { CategoryUtils } from '@/features/expense/composables/useCategories'

/**
 * Returns the most recent N unique expenses (deduplicated by title)
 * for quick-copy functionality in the AddExpenseDrawer.
 */
export function useRecentExpenses(count = 3) {
    const expenseStore = useExpenseStore()

    const recentExpenses = computed(() => {
        const seen = new Set<string>()
        const result: { title: string; category: string; icon: string; amount: number }[] = []

        const sorted = [...expenseStore.expenses]
            .sort((a, b) => b.date.localeCompare(a.date))

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
    })

    return { recentExpenses }
}
