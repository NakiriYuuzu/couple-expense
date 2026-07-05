import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useMonthlyReport } from '../useMonthlyReport'

const h = vi.hoisted(() => {
    type State = Record<string, any>
    let resolve: (s: State) => any = () => ({ data: null, error: null })
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
            maybeSingle: () => {
                s.maybeSingle = true
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
const YEAR_MONTH = '2026-06'

const validReportData = {
    yearMonth: '2026-06',
    personal: { total: 12345.5, expenseCount: 31, byCategory: [{ category: 'food', amount: 5000 }] },
    group: {
        splitTotal: 6789,
        groups: [{ groupId: '11111111-1111-4111-8111-111111111112', groupName: '名稱', splitAmount: 3000, settledAmount: 2000, unsettledAmount: 1000 }]
    },
    mom: { prevTotal: 11000, delta: 1345.5, deltaPct: 12.2 },
    generatedAt: '2026-07-01T01:00:00Z'
}

const makeMonthlyReport = (props: Record<string, any>) => ({
    id: '2f5a6c95-c3f5-4c5f-9a42-5ad5e8c5f9f1',
    user_id: USER_ID,
    year_month: YEAR_MONTH,
    data: validReportData,
    read_at: null,
    notified_at: null,
    created_at: '2026-06-30T16:00:00Z',
    ...props
})

function createWrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    h.setResolve(() => ({ data: null, error: null }))
    h.states.length = 0
    h.supabase.from.mockClear()
})

describe('useMonthlyReport', () => {
    it('使用 monthly_report key 並回傳 row + data，data 通過 zod 驗證時', async () => {
        h.setResolve(() => ({ data: makeMonthlyReport({}), error: null }))

        const client = new QueryClient({
            defaultOptions: {
                queries: { retry: false, staleTime: Infinity, gcTime: Infinity }
            }
        })
        const { result } = renderHook(() => useMonthlyReport(YEAR_MONTH), { wrapper: createWrapper(client) })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual({
            row: makeMonthlyReport({}),
            data: validReportData
        })

        const state = h.states.at(-1)
        expect(state?.table).toBe('monthly_reports')
        expect(state?.op).toBe('select')
        expect(state?.eq).toEqual({ user_id: USER_ID, year_month: YEAR_MONTH })
        expect(state?.maybeSingle).toBe(true)
        expect(state?.select).toEqual(['*'])
        const key = queryKeys.monthlyReport(USER_ID, YEAR_MONTH)
        expect(client.getQueryState(key)?.status).toBe('success')
    })

    it('若該月無資料，回傳 null', async () => {
        h.setResolve(() => ({ data: null, error: null }))

        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
        })
        const { result } = renderHook(() => useMonthlyReport(YEAR_MONTH), {
            wrapper: createWrapper(client)
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toBeNull()
        expect(client.getQueryState(queryKeys.monthlyReport(USER_ID, YEAR_MONTH))?.status).toBe('success')
    })

    it('若 data 欄位不符合 zod，查詢會失敗', async () => {
        h.setResolve(() => ({
            data: makeMonthlyReport({ data: { yearMonth: YEAR_MONTH, personal: null } }),
            error: null
        }))

        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
        })
        const { result } = renderHook(() => useMonthlyReport(YEAR_MONTH), {
            wrapper: createWrapper(client)
        })

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.error).toBeInstanceOf(Error)
        expect(client.getQueryState(queryKeys.monthlyReport(USER_ID, YEAR_MONTH))?.status).toBe('error')
    })

    it('允許 byCategory 出現未知 category 字串，仍可正確回傳', async () => {
        h.setResolve(() => ({
            data: makeMonthlyReport({
                data: {
                    ...validReportData,
                    personal: {
                        ...validReportData.personal,
                        byCategory: [{ category: 'legacy-cat', amount: 500 }]
                    }
                }
            }),
            error: null
        }))

        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
        })
        const { result } = renderHook(() => useMonthlyReport(YEAR_MONTH), {
            wrapper: createWrapper(client)
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data?.data.personal.byCategory[0].category).toBe('legacy-cat')
    })
})
