import { computed, type Ref } from 'vue'
import type { SplitMethod } from '@/shared/lib/database.types'
import type { SplitParticipant } from '@/entities/split/types'

export function useSplitCalculation(
    totalAmount: Ref<number>,
    participants: Ref<SplitParticipant[]>,
    method: Ref<SplitMethod>
) {
    // 依分帳方式計算每位參與者的金額
    const calculatedSplits = computed<SplitParticipant[]>(() => {
        const included = participants.value.filter(p => p.isIncluded)
        if (included.length === 0) return []

        switch (method.value) {
            case 'equal': {
                const perPerson = Math.round((totalAmount.value / included.length) * 100) / 100
                // 最後一位承擔捨入誤差
                return included.map((p, i) => ({
                    ...p,
                    amount: i === included.length - 1
                        ? totalAmount.value - perPerson * (included.length - 1)
                        : perPerson,
                    percentage: Math.round((100 / included.length) * 100) / 100
                }))
            }
            case 'exact': {
                // 金額由使用者手動輸入，直接回傳
                return included.map(p => ({ ...p }))
            }
            case 'percentage': {
                // 依百分比計算金額
                return included.map(p => ({
                    ...p,
                    amount: Math.round((totalAmount.value * (p.percentage ?? 0) / 100) * 100) / 100
                }))
            }
            case 'shares': {
                const totalShares = included.reduce((sum, p) => sum + (p.shares ?? 1), 0)
                if (totalShares === 0) return included.map(p => ({ ...p, amount: 0 }))
                return included.map((p, i) => {
                    const shares = p.shares ?? 1
                    const perShare = totalAmount.value / totalShares
                    return {
                        ...p,
                        amount: i === included.length - 1
                            ? totalAmount.value - Math.round(perShare * (totalShares - shares) * 100) / 100
                            : Math.round(perShare * shares * 100) / 100
                    }
                })
            }
            default:
                return included
        }
    })

    // 驗證：所有分帳金額加總應等於總金額
    const splitTotal = computed(() =>
        calculatedSplits.value.reduce((sum, p) => sum + p.amount, 0)
    )

    const isBalanced = computed(() =>
        Math.abs(splitTotal.value - totalAmount.value) < 0.01
    )

    const remainingAmount = computed(() =>
        Math.round((totalAmount.value - splitTotal.value) * 100) / 100
    )

    return {
        calculatedSplits,
        splitTotal,
        isBalanced,
        remainingAmount
    }
}
