import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import type { ProfileLookup } from '@/features/group/api/profiles'

// 對照 Vue groupStore.updateUserProfile / updatePersonalBudget（group.ts:301-360）：
// 純 update（非 upsert）——user_profiles 列預期在使用者建立時已存在。

// 更新顯示名稱。對照 Vue SettingsPage.vue saveDisplayName：DB 更新成功後
// fire-and-forget 同步 Auth user_metadata.full_name（失敗不影響已成功的 DB 更新）。
export function useUpdateDisplayName() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: { userId: string; displayName: string }): Promise<void> => {
            const { error } = await supabase
                .from('user_profiles')
                .update({ display_name: input.displayName })
                .eq('id', input.userId)
            if (error) throw error

            void supabase.auth.updateUser({ data: { full_name: input.displayName } }).catch(() => {})
        },
        onSuccess: (_data, variables) => {
            // 直接寫入新值（而非只 invalidate）：即使目前沒有掛載中的 useMyProfile 觀察者
            // 也能保證 cache 立即反映新名字。
            client.setQueryData(
                queryKeys.profiles(variables.userId),
                (prev: ProfileLookup | undefined): ProfileLookup => ({
                    display_name: variables.displayName,
                    avatar_url: prev?.avatar_url ?? null
                })
            )
            // detailProfiles / memberProfiles 快取的是整包 Map 快照（見 profiles.ts loadProfiles），
            // 需整批作廢才會反映新名字——這是群組成員清單與費用明細顯示名稱的來源。
            void client.invalidateQueries({
                predicate: (query) =>
                    query.queryKey[0] === 'detailProfiles' || query.queryKey[0] === 'member-profiles'
            })
        }
    })
}

// 更新個人月度預算。與 DashboardPage.tsx 的 inline 查詢共用 userProfileBudget(userId) key，
// invalidate 後 Dashboard 的預算環會在下次掛載/可見時自動反映新值。
export function useUpdatePersonalBudget() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: { userId: string; budget: number | null }): Promise<void> => {
            const { error } = await supabase
                .from('user_profiles')
                .update({ personal_monthly_budget: input.budget })
                .eq('id', input.userId)
            if (error) throw error
        },
        onSuccess: (_data, variables) => {
            void client.invalidateQueries({ queryKey: queryKeys.userProfileBudget(variables.userId) })
        }
    })
}
