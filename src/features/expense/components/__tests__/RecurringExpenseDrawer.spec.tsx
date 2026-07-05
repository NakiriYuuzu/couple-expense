import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { formatCurrency } from '@/shared/lib/money'
import { useSessionStore } from '@/shared/stores/session'
import { RecurringExpenseDrawer } from '../RecurringExpenseDrawer'

vi.mock('@/features/expense/api/recurring', () => ({
    useCreateRecurringExpense: () => ({ mutateAsync: vi.fn(async () => undefined) }),
    useUpdateRecurringExpense: () => ({ mutateAsync: vi.fn(async () => undefined) })
}))

const GID = '11111111-1111-4111-8111-111111111111'
const OTHER_GID = '22222222-2222-4222-8222-222222222222'
const groupWithDetails = {
    group: { id: GID, name: 'Roomies', description: null, invitation_code: 'X', owner_id: 'user-1', is_active: true, created_at: '', updated_at: '' },
    members: [],
    settings: { group_id: GID, monthly_budget: 0, budget_start_day: 1, category_budgets: null, currency: 'USD', default_split_method: 'equal', simplify_debts: false, created_at: '', updated_at: '' },
    memberCount: 1
} as any
const otherGroupWithDetails = {
    group: { id: OTHER_GID, name: 'Travel', description: null, invitation_code: 'Y', owner_id: 'user-1', is_active: true, created_at: '', updated_at: '' },
    members: [],
    settings: { group_id: OTHER_GID, monthly_budget: 0, budget_start_day: 1, category_budgets: null, currency: 'JPY', default_split_method: 'equal', simplify_debts: false, created_at: '', updated_at: '' },
    memberCount: 1
} as any

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
})

beforeEach(() => {
    useSessionStore.setState({ activeGroupId: GID })
})

function renderDrawer(editItem: any = null, options: { seedGroups?: boolean, groups?: any[] } = {}): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
    if (options.seedGroups !== false) {
        client.setQueryData(queryKeys.groups(), options.groups ?? [groupWithDetails, otherGroupWithDetails])
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<RecurringExpenseDrawer open onOpenChange={vi.fn()} editItem={editItem} />, { wrapper })
}

describe('RecurringExpenseDrawer', () => {
    it('uses the active group currency symbol for a new recurring expense in group mode', () => {
        renderDrawer()

        const amount = screen.getByLabelText('金額')
        const twdSymbol = formatCurrency(0, 'TWD').replace(/[\d.,\s]/g, '')
        const usdSymbol = formatCurrency(0, 'USD').replace(/[\d.,\s]/g, '')
        expect(amount.parentElement?.textContent).toContain(usdSymbol)
        expect(amount.parentElement?.textContent).not.toContain(twdSymbol)
    })

    it('keeps create save disabled and shows loading instead of TWD while active group currency is unavailable', () => {
        renderDrawer(null, { seedGroups: false })

        const amount = screen.getByLabelText('金額')
        const twdSymbol = formatCurrency(0, 'TWD').replace(/[\d.,\s]/g, '')
        expect(amount.parentElement?.textContent).toContain('載入中...')
        expect(amount.parentElement?.textContent).not.toContain(twdSymbol)

        fireEvent.change(screen.getByLabelText('費用項目'), { target: { value: '訂閱' } })
        fireEvent.change(amount, { target: { value: '100' } })
        fireEvent.change(screen.getByLabelText('每月幾號'), { target: { value: '5' } })
        expect((screen.getByRole('button', { name: '儲存' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('falls back to personal currency when active group is missing from loaded groups', () => {
        renderDrawer(null, { groups: [otherGroupWithDetails] })

        const amount = screen.getByLabelText('金額')
        const twdSymbol = formatCurrency(0, 'TWD').replace(/[\d.,\s]/g, '')
        expect(amount.parentElement?.textContent).toContain(twdSymbol)
        expect(amount.parentElement?.textContent).not.toContain('載入中...')

        fireEvent.change(screen.getByLabelText('費用項目'), { target: { value: '訂閱' } })
        fireEvent.change(amount, { target: { value: '100' } })
        fireEvent.change(screen.getByLabelText('每月幾號'), { target: { value: '5' } })
        expect((screen.getByRole('button', { name: '儲存' }) as HTMLButtonElement).disabled).toBe(false)
    })

    it('keeps create save disabled and shows loading when active group settings are null', () => {
        renderDrawer(null, { groups: [{ ...groupWithDetails, settings: null }] })

        const amount = screen.getByLabelText('金額')
        const twdSymbol = formatCurrency(0, 'TWD').replace(/[\d.,\s]/g, '')
        expect(amount.parentElement?.textContent).toContain('載入中...')
        expect(amount.parentElement?.textContent).not.toContain(twdSymbol)

        fireEvent.change(screen.getByLabelText('費用項目'), { target: { value: '訂閱' } })
        fireEvent.change(amount, { target: { value: '100' } })
        fireEvent.change(screen.getByLabelText('每月幾號'), { target: { value: '5' } })
        expect((screen.getByRole('button', { name: '儲存' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('uses the edited row group currency symbol even when that group is not active', () => {
        renderDrawer({
            id: 'r-other',
            user_id: 'user-1',
            group_id: OTHER_GID,
            title: 'Other group subscription',
            amount: 900,
            category: 'other',
            recurrence_day: 6,
            next_due_date: '2026-07-06',
            is_active: true,
            notes: null,
            created_at: '',
            updated_at: ''
        })

        const amount = screen.getByLabelText('金額')
        const twdSymbol = formatCurrency(0, 'TWD').replace(/[\d.,\s]/g, '')
        const jpySymbol = formatCurrency(0, 'JPY').replace(/[\d.,\s]/g, '')
        expect(amount.parentElement?.textContent).toContain(jpySymbol)
        expect(amount.parentElement?.textContent).not.toContain(twdSymbol)
    })
})
