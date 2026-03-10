import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDark, useToggle } from '@vueuse/core'

export const useThemeStore = defineStore('theme', () => {
  // 使用 VueUse 的 useDark
  const isDark = useDark({
    // 使用默認的存儲 key
    storageKey: 'vueuse-color-scheme',
    // 儲存在 localStorage
    storage: localStorage,
    // 默認使用淺色模式，而不是系統偏好
    initialValue: 'light',
    // 添加具體的值設定
    valueDark: 'dark',
    valueLight: 'light'
  })

  // 使用 useToggle 來切換主題
  const toggleDark = useToggle(isDark)

  // 主題名稱
  const themeName = computed(() => isDark.value ? 'dark' : 'light')

  // 初始化主題（可在 App.vue 中調用）
  const initializeTheme = () => {
    // useDark 會自動處理初始化，這裡可以添加額外的初始化邏輯
    console.log('Theme initialized:', themeName.value)
  }

  return {
    isDark,
    toggleDark,
    themeName,
    initializeTheme
  }
})