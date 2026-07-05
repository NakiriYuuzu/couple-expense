import { taipeiDateString } from '@/shared/lib/datetime'

export function isMonthlyReportEntryDay(todayTaipei: string | Date): boolean {
    const day =
        typeof todayTaipei === 'string'
            ? Number(todayTaipei.split('-')[2])
            : Number(taipeiDateString(todayTaipei).split('-')[2])
    return day >= 1 && day <= 7
}

export function getPreviousMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-')
    const n = Number(month)
    const prevYear = n === 1 ? Number(year) - 1 : Number(year)
    const prevMonth = n === 1 ? 12 : n - 1
    const prevMonthText = String(prevMonth).padStart(2, '0')
    return `${prevYear}-${prevMonthText}`
}

export function shouldShowMonthlyReportEntry(
    todayTaipei: string | Date,
    hasReport: boolean
): {
    show: boolean
    yearMonth: string
} {
    const month =
        typeof todayTaipei === 'string'
            ? todayTaipei.slice(0, 7)
            : taipeiDateString(todayTaipei).slice(0, 7)

    return {
        show: hasReport && isMonthlyReportEntryDay(todayTaipei),
        yearMonth: getPreviousMonth(month)
    }
}
