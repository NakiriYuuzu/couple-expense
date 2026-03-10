import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

export const useLocaleStore = defineStore('locale', () => {
  // 可用的語言選項
  const availableLocales = [
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'en', label: 'English' }
  ]

  // 驗證並獲取有效的語言設定
  const getValidLocale = (locale: string | null): string => {
    if (locale && availableLocales.some(l => l.value === locale)) {
      return locale
    }
    return 'zh-TW' // 預設回到繁體中文
  }

  // 當前語言設定 - 確保是有效的語言
  const currentLocale = ref<string>(getValidLocale(localStorage.getItem('locale')))

  // 切換語言
  const setLocale = (locale: string) => {
    const validLocale = getValidLocale(locale)
    currentLocale.value = validLocale
    // 保存到 localStorage
    localStorage.setItem('locale', validLocale)
    
    // 如果在組件中使用，需要更新 i18n 的語言設定
    // 這將在組件中調用
  }

  // 獲取當前語言的顯示名稱
  const getCurrentLocaleLabel = () => {
    const locale = availableLocales.find(l => l.value === currentLocale.value)
    return locale?.label || '繁體中文'
  }

  return {
    currentLocale,
    availableLocales,
    setLocale,
    getCurrentLocaleLabel
  }
}, {
  persist: true // 使用 pinia-plugin-persistedstate 持久化
})