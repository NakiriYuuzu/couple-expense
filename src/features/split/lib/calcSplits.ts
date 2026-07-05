import type { SplitMethod } from '@/shared/lib/database.types'
import type { SplitParticipant } from '@/entities/split/types'

// 分帳純函式（自 Vue 版 useSplitCalculation.ts 抽出，守恆演算法一字不動）。
// 全程以整數分（cents）計算，回傳每位「參與（isIncluded）」者的金額（currency 單位），
// 捨入誤差以最大餘數法（largest remainder）分配，總和守恆到分（cent）。
// 設計為 Phase 4/5 可直接使用：輸入方法 + 總額 + 參與者，輸出金額列表與守恆判定。

export interface CalcSplitsResult {
    // 每位 included 參與者的金額，順序與輸入的 included 子集一致
    amounts: number[]
    // amounts 的總和（守恆值）
    total: number
    // 整數分比較：分帳總額是否等於總金額
    isBalanced: boolean
    // 尚未分配的餘額（總金額 − 分帳總額），以分為單位還原
    remaining: number
}

export function calcSplits(
    method: SplitMethod,
    totalAmount: number,
    participants: SplitParticipant[]
): CalcSplitsResult {
    const amounts = computeAmounts(method, totalAmount, participants)

    // 守恆判定與 Vue 版 useSplitCalculation 完全一致：sum-then-round-once。
    // 先把各分帳金額以浮點加總（splitTotal），再對「總和」整體 Math.round 一次成分（cents），
    // 而非對每筆金額各自 round 後再相加（round-each-then-sum）。兩者在 sub-cent 案例會分歧
    // （如 exact [100.005, 199.995] vs 300：round-once → balanced，round-each → 差 1 分）。
    // 語意以 Vue 為基準，請勿改回 round-each-then-sum。
    const total = amounts.reduce((sum, amount) => sum + amount, 0)
    const totalCents = Math.round(totalAmount * 100)
    const splitCents = Math.round(total * 100)

    return {
        amounts,
        total,
        isBalanced: totalCents === splitCents,
        remaining: (totalCents - splitCents) / 100
    }
}

function computeAmounts(
    method: SplitMethod,
    totalAmount: number,
    participants: SplitParticipant[]
): number[] {
    const included = participants.filter(p => p.isIncluded)
    if (included.length === 0) return []

    const total = totalAmount

    // Guard: 非有限數值或負數
    if (!Number.isFinite(total) || total < 0) {
        return included.map(() => 0)
    }

    // Guard: 零金額快速路徑
    if (total === 0) {
        return included.map(() => 0)
    }

    const totalCents = Math.round(total * 100)

    switch (method) {
        case 'equal': {
            const perPersonCents = Math.floor(totalCents / included.length)
            const remainderCents = totalCents - perPersonCents * included.length
            // 前 remainderCents 人各多 1 分錢
            return included.map((_, i) => (perPersonCents + (i < remainderCents ? 1 : 0)) / 100)
        }
        case 'exact': {
            // 金額由使用者手動輸入，直接回傳
            return included.map(p => p.amount)
        }
        case 'percentage': {
            // 整數分計算，僅對捨入誤差使用最大餘數法分配
            const items = included.map(p => {
                const pct = p.percentage ?? 0
                const rawCents = (totalCents * pct) / 100
                return {
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
            return items.map(item => item.floored / 100)
        }
        case 'shares': {
            const totalShares = included.reduce((sum, p) => sum + (p.shares ?? 1), 0)
            if (totalShares === 0) return included.map(() => 0)
            // 整數分計算，捨入餘數採最大餘數法（largest remainder），與 percentage 一致
            const items = included.map(p => {
                const shares = p.shares ?? 1
                const rawCents = (totalCents * shares) / totalShares
                return {
                    shares,
                    floored: Math.floor(rawCents),
                    frac: rawCents - Math.floor(rawCents)
                }
            })
            const allocated = items.reduce((s, r) => s + r.floored, 0)
            let remainder = totalCents - allocated
            // 依小數部分由大到小分配剩餘 cents，跳過 shares=0 的參與者
            if (remainder > 0) {
                const indices = items
                    .map((item, idx) => ({ frac: item.frac, shares: item.shares, idx }))
                    .filter(entry => entry.shares > 0)
                    .sort((a, b) => b.frac - a.frac || a.idx - b.idx)
                for (const entry of indices) {
                    if (remainder <= 0) break
                    items[entry.idx]!.floored += 1
                    remainder--
                }
            }
            return items.map(item => item.floored / 100)
        }
        default:
            return included.map(p => p.amount)
    }
}
