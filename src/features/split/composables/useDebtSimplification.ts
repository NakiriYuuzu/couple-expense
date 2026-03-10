import type { NetBalance, SimplifiedDebt } from '@/entities/settlement/types'

// 貪婪演算法：最小化結算交易次數
export function simplifyDebts(balances: NetBalance[]): SimplifiedDebt[] {
    // 分離欠款方（負數）和收款方（正數），並建立可變動的副本
    const debtors = balances
        .filter(b => b.netBalance < 0)
        .map(b => ({ ...b, remaining: Math.abs(b.netBalance) }))
        .sort((a, b) => b.remaining - a.remaining)

    const creditors = balances
        .filter(b => b.netBalance > 0)
        .map(b => ({ ...b, remaining: b.netBalance }))
        .sort((a, b) => b.remaining - a.remaining)

    const debts: SimplifiedDebt[] = []

    let i = 0
    let j = 0

    while (i < debtors.length && j < creditors.length) {
        // while 條件已確保索引有效，使用非空斷言
        const debtor = debtors[i]!
        const creditor = creditors[j]!

        const amount = Math.min(debtor.remaining, creditor.remaining)

        if (amount > 0.01) {
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
                amount: Math.round(amount * 100) / 100
            })
        }

        // 每步 round to cents，避免浮點累積誤差
        debtor.remaining = Math.round((debtor.remaining - amount) * 100) / 100
        creditor.remaining = Math.round((creditor.remaining - amount) * 100) / 100

        if (debtor.remaining < 0.005) i++
        if (creditor.remaining < 0.005) j++
    }

    return debts
}
