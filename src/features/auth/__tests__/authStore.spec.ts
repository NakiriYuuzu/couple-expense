import { describe, it, expect, vi } from 'vitest'

// 攔截 supabase：捕捉 onAuthStateChange callback、getSession 永不 resolve
// （事件路徑成為唯一驅動，避免與兜底路徑競態）
const { listeners } = vi.hoisted(() => ({
    listeners: [] as Array<(event: string, session: unknown) => void>
}))

vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: {
            onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
                listeners.push(cb)
                return { data: { subscription: { unsubscribe: vi.fn() } } }
            }),
            getSession: vi.fn(() => new Promise(() => {}))
        }
    }
}))

import { ensureAuthListener, whenAuthReady, useAuthStore } from '../authStore'
import { useAccountStore } from '../accountStore'
import { useSessionStore } from '@/shared/stores/session'
import { queryClient } from '@/shared/lib/queryClient'

const fakeUser = {
    id: 'user-1',
    email: 'yuuzu@example.com',
    user_metadata: { full_name: 'Yuuzu', avatar_url: 'https://a.example/p.png' }
} as never

describe('authStore（唯一 listener + 事件驅動 ready + 一處清光）', () => {
    it('重複呼叫 ensureAuthListener 只註冊一次 listener（修 Vue 版洩漏）', () => {
        ensureAuthListener()
        ensureAuthListener()
        ensureAuthListener()
        expect(listeners).toHaveLength(1)
    })

    it('INITIAL_SESSION 解除 whenAuthReady、更新快照並登記帳號', async () => {
        const ready = whenAuthReady()
        expect(useAuthStore.getState().status).toBe('loading')

        listeners[0]('INITIAL_SESSION', { user: fakeUser })
        await ready

        const snap = useAuthStore.getState()
        expect(snap.status).toBe('ready')
        expect((snap.user as { id: string }).id).toBe('user-1')

        const accounts = useAccountStore.getState().accounts
        expect(accounts.map((a) => a.id)).toContain('user-1')
        expect(accounts.find((a) => a.id === 'user-1')?.displayName).toBe('Yuuzu')
    })

    it('SIGNED_OUT → queryClient.clear + 帳號範疇 store 全部 reset', () => {
        useSessionStore.getState().setActiveGroup('group-42')
        const clearSpy = vi.spyOn(queryClient, 'clear')

        listeners[0]('SIGNED_OUT', null)

        expect(clearSpy).toHaveBeenCalled()
        expect(useSessionStore.getState().activeGroupId).toBeNull()
        expect(useAuthStore.getState().user).toBeNull()
        expect(useAuthStore.getState().session).toBeNull()
    })
})
