import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { STALE } from '@/shared/lib/queryClient'
import { useUiStore, type ThemePref } from '@/shared/stores/ui'
import type { AppLocale } from '@/shared/i18n'
import { useAuthStore } from './authStore'

// 登入後與 user_settings.theme/language 雙向同步（接上 Vue 版從未使用的 user_settings 表）：
//   1. 讀 DB 覆蓋本地（無列則以本地值建立）
//   2. 之後本地變更寫回 DB
// 全程防禦性：任何錯誤只吞掉不阻斷 UI，且不 console.log session 物件。
// prefs 型別必須維持 ThemePref / AppLocale 字面聯集（不可寬化成 string），
// 否則 user_settings.upsert 的 typed overload 會落到陣列多載而失配。
type UserSettingsPrefs = { theme: ThemePref; language: AppLocale }
type RawUserSettingsPrefs = { theme: unknown; language: unknown }

const VALID_THEMES: readonly ThemePref[] = ['light', 'dark', 'system']
const VALID_LANGUAGES: readonly AppLocale[] = ['zh-TW', 'en']

function pickPrefs(state: { theme: ThemePref; language: AppLocale }): UserSettingsPrefs {
    return { theme: state.theme, language: state.language }
}

function isThemePref(value: unknown): value is ThemePref {
    return VALID_THEMES.includes(value as ThemePref)
}

function isAppLocale(value: unknown): value is AppLocale {
    return VALID_LANGUAGES.includes(value as AppLocale)
}

function sanitizePrefs(raw: RawUserSettingsPrefs, fallback: UserSettingsPrefs): UserSettingsPrefs {
    return {
        theme: isThemePref(raw.theme) ? raw.theme : fallback.theme,
        language: isAppLocale(raw.language) ? raw.language : fallback.language
    }
}

function prefsEqual(a: UserSettingsPrefs, b: UserSettingsPrefs): boolean {
    return a.theme === b.theme && a.language === b.language
}

async function fetchUserSettings(userId: string): Promise<RawUserSettingsPrefs | null> {
    const { data, error } = await supabase
        .from('user_settings')
        .select('theme, language')
        .eq('user_id', userId)
        .maybeSingle()

    if (error) throw error
    return data ? { theme: data.theme, language: data.language } : null
}

async function upsertUserSettings(userId: string, prefs: UserSettingsPrefs): Promise<void> {
    const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, theme: prefs.theme, language: prefs.language }, { onConflict: 'user_id' })
    if (error) throw error
}

export function useUserSettingsSync(): void {
    const userId = useAuthStore((s) => s.user?.id ?? null)
    const client = useQueryClient()
    const prefsOwnerUserIdRef = useRef<string | null>(null)

    const settingsQuery = useQuery({
        queryKey: queryKeys.userSettings(userId ?? ''),
        queryFn: () => fetchUserSettings(userId as string),
        // 長層：theme/language 都是低頻使用者偏好；登入後讀取後可長時間重用。
        staleTime: STALE.long,
        gcTime: STALE.long,
        enabled: !!userId
    })

    const isCurrentUser = (targetUserId: string): boolean => (
        useAuthStore.getState().user?.id === targetUserId
    )

    const canReadOwnedPrefs = (targetUserId: string): boolean => (
        isCurrentUser(targetUserId) && prefsOwnerUserIdRef.current === targetUserId
    )

    const replayLatestPrefs = (targetUserId: string, prefs: UserSettingsPrefs): void => {
        if (!canReadOwnedPrefs(targetUserId)) return

        void upsertUserSettings(targetUserId, prefs).then(() => {
            if (!canReadOwnedPrefs(targetUserId)) return

            const latestPrefs = pickPrefs(useUiStore.getState())
            if (prefsEqual(prefs, latestPrefs)) {
                client.setQueryData(queryKeys.userSettings(targetUserId), prefs)
                return
            }
            replayLatestPrefs(targetUserId, latestPrefs)
        }).catch(() => {})
    }

    const { mutate: mutateSettings } = useMutation({
        mutationFn: async (input: { userId: string; prefs: UserSettingsPrefs }) => {
            await upsertUserSettings(input.userId, input.prefs)
        },
        onSuccess: (_data, variables) => {
            if (!canReadOwnedPrefs(variables.userId)) return

            const currentPrefs = pickPrefs(useUiStore.getState())
            if (prefsEqual(variables.prefs, currentPrefs)) {
                client.setQueryData(queryKeys.userSettings(variables.userId), variables.prefs)
                return
            }

            replayLatestPrefs(variables.userId, currentPrefs)
        }
    })

    useEffect(() => {
        if (!userId) return

        return () => {
            if (prefsOwnerUserIdRef.current === userId) {
                prefsOwnerUserIdRef.current = null
            }
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        if (!settingsQuery.isSuccess) return

        if (settingsQuery.data) {
            // DB 覆蓋本地；useThemeSync/useLanguageSync 會立即反映到 DOM/i18n。
            const localPrefs = pickPrefs(useUiStore.getState())
            const sanitized = sanitizePrefs(settingsQuery.data, localPrefs)
            const needsRepair = !prefsEqual(settingsQuery.data as UserSettingsPrefs, sanitized)
            useUiStore.setState(sanitized)
            prefsOwnerUserIdRef.current = userId
            if (needsRepair) {
                client.setQueryData(queryKeys.userSettings(userId), sanitized)
                mutateSettings({ userId, prefs: sanitized })
            }
            return
        }

        // 尚無設定列：以目前本地值建立。
        const localPrefs = pickPrefs(useUiStore.getState())
        prefsOwnerUserIdRef.current = userId
        mutateSettings({ userId, prefs: localPrefs })
    }, [client, mutateSettings, settingsQuery.data, settingsQuery.isSuccess, userId])

    useEffect(() => {
        if (!userId) return
        if (!settingsQuery.isSuccess) return

        // 本地變更寫回 DB（僅在 theme/language 真的改變時）
        let prev = pickPrefs(useUiStore.getState())
        const unsubscribe = useUiStore.subscribe((state) => {
            const next = pickPrefs(state)
            if (next.theme === prev.theme && next.language === prev.language) return
            prev = next
            mutateSettings({ userId, prefs: next })
        })

        return () => {
            unsubscribe()
        }
    }, [mutateSettings, settingsQuery.isSuccess, userId])
}
