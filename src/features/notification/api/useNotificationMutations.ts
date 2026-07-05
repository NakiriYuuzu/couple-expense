import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { detectDevicePlatform } from '@/features/notification/lib/platform'
import type { NotificationPrefs } from '@/shared/lib/database.types'

// 對照 useUserSettingsSync.ts：user_settings 列可能尚未建立，一律用 upsert（onConflict: 'user_id'）
// 而非 update——若用 update，列不存在時會靜默 0 rows affected，開關看似成功實則沒寫入。
// 只帶 user_id + notification_prefs 兩欄，upsert 的 merge-duplicates 只覆寫這兩欄，
// 不會動到 useUserSettingsSync 負責的 theme/language。
export function useUpdateNotificationPrefs() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: { userId: string; prefs: NotificationPrefs }): Promise<void> => {
            const { error } = await supabase
                .from('user_settings')
                .upsert({ user_id: input.userId, notification_prefs: input.prefs }, { onConflict: 'user_id' })
            if (error) throw error
        },
        onSuccess: (_data, variables) => {
            client.setQueryData(queryKeys.notificationPrefs(variables.userId), variables.prefs)
        }
    })
}

// 註冊/刷新本裝置的推播 token（衝突鍵 fcm_token，對照 migrations/v3-01-user-devices.sql）。
// 呼叫端負責先透過 @/shared/lib/firebase 取得 token——本 hook 只管 Supabase 寫入，
// 不碰 Firebase SDK，才能只 mock supabase 就測到 upsert payload。
export function useRegisterDevice() {
    return useMutation({
        mutationFn: async (input: { userId: string; token: string }): Promise<void> => {
            const { error } = await supabase.from('user_devices').upsert(
                {
                    user_id: input.userId,
                    fcm_token: input.token,
                    platform: detectDevicePlatform(),
                    user_agent: navigator.userAgent,
                    last_seen_at: new Date().toISOString()
                },
                { onConflict: 'fcm_token' }
            )
            if (error) throw error
        }
    })
}

// 停用推播：刪除本裝置對應的 user_devices 列。RLS 已限定 own-rows，故只需比對 fcm_token。
export function useUnregisterDevice() {
    return useMutation({
        mutationFn: async (input: { token: string }): Promise<void> => {
            const { error } = await supabase.from('user_devices').delete().eq('fcm_token', input.token)
            if (error) throw error
        }
    })
}
