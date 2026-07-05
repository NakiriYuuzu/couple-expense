import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { STALE } from '@/shared/lib/queryClient'
import type { NotificationPrefs } from '@/shared/lib/database.types'

// 三種通知事件（split_assigned/settlement_received/monthly_report）的預設值，對照
// migrations/v3-05-notification-prefs.sql 的欄位 DEFAULT：全開。
// user_settings 列可能尚未建立（見 useUserSettingsSync 的 on-demand 建立邏輯），
// 此時查無列也回傳這組預設值，讓開關能以「全開」渲染而非炸開或卡在 undefined。
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
    split_assigned: true,
    settlement_received: true,
    monthly_report: true
}

export function useNotificationPrefs(userId: string | null) {
    return useQuery({
        queryKey: queryKeys.notificationPrefs(userId ?? ''),
        queryFn: async (): Promise<NotificationPrefs> => {
            const { data, error } = await supabase
                .from('user_settings')
                .select('notification_prefs')
                .eq('user_id', userId as string)
                .maybeSingle()
            if (error) throw error
            return data?.notification_prefs ?? DEFAULT_NOTIFICATION_PREFS
        },
        // 長層：notification prefs（用戶偏好）10 分鐘緩存
        staleTime: STALE.long,
        gcTime: STALE.long,
        enabled: !!userId
    })
}
