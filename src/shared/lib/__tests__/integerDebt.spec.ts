import { describe, it, expect } from 'vitest'
import { normalizeNetBalances, normalizePositiveAmounts } from '../integerDebt'

describe('normalizeNetBalances', () => {
    it('returns empty array for empty input', () => {
        expect(normalizeNetBalances([])).toEqual([])
    })

    it('returns [0] for single zero', () => {
        expect(normalizeNetBalances([0])).toEqual([0])
    })

    it('rounds [33.6, 33.6, -67.2] preserving sum = 0', () => {
        const result = normalizeNetBalances([33.6, 33.6, -67.2])
        expect(result.every(Number.isInteger)).toBe(true)
        expect(result.reduce((s, v) => s + v, 0)).toBe(0)
        // largest remainder gets the extra: 34 + 33 = 67
        expect(result).toEqual([34, 33, -67])
    })

    it('handles all zeros', () => {
        expect(normalizeNetBalances([0, 0, 0])).toEqual([0, 0, 0])
    })

    it('handles already-integer values', () => {
        const result = normalizeNetBalances([50, -30, -20])
        expect(result).toEqual([50, -30, -20])
    })

    it('treats NaN as 0', () => {
        const result = normalizeNetBalances([NaN, 100, -100])
        expect(result.every(Number.isInteger)).toBe(true)
        expect(result.reduce((s, v) => s + v, 0)).toBe(0)
    })

    it('treats Infinity as 0', () => {
        const result = normalizeNetBalances([Infinity, 50, -50])
        expect(result.every(Number.isInteger)).toBe(true)
        expect(result.reduce((s, v) => s + v, 0)).toBe(0)
    })

    it('treats -Infinity as 0', () => {
        const result = normalizeNetBalances([-Infinity, 50, -50])
        expect(result.every(Number.isInteger)).toBe(true)
        expect(result.reduce((s, v) => s + v, 0)).toBe(0)
    })

    it('normalizes -0 to 0', () => {
        const result = normalizeNetBalances([-0, 0])
        expect(Object.is(result[0], -0)).toBe(false)
        expect(result[0]).toBe(0)
    })

    it('handles large numbers', () => {
        const result = normalizeNetBalances([100000.5, -100000.5])
        expect(result.every(Number.isInteger)).toBe(true)
        expect(result.reduce((s, v) => s + v, 0)).toBe(0)
    })

    it('handles values that round to zero', () => {
        const result = normalizeNetBalances([0.4, -0.4])
        expect(result).toEqual([0, 0])
    })

    it('handles single positive balance', () => {
        const result = normalizeNetBalances([100.7])
        // With no negatives, targetTotal = round((100.7+0)/2) = 50
        // Shrinks floor(100.7) = 100 down to target 50
        expect(result).toEqual([50])
    })

    it('handles single negative balance', () => {
        const result = normalizeNetBalances([-50.3])
        // With no positives, targetTotal = round((0+50.3)/2) = 25
        // Shrinks floor(50.3) = 50 down to target 25
        expect(result).toEqual([-25])
    })

    it('handles many small values preserving sum', () => {
        const input = [10.1, 10.2, 10.3, -10.1, -10.2, -10.3]
        const result = normalizeNetBalances(input)
        expect(result.every(Number.isInteger)).toBe(true)
        expect(result.reduce((s, v) => s + v, 0)).toBe(0)
    })
})

describe('normalizePositiveAmounts', () => {
    it('returns empty array for empty input', () => {
        expect(normalizePositiveAmounts([])).toEqual([])
    })

    it('rounds [33.6, 33.2] preserving sum', () => {
        const result = normalizePositiveAmounts([33.6, 33.2])
        expect(result.every(Number.isInteger)).toBe(true)
        expect(result.reduce((s, v) => s + v, 0)).toBe(67)
        expect(result).toEqual([34, 33])
    })

    it('handles all zeros', () => {
        expect(normalizePositiveAmounts([0, 0])).toEqual([0, 0])
    })

    it('clamps negative values to 0', () => {
        const result = normalizePositiveAmounts([-5, 10.5])
        expect(result[0]).toBe(0)
        expect(result.every(v => v >= 0)).toBe(true)
    })

    it('handles custom targetTotal', () => {
        const result = normalizePositiveAmounts([33.3, 33.3, 33.4], 100)
        expect(result.every(Number.isInteger)).toBe(true)
        expect(result.reduce((s, v) => s + v, 0)).toBe(100)
    })

    it('handles single value', () => {
        expect(normalizePositiveAmounts([33.7])).toEqual([34])
    })

    it('treats NaN as 0', () => {
        const result = normalizePositiveAmounts([NaN, 50.5])
        expect(result[0]).toBe(0)
        expect(result.every(Number.isInteger)).toBe(true)
    })

    it('handles already-integer values', () => {
        expect(normalizePositiveAmounts([10, 20, 30])).toEqual([10, 20, 30])
    })
})
