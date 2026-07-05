import { describe, it, expect } from 'vitest'
import { isMonthlyReportEntryDay, getPreviousMonth, shouldShowMonthlyReportEntry } from '../entryVisibility'

describe('entryVisibility', () => {
    it('1-7 號會顯示月報入口', () => {
        expect(isMonthlyReportEntryDay('2026-06-01')).toBe(true)
        expect(isMonthlyReportEntryDay('2026-06-07')).toBe(true)
        expect(shouldShowMonthlyReportEntry('2026-06-03', true)).toEqual({
            show: true,
            yearMonth: '2026-05'
        })
        expect(shouldShowMonthlyReportEntry('2026-06-03', false)).toEqual({
            show: false,
            yearMonth: '2026-05'
        })
    })

    it('8-31 號不顯示月報入口', () => {
        expect(isMonthlyReportEntryDay('2026-06-08')).toBe(false)
        expect(isMonthlyReportEntryDay('2026-06-31')).toBe(false)
        expect(shouldShowMonthlyReportEntry('2026-06-31', true)).toEqual({
            show: false,
            yearMonth: '2026-05'
        })
    })

    it('可正確計算跨年邊界的前一個月', () => {
        expect(getPreviousMonth('2026-01')).toBe('2025-12')
        expect(shouldShowMonthlyReportEntry('2026-01-05', true)).toEqual({
            show: true,
            yearMonth: '2025-12'
        })
    })
})
