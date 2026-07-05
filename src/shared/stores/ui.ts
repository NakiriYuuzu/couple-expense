import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppLocale } from '@/shared/i18n'

// 裝置偏好（非帳號範疇）：主題三態 + 語言。persist 於單一 key 'ce-ui'。
// 登入後與 user_settings.theme/language 雙向同步（見 useUserSettingsSync）。
// 注意：登出「不」重設這裡——主題/語言屬裝置偏好，跨帳號保留較符合直覺，
// 且下次登入會由 DB 覆蓋。
export type ThemePref = 'light' | 'dark' | 'system'

interface UiState {
    theme: ThemePref
    language: AppLocale
    setTheme: (theme: ThemePref) => void
    setLanguage: (language: AppLocale) => void
}

export const useUiStore = create<UiState>()(
    persist(
        (set) => ({
            theme: 'system',
            language: 'zh-TW',
            setTheme: (theme) => set({ theme }),
            setLanguage: (language) => set({ language })
        }),
        { name: 'ce-ui' }
    )
)
