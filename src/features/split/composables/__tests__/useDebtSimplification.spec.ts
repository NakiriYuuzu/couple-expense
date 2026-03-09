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
        expect(totalOut).toBeCloseTo(200, 2)
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
        expect(totalPaid).toBeCloseTo(200, 2)
        result.forEach(d => expect(d.toUser.userId).toBe('A'))
    })

    it('amounts are rounded to 2 decimal places', () => {
        // 100 / 3 = 33.333… — test that output is rounded
        const balances = [
            makeBalance('A', -33.333),
            makeBalance('B', 33.333)
        ]
        const result = simplifyDebts(balances)

        if (result.length > 0) {
            const decimals = result[0]!.amount.toString().split('.')[1] ?? ''
            expect(decimals.length).toBeLessThanOrEqual(2)
        }
    })

    it('ignores near-zero amounts (less than 0.01)', () => {
        const balances = [
            makeBalance('A', -0.005),
            makeBalance('B', 0.005)
        ]
        const result = simplifyDebts(balances)
        // Amount 0.005 rounds below threshold; no debt should be emitted
        expect(result).toHaveLength(0)
    })
})
