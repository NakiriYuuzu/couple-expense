import { describe, it, expect, vi } from 'vitest'

// getSession 兜底路徑（authStore.spec.ts 的 mock 讓 getSession 永不 resolve，
// 覆蓋不到這裡）：完全沒有 auth 事件時，兜底必須解除 whenAuthReady 並設定快照，
// 否則 guard 會永久卡 loading。獨立檔案 = 全新 module 實例（vitest 檔案級隔離）。
vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: {
            // 從不觸發任何事件
            onAuthStateChange: vi.fn(() => ({
                data: { subscription: { unsubscribe: vi.fn() } }
            })),
            getSession: vi.fn(() => Promise.resolve({ data: { session: null } }))
        }
    }
}))

import { ensureAuthListener, whenAuthReady, useAuthStore } from '../authStore'

describe('authStore getSession 兜底（無事件時不卡 loading）', () => {
    it('getSession 回傳無 session → ready 解除、快照為未登入', async () => {
        ensureAuthListener()
        await whenAuthReady()

        const snap = useAuthStore.getState()
        expect(snap.status).toBe('ready')
        expect(snap.user).toBeNull()
        expect(snap.session).toBeNull()
    })
})
