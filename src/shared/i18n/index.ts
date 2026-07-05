import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhTW from './locales/zh-TW'
import en from './locales/en'

// 可用語言列表
export const AVAILABLE_LOCALES = ['zh-TW', 'en'] as const
export type AppLocale = (typeof AVAILABLE_LOCALES)[number]

export const resources = {
    'zh-TW': { translation: zhTW },
    en: { translation: en }
} as const

// react-i18next 初始化。
// interpolation prefix/suffix 設為單一大括號，沿用 Vue 版 locale 的 `{name}` 佔位語法，
// 讓 locale 值保持 verbatim、Phase 5 頁面可直接沿用相同 key 與插值。
export const i18nReady = i18next.use(initReactI18next).init({
    resources,
    lng: 'zh-TW',
    fallbackLng: 'zh-TW',
    interpolation: {
        escapeValue: false,
        prefix: '{',
        suffix: '}'
    }
})

export default i18next
