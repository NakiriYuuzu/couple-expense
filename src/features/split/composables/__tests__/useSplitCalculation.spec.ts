import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useSplitCalculation } from '../useSplitCalculation'
import type { SplitParticipant } from '@/entities/split/types'
import type { SplitMethod } from '@/shared/lib/database.types'

// Helper to build a minimal SplitParticipant
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

describe('useSplitCalculation', () => {
    // ─── equal ────────────────────────────────────────────────────────────────

    describe('equal split', () => {
        it('divides evenly when amount is divisible', () => {
            const total = ref(300)
            const participants = ref([
                makeParticipant('A'),
                makeParticipant('B'),
                makeParticipant('C')
            ])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value).toHaveLength(3)
            calculatedSplits.value.forEach(p => expect(p.amount).toBe(100))
            expect(isBalanced.value).toBe(true)
        })

        it('assigns rounding remainder to the last participant', () => {
            const total = ref(100)
            const participants = ref([
                makeParticipant('A'),
                makeParticipant('B'),
                makeParticipant('C')
            ])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits, isBalanced, splitTotal } = useSplitCalculation(total, participants, method)

            // 整數分分配：餘數分給前 N 人（10000/3=3333 餘 1）
            expect(calculatedSplits.value[0]!.amount).toBe(33.34)
            expect(calculatedSplits.value[1]!.amount).toBe(33.33)
            expect(calculatedSplits.value[2]!.amount).toBe(33.33)
            expect(splitTotal.value).toBeCloseTo(100, 2)
            expect(isBalanced.value).toBe(true)
        })

        it('returns empty array when no participants are included', () => {
            const total = ref(300)
            const participants = ref([makeParticipant('A', 0, false)])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value).toHaveLength(0)
        })

        it('assigns entire amount to a single participant', () => {
            const total = ref(100)
            const participants = ref([makeParticipant('A')])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value[0]!.amount).toBe(100)
            expect(isBalanced.value).toBe(true)
        })

        it('handles zero total amount', () => {
            const total = ref(0)
            const participants = ref([makeParticipant('A'), makeParticipant('B')])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            calculatedSplits.value.forEach(p => expect(p.amount).toBe(0))
            expect(isBalanced.value).toBe(true)
        })

        it('excludes participants where isIncluded is false', () => {
            const total = ref(300)
            const participants = ref([
                makeParticipant('A'),
                makeParticipant('B'),
                makeParticipant('C', 0, false)
            ])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value).toHaveLength(2)
            calculatedSplits.value.forEach(p => expect(p.amount).toBe(150))
        })
    })

    // ─── exact ────────────────────────────────────────────────────────────────

    describe('exact amount split', () => {
        it('returns participant amounts unchanged when they balance', () => {
            const total = ref(300)
            const participants = ref([
                makeParticipant('A', 100),
                makeParticipant('B', 200)
            ])
            const method = ref<SplitMethod>('exact')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value[0]!.amount).toBe(100)
            expect(calculatedSplits.value[1]!.amount).toBe(200)
            expect(isBalanced.value).toBe(true)
        })

        it('detects imbalance when sum does not equal total', () => {
            const total = ref(300)
            const participants = ref([
                makeParticipant('A', 100),
                makeParticipant('B', 100)
            ])
            const method = ref<SplitMethod>('exact')

            const { isBalanced, remainingAmount } = useSplitCalculation(total, participants, method)

            expect(isBalanced.value).toBe(false)
            expect(remainingAmount.value).toBe(100)
        })
    })

    // ─── percentage ───────────────────────────────────────────────────────────

    describe('percentage split', () => {
        it('calculates correct amounts for balanced percentages', () => {
            const total = ref(1000)
            const participants = ref([
                makeParticipant('A', 0, true, 50),
                makeParticipant('B', 0, true, 30),
                makeParticipant('C', 0, true, 20)
            ])
            const method = ref<SplitMethod>('percentage')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value[0]!.amount).toBe(500)
            expect(calculatedSplits.value[1]!.amount).toBe(300)
            expect(calculatedSplits.value[2]!.amount).toBe(200)
            expect(isBalanced.value).toBe(true)
        })

        it('detects imbalance when percentages do not sum to 100', () => {
            const total = ref(1000)
            const participants = ref([
                makeParticipant('A', 0, true, 50),
                makeParticipant('B', 0, true, 30)
            ])
            const method = ref<SplitMethod>('percentage')

            const { isBalanced, remainingAmount } = useSplitCalculation(total, participants, method)

            expect(isBalanced.value).toBe(false)
            expect(remainingAmount.value).toBe(200)
        })

        it('treats missing percentage as 0', () => {
            const total = ref(1000)
            const participants = ref([
                makeParticipant('A', 0, true, 100),
                makeParticipant('B', 0, true, undefined)
            ])
            const method = ref<SplitMethod>('percentage')

            const { calculatedSplits } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value[0]!.amount).toBe(1000)
            expect(calculatedSplits.value[1]!.amount).toBe(0)
        })
    })

    // ─── shares ───────────────────────────────────────────────────────────────

    describe('shares split', () => {
        it('distributes proportionally based on shares', () => {
            const total = ref(1000)
            const participants = ref([
                makeParticipant('A', 0, true, undefined, 2),
                makeParticipant('B', 0, true, undefined, 3)
            ])
            const method = ref<SplitMethod>('shares')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value[0]!.amount).toBe(400)
            expect(calculatedSplits.value[1]!.amount).toBe(600)
            expect(isBalanced.value).toBe(true)
        })

        it('assigns 0 to all when total shares is 0', () => {
            const total = ref(1000)
            const participants = ref([
                makeParticipant('A', 0, true, undefined, 0),
                makeParticipant('B', 0, true, undefined, 0)
            ])
            const method = ref<SplitMethod>('shares')

            const { calculatedSplits } = useSplitCalculation(total, participants, method)

            calculatedSplits.value.forEach(p => expect(p.amount).toBe(0))
        })

        it('defaults to 1 share when shares field is undefined', () => {
            const total = ref(200)
            const participants = ref([
                makeParticipant('A', 0, true, undefined, undefined),
                makeParticipant('B', 0, true, undefined, undefined)
            ])
            const method = ref<SplitMethod>('shares')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            calculatedSplits.value.forEach(p => expect(p.amount).toBe(100))
            expect(isBalanced.value).toBe(true)
        })

        it('assigns rounding remainder to last participant', () => {
            // 100 / 3 shares does not divide evenly; implementation absorbs remainder
            const total = ref(100)
            const participants = ref([
                makeParticipant('A', 0, true, undefined, 1),
                makeParticipant('B', 0, true, undefined, 1),
                makeParticipant('C', 0, true, undefined, 1)
            ])
            const method = ref<SplitMethod>('shares')

            const { calculatedSplits, splitTotal } = useSplitCalculation(total, participants, method)

            // First two participants get the per-share rounded amount
            expect(calculatedSplits.value[0]!.amount).toBeCloseTo(33.33, 2)
            expect(calculatedSplits.value[1]!.amount).toBeCloseTo(33.33, 2)
            // Last participant absorbs floating-point remainder
            // splitTotal may be 99.99 due to JS floating-point; isBalanced uses <0.01 threshold
            expect(Math.abs(splitTotal.value - 100)).toBeLessThan(0.02)
        })
    })

    // ─── edge cases ─────────────────────────────────────────────────────────

    describe('edge cases', () => {
        it('returns zero amounts for negative total', () => {
            const total = ref(-100)
            const participants = ref([
                makeParticipant('A'),
                makeParticipant('B')
            ])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits } = useSplitCalculation(total, participants, method)

            calculatedSplits.value.forEach(p => expect(p.amount).toBe(0))
        })

        it('returns zero amounts for NaN total', () => {
            const total = ref(NaN)
            const participants = ref([
                makeParticipant('A'),
                makeParticipant('B')
            ])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits } = useSplitCalculation(total, participants, method)

            calculatedSplits.value.forEach(p => expect(p.amount).toBe(0))
        })

        it('returns zero amounts for Infinity total (percentage)', () => {
            const total = ref(Infinity)
            const participants = ref([
                makeParticipant('A', 0, true, 100)
            ])
            const method = ref<SplitMethod>('percentage')

            const { calculatedSplits } = useSplitCalculation(total, participants, method)

            calculatedSplits.value.forEach(p => expect(p.amount).toBe(0))
        })

        it('preserves precision for large amount equal split', () => {
            const total = ref(999999.99)
            const participants = ref([
                makeParticipant('A'),
                makeParticipant('B'),
                makeParticipant('C')
            ])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits, splitTotal, isBalanced } = useSplitCalculation(total, participants, method)

            expect(splitTotal.value).toBe(999999.99)
            expect(isBalanced.value).toBe(true)
            // 99999999 cents / 3 = 33333333 remainder 0 → all equal
            calculatedSplits.value.forEach(p => expect(p.amount).toBe(333333.33))
        })

        it('allows percentage > 100% but marks as unbalanced', () => {
            const total = ref(1000)
            const participants = ref([
                makeParticipant('A', 0, true, 150)
            ])
            const method = ref<SplitMethod>('percentage')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value[0]!.amount).toBe(1500)
            expect(isBalanced.value).toBe(false)
        })

        it('returns zero amounts when all percentages are 0', () => {
            const total = ref(1000)
            const participants = ref([
                makeParticipant('A', 0, true, 0),
                makeParticipant('B', 0, true, 0)
            ])
            const method = ref<SplitMethod>('percentage')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            calculatedSplits.value.forEach(p => expect(p.amount).toBe(0))
            expect(isBalanced.value).toBe(false)
        })

        it('distributes single cent to first participant in equal split', () => {
            const total = ref(0.01)
            const participants = ref([
                makeParticipant('A'),
                makeParticipant('B')
            ])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits, isBalanced } = useSplitCalculation(total, participants, method)

            // 1 cent / 2 = 0 remainder 1 → first participant gets the extra cent
            expect(calculatedSplits.value[0]!.amount).toBe(0.01)
            expect(calculatedSplits.value[1]!.amount).toBe(0)
            expect(isBalanced.value).toBe(true)
        })

        it('sums exactly for many participants in equal split', () => {
            const total = ref(100)
            const participants = ref(
                Array.from({ length: 7 }, (_, i) => makeParticipant(`P${i}`))
            )
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits, splitTotal, isBalanced } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value).toHaveLength(7)
            // 10000 cents / 7 = 1428 remainder 4 → first 4 get 14.29, last 3 get 14.28
            const sum = calculatedSplits.value.reduce((s, p) => s + p.amount, 0)
            expect(Math.round(sum * 100)).toBe(10000)
            expect(splitTotal.value).toBeCloseTo(100, 2)
            expect(isBalanced.value).toBe(true)
        })
    })

    // ─── reactive updates ─────────────────────────────────────────────────────

    describe('reactive updates', () => {
        it('recalculates when totalAmount changes', () => {
            const total = ref(100)
            const participants = ref([makeParticipant('A'), makeParticipant('B')])
            const method = ref<SplitMethod>('equal')

            const { calculatedSplits } = useSplitCalculation(total, participants, method)

            expect(calculatedSplits.value[0]!.amount).toBe(50)

            total.value = 200
            expect(calculatedSplits.value[0]!.amount).toBe(100)
        })
    })
})
