import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useMarkReportRead } from '../useMarkReportRead'

const h = vi.hoisted(() => {
    type State = Record<string, any>
    let resolve: (s: State) => any = () => ({ data: null, error: null })
    const states: State[] = []
    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            update: (values: any) => {
                s.op = 'update'
                s.values = values
                return b
            },
            eq: (c: string, v: any) => {
                ;(s.eq ||= {})[c] = v
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

const USER_ID = '11111111-1111-4111-8111-111111111111'
const YEAR_MONTH = '2026-06'

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

describe('useMarkReportRead', () => {
    it('只更新 read_at 欄位，並 invalidate monthlyReports prefix', async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
        })
        client.setQueryData(queryKeys.monthlyReports(USER_ID), [])

        const { result } = renderHook(() => useMarkReportRead(), { wrapper: createWrapper(client) })

        await act(async () => {
            await result.current.mutateAsync({ userId: USER_ID, yearMonth: YEAR_MONTH })
        })

        const state = h.states.at(-1)
        expect(state?.table).toBe('monthly_reports')
        expect(state?.op).toBe('update')
        expect(state?.eq).toEqual({ user_id: USER_ID, year_month: YEAR_MONTH })
        expect(Object.keys(state?.values)).toEqual(['read_at'])
        expect(typeof state?.values.read_at).toBe('string')
        expect(Number.isNaN(Date.parse(state?.values.read_at))).toBe(false)

        expect(client.getQueryState(queryKeys.monthlyReports(USER_ID))?.isInvalidated).toBe(true)
    })
})
