import { taipeiDateString, weekStart, currentYearMonth } from '@/shared/lib/datetime'
import type { CategoryId } from '@/entities/expense/types'

// 統計 selectors（Phase 4）：從 expenses 以純函式派生 stats，頁面端以 useMemo 包裹。
// 取代 Vue expenseStore 內嵌的 computed，並在移植時修掉兩個評估報告缺陷：
//   1) 日期分桶改走 datetime 的 Asia/Taipei 分桶（taipeiDateString / weekStart / currentYearMonth），
//      不再用裝置本地時間——出國記帳不飄月。
//   2) 本週/本月加「上界」：排除未來日期（date > 今日）。Vue 版只有下界（date >= weekStart），
//      未來日期會被灌進本週/本月總額（灌水 bug）。

// 供統計使用的最小費用投影（date 為 'YYYY-MM-DD' Taipei 日曆日字串）。
export interface StatExpense {
    date: string
    amount: number
    category: CategoryId
}

export interface ExpenseStats {
    today: number
    week: number
    month: number
    byCategory: Record<CategoryId, number>
}

const emptyByCategory = (): Record<CategoryId, number> => ({
    food: 0,
    pet: 0,
    shopping: 0,
    transport: 0,
    home: 0,
    other: 0
})

// 本日／本週／本月總額 + 本月分類聚合。全部以 Taipei 日曆日字串比較（date 本身即 Taipei 日曆日）。
export function deriveExpenseStats(expenses: readonly StatExpense[]): ExpenseStats {
    const todayStr = taipeiDateString()
    const weekStartStr = weekStart()
    const monthStartStr = `${currentYearMonth()}-01`

    let today = 0
    let week = 0
    let month = 0
    const byCategory = emptyByCategory()

    for (const e of expenses) {
        // 上界：未來日期（Taipei 今日之後）一律不計入任何桶（修灌水）
        if (e.date > todayStr) continue

        if (e.date === todayStr) today += e.amount
        if (e.date >= weekStartStr) week += e.amount
        if (e.date >= monthStartStr) {
            month += e.amount
            byCategory[e.category] += e.amount
        }
    }

    return { today, week, month, byCategory }
}

export interface CategoryAggregate {
    total: number
    count: number
    expenses: StatExpense[]
}

// 分類聚合（全期間）。以 push 累加，避免 Vue 版 `[...current.expenses, expense]` 每筆重建陣列的
// O(n²) 行為（expense.ts:634-636 expensesByCategory）。
export function aggregateByCategory(
    expenses: readonly StatExpense[]
): Partial<Record<CategoryId, CategoryAggregate>> {
    const result: Partial<Record<CategoryId, CategoryAggregate>> = {}

    for (const e of expenses) {
        let bucket = result[e.category]
        if (!bucket) {
            bucket = { total: 0, count: 0, expenses: [] }
            result[e.category] = bucket
        }
        bucket.total += e.amount
        bucket.count += 1
        bucket.expenses.push(e)
    }

    return result
}

export interface MonthlyTrendPoint {
    month: string
    total: number
}

// 月趨勢：以 'YYYY-MM' 分桶加總，依月份升冪排序。單趟聚合（push/Map，不用 spread 累加）。
export function monthlyTrend(expenses: readonly StatExpense[]): MonthlyTrendPoint[] {
    const totals = new Map<string, number>()

    for (const e of expenses) {
        const month = e.date.slice(0, 7)
        totals.set(month, (totals.get(month) ?? 0) + e.amount)
    }

    return [...totals.entries()]
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month))
}
