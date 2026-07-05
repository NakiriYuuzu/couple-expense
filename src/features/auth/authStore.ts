import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'
import { queryClient } from '@/shared/lib/queryClient'
import { resetAllStores } from '@/shared/stores/reset'
import { useAccountStore } from './accountStore'

export type AuthStatus = 'loading' | 'ready'

export interface AuthSnapshot {
    status: AuthStatus
    user: User | null
    session: Session | null
}

// 全域認證狀態（不 persist——Supabase 自行管理 session）。
export const useAuthStore = create<AuthSnapshot>(() => ({
    status: 'loading',
    user: null,
    session: null
}))

// 事件驅動的 auth ready（取代 Vue 版 guard 的 100ms 輪詢）：
// 首個 onAuthStateChange 事件或 getSession 回傳即 resolve。
let resolveReady: (() => void) | null = null
const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve
})

export function whenAuthReady(): Promise<void> {
    return readyPromise
}

function markReady(): void {
    if (resolveReady) {
        resolveReady()
        resolveReady = null
    }
}

// app 層唯一的 onAuthStateChange 註冊點（元件一律不得自行註冊——
// 修 Vue 版 StartupPage 的 listener 洩漏）。以 module 級旗標保證即使
// StrictMode 重掛或多次呼叫也只註冊一次。
let started = false

export function ensureAuthListener(): void {
    if (started) return
    started = true

    supabase.auth.onAuthStateChange((event, session) => {
        useAuthStore.setState({
            status: 'ready',
            user: session?.user ?? null,
            session
        })

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
            useAccountStore.getState().addOrUpdateAccount(session.user)
        }

        if (event === 'SIGNED_OUT') {
            // 一處清光：server 快取 + 帳號範疇的 client store
            queryClient.clear()
            resetAllStores()
        }

        markReady()
    })

    // getSession 兜底：detectSessionInUrl 下 INITIAL_SESSION 通常先到；
    // 若尚未 ready 才由此補設，確保沒有事件時也能解除 loading。
    void supabase.auth
        .getSession()
        .then(({ data }) => {
            if (useAuthStore.getState().status === 'loading') {
                useAuthStore.setState({
                    status: 'ready',
                    user: data.session?.user ?? null,
                    session: data.session
                })
            }
            markReady()
        })
        .catch(() => {
            // 取不到 session 也要解除 loading，否則 guard 會永久等待
            markReady()
        })
}
