import { describe, it, expect } from 'vitest'
import { calcSplits } from '../calcSplits'
import type { SplitParticipant } from '@/entities/split/types'

// 自 Vue 版 useSplitCalculation.spec.ts 移植（守恆／最大餘數案例），改以純函式 calcSplits 斷言。
function makeParticipant(
    userId: string,
    amount = 0,
    isIncluded = true,
    percentage?: number,
    shares?: number
): SplitParticipant {
    return {
        userId,
        displayName: userId,
        avatarUrl: null,
        amount,
        isIncluded,
        percentage,
        shares
    }
}

const sumCents = (amounts: number[]) => amounts.reduce((s, a) => s + Math.round(a * 100), 0)

describe('calcSplits — equal', () => {
    it('divides evenly when amount is divisible', () => {
        const r = calcSplits('equal', 300, [
            makeParticipant('A'),
            makeParticipant('B'),
            makeParticipant('C')
        ])
        expect(r.amounts).toEqual([100, 100, 100])
        expect(r.isBalanced).toBe(true)
    })

    it('assigns rounding remainder to the first participants (100 / 3)', () => {
        const r = calcSplits('equal', 100, [
            makeParticipant('A'),
            makeParticipant('B'),
            makeParticipant('C')
        ])
        expect(r.amounts[0]).toBe(33.34)
        expect(r.amounts[1]).toBe(33.33)
        expect(r.amounts[2]).toBe(33.33)
        expect(sumCents(r.amounts)).toBe(10000)
        expect(r.isBalanced).toBe(true)
    })

    it('returns empty array when no participants are included', () => {
        const r = calcSplits('equal', 300, [makeParticipant('A', 0, false)])
        expect(r.amounts).toHaveLength(0)
    })

    it('assigns the entire amount to a single participant', () => {
        const r = calcSplits('equal', 100, [makeParticipant('A')])
        expect(r.amounts).toEqual([100])
        expect(r.isBalanced).toBe(true)
    })

    it('excludes participants where isIncluded is false', () => {
        const r = calcSplits('equal', 300, [
            makeParticipant('A'),
            makeParticipant('B'),
            makeParticipant('C', 0, false)
        ])
        expect(r.amounts).toEqual([150, 150])
    })

    it('handles zero total amount', () => {
        const r = calcSplits('equal', 0, [makeParticipant('A'), makeParticipant('B')])
        expect(r.amounts).toEqual([0, 0])
        expect(r.isBalanced).toBe(true)
    })

    it('distributes single cent to first participant', () => {
        const r = calcSplits('equal', 0.01, [makeParticipant('A'), makeParticipant('B')])
        expect(r.amounts).toEqual([0.01, 0])
        expect(r.isBalanced).toBe(true)
    })

    it('sums exactly for many participants (100 / 7)', () => {
        const r = calcSplits(
            'equal',
            100,
            Array.from({ length: 7 }, (_, i) => makeParticipant(`P${i}`))
        )
        expect(r.amounts).toHaveLength(7)
        expect(sumCents(r.amounts)).toBe(10000)
        expect(r.isBalanced).toBe(true)
    })

    it('preserves precision for a large equal split (999999.99 / 3)', () => {
        const r = calcSplits('equal', 999999.99, [
            makeParticipant('A'),
            makeParticipant('B'),
            makeParticipant('C')
        ])
        expect(r.amounts).toEqual([333333.33, 333333.33, 333333.33])
        expect(r.total).toBe(999999.99)
        expect(r.isBalanced).toBe(true)
    })
})

describe('calcSplits — exact', () => {
    it('returns participant amounts unchanged when they balance', () => {
        const r = calcSplits('exact', 300, [
            makeParticipant('A', 100),
            makeParticipant('B', 200)
        ])
        expect(r.amounts).toEqual([100, 200])
        expect(r.isBalanced).toBe(true)
    })

    it('detects imbalance when the sum does not equal total', () => {
        const r = calcSplits('exact', 300, [
            makeParticipant('A', 100),
            makeParticipant('B', 100)
        ])
        expect(r.isBalanced).toBe(false)
        expect(r.remaining).toBe(100)
    })

    // sum-then-round-once（對齊 Vue useSplitCalculation）：先浮點加總再整體 round 一次。
    // round-each-then-sum 會把 [100.005, 199.995] 各自 round 成 10001+20000=30001 而誤判 unbalanced；
    // sum-then-round-once 得 Math.round(300*100)=30000 == totalCents，balanced。
    it('treats sub-cent exact amounts that sum to the total as balanced (sum-then-round-once)', () => {
        const r = calcSplits('exact', 300, [
            makeParticipant('A', 100.005),
            makeParticipant('B', 199.995)
        ])
        expect(r.isBalanced).toBe(true)
        expect(r.remaining).toBe(0)
    })
})

describe('calcSplits — percentage', () => {
    it('calculates correct amounts for balanced percentages (50/30/20)', () => {
        const r = calcSplits('percentage', 1000, [
            makeParticipant('A', 0, true, 50),
            makeParticipant('B', 0, true, 30),
            makeParticipant('C', 0, true, 20)
        ])
        expect(r.amounts).toEqual([500, 300, 200])
        expect(r.isBalanced).toBe(true)
    })

    it('detects imbalance when percentages do not sum to 100', () => {
        const r = calcSplits('percentage', 1000, [
            makeParticipant('A', 0, true, 50),
            makeParticipant('B', 0, true, 30)
        ])
        expect(r.isBalanced).toBe(false)
        expect(r.remaining).toBe(200)
    })

    it('treats missing percentage as 0', () => {
        const r = calcSplits('percentage', 1000, [
            makeParticipant('A', 0, true, 100),
            makeParticipant('B', 0, true, undefined)
        ])
        expect(r.amounts).toEqual([1000, 0])
    })

    it('allows percentage > 100% but marks as unbalanced', () => {
        const r = calcSplits('percentage', 1000, [makeParticipant('A', 0, true, 150)])
        expect(r.amounts).toEqual([1500])
        expect(r.isBalanced).toBe(false)
    })

    it('returns zero amounts when all percentages are 0', () => {
        const r = calcSplits('percentage', 1000, [
            makeParticipant('A', 0, true, 0),
            makeParticipant('B', 0, true, 0)
        ])
        expect(r.amounts).toEqual([0, 0])
        expect(r.isBalanced).toBe(false)
    })
})

describe('calcSplits — shares', () => {
    it('distributes proportionally based on shares (2:3 of 1000)', () => {
        const r = calcSplits('shares', 1000, [
            makeParticipant('A', 0, true, undefined, 2),
            makeParticipant('B', 0, true, undefined, 3)
        ])
        expect(r.amounts).toEqual([400, 600])
        expect(r.isBalanced).toBe(true)
    })

    it('assigns 0 to all when total shares is 0', () => {
        const r = calcSplits('shares', 1000, [
            makeParticipant('A', 0, true, undefined, 0),
            makeParticipant('B', 0, true, undefined, 0)
        ])
        expect(r.amounts).toEqual([0, 0])
    })

    it('defaults to 1 share when the shares field is undefined', () => {
        const r = calcSplits('shares', 200, [
            makeParticipant('A', 0, true, undefined, undefined),
            makeParticipant('B', 0, true, undefined, undefined)
        ])
        expect(r.amounts).toEqual([100, 100])
        expect(r.isBalanced).toBe(true)
    })

    it('distributes rounding remainder by largest remainder (1:1:1 of 100)', () => {
        const r = calcSplits('shares', 100, [
            makeParticipant('A', 0, true, undefined, 1),
            makeParticipant('B', 0, true, undefined, 1),
            makeParticipant('C', 0, true, undefined, 1)
        ])
        expect(r.amounts[0]).toBeCloseTo(33.34, 2)
        expect(r.amounts[1]).toBeCloseTo(33.33, 2)
        expect(r.amounts[2]).toBeCloseTo(33.33, 2)
        expect(sumCents(r.amounts)).toBe(10000)
    })
})

describe('calcSplits — edge cases', () => {
    it('returns zero amounts for a negative total', () => {
        const r = calcSplits('equal', -100, [makeParticipant('A'), makeParticipant('B')])
        expect(r.amounts).toEqual([0, 0])
    })

    it('returns zero amounts for a NaN total', () => {
        const r = calcSplits('equal', NaN, [makeParticipant('A'), makeParticipant('B')])
        expect(r.amounts).toEqual([0, 0])
    })

    it('returns zero amounts for an Infinity total (percentage)', () => {
        const r = calcSplits('percentage', Infinity, [makeParticipant('A', 0, true, 100)])
        expect(r.amounts).toEqual([0])
    })
})
