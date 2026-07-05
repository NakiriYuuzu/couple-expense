import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useUserSettingsSync } from '../useUserSettingsSync'
import { useThemeSync } from '@/shared/hooks/useThemeSync'
import { useAuthStore } from '@/features/auth/authStore'
import { useUiStore } from '@/shared/stores/ui'
import { queryKeys } from '@/shared/lib/queryKeys'

const h = vi.hoisted(() => {
    type State = Record<string, any>
    let resolve: (s: State) => any = () => ({ data: null, error: null })
    let resolveUpsert: (s: State) => any = () => ({ data: null, error: null })
    const states: State[] = []

    const makeBuilder = (table: string) => {
        const s: State = { table }
        const b: any = {
            select: (...a: any[]) => { s.select = a; return b },
            eq: (c: string, v: any) => { (s.eq ||= {})[c] = v; return b },
            maybeSingle: async () => {
                s.op = 'maybeSingle'
                states.push(s)
                return resolve(s)
            },
            upsert: async (values: any, opts?: any) => {
                s.op = 'upsert'
                s.values = values
                s.upsertOptions = opts
                states.push(s)
                return resolveUpsert(s)
            }
        }
        return b
    }

    const supabase = { from: vi.fn((table: string) => makeBuilder(table)) }
    return {
        supabase,
        states,
        setResolve: (fn: (s: State) => any) => { resolve = fn },
        setUpsertResolve: (fn: (s: State) => any) => { resolveUpsert = fn }
    }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: h.supabase }))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'

function Harness() {
    useThemeSync()
    useUserSettingsSync()
    return null
}

function renderHarness(client: QueryClient) {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return render(<Harness />, { wrapper })
}

describe('useUserSettingsSync', () => {
    beforeEach(() => {
        h.supabase.from.mockClear()
        h.states.length = 0
        h.setResolve(() => ({
            data: { theme: 'dark', language: 'en' },
            error: null
        }))
        h.setUpsertResolve(() => ({ data: null, error: null }))
        useAuthStore.setState({ status: 'ready', user: { id: USER_ID } as any, session: null })
        useUiStore.setState({ theme: 'light', language: 'zh-TW' })
        document.documentElement.classList.remove('dark')
    })

    afterEach(() => {
        document.documentElement.classList.remove('dark')
    })

    it('loads logged-in theme from user_settings, applies it, and stores it under the user settings query key', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        renderHarness(client)

        await waitFor(() => expect(useUiStore.getState().theme).toBe('dark'))
        expect(document.documentElement.classList.contains('dark')).toBe(true)
        expect(useUiStore.getState().language).toBe('en')
        expect(client.getQueryData(queryKeys.userSettings(USER_ID))).toEqual({
            theme: 'dark',
            language: 'en'
        })
    })

    it('upserts theme changes without waiting for a reload', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        renderHarness(client)

        await waitFor(() => expect(useUiStore.getState().theme).toBe('dark'))
        h.states.length = 0

        act(() => {
            useUiStore.getState().setTheme('light')
        })

        await waitFor(() =>
            expect(h.states.some((state) =>
                state.table === 'user_settings' &&
                state.op === 'upsert' &&
                state.values.user_id === USER_ID &&
                state.values.theme === 'light' &&
                state.values.language === 'en' &&
                state.upsertOptions?.onConflict === 'user_id'
            )).toBe(true)
        )
    })

    it('ignores an older upsert success that resolves after a newer preference and replays the latest value', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        let resolveLight: ((value: { data: null; error: null }) => void) | null = null
        let resolveSystem: ((value: { data: null; error: null }) => void) | null = null

        h.setUpsertResolve((state) => {
            if (state.values.theme === 'light') {
                return new Promise((resolve) => { resolveLight = resolve })
            }
            if (state.values.theme === 'system' && resolveSystem === null) {
                return new Promise((resolve) => { resolveSystem = resolve })
            }
            return { data: null, error: null }
        })

        renderHarness(client)

        await waitFor(() => expect(useUiStore.getState().theme).toBe('dark'))
        h.states.length = 0

        act(() => {
            useUiStore.getState().setTheme('light')
        })
        await waitFor(() => expect(resolveLight).not.toBeNull())

        act(() => {
            useUiStore.getState().setTheme('system')
        })
        await waitFor(() => expect(resolveSystem).not.toBeNull())

        act(() => {
            resolveSystem?.({ data: null, error: null })
        })

        await waitFor(() =>
            expect(client.getQueryData(queryKeys.userSettings(USER_ID))).toEqual({
                theme: 'system',
                language: 'en'
            })
        )

        act(() => {
            resolveLight?.({ data: null, error: null })
        })

        await waitFor(() => {
            const systemUpserts = h.states.filter((state) =>
                state.table === 'user_settings' &&
                state.op === 'upsert' &&
                state.values.theme === 'system' &&
                state.values.language === 'en'
            )
            expect(systemUpserts).toHaveLength(2)
        })
        expect(client.getQueryData(queryKeys.userSettings(USER_ID))).toEqual({
            theme: 'system',
            language: 'en'
        })
        expect(useUiStore.getState().theme).toBe('system')
    })

    it('does not replay a stale user settings write after switching accounts', async () => {
        h.setResolve((state) => ({
            data: state.eq?.user_id === OTHER_USER_ID
                ? { theme: 'system', language: 'zh-TW' }
                : { theme: 'dark', language: 'en' },
            error: null
        }))

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        let resolveUserAWrite: ((value: { data: null; error: null }) => void) | null = null

        h.setUpsertResolve((state) => {
            if (
                state.values.user_id === USER_ID &&
                state.values.theme === 'light' &&
                resolveUserAWrite === null
            ) {
                return new Promise((resolve) => { resolveUserAWrite = resolve })
            }
            return { data: null, error: null }
        })

        renderHarness(client)

        await waitFor(() => expect(useUiStore.getState().theme).toBe('dark'))
        h.states.length = 0

        act(() => {
            useUiStore.getState().setTheme('light')
        })
        await waitFor(() => expect(resolveUserAWrite).not.toBeNull())

        act(() => {
            useAuthStore.setState({ status: 'ready', user: { id: OTHER_USER_ID } as any, session: null })
        })

        await waitFor(() => {
            expect(useUiStore.getState().theme).toBe('system')
            expect(useUiStore.getState().language).toBe('zh-TW')
        })

        act(() => {
            resolveUserAWrite?.({ data: null, error: null })
        })

        await waitFor(() => expect(client.isMutating()).toBe(0))

        const userAUpserts = h.states.filter((state) =>
            state.table === 'user_settings' &&
            state.op === 'upsert' &&
            state.values.user_id === USER_ID
        )
        expect(userAUpserts).toHaveLength(1)
        expect(userAUpserts.some((state) =>
            state.values.theme === 'system' &&
            state.values.language === 'zh-TW'
        )).toBe(false)
        expect(client.getQueryData(queryKeys.userSettings(USER_ID))).toEqual({
            theme: 'dark',
            language: 'en'
        })
    })

    it('does not replay B prefs into A while A settings are refetching after switching back', async () => {
        let delayNextASettings = false
        let resolveDelayedASettings: ((value: { data: { theme: 'dark'; language: 'en' }; error: null }) => void) | null = null
        h.setResolve((state) => {
            if (state.eq?.user_id === OTHER_USER_ID) {
                return { data: { theme: 'system', language: 'zh-TW' }, error: null }
            }
            if (state.eq?.user_id === USER_ID && delayNextASettings) {
                return new Promise((resolve) => { resolveDelayedASettings = resolve })
            }
            return { data: { theme: 'dark', language: 'en' }, error: null }
        })

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        let resolveUserAWrite: ((value: { data: null; error: null }) => void) | null = null

        h.setUpsertResolve((state) => {
            if (
                state.values.user_id === USER_ID &&
                state.values.theme === 'light' &&
                resolveUserAWrite === null
            ) {
                return new Promise((resolve) => { resolveUserAWrite = resolve })
            }
            return { data: null, error: null }
        })

        renderHarness(client)

        await waitFor(() => expect(useUiStore.getState().theme).toBe('dark'))
        h.states.length = 0

        act(() => {
            useUiStore.getState().setTheme('light')
        })
        await waitFor(() => expect(resolveUserAWrite).not.toBeNull())

        act(() => {
            useAuthStore.setState({ status: 'ready', user: { id: OTHER_USER_ID } as any, session: null })
        })

        await waitFor(() => {
            expect(useUiStore.getState().theme).toBe('system')
            expect(useUiStore.getState().language).toBe('zh-TW')
        })

        delayNextASettings = true
        client.removeQueries({ queryKey: queryKeys.userSettings(USER_ID), exact: true })

        act(() => {
            useAuthStore.setState({ status: 'ready', user: { id: USER_ID } as any, session: null })
        })

        await waitFor(() => expect(resolveDelayedASettings).not.toBeNull())
        expect(useUiStore.getState().theme).toBe('system')
        expect(useUiStore.getState().language).toBe('zh-TW')

        act(() => {
            resolveUserAWrite?.({ data: null, error: null })
        })

        await waitFor(() => expect(client.isMutating()).toBe(0))

        const userAUpsertsBeforeASettings = h.states.filter((state) =>
            state.table === 'user_settings' &&
            state.op === 'upsert' &&
            state.values.user_id === USER_ID
        )
        expect(userAUpsertsBeforeASettings).toHaveLength(1)
        expect(userAUpsertsBeforeASettings.some((state) =>
            state.values.theme === 'system' &&
            state.values.language === 'zh-TW'
        )).toBe(false)
        expect(client.getQueryData(queryKeys.userSettings(USER_ID))).toBeUndefined()

        act(() => {
            resolveDelayedASettings?.({ data: { theme: 'dark', language: 'en' }, error: null })
        })

        await waitFor(() => {
            expect(useUiStore.getState().theme).toBe('dark')
            expect(useUiStore.getState().language).toBe('en')
        })
        expect(client.getQueryData(queryKeys.userSettings(USER_ID))).toEqual({
            theme: 'dark',
            language: 'en'
        })

        h.states.length = 0
        act(() => {
            useUiStore.getState().setTheme('light')
        })

        await waitFor(() =>
            expect(h.states.some((state) =>
                state.table === 'user_settings' &&
                state.op === 'upsert' &&
                state.values.user_id === USER_ID &&
                state.values.theme === 'light' &&
                state.values.language === 'en'
            )).toBe(true)
        )
    })

    it('sanitizes null or invalid DB prefs by keeping the local values and writing them back', async () => {
        h.setResolve(() => ({
            data: { theme: null, language: 'jp' },
            error: null
        }))
        useUiStore.setState({ theme: 'dark', language: 'en' })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        renderHarness(client)

        await waitFor(() =>
            expect(h.states.some((state) =>
                state.table === 'user_settings' &&
                state.op === 'upsert' &&
                state.values.user_id === USER_ID &&
                state.values.theme === 'dark' &&
                state.values.language === 'en'
            )).toBe(true)
        )
        expect(useUiStore.getState().theme).toBe('dark')
        expect(useUiStore.getState().language).toBe('en')
    })
})
