import { describe, it, expect } from 'vitest'
import {
    APP_TZ,
    taipeiDateString,
    currentYearMonth,
    monthRangeUtc,
    weekStart,
    formatDateTime
} from '../datetime'

// 這些測試在 vitest.config.ts 固定的 TZ=UTC 下執行，正是回歸目的：
// 所有結果都應以 Asia/Taipei 計算，與裝置時區無關。

describe('APP_TZ', () => {
    it('is Asia/Taipei', () => {
        expect(APP_TZ).toBe('Asia/Taipei')
    })
})

describe('taipeiDateString', () => {
    it('maps Taipei 2026-07-01 00:30 (= UTC 2026-06-30 16:30) to 2026-07-01', () => {
        expect(taipeiDateString(new Date('2026-06-30T16:30:00Z'))).toBe('2026-07-01')
    })

    it('crosses the year boundary: Taipei 2026-01-01 00:30 (= UTC 2025-12-31 16:30) → 2026-01-01', () => {
        expect(taipeiDateString(new Date('2025-12-31T16:30:00Z'))).toBe('2026-01-01')
    })

    it('keeps the same UTC day when Taipei is still on it (UTC 2026-06-30 08:00 → Taipei 2026-06-30)', () => {
        expect(taipeiDateString(new Date('2026-06-30T08:00:00Z'))).toBe('2026-06-30')
    })

    it('leap year: UTC 2024-02-28 16:30 → Taipei 2024-02-29', () => {
        expect(taipeiDateString(new Date('2024-02-28T16:30:00Z'))).toBe('2024-02-29')
    })
})

describe('currentYearMonth', () => {
    it('returns a Taipei YYYY-MM string', () => {
        expect(currentYearMonth()).toMatch(/^\d{4}-\d{2}$/)
    })
})

describe('monthRangeUtc', () => {
    it('returns a half-open [start, end) at Taipei month borders for 2026-07', () => {
        const [start, end] = monthRangeUtc('2026-07')
        // Taipei 2026-07-01 00:00 = UTC 2026-06-30 16:00; Taipei 2026-08-01 00:00 = UTC 2026-07-31 16:00
        expect(start.toISOString()).toBe('2026-06-30T16:00:00.000Z')
        expect(end.toISOString()).toBe('2026-07-31T16:00:00.000Z')
    })

    it('handles leap-year February (2024-02) as 29 Taipei days', () => {
        const [start, end] = monthRangeUtc('2024-02')
        expect(start.toISOString()).toBe('2024-01-31T16:00:00.000Z')
        expect(end.toISOString()).toBe('2024-02-29T16:00:00.000Z')
        const days = (end.getTime() - start.getTime()) / 86_400_000
        expect(days).toBe(29)
    })

    it('is half-open: the start instant belongs to the month, one ms before does not', () => {
        const [start] = monthRangeUtc('2026-07')
        expect(taipeiDateString(start)).toBe('2026-07-01')
        expect(taipeiDateString(new Date(start.getTime() - 1))).toBe('2026-06-30')
    })

    it('is half-open: the end instant is excluded (belongs to next month), one ms before is included', () => {
        const [, end] = monthRangeUtc('2026-07')
        expect(taipeiDateString(end)).toBe('2026-08-01')
        expect(taipeiDateString(new Date(end.getTime() - 1))).toBe('2026-07-31')
    })
})

describe('weekStart', () => {
    it('returns the Monday of the Taipei week (crossing a month boundary)', () => {
        // Taipei 2026-07-01 (Wed) → week Monday is 2026-06-29 (previous month)
        expect(weekStart(new Date('2026-07-01T00:00:00Z'))).toBe('2026-06-29')
        // same Taipei day expressed as UTC 2026-06-30 16:30 → identical week Monday
        expect(weekStart(new Date('2026-06-30T16:30:00Z'))).toBe('2026-06-29')
    })

    it('returns the Monday within the same week', () => {
        // Taipei 2026-03-08 (Sun) → Monday 2026-03-02
        expect(weekStart(new Date('2026-03-08T02:00:00Z'))).toBe('2026-03-02')
    })

    it('crosses year + month boundary: Taipei 2026-01-01 → Monday 2025-12-29', () => {
        expect(weekStart(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-29')
    })

    it('always returns a Monday no later than the given Taipei day', () => {
        const instant = new Date('2026-03-01T02:00:00Z') // Taipei 2026-03-01 (Sun)
        const ws = weekStart(instant)
        expect(ws).toBe('2026-02-23')
        const [y, m, d] = ws.split('-').map(Number)
        // Monday === getUTCDay 1 for a UTC-constructed pure calendar date
        expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(1)
    })
})

describe('formatDateTime', () => {
    it('formats a UTC instant in Taipei time (en-CA date parts) as the Taipei calendar day', () => {
        const out = formatDateTime(new Date('2026-06-30T16:30:00Z'), {
            locale: 'en-CA',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        })
        expect(out).toBe('2026-07-01')
    })

    it('accepts an ISO string and applies the default Taipei date-time format', () => {
        const out = formatDateTime('2026-06-30T16:30:00Z')
        // 預設含日期與 24h 時間；至少應反映 Taipei 日曆日 2026/07/01 與時間 00:30
        expect(out).toContain('2026')
        expect(out).toContain('07')
        expect(out).toContain('01')
        expect(out).toContain('00:30')
    })

    it('returns an empty string for an unparseable input instead of throwing', () => {
        expect(formatDateTime('not-a-date')).toBe('')
    })
})
