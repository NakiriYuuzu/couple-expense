import { createI18n } from 'vue-i18n'
import zhTW from './locales/zh-TW'
import en from './locales/en'

// 可用的語言列表
const availableLocales = ['zh-TW', 'en']

// 驗證並獲取有效的語言設定
const getValidLocale = (locale: string | null): string => {
  if (locale && availableLocales.includes(locale)) {
    return locale
  }
  return 'zh-TW' // 預設回到繁體中文
}

// 從 localStorage 獲取保存的語言設定，確保是有效的語言
const savedLocale = getValidLocale(localStorage.getItem('locale'))

// 如果 localStorage 中的值無效，更新為有效值
if (localStorage.getItem('locale') !== savedLocale) {
  localStorage.setItem('locale', savedLocale)
}

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: savedLocale,
  fallbackLocale: 'zh-TW',
  messages: {
    'zh-TW': zhTW,
    'en': en
  },
  silentTranslationWarn: process.env.NODE_ENV === 'production',
  silentFallbackWarn: process.env.NODE_ENV === 'production',
  missingWarn: process.env.NODE_ENV !== 'production',
  fallbackWarn: process.env.NODE_ENV !== 'production'
})

export default i18n