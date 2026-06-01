import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, auth as authHelper } from '@/shared/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import { useAccountManagerStore } from './accountManager'
import { useGroupStore } from '@/features/group/stores/group'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false) // 新增初始化標記

  // 計算屬性：是否已登入
  const isLoggedIn = computed(() => !!user.value)

  // 初始化認證狀態
  const initAuth = async () => {
    try {
      loading.value = true

      // 先註冊監聽，再補抓現有 session（detectSessionInUrl 下 OAuth 回跳的
      // 早期 SIGNED_IN / INITIAL_SESSION 事件才不會在註冊前被漏接）
      supabase.auth.onAuthStateChange((event, sessionData) => {
        console.log('Auth state changed:', event, sessionData)

        session.value = sessionData
        user.value = sessionData?.user || null

        // 更新多帳號管理器（INITIAL_SESSION 也納入，補抓錯過的 SIGNED_IN）
        const accountManager = useAccountManagerStore()
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && sessionData?.user) {
          accountManager.addOrUpdateAccount(sessionData.user)
        }

        if (event === 'SIGNED_OUT') {
          // 集中處理跨 store 清理，避免登出後跨帳號狀態殘留
          error.value = null
          useGroupStore().clearGroupData()
        }
      })

      // 補抓當前會話（若 INITIAL_SESSION 已先行設定，這裡為冪等覆寫）
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session) {
        session.value = sessionData.session
        user.value = sessionData.session.user
      }
    } catch (err) {
      console.error('初始化認證失敗:', err)
      error.value = err instanceof Error ? err.message : '初始化認證失敗'
    } finally {
      loading.value = false
      initialized.value = true // 標記初始化完成
    }
  }

  // 註冊
  const signUp = async (email: string, password: string, metadata?: Record<string, any>) => {
    try {
      loading.value = true
      error.value = null

      const { data, error: signUpError } = await authHelper.signUp(email, password, metadata)
      
      if (signUpError) {
        throw signUpError
      }

      return data
    } catch (err) {
      console.error('註冊失敗:', err)
      error.value = err instanceof Error ? err.message : '註冊失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 登入
  const signIn = async (email: string, password: string) => {
    try {
      loading.value = true
      error.value = null

      const { data, error: signInError } = await authHelper.signIn(email, password)
      
      if (signInError) {
        throw signInError
      }

      return data
    } catch (err) {
      console.error('登入失敗:', err)
      error.value = err instanceof Error ? err.message : '登入失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // Google 登入
  const signInWithGoogle = async () => {
    try {
      loading.value = true
      error.value = null

      const { data, error: signInError } = await authHelper.signInWithGoogle()
      
      if (signInError) {
        throw signInError
      }

      return data
    } catch (err) {
      console.error('Google 登入失敗:', err)
      error.value = err instanceof Error ? err.message : 'Google 登入失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 登出
  const signOut = async () => {
    try {
      loading.value = true
      error.value = null

      const { error: signOutError } = await authHelper.signOut()
      
      if (signOutError) {
        throw signOutError
      }

    } catch (err) {
      console.error('登出失敗:', err)
      error.value = err instanceof Error ? err.message : '登出失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 更新用戶資料
  const updateProfile = async (updates: { 
    email?: string
    password?: string 
    data?: Record<string, any>
  }) => {
    try {
      loading.value = true
      error.value = null

      const { data, error: updateError } = await supabase.auth.updateUser(updates)
      
      if (updateError) {
        throw updateError
      }

      return data
    } catch (err) {
      console.error('更新用戶資料失敗:', err)
      error.value = err instanceof Error ? err.message : '更新用戶資料失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 重設密碼
  const resetPassword = async (email: string) => {
    try {
      loading.value = true
      error.value = null

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      
      if (resetError) {
        throw resetError
      }

    } catch (err) {
      console.error('重設密碼失敗:', err)
      error.value = err instanceof Error ? err.message : '重設密碼失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 清除錯誤
  const clearError = () => {
    error.value = null
  }

  // 暴露 onAuthStateChange 方法給外部使用
  const onAuthStateChange = (callback: (event: string, session: Session | null) => void) => {
    return supabase.auth.onAuthStateChange(callback)
  }

  // 自動初始化
  initAuth()

  return {
    user,
    session,
    loading,
    error,
    initialized,
    isLoggedIn,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    updateProfile,
    resetPassword,
    clearError,
    initAuth,
    onAuthStateChange
  }
}, {
  persist: false // 不持久化，讓 Supabase 處理會話管理
})