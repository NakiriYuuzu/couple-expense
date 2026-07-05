import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatCurrency } from '@/shared/lib/money'
import i18next, { i18nReady } from '@/shared/i18n'
import { useAuthStore } from '@/features/auth/authStore'
import type { MonthlyReportRecord } from '@/features/report/api/useMonthlyReport'

const h = vi.hoisted(() => ({
    report: vi.fn(),
    markRead: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
}))

vi.mock('@/features/report/api/useMonthlyReport', () => ({
    useMonthlyReport: () => h.report()
}))

vi.mock('@/features/report/api/useMarkReportRead', () => ({
    useMarkReportRead: () => h.markRead
}))

import MonthlyReportPage from '../MonthlyReportPage'

const YEAR_MONTH = '2026-06'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const baseReportRow = {
    id: 'report-1',
    user_id: USER_ID,
    year_month: YEAR_MONTH,
    read_at: null as string | null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    notified_at: null as string | null,
    data: null as unknown as MonthlyReportRecord['row']['data']
}

const positiveReport: MonthlyReportRecord = {
    row: { ...baseReportRow, read_at: null },
    data: {
        yearMonth: YEAR_MONTH,
        personal: {
            total: 1200,
            expenseCount: 3,
            byCategory: [
                { category: 'food', amount: 800 },
                { category: 'home', amount: 200 },
                { category: 'pet', amount: 200 }
            ] as any
        },
        group: {
            splitTotal: 300,
            groups: [
                {
                    groupId: '111',
                    groupName: '測試群組 A',
                    splitAmount: 200,
                    settledAmount: 120,
                    unsettledAmount: 80
                }
            ]
        },
        mom: {
            prevTotal: 1000,
            delta: 100,
            deltaPct: 10
        },
        generatedAt: '2026-06-30T23:59:59Z'
    }
}

const readReport: MonthlyReportRecord = {
    ...positiveReport,
    row: { ...baseReportRow, read_at: '2026-06-30T23:59:59Z' }
}

const nullDeltaReport: MonthlyReportRecord = {
    ...positiveReport,
    data: {
        ...positiveReport.data,
        mom: {
            prevTotal: 1300,
            delta: 0,
            deltaPct: null
        }
    }
}

const reportWithUnknownCategory: MonthlyReportRecord = {
    ...positiveReport,
    data: {
        ...positiveReport.data,
        personal: {
            ...positiveReport.data.personal,
            byCategory: [...positiveReport.data.personal.byCategory, { category: 'legacy-cat', amount: 200 }]
        }
    }
}

function client() {
    return new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
    })
}

function renderWith(data: { data: MonthlyReportRecord | null | undefined; isLoading: boolean; isError?: boolean }) {
    const q = client()
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={q}>{children}</QueryClientProvider>
    )
    h.report.mockReturnValue({ ...data, isError: data.isError ?? false })
    return render(<MonthlyReportPage yearMonth={YEAR_MONTH} />, { wrapper })
}

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
    if (!window.matchMedia) {
        window.matchMedia = (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false
        }) as any
    }
    if (!globalThis.ResizeObserver) {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        } as any
    }
})

describe('MonthlyReportPage', () => {
    beforeEach(() => {
        h.report.mockClear()
        h.markRead.mutate.mockClear()
        h.markRead.mutateAsync.mockClear()
        useAuthStore.setState({ status: 'ready', user: { id: USER_ID } as any, session: null })
    })

    it('renders loading skeleton while query is pending', () => {
        renderWith({ data: undefined, isLoading: true })
        expect(screen.getByTestId('monthly-report-loading')).toBeTruthy()
    })

    it('renders empty state when report is missing', () => {
        renderWith({ data: null, isLoading: false })
        expect(screen.getByTestId('monthly-report-empty')).toBeTruthy()
    })

    it('renders error state when query fails', () => {
        renderWith({ data: null, isLoading: false, isError: true })
        expect(screen.getByTestId('monthly-report-error')).toBeTruthy()
        expect(screen.getByText('月報載入失敗，請稍後再試')).toBeTruthy()
        expect(screen.queryByTestId('monthly-report-empty')).toBeNull()
    })

    it('renders overview and category data for a report with positive MoM trend', () => {
        renderWith({ data: positiveReport, isLoading: false })

        expect(screen.getByText(formatCurrency(1500, 'TWD'))).toBeTruthy()
        expect(screen.getByText('餐飲')).toBeTruthy()
        expect(screen.getByText(formatCurrency(800, 'TWD'))).toBeTruthy()
        expect(screen.getAllByText(formatCurrency(200, 'TWD')).length).toBeGreaterThan(0)
        expect(screen.getByText('測試群組 A')).toBeTruthy()

        const mom = screen.getByTestId('monthly-report-mom')
        expect(mom.className).toContain('text-red-600')
        expect(mom.className).toContain('dark:text-red-400')
        expect(screen.getByTestId('monthly-report-mom-up')).toBeTruthy()
        expect(screen.queryByTestId('monthly-report-mom-down')).toBeNull()
    })

    it('renders unknown category rows with raw label and other color', () => {
        renderWith({ data: reportWithUnknownCategory, isLoading: false })

        const unknownLabel = screen.getByText('legacy-cat')
        const row = unknownLabel.closest('div.flex')
        const dot = row?.querySelector<HTMLSpanElement>('span[aria-hidden="true"]')

        expect(unknownLabel).toBeTruthy()
        expect(dot?.style.background).toBe('var(--category-other)')
    })

    it('renders a dash when MoM percentage is not available', () => {
        renderWith({ data: nullDeltaReport, isLoading: false })
        expect(screen.getByText('—')).toBeTruthy()
        expect(screen.getByTestId('monthly-report-mom').className).toContain('text-muted-foreground')
        expect(screen.queryByTestId('monthly-report-mom-up')).toBeNull()
        expect(screen.queryByTestId('monthly-report-mom-down')).toBeNull()
    })

    it('fires mark-read once for unread report and ignores re-renders of same report', async () => {
        renderWith({ data: positiveReport, isLoading: false })

        await waitFor(() => expect(h.markRead.mutate).toHaveBeenCalledTimes(1))
        expect(h.markRead.mutate).toHaveBeenCalledWith(
            { userId: USER_ID, yearMonth: YEAR_MONTH },
            expect.objectContaining({ onError: expect.any(Function) })
        )

        h.markRead.mutate.mockClear()
        h.report.mockReturnValue({ data: positiveReport, isLoading: false })
        const renderResult = renderWith({ data: positiveReport, isLoading: false })
        const { rerender } = renderResult
        await waitFor(() => expect(h.markRead.mutate).toHaveBeenCalledTimes(1))
        rerender(<MonthlyReportPage yearMonth={YEAR_MONTH} />)
        expect(h.markRead.mutate).toHaveBeenCalledTimes(1)
    })

    it('does not fire mark-read when report already has read_at', () => {
        renderWith({ data: readReport as MonthlyReportRecord, isLoading: false })
        expect(h.markRead.mutate).not.toHaveBeenCalled()
    })
})
