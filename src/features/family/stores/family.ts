import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import type { Json } from '@/shared/lib/database.types'
import type {
    FamilyRow,
    UserProfileRow,
    FamilySettingsRow,
    CategoryBudgets,
    FamilySettingsUpdate
} from '@/entities/family/types'

export type { CategoryBudgets }

export const useFamilyStore = defineStore('family', () => {
    // 狀態
    const family = ref<FamilyRow | null>(null)
    const userProfile = ref<UserProfileRow | null>(null)
    const memberProfiles = ref<UserProfileRow | null>(null)
    const familySettings = ref<FamilySettingsRow | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    // 計算屬性
    const isInFamily = computed(() => !!family.value)
    const isOwner = computed(() => userProfile.value?.role === 'owner')
    const hasMembers = computed(() => !!memberProfiles.value)
    // 個人月度預算
    const personalBudget = computed(() => userProfile.value?.personal_monthly_budget ?? null)

    // 獲取用戶資料和家庭信息
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

            // 如果用戶有 family_id，獲取家庭信息
            if (profile?.family_id) {
                await Promise.all([
                    fetchFamily(profile.family_id),
                    fetchMemberProfiles(profile.family_id, userData.user.id),
                    fetchFamilySettings(profile.family_id)
                ])
            }

        } catch (err) {
            console.error('獲取用戶資料失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取用戶資料失敗'
        } finally {
            loading.value = false
        }
    }

    // 獲取家庭信息
    const fetchFamily = async (familyId: string) => {
        const { data, error: familyError } = await supabase
            .from('families')
            .select('*')
            .eq('id', familyId)
            .single()

        if (familyError) {
            throw familyError
        }

        family.value = data
    }

    // 獲取其他成員資料
    const fetchMemberProfiles = async (familyId: string, currentUserId: string) => {
        const { data, error: memberError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('family_id', familyId)
            .neq('id', currentUserId)
            .maybeSingle()

        if (memberError) {
            throw memberError
        }

        memberProfiles.value = data
    }

    // 獲取家庭設定
    const fetchFamilySettings = async (familyId: string) => {
        const { data, error: settingsError } = await supabase
            .from('family_settings')
            .select('*')
            .eq('family_id', familyId)
            .single()

        if (settingsError) {
            throw settingsError
        }

        familySettings.value = data
    }

    // 創建新的家庭
    const createFamily = async (familyName: string = '我們的家庭') => {
        try {
            loading.value = true
            error.value = null

            const { data, error: createError } = await supabase
                .rpc('create_family', { family_name: familyName })

            if (createError) {
                throw createError
            }

            // 重新獲取用戶資料
            await fetchUserProfile()

            return data
        } catch (err) {
            console.error('創建家庭失敗:', err)
            error.value = err instanceof Error ? err.message : '創建家庭失敗'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 加入家庭
    const joinFamilyWithCode = async (invitationCode: string) => {
        try {
            loading.value = true
            error.value = null

            const { data, error: joinError } = await supabase
                .rpc('join_family', { invitation_code: invitationCode })

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
            console.error('加入家庭失敗:', err)
            error.value = err instanceof Error ? err.message : '加入家庭失敗'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 更新家庭設定
    const updateFamilySettings = async (updates: FamilySettingsUpdate) => {
        try {
            loading.value = true
            error.value = null

            if (!family.value) {
                throw new Error('尚未加入家庭')
            }

            const { data, error: updateError } = await supabase
                .from('family_settings')
                .update(updates)
                .eq('family_id', family.value.id)
                .select()
                .single()

            if (updateError) {
                throw updateError
            }

            familySettings.value = data
            return data

        } catch (err) {
            console.error('更新家庭設定失敗:', err)
            error.value = err instanceof Error ? err.message : '更新家庭設定失敗'
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

    // 離開家庭
    const leaveFamily = async () => {
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
                    family_id: null,
                    role: 'member'
                })
                .eq('id', userData.user.id)

            if (leaveError) {
                throw leaveError
            }

            // 清除本地狀態
            family.value = null
            memberProfiles.value = null
            familySettings.value = null

            // 重新獲取用戶資料
            await fetchUserProfile()

        } catch (err) {
            console.error('離開家庭失敗:', err)
            error.value = err instanceof Error ? err.message : '離開家庭失敗'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 獲取類別預算
    const getCategoryBudget = (category: string): number => {
        try {
            if (!familySettings.value) return 0
            const budgetsJson = familySettings.value.category_budgets as Record<string, unknown> | null
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
        family,
        userProfile,
        memberProfiles,
        familySettings,
        loading,
        error,

        // 計算屬性
        isInFamily,
        isOwner,
        hasMembers,
        personalBudget,

        // 方法
        fetchUserProfile,
        createFamily,
        joinFamilyWithCode,
        updateFamilySettings,
        updateUserProfile,
        updatePersonalBudget,
        leaveFamily,
        getCategoryBudget,
        clearError
    }
}, {
    persist: false
})
