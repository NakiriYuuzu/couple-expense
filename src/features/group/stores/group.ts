import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import type {
    GroupRow,
    GroupMemberRow,
    GroupSettingsRow,
    UserProfileRow
} from '@/shared/lib/database.types'
import type { GroupSettingsUpdate } from '@/entities/group/types'

export const useGroupStore = defineStore('group', () => {
    // 狀態
    const groups = ref<GroupRow[]>([])
    const activeGroupId = ref<string | null>(null)
    const membersByGroup = ref<Record<string, GroupMemberRow[]>>({})
    const settingsByGroup = ref<Record<string, GroupSettingsRow>>({})
    const userProfile = ref<UserProfileRow | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    // 計算屬性
    const activeGroup = computed<GroupRow | null>(() => {
        if (!activeGroupId.value) return null
        return groups.value.find(g => g.id === activeGroupId.value) ?? null
    })

    const activeGroupMembers = computed<GroupMemberRow[]>(() => {
        if (!activeGroupId.value) return []
        return membersByGroup.value[activeGroupId.value] ?? []
    })

    const activeGroupSettings = computed<GroupSettingsRow | null>(() => {
        if (!activeGroupId.value) return null
        return settingsByGroup.value[activeGroupId.value] ?? null
    })

    const isInAnyGroup = computed(() => groups.value.length > 0)

    const isPersonalContext = computed(() => activeGroupId.value === null)

    const isOwnerOfActiveGroup = computed(() => {
        if (!activeGroupId.value || !userProfile.value) return false
        const members = membersByGroup.value[activeGroupId.value] ?? []
        const self = members.find(m => m.user_id === userProfile.value!.id)
        return self?.role === 'owner'
    })

    const personalBudget = computed(() => userProfile.value?.personal_monthly_budget ?? null)

    // 獲取用戶資料
    const fetchUserProfile = async () => {
        try {
            loading.value = true
            error.value = null

            const { data: userData } = await supabase.auth.getUser()
            if (!userData.user) {
                throw new Error('用戶未登入')
            }

            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userData.user.id)
                .single()

            if (profileError && profileError.code !== 'PGRST116') {
                throw profileError
            }

            userProfile.value = profile

        } catch (err) {
            console.error('獲取用戶資料失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取用戶資料失敗'
        } finally {
            loading.value = false
        }
    }

    // 獲取用戶所屬的所有群組（含成員和設定）
    const fetchUserGroups = async () => {
        try {
            loading.value = true
            error.value = null

            const { data: userData } = await supabase.auth.getUser()
            if (!userData.user) {
                throw new Error('用戶未登入')
            }

            // 取得用戶加入的所有 group_members 記錄
            const { data: memberships, error: membershipError } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', userData.user.id)
                .eq('is_active', true)

            if (membershipError) {
                throw membershipError
            }

            if (!memberships || memberships.length === 0) {
                groups.value = []
                membersByGroup.value = {}
                settingsByGroup.value = {}
                return
            }

            const groupIds = memberships.map(m => m.group_id)

            // 同步載入群組、成員、設定
            const [groupsResult, membersResult, settingsResult] = await Promise.all([
                supabase
                    .from('groups')
                    .select('*')
                    .in('id', groupIds)
                    .eq('is_active', true),
                supabase
                    .from('group_members')
                    .select('*')
                    .in('group_id', groupIds)
                    .eq('is_active', true),
                supabase
                    .from('group_settings')
                    .select('*')
                    .in('group_id', groupIds)
            ])

            if (groupsResult.error) throw groupsResult.error
            if (membersResult.error) throw membersResult.error
            if (settingsResult.error) throw settingsResult.error

            groups.value = groupsResult.data ?? []

            // 以 group_id 為 key 建立 membersByGroup
            const newMembersByGroup: Record<string, GroupMemberRow[]> = {}
            for (const member of membersResult.data ?? []) {
                if (!newMembersByGroup[member.group_id]) {
                    newMembersByGroup[member.group_id] = []
                }
                newMembersByGroup[member.group_id].push(member)
            }
            membersByGroup.value = newMembersByGroup

            // 以 group_id 為 key 建立 settingsByGroup
            const newSettingsByGroup: Record<string, GroupSettingsRow> = {}
            for (const settings of settingsResult.data ?? []) {
                newSettingsByGroup[settings.group_id] = settings
            }
            settingsByGroup.value = newSettingsByGroup

            // 若 activeGroupId 已不存在於取回的群組清單中，重設為 null
            if (activeGroupId.value && !groupIds.includes(activeGroupId.value)) {
                activeGroupId.value = null
            }

        } catch (err) {
            console.error('獲取群組資料失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取群組資料失敗'
        } finally {
            loading.value = false
        }
    }

    // 切換作用中的群組（null = 個人模式）
    const setActiveGroup = (id: string | null) => {
        activeGroupId.value = id
    }

    // 建立新群組
    const createGroup = async (name: string, description?: string) => {
        try {
            loading.value = true
            error.value = null

            const { data, error: createError } = await supabase
                .rpc('create_group', { p_name: name, p_description: description })

            if (createError) {
                throw createError
            }

            // 重新載入群組資料
            await fetchUserGroups()

            return data as string

        } catch (err) {
            console.error('建立群組失敗:', err)
            error.value = err instanceof Error ? err.message : '建立群組失敗'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 透過邀請碼加入群組
    const joinGroupWithCode = async (code: string) => {
        try {
            loading.value = true
            error.value = null

            const { data, error: joinError } = await supabase
                .rpc('join_group', { p_invitation_code: code })

            if (joinError) {
                throw joinError
            }

            if (!data) {
                throw new Error('邀請碼無效')
            }

            // 重新載入群組資料
            await fetchUserGroups()

            return true

        } catch (err) {
            console.error('加入群組失敗:', err)
            error.value = err instanceof Error ? err.message : '加入群組失敗'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 離開群組
    const leaveGroup = async (groupId: string) => {
        try {
            loading.value = true
            error.value = null

            const { error: leaveError } = await supabase
                .rpc('leave_group', { p_group_id: groupId })

            if (leaveError) {
                throw leaveError
            }

            // 若離開的是目前作用中的群組，切換回個人模式
            if (activeGroupId.value === groupId) {
                activeGroupId.value = null
            }

            // 重新載入群組資料
            await fetchUserGroups()

        } catch (err) {
            console.error('離開群組失敗:', err)
            error.value = err instanceof Error ? err.message : '離開群組失敗'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 更新作用中群組的設定
    const updateGroupSettings = async (updates: GroupSettingsUpdate) => {
        try {
            loading.value = true
            error.value = null

            if (!activeGroupId.value) {
                throw new Error('尚未選擇群組')
            }

            const { data, error: updateError } = await supabase
                .from('group_settings')
                .update(updates)
                .eq('group_id', activeGroupId.value)
                .select()
                .single()

            if (updateError) {
                throw updateError
            }

            settingsByGroup.value = {
                ...settingsByGroup.value,
                [activeGroupId.value]: data
            }

            return data

        } catch (err) {
            console.error('更新群組設定失敗:', err)
            error.value = err instanceof Error ? err.message : '更新群組設定失敗'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 更新用戶資料（顯示名稱、頭像）
    const updateUserProfile = async (updates: {
        display_name?: string
        avatar_url?: string
    }) => {
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

    // 獲取類別預算（從作用中群組設定取得）
    const getCategoryBudget = (category: string): number => {
        try {
            if (!activeGroupId.value) return 0
            const settings = settingsByGroup.value[activeGroupId.value]
            if (!settings) return 0
            const budgetsJson = settings.category_budgets as Record<string, unknown> | null
            if (!budgetsJson || typeof budgetsJson !== 'object') return 0
            return Number(budgetsJson[category]) || 0
        } catch {
            return 0
        }
    }

    // 清除錯誤狀態
    const clearError = () => {
        error.value = null
    }

    return {
        // 狀態
        groups,
        activeGroupId,
        membersByGroup,
        settingsByGroup,
        userProfile,
        loading,
        error,

        // 計算屬性
        activeGroup,
        activeGroupMembers,
        activeGroupSettings,
        isInAnyGroup,
        isPersonalContext,
        isOwnerOfActiveGroup,
        personalBudget,

        // 方法
        fetchUserProfile,
        fetchUserGroups,
        setActiveGroup,
        createGroup,
        joinGroupWithCode,
        leaveGroup,
        updateGroupSettings,
        updateUserProfile,
        updatePersonalBudget,
        getCategoryBudget,
        clearError
    }
}, {
    persist: {
        pick: ['activeGroupId']
    }
})
