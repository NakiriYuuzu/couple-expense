import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useSessionStore } from '@/shared/stores/session'
import type { GroupSettingsRow } from '@/shared/lib/database.types'
import type { GroupSettingsUpdate } from '@/entities/group/types'

// 建立群組（走既有 create_group RPC，對照 Vue groupStore.createGroup group.ts:176-200）。
export function useCreateGroup() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: { name: string; description?: string }): Promise<string> => {
            const { data, error } = await supabase.rpc('create_group', {
                p_name: input.name,
                p_description: input.description
            })
            if (error) throw error
            return data as string
        },
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: queryKeys.groups() })
        }
    })
}

// 以邀請碼加入群組（走既有 join_group RPC，對照 Vue groupStore.joinGroupWithCode group.ts:203-231）。
export function useJoinGroup() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (code: string): Promise<string> => {
            const { data, error } = await supabase.rpc('join_group', { p_invitation_code: code })
            if (error) throw error
            if (!data) throw new Error('邀請碼無效')
            return data as string
        },
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: queryKeys.groups() })
        }
    })
}

// 更新群組設定。修 P3：吃參數 groupId，不再挪用全域 activeGroupId
// （Vue groupStore.updateGroupSettings group.ts:264-298 以 activeGroupId.value 為 .eq 目標，
//  導致在非作用中群組頁編輯會誤寫作用中群組）。
export function useUpdateGroupSettings() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: {
            groupId: string
            patch: GroupSettingsUpdate
        }): Promise<GroupSettingsRow> => {
            const { data, error } = await supabase
                .from('group_settings')
                .update(input.patch as never)
                .eq('group_id', input.groupId)
                .select()
                .single()
            if (error) throw error
            return data as GroupSettingsRow
        },
        onSuccess: (_data, variables) => {
            void client.invalidateQueries({ queryKey: queryKeys.groupSettings(variables.groupId) })
            void client.invalidateQueries({ queryKey: queryKeys.groups() })
        }
    })
}

// 離開群組（走既有 leave_group RPC，對照 Vue groupStore.leaveGroup group.ts:234-261）。
// 離開的是作用中群組時，回退個人模式（key 自動切換，無需手動 refetch）。
export function useLeaveGroup() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (groupId: string): Promise<void> => {
            const { error } = await supabase.rpc('leave_group', { p_group_id: groupId })
            if (error) throw error
            if (useSessionStore.getState().activeGroupId === groupId) {
                useSessionStore.getState().setActiveGroup(null)
            }
        },
        onSuccess: (_data, groupId) => {
            void client.invalidateQueries({ queryKey: queryKeys.groups() })
            void client.invalidateQueries({ queryKey: queryKeys.groupMembers(groupId) })
        }
    })
}
