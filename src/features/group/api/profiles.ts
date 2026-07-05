import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'

// 使用者顯示資料的最小投影（跨 expenses / balances / debts / snapshots 共用的 enrich 來源）。
export interface ProfileLookup {
    display_name: string | null
    avatar_url: string | null
}

// 批次載入 user_profiles，並把每筆回填到 ['profiles', userId] 的 Query cache：
//   - 取代 Vue 版 expense/settlement store 各自持有的 profileCache（兩份手工快取）
//   - 已在 cache 的 id 不重打，未命中的一次 .in() 撈回
//   - profile 屬非關鍵 enrich：撈取失敗不讓整個 query 失敗，回傳現有命中（名稱以 null 呈現）
export async function loadProfiles(
    client: QueryClient,
    userIds: string[]
): Promise<Map<string, ProfileLookup>> {
    const unique = [...new Set(userIds)].filter(Boolean)
    const map = new Map<string, ProfileLookup>()
    const missing: string[] = []

    for (const id of unique) {
        const cached = client.getQueryData<ProfileLookup>(queryKeys.profiles(id))
        if (cached) {
            map.set(id, cached)
        } else {
            missing.push(id)
        }
    }

    if (missing.length > 0) {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('id, display_name, avatar_url')
            .in('id', missing)

        // 非關鍵 enrich：撈取失敗就沿用已命中的部分，不上拋（對齊 Vue store 的 console.error 後續行）
        if (!error) {
            for (const row of data ?? []) {
                const lookup: ProfileLookup = {
                    display_name: row.display_name,
                    avatar_url: row.avatar_url
                }
                client.setQueryData(queryKeys.profiles(row.id), lookup)
                map.set(row.id, lookup)
            }
        }
    }

    return map
}
