import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useSessionStore } from '@/shared/stores/session'
import { STALE } from '@/shared/lib/queryClient'
import type { GroupMemberRow, GroupSettingsRow } from '@/shared/lib/database.types'
import type { GroupWithDetails } from '@/entities/group/types'

// 對照 Vue groupStore.fetchUserGroups（group.ts:84-168）：
// memberships → 並行撈 groups / members / settings → 以 group_id 聚合為 GroupWithDetails[]。
// 差異（刻意）：Vue 在此順手把 activeGroupId 清成 null（副作用）；React 版查詢維持純函式、
// 不改動 sessionStore——「activeGroupId 已不在清單」的收斂交給 useActiveGroup 派生時處理，
// 避免在資料層製造 P3 型的全域副作用。
export async function fetchGroups(): Promise<GroupWithDetails[]> {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    const userId = userData.user?.id
    if (!userId) throw new Error('用戶未登入')

    const { data: memberships, error: membershipError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('is_active', true)

    if (membershipError) throw membershipError
    if (!memberships || memberships.length === 0) return []

    const groupIds = memberships.map((m) => m.group_id)

    const [groupsResult, membersResult, settingsResult] = await Promise.all([
        supabase.from('groups').select('*').in('id', groupIds).eq('is_active', true),
        supabase.from('group_members').select('*').in('group_id', groupIds).eq('is_active', true),
        supabase.from('group_settings').select('*').in('group_id', groupIds)
    ])

    if (groupsResult.error) throw groupsResult.error
    if (membersResult.error) throw membersResult.error
    if (settingsResult.error) throw settingsResult.error

    const membersByGroup = new Map<string, GroupMemberRow[]>()
    for (const member of membersResult.data ?? []) {
        const list = membersByGroup.get(member.group_id) ?? []
        list.push(member)
        membersByGroup.set(member.group_id, list)
    }

    const settingsByGroup = new Map<string, GroupSettingsRow>()
    for (const settings of settingsResult.data ?? []) {
        settingsByGroup.set(settings.group_id, settings)
    }

    return (groupsResult.data ?? []).map((group) => {
        const members = membersByGroup.get(group.id) ?? []
        return {
            group,
            members,
            settings: settingsByGroup.get(group.id) ?? null,
            memberCount: members.length
        }
    })
}

// 使用者所屬群組清單（含成員與 settings）。key = ['groups']；GroupSwitcher 與各頁的單一來源。
export function useGroups() {
    return useQuery({
        queryKey: queryKeys.groups(),
        queryFn: fetchGroups,
        // 中層：groups（用戶群組）5 分鐘緩存
        staleTime: STALE.medium,
        gcTime: STALE.medium
    })
}

// 派生 selector（對照 Vue groupStore.membersByGroup computed）：不另起網路查詢，
// 直接從 ['groups'] cache 取該群組成員。groupMembers/groupSettings 的專屬 key 已於
// queryKeys 集中登記，保留給 Phase 5 需要單群組即時查詢時使用。
export function useGroupMembers(groupId: string | null | undefined): GroupMemberRow[] {
    const { data } = useGroups()
    if (!groupId) return []
    return data?.find((g) => g.group.id === groupId)?.members ?? []
}

export function useGroupSettings(groupId: string | null | undefined): GroupSettingsRow | null {
    const { data } = useGroups()
    if (!groupId) return null
    return data?.find((g) => g.group.id === groupId)?.settings ?? null
}

// 組合 sessionStore.activeGroupId 與 ['groups'] cache（對照 Vue groupStore.activeGroup computed）。
// activeGroupId 指向的群組不在清單時（切帳號殘留 / 已離開）回退為個人模式，並清掉 store 內的
// stale activeGroupId，避免其他直接讀 sessionStore 的消費者繼續用失效 key。
export function useActiveGroup() {
    const activeGroupId = useSessionStore((s) => s.activeGroupId)
    const setActiveGroup = useSessionStore((s) => s.setActiveGroup)
    const { data, isSuccess } = useGroups()

    const activeGroup = activeGroupId
        ? data?.find((g) => g.group.id === activeGroupId) ?? null
        : null
    const shouldFallbackToPersonal = !!activeGroupId && isSuccess && activeGroup === null

    useEffect(() => {
        if (shouldFallbackToPersonal) setActiveGroup(null)
    }, [setActiveGroup, shouldFallbackToPersonal])

    return {
        activeGroupId: shouldFallbackToPersonal ? null : activeGroupId,
        activeGroup,
        isPersonal: activeGroupId === null || shouldFallbackToPersonal
    }
}
