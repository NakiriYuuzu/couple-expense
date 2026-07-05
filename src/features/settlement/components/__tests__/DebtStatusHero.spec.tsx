import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18next, { i18nReady } from '@/shared/i18n'
import { formatCurrency } from '@/shared/lib/money'
import { DebtStatusHero } from '../DebtStatusHero'
import type { MonthlyDebtSnapshot } from '@/entities/settlement/types'

const base: MonthlyDebtSnapshot = {
    id: null,
    groupId: 'g1',
    yearMonth: '2026-06',
    netBalances: [],
    simplifiedDebts: [],
    expenseCount: 0,
    totalExpense: 0,
    totalUnsettled: 0,
    status: 'settled'
}

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
})

describe('DebtStatusHero', () => {
    it('renders the owe state with a settle button that emits the primary debt', () => {
        const debt = {
            fromUser: { userId: 'me', displayName: '我', avatarUrl: null },
            toUser: { userId: 'other', displayName: '室友', avatarUrl: null },
            amount: 300
        }
        const snapshot: MonthlyDebtSnapshot = {
            ...base,
            simplifiedDebts: [debt],
            totalUnsettled: 300,
            status: 'unsettled'
        }
        const onSettle = vi.fn()
        render(
            <DebtStatusHero
                snapshot={snapshot}
                currentUserId="me"
                currency="TWD"
                isLoading={false}
                onSettle={onSettle}
            />
        )

        expect(screen.getByText('你欠 室友')).toBeTruthy()
        expect(screen.getByText(formatCurrency(300, 'TWD'))).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: '立即結算' }))
        expect(onSettle).toHaveBeenCalledWith(debt)
    })

    it('renders the owed state without a settle button', () => {
        const debt = {
            fromUser: { userId: 'other', displayName: '室友', avatarUrl: null },
            toUser: { userId: 'me', displayName: '我', avatarUrl: null },
            amount: 300
        }
        const snapshot: MonthlyDebtSnapshot = {
            ...base,
            simplifiedDebts: [debt],
            totalUnsettled: 300,
            status: 'unsettled'
        }
        render(
            <DebtStatusHero
                snapshot={snapshot}
                currentUserId="me"
                currency="TWD"
                isLoading={false}
                onSettle={vi.fn()}
            />
        )

        expect(screen.getByText('室友 欠你')).toBeTruthy()
        expect(screen.queryByRole('button', { name: '立即結算' })).toBeNull()
    })

    it('renders the all-settled state when nothing is unsettled', () => {
        render(
            <DebtStatusHero
                snapshot={base}
                currentUserId="me"
                currency="TWD"
                isLoading={false}
                onSettle={vi.fn()}
            />
        )
        expect(screen.getByText('全部已結清')).toBeTruthy()
    })
})
