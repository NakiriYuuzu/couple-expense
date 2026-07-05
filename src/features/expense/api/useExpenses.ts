import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { STALE } from '@/shared/lib/queryClient'
import { loadProfiles } from '@/features/group/api/profiles'
import type { ExpenseRow } from '@/shared/lib/database.types'
import type { ExpenseUser } from '@/entities/expense/types'

export interface ExpenseWithUser extends ExpenseRow {
    user: ExpenseUser
}

// 全範疇一次撈取：RLS（expenses_select_policy）已限定可見範圍 =
// 自己的個人費用（group_id null）∪ 所屬群組的全部費用，client 端不再依
// activeGroupId 分區查詢——「顯示全部、由各頁自行過濾」是唯一口徑。
export async function fetchExpenses(client: QueryClient): Promise<ExpenseWithUser[]> {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!userData.user?.id) throw new Error('用戶未登入')

    const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })

    if (error) throw error
    const rows = data ?? []

    const profiles = await loadProfiles(client, rows.map((r) => r.user_id))

    return rows.map((row) => ({
        ...row,
        user: {
            id: row.user_id,
            display_name: profiles.get(row.user_id)?.display_name ?? null,
            avatar_url: profiles.get(row.user_id)?.avatar_url ?? null
        }
    }))
}

export function useExpenses() {
    const client = useQueryClient()

    return useQuery({
        queryKey: queryKeys.expenses(),
        queryFn: () => fetchExpenses(client),
        // 中短層：expenses（核心清單）60s 緩存
        staleTime: STALE.standard,
        gcTime: STALE.standard
    })
}
