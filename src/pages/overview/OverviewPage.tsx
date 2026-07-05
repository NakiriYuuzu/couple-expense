import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    Pie,
    PieChart as RechartsPieChart,
    ResponsiveContainer,
    Sector,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts'
import {
    ArrowRight,
    BarChart3,
    ChevronLeft,
    ChevronRight,
    PieChart,
    Scale,
    Wallet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useExpenses } from '@/features/expense/api/useExpenses'
import type { ExpenseWithUser } from '@/features/expense/api/useExpenses'
import { categoryColors, categoryIds } from '@/features/expense/lib/categories'
import { useGroups } from '@/features/group/api/useGroups'
import { useAvailableMonths, useMonthDebts, useSnapshots } from '@/features/settlement/api/queries'
import { DebtStatusHero } from '@/features/settlement/components/DebtStatusHero'
import { SettlementDrawer } from '@/features/settlement/components/SettlementDrawer'
import { SettlementHistory } from '@/features/settlement/components/SettlementHistory'
import { useAuthStore } from '@/features/auth/authStore'
import { CalendarView } from '@/features/statistics/components/CalendarView'
import { ScopeChips, type ExpenseScope } from '@/shared/components/ScopeChips'
import { currentYearMonth, taipeiDateString } from '@/shared/lib/datetime'
import { formatCurrency } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import type { CategoryId } from '@/entities/expense/types'
import type { GroupWithDetails } from '@/entities/group/types'
import type { CurrencyType } from '@/shared/lib/database.types'
import type {
    MonthlyDebtStatus,
    SimplifiedDebt,
    SettlementHistoryItem
} from '@/entities/settlement/types'

// Phase 5.2 Overview：取代 placeholder，維持單檔實作以符合本階段「只改 OverviewPage」限制。
// 統計分桶只使用儲存的 YYYY-MM-DD 字串、currentYearMonth/taipeiDateString 與字串區間；
// 金額一律透過 formatCurrency；分類色固定來自 categoryColors，不依排名重配色。

type Panel = 'statistics' | 'debts'
type PeriodMode = 'month' | 'year'

type TFunction = ReturnType<typeof useTranslation>['t']
type CategoryTrendTotals = Record<CategoryId, number>

interface CategorySummaryRow {
    id: CategoryId
    label: string
    total: number
    count: number
    percentage: number
    color: string
    bg: string
}

interface TrendPoint extends CategoryTrendTotals {
    key: string
    label: string
    total: number
}

interface PeriodModel {
    periodTotal: number
    secondaryTotal: number
    dailyAverage: number
    expenseCount: number
    categoryRows: CategorySummaryRow[]
    trendData: TrendPoint[]
}

interface TooltipEntry {
    name?: string | number
    value?: string | number | readonly (string | number)[]
    color?: string
    payload?: {
        label?: string | number
        name?: string | number
        total?: number
        value?: number
    }
}

interface TooltipProps {
    active?: boolean
    label?: string | number
    payload?: readonly TooltipEntry[]
}

interface PieShapeProps {
    fill?: string
    payload?: {
        color?: string
    }
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

function parseYearMonth(yearMonth: string): { year: number; month: number } {
    const [year, month] = yearMonth.split('-').map(Number)
    return { year: year ?? 0, month: month ?? 1 }
}

function yearMonthFromParts(year: number, month: number): string {
    return `${year}-${pad2(month)}`
}

function addMonths(yearMonth: string, delta: number): string {
    const { year, month } = parseYearMonth(yearMonth)
    const zeroBased = year * 12 + (month - 1) + delta
    const nextYear = Math.floor(zeroBased / 12)
    const nextMonth = (((zeroBased % 12) + 12) % 12) + 1
    return yearMonthFromParts(nextYear, nextMonth)
}

function nextMonthStart(yearMonth: string): string {
    return `${addMonths(yearMonth, 1)}-01`
}

function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number): number {
    const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return days[month - 1] ?? 30
}

function daysInYear(year: number): number {
    return isLeapYear(year) ? 366 : 365
}

function dayOfYear(date: string): number {
    const [year, month, day] = date.split('-').map(Number)
    let total = day ?? 1
    for (let i = 1; i < (month ?? 1); i += 1) {
        total += daysInMonth(year ?? 0, i)
    }
    return total
}

function periodLabel(mode: PeriodMode, yearMonth: string, year: number, t: TFunction): string {
    if (mode === 'month') {
        const { month } = parseYearMonth(yearMonth)
        return `${parseYearMonth(yearMonth).year}${t('overview.yearUnit')} ${month}${t('overview.monthUnit')}`
    }
    return `${year}${t('overview.yearUnit')}`
}

function periodRange(mode: PeriodMode, yearMonth: string, year: number): [string, string] {
    if (mode === 'month') return [`${yearMonth}-01`, nextMonthStart(yearMonth)]
    return [`${year}-01-01`, `${year + 1}-01-01`]
}

function isCategoryId(value: string): value is CategoryId {
    return (categoryIds as readonly string[]).includes(value)
}

function emptyCategoryTrendTotals(): CategoryTrendTotals {
    return {
        food: 0,
        pet: 0,
        shopping: 0,
        transport: 0,
        home: 0,
        other: 0
    }
}

function buildPeriodModel(
    expenses: readonly ExpenseWithUser[],
    mode: PeriodMode,
    selectedMonth: string,
    selectedYear: number,
    t: TFunction
): PeriodModel {
    const [start, end] = periodRange(mode, selectedMonth, selectedYear)
    const today = taipeiDateString()
    const { year, month } = parseYearMonth(selectedMonth)
    const categoryTotals = new Map<CategoryId, { total: number; count: number }>()
    const trendTotals = new Map<string, CategoryTrendTotals>()
    let periodTotal = 0
    let secondaryTotal = 0
    let expenseCount = 0

    for (const id of categoryIds) categoryTotals.set(id, { total: 0, count: 0 })

    for (const expense of expenses) {
        if (expense.date < start || expense.date >= end) continue

        const category = isCategoryId(expense.category) ? expense.category : 'other'
        const current = categoryTotals.get(category) ?? { total: 0, count: 0 }
        current.total += expense.amount
        current.count += 1
        categoryTotals.set(category, current)

        periodTotal += expense.amount
        expenseCount += 1
        if (mode === 'month' && expense.date === today) secondaryTotal += expense.amount

        if (mode === 'month') {
            const day = Number(expense.date.split('-')[2] ?? '1')
            const week = Math.max(1, Math.ceil(day / 7))
            const key = String(week)
            const bucket = trendTotals.get(key) ?? emptyCategoryTrendTotals()
            bucket[category] += expense.amount
            trendTotals.set(key, bucket)
        } else {
            const key = expense.date.split('-')[1] ?? '01'
            const bucket = trendTotals.get(key) ?? emptyCategoryTrendTotals()
            bucket[category] += expense.amount
            trendTotals.set(key, bucket)
        }
    }

    const denominator =
        mode === 'year'
            ? selectedYear === parseYearMonth(currentYearMonth()).year
                ? Math.max(1, dayOfYear(today))
                : daysInYear(selectedYear)
            : 1
    const dailyAverage = mode === 'year' ? periodTotal / denominator : 0

    const categoryRows = categoryIds
        .map(id => {
            const bucket = categoryTotals.get(id) ?? { total: 0, count: 0 }
            return {
                id,
                label: t(`expense.categories.${id}`),
                total: bucket.total,
                count: bucket.count,
                percentage: periodTotal > 0 ? Math.round((bucket.total / periodTotal) * 100) : 0,
                color: categoryColors[id].color,
                bg: categoryColors[id].bg
            }
        })
        .filter(row => row.total > 0)
        .sort((a, b) => b.total - a.total || categoryIds.indexOf(a.id) - categoryIds.indexOf(b.id))

    const trendData: TrendPoint[] =
        mode === 'month'
            ? Array.from({ length: Math.ceil(daysInMonth(year, month) / 7) }, (_, index) => {
	              const week = index + 1
	              const key = String(week)
	              const totals = trendTotals.get(key) ?? emptyCategoryTrendTotals()
	              return {
	                  key,
	                  label: t('overview.areaChartWeekTick', { value: week }),
	                  total: categoryIds.reduce((sum, id) => sum + totals[id], 0),
	                  ...totals
	              }
	          })
	        : Array.from({ length: 12 }, (_, index) => {
	              const monthNumber = index + 1
	              const key = pad2(monthNumber)
	              const totals = trendTotals.get(key) ?? emptyCategoryTrendTotals()
	              return {
	                  key,
	                  label: t('overview.areaChartMonthTick', { value: monthNumber }),
	                  total: categoryIds.reduce((sum, id) => sum + totals[id], 0),
	                  ...totals
	              }
	          })

    return {
        periodTotal,
        secondaryTotal,
        dailyAverage,
        expenseCount,
        categoryRows,
        trendData
    }
}

function displayText(value: string | number | undefined): string | undefined {
    if (value === undefined) return undefined
    return String(value)
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

function MoneyTooltip({
    active,
    label,
    payload,
    currency
}: TooltipProps & { currency: CurrencyType }) {
    if (!active || !payload?.length) return null
    const rows = payload
        .map((entry) => {
            const rawAmount = entry.value ?? entry.payload?.total ?? entry.payload?.value ?? 0
            const amount = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount) || 0
            return {
                name: displayText(entry.name ?? entry.payload?.name ?? entry.payload?.label ?? label),
                amount,
                color: entry.color
            }
        })
        .filter((row) => row.amount > 0)
    const labelText = displayText(label ?? payload[0]?.payload?.label)
    const displayRows = rows.length > 0
        ? rows
        : [{
                name: displayText(payload[0]?.payload?.name ?? payload[0]?.payload?.label ?? payload[0]?.name ?? label),
                amount: 0,
                color: payload[0]?.color
            }]

    return (
        <div className="glass rounded-xl border border-glass-border px-3 py-2 shadow-lg">
            {labelText && <p className="text-xs font-medium text-foreground">{labelText}</p>}
            <div className="mt-1 space-y-1">
                {displayRows.map((row) => (
                    <div key={row.name} className="flex items-center justify-between gap-4 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                            {row.color && (
                                <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: row.color }}
                                />
                            )}
                            <span className="truncate">{row.name}</span>
                        </span>
                        <span className="font-semibold text-brand-primary">
                            {formatCurrency(row.amount, currency)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function EmptyPanel({ text }: { text: string }) {
    return (
        <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    )
}

export default function OverviewPage() {
    const { t } = useTranslation()
    const { data: groupsData, isSuccess: groupsLoaded } = useGroups()
    const { data: expensesData, isLoading } = useExpenses()
    const [activePanel, setActivePanel] = useState<Panel>('statistics')

    // 統計範疇：預設全部；指向的群組已不在載入完成的清單 → 收斂回全部。
    const [scope, setScope] = useState<ExpenseScope>('all')
    const scopeGroup = useMemo(
        () =>
            scope !== 'all' && scope !== 'personal'
                ? (groupsData ?? []).find(g => g.group.id === scope) ?? null
                : null,
        [groupsData, scope]
    )
    useEffect(() => {
        if (scope !== 'all' && scope !== 'personal' && groupsLoaded && !scopeGroup) setScope('all')
    }, [scope, groupsLoaded, scopeGroup])

    const currency = scopeGroup?.settings?.currency ?? 'TWD'
    const allExpenses = useMemo(() => expensesData ?? [], [expensesData])
    const scopedExpenses = useMemo(() => {
        if (scope === 'all') return allExpenses
        if (scope === 'personal') return allExpenses.filter(e => e.group_id === null)
        if (scopeGroup) return allExpenses.filter(e => e.group_id === scopeGroup.group.id)
        return []
    }, [allExpenses, scope, scopeGroup])

    return (
        <main className="px-4 pb-28">
            <section className="animate-fade-up stagger-1 mt-4">
                <Tabs value={activePanel} onValueChange={value => setActivePanel(value as Panel)}>
                    <TabsList className="glass-light grid w-full grid-cols-2 rounded-full p-[2px]">
                        <TabsTrigger value="statistics" className="rounded-full">
                            <BarChart3 className="h-4 w-4" />
                            {t('overview.statistics')}
                            <span
                                className={cn(
                                    'h-1.5 w-1.5 rounded-full transition-colors',
                                    activePanel === 'statistics'
                                        ? 'bg-brand-primary'
                                        : 'bg-transparent'
                                )}
                            />
                        </TabsTrigger>
                        <TabsTrigger value="debts" className="rounded-full">
                            <Scale className="h-4 w-4" />
                            {t('overview.debts')}
                            <span
                                className={cn(
                                    'h-1.5 w-1.5 rounded-full transition-colors',
                                    activePanel === 'debts' ? 'bg-brand-primary' : 'bg-transparent'
                                )}
                            />
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="statistics" className="mt-4">
                        <ScopeChips
                            className="mb-4"
                            value={scope}
                            onChange={setScope}
                            groups={(groupsData ?? []).map(g => ({ id: g.group.id, name: g.group.name }))}
                        />
                        <StatisticsPanel
                            expenses={scopedExpenses}
                            currency={currency}
                            isLoading={isLoading}
                        />
                    </TabsContent>
                    <TabsContent value="debts" className="mt-4">
                        <DebtPanel groups={groupsData ?? []} />
                    </TabsContent>
                </Tabs>
            </section>
        </main>
    )
}

function StatisticsPanel({
    expenses,
    currency,
    isLoading
}: {
    expenses: readonly ExpenseWithUser[]
    currency: CurrencyType
    isLoading: boolean
}) {
    const { t } = useTranslation()
    const [mode, setMode] = useState<PeriodMode>('month')
    const initialYearMonth = currentYearMonth()
    const [selectedMonth, setSelectedMonth] = useState(initialYearMonth)
    const [selectedYear, setSelectedYear] = useState(parseYearMonth(initialYearMonth).year)

    const currentPeriod = currentYearMonth()
    const currentYear = parseYearMonth(currentPeriod).year

    const period = useMemo(
        () => buildPeriodModel(expenses, mode, selectedMonth, selectedYear, t),
        [expenses, mode, selectedMonth, selectedYear, t]
    )
    // CalendarView 的最小投影（scoped expenses → CalendarExpense[]），月曆自帶月份狀態
    const calendarExpenses = useMemo(
        () => expenses.map(e => ({ id: e.id, date: e.date, amount: e.amount, title: e.title, category: e.category })),
        [expenses]
    )

    const summaryLabel = mode === 'month' ? t('overview.monthlyTotal') : t('overview.totalExpenses')
    const secondaryLabel =
        mode === 'month' ? t('overview.todayExpense') : t('overview.dailyAverage')
    const secondaryValue = mode === 'month' ? period.secondaryTotal : period.dailyAverage
    const canGoNext = mode === 'month' ? selectedMonth < currentPeriod : selectedYear < currentYear

    const previous = () => {
        if (mode === 'month') {
            const next = addMonths(selectedMonth, -1)
            setSelectedMonth(next)
            setSelectedYear(parseYearMonth(next).year)
            return
        }
        setSelectedYear(year => year - 1)
    }

    const next = () => {
        if (!canGoNext) return
        if (mode === 'month') {
            const nextMonth = addMonths(selectedMonth, 1)
            setSelectedMonth(nextMonth)
            setSelectedYear(parseYearMonth(nextMonth).year)
            return
        }
        setSelectedYear(year => year + 1)
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="glass-elevated h-32 animate-pulse rounded-2xl" />
                <div className="glass h-64 animate-pulse rounded-2xl" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <section className="glass rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="glass-light flex rounded-full p-1">
                        <Button
                            type="button"
                            variant={mode === 'month' ? 'default' : 'ghost'}
                            size="sm"
                            className="rounded-full"
                            onClick={() => setMode('month')}
                        >
                            {t('overview.byMonth')}
                        </Button>
                        <Button
                            type="button"
                            variant={mode === 'year' ? 'default' : 'ghost'}
                            size="sm"
                            className="rounded-full"
                            onClick={() => setMode('year')}
                        >
                            {t('overview.byYear')}
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-full"
                            aria-label="previous period"
                            onClick={previous}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-24 text-center text-sm font-semibold text-foreground">
                            {periodLabel(mode, selectedMonth, selectedYear, t)}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-full"
                            aria-label="next period"
                            disabled={!canGoNext}
                            onClick={next}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
                <div className="glass-elevated rounded-2xl p-4" data-testid="overview-period-total">
                    <p className="text-xs tracking-wider text-muted-foreground uppercase">
                        {summaryLabel}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                        {formatCurrency(period.periodTotal, currency)}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {period.expenseCount} {t('stats.count')}
                    </p>
                </div>
                <div className="glass rounded-2xl p-4" data-testid="overview-secondary-total">
                    <p className="text-xs tracking-wider text-muted-foreground uppercase">
                        {secondaryLabel}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                        {formatCurrency(secondaryValue, currency)}
                    </p>
                </div>
            </section>

            <section className="glass rounded-2xl p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">
                            {t('overview.areaChartTitle')}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {periodLabel(mode, selectedMonth, selectedYear, t)}
                        </p>
                    </div>
                    <BarChart3 className="h-5 w-5 text-brand-primary" />
                </div>
                <div className="h-56" data-testid="overview-trend-chart">
                    <div className="sr-only" aria-hidden="true">
                        {period.categoryRows.map(row => (
                            <span key={row.id} data-testid={`overview-area-${row.id}`} />
                        ))}
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={period.trendData}
                            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                            <defs>
                                {period.categoryRows.map(row => (
                                    <linearGradient
                                        key={row.id}
                                        id={`overviewTrend-${row.id}`}
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1"
                                    >
                                        <stop offset="5%" stopColor={row.color} stopOpacity={0.45} />
                                        <stop offset="95%" stopColor={row.color} stopOpacity={0.05} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid
                                stroke="var(--glass-border)"
                                strokeDasharray="3 3"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="label"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 11 }}
                            />
                            <YAxis
                                width={72}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 11 }}
                                tickFormatter={value => formatCurrency(Number(value), currency)}
                            />
                            <Tooltip
                                content={props => <MoneyTooltip {...props} currency={currency} />}
                            />
                            <Legend />
                            {period.categoryRows.map(row => (
                                <Area
                                    key={row.id}
                                    type="monotone"
                                    dataKey={row.id}
                                    name={row.label}
                                    stackId="expenses"
                                    stroke={row.color}
                                    strokeWidth={1.5}
                                    fill={`url(#overviewTrend-${row.id})`}
                                    activeDot={{ r: 4, strokeWidth: 2 }}
                                    data-testid={`overview-area-${row.id}`}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2" data-testid="overview-trend-list">
                    {period.trendData
                        .filter(point => point.total > 0)
                        .map(point => (
                            <div
                                key={point.key}
                                className="glass-light flex items-center justify-between rounded-xl px-3 py-2 text-xs"
                            >
                                <span className="text-muted-foreground">{point.label}</span>
                                <span className="font-medium text-foreground">
                                    {formatCurrency(point.total, currency)}
                                </span>
                            </div>
                        ))}
                    {period.trendData.every(point => point.total === 0) && (
                        <p className="col-span-2 text-center text-xs text-muted-foreground">
                            {t('common.noData')}
                        </p>
                    )}
                </div>
            </section>

            <section className="glass rounded-2xl p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">
                            {t('overview.categoryBreakdown')}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {periodLabel(mode, selectedMonth, selectedYear, t)}
                        </p>
                    </div>
                    <PieChart className="h-5 w-5 text-brand-primary" />
                </div>

                {period.categoryRows.length > 0 ? (
                    <>
                        <div className="h-56" data-testid="overview-category-chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsPieChart>
                                    <Pie
                                        data={period.categoryRows.map(row => ({
                                            name: row.label,
                                            value: row.total,
                                            id: row.id,
                                            color: row.color,
                                            fill: row.color
                                        }))}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={48}
                                        outerRadius={76}
                                        paddingAngle={2}
                                        shape={CategoryPieSector}
                                    />
                                    <Tooltip
                                        content={props => (
                                            <MoneyTooltip {...props} currency={currency} />
                                        )}
                                    />
                                    <Legend />
                                </RechartsPieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-4 space-y-2" data-testid="overview-category-list">
                            {period.categoryRows.map(row => (
                                <div key={row.id} className="glass-light rounded-xl p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span
                                                className="h-3 w-3 shrink-0 rounded-full"
                                                style={{ background: row.color }}
                                                aria-hidden="true"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {row.label}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {row.count} {t('stats.count')} ·{' '}
                                                    {row.percentage}%
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-sm font-semibold text-foreground">
                                            {formatCurrency(row.total, currency)}
                                        </p>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${row.percentage}%`,
                                                background: row.color
                                            }}
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

            <CalendarView expenses={calendarExpenses} currency={currency} />
        </div>
    )
}

function DebtPanel({ groups }: { groups: GroupWithDetails[] }) {
    const { t } = useTranslation()
    const currentUserId = useAuthStore(s => s.user?.id ?? null)
    const initialMonth = currentYearMonth()
    const [selectedMonth, setSelectedMonth] = useState(initialMonth)
    const [selectedYear, setSelectedYear] = useState(parseYearMonth(initialMonth).year)

    // 群組選擇（債務本質上是 per-group 概念）：預設第一個群組；選擇已失效時回退第一個。
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
    const groupId =
        selectedGroupId && groups.some(g => g.group.id === selectedGroupId)
            ? selectedGroupId
            : groups[0]?.group.id ?? null
    const currency: CurrencyType =
        groups.find(g => g.group.id === groupId)?.settings?.currency ?? 'TWD'

    const { data: availableMonthsData, isLoading: monthsLoading } = useAvailableMonths(groupId)
    const { data: snapshotsData, isLoading: snapshotsLoading } = useSnapshots(groupId)

    // 選定月份的資料來源（對照 Vue useMonthlySnapshots.selectedSnapshot）：
    // 當月一律走即時 useMonthDebts；歷史月優先用對應快照，無快照才回退即時查該月。
    const isCurrentMonth = selectedMonth === currentYearMonth()
    const snapshot = useMemo(
        () => (snapshotsData ?? []).find(s => s.yearMonth === selectedMonth) ?? null,
        [snapshotsData, selectedMonth]
    )
    const useRealtime = isCurrentMonth || !snapshot
    const { data: monthDebtsData, isLoading: monthDebtsLoading } = useMonthDebts(
        useRealtime ? groupId : null,
        selectedMonth
    )
    const selectedDebts = useRealtime ? monthDebtsData ?? null : snapshot
    const debtsLoading = useRealtime ? monthDebtsLoading : snapshotsLoading && !snapshot

    // 結算 / 編輯抽屜狀態（對照 Vue DebtPanel 的 settle* refs）。
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerTarget, setDrawerTarget] = useState<{
        userId: string
        displayName: string | null
    } | null>(null)
    const [drawerAmount, setDrawerAmount] = useState(0)
    const [drawerYearMonth, setDrawerYearMonth] = useState<string | null>(null)
    const [editSettlementId, setEditSettlementId] = useState<string | null>(null)
    const [editNotes, setEditNotes] = useState<string | null>(null)

    useEffect(() => {
        if (!groupId) {
            setSelectedMonth(currentYearMonth())
            setSelectedYear(parseYearMonth(currentYearMonth()).year)
        }
    }, [groupId])

    // 月份 pills = 可用費用月 ∪ 快照月 ∪ 當月（對照 useMonthlySnapshots.allMonths），依選定年份分組、降冪。
    const allMonths = useMemo(() => {
        const set = new Set<string>([
            currentYearMonth(),
            ...(availableMonthsData ?? []),
            ...(snapshotsData ?? []).map(s => s.yearMonth)
        ])
        return [...set].sort().reverse()
    }, [availableMonthsData, snapshotsData])

    const yearMonths = useMemo(
        () => allMonths.filter(month => month.startsWith(`${selectedYear}-`)),
        [allMonths, selectedYear]
    )

    useEffect(() => {
        if (!groupId || yearMonths.length === 0 || selectedMonth.startsWith(`${selectedYear}-`))
            return
        setSelectedMonth(yearMonths[0] ?? currentYearMonth())
    }, [groupId, selectedMonth, selectedYear, yearMonths])

    // 只在 debtor 方（fromUser === 當前使用者）開結算抽屜：target 即收款方 toUser。
    const openSettleDrawer = (debt: SimplifiedDebt) => {
        setDrawerTarget(debt.toUser)
        setDrawerAmount(debt.amount)
        setDrawerYearMonth(selectedMonth)
        setEditSettlementId(null)
        setEditNotes(null)
        setDrawerOpen(true)
    }

    const openEditDrawer = (item: SettlementHistoryItem) => {
        setDrawerTarget(item.paidTo)
        setDrawerAmount(item.amount)
        setDrawerYearMonth(null)
        setEditSettlementId(item.id)
        setEditNotes(item.notes)
        setDrawerOpen(true)
    }

    if (!groupId) {
        return (
            <div className="glass rounded-2xl p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-accent text-brand-primary">
                    <Wallet className="h-7 w-7" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                    {t('group.noGroupsTitle')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t('group.noGroupsDesc')}</p>
            </div>
        )
    }

    const statusMeta = debtStatusMeta(selectedDebts?.status ?? 'settled', t)
    const debtCount = selectedDebts?.simplifiedDebts.length ?? 0
    const displayMonth =
        selectedMonth === currentYearMonth()
            ? t('overview.currentMonth')
            : `${parseYearMonth(selectedMonth).month}${t('overview.monthUnit')}`

    return (
        <div className="space-y-4">
            {groups.length > 1 && (
                <ScopeChips
                    value={groupId}
                    onChange={id => setSelectedGroupId(id)}
                    groups={groups.map(g => ({ id: g.group.id, name: g.group.name }))}
                    includeAll={false}
                    includePersonal={false}
                />
            )}

            {yearMonths.length > 0 && (
                <DebtStatusHero
                    snapshot={selectedDebts}
                    currentUserId={currentUserId}
                    currency={currency}
                    isLoading={debtsLoading}
                    onSettle={openSettleDrawer}
                />
            )}

            <section className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full"
                        aria-label="previous debt year"
                        onClick={() => setSelectedYear(year => year - 1)}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-center">
                        <p className="text-sm font-semibold text-foreground">
                            {selectedYear}
                            {t('overview.yearUnit')}
                        </p>
                        {yearMonths.length > 0 && (
                            <p className="text-xs text-muted-foreground">{displayMonth}</p>
                        )}
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full"
                        aria-label="next debt year"
                        disabled={selectedYear >= parseYearMonth(currentYearMonth()).year}
                        onClick={() => setSelectedYear(year => year + 1)}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div
                    className="mt-4 flex gap-2 overflow-x-auto pb-1"
                    data-testid="overview-debt-months"
                >
                    {monthsLoading ? (
                        <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
                    ) : yearMonths.length > 0 ? (
                        yearMonths.map(month => (
                            <Button
                                key={month}
                                type="button"
                                variant={month === selectedMonth ? 'default' : 'outline'}
                                size="sm"
                                className="shrink-0 rounded-full"
                                onClick={() => setSelectedMonth(month)}
                            >
                                {month === currentYearMonth()
                                    ? t('overview.currentMonth')
                                    : `${parseYearMonth(month).month}${t('overview.monthUnit')}`}
                            </Button>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {t('overview.noDataThisYear')}
                        </p>
                    )}
                </div>
            </section>

            {yearMonths.length === 0 ? (
                <EmptyPanel text={t('overview.noDataThisYear')} />
            ) : debtsLoading ? (
                <div className="glass h-36 animate-pulse rounded-2xl" />
            ) : selectedDebts ? (
                <>
                    <section
                        className="glass-elevated rounded-2xl p-4"
                        data-testid="overview-debt-summary"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs tracking-wider text-muted-foreground uppercase">
                                    {t('overview.totalExpenses')}
                                </p>
                                <p className="mt-1 text-2xl font-bold text-foreground">
                                    {formatCurrency(selectedDebts.totalExpense, currency)}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {selectedDebts.expenseCount} {t('stats.count')}
                                </p>
                            </div>
                            <span
                                className={cn(
                                    'rounded-full px-2.5 py-1 text-xs font-semibold',
                                    statusMeta.className
                                )}
                            >
                                {statusMeta.label}
                            </span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-glass-border pt-4">
                            <div>
                                <p className="text-xs text-muted-foreground">
                                    {t('overview.unsettledAmount')}
                                </p>
                                <p className="mt-1 text-lg font-semibold text-foreground">
                                    {formatCurrency(selectedDebts.totalUnsettled, currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">
                                    {t('overview.pendingCount')}
                                </p>
                                <p className="mt-1 text-lg font-semibold text-foreground">
                                    {t('overview.pendingSettlement', { count: debtCount })}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="glass rounded-2xl p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold text-foreground">
                                {t('overview.debtDetails')}
                            </h2>
                            <Scale className="h-4 w-4 text-brand-primary" />
                        </div>
                        {selectedDebts.simplifiedDebts.length > 0 ? (
                            <div className="space-y-2">
                                {selectedDebts.simplifiedDebts.map((debt, index) => {
                                    const from = debt.fromUser.displayName ?? t('common.unknown')
                                    const to = debt.toUser.displayName ?? t('common.unknown')
                                    const canSettle =
                                        !!currentUserId &&
                                        debt.fromUser.userId === currentUserId
                                    return (
                                        <div
                                            key={`${debt.fromUser.userId}-${debt.toUser.userId}-${index}`}
                                            className="glass-light rounded-xl p-3"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                                                    <span className="truncate font-medium text-foreground">
                                                        {from}
                                                    </span>
                                                    <span>{t('dashboard.owes')}</span>
                                                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate font-medium text-foreground">
                                                        {to}
                                                    </span>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <span className="text-sm font-semibold text-foreground">
                                                        {formatCurrency(debt.amount, currency)}
                                                    </span>
                                                    {canSettle && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="press-feedback h-8 shrink-0 rounded-full border-brand-primary/40 px-3 text-xs font-medium text-brand-primary hover:bg-brand-primary hover:text-white"
                                                            onClick={() => openSettleDrawer(debt)}
                                                        >
                                                            {t('settlement.settle')}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="rounded-xl bg-brand-accent/60 p-4 text-center">
                                <p className="text-sm font-medium text-foreground">
                                    {t('overview.allClear')}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t('overview.allClearDesc')}
                                </p>
                            </div>
                        )}
                    </section>

                    <section className="glass rounded-2xl p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold text-foreground">
                                {t('overview.memberBalances')}
                            </h2>
                            <PieChart className="h-4 w-4 text-brand-primary" />
                        </div>
                        {selectedDebts.netBalances.length > 0 ? (
                            <div className="space-y-2">
                                {selectedDebts.netBalances.map(balance => (
                                    <div
                                        key={balance.userId}
                                        className="flex items-center justify-between rounded-xl border border-glass-border px-3 py-2"
                                    >
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {balance.displayName ?? t('common.unknown')}
                                        </span>
                                        <span
                                            className={cn(
                                                'text-sm font-semibold',
                                                balance.netBalance > 0
                                                    ? 'text-green-600 dark:text-green-400'
                                                    : balance.netBalance < 0
                                                      ? 'text-red-600 dark:text-red-400'
                                                      : 'text-muted-foreground'
                                            )}
                                        >
                                            {formatCurrency(balance.netBalance, currency, {
                                                signed: true
                                            })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="py-4 text-center text-sm text-muted-foreground">
                                {t('overview.noDebtsThisMonth')}
                            </p>
                        )}
                    </section>

                    <section className="glass rounded-2xl p-4">
                        <h2 className="mb-1 text-sm font-semibold text-foreground">
                            {t('overview.settlementRecords')}
                        </h2>
                        <SettlementHistory
                            groupId={groupId}
                            currentUserId={currentUserId}
                            currency={currency}
                            onEdit={openEditDrawer}
                        />
                    </section>
                </>
            ) : (
                <EmptyPanel text={t('overview.noDebtsThisMonth')} />
            )}

            {drawerTarget && (
                <SettlementDrawer
                    open={drawerOpen}
                    onOpenChange={setDrawerOpen}
                    groupId={groupId}
                    toUser={drawerTarget}
                    suggestedAmount={drawerAmount}
                    yearMonth={drawerYearMonth}
                    currency={currency}
                    editSettlementId={editSettlementId}
                    editNotes={editNotes}
                />
            )}
        </div>
    )
}

function debtStatusMeta(
    status: MonthlyDebtStatus,
    t: TFunction
): { label: string; className: string } {
    if (status === 'settled') {
        return {
            label: t('overview.settled'),
            className: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
        }
    }
    if (status === 'partial') {
        return {
            label: t('overview.partiallyUnsettled'),
            className: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
        }
    }
    return {
        label: t('overview.unsettled'),
        className: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
    }
}
