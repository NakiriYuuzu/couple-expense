import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { act } from 'react-dom/test-utils'
import { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18next, { i18nReady } from '@/shared/i18n'
import { formatCurrency } from '@/shared/lib/money'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useSessionStore } from '@/shared/stores/session'
import { useAuthStore } from '@/features/auth/authStore'

const h = vi.hoisted(() => ({
    deleteByDate: { mutateAsync: vi.fn(async () => []) }
}))

const TEST_VIRTUAL_ITEM_HEIGHT = 88
const TEST_VIRTUAL_ITEM_WIDTH = 1024
let testWindowScrollTop = 0

function getWindowScrollTop(): number {
    if (Number.isFinite(testWindowScrollTop)) {
        return testWindowScrollTop
    }

    const scrollY = window.scrollY
    if (typeof scrollY === 'number' && Number.isFinite(scrollY)) {
        return scrollY
    }

    return 0
}

function createResizeObserverEntry(target: Element, blockSize: number, inlineSize = TEST_VIRTUAL_ITEM_WIDTH): ResizeObserverEntry {
    return {
        target,
        contentRect: {
            width: inlineSize,
            height: blockSize,
            top: 0,
            right: inlineSize,
            bottom: blockSize,
            left: 0,
            x: 0,
            y: 0,
            toJSON: () => ({
                x: 0,
                y: 0,
                width: inlineSize,
                height: blockSize,
                top: 0,
                right: inlineSize,
                bottom: blockSize,
                left: 0
            })
        } as unknown as DOMRectReadOnly,
        borderBoxSize: [{ inlineSize, blockSize }],
        contentBoxSize: [{ inlineSize, blockSize }],
        devicePixelContentBoxSize: [{ inlineSize, blockSize }]
    } as ResizeObserverEntry
}

function getMockObservedHeight(target: Element): number {
    if (!(target instanceof Element)) return TEST_VIRTUAL_ITEM_HEIGHT
    return TEST_VIRTUAL_ITEM_HEIGHT
}

const DEFAULT_TEST_ITEM_HEIGHT = 88

vi.mock('@tanstack/react-virtual', async () => {
    const actual = await vi.importActual<typeof import('@tanstack/react-virtual')>('@tanstack/react-virtual')

    function useWindowVirtualizerMock(options: {
        count: number
        getItemKey: (index: number) => string
        estimateSize: (index: number) => number
        overscan: number
        gap: number
        initialRect?: { width: number; height: number }
        scrollMargin?: number
    }) {
        const [, setTick] = useState(0)
        const optionsRef = useRef(options)
        const forceUpdate = () => setTick((value) => value + 1)

        optionsRef.current = options

        useEffect(() => {
            const handleScroll = () => forceUpdate()
            window.addEventListener('scroll', handleScroll)
            return () => window.removeEventListener('scroll', handleScroll)
        }, [])

        const count = Math.max(0, optionsRef.current.count)
        const overscan = Math.max(0, optionsRef.current.overscan)
        const gap = Math.max(0, optionsRef.current.gap)
        const viewportHeight = optionsRef.current.initialRect?.height ?? window.innerHeight ?? 768
        const avgItemHeight = Math.max(
            DEFAULT_TEST_ITEM_HEIGHT,
            Math.max(1, optionsRef.current.estimateSize(0) + gap)
        )
        const windowScrollTop = getWindowScrollTop()
        const scrollMargin = 0

        const start = Math.max(
            0,
            Math.min(
                count - 1,
                Math.floor((Math.max(0, windowScrollTop - scrollMargin) / avgItemHeight) - overscan)
            )
        )
        const maxVisible = Math.max(1, Math.ceil(viewportHeight / avgItemHeight))
        const end = Math.max(
            start,
            Math.min(count - 1, start + maxVisible + overscan * 2)
        )

        const getVirtualItems = () => {
            let cursor = 0
            return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => {
                const index = start + i
                const indexSize = optionsRef.current.estimateSize(index)
                const span = Math.max(1, indexSize) + gap
                const item = {
                    key: optionsRef.current.getItemKey(index),
                    index,
                    start: cursor,
                    end: cursor + span
                }
                cursor += span
                return item
            })
        }

        const getTotalSize = () =>
            Array.from({ length: count }, (_, index) => optionsRef.current.estimateSize(index) + (index > 0 ? gap : 0)).reduce(
                (sum, current) => sum + current,
                0
            )

        return {
            options: optionsRef.current,
            getVirtualItems,
            getTotalSize,
            setOptions: (nextOptions: typeof options) => {
                optionsRef.current = nextOptions
                forceUpdate()
            },
            measure: () => {},
            measureElement: () => DEFAULT_TEST_ITEM_HEIGHT
        } as unknown as ReturnType<typeof actual.useWindowVirtualizer>
    }

    return {
        ...actual,
        useWindowVirtualizer: useWindowVirtualizerMock
    }
})

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn()
}))

vi.mock('@/features/expense/api/useDeleteExpense', () => ({
    useDeleteExpense: () => ({ deleteByDate: h.deleteByDate })
}))

vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
        from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) })
    }
}))

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
    // happy-dom 下不穩定的 ResizeObserver 實作會讓 TanStack Virtual 無法量測，造成全量渲染。
    // 在測試環境提供可回報固定尺寸的 observer；真實瀏覽器仍走原生實作，不受影響。
    globalThis.ResizeObserver = class {
        private callback: ResizeObserverCallback
        constructor(callback: ResizeObserverCallback) {
            this.callback = callback
        }
        observe(target: Element): void {
            const entry = createResizeObserverEntry(target, getMockObservedHeight(target))
            this.callback([entry], this as unknown as ResizeObserver)
        }
        unobserve() {}
        disconnect() {}
    }
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})

import ExpensesPage from '../ExpensesPage'

const GID = '11111111-1111-4111-8111-111111111111'

function setWindowScrollTop(scrollTop: number): void {
    const doc = document.documentElement
    const body = document.body
    testWindowScrollTop = scrollTop

    act(() => {
        Object.defineProperty(window, 'scrollY', {
            value: scrollTop,
            writable: true,
            configurable: true
        })

        Object.defineProperty(doc, 'scrollTop', {
            value: scrollTop,
            writable: true,
            configurable: true
        })

        Object.defineProperty(body, 'scrollTop', {
            value: scrollTop,
            writable: true,
            configurable: true
        })

        if (window.scrollTo) {
            window.scrollTo({ top: scrollTop, behavior: 'auto' })
        }

        window.dispatchEvent(new Event('scroll'))
    })
}

const groupWithDetails = {
    group: { id: GID, name: 'Roomies', description: null, invitation_code: 'X', owner_id: 'user-1', is_active: true, created_at: '', updated_at: '' },
    members: [],
    settings: { group_id: GID, monthly_budget: 0, budget_start_day: 1, category_budgets: null, currency: 'TWD', default_split_method: 'equal', simplify_debts: false, created_at: '', updated_at: '' },
    memberCount: 1
} as any

const expenses = [
    { id: 'p1', user_id: 'user-1', group_id: null, title: '午餐', amount: 100, category: 'food', icon: 'restaurant', date: '2026-06-01', currency: 'TWD', split_method: null, paid_by: 'user-1', notes: null, is_settled: false, created_at: '', updated_at: '', user: { id: 'user-1', display_name: '我', avatar_url: null } },
    { id: 'g1', user_id: 'user-1', group_id: GID, title: '房租', amount: 300, category: 'home', icon: 'home', date: '2026-06-01', currency: 'TWD', split_method: 'equal', paid_by: 'user-1', notes: null, is_settled: false, created_at: '', updated_at: '', user: { id: 'user-2', display_name: '室友', avatar_url: null } }
] as any
const pad2 = (value: number): string => String(value).padStart(2, '0')

function currentLocalMonthDate(day: number): string {
    const now = new Date()
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(day)}`
}

function dateLabelPattern(value: string): RegExp {
    const [year, month, day] = value.split('-').map(Number)
    return new RegExp(`${year}年${month}月${day}日`)
}

async function selectDate(label: string, value: string) {
    fireEvent.click(screen.getByRole('button', { name: label }))
    const calendar = await screen.findByRole('grid')
    fireEvent.click(within(calendar).getByRole('button', { name: dateLabelPattern(value) }))
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull())
}

function renderPage(options: { groups?: any[]; expenses?: any[] } = {}): ReturnType<typeof render> {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
    client.setQueryData(queryKeys.groups(), options.groups ?? [groupWithDetails])
    client.setQueryData(queryKeys.expenses(), options.expenses ?? expenses)
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return render(<ExpensesPage />, { wrapper })
}

function buildLargeExpenseList(count: number): any[] {
    const uniqueDays = 30

    return Array.from({ length: count }, (_, index) => ({
        id: `large-${index + 1}`,
        user_id: 'user-1',
        group_id: null,
        title: `Expense ${String(index + 1).padStart(4, '0')}`,
        amount: 100 + (index % 10),
        category: 'food',
        icon: 'restaurant',
        date: `2026-06-${String((index % uniqueDays) + 1).padStart(2, '0')}`,
        currency: 'TWD',
        split_method: null,
        paid_by: 'user-1',
        notes: null,
        is_settled: false,
        created_at: '',
        updated_at: '',
        user: { id: 'user-1', display_name: '我', avatar_url: null }
    }))
}

function getRenderedExpenseRows(container: HTMLElement): number {
    return Array.from(container.querySelectorAll('[data-virtual-item=\"true\"] p.truncate')).filter((el) =>
        /^Expense \d{4}$/.test(el.textContent?.trim() ?? '')
    ).length
}

function getRenderedIndexes(container: HTMLElement): number[] {
    return Array.from(container.querySelectorAll('[data-index]'))
        .map((el) => Number(el.getAttribute('data-index')))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b)
}

function getVirtualState(container: HTMLElement) {
    const items = Array.from(container.querySelectorAll('[data-virtual-item="true"]'))
    const indexes = getRenderedIndexes(container)

    return {
        count: items.length,
        indexes,
        rows: getRenderedExpenseRows(container),
        minIndex: indexes[0],
        maxIndex: indexes[indexes.length - 1]
    }
}

describe('ExpensesPage', () => {
    beforeEach(() => {
        useAuthStore.setState({ status: 'ready', user: { id: 'user-1' } as any, session: null })
        useSessionStore.setState({ activeGroupId: null })
        h.deleteByDate.mutateAsync.mockClear()
        setWindowScrollTop(0)
    })

    it('personal tab (all) shows both personal and group expenses grouped by date', () => {
        renderPage()
        expect(screen.getByText('午餐')).toBeTruthy()
        expect(screen.getByText('房租')).toBeTruthy()
        // 日期分組標題（YYYY/MM/DD）
        expect(screen.getByText('2026/06/01')).toBeTruthy()
    })

    it('same-date totals use each row persisted currency and separate mixed currencies', () => {
        const eurGroup = {
            ...groupWithDetails,
            settings: { ...groupWithDetails.settings, currency: 'EUR' }
        }
        renderPage({
            groups: [eurGroup],
            expenses: [
                { ...expenses[1], id: 'g-twd', title: '台幣房租', amount: 300, currency: 'TWD' },
                { ...expenses[1], id: 'g-usd', title: '美金清潔', amount: 12, currency: 'USD' }
            ]
        })

        expect(screen.getByText('台幣房租')).toBeTruthy()
        expect(screen.getByText('美金清潔')).toBeTruthy()
        expect(screen.getByText(`${formatCurrency(300, 'TWD')} / ${formatCurrency(12, 'USD')}`)).toBeTruthy()
        expect(screen.queryByText(formatCurrency(312, 'EUR'))).toBeNull()
    })

    it('search filters the list by title', () => {
        renderPage()
        const search = screen.getByLabelText('搜尋交易...')
        fireEvent.change(search, { target: { value: '午餐' } })
        expect(screen.getByText('午餐')).toBeTruthy()
        expect(screen.queryByText('房租')).toBeNull()
    })

    it('switching to the group tab shows only group expenses', async () => {
        renderPage()
        // Radix Tabs 以 mouseDown（button 0）切換，而非單純 click
        fireEvent.mouseDown(screen.getByRole('tab', { name: /群組/ }), { button: 0 })
        await waitFor(() => expect(screen.getByText('房租')).toBeTruthy())
        expect(screen.queryByText('午餐')).toBeNull()
    })

    it('opening the filter dialog and toggling a category narrows results', async () => {
        renderPage()
        fireEvent.click(screen.getByRole('button', { name: '篩選條件' }))
        // 篩選 dialog 出現
        expect(await screen.findByText('設定篩選條件來精確查找交易記錄')).toBeTruthy()
        // 只選「居家」類別 → 只剩房租（home），午餐（food）被濾掉
        fireEvent.click(screen.getByRole('button', { name: /居家/ }))
        fireEvent.click(screen.getByRole('button', { name: '套用篩選' }))
        await waitFor(() => expect(screen.queryByText('午餐')).toBeNull())
        expect(screen.getByText('房租')).toBeTruthy()
    })

    it('date range filters update through the date pickers and narrow results', async () => {
        const firstDate = currentLocalMonthDate(1)
        const secondDate = currentLocalMonthDate(2)
        renderPage({
            expenses: [
                { ...expenses[0], date: firstDate },
                { ...expenses[1], date: secondDate }
            ]
        })
        fireEvent.click(screen.getByRole('button', { name: '篩選條件' }))
        const dialog = await screen.findByRole('dialog')
        await selectDate('開始日期', secondDate)
        await selectDate('結束日期', secondDate)
        fireEvent.click(within(dialog).getByRole('button', { name: '套用篩選' }))

        await waitFor(() => expect(screen.queryByText('午餐')).toBeNull())
        expect(screen.getByText('房租')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: '篩選條件' }))
        const amountDialog = await screen.findByRole('dialog')
        fireEvent.change(within(amountDialog).getByLabelText('最低金額'), { target: { value: '999' } })
        fireEvent.click(within(amountDialog).getByRole('button', { name: '套用篩選' }))

        await waitFor(() => expect(screen.queryByText('房租')).toBeNull())
        expect(screen.getByText('沒有找到相關的交易')).toBeTruthy()
    })

    it('batch delete passes affected group ids from all-scope date groups', async () => {
        renderPage()
        fireEvent.pointerDown(screen.getByRole('button', { name: '更多操作' }), { button: 0, ctrlKey: false })
        fireEvent.click(await screen.findByRole('menuitem', { name: /全部刪除/ }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: '確認刪除' }))

        await waitFor(() => expect(h.deleteByDate.mutateAsync).toHaveBeenCalledWith({
            expenseIds: ['p1', 'g1'],
            groupIds: [GID]
        }))
    })

    it('virtualizes a 1000-row expense list and moves render window when scrolling', async () => {
        const groupCount = 30
        const { container, rerender } = renderPage({ expenses: buildLargeExpenseList(1000) })
        expect(await screen.findByText('Expense 0030')).toBeTruthy()

        await waitFor(() => {
            const before = getVirtualState(container)

            expect(before.count).toBeGreaterThan(0)
            expect(before.count).toBeLessThan(groupCount)
            expect(before.indexes.length).toBeGreaterThan(0)
            expect(before.rows).toBeGreaterThan(0)
            expect(before.rows).toBeLessThan(1000)
            expect(before.minIndex).toBeDefined()
        })

        const before = getVirtualState(container)
        const { minIndex: minIndexBefore, count: countBefore } = before

        expect(countBefore).toBeGreaterThan(0)
        expect(countBefore).toBeLessThan(groupCount)

        expect(minIndexBefore).toBeGreaterThanOrEqual(0)

        setWindowScrollTop(50000)
        rerender(<ExpensesPage />)

        await waitFor(() => {
            const after = getVirtualState(container)
            expect(after.count).toBeGreaterThan(0)
            expect(after.count).toBeLessThan(groupCount)
            expect(after.maxIndex).toBeGreaterThanOrEqual(minIndexBefore)
            expect(after.minIndex).toBeGreaterThan(minIndexBefore)
        })

        const countAfter = container.querySelectorAll('[data-virtual-item="true"]').length
        expect(countAfter).toBeGreaterThan(0)
        expect(countAfter).toBeLessThan(groupCount)
    })
})
