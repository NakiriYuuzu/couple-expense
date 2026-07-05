import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => {
    type State = Record<string, any>
    const calls: State[] = []
    let resolve: (s: State) => any = () => ({ data: [], error: null })
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            select: (...a: any[]) => { s.select = a; return b },
            eq: (c: string, v: any) => { (s.eq ||= {})[c] = v; return b },
            single: () => { s.single = true; return b },
            update: (v: any) => { s.op = 'update'; s.values = v; return b },
            then: (ok: any, err: any) => {
                calls.push({ ...s })
                return Promise.resolve(resolve(s)).then(ok, err)
            }
        }
        return b
    }
    const supabase = {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
        from: vi.fn((t: string) => makeBuilder(t)),
        rpc
    }
    return { supabase, rpc, calls, setResolve: (fn: (s: State) => any) => { resolve = fn } }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: h.supabase }))

import { useUpdateExpense } from '../useUpdateExpense'

function createWrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

describe('useUpdateExpense（群組費用走原子 RPC + 守恆）', () => {
    beforeEach(() => {
        h.calls.length = 0
        h.rpc.mockReset()
        h.rpc.mockResolvedValue({ data: null, error: null } as never)
        h.setResolve(() => ({ data: [], error: null }))
    })

    it('群組費用呼叫 update_group_expense；splits 不守恆 → RPC RAISE → mutation reject', async () => {
        h.rpc.mockResolvedValue({
            data: null,
            error: { message: 'Split amounts (90) do not sum to expense amount (100)' }
        } as never)

        const { result } = renderHook(() => useUpdateExpense(), { wrapper: createWrapper() })

        await expect(
            result.current.mutateAsync({
                id: 'exp-1',
                groupId: 'gid',
                updates: { amount: 100 },
                splits: [
                    { userId: 'user-1', amount: 50 },
                    { userId: 'user-2', amount: 40 }
                ]
            })
        ).rejects.toMatchObject({ message: expect.stringContaining('do not sum') })

        expect(h.rpc).toHaveBeenCalledWith('update_group_expense', expect.objectContaining({
            p_expense_id: 'exp-1',
            p_updates: { amount: 100 },
            p_splits: [
                { user_id: 'user-1', amount: 50, percentage: null, shares: null },
                { user_id: 'user-2', amount: 40, percentage: null, shares: null }
            ]
        }))
    })

    it('群組費用「只改 metadata」未帶 splits → 撈回現有 splits 補齊送 RPC（審查 B#3 空 splits 陷阱）', async () => {
        const existingSplits = [
            { user_id: 'user-1', amount: 150, percentage: null, shares: null },
            { user_id: 'user-2', amount: 150, percentage: null, shares: null }
        ]
        h.setResolve((s) => {
            if (s.table === 'expense_splits' && s.eq?.expense_id === 'exp-1') {
                return { data: existingSplits, error: null }
            }
            return { data: [], error: null }
        })

        const { result } = renderHook(() => useUpdateExpense(), { wrapper: createWrapper() })

        await result.current.mutateAsync({
            id: 'exp-1',
            groupId: 'gid',
            updates: { notes: '更新備註' } // 未帶 splits
        })

        // 必須帶回現有 splits（而非送 p_splits:[] 清空分帳並 RAISE）
        expect(h.rpc).toHaveBeenCalledWith('update_group_expense', expect.objectContaining({
            p_expense_id: 'exp-1',
            p_updates: { notes: '更新備註' },
            p_splits: [
                { user_id: 'user-1', amount: 150, percentage: null, shares: null },
                { user_id: 'user-2', amount: 150, percentage: null, shares: null }
            ]
        }))
    })

    it('個人費用更新剝除 description（表無此欄），避免 PostgREST 400（審查 A#7/B#7）', async () => {
        h.setResolve(() => ({ data: { id: 'exp-1' }, error: null }))

        const { result } = renderHook(() => useUpdateExpense(), { wrapper: createWrapper() })

        await result.current.mutateAsync({
            id: 'exp-1',
            groupId: null,
            updates: { title: '新標題', description: '不該送達 DB', amount: 200 }
        })

        // 個人路徑不呼叫 RPC
        expect(h.rpc).not.toHaveBeenCalled()
        // .update() 的 payload 必須已剝除 description
        const updateCall = h.calls.find((c) => c.table === 'expenses' && c.op === 'update')
        expect(updateCall).toBeDefined()
        expect(updateCall!.values).not.toHaveProperty('description')
        expect(updateCall!.values).toMatchObject({ title: '新標題', amount: 200 })
    })
})
