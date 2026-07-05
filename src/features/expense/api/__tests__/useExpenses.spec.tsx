import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// 攔截 supabase：可設定 resolver 依查詢狀態（table / eq / in）回傳。
const h = vi.hoisted(() => {
    type State = Record<string, any>
    let resolve: (s: State) => any = () => ({ data: [], error: null })
    const getUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }))
    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            select: (...a: any[]) => { s.select = a; return b },
            or: (f: string) => { s.or = f; return b },
            eq: (c: string, v: any) => { (s.eq ||= {})[c] = v; return b },
            in: (c: string, v: any[]) => { s.in = { col: c, vals: v }; return b },
            order: () => b,
            single: () => { s.single = true; return b },
            then: (ok: any, err: any) => Promise.resolve(resolve(s)).then(ok, err)
        }
        return b
    }
    const supabase = {
        auth: { getUser },
        from: vi.fn((t: string) => makeBuilder(t)),
        rpc: vi.fn(async () => ({ data: null, error: null }))
    }
    return { supabase, setResolve: (fn: (s: State) => any) => { resolve = fn } }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: h.supabase }))

import { useExpenses } from '../useExpenses'
import { queryKeys } from '@/shared/lib/queryKeys'

const GROUP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const makeRow = (o: Record<string, any>) => ({
    id: 'x', user_id: 'user-1', group_id: null, title: 't', amount: 100, category: 'food',
    icon: null, date: '2026-07-01', currency: 'TWD', split_method: null, paid_by: 'user-1',
    notes: null, is_settled: false, created_at: '', updated_at: '', ...o
})

function createHarness() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return { client, wrapper }
}

describe('useExpenses（全範疇單一查詢）', () => {
    it('單一 select 回傳個人與群組費用（RLS 決定可見範圍），key 為 expenses()', async () => {
        h.setResolve((s) => {
            if (s.table === 'expenses') {
                // 不應帶 or / eq / in 過濾——過濾交給 RLS 與各頁 client 端。
                expect(s.or).toBeUndefined()
                expect(s.eq).toBeUndefined()
                expect(s.in).toBeUndefined()
                return {
                    data: [
                        makeRow({ id: 'g1', group_id: GROUP_A, date: '2026-07-05' }),
                        makeRow({ id: 'p1', date: '2026-07-01' })
                    ],
                    error: null
                }
            }
            return { data: [], error: null }
        })

        const { client, wrapper } = createHarness()
        const { result } = renderHook(() => useExpenses(), { wrapper })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(result.current.data!.map((e) => e.id)).toEqual(['g1', 'p1'])
        // key 斷言：全範疇單一分區
        expect(client.getQueryData(queryKeys.expenses())).toBeTruthy()
        expect(queryKeys.expenses()).toEqual(['expenses', 'all'])
    })

    it('未登入時查詢報錯', async () => {
        h.supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null } as any)
        h.setResolve(() => { throw new Error('查詢不應被觸發') })

        const { wrapper } = createHarness()
        const { result } = renderHook(() => useExpenses(), { wrapper })

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect((result.current.error as Error).message).toContain('用戶未登入')
    })
})
