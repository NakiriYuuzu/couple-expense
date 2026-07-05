import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { currentYearMonth, taipeiDateString } from '@/shared/lib/datetime'
import { formatCurrency } from '@/shared/lib/money'
import { useAuthStore } from '@/features/auth/authStore'

// 結算相關 mutation + toast 以 hoisted spy 攔截（沿用 ExpenseDetailPage.spec 的風格），
// 只驗證抽屜/歷史送出的參數契約；資料層 invalidate 由 Phase 4 覆蓋。
const h = vi.hoisted(() => ({
    settleMonthly: { mutateAsync: vi.fn(async () => 'settle-1'), isPending: false },
    updateSettlement: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    deleteSettlement: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    toast: { success: vi.fn(), error: vi.fn() },
    renderTooltip: false,
    tooltipProps: {
        active: true,
        label: '第 1 週',
        payload: [] as any[]
    }
}))

vi.mock('@/features/settlement/api/mutations', () => ({
    useSettleMonthlyDebt: () => h.settleMonthly,
    useUpdateSettlement: () => h.updateSettlement,
    useDeleteSettlement: () => h.deleteSettlement
}))
vi.mock('sonner', () => ({ toast: h.toast }))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn()
}))

vi.mock('recharts', async () => {
    const actual = await vi.importActual<typeof import('recharts')>('recharts')
    const React = await vi.importActual<typeof import('react')>('react')
    const Passthrough = ({ children }: { children?: ReactNode }) => children ?? null
    const NullChild = () => null
    const Tooltip = (props: { content?: (tooltipProps: any) => ReactNode }) => {
        if (!h.renderTooltip || typeof props.content !== 'function') return null
        return props.content(h.tooltipProps)
    }
    const ChartWithTooltip = ({ children }: { children?: ReactNode }) => (
        React.createElement(
            'div',
            null,
            React.Children.toArray(children).filter((child) =>
                React.isValidElement(child) && child.type === Tooltip
            )
        )
    )
    return {
        ...actual,
        ResponsiveContainer: Passthrough,
        AreaChart: ChartWithTooltip,
        PieChart: ChartWithTooltip,
        Area: NullChild,
        CartesianGrid: NullChild,
        Legend: NullChild,
        Pie: NullChild,
        Sector: NullChild,
        XAxis: NullChild,
        YAxis: NullChild,
        Tooltip
    }
})

vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
        from: () => ({
            select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) })
        }),
        rpc: vi.fn(async () => ({ data: [], error: null }))
    }
}))

import OverviewPage from '../OverviewPage'

const GID = '11111111-1111-4111-8111-111111111111'
const TODAY = taipeiDateString()
const THIS_MONTH = currentYearMonth()
const THIS_YEAR = THIS_MONTH.slice(0, 4)
const CURRENT_MONTH_NUMBER = Number(THIS_MONTH.slice(5, 7))

// 位移 'YYYY-MM'（字串月，避免 Date/UTC 分桶漂移）——供歷史月快照測試用。
function shiftMonth(yearMonth: string, delta: number): string {
    const [y, m] = yearMonth.split('-').map(Number)
    const zero = y! * 12 + (m! - 1) + delta
    const ny = Math.floor(zero / 12)
    const nm = ((zero % 12) + 12) % 12 + 1
    return `${ny}-${String(nm).padStart(2, '0')}`
}

const HIST_MONTH = shiftMonth(THIS_MONTH, -1)
const HIST_YEAR = Number(HIST_MONTH.slice(0, 4))
const HIST_MONTH_NUMBER = Number(HIST_MONTH.slice(5, 7))

const groupWithDetails = {
    group: {
        id: GID,
        name: 'Roomies',
        description: null,
        invitation_code: 'X',
        owner_id: 'user-1',
        is_active: true,
        created_at: '',
        updated_at: ''
    },
    members: [
        {
            id: 'm1',
            group_id: GID,
            user_id: 'user-1',
            role: 'owner',
            is_active: true,
            joined_at: '',
            created_at: ''
        },
        {
            id: 'm2',
            group_id: GID,
            user_id: 'user-2',
            role: 'member',
            is_active: true,
            joined_at: '',
            created_at: ''
        }
    ],
    settings: {
        group_id: GID,
        monthly_budget: 0,
        budget_start_day: 1,
        category_budgets: null,
        currency: 'TWD',
        default_split_method: 'equal',
        simplify_debts: false,
        created_at: '',
        updated_at: ''
    },
    memberCount: 2
} as any

const personalExpenses = [
    {
        id: 'p-food',
        user_id: 'user-1',
        group_id: null,
        title: '午餐',
        amount: 100,
        category: 'food',
        icon: 'restaurant',
        date: TODAY,
        currency: 'TWD',
        split_method: null,
        paid_by: 'user-1',
        notes: null,
        is_settled: false,
        created_at: '',
        updated_at: '',
        user: { id: 'user-1', display_name: '我', avatar_url: null }
    },
    {
        id: 'p-pet',
        user_id: 'user-1',
        group_id: null,
        title: '貓砂',
        amount: 50,
        category: 'pet',
        icon: 'heart',
        date: TODAY,
        currency: 'TWD',
        split_method: null,
        paid_by: 'user-1',
        notes: null,
        is_settled: false,
        created_at: '',
        updated_at: '',
        user: { id: 'user-1', display_name: '我', avatar_url: null }
    },
    {
        id: 'g-home',
        user_id: 'user-1',
        group_id: GID,
        title: '房租',
        amount: 900,
        category: 'home',
        icon: 'home',
        date: TODAY,
        currency: 'TWD',
        split_method: 'equal',
        paid_by: 'user-1',
        notes: null,
        is_settled: false,
        created_at: '',
        updated_at: '',
        user: { id: 'user-1', display_name: '我', avatar_url: null }
    }
] as any

const groupExpenses = [
    {
        id: 'g-home',
        user_id: 'user-1',
        group_id: GID,
        title: '房租',
        amount: 900,
        category: 'home',
        icon: 'home',
        date: TODAY,
        currency: 'TWD',
        split_method: 'equal',
        paid_by: 'user-1',
        notes: null,
        is_settled: false,
        created_at: '',
        updated_at: '',
        user: { id: 'user-1', display_name: '我', avatar_url: null }
    },
    {
        id: 'g-food',
        user_id: 'user-2',
        group_id: GID,
        title: '晚餐',
        amount: 300,
        category: 'food',
        icon: 'restaurant',
        date: `${THIS_YEAR}-01-15`,
        currency: 'TWD',
        split_method: 'equal',
        paid_by: 'user-2',
        notes: null,
        is_settled: false,
        created_at: '',
        updated_at: '',
        user: { id: 'user-2', display_name: '室友', avatar_url: null }
    },
    {
        id: 'p-food',
        user_id: 'user-1',
        group_id: null,
        title: '個人午餐',
        amount: 100,
        category: 'food',
        icon: 'restaurant',
        date: TODAY,
        currency: 'TWD',
        split_method: null,
        paid_by: 'user-1',
        notes: null,
        is_settled: false,
        created_at: '',
        updated_at: '',
        user: { id: 'user-1', display_name: '我', avatar_url: null }
    }
] as any

const monthDebts = {
    id: null,
    groupId: GID,
    yearMonth: THIS_MONTH,
    netBalances: [
        { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: 300 },
        { userId: 'user-2', displayName: '室友', avatarUrl: null, netBalance: -300 }
    ],
    simplifiedDebts: [
        {
            fromUser: { userId: 'user-2', displayName: '室友', avatarUrl: null },
            toUser: { userId: 'user-1', displayName: '我', avatarUrl: null },
            amount: 300
        }
    ],
    expenseCount: 2,
    totalExpense: 1200,
    totalUnsettled: 300,
    status: 'unsettled'
}

// 當前使用者（user-1）為 debtor 的當月即時債務——用來觸發 debtor-only 結算鈕與抽屜。
const monthDebtsUser1Owes = {
    id: null,
    groupId: GID,
    yearMonth: THIS_MONTH,
    netBalances: [
        { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -300 },
        { userId: 'user-2', displayName: '室友', avatarUrl: null, netBalance: 300 }
    ],
    simplifiedDebts: [
        {
            fromUser: { userId: 'user-1', displayName: '我', avatarUrl: null },
            toUser: { userId: 'user-2', displayName: '室友', avatarUrl: null },
            amount: 300
        }
    ],
    expenseCount: 2,
    totalExpense: 1200,
    totalUnsettled: 300,
    status: 'unsettled'
}

// 結算歷史（paidBy = user-1 → 自己付款，顯示編輯 / 刪除）。
const settlementHistory = [
    {
        id: 'settle-1',
        paidBy: { userId: 'user-1', displayName: '我', avatarUrl: null },
        paidTo: { userId: 'user-2', displayName: '室友', avatarUrl: null },
        amount: 300,
        notes: null,
        settledAt: '2026-06-30T10:00:00Z'
    }
]

// 歷史月快照（值刻意與當月不同，用來確認畫面來自快照而非即時查詢）。
const historicalSnapshot = {
    id: 'snap-1',
    groupId: GID,
    yearMonth: HIST_MONTH,
    netBalances: [
        { userId: 'user-1', displayName: '我', avatarUrl: null, netBalance: -500 },
        { userId: 'user-2', displayName: '室友', avatarUrl: null, netBalance: 500 }
    ],
    simplifiedDebts: [
        {
            fromUser: { userId: 'user-1', displayName: '我', avatarUrl: null },
            toUser: { userId: 'user-2', displayName: '室友', avatarUrl: null },
            amount: 500
        }
    ],
    expenseCount: 4,
    totalExpense: 5000,
    totalUnsettled: 500,
    status: 'unsettled'
}

function client(): QueryClient {
    return new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
    })
}

function renderWith(c: QueryClient) {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={c}>{children}</QueryClientProvider>
    )
    render(<OverviewPage />, { wrapper })
}

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
    if (!window.matchMedia) {
        window.matchMedia = (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as any
    }
    if (!globalThis.ResizeObserver) {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    }
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
})

describe('OverviewPage', () => {
    beforeEach(() => {
        useAuthStore.setState({ status: 'ready', user: { id: 'user-1' } as any, session: null })
        h.settleMonthly.mutateAsync.mockClear()
        h.updateSettlement.mutateAsync.mockClear()
        h.deleteSettlement.mutateAsync.mockClear()
        h.toast.success.mockClear()
        h.toast.error.mockClear()
        h.renderTooltip = false
        h.tooltipProps = {
            active: true,
            label: '第 1 週',
            payload: []
        }
    })

    it('personal statistics render scoped category and trend content', () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), personalExpenses)
        renderWith(c)

        // 預設「全部」範疇 → 切到「個人」chip 才只剩個人費用。
        fireEvent.click(within(screen.getByTestId('scope-chips')).getByText('個人'))

        expect(screen.getByText('統計')).toBeTruthy()
        expect(screen.getByText('月總消費')).toBeTruthy()
        expect(
            within(screen.getByTestId('overview-period-total')).getByText(
                formatCurrency(150, 'TWD')
            )
        ).toBeTruthy()
        expect(screen.getByText('餐飲')).toBeTruthy()
        expect(screen.getByText('寵物')).toBeTruthy()
        expect(screen.queryByText('居家')).toBeNull()
        const chart = screen.getByTestId('overview-trend-chart')
        expect(within(chart).getByTestId('overview-area-food')).toBeTruthy()
        expect(within(chart).getByTestId('overview-area-pet')).toBeTruthy()
        expect(within(chart).queryByTestId('overview-area-home')).toBeNull()
        expect(
            within(screen.getByTestId('overview-trend-list')).getByText(formatCurrency(150, 'TWD'))
        ).toBeTruthy()
    })

    it('documents that negative categories are hidden from layers and tooltip while period totals include them', () => {
        h.renderTooltip = true
        h.tooltipProps = {
            active: true,
            label: '第 1 週',
            payload: [
                { name: '正值提示', value: 100, color: '#22c55e' },
                { name: '負值提示', value: -30, color: '#ef4444' }
            ]
        }
        const c = client()
        c.setQueryData(queryKeys.groups(), [])
        c.setQueryData(queryKeys.expenses(), [
            { ...personalExpenses[0], id: 'positive-food', amount: 100, category: 'food' },
            { ...personalExpenses[1], id: 'negative-pet', amount: -30, category: 'pet' }
        ])
        renderWith(c)

        expect(
            within(screen.getByTestId('overview-period-total')).getByText(
                formatCurrency(70, 'TWD')
            )
        ).toBeTruthy()
        const chart = screen.getByTestId('overview-trend-chart')
        expect(within(chart).getByTestId('overview-area-food')).toBeTruthy()
        expect(within(chart).queryByTestId('overview-area-pet')).toBeNull()
        expect(screen.getAllByText('正值提示').length).toBeGreaterThan(0)
        expect(screen.queryByText('負值提示')).toBeNull()
        expect(screen.queryByText('寵物')).toBeNull()
        expect(
            within(screen.getByTestId('overview-trend-list')).getByText(formatCurrency(70, 'TWD'))
        ).toBeTruthy()
    })

    it('group statistics exclude personal rows and render group categories', () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), groupExpenses)
        renderWith(c)

        // 切到群組 chip → 統計只含該群組費用。
        fireEvent.click(within(screen.getByTestId('scope-chips')).getByText('Roomies'))

        expect(
            within(screen.getByTestId('overview-period-total')).getByText(
                formatCurrency(900, 'TWD')
            )
        ).toBeTruthy()
        expect(screen.getByText('居家')).toBeTruthy()
        expect(screen.queryByText(formatCurrency(1000, 'TWD'))).toBeNull()
        const chart = screen.getByTestId('overview-trend-chart')
        expect(within(chart).getByTestId('overview-area-home')).toBeTruthy()
        expect(within(chart).queryByTestId('overview-area-pet')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: '按年' }))
        expect(screen.getByText('餐飲')).toBeTruthy()
        expect(screen.getByText(`${CURRENT_MONTH_NUMBER} 月`)).toBeTruthy()
    })

    it('debt panel shows no-groups placeholder', () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [])
        c.setQueryData(queryKeys.expenses(), [])
        renderWith(c)

        fireEvent.mouseDown(screen.getByRole('tab', { name: /債務/ }), { button: 0 })
        expect(screen.getByText('尚無群組')).toBeTruthy()
        expect(screen.queryByText('總支出')).toBeNull()
    })

    it('group debt panel shows month summary, simplified debts and net balances', async () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), groupExpenses)
        c.setQueryData(queryKeys.availableMonths(GID), [THIS_MONTH])
        c.setQueryData(queryKeys.monthDebts(GID, THIS_MONTH), monthDebts)
        renderWith(c)

        fireEvent.mouseDown(screen.getByRole('tab', { name: /債務/ }), { button: 0 })
        expect(within(screen.getByTestId('overview-debt-months')).getByText('本月')).toBeTruthy()
        expect(
            within(screen.getByTestId('overview-debt-summary')).getByText(
                formatCurrency(1200, 'TWD')
            )
        ).toBeTruthy()
        expect(
            within(screen.getByTestId('overview-debt-summary')).getByText(
                formatCurrency(300, 'TWD')
            )
        ).toBeTruthy()
        expect(screen.getAllByText('未結清').length).toBeGreaterThan(0)
        expect(screen.getAllByText('室友').length).toBeGreaterThan(0)
        expect(screen.getAllByText('我').length).toBeGreaterThan(0)
        expect(screen.getAllByText(formatCurrency(300, 'TWD')).length).toBeGreaterThan(0)
        expect(screen.getByText(formatCurrency(-300, 'TWD', { signed: true }))).toBeTruthy()
        // placeholder 段（overview.noSnapshotsYet）已由結算歷史區塊取代；無結算資料時顯示空狀態。
        expect(screen.getByText('結算紀錄')).toBeTruthy()
        expect(await screen.findByText('尚無結算記錄')).toBeTruthy()
    })

    it('settle confirm calls settleMonthlyDebt with the selected month, target and amount', async () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), groupExpenses)
        c.setQueryData(queryKeys.availableMonths(GID), [THIS_MONTH])
        c.setQueryData(queryKeys.monthDebts(GID, THIS_MONTH), monthDebtsUser1Owes)
        renderWith(c)

        fireEvent.mouseDown(screen.getByRole('tab', { name: /債務/ }), { button: 0 })

        // debtor（user-1）列出現「結算」鈕；點擊開啟抽屜，確認送出 settleMonthlyDebt。
        fireEvent.click(screen.getByRole('button', { name: '結算' }))
        fireEvent.click(await screen.findByRole('button', { name: '確認還款' }))

        await waitFor(() =>
            expect(h.settleMonthly.mutateAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    groupId: GID,
                    paidTo: 'user-2',
                    amount: 300,
                    yearMonth: THIS_MONTH
                })
            )
        )
    })

    it('settlement history renders items and delete calls deleteSettlement with settlementId + groupId', async () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), groupExpenses)
        c.setQueryData(queryKeys.availableMonths(GID), [THIS_MONTH])
        c.setQueryData(queryKeys.monthDebts(GID, THIS_MONTH), monthDebts)
        c.setQueryData(queryKeys.settlements(GID), settlementHistory)
        renderWith(c)

        fireEvent.mouseDown(screen.getByRole('tab', { name: /債務/ }), { button: 0 })

        const history = screen.getByTestId('overview-settlement-history')
        expect(within(history).getByText(formatCurrency(300, 'TWD'))).toBeTruthy()

        // 開啟刪除確認 → 確認 → deleteSettlement 帶 settlementId + groupId。
        fireEvent.click(within(history).getByRole('button', { name: '刪除' }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: '刪除' }))

        await waitFor(() =>
            expect(h.deleteSettlement.mutateAsync).toHaveBeenCalledWith({
                settlementId: 'settle-1',
                groupId: GID
            })
        )
    })

    it('selecting a historical month renders from the seeded snapshot', async () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), groupExpenses)
        c.setQueryData(queryKeys.availableMonths(GID), [THIS_MONTH])
        c.setQueryData(queryKeys.monthDebts(GID, THIS_MONTH), monthDebts)
        // 只 seed 快照，不 seed 該歷史月的 monthDebts —— 畫面應完全來自快照。
        c.setQueryData(queryKeys.snapshots(GID), [historicalSnapshot])
        renderWith(c)

        fireEvent.mouseDown(screen.getByRole('tab', { name: /債務/ }), { button: 0 })

        if (HIST_YEAR < Number(THIS_YEAR)) {
            fireEvent.click(screen.getByRole('button', { name: 'previous debt year' }))
        } else {
            fireEvent.click(
                within(screen.getByTestId('overview-debt-months')).getByText(
                    `${HIST_MONTH_NUMBER}月`
                )
            )
        }

        const summary = await screen.findByTestId('overview-debt-summary')
        expect(within(summary).getByText(formatCurrency(5000, 'TWD'))).toBeTruthy()
    })

    it('defaults to the all scope: statistics include personal and group expenses together', () => {
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), personalExpenses)
        renderWith(c)

        // 預設「全部」：food 100 + pet 50 + 群組房租 900 = 1050。
        expect(
            within(screen.getByTestId('overview-period-total')).getByText(
                formatCurrency(1050, 'TWD')
            )
        ).toBeTruthy()
        expect(screen.getByText('餐飲')).toBeTruthy()
        expect(screen.getByText('寵物')).toBeTruthy()
        expect(screen.getByText('居家')).toBeTruthy()
    })

    it('empty debt year hides the hero and current-month label, showing the no-data state', () => {
        // 群組今年才建立：只有當年有月份，切到上一年 → 該年無資料。
        const c = client()
        c.setQueryData(queryKeys.groups(), [groupWithDetails])
        c.setQueryData(queryKeys.expenses(), groupExpenses)
        c.setQueryData(queryKeys.availableMonths(GID), [THIS_MONTH])
        c.setQueryData(queryKeys.monthDebts(GID, THIS_MONTH), monthDebts)
        renderWith(c)

        fireEvent.mouseDown(screen.getByRole('tab', { name: /債務/ }), { button: 0 })
        // 當年有資料：hero 與「本月」標籤先出現。
        expect(screen.getByTestId('overview-debt-hero')).toBeTruthy()
        expect(screen.getAllByText('本月').length).toBeGreaterThan(0)

        // 切到沒有月份的上一年：hero 不渲染、不顯示 current-month label、顯示無資料空狀態。
        fireEvent.click(screen.getByRole('button', { name: 'previous debt year' }))
        expect(screen.queryByTestId('overview-debt-hero')).toBeNull()
        expect(screen.queryByText('本月')).toBeNull()
        expect(screen.getAllByText('此年度無資料').length).toBeGreaterThan(0)
    })
})
