import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Scale, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExpenseItem } from '@/features/expense/components/ExpenseItem'
import { useMonthlyReport } from '@/features/report/api/useMonthlyReport'
import { getPreviousMonth, shouldShowMonthlyReportEntry } from '@/features/report/lib/entryVisibility'
import { useExpenses } from '@/features/expense/api/useExpenses'
import { useUserSplitShares, type UserSplitShare } from '@/features/expense/api/useExpenseSplits'
import { useGroups } from '@/features/group/api/useGroups'
import { fetchNetBalances, fetchSimplifiedDebts } from '@/features/settlement/api/queries'
import { ScopeChips, type ExpenseScope } from '@/shared/components/ScopeChips'
import { useAuthStore } from '@/features/auth/authStore'
import { deriveExpenseStats } from '@/features/statistics/selectors'
import { CategoryUtils } from '@/features/expense/lib/categories'
import { formatCurrency } from '@/shared/lib/money'
import { currentYearMonth, formatDateTime, taipeiDateString } from '@/shared/lib/datetime'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { STALE } from '@/shared/lib/queryClient'
import { cn } from '@/shared/lib/utils'
import type { CategoryId } from '@/entities/expense/types'
import type { SimplifiedDebt } from '@/entities/settlement/types'
import type { CurrencyType } from '@/shared/lib/database.types'

// Dashboard（Phase 5.1，對照 Vue DashboardPage.vue）。預設顯示全部內容，
// 由頁內 ScopeChips 過濾（'all' 聚合個人+跨群組 / 'personal' 純個人 / groupId 單群組）：
//   聚合模式：問候語 + 本月統計（個人費用+我的分帳份額+跨群組欠款）+ 個人預算環 + 最近支出。
//   群組模式：群組本月統計 + 我的份額 + debt 摘要 + 最近群組支出。
// 統計一律走 deriveExpenseStats（Asia/Taipei 分桶），金額一律走 formatCurrency。

const PRIMARY_CURRENCY: CurrencyType = 'TWD'
const CURRENCY_ORDER: readonly CurrencyType[] = ['TWD', 'USD', 'EUR', 'JPY', 'CNY']

type CurrencyBuckets = Partial<Record<CurrencyType, number>>

function addCurrencyAmount(buckets: CurrencyBuckets, currency: CurrencyType, amount: number): CurrencyBuckets {
    if (amount === 0) return buckets
    buckets[currency] = (buckets[currency] ?? 0) + amount
    return buckets
}

function mergeCurrencyBuckets(...sources: readonly CurrencyBuckets[]): CurrencyBuckets {
    const buckets: CurrencyBuckets = {}
    for (const source of sources) {
        for (const [currency, amount] of Object.entries(source) as [CurrencyType, number][]) {
            addCurrencyAmount(buckets, currency, amount)
        }
    }
    return buckets
}

function amountForCurrency(buckets: CurrencyBuckets, currency: CurrencyType): number {
    return buckets[currency] ?? 0
}

function formatCurrencyBuckets(buckets: CurrencyBuckets): string {
    const currencies = [
        ...CURRENCY_ORDER,
        ...(Object.keys(buckets) as CurrencyType[]).filter((currency) => !CURRENCY_ORDER.includes(currency))
    ]
    const entries = currencies
        .map((currency) => [currency, buckets[currency] ?? 0] as const)
        .filter(([, amount]) => amount !== 0)

    if (entries.length === 0) return formatCurrency(0, PRIMARY_CURRENCY)
    return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(' / ')
}

function sumSplitShares(shares: readonly UserSplitShare[] | undefined): number {
    return (shares ?? []).reduce((sum, row) => sum + row.amount, 0)
}

export default function DashboardPage() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { data: groupsData, isSuccess: groupsLoaded } = useGroups()
    const currentUserId = useAuthStore((s) => s.user?.id ?? null)
    const { data: expensesData } = useExpenses()

    // 頁內範疇：預設全部；指向的群組已不在清單（被移出/解散）→ 收斂回全部。
    const [scope, setScope] = useState<ExpenseScope>('all')
    const scopeGroup = useMemo(
        () =>
            scope !== 'all' && scope !== 'personal'
                ? (groupsData ?? []).find((g) => g.group.id === scope) ?? null
                : null,
        [groupsData, scope]
    )
    useEffect(() => {
        if (scope !== 'all' && scope !== 'personal' && groupsLoaded && !scopeGroup) setScope('all')
    }, [scope, groupsLoaded, scopeGroup])

    // isAggregate = 非單一群組視圖（'all' 或 'personal'），沿用原「個人模式」的多幣別聚合口徑。
    const isAggregate = !scopeGroup

    const currency = scopeGroup?.settings?.currency ?? 'TWD'
    const fmt = (amount: number) => formatCurrency(amount, currency)
    const allExpenses = useMemo(() => expensesData ?? [], [expensesData])
    const groupCurrencyById = useMemo(() => {
        const map = new Map<string, CurrencyType>()
        for (const group of groupsData ?? []) {
            map.set(group.group.id, group.settings?.currency ?? PRIMARY_CURRENCY)
        }
        return map
    }, [groupsData])

    const currencyOfExpense = useMemo(() => {
        const map = new Map<string, CurrencyType>()
        for (const expense of allExpenses) {
            map.set(
                expense.id,
                expense.currency ?? (expense.group_id ? groupCurrencyById.get(expense.group_id) ?? PRIMARY_CURRENCY : PRIMARY_CURRENCY)
            )
        }
        return map
    }, [allExpenses, groupCurrencyById])

    // 作用中範疇的費用：'all' 全部；'personal' 取 group_id === null；群組取該群組。
    const scopedExpenses = useMemo(() => {
        if (scope === 'all') return allExpenses
        if (scope === 'personal') return allExpenses.filter((e) => e.group_id === null)
        if (scopeGroup) return allExpenses.filter((e) => e.group_id === scopeGroup.group.id)
        return []
    }, [allExpenses, scope, scopeGroup])

    const scopedStats = useMemo(
        () =>
            deriveExpenseStats(
                scopedExpenses.map((e) => ({
                    date: e.date,
                    amount: e.amount,
                    category: e.category as CategoryId
                }))
            ),
        [scopedExpenses]
    )

    const recent = useMemo(
        () => [...scopedExpenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3),
        [scopedExpenses]
    )

    // 我的分帳份額計算範疇：'all' 取所有群組費用；'personal' 無分帳概念；群組取該群組。
    const shareScopeExpenses = useMemo(() => {
        if (scope === 'all') return allExpenses.filter((e) => e.group_id !== null)
        if (scope === 'personal') return []
        return scopedExpenses
    }, [allExpenses, scope, scopedExpenses])

    const currentMonthExpenseIds = useMemo(() => {
        const monthStart = `${currentYearMonth()}-01`
        const today = taipeiDateString()
        return shareScopeExpenses
            .filter((e) => e.date >= monthStart && e.date <= today)
            .map((e) => e.id)
    }, [shareScopeExpenses])
    const { data: mySplitShares } = useUserSplitShares(currentUserId, currentMonthExpenseIds)
    const myShare = sumSplitShares(mySplitShares)

    const todayExpenseIds = useMemo(() => {
        const today = taipeiDateString()
        return shareScopeExpenses.filter((e) => e.date === today).map((e) => e.id)
    }, [shareScopeExpenses])
    const { data: todaySplitShares } = useUserSplitShares(currentUserId, todayExpenseIds)

    const personalExpenseMonthBuckets = useMemo(() => {
        const buckets: CurrencyBuckets = {}
        const monthStart = `${currentYearMonth()}-01`
        const today = taipeiDateString()
        for (const expense of allExpenses) {
            if (expense.group_id !== null) continue
            if (expense.date < monthStart || expense.date > today) continue
            addCurrencyAmount(buckets, currencyOfExpense.get(expense.id) ?? PRIMARY_CURRENCY, expense.amount)
        }
        return buckets
    }, [allExpenses, currencyOfExpense])

    const todayPersonalExpenseBuckets = useMemo(() => {
        const buckets: CurrencyBuckets = {}
        const today = taipeiDateString()
        for (const expense of allExpenses) {
            if (expense.group_id !== null || expense.date !== today) continue
            addCurrencyAmount(buckets, currencyOfExpense.get(expense.id) ?? PRIMARY_CURRENCY, expense.amount)
        }
        return buckets
    }, [allExpenses, currencyOfExpense])

    const mySplitShareBuckets = useMemo(() => {
        const buckets: CurrencyBuckets = {}
        for (const share of mySplitShares ?? []) {
            addCurrencyAmount(buckets, currencyOfExpense.get(share.expense_id) ?? currency, share.amount)
        }
        return buckets
    }, [currency, currencyOfExpense, mySplitShares])

    const todaySplitShareBuckets = useMemo(() => {
        const buckets: CurrencyBuckets = {}
        for (const share of todaySplitShares ?? []) {
            addCurrencyAmount(buckets, currencyOfExpense.get(share.expense_id) ?? currency, share.amount)
        }
        return buckets
    }, [currency, currencyOfExpense, todaySplitShares])

    const balanceGroupIds = useMemo(() => {
        if (scope === 'personal') return []
        if (scopeGroup) return [scopeGroup.group.id]
        return (groupsData ?? []).map((g) => g.group.id)
    }, [scope, scopeGroup, groupsData])

    const balanceQueries = useQueries({
        queries: balanceGroupIds.map((groupId) => ({
            queryKey: queryKeys.balances(groupId),
            queryFn: () => fetchNetBalances(queryClient, groupId),
            staleTime: STALE.short,
            gcTime: STALE.short,
            enabled: !!currentUserId
        }))
    })

    const personalDebtBuckets = useMemo(() => {
        const buckets: CurrencyBuckets = {}
        balanceQueries.forEach((query, index) => {
            const groupId = balanceGroupIds[index]
            const mine = query.data?.find((balance) => balance.userId === currentUserId)
            const amount = Math.max(0, -(mine?.netBalance ?? 0))
            const bucketCurrency = groupId ? groupCurrencyById.get(groupId) ?? currency : currency
            addCurrencyAmount(buckets, bucketCurrency, amount)
        })
        return buckets
    }, [balanceGroupIds, balanceQueries, currency, currentUserId, groupCurrencyById])

    const personalSpendingBuckets = useMemo(() => {
        if (scopeGroup) return addCurrencyAmount({}, currency, myShare)
        if (scope === 'personal') return personalExpenseMonthBuckets
        return mergeCurrencyBuckets(personalExpenseMonthBuckets, mySplitShareBuckets)
    }, [currency, scope, scopeGroup, myShare, mySplitShareBuckets, personalExpenseMonthBuckets])

    const todayTotalBuckets = useMemo(
        () => mergeCurrencyBuckets(todayPersonalExpenseBuckets, todaySplitShareBuckets),
        [todayPersonalExpenseBuckets, todaySplitShareBuckets]
    )

    const personalSpendingPrimary = amountForCurrency(personalSpendingBuckets, PRIMARY_CURRENCY)
    const personalDebtPrimary = amountForCurrency(personalDebtBuckets, PRIMARY_CURRENCY)
    const personalDebtMonth = isAggregate ? personalDebtPrimary : amountForCurrency(personalDebtBuckets, currency)
    const dashboardMonthTotal = isAggregate ? personalSpendingPrimary : scopedStats.month
    const dashboardMonthText = isAggregate ? formatCurrencyBuckets(personalSpendingBuckets) : fmt(scopedStats.month)
    const dashboardSecondaryText = isAggregate ? formatCurrencyBuckets(todayTotalBuckets) : fmt(myShare)
    const personalSpendingText = isAggregate ? formatCurrencyBuckets(personalSpendingBuckets) : fmt(myShare)
    const personalDebtText = isAggregate ? formatCurrencyBuckets(personalDebtBuckets) : fmt(personalDebtMonth)

    // debt 摘要：範疇內各群組的 simplified debts 合併（'all' 跨群組、群組單一、'personal' 無）。
    const debtQueries = useQueries({
        queries: balanceGroupIds.map((groupId) => ({
            queryKey: queryKeys.simplifiedDebts(groupId),
            queryFn: () => fetchSimplifiedDebts(queryClient, groupId),
            staleTime: STALE.short,
            gcTime: STALE.short,
            enabled: !!currentUserId
        }))
    })

    const debtSummary = useMemo(() => {
        const rows: Array<SimplifiedDebt & { groupId: string; groupName: string | null }> = []
        debtQueries.forEach((query, index) => {
            const groupId = balanceGroupIds[index]
            if (!groupId) return
            const groupName = (groupsData ?? []).find((g) => g.group.id === groupId)?.group.name ?? null
            for (const debt of query.data ?? []) rows.push({ ...debt, groupId, groupName })
        })
        return rows.slice(0, 5)
    }, [debtQueries, balanceGroupIds, groupsData])

    // 個人預算：user_profiles.personal_monthly_budget（聚合視圖才查；群組視圖改用 group_settings）。
    const { data: personalBudget } = useQuery({
        queryKey: queryKeys.userProfileBudget(currentUserId ?? ''),
        queryFn: async (): Promise<number | null> => {
            const { data } = await supabase
                .from('user_profiles')
                .select('personal_monthly_budget')
                .eq('id', currentUserId as string)
                .maybeSingle()
            return (data as { personal_monthly_budget: number | null } | null)?.personal_monthly_budget ?? null
        },
        enabled: !!currentUserId && isAggregate
    })

    const prevYearMonth = getPreviousMonth(currentYearMonth())
    const monthlyReportQuery = useMonthlyReport(prevYearMonth)
    const reportEntry = shouldShowMonthlyReportEntry(
        taipeiDateString(),
        monthlyReportQuery.data != null
    )

    const budget = isAggregate ? personalBudget ?? 0 : scopeGroup?.settings?.monthly_budget ?? 0
    const budgetSpending = isAggregate ? dashboardMonthTotal : scopedStats.month
    const budgetPct = budget > 0 ? Math.min(100, Math.round((budgetSpending / budget) * 100)) : 0

    const greeting = useMemo(() => {
        const hour = new Date().getHours()
        if (hour < 12) return t('dashboard.greetingMorning')
        if (hour < 18) return t('dashboard.greetingAfternoon')
        return t('dashboard.greetingEvening')
    }, [t])

    const todayText = formatDateTime(new Date(), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        locale: i18n.language
    })

    const goDetail = (id: string) => navigate({ to: '/expenses/$id', params: { id } })

    const progressTotal = personalSpendingPrimary + personalDebtPrimary
    const spendingPct = progressTotal > 0 ? Math.round((personalSpendingPrimary / progressTotal) * 100) : 100
    const debtPct = 100 - spendingPct

    // 預算環 SVG 幾何
    const circumference = 2 * Math.PI * 50
    const filled = (Math.min(budgetPct, 100) / 100) * circumference
    const ringDash = `${filled} ${circumference - filled}`
    const ringColor = budgetPct >= 100 ? 'text-red-500' : budgetPct >= 80 ? 'text-yellow-500' : 'text-green-500'

    return (
        <main className="px-4 pb-28">
            {/* 問候 */}
            <section className="animate-fade-up stagger-1 mt-4">
                <p className="text-sm text-muted-foreground">
                    {t('dashboard.greeting', { greeting, name: '' })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">{todayText}</p>
            </section>

            {/* 範疇過濾（取代右上角 GroupSwitcher） */}
            <section className="animate-fade-up stagger-1 mt-3">
                <ScopeChips
                    value={scope}
                    onChange={setScope}
                    groups={(groupsData ?? []).map((g) => ({ id: g.group.id, name: g.group.name }))}
                />
            </section>

            {/* 本月總覽（hero） */}
            <section className="animate-fade-up stagger-2 mt-4">
                <div className="glass-elevated rounded-2xl p-5" data-testid="stat-month">
                    <p className="text-xs tracking-wider text-muted-foreground uppercase">
                        {t('dashboard.monthTotal')}
                    </p>
                    <p className="mt-1 text-3xl font-bold text-foreground">{dashboardMonthText}</p>
                    {isAggregate && progressTotal > 0 && (
                        <div
                            className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted"
                            data-testid="dashboard-hero-progress"
                        >
                            <div
                                className="h-full transition-all duration-300"
                                style={{ width: `${spendingPct}%`, backgroundColor: 'var(--brand-primary)' }}
                            />
                            {personalDebtPrimary > 0 && (
                                <div
                                    className="h-full transition-all duration-300"
                                    style={{ width: `${debtPct}%`, backgroundColor: 'var(--debt)' }}
                                />
                            )}
                        </div>
                    )}
                    <div className="mt-3 flex items-center gap-4 border-t border-glass-border pt-3">
                        <div>
                            <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                {isAggregate ? t('dashboard.todayTotal') : t('dashboard.myShare')}
                            </p>
                            <p className="mt-0.5 text-base font-semibold text-foreground">
                                {dashboardSecondaryText}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 個人消費 / 個人欠款 */}
            <section className="animate-fade-up stagger-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="glass rounded-2xl p-4" data-testid="stat-personal-spending">
                        <div className="mb-1 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-primary" />
                            <p className="text-xs text-muted-foreground">{t('dashboard.personalSpending')}</p>
                        </div>
                        <p className="mt-1 text-lg font-bold text-foreground">{personalSpendingText}</p>
                    </div>
                    <div className="glass rounded-2xl p-4" data-testid="stat-personal-debt">
                        <div className="mb-1 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-debt" />
                            <p className="text-xs text-muted-foreground">{t('dashboard.personalDebt')}</p>
                        </div>
                        <p className="mt-1 text-lg font-bold text-foreground">{personalDebtText}</p>
                    </div>
                </div>
            </section>

            {/* 預算環 */}
            {budget > 0 && (
                <section className="animate-fade-up stagger-4 mt-4">
                    <div className="glass flex items-center gap-5 rounded-2xl p-4">
                        <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
                            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/50" />
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="50"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="10"
                                    strokeLinecap="round"
                                    strokeDasharray={ringDash}
                                    className={ringColor}
                                    style={{ transition: 'stroke-dasharray 0.6s ease' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className={cn('text-xl font-bold', ringColor)}>{budgetPct}%</span>
                            </div>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-center gap-2">
                                {budgetPct >= 100 ? (
                                    <TrendingDown className="h-4 w-4 text-red-500" />
                                ) : (
                                    <TrendingUp
                                        className={cn('h-4 w-4', budgetPct >= 80 ? 'text-yellow-500' : 'text-brand-primary')}
                                    />
                                )}
                                <span className="text-sm font-medium text-muted-foreground">
                                    {isAggregate ? t('dashboard.personalBudgetProgress') : t('dashboard.budgetProgress')}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {fmt(budgetSpending)} / {fmt(budget)}
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {/* 群組 debt 摘要（'all' 跨群組合併；'personal' 不顯示） */}
            {scope !== 'personal' && debtSummary.length > 0 && (
                <section className="animate-fade-up stagger-4 mt-4">
                    <div className="glass rounded-2xl p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Scale className="h-4 w-4 text-brand-primary" />
                                <p className="text-sm font-medium text-muted-foreground">
                                    {t('dashboard.debtSummary')}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="text-xs text-brand-primary hover:underline"
                                onClick={() => navigate({ to: '/overview' })}
                            >
                                {t('dashboard.viewBalances')}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {debtSummary.map((debt, index) => {
                                const from = debt.fromUser.displayName ?? t('common.unknown')
                                const to = debt.toUser.displayName ?? t('common.unknown')
                                const amount = formatCurrency(
                                    debt.amount,
                                    groupCurrencyById.get(debt.groupId) ?? currency
                                )
                                const groupBadge = scope === 'all' && debt.groupName && (
                                    <span className="ml-1 text-xs text-muted-foreground/70">
                                        · {debt.groupName}
                                    </span>
                                )
                                if (debt.fromUser.userId === currentUserId) {
                                    return (
                                        <div key={index} className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">
                                                {t('dashboard.youOwe')}{' '}
                                                <span className="font-medium text-foreground">{to}</span>
                                                {groupBadge}
                                            </span>
                                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-600 dark:bg-red-950 dark:text-red-400">
                                                {amount}
                                            </span>
                                        </div>
                                    )
                                }
                                if (debt.toUser.userId === currentUserId) {
                                    return (
                                        <div key={index} className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">
                                                <span className="font-medium text-foreground">{from}</span>{' '}
                                                {t('dashboard.owesYou')}
                                                {groupBadge}
                                            </span>
                                            <span className="rounded-full bg-green-50 px-2 py-0.5 text-sm font-semibold text-green-600 dark:bg-green-950 dark:text-green-400">
                                                {amount}
                                            </span>
                                        </div>
                                    )
                                }
                                return (
                                    <div key={index} className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            <span className="font-medium text-foreground">{from}</span>{' '}
                                            {t('dashboard.owes')}{' '}
                                            <span className="font-medium text-foreground">{to}</span>
                                            {groupBadge}
                                        </span>
                                        <span className="font-semibold text-foreground">{amount}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>
            )}

            {reportEntry.show && (
                <section className="animate-fade-up stagger-5 mt-4">
                    <div
                        className="glass hover-transition press-feedback relative rounded-2xl p-4"
                        onClick={() =>
                            navigate({
                                to: '/reports/$yearMonth',
                                params: { yearMonth: reportEntry.yearMonth }
                            })
                        }
                    >
                        {monthlyReportQuery.data?.row.read_at === null && (
                            <span className="absolute left-3 top-3 h-2 w-2 rounded-full bg-red-500" />
                        )}
                        <div className="mb-3 flex items-center gap-3">
                            <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-indigo-600 dark:text-indigo-400">
                                <TrendingUp className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-medium text-foreground">{t('report.dashboardCardTitle')}</h3>
                                <p className="text-sm text-muted-foreground">{t('report.dashboardCardSubtitle')}</p>
                            </div>
                        </div>
                        <div className="text-sm text-muted-foreground">{t('report.dashboardCardAction')}</div>
                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    </div>
                </section>
            )}

            {/* 最近支出 */}
            <section className="animate-fade-up stagger-6 mt-4">
                <div className="glass rounded-2xl p-4">
                    {recent.length > 0 ? (
                        <>
                            <p className="mb-3 text-sm font-medium text-muted-foreground">
                                {t('dashboard.recentExpenses')}
                            </p>
                            <div className="space-y-2">
                                {recent.map((e) => (
                                    <ExpenseItem
                                        key={e.id}
                                        title={e.title}
                                        amount={formatCurrency(
                                            e.amount,
                                            currencyOfExpense.get(e.id) ?? PRIMARY_CURRENCY
                                        )}
                                        category={e.category}
                                        icon={CategoryUtils.getIconKey(e.category)}
                                        user={e.user}
                                        showUser={scope !== 'personal'}
                                        splitMethod={e.split_method}
                                        isSettled={e.is_settled}
                                        onClick={() => goDetail(e.id)}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="py-6 text-center">
                            <p className="text-sm text-muted-foreground">
                                {scope === 'personal'
                                    ? t('dashboard.noPersonalExpenses')
                                    : scopeGroup
                                      ? t('dashboard.noGroupExpenses')
                                      : t('common.noData')}
                            </p>
                        </div>
                    )}

                    <div className="mt-4 flex gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            className="press-feedback flex-1 text-brand-primary hover:bg-brand-accent hover:text-brand-primary"
                            onClick={() => navigate({ to: '/expenses' })}
                        >
                            {t('dashboard.viewMore')}
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                        {scope !== 'personal' && (groupsData ?? []).length > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                className="press-feedback flex-1"
                                onClick={() => navigate({ to: '/overview' })}
                            >
                                <Scale className="mr-1 h-4 w-4" />
                                {t('nav.balances')}
                            </Button>
                        )}
                    </div>
                </div>
            </section>
        </main>
    )
}
