import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { HandCoins, CheckCircle2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/shared/lib/money'
import type { CurrencyType } from '@/shared/lib/database.types'
import type { MonthlyDebtSnapshot, SimplifiedDebt } from '@/entities/settlement/types'

// 選定月份的「當前使用者處境」英雄卡（對照 Vue DebtStatusHero.vue）：
//   - owes：我欠人 → 紅色，附「立即結算」（只在 debtor 方出現，對齊 RPC 以 auth user 為付款方）
//   - owed：人欠我 → 綠色（無結算鈕）
//   - 全部結清 → 綠色打勾
//   - 無資料 → 錢包空狀態
// 金額一律走 formatCurrency（禁硬編台幣前綴 / 裸 Intl）。

interface Props {
    snapshot: MonthlyDebtSnapshot | null
    currentUserId: string | null
    currency: CurrencyType
    isLoading: boolean
    onSettle: (debt: SimplifiedDebt) => void
}

const getInitial = (name: string | null): string => name?.charAt(0).toUpperCase() ?? '?'

export function DebtStatusHero({ snapshot, currentUserId, currency, isLoading, onSettle }: Props) {
    const { t } = useTranslation()

    const heroState = useMemo(() => {
        if (!snapshot || !currentUserId) return null
        const debts = snapshot.simplifiedDebts

        const owes = debts.filter((d) => d.fromUser.userId === currentUserId)
        const owed = debts.filter((d) => d.toUser.userId === currentUserId)
        const owesTotal = owes.reduce((sum, d) => sum + d.amount, 0)
        const owedTotal = owed.reduce((sum, d) => sum + d.amount, 0)

        if (owesTotal > 0) {
            const primary = [...owes].sort((a, b) => b.amount - a.amount)[0]
            if (!primary) return null
            return {
                type: 'owes' as const,
                amount: owesTotal,
                partner: primary.toUser,
                primaryDebt: primary,
                count: owes.length
            }
        }

        if (owedTotal > 0) {
            const primary = [...owed].sort((a, b) => b.amount - a.amount)[0]
            if (!primary) return null
            return {
                type: 'owed' as const,
                amount: owedTotal,
                partner: primary.fromUser,
                primaryDebt: primary,
                count: owed.length
            }
        }

        return null
    }, [snapshot, currentUserId])

    const isAllSettled = !!snapshot && snapshot.totalUnsettled === 0

    if (isLoading) {
        return (
            <div className="glass-elevated rounded-2xl p-6" data-testid="overview-debt-hero">
                <div className="flex items-center gap-4">
                    <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
                    </div>
                </div>
            </div>
        )
    }

    if (heroState?.type === 'owes') {
        return (
            <div
                className="relative overflow-hidden rounded-2xl border border-red-300/40 bg-gradient-to-br from-red-50/90 via-background/80 to-orange-50/60 p-5 dark:border-red-700/30 dark:from-red-950/40 dark:via-background/80 dark:to-orange-950/30"
                data-testid="overview-debt-hero"
            >
                <div className="flex items-center gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-100 text-lg font-semibold text-red-600 ring-2 ring-red-300/50 dark:bg-red-900/50 dark:text-red-400 dark:ring-red-700/40">
                        {getInitial(heroState.partner.displayName)}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-red-600/80 dark:text-red-400/80">
                            {t('overview.heroYouOwe', {
                                name: heroState.partner.displayName ?? t('common.unknown')
                            })}
                            {heroState.count > 1 && (
                                <span className="ml-1 text-xs opacity-70">
                                    {t('overview.andMore', { count: heroState.count - 1 })}
                                </span>
                            )}
                        </p>
                        <p className="mt-0.5 text-3xl font-bold tracking-tight text-red-700 dark:text-red-300">
                            {formatCurrency(heroState.amount, currency)}
                        </p>
                    </div>
                </div>
                <Button
                    type="button"
                    className="press-feedback mt-4 h-11 w-full bg-red-600 font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                    onClick={() => onSettle(heroState.primaryDebt)}
                >
                    <HandCoins className="mr-2 h-4 w-4" />
                    {t('overview.settleNow')}
                </Button>
            </div>
        )
    }

    if (heroState?.type === 'owed') {
        return (
            <div
                className="relative overflow-hidden rounded-2xl border border-green-300/40 bg-gradient-to-br from-green-50/90 via-background/80 to-emerald-50/60 p-5 dark:border-green-700/30 dark:from-green-950/40 dark:via-background/80 dark:to-emerald-950/30"
                data-testid="overview-debt-hero"
            >
                <div className="flex items-center gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-100 text-lg font-semibold text-green-600 ring-2 ring-green-300/50 dark:bg-green-900/50 dark:text-green-400 dark:ring-green-700/40">
                        {getInitial(heroState.partner.displayName)}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-green-600/80 dark:text-green-400/80">
                            {t('overview.heroOwesYou', {
                                name: heroState.partner.displayName ?? t('common.unknown')
                            })}
                            {heroState.count > 1 && (
                                <span className="ml-1 text-xs opacity-70">
                                    {t('overview.andMore', { count: heroState.count - 1 })}
                                </span>
                            )}
                        </p>
                        <p className="mt-0.5 text-3xl font-bold tracking-tight text-green-700 dark:text-green-300">
                            {formatCurrency(heroState.amount, currency)}
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    if (isAllSettled) {
        return (
            <div
                className="relative overflow-hidden rounded-2xl border border-green-300/30 bg-gradient-to-br from-green-50/70 via-background/80 to-teal-50/50 p-5 text-center dark:border-green-700/20 dark:from-green-950/30 dark:via-background/80 dark:to-teal-950/20"
                data-testid="overview-debt-hero"
            >
                <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-500 dark:text-green-400" />
                <p className="text-lg font-bold text-green-700 dark:text-green-300">
                    {t('overview.allClear')}
                </p>
                <p className="mt-1 text-sm text-green-600/60 dark:text-green-400/60">
                    {t('overview.allClearDesc')}
                </p>
            </div>
        )
    }

    return (
        <div className="glass rounded-2xl p-6 text-center" data-testid="overview-debt-hero">
            <Wallet className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('overview.noDebtsThisMonth')}</p>
        </div>
    )
}
