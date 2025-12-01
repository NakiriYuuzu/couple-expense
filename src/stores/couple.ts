import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type CoupleRow = Database['public']['Tables']['couples']['Row']
type UserProfileRow = Database['public']['Tables']['user_profiles']['Row']
type CoupleSettingsRow = Database['public']['Tables']['couple_settings']['Row']

// 預算設定介面
export interface CategoryBudgets {
  food: number
  transport: number
  shopping: number
  home: number
  pet: number
  other: number
}

export interface NotificationSettings {
  budget_warning_percentage: number
  daily_summary: boolean
  weekly_report: boolean
  monthly_report: boolean
}

export const useCoupleStore = defineStore('couple', () => {
  // 狀態
  const couple = ref<CoupleRow | null>(null)
  const userProfile = ref<UserProfileRow | null>(null)
  const partnerProfile = ref<UserProfileRow | null>(null)
  const coupleSettings = ref<CoupleSettingsRow | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 計算屬性
  const isInCouple = computed(() => !!couple.value)
  const isOwner = computed(() => userProfile.value?.role === 'owner')
  const hasPartner = computed(() => !!partnerProfile.value)
  // 個人月度預算
  const personalBudget = computed(() => userProfile.value?.personal_monthly_budget ?? null)

  // 獲取用戶資料和情侶信息
  const fetchUserProfile = async () => {
    try {
      loading.value = true
      error.value = null

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        throw new Error('用戶未登入')
      }

      // 獲取用戶資料
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userData.user.id)
        .single()

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError
      }

      userProfile.value = profile

      // 如果用戶有 couple_id，獲取情侶信息
      if (profile?.couple_id) {
        await Promise.all([
          fetchCouple(profile.couple_id),
          fetchPartnerProfile(profile.couple_id, userData.user.id),
          fetchCoupleSettings(profile.couple_id)
        ])
      }

    } catch (err) {
      console.error('獲取用戶資料失敗:', err)
      error.value = err instanceof Error ? err.message : '獲取用戶資料失敗'
    } finally {
      loading.value = false
    }
  }

  // 獲取情侶信息
  const fetchCouple = async (coupleId: string) => {
    const { data, error: coupleError } = await supabase
      .from('couples')
      .select('*')
      .eq('id', coupleId)
      .single()

    if (coupleError) {
      throw coupleError
    }

    couple.value = data
  }

  // 獲取伴侶資料
  const fetchPartnerProfile = async (coupleId: string, currentUserId: string) => {
    const { data, error: partnerError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('couple_id', coupleId)
      .neq('id', currentUserId)
      .maybeSingle()

    if (partnerError) {
      throw partnerError
    }

    partnerProfile.value = data
  }

  // 獲取情侶設定
  const fetchCoupleSettings = async (coupleId: string) => {
    const { data, error: settingsError } = await supabase
      .from('couple_settings')
      .select('*')
      .eq('couple_id', coupleId)
      .single()

    if (settingsError) {
      throw settingsError
    }

    coupleSettings.value = data
  }

  // 創建新的情侶
  const createCouple = async (coupleName: string = '我們的家庭') => {
    try {
      loading.value = true
      error.value = null

      const { data, error: createError } = await supabase
        .rpc('create_couple', { couple_name: coupleName })

      if (createError) {
        throw createError
      }

      // 重新獲取用戶資料
      await fetchUserProfile()

      return data
    } catch (err) {
      console.error('創建情侶失敗:', err)
      error.value = err instanceof Error ? err.message : '創建情侶失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 加入情侶
  const joinCouple = async (invitationCode: string) => {
    try {
      loading.value = true
      error.value = null

      const { data, error: joinError } = await supabase
        .rpc('join_couple', { invitation_code: invitationCode })

      if (joinError) {
        throw joinError
      }

      if (!data) {
        throw new Error('邀請碼無效')
      }

      // 重新獲取用戶資料
      await fetchUserProfile()

      return true
    } catch (err) {
      console.error('加入情侶失敗:', err)
      error.value = err instanceof Error ? err.message : '加入情侶失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 更新情侶設定
  const updateCoupleSettings = async (updates: Partial<{
    monthly_budget: number
    budget_start_day: number
    category_budgets: CategoryBudgets
    currency: 'TWD' | 'USD' | 'EUR' | 'JPY' | 'CNY'
    custom_categories: any[]
    notifications: NotificationSettings
  }>) => {
    try {
      loading.value = true
      error.value = null

      if (!couple.value) {
        throw new Error('尚未加入情侶')
      }

      const { data, error: updateError } = await supabase
        .from('couple_settings')
        .update(updates)
        .eq('couple_id', couple.value.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      coupleSettings.value = data
      return data

    } catch (err) {
      console.error('更新情侶設定失敗:', err)
      error.value = err instanceof Error ? err.message : '更新情侶設定失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 更新用戶資料
  const updateUserProfile = async (updates: Partial<{
    display_name: string
    avatar_url: string
  }>) => {
    try {
      loading.value = true
      error.value = null

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        throw new Error('用戶未登入')
      }

      const { data, error: updateError } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', userData.user.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      userProfile.value = data
      return data

    } catch (err) {
      console.error('更新用戶資料失敗:', err)
      error.value = err instanceof Error ? err.message : '更新用戶資料失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 離開情侶
  const leaveCouple = async () => {
    try {
      loading.value = true
      error.value = null

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        throw new Error('用戶未登入')
      }

      const { error: leaveError } = await supabase
        .from('user_profiles')
        .update({ 
          couple_id: null,
          role: 'member'
        })
        .eq('id', userData.user.id)

      if (leaveError) {
        throw leaveError
      }

      // 清除本地狀態
      couple.value = null
      partnerProfile.value = null
      coupleSettings.value = null

      // 重新獲取用戶資料
      await fetchUserProfile()

    } catch (err) {
      console.error('離開情侶失敗:', err)
      error.value = err instanceof Error ? err.message : '離開情侶失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 獲取類別預算
  const getCategoryBudget = (category: string): number => {
    try {
      if (!coupleSettings.value) return 0
      // 使用 any 類型來避免 TypeScript 深度實例化問題
      const settings: any = coupleSettings.value
      const budgetsJson = settings.category_budgets
      if (!budgetsJson || typeof budgetsJson !== 'object') return 0
      return Number(budgetsJson[category]) || 0
    } catch {
      return 0
    }
  }

  // 更新個人月度預算
  const updatePersonalBudget = async (budget: number | null) => {
    try {
      loading.value = true
      error.value = null

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        throw new Error('用戶未登入')
      }

      const { data, error: updateError } = await supabase
        .from('user_profiles')
        .update({ personal_monthly_budget: budget })
        .eq('id', userData.user.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      userProfile.value = data
      return data

    } catch (err) {
      console.error('更新個人預算失敗:', err)
      error.value = err instanceof Error ? err.message : '更新個人預算失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 清除錯誤
  const clearError = () => {
    error.value = null
  }

  return {
    // 狀態
    couple,
    userProfile,
    partnerProfile,
    coupleSettings,
    loading,
    error,

    // 計算屬性
    isInCouple,
    isOwner,
    hasPartner,
    personalBudget,

    // 方法
    fetchUserProfile,
    createCouple,
    joinCouple,
    updateCoupleSettings,
    updateUserProfile,
    updatePersonalBudget,
    leaveCouple,
    getCategoryBudget,
    clearError
  }
}, {
  persist: false
})