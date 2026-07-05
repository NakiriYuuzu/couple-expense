import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryKeys } from '@/shared/lib/queryKeys'

// 沿用 useGroupMutations.spec.tsx 的 hoisted builder 模式：不 mock useProfileMutations 本身，
// 只 mock supabase client，讓真正的 mutation 邏輯（cache 寫入 + invalidate predicate）被實際跑到——
// 這樣 predicate 字串打錯或 ProfileLookup shape 改變時，測試才會炸。
const h = vi.hoisted(() => {
    type State = Record<string, any>
    let resolve: (s: State) => any = () => ({ data: null, error: null })
    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            select: (...a: any[]) => { s.select = a; return b },
            eq: (c: string, v: any) => { (s.eq ||= {})[c] = v; return b },
            update: (v: any) => { s.op = 'update'; s.values = v; return b },
            then: (ok: any, err: any) => Promise.resolve(resolve(s)).then(ok, err)
        }
        return b
    }
    const supabase = {
        auth: { updateUser: vi.fn(async () => ({ data: {}, error: null })) },
        from: vi.fn((t: string) => makeBuilder(t))
    }
    return { supabase, setResolve: (fn: (s: State) => any) => { resolve = fn } }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: h.supabase }))

import { useUpdateDisplayName, useUpdatePersonalBudget } from '../useProfileMutations'

const USER_ID = '11111111-1111-4111-8111-111111111111'

function createWrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    h.setResolve(() => ({ data: null, error: null }))
    h.supabase.from.mockClear()
    h.supabase.auth.updateUser.mockClear()
})

describe('useUpdateDisplayName', () => {
    it('寫入 profiles(userId) cache（保留既有 avatar_url）並 invalidate detailProfiles/member-profiles 快照', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        client.setQueryData(queryKeys.profiles(USER_ID), { display_name: 'Old Name', avatar_url: 'https://x/a.png' })
        client.setQueryData(queryKeys.detailProfiles('a,b'), new Map())
        client.setQueryData(queryKeys.memberProfiles('c,d'), new Map())
        // 不相干的 key 不該被這個 predicate 波及
        client.setQueryData(queryKeys.groups(), [])

        const { result } = renderHook(() => useUpdateDisplayName(), { wrapper: createWrapper(client) })

        await act(async () => {
            await result.current.mutateAsync({ userId: USER_ID, displayName: 'New Name' })
        })

        expect(client.getQueryData(queryKeys.profiles(USER_ID))).toEqual({
            display_name: 'New Name',
            avatar_url: 'https://x/a.png'
        })
        expect(client.getQueryState(queryKeys.detailProfiles('a,b'))?.isInvalidated).toBe(true)
        expect(client.getQueryState(queryKeys.memberProfiles('c,d'))?.isInvalidated).toBe(true)
        expect(client.getQueryState(queryKeys.groups())?.isInvalidated).toBe(false)
    })
})

describe('useUpdatePersonalBudget', () => {
    it('invalidate userProfileBudget(userId)', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        client.setQueryData(queryKeys.userProfileBudget(USER_ID), 3000)

        const { result } = renderHook(() => useUpdatePersonalBudget(), { wrapper: createWrapper(client) })

        await act(async () => {
            await result.current.mutateAsync({ userId: USER_ID, budget: 6000 })
        })

        expect(client.getQueryState(queryKeys.userProfileBudget(USER_ID))?.isInvalidated).toBe(true)
    })
})
