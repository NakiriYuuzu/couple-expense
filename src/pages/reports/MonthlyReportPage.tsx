import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pie, PieChart as RechartsPieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts'
import { ChevronLeft, PieChart, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuthStore } from '@/features/auth/authStore'
import { categoryColors, categoryIds } from '@/features/expense/lib/categories'
import type { CategoryId } from '@/entities/expense/types'
import { useMarkReportRead } from '@/features/report/api/useMarkReportRead'
import { useMonthlyReport } from '@/features/report/api/useMonthlyReport'
import type { MonthlyReportRecord } from '@/features/report/api/useMonthlyReport'
import { formatCurrency } from '@/shared/lib/money'

interface MonthlyReportPageProps {
    yearMonth: string
}

interface CategoryDisplayInfo {
    categoryKey: CategoryId
    label: string
}

interface TooltipEntry {
    name?: string | number
    value?: string | number | readonly (string | number)[]
    payload?: {
        total?: number
        value?: number
        name?: string | number
        label?: string | number
    }
}

interface TooltipProps {
    active?: boolean
    payload?: readonly TooltipEntry[]
    label?: string | number
}

interface PieShapeProps {
    fill?: string
    payload?: {
        color?: string
    }
}

function getCategoryDisplayInfo(category: string, t: (key: string) => string): CategoryDisplayInfo {
    const isKnown = categoryIds.includes(category as CategoryId)
    const categoryKey = isKnown ? (category as CategoryId) : 'other'
    const label = isKnown ? t(`expense.categories.${category}`) : category

    return { categoryKey, label }
}

function EmptyPanel({ text }: { text: string }) {
    return (
        <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    )
}

function MoneyTooltip({ active, payload, label }: TooltipProps) {
    if (!active || !payload?.length) return null
    const entry = payload[0]
    const amount =
        typeof entry.value === 'number'
            ? entry.value
            : typeof entry.value === 'string'
              ? Number(entry.value)
              : Number(entry.payload?.value ?? entry.payload?.total ?? 0)

    const title = String(
        entry.payload?.name ?? entry.payload?.label ?? entry.name ?? label ?? ''
    )

    return (
        <div className="glass rounded-xl border border-glass-border px-3 py-2 shadow-lg">
            <p className="text-xs font-medium text-foreground">{title}</p>
            <p className="mt-1 text-sm font-semibold text-brand-primary">
                {formatCurrency(amount, 'TWD')}
            </p>
        </div>
    )
}

function CategoryPieSector(props: PieShapeProps) {
    return (
        <Sector
            {...props}
            fill={props.payload?.color ?? props.fill}
            stroke="var(--background)"
            strokeWidth={2}
        />
    )
}

function displayMomTrend(
    deltaPct: number | null,
    delta: number
): { text: string; tone: string; icon: 'up' | 'down' | 'none' } {
    if (deltaPct === null) {
        return { text: '—', tone: 'text-muted-foreground', icon: 'none' }
    }

    const value = `${Math.abs(deltaPct).toFixed(1)}%`

    if (delta > 0) return { text: `+${value}`, tone: 'text-red-600 dark:text-red-400', icon: 'up' }
    if (delta < 0) return { text: `-${value}`, tone: 'text-green-600 dark:text-green-400', icon: 'down' }

    return { text: value, tone: 'text-muted-foreground', icon: 'none' }
}

export default function MonthlyReportPage({ yearMonth }: MonthlyReportPageProps) {
    const { t } = useTranslation()
    const { data: reportData, isLoading, isError } = useMonthlyReport(yearMonth)
    const userId = useAuthStore(s => s.user?.id ?? null)
    const { mutate: markReportRead } = useMarkReportRead()
    const lastMarkedYearMonth = useRef<string | null>(null)

    useEffect(() => {
        if (!reportData || !userId) return
        if (reportData.row.read_at !== null) return
        if (lastMarkedYearMonth.current === reportData.row.year_month) return

        lastMarkedYearMonth.current = reportData.row.year_month
        markReportRead(
            { userId, yearMonth: reportData.row.year_month },
            {
                onError: error => {
                    console.warn('月報已讀狀態回寫失敗', error)
                }
            }
        )
    }, [markReportRead, reportData, userId])

    const categoryRows = useMemo(() => {
        if (!reportData) return []

        const total = reportData.data.personal.total

        return reportData.data.personal.byCategory
            .map(entry => {
                const displayInfo = getCategoryDisplayInfo(entry.category, t)
                return {
                    id: entry.category,
                    label: displayInfo.label,
                    amount: entry.amount,
                    percentage:
                        total > 0 ? Math.round((entry.amount / total) * 100) : 0,
                    color: categoryColors[displayInfo.categoryKey].color,
                    order: categoryIds.indexOf(displayInfo.categoryKey)
                }
            })
            .filter((entry) => entry.amount > 0)
            .sort((a, b) => (b.amount - a.amount) || (a.order - b.order))
    }, [reportData, t])

    if (isLoading) {
        return (
            <main className="px-4 pb-28">
                <section className="mt-4 animate-fade-up stagger-1" data-testid="monthly-report-loading">
                    <div className="space-y-4">
                        <div className="glass-elevated h-32 animate-pulse rounded-2xl" />
                        <div className="glass h-56 animate-pulse rounded-2xl" />
                        <div className="glass rounded-2xl h-64 animate-pulse rounded-2xl" />
                    </div>
                </section>
            </main>
        )
    }

    if (isError) {
        return (
            <main className="px-4 pb-28">
                <section className="mt-4 animate-fade-up stagger-1" data-testid="monthly-report-error">
                    <p className="text-sm text-destructive">{t('report.pageLoadError')}</p>
                </section>
            </main>
        )
    }

    if (!reportData) {
        return (
            <main className="px-4 pb-28">
                <section className="mt-4 animate-fade-up stagger-1" data-testid="monthly-report-empty">
                    <EmptyPanel text={t('common.noData')}
                    />
                </section>
            </main>
        )
    }

    const report = reportData as MonthlyReportRecord
    const totalAmount = report.data.personal.total + report.data.group.splitTotal
    const mom = displayMomTrend(report.data.mom.deltaPct, report.data.mom.delta)

    return (
        <main className="px-4 pb-28">
            <section className="mt-4 space-y-4 animate-fade-up stagger-1">
                <section className="glass rounded-2xl p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs tracking-wider text-muted-foreground uppercase">
                                {t('report.pageHeroLabel', { yearMonth })}
                            </p>
                            <p className="mt-1 text-2xl font-bold text-foreground">
                                {formatCurrency(totalAmount, 'TWD')}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {report.data.personal.expenseCount} {t('stats.count')}
                            </p>
                        </div>
                        <button type="button" aria-label="month" className="rounded-full border border-glass-border p-2 text-xs text-muted-foreground">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-glass-border px-3 py-2">
                        <span className="text-xs text-muted-foreground">{t('report.pageMoMLabel')}</span>
                        <span
                            className={`text-sm font-semibold ${mom.tone}`}
                            data-testid="monthly-report-mom"
                        >
                            {mom.text}
                        </span>
                        {mom.icon === 'up' && <TrendingUp data-testid="monthly-report-mom-up" className="h-4 w-4 text-red-600 dark:text-red-400" />}
                        {mom.icon === 'down' && <TrendingDown data-testid="monthly-report-mom-down" className="h-4 w-4 text-green-600 dark:text-green-400" />}
                    </div>
                </section>

                <section className="glass rounded-2xl p-4" data-testid="monthly-report-category">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold text-foreground">
                            {t('overview.categoryBreakdown')}
                        </h2>
                        <PieChart className="h-5 w-5 text-brand-primary" />
                    </div>
                    {categoryRows.length > 0 ? (
                        <>
                            <div className="h-56" data-testid="monthly-report-category-chart">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPieChart>
                                        <Pie
                                            data={categoryRows}
                                            dataKey="amount"
                                            nameKey="label"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={46}
                                            outerRadius={76}
                                            paddingAngle={2}
                                            shape={CategoryPieSector}
                                        />
                                        <Tooltip content={props => <MoneyTooltip {...props} />} />
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-4 space-y-2" data-testid="monthly-report-category-list">
                                {categoryRows.map(entry => (
                                    <div key={entry.id} className="glass-light rounded-xl p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span
                                                    className="h-3 w-3 shrink-0 rounded-full"
                                                    style={{ background: entry.color }}
                                                    aria-hidden="true"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground">
                                                        {entry.label}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {entry.percentage}%
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-sm font-semibold text-foreground">
                                                {formatCurrency(entry.amount, 'TWD')}
                                            </p>
                                        </div>
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${entry.percentage}%`, background: entry.color }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <EmptyPanel text={t('common.noData')} />
                    )}
                </section>

                <section className="glass rounded-2xl p-4" data-testid="monthly-report-groups">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold text-foreground">{t('report.pageGroupSettlementTitle')}</h2>
                    </div>
                    {report.data.group.groups.length > 0 ? (
                        <div className="space-y-2">
                            {report.data.group.groups.map(group => (
                                <div key={group.groupId} className="glass-light rounded-xl p-3">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {group.groupName}
                                    </p>
                                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                                        <p className="text-muted-foreground">
                                            {t('report.groupSplitLabel')} {formatCurrency(group.splitAmount, 'TWD')}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {t('report.groupSettledLabel')} {formatCurrency(group.settledAmount, 'TWD')}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {t('report.groupUnsettledLabel')} {formatCurrency(group.unsettledAmount, 'TWD')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyPanel text={t('report.pageNoGroupSettlementData')} />
                    )}
                </section>
            </section>
        </main>
    )
}
