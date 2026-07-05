import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { formatCurrency } from '@/shared/lib/money'
import { useSessionStore } from '@/shared/stores/session'
import { RecurringExpenseList } from '../RecurringExpenseList'

const h = vi.hoisted(() => ({
    recurring: [
        {
            id: 'r-group',
            user_id: 'user-1',
            group_id: '11111111-1111-4111-8111-111111111111',
            title: 'Group subscription',
            amount: 12,
            category: 'other',
            recurrence_day: 5,
            next_due_date: '2026-07-05',
            is_active: true,
            notes: null,
            created_at: '',
            updated_at: ''
        },
        {
            id: 'r-other-group',
            user_id: 'user-1',
            group_id: '22222222-2222-4222-8222-222222222222',
            title: 'Other group subscription',
            amount: 900,
            category: 'other',
            recurrence_day: 6,
            next_due_date: '2026-07-06',
            is_active: true,
            notes: null,
            created_at: '',
            updated_at: ''
        },
        {
            id: 'r-personal',
            user_id: 'user-1',
            group_id: null,
            title: 'Personal subscription',
            amount: 500,
            category: 'other',
            recurrence_day: 8,
            next_due_date: '2026-07-08',
            is_active: true,
            notes: null,
            created_at: '',
            updated_at: ''
        }
    ]
}))

vi.mock('@/features/expense/api/recurring', () => ({
    useRecurringExpenses: () => ({ data: h.recurring, isLoading: false }),
    useToggleRecurringExpense: () => ({ mutateAsync: vi.fn(async () => undefined) }),
    useDeleteRecurringExpense: () => ({ mutateAsync: vi.fn(async () => undefined) })
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

function renderList(): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
    client.setQueryData(queryKeys.groups(), [groupWithDetails, otherGroupWithDetails])
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<RecurringExpenseList onEdit={vi.fn()} />, { wrapper })
}

describe('RecurringExpenseList', () => {
    it('formats group recurring expenses with each row group currency and personal ones with TWD', () => {
        renderList()

        expect(screen.getByText('Group subscription')).toBeTruthy()
        expect(screen.getByText(formatCurrency(12, 'USD'))).toBeTruthy()
        expect(screen.getByText('Other group subscription')).toBeTruthy()
        expect(screen.getByText(formatCurrency(900, 'JPY'))).toBeTruthy()
        expect(screen.getByText('Personal subscription')).toBeTruthy()
        expect(screen.getByText(formatCurrency(500, 'TWD'))).toBeTruthy()
    })
})
