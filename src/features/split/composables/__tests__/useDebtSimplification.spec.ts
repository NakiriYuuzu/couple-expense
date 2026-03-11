import { describe, it, expect } from 'vitest'
import { simplifyDebts } from '../useDebtSimplification'
import type { NetBalance } from '@/entities/settlement/types'

function makeBalance(userId: string, netBalance: number): NetBalance {
    return { userId, displayName: userId, avatarUrl: null, netBalance }
}

describe('simplifyDebts', () => {
    it('returns empty array for empty input', () => {
        expect(simplifyDebts([])).toEqual([])
    })

    it('returns empty array when all balances are zero', () => {
        const balances = [makeBalance('A', 0), makeBalance('B', 0)]
        expect(simplifyDebts(balances)).toEqual([])
    })

    it('handles a simple two-person debt', () => {
        // A owes B 50 → one transfer A→B 50
        const balances = [makeBalance('A', -50), makeBalance('B', 50)]
        const result = simplifyDebts(balances)

        expect(result).toHaveLength(1)
        expect(result[0]!.fromUser.userId).toBe('A')
        expect(result[0]!.toUser.userId).toBe('B')
        expect(result[0]!.amount).toBe(50)
    })

    it('chains debts: A owes B, B owes C → A pays C directly', () => {
        // A net: -100 (owes), B net: 0, C net: +100 (owed)
        const balances = [
            makeBalance('A', -100),
            makeBalance('B', 0),
            makeBalance('C', 100)
        ]
        const result = simplifyDebts(balances)

        expect(result).toHaveLength(1)
        expect(result[0]!.fromUser.userId).toBe('A')
        expect(result[0]!.toUser.userId).toBe('C')
        expect(result[0]!.amount).toBe(100)
    })

    it('minimises transactions for a 4-person scenario', () => {
        // A: -150, B: -50, C: +100, D: +100 → 2 transfers max
        const balances = [
            makeBalance('A', -150),
            makeBalance('B', -50),
            makeBalance('C', 100),
            makeBalance('D', 100)
        ]
        const result = simplifyDebts(balances)

        // Total owed must equal total debt
        const totalOut = result.reduce((s, d) => s + d.amount, 0)
        expect(totalOut).toBe(200)
        expect(result.length).toBeLessThanOrEqual(3)
    })

    it('handles unequal two-way split correctly', () => {
        const balances = [
            makeBalance('Alice', -30),
            makeBalance('Bob', 30)
        ]
        const result = simplifyDebts(balances)

        expect(result).toHaveLength(1)
        expect(result[0]!.amount).toBe(30)
        expect(result[0]!.fromUser.userId).toBe('Alice')
        expect(result[0]!.toUser.userId).toBe('Bob')
    })

    it('handles partial overlap: A covers both B and C', () => {
        // A paid a lot, B and C each owe A partial amounts
        const balances = [
            makeBalance('A', 200),
            makeBalance('B', -100),
            makeBalance('C', -100)
        ]
        const result = simplifyDebts(balances)

        // Each debtor should have exactly one transfer to A
        const totalPaid = result.reduce((s, d) => s + d.amount, 0)
        expect(totalPaid).toBe(200)
        result.forEach(d => { expect(d.toUser.userId).toBe('A') })
    })

    it('rounds debts to whole dollars for TWD', () => {
        const balances = [
            makeBalance('A', -33.6),
            makeBalance('B', -33.6),
            makeBalance('C', 67.2)
        ]
        const result = simplifyDebts(balances)

        expect(result).toHaveLength(2)
        expect(result.reduce((sum, debt) => sum + debt.amount, 0)).toBe(67)
        result.forEach(debt => { expect(Number.isInteger(debt.amount)).toBe(true) })
    })

    it('ignores balances that round to zero', () => {
        const balances = [
            makeBalance('A', -0.4),
            makeBalance('B', 0.4)
        ]
        const result = simplifyDebts(balances)
        expect(result).toHaveLength(0)
    })

    describe('edge cases', () => {
        it('returns empty when all balances are negative (no creditors)', () => {
            const balances = [
                makeBalance('A', -50),
                makeBalance('B', -50)
            ]
            const result = simplifyDebts(balances)
            expect(result).toEqual([])
        })

        it('handles very large amounts in a single transfer', () => {
            const balances = [
                makeBalance('A', -1000000),
                makeBalance('B', 1000000)
            ]
            const result = simplifyDebts(balances)

            expect(result).toHaveLength(1)
            expect(result[0]!.fromUser.userId).toBe('A')
            expect(result[0]!.toUser.userId).toBe('B')
            expect(result[0]!.amount).toBe(1000000)
        })

        it('resolves many small alternating balances correctly', () => {
            // 10 people: odd-indexed owe 1, even-indexed are owed 1
            const balances = Array.from({ length: 10 }, (_, i) =>
                makeBalance(`P${i}`, i % 2 === 0 ? 1 : -1)
            )
            const result = simplifyDebts(balances)

            const totalTransferred = result.reduce((s, d) => s + d.amount, 0)
            expect(totalTransferred).toBe(5)
            // All amounts should be positive
            result.forEach(d => { expect(d.amount).toBeGreaterThan(0) })
        })

        it('produces no spurious debt from near-zero accumulation', () => {
            // Values that sum to 0.004 remainder after cancellation
            const balances = [
                makeBalance('A', -10.002),
                makeBalance('B', -10.002),
                makeBalance('C', 20.008)
            ]
            const result = simplifyDebts(balances)

            result.forEach(d => { expect(Number.isInteger(d.amount)).toBe(true) })
            result.forEach(d => { expect(d.amount).toBeGreaterThanOrEqual(1) })
        })
    })
})
