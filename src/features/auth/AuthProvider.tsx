import { useEffect, type ReactNode } from 'react'
import { ensureAuthListener } from './authStore'
import { useUserSettingsSync } from './useUserSettingsSync'
import { useThemeSync } from '@/shared/hooks/useThemeSync'
import { useLanguageSync } from '@/shared/hooks/useLanguageSync'
// 載入 store barrel 以確保 session/ui 的 reset 註冊副作用在 SIGNED_OUT 前就緒
import '@/shared/stores'

// app 層唯一啟動 auth listener 的地方；同時掛載主題/語言套用與 user_settings 雙向同步。
export function AuthProvider({ children }: { children: ReactNode }) {
    useEffect(() => {
        ensureAuthListener()
    }, [])

    useThemeSync()
    useLanguageSync()
    useUserSettingsSync()

    return <>{children}</>
}
