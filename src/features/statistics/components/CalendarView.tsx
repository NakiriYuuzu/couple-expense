import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { formatCurrency } from '@/shared/lib/money'
import { currentYearMonth, taipeiDateString } from '@/shared/lib/datetime'
import { CategoryUtils } from '@/features/expense/lib/categories'
import type { CurrencyType } from '@/shared/lib/database.types'

// CalendarView（Phase 5.2，對照 Vue CalendarView.vue）。純展示 + 本地狀態的月曆：
// 依 'YYYY-MM-DD' 字串把費用分桶到日格，點擊有資料的日期展開當日明細。
//   - 月份狀態預設 currentYearMonth()（Asia/Taipei 當月），上一/下一月切換，
//     下一月不可越過 Taipei 當月。
//   - 首日星期以 UTC 錨定（Date.UTC(y, m-1, 1).getUTCDay()）計算，與裝置時區無關，
//     不走裝置本地 new Date(dateString) 分桶、不走 toISOString().slice()。
//   - 金額一律走 formatCurrency（不硬編台幣前綴、不裸用 Intl.NumberFormat）。
// 不做任何資料抓取；expenses 由父層（OverviewPage）以作用中 scope 投影後傳入。

// 供月曆使用的最小費用投影（date 為 'YYYY-MM-DD' Taipei 日曆日字串）。
export interface CalendarExpense {
    id: string
    date: string
    amount: number
    title?: string
    category?: string
}

const MONTH_KEYS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
] as const

const pad2 = (n: number): string => String(n).padStart(2, '0')

// 'YYYY-MM' + 位移月數 → 'YYYY-MM'（純整數運算，與 Date / 裝置時區無關）
function shiftMonth(yearMonth: string, delta: number): string {
    const [year, month] = yearMonth.split('-').map(Number)
    const index = year * 12 + (month - 1) + delta
    return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`
}

export function CalendarView({
    expenses,
    currency
}: {
    expenses: readonly CalendarExpense[]
    currency: CurrencyType
}) {
    const { t, i18n } = useTranslation()
    const [month, setMonth] = useState<string>(() => currentYearMonth())
    const [selectedDay, setSelectedDay] = useState<string | null>(null)

    const todayStr = taipeiDateString()
    const isCurrentMonth = month >= currentYearMonth()

    // 依日期分桶（全期間一次），日格與明細共用
    const byDate = useMemo(() => {
        const map = new Map<string, CalendarExpense[]>()
        for (const expense of expenses) {
            const bucket = map.get(expense.date)
            if (bucket) bucket.push(expense)
            else map.set(expense.date, [expense])
        }
        return map
    }, [expenses])

    // 星期表頭：以 UTC 錨定的已知一週（1970-01-04 為週日）+ 目前語系，narrow 顯示。
    // 與裝置時區無關；為星期文字而非金額，未觸 Intl.NumberFormat 禁令。
    const weekdayLabels = useMemo(() => {
        const dtf = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow', timeZone: 'UTC' })
        return Array.from({ length: 7 }, (_, i) => dtf.format(new Date(Date.UTC(1970, 0, 4 + i))))
    }, [i18n.language])

    // 月格：首日星期（UTC 錨定）決定前導空白，補齊尾端空白成 7 的倍數
    const [year, monthNumber] = month.split('-').map(Number)
    const firstDow = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)

    const monthName = t(`stats.months.${MONTH_KEYS[monthNumber - 1]}`)

    const goToMonth = (delta: number) => {
        setMonth((current) => shiftMonth(current, delta))
        setSelectedDay(null)
    }

    const handleDayClick = (dateStr: string) => {
        setSelectedDay((current) => (current === dateStr ? null : dateStr))
    }

    const detailExpenses = selectedDay ? byDate.get(selectedDay) : undefined
    const selectedDayNumber = selectedDay ? Number(selectedDay.slice(8, 10)) : 0
    const selectedTotal = detailExpenses
        ? detailExpenses.reduce((sum, e) => sum + e.amount, 0)
        : 0

    return (
        <div className="animate-fade-up" data-testid="calendar-view">
            <h2 className="mb-4 text-lg font-semibold text-foreground">{t('stats.calendarView')}</h2>

            <div className="glass rounded-2xl p-4">
                {/* 月份切換列 */}
                <div className="mb-4 flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full"
                        aria-label={t(`stats.months.${MONTH_KEYS[(monthNumber + 10) % 12]}`)}
                        data-testid="calendar-prev"
                        onClick={() => goToMonth(-1)}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold text-foreground">
                        {monthName} {year}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full"
                        aria-label={t(`stats.months.${MONTH_KEYS[monthNumber % 12]}`)}
                        data-testid="calendar-next"
                        disabled={isCurrentMonth}
                        onClick={() => goToMonth(1)}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                {/* 星期表頭 */}
                <div className="grid grid-cols-7 gap-1">
                    {weekdayLabels.map((label, i) => (
                        <div key={i} className="py-1 text-center text-xs font-medium text-muted-foreground">
                            {label}
                        </div>
                    ))}
                </div>

                {/* 日期格 */}
                <div className="mt-1 grid grid-cols-7 gap-1" data-testid="calendar-grid">
                    {cells.map((day, index) => {
                        if (day === null) return <div key={`blank-${index}`} className="h-16" />

                        const dateStr = `${month}-${pad2(day)}`
                        const dayExpenses = byDate.get(dateStr)
                        const hasData = dayExpenses !== undefined
                        const total = dayExpenses ? dayExpenses.reduce((sum, e) => sum + e.amount, 0) : 0
                        const isToday = dateStr === todayStr
                        const isSelected = dateStr === selectedDay

                        const base =
                            'flex h-16 flex-col items-center justify-start gap-1 rounded-md border border-glass-border p-1.5 hover-transition'
                        const stateClass = cn(
                            isSelected && 'bg-primary/10 ring-2 ring-primary',
                            !isSelected && isToday && 'ring-1 ring-primary/60',
                            hasData && !isSelected && 'glass-light'
                        )

                        const content = (
                            <>
                                <span className="text-sm font-medium">{day}</span>
                                {hasData && (
                                    <span className="mt-auto max-w-full truncate rounded-sm bg-expense/10 px-1 py-0.5 text-[9px] font-bold leading-none text-expense">
                                        {formatCurrency(total, currency)}
                                    </span>
                                )}
                            </>
                        )

                        if (!hasData) {
                            return (
                                <div
                                    key={dateStr}
                                    data-testid={`calendar-day-${dateStr}`}
                                    className={cn(base, stateClass, 'text-muted-foreground')}
                                >
                                    {content}
                                </div>
                            )
                        }

                        return (
                            <button
                                key={dateStr}
                                type="button"
                                data-testid={`calendar-day-${dateStr}`}
                                className={cn(base, stateClass, 'press-feedback cursor-pointer text-foreground')}
                                onClick={() => handleDayClick(dateStr)}
                            >
                                {content}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* 當日明細 */}
            {detailExpenses && detailExpenses.length > 0 && (
                <div
                    className="glass-light animate-fade-up mt-4 rounded-2xl p-4"
                    data-testid="calendar-day-detail"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-foreground">
                                {monthName} {selectedDayNumber}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {detailExpenses.length} {t('stats.count')}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[11px] text-muted-foreground">{t('stats.totalExpense')}</p>
                            <p className="text-sm font-semibold text-expense">
                                {formatCurrency(selectedTotal, currency)}
                            </p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {detailExpenses.map((expense) => (
                            <div
                                key={expense.id}
                                className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2"
                            >
                                <div className="flex min-w-0 items-center gap-2">
                                    {expense.category && (
                                        <span
                                            className="h-2 w-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: CategoryUtils.getCategoryColor(expense.category) }}
                                        />
                                    )}
                                    {expense.title && (
                                        <span className="truncate text-sm text-card-foreground">{expense.title}</span>
                                    )}
                                </div>
                                <span className="shrink-0 text-sm font-medium text-expense">
                                    {formatCurrency(expense.amount, currency)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
