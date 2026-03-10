import { computed, type Ref } from 'vue'
import type { SplitMethod } from '@/shared/lib/database.types'
import type { SplitParticipant } from '@/entities/split/types'

export function useSplitCalculation(
    totalAmount: Ref<number>,
    participants: Ref<SplitParticipant[]>,
    method: Ref<SplitMethod>
) {
    // 依分帳方式計算每位參與者的金額（全程使用整數分 cents 計算）
    const calculatedSplits = computed<SplitParticipant[]>(() => {
        const included = participants.value.filter(p => p.isIncluded)
        if (included.length === 0) return []

        const total = totalAmount.value

        // Guard: 非有限數值或負數
        if (!Number.isFinite(total) || total < 0) {
            return included.map(p => ({ ...p, amount: 0 }))
        }

        // Guard: 零金額快速路徑
        if (total === 0) {
            return included.map(p => ({
                ...p,
                amount: 0,
                percentage: Math.round((100 / included.length) * 100) / 100
            }))
        }

        const totalCents = Math.round(total * 100)

        switch (method.value) {
            case 'equal': {
                const perPersonCents = Math.floor(totalCents / included.length)
                const remainderCents = totalCents - perPersonCents * included.length
                // 前 remainderCents 人各多 1 分錢
                return included.map((p, i) => ({
                    ...p,
                    amount: (perPersonCents + (i < remainderCents ? 1 : 0)) / 100,
                    percentage: Math.round((100 / included.length) * 100) / 100
                }))
            }
            case 'exact': {
                // 金額由使用者手動輸入，直接回傳
                return included.map(p => ({ ...p }))
            }
            case 'percentage': {
                // 整數分計算，僅對捨入誤差使用最大餘數法分配
                const items = included.map(p => {
                    const pct = p.percentage ?? 0
                    const rawCents = totalCents * pct / 100
                    return {
                        participant: p,
                        floored: Math.floor(rawCents),
                        frac: rawCents - Math.floor(rawCents)
                    }
                })
                const allocated = items.reduce((s, r) => s + r.floored, 0)
                let remainder = totalCents - allocated
                // 僅分配捨入誤差（最多每人 1 分錢）
                // 若 remainder > 參與人數，代表百分比未合計 100%，不強制分配
                if (remainder > 0 && remainder <= included.length) {
                    const indices = items
                        .map((item, idx) => ({ frac: item.frac, idx }))
                        .sort((a, b) => b.frac - a.frac || a.idx - b.idx)
                    for (const entry of indices) {
                        if (remainder <= 0) break
                        items[entry.idx]!.floored += 1
                        remainder--
                    }
                }
                return items.map(item => ({
                    ...item.participant,
                    amount: item.floored / 100
                }))
            }
            case 'shares': {
                const totalShares = included.reduce((sum, p) => sum + (p.shares ?? 1), 0)
                if (totalShares === 0) return included.map(p => ({ ...p, amount: 0 }))
                // 整數分計算 + 最後一人吸收餘數
                const items = included.map(p => {
                    const shares = p.shares ?? 1
                    return {
                        participant: p,
                        cents: Math.floor(totalCents * shares / totalShares)
                    }
                })
                const allocated = items.reduce((s, r) => s + r.cents, 0)
                // 餘數給最後一人
                if (items.length > 0) {
                    items[items.length - 1]!.cents += totalCents - allocated
                }
                return items.map(item => ({
                    ...item.participant,
                    amount: item.cents / 100
                }))
            }
            default:
                return included
        }
    })

    // 驗證：所有分帳金額加總應等於總金額
    const splitTotal = computed(() =>
        calculatedSplits.value.reduce((sum, p) => sum + p.amount, 0)
    )

    // 整數分比較，避免浮點誤差
    const isBalanced = computed(() => {
        const totalCents = Math.round(totalAmount.value * 100)
        const splitCents = Math.round(splitTotal.value * 100)
        return totalCents === splitCents
    })

    const remainingAmount = computed(() => {
        const totalCents = Math.round(totalAmount.value * 100)
        const splitCents = Math.round(splitTotal.value * 100)
        return (totalCents - splitCents) / 100
    })

    return {
        calculatedSplits,
        splitTotal,
        isBalanced,
        remainingAmount
    }
}
