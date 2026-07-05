import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useMonthlyReports } from '../useMonthlyReports'

const h = vi.hoisted(() => {
    type State = Record<string, any>
    let resolve: (s: State) => any = () => ({ data: [], error: null })
    const states: State[] = []
    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            select: (...a: any[]) => {
                s.op = 'select'
                s.select = a
                return b
            },
            eq: (c: string, v: any) => {
                ;(s.eq ||= {})[c] = v
                return b
            },
            order: (column: string, options: any) => {
                s.order = { column, options }
                return b
            },
            then: (ok: any, err: any) => {
                states.push(s)
                return Promise.resolve(resolve(s)).then(ok, err)
            }
        }
        return b
    }

    const supabase = { from: vi.fn((t: string) => makeBuilder(t)) }
    return { states, setResolve: (fn: (s: State) => any) => { resolve = fn }, supabase }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: h.supabase }))
vi.mock('@/features/auth/authStore', () => ({
    useAuthStore: (selector: (state: { user: { id: string } | null }) => unknown) => {
        return selector({ user: { id: USER_ID } })
    }
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const VALID_DATA = {
    yearMonth: '2026-06',
    personal: { total: 12345.5, expenseCount: 31, byCategory: [{ category: 'food', amount: 5000 }] },
    group: {
        splitTotal: 6789,
        groups: [{ groupId: '11111111-1111-4111-8111-111111111112', groupName: '名稱', splitAmount: 3000, settledAmount: 2000, unsettledAmount: 1000 }]
    },
    mom: { prevTotal: 11000, delta: 1345.5, deltaPct: 12.2 },
    generatedAt: '2026-07-01T01:00:00Z'
}

const VALID_DATA_WITH_UNKNOWN = {
    ...VALID_DATA,
    personal: {
        ...VALID_DATA.personal,
        byCategory: [{ category: 'legacy-cat', amount: 700 }]
    }
}

const MALFORMED_DATA = {
    yearMonth: '2026-06',
    personal: null
}

const makeMonthlyReport = (yearMonth: string, data: any) => ({
    id: `${yearMonth}-r1`,
    user_id: USER_ID,
    year_month: yearMonth,
    data,
    read_at: null,
    notified_at: null,
    created_at: '2026-06-30T16:00:00Z'
})

function createWrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    h.setResolve(() => ({ data: [], error: null }))
    h.states.length = 0
    h.supabase.from.mockClear()
})

describe('useMonthlyReports', () => {
    it('使用 monthlyReports key，並回傳有效 data，過濾掉 schema 不符 row', async () => {
        h.setResolve(() => ({
            data: [
                makeMonthlyReport('2026-05', MALFORMED_DATA),
                makeMonthlyReport('2026-06', VALID_DATA_WITH_UNKNOWN)
            ],
            error: null
        }))

        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
        })
        const { result } = renderHook(() => useMonthlyReports(), { wrapper: createWrapper(client) })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.isError).toBe(false)
        expect(result.current.data).toHaveLength(1)
        expect(result.current.data?.[0].row.year_month).toBe('2026-06')
        expect(result.current.data?.[0].data.personal.byCategory).toEqual(VALID_DATA_WITH_UNKNOWN.personal.byCategory)

        const state = h.states.at(-1)
        expect(state?.table).toBe('monthly_reports')
        expect(state?.op).toBe('select')
        expect(state?.select).toEqual(['*'])
        expect(state?.eq).toEqual({ user_id: USER_ID })
        expect(state?.order).toEqual({
            column: 'year_month',
            options: { ascending: false }
        })
        expect(client.getQueryState(queryKeys.monthlyReports(USER_ID))?.status).toBe('success')
    })
})
