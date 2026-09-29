import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => {
    const single = vi.fn(async () => ({ data: { id: 'personal-expense' }, error: null }))
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ insert }))
    const rpc = vi.fn(async () => ({ data: 'group-expense', error: null as Error | null }))
    const getUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }))
    return { supabase: { auth: { getUser }, from, rpc }, insert }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: h.supabase }))

import { useAddExpense, type CreateExpenseInput } from '../useAddExpense'
import { useSessionStore } from '@/shared/stores/session'

const input: CreateExpenseInput = {
    title: 'Dinner', amount: 100, category: 'food', icon: 'food', date: '2026-09-28'
}

function createHarness() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(() => useAddExpense(), { wrapper })
}

beforeEach(() => {
    vi.clearAllMocks()
    h.supabase.rpc.mockResolvedValue({ data: 'group-expense', error: null })
    useSessionStore.setState({ activeGroupId: null })
})

describe('useAddExpense atomic group path', () => {
    it.each([
        { label: 'missing', splits: undefined },
        { label: 'empty', splits: [] }
    ])('uses the group RPC even without explicit splits ($label)', async ({ splits }) => {
        useSessionStore.setState({ activeGroupId: 'group-1' })
        const { result } = createHarness()
        await act(async () => { await result.current.mutateAsync({ ...input, splits }) })
        expect(h.supabase.rpc).toHaveBeenCalledWith('add_group_expense', expect.objectContaining({
            p_group_id: 'group-1', p_amount: 100, p_paid_by: 'user-1', p_split_method: 'equal',
            p_splits: splits ?? null
        }))
        expect(h.supabase.from).not.toHaveBeenCalled()
    })

    it('does not fall back to a table insert if the RPC rejects the group expense', async () => {
        const error = new Error('Invalid group splits')
        h.supabase.rpc.mockResolvedValueOnce({ data: '', error })
        const { result } = createHarness()
        await act(async () => {
            await expect(result.current.mutateAsync({ ...input, group_id: 'group-1' })).rejects.toBe(error)
        })
        expect(h.supabase.from).not.toHaveBeenCalled()
    })

    it('keeps explicitly personal expenses out of the last-used group', async () => {
        useSessionStore.setState({ activeGroupId: 'group-1' })
        const { result } = createHarness()
        await act(async () => { await result.current.mutateAsync({ ...input, group_id: null }) })
        expect(h.supabase.rpc).not.toHaveBeenCalled()
        expect(h.insert).toHaveBeenCalledWith([expect.objectContaining({ group_id: null, user_id: 'user-1' })])
    })
})
