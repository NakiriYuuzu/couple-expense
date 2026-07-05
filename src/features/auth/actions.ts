import { supabase } from '@/shared/lib/supabase'
import { usePushIntentStore } from '@/features/notification/pushIntentStore'
import { useAccountStore, type StoredAccount } from './accountStore'
import { useAuthStore } from './authStore'

// app 對外的絕對 base URL（origin + 正規化 VITE_APP_ROUTER_BASE，恆以 / 結尾）。
function appBaseUrl(): string {
    const basePath = import.meta.env.VITE_APP_ROUTER_BASE || '/'
    const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '')
    return `${window.location.origin}${normalizedBase}/`
}

// OAuth 回跳 URL 組裝（沿用 Vue 版 accountManager 邏輯）：base + 選配 redirect。
function buildRedirectUrl(redirectPath?: string): string {
    const base = appBaseUrl()
    if (redirectPath) {
        return `${base}?redirect=${encodeURIComponent(redirectPath)}`
    }
    return base
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
}

export async function sendPasswordReset(email: string): Promise<void> {
    // base-aware（GitHub Pages 子路徑部署也正確）。/reset-password 承接頁於 Phase 5 補上
    // （處理 PASSWORD_RECOVERY + updateUser）——已列入 Phase 5 待辦。
    const redirectTo = `${appBaseUrl()}reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw error
}

// loginHint 存在時走 select_account + login_hint（帳號切換用）；否則一般 Google 登入。
export async function signInWithGoogle(redirectPath?: string, loginHint?: string): Promise<void> {
    const queryParams: Record<string, string> = {
        access_type: 'offline',
        prompt: loginHint ? 'select_account' : 'consent'
    }
    if (loginHint) queryParams.login_hint = loginHint

    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: buildRedirectUrl(redirectPath),
            queryParams
        }
    })
    if (error) throw error
}

export async function signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
}

// 切換到已儲存帳號（修 P3）：不先登出，走 OAuth 帶 login_hint 直達目標帳號，
// 由回跳後 authStore 的 SIGNED_IN 完成切換。使用者取消（未回跳）＝維持原登入。
// isSwitching 立即開啟供全屏 loading 態，避免舊帳號資料閃現。
export async function switchToAccount(account: StoredAccount, redirectPath?: string): Promise<void> {
    useAccountStore.getState().setSwitching(true)
    try {
        await signInWithGoogle(redirectPath, account.email)
    } catch (error) {
        useAccountStore.getState().setSwitching(false)
        throw error
    }
}

// 移除已儲存帳號：若移除的是目前登入帳號 → 強制登出（修 currentAccount 脫鉤）。
// 一併清掉該帳號的推播意圖旗標，避免陣列裡累積已不存在於裝置上的帳號殘留項。
export async function removeStoredAccount(id: string): Promise<void> {
    const currentUserId = useAuthStore.getState().user?.id
    if (id === currentUserId) {
        await signOut()
    }
    useAccountStore.getState().removeAccount(id)
    usePushIntentStore.getState().disable(id)
}
