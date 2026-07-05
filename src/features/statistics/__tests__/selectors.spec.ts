import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { deriveExpenseStats, aggregateByCategory, monthlyTrend } from '../selectors'
import type { StatExpense } from '../selectors'

// 回歸：Vue 版統計以裝置本地時間分桶且無上界 → 月界錯月 + 未來日期灌水。
// 新版走 datetime 的 Asia/Taipei 分桶並加上界，本測試把系統時鐘釘在
// UTC 2026-06-30 16:30（= Taipei 2026-07-01 00:30）驗證「新版不會發生」。
describe('deriveExpenseStats（Taipei 分桶 + 未來上界）', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        // Taipei = UTC+8：此刻 Taipei 已跨入 2026-07-01 00:30，UTC 仍是 06-30 16:30。
        vi.setSystemTime(new Date('2026-06-30T16:30:00Z'))
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('月界 00:30：7/1 的費用歸「本月/本日」，上月與未來一律排除', () => {
        const expenses: StatExpense[] = [
            { date: '2026-07-01', amount: 100, category: 'food' }, // Taipei 今日
            { date: '2026-06-15', amount: 50, category: 'shopping' }, // 上月（不在本週/本月）
            { date: '2026-07-20', amount: 999, category: 'food' } // 未來（不計入任何桶）
        ]

        const stats = deriveExpenseStats(expenses)

        // Taipei「現在」= 7/1：7/1 費用計入本日/本月（UTC 基準會把現在誤判為 6/30、
        // 而把 7/1 當成未來排除——正是被修掉的 bug）
        expect(stats.today).toBe(100)
        expect(stats.month).toBe(100)
        // 未來 7/20 的 999 不得灌入本週/本月（上界修灌水）
        expect(stats.week).toBe(100)
        expect(stats.byCategory.food).toBe(100)
        expect(stats.byCategory.shopping).toBe(0)
    })

    it('未來日期完全不計入任何桶', () => {
        const stats = deriveExpenseStats([
            { date: '2026-12-31', amount: 5000, category: 'other' }
        ])
        expect(stats.today).toBe(0)
        expect(stats.week).toBe(0)
        expect(stats.month).toBe(0)
    })
})

describe('aggregateByCategory（push 累加）', () => {
    it('依類別聚合 total/count/expenses', () => {
        const expenses: StatExpense[] = [
            { date: '2026-07-01', amount: 100, category: 'food' },
            { date: '2026-07-02', amount: 40, category: 'food' },
            { date: '2026-07-03', amount: 200, category: 'transport' }
        ]
        const agg = aggregateByCategory(expenses)
        expect(agg.food?.total).toBe(140)
        expect(agg.food?.count).toBe(2)
        expect(agg.food?.expenses).toHaveLength(2)
        expect(agg.transport?.total).toBe(200)
    })
})

describe('monthlyTrend', () => {
    it('以 YYYY-MM 分桶加總並升冪排序', () => {
        const expenses: StatExpense[] = [
            { date: '2026-06-10', amount: 100, category: 'food' },
            { date: '2026-07-01', amount: 200, category: 'food' },
            { date: '2026-06-20', amount: 50, category: 'shopping' }
        ]
        expect(monthlyTrend(expenses)).toEqual([
            { month: '2026-06', total: 150 },
            { month: '2026-07', total: 200 }
        ])
    })
})
