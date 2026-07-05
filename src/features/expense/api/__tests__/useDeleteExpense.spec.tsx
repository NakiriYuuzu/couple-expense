import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => {
    type State = Record<string, any>
    const calls: State[] = []
    let resolve: (s: State) => any = () => ({ data: [], error: null })
    const rpc = vi.fn(async () => ({ data: 'new-exp-id', error: null }))
    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            select: (...a: any[]) => { s.select = a; return b },
            eq: (c: string, v: any) => { (s.eq ||= {})[c] = v; return b },
            in: (c: string, v: any[]) => { s.in = { col: c, vals: v }; return b },
            single: () => { s.single = true; return b },
            delete: () => { s.op = 'delete'; return b },
            insert: (v: any) => { s.op = 'insert'; s.values = v; return b },
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

import { useDeleteExpense } from '../useDeleteExpense'

function createWrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

const splitRows = [
    { id: 's1', expense_id: 'exp-1', user_id: 'user-1', amount: 150, percentage: null, shares: null, is_settled: false, created_at: '' },
    { id: 's2', expense_id: 'exp-1', user_id: 'user-2', amount: 150, percentage: null, shares: null, is_settled: false, created_at: '' }
]

describe('useDeleteExpense + undo（P1-2 孤兒復原）', () => {
    beforeEach(() => {
        h.calls.length = 0
    })

    it('刪除前完整快照；undo 以 add_group_expense 重建含 splits/paid_by/notes/currency', async () => {
        const groupExpense = {
            id: 'exp-1', user_id: 'user-1', group_id: 'gid', title: '晚餐', amount: 300,
            category: 'food', icon: 'restaurant', date: '2026-07-01', currency: 'JPY',
            split_method: 'exact', paid_by: 'user-2', notes: '生日聚餐', is_settled: false,
            created_at: '', updated_at: ''
        }

        h.setResolve((s) => {
            if (s.table === 'expenses' && s.single && s.eq?.id === 'exp-1') return { data: groupExpense, error: null }
            if (s.table === 'expense_splits' && s.eq?.expense_id === 'exp-1') return { data: splitRows, error: null }
            if (s.table === 'expenses' && s.op === 'delete') return { data: null, error: null }
            return { data: [], error: null }
        })

        const { result } = renderHook(() => useDeleteExpense(), { wrapper: createWrapper() })

        let snapshot: any
        await act(async () => {
            snapshot = await result.current.remove.mutateAsync({ expenseId: 'exp-1', groupId: 'gid' })
        })

        // 快照必須含 splits（Vue 版正是丟了這塊）
        expect(snapshot.splits).toHaveLength(2)
        expect(snapshot.expense.paid_by).toBe('user-2')

        await act(async () => {
            await result.current.undo.mutateAsync(snapshot)
        })

        expect(h.rpc).toHaveBeenCalledWith('add_group_expense', expect.objectContaining({
            p_group_id: 'gid',
            p_amount: 300,
            p_currency: 'JPY',
            p_split_method: 'exact',
            p_paid_by: 'user-2',
            p_notes: '生日聚餐',
            p_splits: [
                { user_id: 'user-1', amount: 150, percentage: null, shares: null },
                { user_id: 'user-2', amount: 150, percentage: null, shares: null }
            ]
        }))

        // is_settled=false → 不應有 is_settled 對齊 update（審查 A#1/B#1 的對照組）
        expect(h.calls.some((c) => c.op === 'update')).toBe(false)
    })

    it('undo「已結算」群組費用時，補齊 is_settled 對齊 expense 與 splits（審查 A#1/B#1）', async () => {
        const settledGroupExpense = {
            id: 'exp-1', user_id: 'user-1', group_id: 'gid', title: '晚餐', amount: 300,
            category: 'food', icon: 'restaurant', date: '2026-07-01', currency: 'JPY',
            split_method: 'exact', paid_by: 'user-2', notes: '生日聚餐', is_settled: true,
            created_at: '', updated_at: ''
        }

        h.setResolve((s) => {
            if (s.table === 'expenses' && s.single && s.eq?.id === 'exp-1') return { data: settledGroupExpense, error: null }
            if (s.table === 'expense_splits' && s.op !== 'update' && s.eq?.expense_id === 'exp-1') return { data: splitRows, error: null }
            return { data: null, error: null }
        })

        const { result } = renderHook(() => useDeleteExpense(), { wrapper: createWrapper() })

        let snapshot: any
        await act(async () => {
            snapshot = await result.current.remove.mutateAsync({ expenseId: 'exp-1', groupId: 'gid' })
        })
        expect(snapshot.expense.is_settled).toBe(true)

        h.calls.length = 0
        await act(async () => {
            await result.current.undo.mutateAsync(snapshot)
        })

        // 重建後必須把新列（'new-exp-id'）的 expense 與 splits 對齊回 is_settled=true，
        // 否則已付清的分帳會以未結算狀態復活、誘發二次結算。
        expect(h.calls.some((c) =>
            c.table === 'expenses' && c.op === 'update' &&
            c.values?.is_settled === true && c.eq?.id === 'new-exp-id'
        )).toBe(true)
        expect(h.calls.some((c) =>
            c.table === 'expense_splits' && c.op === 'update' &&
            c.values?.is_settled === true && c.eq?.expense_id === 'new-exp-id'
        )).toBe(true)
    })
})
