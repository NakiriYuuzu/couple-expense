import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { queryKeys } from '@/shared/lib/queryKeys'

// 沿用 useProfileMutations.spec.tsx 的 hoisted builder 模式：不 mock 這幾個 hook 本身，
// 只 mock supabase client，讓真正的 upsert/delete payload 與 conflict 鍵被實際跑到。
const h = vi.hoisted(() => {
    type State = Record<string, any>
    let resolve: (s: State) => any = () => ({ data: null, error: null })
    const states: State[] = []
    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            select: (...a: any[]) => { s.select = a; return b },
            eq: (c: string, v: any) => { (s.eq ||= {})[c] = v; return b },
            upsert: (v: any, opts?: any) => { s.op = 'upsert'; s.values = v; s.upsertOptions = opts; return b },
            delete: () => { s.op = 'delete'; return b },
            then: (ok: any, err: any) => {
                states.push(s)
                return Promise.resolve(resolve(s)).then(ok, err)
            }
        }
        return b
    }
    const supabase = { from: vi.fn((t: string) => makeBuilder(t)) }
    return { supabase, states, setResolve: (fn: (s: State) => any) => { resolve = fn } }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: h.supabase }))
vi.mock('@/features/notification/lib/platform', () => ({ detectDevicePlatform: () => 'web' }))

import { useUpdateNotificationPrefs, useRegisterDevice, useUnregisterDevice } from '../useNotificationMutations'

const USER_ID = '11111111-1111-4111-8111-111111111111'

function createWrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    h.setResolve(() => ({ data: null, error: null }))
    h.supabase.from.mockClear()
    h.states.length = 0
})

describe('useUpdateNotificationPrefs', () => {
    it('只 upsert user_id + notification_prefs 兩欄（onConflict user_id）並寫入 cache', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { result } = renderHook(() => useUpdateNotificationPrefs(), { wrapper: createWrapper(client) })

        const prefs = { split_assigned: false, settlement_received: true, monthly_report: true }
        await act(async () => {
            await result.current.mutateAsync({ userId: USER_ID, prefs })
        })

        const state = h.states.at(-1)
        expect(state?.table).toBe('user_settings')
        expect(state?.op).toBe('upsert')
        expect(state?.values).toEqual({ user_id: USER_ID, notification_prefs: prefs })
        expect(state?.upsertOptions).toEqual({ onConflict: 'user_id' })
        expect(client.getQueryData(queryKeys.notificationPrefs(USER_ID))).toEqual(prefs)
    })
})

describe('useRegisterDevice', () => {
    it('upsert user_devices（onConflict fcm_token）帶入 platform/user_agent/last_seen_at', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { result } = renderHook(() => useRegisterDevice(), { wrapper: createWrapper(client) })

        await act(async () => {
            await result.current.mutateAsync({ userId: USER_ID, token: 'tok_abc' })
        })

        const state = h.states.at(-1)
        expect(state?.table).toBe('user_devices')
        expect(state?.op).toBe('upsert')
        expect(state?.upsertOptions).toEqual({ onConflict: 'fcm_token' })
        expect(state?.values).toMatchObject({ user_id: USER_ID, fcm_token: 'tok_abc', platform: 'web' })
        expect(typeof state?.values.user_agent).toBe('string')
        expect(typeof state?.values.last_seen_at).toBe('string')
        expect(Number.isNaN(Date.parse(state?.values.last_seen_at))).toBe(false)
    })
})

describe('useUnregisterDevice', () => {
    it('依 fcm_token 刪除 user_devices 列', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { result } = renderHook(() => useUnregisterDevice(), { wrapper: createWrapper(client) })

        await act(async () => {
            await result.current.mutateAsync({ token: 'tok_abc' })
        })

        const state = h.states.at(-1)
        expect(state?.table).toBe('user_devices')
        expect(state?.op).toBe('delete')
        expect(state?.eq).toEqual({ fcm_token: 'tok_abc' })
    })
})
