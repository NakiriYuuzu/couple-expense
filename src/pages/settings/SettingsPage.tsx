import { useEffect, useMemo, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
    LogOut,
    Sun,
    Moon,
    Monitor,
    Languages,
    Bell,
    ChevronRight,
    UserCog,
    Users,
    Wallet,
    UserCircle,
    Info,
    Pencil,
    Check,
    X,
    UserPlus,
    Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useUiStore, type ThemePref } from '@/shared/stores/ui'
import { useAuthStore } from '@/features/auth/authStore'
import { useAccountStore } from '@/features/auth/accountStore'
import {
    signOut,
    signInWithGoogle,
    switchToAccount,
    removeStoredAccount
} from '@/features/auth/actions'
import { useMyProfile, usePersonalBudget } from '@/features/user/api/useProfile'
import { useUpdateDisplayName, useUpdatePersonalBudget } from '@/features/user/api/useProfileMutations'
import { useExpenses } from '@/features/expense/api/useExpenses'
import { useMonthlyReports } from '@/features/report/api/useMonthlyReports'
import { deriveExpenseStats } from '@/features/statistics/selectors'
import { DEFAULT_NOTIFICATION_PREFS, useNotificationPrefs } from '@/features/notification/api/useNotificationPrefs'
import {
    useRegisterDevice,
    useUnregisterDevice,
    useUpdateNotificationPrefs
} from '@/features/notification/api/useNotificationMutations'
import { isPushConfigured, isPushBrowserSupported, requestPushToken, getCurrentPushToken } from '@/shared/lib/firebase'
import { usePushIntentStore } from '@/features/notification/pushIntentStore'
import { formatCurrency } from '@/shared/lib/money'
import { formatDateTime } from '@/shared/lib/datetime'
import { changelog, type ChangelogEntry } from '@/shared/changelog'
import type { CategoryId } from '@/entities/expense/types'
import type { NotificationPrefs } from '@/shared/lib/database.types'
import type { AppLocale } from '@/shared/i18n'

// Phase 5.3：從 Phase 3 骨架補完到 Vue SettingsPage.vue parity（個人資料編輯、個人預算、
// 帳號管理移入 Drawer、登出改為確認 Dialog）。主題/語言沿用既有 useUiStore 三步同步邏輯
// （store 變更 → useThemeSync/useLanguageSync 反映 DOM/i18n → useUserSettingsSync 寫回
// user_settings），本頁只呼叫 setTheme/setLanguage，不重造同步機制。
// 個人月度預算沒有幣別欄位（user_profiles.personal_monthly_budget 純數字），一律以 TWD
// 格式化——不隨目前檢視中的群組幣別變動（對照 DashboardPage 的個人預算環：只在個人模式
// 顯示，此時 currency 必為 TWD 預設值）。

const THEMES: { value: ThemePref; Icon: typeof Sun }[] = [
    { value: 'light', Icon: Sun },
    { value: 'dark', Icon: Moon },
    { value: 'system', Icon: Monitor }
]

const LANGS: AppLocale[] = ['zh-TW', 'en']

const DISPLAY_NAME_MAX_LENGTH = 50

const NOTIFICATION_EVENTS: { key: keyof NotificationPrefs; labelKey: string }[] = [
    { key: 'split_assigned', labelKey: 'settings.notifications.splitAssigned' },
    { key: 'settlement_received', labelKey: 'settings.notifications.settlementReceived' },
    { key: 'monthly_report', labelKey: 'settings.notifications.monthlyReport' }
]

type ChangelogSectionType = ChangelogEntry['sections'][number]['type']

const CHANGELOG_SECTION_BADGE_CLASSES: Record<ChangelogSectionType, string> = {
    added: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    changed: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    fixed: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    security: 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
}

const CHANGELOG_SECTION_LABELS: Record<ChangelogSectionType, { zhTW: string; en: string }> = {
    added: { zhTW: '新增', en: 'Added' },
    changed: { zhTW: '變更', en: 'Changed' },
    fixed: { zhTW: '修復', en: 'Fixed' },
    security: { zhTW: '安全', en: 'Security' }
}

export default function SettingsPage() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()

    const theme = useUiStore((s) => s.theme)
    const language = useUiStore((s) => s.language)
    const setTheme = useUiStore((s) => s.setTheme)
    const setLanguage = useUiStore((s) => s.setLanguage)

    const currentUser = useAuthStore((s) => s.user)
    const currentUserId = currentUser?.id ?? null
    const userEmail = currentUser?.email ?? ''
    const accounts = useAccountStore((s) => s.accounts)

    const { data: myProfile } = useMyProfile(currentUserId)
    const { data: personalBudget } = usePersonalBudget(currentUserId)
    const updateDisplayName = useUpdateDisplayName()
    const updatePersonalBudget = useUpdatePersonalBudget()

    const displayName = myProfile?.display_name || userEmail
    const avatarUrl =
        myProfile?.avatar_url || (currentUser?.user_metadata?.avatar_url as string | undefined) || ''

    // ── 顯示名稱行內編輯 ──────────────────────────────────────
    const [isEditingName, setIsEditingName] = useState(false)
    const [editNameValue, setEditNameValue] = useState('')
    const [nameError, setNameError] = useState('')

    const startEditingName = () => {
        setEditNameValue(myProfile?.display_name ?? '')
        setNameError('')
        setIsEditingName(true)
    }

    const cancelEditingName = () => {
        setIsEditingName(false)
        setNameError('')
    }

    const saveDisplayName = async () => {
        const trimmed = editNameValue.trim()
        if (!trimmed) {
            setNameError(t('settings.displayNameRequired'))
            return
        }
        if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
            setNameError(t('settings.displayNameMaxLength'))
            return
        }
        if (trimmed === (myProfile?.display_name ?? '')) {
            setIsEditingName(false)
            return
        }
        if (!currentUserId) return

        try {
            await updateDisplayName.mutateAsync({ userId: currentUserId, displayName: trimmed })
            toast.success(t('settings.displayNameSaved'))
            setIsEditingName(false)
        } catch {
            toast.error(t('settings.displayNameError'))
        }
    }

    // ── 推播通知 ──────────────────────────────────────────────
    // 主開關的「開/關」以 usePushIntentStore 的 per-user 意圖旗標為準，而非只看瀏覽器
    // Notification.permission——否則使用者關閉開關後，只要瀏覽器權限仍是 granted，
    // 下次開 app 就會被下面的靜默刷新 effect 重新註冊，形同「關閉」沒有作用。
    // pushEnabled 因此是「意圖旗標 && 瀏覽器權限仍是 granted」兩者皆真才算真正開啟；
    // pushSupported 需要非同步的 isPushBrowserSupported() 才能判定，掛載前以 null（檢查中）
    // 呈現，開關維持 disabled。
    const pushIntentEnabled = usePushIntentStore((s) =>
        currentUserId ? s.enabledUserIds.includes(currentUserId) : false
    )
    const enablePushIntent = usePushIntentStore((s) => s.enable)
    const disablePushIntent = usePushIntentStore((s) => s.disable)

    const [pushSupported, setPushSupported] = useState<boolean | null>(null)
    const [pushToggling, setPushToggling] = useState(false)

    const pushEnabled =
        pushIntentEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted'

    const { data: notificationPrefsData } = useNotificationPrefs(currentUserId)
    const notificationPrefs = notificationPrefsData ?? DEFAULT_NOTIFICATION_PREFS
    const updateNotificationPrefs = useUpdateNotificationPrefs()
    const registerDevice = useRegisterDevice()
    const unregisterDevice = useUnregisterDevice()

    useEffect(() => {
        let cancelled = false
        void isPushBrowserSupported().then((supported) => {
            if (!cancelled) setPushSupported(supported)
        })
        return () => {
            cancelled = true
        }
    }, [])

    // token 輪換：開啟 app 時，若使用者過去曾明確開啟（意圖旗標）且瀏覽器權限仍是 granted，
    // 靜默重新 getToken 並 upsert 刷新 last_seen_at——旗標未設定（使用者關閉過）就不動作，
    // 不會把明確關閉過的裝置又重新註冊回去。
    // deps 放實際讀取的 currentUserId/pushIntentEnabled（而非 []）：auth 較晚解析、或掛載當下
    // 意圖旗標尚未就緒時，effect 需要在條件轉為真的那次重新求值才不會漏跑（stale closure）。
    // hasSilentlyRefreshedPush 這支 ref 確保同一 session 只嘗試一次，不因 deps 變動重複刷新；
    // registerDevice 改用 mutate（非 mutateAsync）+ onError，避免 fire-and-forget 的 promise
    // 沒接 catch 造成 unhandled rejection——這是背景輪換非使用者操作，失敗只記 log 不 toast。
    const hasSilentlyRefreshedPush = useRef(false)
    useEffect(() => {
        if (hasSilentlyRefreshedPush.current) return
        if (!currentUserId || !pushIntentEnabled) return
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

        hasSilentlyRefreshedPush.current = true
        let cancelled = false
        void requestPushToken().then((result) => {
            if (cancelled || result.status !== 'success') return
            registerDevice.mutate(
                { userId: currentUserId, token: result.token },
                { onError: (error) => console.warn('推播 token 靜默刷新失敗', error) }
            )
        })
        return () => {
            cancelled = true
        }
    }, [currentUserId, pushIntentEnabled])

    const pushStatusDesc = !isPushConfigured
        ? t('settings.notifications.unconfigured')
        : pushSupported === false
          ? t('settings.notifications.unsupported')
          : !pushEnabled && typeof Notification !== 'undefined' && Notification.permission === 'denied'
            ? t('settings.notifications.permissionDenied')
            : t('settings.notifications.desc')

    const handleTogglePush = async (checked: boolean) => {
        if (!currentUserId) return
        setPushToggling(true)
        try {
            if (checked) {
                const result = await requestPushToken()
                if (result.status === 'success') {
                    await registerDevice.mutateAsync({ userId: currentUserId, token: result.token })
                    enablePushIntent(currentUserId)
                } else if (result.status === 'permission-denied') {
                    toast.error(t('settings.notifications.permissionDenied'))
                } else {
                    toast.error(t('settings.notifications.enableError'))
                }
            } else {
                const token = await getCurrentPushToken()
                if (token) await unregisterDevice.mutateAsync({ token })
                disablePushIntent(currentUserId)
            }
        } catch {
            toast.error(t(checked ? 'settings.notifications.enableError' : 'settings.notifications.disableError'))
        } finally {
            setPushToggling(false)
        }
    }

    const handleTogglePref = async (key: keyof NotificationPrefs, checked: boolean) => {
        if (!currentUserId) return
        try {
            await updateNotificationPrefs.mutateAsync({
                userId: currentUserId,
                prefs: { ...notificationPrefs, [key]: checked }
            })
        } catch {
            toast.error(t('settings.notifications.prefsError'))
        }
    }

    // ── 個人預算 ──────────────────────────────────────────────
    const [isBudgetDrawerOpen, setIsBudgetDrawerOpen] = useState(false)
    const [budgetInput, setBudgetInput] = useState('')
    const [budgetError, setBudgetError] = useState('')

    // 本月個人支出（group_id === null）：與 DashboardPage 的個人預算環同一套定義，
    // 兩處百分比才不會互相矛盾。
    const { data: expensesData } = useExpenses()
    const personalMonthTotal = useMemo(() => {
        const personalExpenses = (expensesData ?? []).filter((e) => e.group_id === null)
        return deriveExpenseStats(
            personalExpenses.map((e) => ({ date: e.date, amount: e.amount, category: e.category as CategoryId }))
        ).month
    }, [expensesData])

    const hasBudget = (personalBudget ?? 0) > 0
    const budgetUsagePct =
        hasBudget && personalBudget ? Math.min((personalMonthTotal / personalBudget) * 100, 100) : 0

    const openBudgetDrawer = () => {
        setBudgetInput(personalBudget != null ? String(personalBudget) : '')
        setBudgetError('')
        setIsBudgetDrawerOpen(true)
    }

    const saveBudget = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!currentUserId) return

        const trimmed = budgetInput.trim()
        let value: number | null = null
        if (trimmed !== '') {
            const parsed = Number(trimmed)
            if (!Number.isFinite(parsed) || parsed < 0) {
                setBudgetError(t('validation.number'))
                return
            }
            value = parsed
        }

        setBudgetError('')
        try {
            await updatePersonalBudget.mutateAsync({ userId: currentUserId, budget: value })
            toast.success(t('settings.personalBudgetSaved'))
            setIsBudgetDrawerOpen(false)
        } catch {
            toast.error(t('common.error'))
        }
    }

    const clearBudget = async () => {
        if (!currentUserId) return
        try {
            await updatePersonalBudget.mutateAsync({ userId: currentUserId, budget: null })
            setBudgetInput('')
            toast.success(t('settings.personalBudgetCleared'))
            setIsBudgetDrawerOpen(false)
        } catch {
            toast.error(t('common.error'))
        }
    }

    // ── 帳號管理（Drawer） ────────────────────────────────────
    const [isAccountDrawerOpen, setIsAccountDrawerOpen] = useState(false)
    const [isReportHistoryDrawerOpen, setIsReportHistoryDrawerOpen] = useState(false)
    const [isChangelogDrawerOpen, setIsChangelogDrawerOpen] = useState(false)
    const { data: reportHistory = [] } = useMonthlyReports()
    const changelogItemLocale = i18n.resolvedLanguage === 'en' || i18n.language === 'en' ? 'en' : 'zhTW'

    const handleAddAccount = async () => {
        try {
            await signInWithGoogle('/settings')
        } catch {
            toast.error(t('settings.addAccountError'))
        }
    }

    const handleSwitch = async (accountId: string) => {
        const account = accounts.find((a) => a.id === accountId)
        if (!account) return
        try {
            await switchToAccount(account, '/settings')
        } catch {
            toast.error(t('settings.switchAccountError'))
        }
    }

    const handleRemove = async (accountId: string) => {
        const wasCurrent = accountId === currentUserId
        try {
            await removeStoredAccount(accountId)
            toast.success(t('settings.accountRemoved'))
            if (wasCurrent) void navigate({ to: '/' })
        } catch {
            toast.error(t('settings.logoutError'))
        }
    }

    // ── 登出（確認 Dialog） ───────────────────────────────────
    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false)

    const handleLogout = async () => {
        try {
            await signOut()
            toast.success(t('settings.logoutSuccess'))
            void navigate({ to: '/' })
        } catch {
            toast.error(t('settings.logoutError'))
        } finally {
            setIsLogoutDialogOpen(false)
        }
    }

    return (
        <main className="px-4 pb-28">
            {/* 個人資料 */}
            <section className="flex flex-col items-center gap-3 py-6">
                <div className="h-16 w-16 overflow-hidden rounded-full bg-primary text-primary-foreground">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl font-semibold">
                            {(displayName || '?').charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
                <div className="text-center">
                    {!isEditingName ? (
                        <div className="flex items-center justify-center gap-1.5">
                            <p className="text-lg font-semibold text-foreground">{displayName}</p>
                            <button
                                type="button"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                                aria-label="edit-display-name"
                                onClick={startEditingName}
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1.5">
                            <div className="flex items-center gap-1.5">
                                <Input
                                    value={editNameValue}
                                    className={`h-8 w-48 text-center text-sm ${nameError ? 'border-destructive' : ''}`}
                                    placeholder={t('settings.displayNamePlaceholder')}
                                    disabled={updateDisplayName.isPending}
                                    onChange={(e) => setEditNameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') void saveDisplayName()
                                        if (e.key === 'Escape') cancelEditingName()
                                    }}
                                />
                                <button
                                    type="button"
                                    className="rounded-md p-1 text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50 dark:hover:bg-green-950"
                                    aria-label="save-display-name"
                                    disabled={updateDisplayName.isPending}
                                    onClick={() => void saveDisplayName()}
                                >
                                    <Check className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                                    aria-label="cancel-edit-display-name"
                                    disabled={updateDisplayName.isPending}
                                    onClick={cancelEditingName}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
                        </div>
                    )}
                    <p className="text-sm text-muted-foreground">{userEmail}</p>
                </div>
            </section>

            <div className="space-y-4">
                <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {t('settings.appearanceSection')}
                </h2>

                {/* 主題 */}
                <section className="glass hover-transition rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-purple-600 dark:text-purple-400">
                                <Moon className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-medium text-foreground">{t('settings.theme')}</h3>
                                <p className="text-sm text-muted-foreground">{t('settings.themeDesc')}</p>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            {THEMES.map(({ value, Icon }) => (
                                <Button
                                    key={value}
                                    type="button"
                                    variant={theme === value ? 'default' : 'outline'}
                                    size="icon-sm"
                                    onClick={() => setTheme(value)}
                                >
                                    <Icon className="h-4 w-4" />
                                </Button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 語言 */}
                <section className="glass hover-transition rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-blue-600 dark:text-blue-400">
                                <Languages className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-medium text-foreground">{t('settings.language')}</h3>
                                <p className="text-sm text-muted-foreground">{t('settings.languageDesc')}</p>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            {LANGS.map((lang) => (
                                <Button
                                    key={lang}
                                    type="button"
                                    variant={language === lang ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setLanguage(lang)}
                                >
                                    {t(`settings.languages.${lang}`)}
                                </Button>
                            ))}
                        </div>
                    </div>
                </section>

                <h2 className="mt-8 mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {t('settings.notificationsSection')}
                </h2>

                {/* 推播通知 */}
                <section className="glass hover-transition rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-rose-600 dark:text-rose-400">
                                <Bell className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-medium text-foreground">{t('settings.notifications.title')}</h3>
                                <p className="text-sm text-muted-foreground">{pushStatusDesc}</p>
                            </div>
                        </div>
                        <Switch
                            checked={pushEnabled}
                            disabled={!isPushConfigured || pushSupported !== true || pushToggling}
                            aria-label="toggle-push-notifications"
                            onCheckedChange={(checked) => void handleTogglePush(checked)}
                        />
                    </div>

                    {pushEnabled && isPushConfigured && pushSupported && (
                        <div className="mt-4 space-y-3 border-t border-glass-border pt-4">
                            <h4 className="text-xs font-medium text-muted-foreground">
                                {t('settings.notifications.eventsTitle')}
                            </h4>
                            {NOTIFICATION_EVENTS.map(({ key, labelKey }) => (
                                <div key={key} className="flex items-center justify-between">
                                    <span className="text-sm text-foreground">{t(labelKey)}</span>
                                    <Switch
                                        checked={notificationPrefs[key]}
                                        disabled={updateNotificationPrefs.isPending}
                                        aria-label={`toggle-${key}`}
                                        onCheckedChange={(checked) => void handleTogglePref(key, checked)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <h2 className="mt-8 mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {t('settings.budgetSection')}
                </h2>

                {/* 個人預算 */}
                <div
                    className="glass hover-transition press-feedback cursor-pointer rounded-2xl p-4"
                    onClick={openBudgetDrawer}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-amber-600 dark:text-amber-400">
                                <Wallet className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-medium text-foreground">{t('settings.personalBudget')}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {personalBudget
                                        ? formatCurrency(personalBudget, 'TWD')
                                        : t('settings.personalBudgetNotSet')}
                                </p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                </div>

                {/* 更多設定 */}
                <div className="mt-8">
                    <h2 className="mb-4 text-sm font-medium text-muted-foreground">{t('settings.moreSettings')}</h2>

                    <div
                        className="glass hover-transition press-feedback mb-3 cursor-pointer rounded-2xl p-4"
                        onClick={() => void navigate({ to: '/groups' })}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-emerald-600 dark:text-emerald-400">
                                    <Users className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-medium text-foreground">{t('group.title')}</h3>
                                    <p className="text-sm text-muted-foreground">{t('group.manageGroups')}</p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </div>

                    <div className="glass mb-3 rounded-2xl p-4">
                        <div className="space-y-4">
                            <div className="mb-3 flex items-center gap-3">
                                <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400">
                                    <UserCircle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-medium text-foreground">{t('settings.account')}</h3>
                                    <p className="text-sm text-muted-foreground">{userEmail}</p>
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                className="press-feedback w-full justify-start"
                                onClick={() => setIsAccountDrawerOpen(true)}
                            >
                                <UserCog className="mr-2 h-4 w-4" />
                                {t('settings.switchAccount')}
                                {accounts.length > 1 && (
                                    <span className="ml-auto text-muted-foreground">{accounts.length}</span>
                                )}
                            </Button>

                            <Button
                                variant="outline"
                                className="press-feedback w-full justify-start text-destructive hover:text-destructive"
                                onClick={() => setIsLogoutDialogOpen(true)}
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                {t('settings.logout')}
                            </Button>
                        </div>
                    </div>

                    <div
                        className="glass hover-transition press-feedback mb-3 cursor-pointer rounded-2xl p-4"
                        onClick={() => setIsReportHistoryDrawerOpen(true)}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-cyan-600 dark:text-cyan-400">
                                    <Wallet className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-medium text-foreground">{t('report.settingsHistoryNavTitle')}</h3>
                                    <p className="text-sm text-muted-foreground">{t('report.settingsHistoryNavSubtitle')}</p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </div>

                    <button
                        type="button"
                        className="glass hover-transition press-feedback w-full cursor-pointer rounded-2xl p-4 text-left"
                        onClick={() => setIsChangelogDrawerOpen(true)}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="glass-light flex h-10 w-10 items-center justify-center rounded-lg text-sky-600 dark:text-sky-400">
                                    <Info className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-medium text-foreground">
                                        {t('settings.versionChangelog')}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {t('settings.currentVersion', { version: __APP_VERSION__ })}
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </button>
                </div>
            </div>

            {/* 登出確認 Dialog */}
            <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('settings.logoutConfirmTitle')}</DialogTitle>
                        <DialogDescription>{t('settings.logoutConfirmDesc')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsLogoutDialogOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={() => void handleLogout()}>
                            {t('settings.confirmLogout')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 月報歷史 Drawer */}
            <Drawer open={isReportHistoryDrawerOpen} onOpenChange={setIsReportHistoryDrawerOpen}>
                <DrawerContent className="max-h-[90vh]" data-testid="report-history-drawer-content">
                    <DrawerHeader>
                        <DrawerTitle>{t('report.settingsHistoryDrawerTitle')}</DrawerTitle>
                    </DrawerHeader>
                    <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-6">
                        {reportHistory.length > 0 ? (
                            reportHistory.map((report) => (
                                <button
                                    type="button"
                                    key={report.row.year_month}
                                    className="glass-light flex items-center justify-between rounded-xl p-3 text-left press-feedback"
                                    onClick={() => {
                                        void navigate({
                                            to: '/reports/$yearMonth',
                                            params: { yearMonth: report.row.year_month }
                                        })
                                        setIsReportHistoryDrawerOpen(false)
                                    }}
                                >
                                    <p className="text-sm font-medium text-foreground">{report.row.year_month}</p>
                                    <p className="text-sm font-semibold text-foreground">
                                        {formatCurrency(
                                            report.data.personal.total + report.data.group.splitTotal,
                                            'TWD'
                                        )}
                                    </p>
                                </button>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                {t('report.settingsHistoryEmpty')}
                            </p>
                        )}
                    </div>
                </DrawerContent>
            </Drawer>

            {/* 更新日誌 Drawer */}
            <Drawer open={isChangelogDrawerOpen} onOpenChange={setIsChangelogDrawerOpen}>
                <DrawerContent className="max-h-[90vh]" data-testid="changelog-drawer-content">
                    <DrawerHeader>
                        <DrawerTitle>{t('settings.versionChangelog')}</DrawerTitle>
                    </DrawerHeader>
                    <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-6">
                        {changelog.map((entry) => (
                            <article key={entry.version} className="space-y-3">
                                <div>
                                    <h3 className="text-base font-semibold text-foreground">{entry.version}</h3>
                                    <p className="text-xs text-muted-foreground">{entry.date}</p>
                                </div>
                                <div className="space-y-3">
                                    {entry.sections.map((section, index) => (
                                        <section key={`${entry.version}-${section.type}-${index}`} className="space-y-2">
                                            <span
                                                className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${CHANGELOG_SECTION_BADGE_CLASSES[section.type]}`}
                                            >
                                                {CHANGELOG_SECTION_LABELS[section.type][changelogItemLocale]}
                                            </span>
                                            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                                                {section.items.map((item) => (
                                                    <li key={item.en}>{item[changelogItemLocale]}</li>
                                                ))}
                                            </ul>
                                        </section>
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>
                </DrawerContent>
            </Drawer>

            {/* 帳號切換 Drawer */}
            <Drawer open={isAccountDrawerOpen} onOpenChange={setIsAccountDrawerOpen}>
                <DrawerContent className="max-h-[90vh]">
                    <DrawerHeader>
                        <DrawerTitle>{t('settings.manageAccounts')}</DrawerTitle>
                    </DrawerHeader>
                    <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-6">
                        {accounts.map((account) => {
                            const isCurrent = account.id === currentUserId
                            return (
                                <div key={account.id} className="glass-light flex items-center gap-3 rounded-xl p-3">
                                    {account.avatarUrl ? (
                                        <img
                                            src={account.avatarUrl}
                                            alt=""
                                            className="h-9 w-9 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/15 text-sm font-medium text-brand-primary">
                                            {(account.displayName || account.email || '?').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {account.displayName || account.email}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {t('auth.lastUsed', { time: formatDateTime(account.lastUsedAt) })}
                                        </p>
                                    </div>
                                    {isCurrent ? (
                                        <span className="flex items-center gap-1 text-xs text-brand-primary">
                                            <Check className="h-4 w-4" />
                                            {t('settings.current')}
                                        </span>
                                    ) : (
                                        <Button variant="ghost" size="sm" onClick={() => void handleSwitch(account.id)}>
                                            {t('settings.switchAccount')}
                                        </Button>
                                    )}
                                    {!isCurrent && accounts.length > 1 && (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="remove-account"
                                            onClick={() => void handleRemove(account.id)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    )}
                                </div>
                            )
                        })}

                        <Button variant="outline" className="mt-1" onClick={() => void handleAddAccount()}>
                            <UserPlus className="h-4 w-4" />
                            {t('settings.addAccountWithGoogle')}
                        </Button>
                    </div>
                </DrawerContent>
            </Drawer>

            {/* 個人預算設定 Drawer */}
            <Drawer open={isBudgetDrawerOpen} onOpenChange={setIsBudgetDrawerOpen}>
                <DrawerContent className="max-h-[90vh]">
                    <DrawerHeader>
                        <DrawerTitle>{t('settings.personalBudgetTitle')}</DrawerTitle>
                    </DrawerHeader>
                    <form className="space-y-4 px-4 pb-6" onSubmit={(e) => void saveBudget(e)}>
                        <div className="space-y-2">
                            <Label htmlFor="personal-budget-input">{t('settings.monthlyBudgetAmount')}</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">NT</span>
                                <Input
                                    id="personal-budget-input"
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={budgetInput}
                                    placeholder={t('settings.enterBudgetAmount')}
                                    className={budgetError ? 'border-destructive' : ''}
                                    onChange={(e) => setBudgetInput(e.target.value)}
                                />
                            </div>
                            {budgetError && <p className="text-xs text-destructive">{budgetError}</p>}
                            <p className="text-xs text-muted-foreground">{t('settings.personalBudgetDesc')}</p>
                        </div>

                        {hasBudget && (
                            <div className="space-y-2">
                                <Label>{t('settings.currentUsage')}</Label>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${budgetUsagePct}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{formatCurrency(personalMonthTotal, 'TWD')}</span>
                                    <span>{budgetUsagePct.toFixed(0)}%</span>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1"
                                disabled={updatePersonalBudget.isPending}
                                onClick={() => void clearBudget()}
                            >
                                {t('settings.clearBudget')}
                            </Button>
                            <Button type="submit" className="flex-1" disabled={updatePersonalBudget.isPending}>
                                {t('common.save')}
                            </Button>
                        </div>
                    </form>
                </DrawerContent>
            </Drawer>
        </main>
    )
}
