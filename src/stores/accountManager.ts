import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

// 儲存的帳號資訊
export interface StoredAccount {
  id: string
  email: string
  name?: string
  avatarUrl?: string
  lastActiveAt: string
  sessionToken?: string // 用於恢復 session
}

export const useAccountManagerStore = defineStore('accountManager', () => {
  // 儲存的帳號列表
  const storedAccounts = ref<StoredAccount[]>([])
  const currentAccountId = ref<string | null>(null)
  const isLoadingAccounts = ref(false)
  
  
  // 當前活躍帳號
  const currentAccount = computed(() => {
    if (!currentAccountId.value) return null
    return storedAccounts.value.find(acc => acc.id === currentAccountId.value) || null
  })
  
  // 初始化：從 localStorage 載入帳號列表
  const initAccountManager = () => {
    const stored = localStorage.getItem('couple-expense-accounts')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        storedAccounts.value = data.accounts || []
        currentAccountId.value = data.currentId || null
      } catch (error) {
        console.error('載入帳號列表失敗:', error)
      }
    }
  }
  
  // 儲存到 localStorage
  const saveToStorage = () => {
    localStorage.setItem('couple-expense-accounts', JSON.stringify({
      accounts: storedAccounts.value,
      currentId: currentAccountId.value
    }))
  }
  
  // 新增或更新帳號
  const addOrUpdateAccount = (user: User) => {
    const existingIndex = storedAccounts.value.findIndex(acc => acc.id === user.id)
    
    const accountInfo: StoredAccount = {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      avatarUrl: user.user_metadata?.avatar_url || '',
      lastActiveAt: new Date().toISOString()
    }
    
    if (existingIndex >= 0) {
      // 更新現有帳號
      storedAccounts.value[existingIndex] = accountInfo
    } else {
      // 新增帳號
      storedAccounts.value.push(accountInfo)
    }
    
    currentAccountId.value = user.id
    saveToStorage()
  }
  
  // 切換帳號（使用 Google OAuth 新增帳號）
  const addNewAccountWithGoogle = async (currentPath?: string) => {
    try {
      isLoadingAccounts.value = true
      
      // 獲取 base path
      const basePath = import.meta.env.VITE_APP_ROUTER_BASE || '/'
      const normalizedBase = basePath === '/' ? '' : basePath
      
      // 構建重導向 URL，使用 startup 頁面 + redirect 參數
      const redirectUrl = currentPath 
        ? `${window.location.origin}${normalizedBase}/?redirect=${encodeURIComponent(currentPath)}`
        : `${window.location.origin}${normalizedBase}/`
      
      // 使用 Google OAuth 登入
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            prompt: 'select_account' // 強制顯示帳號選擇器
          }
        }
      })
      
      if (error) throw error
      
      return { success: true }
    } catch (error) {
      console.error('新增帳號失敗:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '新增帳號失敗' 
      }
    } finally {
      isLoadingAccounts.value = false
    }
  }
  
  // 快速切換到已存在的帳號
  const switchToAccount = async (accountId: string, currentPath?: string) => {
    try {
      isLoadingAccounts.value = true
      
      // 找到目標帳號
      const targetAccount = storedAccounts.value.find(acc => acc.id === accountId)
      if (!targetAccount) {
        throw new Error('找不到指定的帳號')
      }
      
      // 先登出當前帳號
      await supabase.auth.signOut()
      
      // 獲取 base path
      const basePath = import.meta.env.VITE_APP_ROUTER_BASE || '/'
      const normalizedBase = basePath === '/' ? '' : basePath
      
      // 構建重導向 URL，使用 startup 頁面 + redirect 參數
      const redirectUrl = currentPath 
        ? `${window.location.origin}${normalizedBase}/?redirect=${encodeURIComponent(currentPath)}`
        : `${window.location.origin}${normalizedBase}/`
      
      // 由於 Supabase 不支援多 session，需要重新使用 Google OAuth 登入
      // 但可以提示用戶選擇特定的 Google 帳號
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            prompt: 'select_account',
            login_hint: targetAccount.email // 提示要選擇的帳號
          }
        }
      })
      
      if (error) throw error
      
      // 更新當前帳號
      currentAccountId.value = accountId
      
      // 更新最後活躍時間
      const account = storedAccounts.value.find(acc => acc.id === accountId)
      if (account) {
        account.lastActiveAt = new Date().toISOString()
      }
      
      saveToStorage()
      
      return { success: true }
    } catch (error) {
      console.error('切換帳號失敗:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '切換帳號失敗' 
      }
    } finally {
      isLoadingAccounts.value = false
    }
  }
  
  // 移除帳號
  const removeAccount = (accountId: string) => {
    storedAccounts.value = storedAccounts.value.filter(acc => acc.id !== accountId)
    
    // 如果移除的是當前帳號，切換到第一個可用帳號
    if (currentAccountId.value === accountId) {
      currentAccountId.value = storedAccounts.value[0]?.id || null
    }
    
    saveToStorage()
  }
  
  // 清除所有帳號
  const clearAllAccounts = () => {
    storedAccounts.value = []
    currentAccountId.value = null
    localStorage.removeItem('couple-expense-accounts')
  }
  
  // 初始化
  initAccountManager()
  
  return {
    storedAccounts,
    currentAccountId,
    currentAccount,
    isLoadingAccounts,
    addOrUpdateAccount,
    addNewAccountWithGoogle,
    switchToAccount,
    removeAccount,
    clearAllAccounts,
    initAccountManager
  }
}, {
  persist: false // 我們自己管理 localStorage
})