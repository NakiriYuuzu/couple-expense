import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { STALE } from '@/shared/lib/queryClient'
import type { ProfileLookup } from '@/features/group/api/profiles'

// 設定頁專用的「本人」查詢：display_name/avatar_url 與 profiles.ts 的 loadProfiles 共用
// 同一組 cache key（['profiles', userId]），編輯後只需寫入這個 key，群組成員清單等
// enrich 來源就能看到新值；personal_monthly_budget 則與 DashboardPage.tsx 內既有的
// inline 查詢共用 ['userProfileBudget', userId]，兩處預算數字必然同步。

export function useMyProfile(userId: string | null) {
    return useQuery({
        queryKey: queryKeys.profiles(userId ?? ''),
        queryFn: async (): Promise<ProfileLookup> => {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('display_name, avatar_url')
                .eq('id', userId as string)
                .maybeSingle()
            if (error) throw error
            return {
                display_name: data?.display_name ?? null,
                avatar_url: data?.avatar_url ?? null
            }
        },
        // 長層：profiles（個人資料）10 分鐘緩存
        staleTime: STALE.long,
        gcTime: STALE.long,
        enabled: !!userId
    })
}

export function usePersonalBudget(userId: string | null) {
    return useQuery({
        queryKey: queryKeys.userProfileBudget(userId ?? ''),
        queryFn: async (): Promise<number | null> => {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('personal_monthly_budget')
            .eq('id', userId as string)
            .maybeSingle()
            if (error) throw error
            return data?.personal_monthly_budget ?? null
        },
        // 長層：user settings（個人預算設定）10 分鐘緩存
        staleTime: STALE.long,
        gcTime: STALE.long,
        enabled: !!userId
    })
}
