import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { formatCurrency } from '@/shared/lib/money'
import { useAuthStore } from '@/features/auth/authStore'
import { useAccountStore } from '@/features/auth/accountStore'
import { useSessionStore } from '@/shared/stores/session'
import { useUiStore } from '@/shared/stores/ui'
import { usePushIntentStore } from '@/features/notification/pushIntentStore'

const h = vi.hoisted(() => ({
    navigate: vi.fn(),
    signOut: vi.fn(async () => undefined),
    signInWithGoogle: vi.fn(async () => undefined),
    switchToAccount: vi.fn(async () => undefined),
    removeStoredAccount: vi.fn(async () => undefined),
    updateDisplayName: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    updatePersonalBudget: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    registerDevice: { mutateAsync: vi.fn(async () => undefined), mutate: vi.fn(), isPending: false },
    unregisterDevice: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    updateNotificationPrefs: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    isPushConfigured: true,
    isPushBrowserSupported: vi.fn(async () => true),
    requestPushToken: vi.fn(async (): Promise<{ status: 'success'; token: string }> => ({
        status: 'success',
        token: 'tok_test'
    })),
    getCurrentPushToken: vi.fn(async (): Promise<string | null> => 'tok_test'),
    toast: { success: vi.fn(), error: vi.fn() },
    monthlyReports: [] as any[]
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => h.navigate
}))

vi.mock('@/features/auth/actions', () => ({
    signOut: h.signOut,
    signInWithGoogle: h.signInWithGoogle,
    switchToAccount: h.switchToAccount,
    removeStoredAccount: h.removeStoredAccount
}))

vi.mock('@/features/user/api/useProfileMutations', () => ({
    useUpdateDisplayName: () => h.updateDisplayName,
    useUpdatePersonalBudget: () => h.updatePersonalBudget
}))

vi.mock('@/features/notification/api/useNotificationMutations', () => ({
    useUpdateNotificationPrefs: () => h.updateNotificationPrefs,
    useRegisterDevice: () => h.registerDevice,
    useUnregisterDevice: () => h.unregisterDevice
}))

vi.mock('@/features/report/api/useMonthlyReports', () => ({
    useMonthlyReports: () => ({ data: h.monthlyReports })
}))

// 隔離真正的 Firebase SDK（happy-dom 沒有 IndexedDB/實體推播能力）：只驗證 SettingsPage
// 有沒有正確呼叫這幾個 orchestration 函式，token 取得/裝置能力偵測本身不是本檔的測試範圍。
vi.mock('@/shared/lib/firebase', () => ({
    get isPushConfigured() {
        return h.isPushConfigured
    },
    isPushBrowserSupported: () => h.isPushBrowserSupported(),
    requestPushToken: () => h.requestPushToken(),
    getCurrentPushToken: () => h.getCurrentPushToken()
}))

vi.mock('sonner', () => ({ toast: h.toast }))

// vaul/radix 在 happy-dom 的環境補丁（沿用 AddExpenseDrawer.spec.tsx 的作法）。
beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')

    if (!window.matchMedia) {
        window.matchMedia = (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false
        })
    }
    if (!globalThis.ResizeObserver) {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    }
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}

    // happy-dom 未實作 Notification：補一個最小 polyfill，讓 SettingsPage 的
    // `typeof Notification !== 'undefined'` 分支能被測到（permission 預設 granted，
    // 個別測試可自行覆寫成 'denied'/'default'）。
    if (typeof Notification === 'undefined') {
        class NotificationPolyfill {
            static permission: NotificationPermission = 'granted'
            static requestPermission = vi.fn(async () => NotificationPolyfill.permission)
        }
        // @ts-expect-error 測試用最小 polyfill，非完整 Notification 實作
        globalThis.Notification = NotificationPolyfill
    }
})

// import AFTER mocks
import SettingsPage from '../SettingsPage'

const USER_ID = '11111111-1111-4111-8111-111111111111'

function renderPage(): QueryClient {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
    })
    client.setQueryData(queryKeys.profiles(USER_ID), { display_name: 'Alice', avatar_url: '' })
    client.setQueryData(queryKeys.userProfileBudget(USER_ID), 5000)
    client.setQueryData(queryKeys.expenses(), [])
    client.setQueryData(queryKeys.notificationPrefs(USER_ID), {
        split_assigned: true,
        settlement_received: true,
        monthly_report: true
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<SettingsPage />, { wrapper })
    return client
}

describe('SettingsPage', () => {
    beforeEach(() => {
        h.navigate.mockClear()
        h.signOut.mockClear()
        h.signInWithGoogle.mockClear()
        h.switchToAccount.mockClear()
        h.removeStoredAccount.mockClear()
        h.updateDisplayName.mutateAsync.mockClear()
        h.updatePersonalBudget.mutateAsync.mockClear()
        h.registerDevice.mutateAsync.mockClear()
        h.registerDevice.mutate.mockClear()
        h.unregisterDevice.mutateAsync.mockClear()
        h.updateNotificationPrefs.mutateAsync.mockClear()
        h.isPushBrowserSupported.mockClear()
        h.requestPushToken.mockClear()
        h.getCurrentPushToken.mockClear()
        h.toast.success.mockClear()
        h.monthlyReports = []
        h.toast.error.mockClear()

        h.isPushConfigured = true
        ;(Notification as unknown as { permission: NotificationPermission }).permission = 'granted'
        // 預設「先前已開啟過」（意圖旗標存在），維持既有事件開關測試的前提；
        // 個別測試（未設定意圖旗標的情境）會自行覆寫成空陣列。
        usePushIntentStore.setState({ enabledUserIds: [USER_ID] })

        useAuthStore.setState({
            status: 'ready',
            user: { id: USER_ID, email: 'alice@example.com', user_metadata: {} } as any,
            session: null
        })
        useAccountStore.setState({ accounts: [] })
        useSessionStore.getState().setActiveGroup(null)
        useUiStore.setState({ theme: 'system', language: 'zh-TW' })
    })

    it('renders profile, appearance, notifications, budget and more-settings sections', async () => {
        renderPage()
        // 讓非同步的 isPushBrowserSupported 掛載檢查先跑完，避免其 setState 落在 act() 之外。
        await waitFor(() => expect(h.isPushBrowserSupported).toHaveBeenCalled())

        expect(screen.getByText('Alice')).toBeTruthy()
        expect(screen.getByText('外觀')).toBeTruthy()
        expect(screen.getByText('通知')).toBeTruthy()
        expect(screen.getByText('預算')).toBeTruthy()
        expect(screen.getByText('更多設定')).toBeTruthy()
        expect(screen.getByText(formatCurrency(5000, 'TWD'))).toBeTruthy()
        expect(screen.getByText('群組')).toBeTruthy()
        expect(screen.getByText('歷史月報')).toBeTruthy()
        expect(screen.getByText('帳戶設定')).toBeTruthy()
    })

    it('opens report history drawer from the settings card', async () => {
        h.monthlyReports = [
            {
                row: { year_month: '2026-05', user_id: USER_ID, read_at: null },
                data: {
                    personal: { total: 1000 },
                    group: { splitTotal: 200 },
                    mom: { prevTotal: 0, delta: 0, deltaPct: 0 },
                    yearMonth: '2026-05',
                    generatedAt: ''
                }
            } as any
        ]
        renderPage()

        fireEvent.click(screen.getByText('歷史月報'))
        expect(screen.getByText('2026-05')).toBeTruthy()
        expect(screen.getByText(formatCurrency(1200, 'TWD'))).toBeTruthy()
    })

    it('lists report history and navigates to selected month on click then closes drawer', async () => {
        h.monthlyReports = [
            {
                row: { year_month: '2026-05', read_at: null },
                data: {
                    personal: { total: 1000 },
                    group: { splitTotal: 200 },
                    mom: { prevTotal: 0, delta: 0, deltaPct: 0 },
                    yearMonth: '2026-05',
                    generatedAt: ''
                }
            } as any,
            {
                row: { year_month: '2026-04', read_at: null },
                data: {
                    personal: { total: 800 },
                    group: { splitTotal: 100 },
                    mom: { prevTotal: 0, delta: 0, deltaPct: 0 },
                    yearMonth: '2026-04',
                    generatedAt: ''
                }
            } as any
        ]
        renderPage()

        fireEvent.click(screen.getByText('歷史月報'))
        const drawerContent = screen.getByTestId('report-history-drawer-content')
        expect(drawerContent.getAttribute('data-state')).toBe('open')

        fireEvent.click(screen.getByText('2026-05'))

        await waitFor(() =>
            expect(h.navigate).toHaveBeenCalledWith({
                to: '/reports/$yearMonth',
                params: { yearMonth: '2026-05' }
            })
        )
        await waitFor(() => expect(drawerContent.getAttribute('data-state')).toBe('closed'))
    })

    it('renders empty message when there is no report history', async () => {
        h.monthlyReports = []
        renderPage()

        fireEvent.click(screen.getByText('歷史月報'))
        expect(screen.getByText('尚未有月報紀錄')).toBeTruthy()
    })

    it('opens the changelog drawer from the version card', async () => {
        renderPage()
        await waitFor(() => expect(h.isPushBrowserSupported).toHaveBeenCalled())

        fireEvent.click(screen.getByText('版本與更新日誌'))

        expect(screen.getByText('2.0.0')).toBeTruthy()
        expect(screen.getAllByText('變更').length).toBeGreaterThan(0)
        expect(screen.getAllByText('新增').length).toBeGreaterThan(0)
        expect(screen.getByText('全面改寫為 React 19，完成新版前端架構切換。')).toBeTruthy()
    })

    it('renders changelog drawer items in English when the locale is English', async () => {
        await i18next.changeLanguage('en')
        useUiStore.setState({ language: 'en' })
        try {
            renderPage()
            await waitFor(() => expect(h.isPushBrowserSupported).toHaveBeenCalled())

            fireEvent.click(screen.getByText('Version & Changelog'))

            expect(screen.getByText('2.0.0')).toBeTruthy()
            expect(screen.getAllByText('Changed').length).toBeGreaterThan(0)
            expect(screen.getAllByText('Added').length).toBeGreaterThan(0)
            expect(screen.getByText('Security')).toBeTruthy()
            expect(screen.getByText('Fully rewrote the app as a React 19 frontend with TanStack Router, TanStack Query, Zustand, shadcn/ui-style components, and Tailwind CSS v4.')).toBeTruthy()
            expect(screen.queryByText('全面改寫為 React 19，完成新版前端架構切換。')).toBeNull()
        } finally {
            await i18next.changeLanguage('zh-TW')
            useUiStore.setState({ language: 'zh-TW' })
        }
    })

    it('edits and saves the display name', async () => {
        renderPage()

        fireEvent.click(screen.getByLabelText('edit-display-name'))
        fireEvent.change(screen.getByPlaceholderText('輸入顯示名稱'), { target: { value: 'Bob' } })
        fireEvent.click(screen.getByLabelText('save-display-name'))

        await waitFor(() => expect(h.updateDisplayName.mutateAsync).toHaveBeenCalled())
        expect(h.updateDisplayName.mutateAsync).toHaveBeenCalledWith({ userId: USER_ID, displayName: 'Bob' })
        expect(h.toast.success).toHaveBeenCalledWith('顯示名稱已更新')
    })

    it('rejects an empty display name without calling the mutation', async () => {
        renderPage()
        await waitFor(() => expect(h.isPushBrowserSupported).toHaveBeenCalled())

        fireEvent.click(screen.getByLabelText('edit-display-name'))
        fireEvent.change(screen.getByPlaceholderText('輸入顯示名稱'), { target: { value: '  ' } })
        fireEvent.click(screen.getByLabelText('save-display-name'))

        expect(screen.getByText('顯示名稱不能為空')).toBeTruthy()
        expect(h.updateDisplayName.mutateAsync).not.toHaveBeenCalled()
    })

    it('rejects a display name over 50 characters without calling the mutation', async () => {
        renderPage()
        await waitFor(() => expect(h.isPushBrowserSupported).toHaveBeenCalled())

        fireEvent.click(screen.getByLabelText('edit-display-name'))
        fireEvent.change(screen.getByPlaceholderText('輸入顯示名稱'), { target: { value: 'a'.repeat(51) } })
        fireEvent.click(screen.getByLabelText('save-display-name'))

        expect(screen.getByText('顯示名稱最多 50 個字元')).toBeTruthy()
        expect(h.updateDisplayName.mutateAsync).not.toHaveBeenCalled()
    })

    it('saves a personal budget amount from the drawer', async () => {
        renderPage()

        fireEvent.click(screen.getByText('個人預算'))
        fireEvent.change(screen.getByPlaceholderText('輸入預算金額'), { target: { value: '8000' } })
        fireEvent.click(screen.getByRole('button', { name: '儲存' }))

        await waitFor(() => expect(h.updatePersonalBudget.mutateAsync).toHaveBeenCalled())
        expect(h.updatePersonalBudget.mutateAsync).toHaveBeenCalledWith({ userId: USER_ID, budget: 8000 })
        expect(h.toast.success).toHaveBeenCalledWith('個人預算已儲存')
    })

    it('rejects a negative personal budget without calling the mutation', async () => {
        renderPage()
        await waitFor(() => expect(h.isPushBrowserSupported).toHaveBeenCalled())

        fireEvent.click(screen.getByText('個人預算'))
        fireEvent.change(screen.getByPlaceholderText('輸入預算金額'), { target: { value: '-100' } })
        // input type="number" min="0" 會被瀏覽器（與 happy-dom）原生 constraint validation
        // 擋在「按鈕點擊觸發 submit」這關（button click 不會派發 submit 事件）——這在真實瀏覽器
        // 也一樣，屬於既有的 belt-and-suspenders 設計（同 Vue 版 min="0" + zod 雙重防線）。
        // 直接對 form 觸發 submit 事件以繞過原生 gate，驗證 JS 驗證邏輯本身沒有壞掉。
        fireEvent.submit(document.querySelector('form') as HTMLFormElement)

        expect(screen.getByText('請輸入有效的數字')).toBeTruthy()
        expect(h.updatePersonalBudget.mutateAsync).not.toHaveBeenCalled()
    })

    it('clears the personal budget from the drawer', async () => {
        renderPage()

        fireEvent.click(screen.getByText('個人預算'))
        fireEvent.click(screen.getByRole('button', { name: '清除預算' }))

        await waitFor(() => expect(h.updatePersonalBudget.mutateAsync).toHaveBeenCalled())
        expect(h.updatePersonalBudget.mutateAsync).toHaveBeenCalledWith({ userId: USER_ID, budget: null })
        expect(h.toast.success).toHaveBeenCalledWith('已清除個人預算設定')
    })

    it('logs out only after confirming in the dialog', async () => {
        renderPage()

        fireEvent.click(screen.getByRole('button', { name: '登出' }))
        expect(screen.getByText('您確定要登出嗎？登出後需要重新登入才能使用。')).toBeTruthy()
        expect(h.signOut).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: '確認登出' }))

        await waitFor(() => expect(h.signOut).toHaveBeenCalled())
        expect(h.toast.success).toHaveBeenCalledWith('已成功登出')
    })

    it('renders the unconfigured state and disables the main toggle when push is not set up', async () => {
        h.isPushConfigured = false
        renderPage()
        await waitFor(() => expect(h.isPushBrowserSupported).toHaveBeenCalled())

        expect(screen.getByText('推播功能尚未設定')).toBeTruthy()
        const mainSwitch = screen.getByRole('switch', { name: 'toggle-push-notifications' }) as HTMLButtonElement
        expect(mainSwitch.disabled).toBe(true)
    })

    it('toggles a notification event preference and writes the merged prefs payload', async () => {
        renderPage()

        const splitAssignedSwitch = await waitFor(() =>
            screen.getByRole('switch', { name: 'toggle-split_assigned' })
        )
        fireEvent.click(splitAssignedSwitch)

        await waitFor(() => expect(h.updateNotificationPrefs.mutateAsync).toHaveBeenCalled())
        expect(h.updateNotificationPrefs.mutateAsync).toHaveBeenCalledWith({
            userId: USER_ID,
            prefs: { split_assigned: false, settlement_received: true, monthly_report: true }
        })
    })

    it('does not silently re-register on mount when the push intent flag is not set', async () => {
        usePushIntentStore.setState({ enabledUserIds: [] })
        renderPage()

        // 讓非同步的 isPushBrowserSupported 掛載檢查跑完，確保沒有殘留的排隊呼叫沒被算到。
        await waitFor(() => expect(h.isPushBrowserSupported).toHaveBeenCalled())
        expect(h.requestPushToken).not.toHaveBeenCalled()
        expect(h.registerDevice.mutate).not.toHaveBeenCalled()
        expect(h.registerDevice.mutateAsync).not.toHaveBeenCalled()

        // 意圖旗標未設定時，主開關即使瀏覽器權限是 granted 也應顯示為關閉。
        const mainSwitch = screen.getByRole('switch', { name: 'toggle-push-notifications' }) as HTMLButtonElement
        expect(mainSwitch.getAttribute('data-state')).toBe('unchecked')
    })

    it('clears the push intent flag when the main toggle is turned off', async () => {
        renderPage()

        const mainSwitch = await waitFor(() => screen.getByRole('switch', { name: 'toggle-push-notifications' }))
        fireEvent.click(mainSwitch)

        await waitFor(() => expect(h.unregisterDevice.mutateAsync).toHaveBeenCalled())
        expect(usePushIntentStore.getState().enabledUserIds).not.toContain(USER_ID)
    })

    it('sets the push intent flag when the main toggle is turned on', async () => {
        usePushIntentStore.setState({ enabledUserIds: [] })
        ;(Notification as unknown as { permission: NotificationPermission }).permission = 'default'
        renderPage()

        const mainSwitch = await waitFor(() => screen.getByRole('switch', { name: 'toggle-push-notifications' }))
        fireEvent.click(mainSwitch)

        await waitFor(() => expect(h.registerDevice.mutateAsync).toHaveBeenCalled())
        expect(usePushIntentStore.getState().enabledUserIds).toContain(USER_ID)
    })
})
