import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import i18next, { i18nReady } from '@/shared/i18n'
import { formatCurrency } from '@/shared/lib/money'
import { currentYearMonth } from '@/shared/lib/datetime'
import { CalendarView } from '../CalendarView'
import type { CalendarExpense } from '../CalendarView'

const THIS_MONTH = currentYearMonth()

// 上一個月 'YYYY-MM'（純整數運算，與元件 shiftMonth 同一套邏輯，避免依賴裝置時區）
function prevMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number)
    const index = year * 12 + (month - 1) - 1
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

const PREV_MONTH = prevMonth(THIS_MONTH)

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
})

describe('CalendarView', () => {
    it('renders the current month with a day total for a seeded expense date', () => {
        const expenses: CalendarExpense[] = [
            { id: 'e1', date: `${THIS_MONTH}-08`, amount: 137, title: '午餐', category: 'food' }
        ]
        render(<CalendarView expenses={expenses} currency="TWD" />)

        const grid = screen.getByTestId('calendar-grid')
        expect(within(grid).getByText(formatCurrency(137, 'TWD'))).toBeTruthy()
    })

    it('reveals the day detail when a day with data is selected', () => {
        const expenses: CalendarExpense[] = [
            { id: 'e1', date: `${THIS_MONTH}-08`, amount: 100, title: '午餐', category: 'food' },
            { id: 'e2', date: `${THIS_MONTH}-08`, amount: 37, title: '咖啡', category: 'shopping' }
        ]
        render(<CalendarView expenses={expenses} currency="TWD" />)

        fireEvent.click(screen.getByTestId(`calendar-day-${THIS_MONTH}-08`))

        const detail = screen.getByTestId('calendar-day-detail')
        expect(within(detail).getByText('午餐')).toBeTruthy()
        expect(within(detail).getByText('咖啡')).toBeTruthy()
        // 明細內的當日總計（100 + 37）
        expect(within(detail).getByText(formatCurrency(137, 'TWD'))).toBeTruthy()
    })

    it('shows a previous-month expense total after navigating back', () => {
        const expenses: CalendarExpense[] = [
            { id: 'e1', date: `${PREV_MONTH}-15`, amount: 258, title: '房租', category: 'home' }
        ]
        render(<CalendarView expenses={expenses} currency="TWD" />)

        // 當前月份看不到上個月的費用
        expect(
            within(screen.getByTestId('calendar-grid')).queryByText(formatCurrency(258, 'TWD'))
        ).toBeNull()

        fireEvent.click(screen.getByTestId('calendar-prev'))

        expect(
            within(screen.getByTestId('calendar-grid')).getByText(formatCurrency(258, 'TWD'))
        ).toBeTruthy()
    })

    it('disables next navigation at the current month', () => {
        render(<CalendarView expenses={[]} currency="TWD" />)

        const next = screen.getByTestId('calendar-next') as HTMLButtonElement
        expect(next.disabled).toBe(true)
    })
})
