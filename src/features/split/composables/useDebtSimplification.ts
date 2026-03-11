import type { NetBalance, SimplifiedDebt } from '@/entities/settlement/types'
import { normalizeNetBalances } from '@/shared/lib/integerDebt'

// 貪婪演算法：最小化結算交易次數（整數 TWD）
export function simplifyDebts(balances: NetBalance[]): SimplifiedDebt[] {
    const normalizedAmounts = normalizeNetBalances(
        balances.map(balance => balance.netBalance)
    )

    // 先整數化，再分離欠款方/收款方
    const normalized = balances.map((balance, index) => ({
        ...balance,
        netBalance: normalizedAmounts[index] ?? 0
    }))

    const debtors = normalized
        .filter(b => b.netBalance < 0)
        .map(b => ({ ...b, remaining: Math.abs(b.netBalance) }))
        .sort((a, b) => b.remaining - a.remaining)

    const creditors = normalized
        .filter(b => b.netBalance > 0)
        .map(b => ({ ...b, remaining: b.netBalance }))
        .sort((a, b) => b.remaining - a.remaining)

    const debts: SimplifiedDebt[] = []

    let i = 0
    let j = 0

    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i]!
        const creditor = creditors[j]!

        const amount = Math.min(debtor.remaining, creditor.remaining)

        if (amount > 0) {
            debts.push({
                fromUser: {
                    userId: debtor.userId,
                    displayName: debtor.displayName,
                    avatarUrl: debtor.avatarUrl
                },
                toUser: {
                    userId: creditor.userId,
                    displayName: creditor.displayName,
                    avatarUrl: creditor.avatarUrl
                },
                amount
            })
        }

        debtor.remaining -= amount
        creditor.remaining -= amount

        if (debtor.remaining === 0) i++
        if (creditor.remaining === 0) j++
    }

    return debts
}
