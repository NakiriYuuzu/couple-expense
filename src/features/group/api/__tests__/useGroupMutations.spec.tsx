import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => {
    type State = Record<string, any>
    let resolve: (s: State) => any = () => ({ data: null, error: null })
    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            select: (...a: any[]) => { s.select = a; return b },
            eq: (c: string, v: any) => { (s.eq ||= {})[c] = v; return b },
            update: (v: any) => { s.op = 'update'; s.values = v; return b },
            single: () => { s.single = true; return b },
            then: (ok: any, err: any) => Promise.resolve(resolve(s)).then(ok, err)
        }
        return b
    }
    const supabase = {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
        from: vi.fn((t: string) => makeBuilder(t)),
        rpc: vi.fn(async () => ({ data: null, error: null }))
    }
    return { supabase, setResolve: (fn: (s: State) => any) => { resolve = fn } }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: h.supabase }))

import { useUpdateGroupSettings } from '../useGroupMutations'
import { useSessionStore } from '@/shared/stores/session'

function createWrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    useSessionStore.getState().setActiveGroup(null)
})

describe('useUpdateGroupSettings（P3：吃參數 groupId 而非全域 activeGroupId）', () => {
    it('以參數 groupId 為 .eq 目標，而非作用中群組', async () => {
        // 全域作用中群組刻意設成另一個，證明不會被挪用
        useSessionStore.getState().setActiveGroup('active-group-999')

        let capturedEq: Record<string, any> | undefined
        h.setResolve((s) => {
            if (s.table === 'group_settings' && s.op === 'update') {
                capturedEq = s.eq
                return { data: { id: 'gs-1', group_id: 'target-group', monthly_budget: 5000 }, error: null }
            }
            return { data: null, error: null }
        })

        const { result } = renderHook(() => useUpdateGroupSettings(), { wrapper: createWrapper() })

        await act(async () => {
            await result.current.mutateAsync({ groupId: 'target-group', patch: { monthly_budget: 5000 } })
        })

        expect(capturedEq?.group_id).toBe('target-group')
        expect(capturedEq?.group_id).not.toBe('active-group-999')
    })
})
