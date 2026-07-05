import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18next, { i18nReady } from '@/shared/i18n'
import { formatCurrency } from '@/shared/lib/money'
import { ExpenseGroup } from '../ExpenseGroup'

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
})

describe('ExpenseGroup', () => {
    it('shows per-currency totals when one date group contains mixed currencies', () => {
        render(
            <ExpenseGroup
                date="2026/06/01"
                currency="TWD"
                expenses={[
                    {
                        id: 'tw-1',
                        title: '午餐',
                        amount: formatCurrency(100, 'TWD'),
                        numericAmount: 100,
                        currency: 'TWD',
                        category: 'food',
                        icon: 'restaurant'
                    },
                    {
                        id: 'us-1',
                        title: 'Taxi',
                        amount: formatCurrency(10, 'USD'),
                        numericAmount: 10,
                        currency: 'USD',
                        category: 'transport',
                        icon: 'car'
                    }
                ]}
                onExpenseClick={vi.fn()}
            />
        )

        expect(screen.getByText(`${formatCurrency(100, 'TWD')} / ${formatCurrency(10, 'USD')}`)).toBeTruthy()
        expect(screen.getByText('午餐')).toBeTruthy()
        expect(screen.getByText('Taxi')).toBeTruthy()
    })

    it('shows one total as before when all expenses share the same currency', () => {
        render(
            <ExpenseGroup
                date="2026/06/01"
                currency="TWD"
                expenses={[
                    {
                        id: 'tw-1',
                        title: '午餐',
                        amount: formatCurrency(100, 'TWD'),
                        numericAmount: 100,
                        currency: 'TWD',
                        category: 'food',
                        icon: 'restaurant'
                    },
                    {
                        id: 'tw-2',
                        title: '咖啡',
                        amount: formatCurrency(50, 'TWD'),
                        numericAmount: 50,
                        currency: 'TWD',
                        category: 'food',
                        icon: 'restaurant'
                    }
                ]}
                onExpenseClick={vi.fn()}
            />
        )

        expect(screen.getByText(formatCurrency(150, 'TWD'))).toBeTruthy()
    })

    it('opens the date-group actions from a more menu before showing delete confirmation', async () => {
        render(
            <ExpenseGroup
                date="2026/06/01"
                currency="TWD"
                expenses={[
                    {
                        id: 'tw-1',
                        title: '午餐',
                        amount: formatCurrency(100, 'TWD'),
                        numericAmount: 100,
                        currency: 'TWD',
                        category: 'food',
                        icon: 'restaurant'
                    }
                ]}
                onExpenseClick={vi.fn()}
                onDeleteAll={vi.fn()}
            />
        )

        expect(screen.queryByRole('button', { name: '全部刪除' })).toBeNull()

        fireEvent.pointerDown(screen.getByRole('button', { name: '更多操作' }), { button: 0, ctrlKey: false })
        fireEvent.click(await screen.findByRole('menuitem', { name: /全部刪除/ }))

        expect(await screen.findByRole('dialog')).toBeTruthy()
        expect(screen.getByText('確定要刪除 2026/06/01 的所有費用記錄嗎？此操作無法撤銷。')).toBeTruthy()
    })
})
