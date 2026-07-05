import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { formatCurrency } from '@/shared/lib/money'
import { currentYearMonth, taipeiDateString } from '@/shared/lib/datetime'
import { useAuthStore } from '@/features/auth/authStore'

// router navigation：mock 掉 useNavigate（本測試不驗證導航）。
let mockToday = '2026-06-03'
let mockCurrentYearMonth = '2026-06'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn()
}))

vi.mock('@/shared/lib/datetime', async () => {
    const actual = await vi.importActual<typeof import('@/shared/lib/datetime')>('@/shared/lib/datetime')
    return {
        ...actual,
        currentYearMonth: () => mockCurrentYearMonth,
        taipeiDateString: () => mockToday
    }
})

const h = vi.hoisted(() => ({
    monthlyReport: vi.fn()
}))

vi.mock('@/features/report/api/useMonthlyReport', () => ({
    useMonthlyReport: (yearMonth: string) => h.monthlyReport(yearMonth)
}))

// supabase：個人預算查詢（user_profiles）回傳 null；其餘 seed 過 cache 不觸發。
// rpc：未 seed 的 simplifiedDebts 查詢兜底回空陣列。
vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: { personal_monthly_budget: null }, error: null }) })
            })
        }),
        rpc: vi.fn(async () => ({ data: [], error: null }))
    }
}))

import DashboardPage from '../DashboardPage'

const GID = '11111111-1111-4111-8111-111111111111'
const OTHER_GID = '22222222-2222-4222-8222-222222222222'
const TODAY = taipeiDateString()
const THIS_MONTH = currentYearMonth()
const previousMonthDate = (): string => {
    const [year, month] = THIS_MONTH.split('-').map(Number)
    const prevMonth = month! === 1 ? 12 : month! - 1
    const prevYear = month! === 1 ? year! - 1 : year!
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}-15`
}

const reportRecord = (yearMonth: string, readAt: string | null) => ({
    row: {
        year_month: yearMonth,
        read_at: readAt
    },
    data: {
        yearMonth,
        personal: { total: 0, expenseCount: 0, byCategory: [] },
        group: { splitTotal: 0, groups: [] },
        mom: { prevTotal: 0, delta: 0, deltaPct: null },
        generatedAt: '2026-06-30T00:00:00Z'
    }
} as any)

const personalExpenses = [
    { id: 'p1', user_id: 'user-1', group_id: null, title: '午餐', amount: 100, category: 'food', icon: 'restaurant', date: TODAY, currency: 'TWD', split_method: null, paid_by: 'user-1', notes: null, is_settled: false, created_at: '', updated_at: '', user: { id: 'user-1', display_name: '我', avatar_url: null } },
    { id: 'p2', user_id: 'user-1', group_id: null, title: '咖啡', amount: 50, category: 'food', icon: 'restaurant', date: TODAY, currency: 'TWD', split_method: null, paid_by: 'user-1', notes: null, is_settled: false, created_at: '', updated_at: '', user: { id: 'user-1', display_name: '我', avatar_url: null } }
] as any

const groupWithDetails = {
    group: { id: GID, name: 'Roomies', description: null, invitation_code: 'X', owner_id: 'user-1', is_active: true, created_at: '', updated_at: '' },
    members: [
        { id: 'm1', group_id: GID, user_id: 'user-1', role: 'owner', is_active: true, joined_at: '', created_at: '' },
        { id: 'm2', group_id: GID, user_id: 'user-2', role: 'member', is_active: true, joined_at: '', created_at: '' }
    ],
    settings: { group_id: GID, monthly_budget: 0, budget_start_day: 1, category_budgets: null, currency: 'TWD', default_split_method: 'equal', simplify_debts: false, created_at: '', updated_at: '' },
    memberCount: 2
} as any

const otherGroupWithDetails = {
    ...groupWithDetails,
    group: { ...groupWithDetails.group, id: OTHER_GID, name: 'Trips' },
    members: groupWithDetails.members.map((member: any) => ({ ...member, group_id: OTHER_GID })),
    settings: { ...groupWithDetails.settings, group_id: OTHER_GID }
} as any

const usdGroupWithDetails = {
    ...otherGroupWithDetails,
    settings: { ...otherGroupWithDetails.settings, group_id: OTHER_GID, currency: 'USD' }
} as any

const groupExpenses = [
    { id: 'g1', user_id: 'user-1', group_id: GID, title: '房租', amount: 300, category: 'home', icon: 'home', date: TODAY, currency: 'TWD', split_method: 'equal', paid_by: 'user-1', notes: null, is_settled: false, created_at: '', updated_at: '', user: { id: 'user-1', display_name: '我', avatar_url: null } }
] as any

const otherGroupExpenses = [
    { ...groupExpenses[0], id: 'g-other', group_id: OTHER_GID, title: '旅費', amount: 600 }
] as any

const simplifiedDebts = [
    { fromUser: { userId: 'user-2', displayName: '室友', avatarUrl: null }, toUser: { userId: 'user-1', displayName: '我', avatarUrl: null }, amount: 150 }
]

function client(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
}

function renderWith(c: QueryClient) {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={c}>{children}</QueryClientProvider>
    )
    render(<DashboardPage />, { wrapper })
}

describe('DashboardPage', () => {
    const setMockDate = (date: string) => {
        mockToday = date
        const [year, month, day] = date.split('-').map((item) => Number(item))
        vi.setSystemTime(new Date(Date.UTC(year, month! - 1, day, 12, 0, 0)))
    }

    beforeAll(async () => {
        await i18nReady
        await i18next.changeLanguage('zh-TW')
        vi.useFakeTimers()
    })

    beforeEach(() => {
        useAuthStore.setState({ status: 'ready', user: { id: 'user-1' } as any, session: null })
        h.monthlyReport.mockClear()
        h.monthlyReport.mockReturnValue({ data: null })
        setMockDate('2026-06-03')
        mockCurrentYearMonth = '2026-06'
    })

    afterAll(() => {
        vi.useRealTimers()
    })

    it('renders monthly report entry card on 1-7 when an unread report exists', () => {
        h.monthlyReport.mockReturnValue({ data: reportRecord('2026-05', null) })
        setMockDate('2026-06-05')
        const c = client()
        c.setQueryData(queryKeys.groups(), [])
        c.setQueryData(queryKeys.expenses(), personalExpenses)
        renderWith(c)

        expect(screen.getByText('上月月報')).toBeTruthy()
        const card = screen.getByText('上月月報').closest('section')
        expect(card?.querySelector('.bg-red-500')).toBeTruthy()
    })

    it('does not show monthly report entry card after day 7 even if report exists', () => {
        h.monthlyReport.mockReturnValue({ data: reportRecord('2026-05', null) })
        setMockDate('2026-06-10')
        const c = client()
        c.setQueryData(queryKeys.groups(), [])
        c.setQueryData(queryKeys.expenses(), personalExpenses)
        renderWith(c)

        expect(screen.queryByText('上月月報')).toBeNull()
    })

    it('does not render monthly report entry card when previous month report is missing', () => {
        h.monthlyReport.mockReturnValue({ data: null })
        setMockDate('2026-06-05')
        const c = client()
        c.setQueryData(queryKeys.groups(), [])
        c.setQueryData(queryKeys.expenses(), personalExpenses)
        renderWith(c)

        expect(screen.queryByText('上月月報')).toBeNull()
    })

    it('personal mode: renders personal spending and personal debt cards from personal expenses plus all group shares', () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails, otherGroupWithDetails])
        c.setQueryData(queryKeys.expenses(), [...personalExpenses, ...groupExpenses, ...otherGroupExpenses])
        c.setQueryData(queryKeys.expenseSplitShares('user-1', 'g-other,g1'), [
            { expense_id: 'g1', amount: 120 },
            { expense_id: 'g-other', amount: 300 }
        ])
        c.setQueryData(queryKeys.balances(GID), [
            { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -80 },
            { userId: 'user-2', displayName: '室友', avatarUrl: null, netBalance: 80 }
        ])
        c.setQueryData(queryKeys.balances(OTHER_GID), [
            { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -40 },
            { userId: 'user-2', displayName: '旅伴', avatarUrl: null, netBalance: 40 }
        ])
        renderWith(c)

        // personal expenses 150 + all current-month group split shares 420
        expect(within(screen.getByTestId('stat-month')).getAllByText(formatCurrency(570, 'TWD')).length).toBeGreaterThan(0)
        expect(
            within(screen.getByTestId('stat-personal-spending')).getByText(formatCurrency(570, 'TWD'))
        ).toBeTruthy()
        // net debt: GID 80 + OTHER_GID 40
        expect(within(screen.getByTestId('stat-personal-debt')).getByText(formatCurrency(120, 'TWD'))).toBeTruthy()

        // 最近支出列
        expect(screen.getByText('午餐')).toBeTruthy()
        expect(screen.getByText('咖啡')).toBeTruthy()
    })

    it('personal mode: keeps cross-group spending, debt, today total and progress ratio bucketed by currency', () => {
        const c = client()
        const usdExpense = {
            ...groupExpenses[0],
            id: 'g-usd',
            group_id: OTHER_GID,
            title: '海外車票',
            amount: 24,
            currency: 'USD'
        }
        c.setQueryData(queryKeys.groups(), [groupWithDetails, usdGroupWithDetails])
        c.setQueryData(queryKeys.expenses(), [...personalExpenses, ...groupExpenses, usdExpense])
        c.setQueryData(queryKeys.expenseSplitShares('user-1', 'g-usd,g1'), [
            { expense_id: 'g1', amount: 120 },
            { expense_id: 'g-usd', amount: 12 }
        ])
        c.setQueryData(queryKeys.balances(GID), [
            { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -80 },
            { userId: 'user-2', displayName: '室友', avatarUrl: null, netBalance: 80 }
        ])
        c.setQueryData(queryKeys.balances(OTHER_GID), [
            { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -12 },
            { userId: 'user-2', displayName: '旅伴', avatarUrl: null, netBalance: 12 }
        ])
        renderWith(c)

        const mixedSpending = `${formatCurrency(270, 'TWD')} / ${formatCurrency(12, 'USD')}`
        const mixedDebt = `${formatCurrency(80, 'TWD')} / ${formatCurrency(12, 'USD')}`
        expect(within(screen.getByTestId('stat-month')).getAllByText(mixedSpending).length).toBeGreaterThan(0)
        expect(within(screen.getByTestId('stat-personal-spending')).getByText(mixedSpending)).toBeTruthy()
        expect(within(screen.getByTestId('stat-personal-debt')).getByText(mixedDebt)).toBeTruthy()
        expect(within(screen.getByTestId('stat-month')).getAllByText(mixedSpending).length).toBe(2)

        const progress = screen.getByTestId('dashboard-hero-progress')
        expect((progress.children[0] as HTMLElement).style.width).toBe('77%')
        expect((progress.children[1] as HTMLElement).style.width).toBe('23%')
        expect(screen.queryByText(formatCurrency(282, 'TWD'))).toBeNull()
        expect(screen.queryByText(formatCurrency(92, 'TWD'))).toBeNull()
    })

    it('group mode: renders the group month total, my split share and the debt summary', () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), groupExpenses)
        c.setQueryData(queryKeys.expenseSplitShares('user-1', 'g1'), [
            { expense_id: 'g1', amount: 120 }
        ])
        c.setQueryData(queryKeys.balances(GID), [
            { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -45 },
            { userId: 'user-2', displayName: '室友', avatarUrl: null, netBalance: 45 }
        ])
        c.setQueryData(queryKeys.simplifiedDebts(GID), simplifiedDebts)
        renderWith(c)
        fireEvent.click(within(screen.getByTestId('scope-chips')).getByText('Roomies'))

        const hero = within(screen.getByTestId('stat-month'))
        expect(hero.getByText(formatCurrency(300, 'TWD'))).toBeTruthy()
        expect(hero.getByText(formatCurrency(120, 'TWD'))).toBeTruthy()
        expect(
            within(screen.getByTestId('stat-personal-spending')).getByText(formatCurrency(120, 'TWD'))
        ).toBeTruthy()
        expect(within(screen.getByTestId('stat-personal-debt')).getByText(formatCurrency(45, 'TWD'))).toBeTruthy()
        // debt 摘要：室友 欠你（toUser === 我）→ 顯示 owesYou 與金額
        expect(screen.getByText('室友')).toBeTruthy()
        expect(screen.getByText(formatCurrency(150, 'TWD'))).toBeTruthy()
        // 群組模式最近支出含「查看全部/結算」動作
        expect(screen.getByText('房租')).toBeTruthy()
        expect(screen.queryByTestId('dashboard-hero-progress')).toBeNull()
    })

    it('group mode: my split share only includes current-month expense ids', () => {
        const c = client()
        const mixedMonthExpenses = [
            { ...groupExpenses[0], id: 'g-current', title: '本月房租', date: TODAY, amount: 300 },
            { ...groupExpenses[0], id: 'g-old', title: '上月房租', date: previousMonthDate(), amount: 900 }
        ] as any
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), mixedMonthExpenses)
        c.setQueryData(queryKeys.expenseSplitShares('user-1', 'g-current'), [
            { expense_id: 'g-current', amount: 120 }
        ])
        c.setQueryData(queryKeys.expenseSplitShares('user-1', 'g-current,g-old'), [
            { expense_id: 'g-current', amount: 120 },
            { expense_id: 'g-old', amount: 879 }
        ])
        c.setQueryData(queryKeys.balances(GID), [])
        c.setQueryData(queryKeys.simplifiedDebts(GID), [])
        renderWith(c)
        fireEvent.click(within(screen.getByTestId('scope-chips')).getByText('Roomies'))

        const hero = within(screen.getByTestId('stat-month'))
        expect(hero.getByText(formatCurrency(300, 'TWD'))).toBeTruthy()
        expect(hero.getByText(formatCurrency(120, 'TWD'))).toBeTruthy()
        expect(hero.queryByText(formatCurrency(999, 'TWD'))).toBeNull()
    })

    it('group mode: personal spending and debt stay limited to the active group', () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails, otherGroupWithDetails])
        c.setQueryData(queryKeys.expenses(), [...groupExpenses, ...otherGroupExpenses])
        c.setQueryData(queryKeys.expenseSplitShares('user-1', 'g1'), [
            { expense_id: 'g1', amount: 120 }
        ])
        c.setQueryData(queryKeys.expenseSplitShares('user-1', 'g-other,g1'), [
            { expense_id: 'g1', amount: 120 },
            { expense_id: 'g-other', amount: 879 }
        ])
        c.setQueryData(queryKeys.balances(GID), [
            { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -45 },
            { userId: 'user-2', displayName: '室友', avatarUrl: null, netBalance: 45 }
        ])
        c.setQueryData(queryKeys.balances(OTHER_GID), [
            { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -900 },
            { userId: 'user-2', displayName: '旅伴', avatarUrl: null, netBalance: 900 }
        ])
        c.setQueryData(queryKeys.simplifiedDebts(GID), [])
        renderWith(c)
        fireEvent.click(within(screen.getByTestId('scope-chips')).getByText('Roomies'))

        expect(
            within(screen.getByTestId('stat-personal-spending')).getByText(formatCurrency(120, 'TWD'))
        ).toBeTruthy()
        expect(within(screen.getByTestId('stat-personal-debt')).getByText(formatCurrency(45, 'TWD'))).toBeTruthy()
        expect(screen.queryByText(formatCurrency(999, 'TWD'))).toBeNull()
        expect(screen.queryByText(formatCurrency(900, 'TWD'))).toBeNull()
    })

    it('personal chip scopes stats to personal expenses only', () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), [...personalExpenses, ...groupExpenses])
        c.setQueryData(queryKeys.expenseSplitShares('user-1', 'g1'), [
            { expense_id: 'g1', amount: 120 }
        ])
        c.setQueryData(queryKeys.balances(GID), [
            { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -80 },
            { userId: 'user-2', displayName: '室友', avatarUrl: null, netBalance: 80 }
        ])
        c.setQueryData(queryKeys.simplifiedDebts(GID), [])
        renderWith(c)
        fireEvent.click(within(screen.getByTestId('scope-chips')).getByText('個人'))

        // 純個人範疇：只計個人費用 150，不含群組份額與欠款。
        expect(
            within(screen.getByTestId('stat-personal-spending')).getByText(formatCurrency(150, 'TWD'))
        ).toBeTruthy()
        expect(
            within(screen.getByTestId('stat-personal-debt')).getByText(formatCurrency(0, 'TWD'))
        ).toBeTruthy()
        expect(screen.getByText('午餐')).toBeTruthy()
        expect(screen.getByText('咖啡')).toBeTruthy()
        expect(screen.queryByText('房租')).toBeNull()
    })
})
