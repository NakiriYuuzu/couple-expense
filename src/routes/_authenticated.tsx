import { Suspense, useState } from 'react'
import { createFileRoute, Outlet, useRouter, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/shared/components/TopBar'
import { BottomNavigation } from '@/shared/components/BottomNavigation'
import { AddExpenseDrawer } from '@/shared/components/AddExpenseDrawer'
import { useScrollDirection } from '@/shared/hooks/useScrollDirection'
import { usePullToRefresh } from '@/shared/hooks/usePullToRefresh'
import { useActiveGroupGuard } from '@/shared/hooks/useActiveGroupGuard'
import { queryClient } from '@/shared/lib/queryClient'
import { requireAuth } from '@/features/auth/guard'

// 受保護頁的共用佈局（pathless layout route）。beforeLoad 先過 auth guard，
// 再掛 TopBar / BottomNavigation / 全域 AddExpenseDrawer，並以 key 觸發 0.2s fade 轉場。
export const Route = createFileRoute('/_authenticated')({
    beforeLoad: requireAuth,
    component: AuthenticatedLayout
})

interface ChromeMeta {
    tab: string
    titleKey: string
    showBack: boolean
}

// 依 pathname 決定 TopBar 標題、作用中的 tab 與返回鈕。
function chromeFor(pathname: string): ChromeMeta {
    if (pathname.startsWith('/expenses/'))
        return { tab: 'expenses', titleKey: 'expense.detail', showBack: true }
    if (pathname === '/expenses')
        return { tab: 'expenses', titleKey: 'nav.expenses', showBack: false }
    if (pathname === '/dashboard')
        return { tab: 'dashboard', titleKey: 'nav.dashboard', showBack: false }
    if (pathname === '/overview')
        return { tab: 'overview', titleKey: 'overview.title', showBack: false }
    if (pathname === '/settings')
        return { tab: 'settings', titleKey: 'settings.title', showBack: false }
    if (pathname === '/groups/new')
        return { tab: '', titleKey: 'group.createGroup', showBack: true }
    if (pathname === '/groups')
        return { tab: '', titleKey: 'group.groupList', showBack: true }
    if (pathname.startsWith('/groups/'))
        return { tab: '', titleKey: 'group.groupSettings', showBack: true }
    if (pathname.startsWith('/reports/'))
        return { tab: '', titleKey: 'report.pageTitle', showBack: true }
    return { tab: '', titleKey: 'common.loading', showBack: false }
}

function AuthenticatedLayout() {
    const { t } = useTranslation()
    const router = useRouter()
    const pathname = useRouterState({ select: (s) => s.location.pathname })
    const hidden = useScrollDirection()
    const [drawerOpen, setDrawerOpen] = useState(false)

    // activeGroup 逐出守衛：被踢出／離開群組後，把殘留的 activeGroupId 收斂回個人模式（掛一次）。
    useActiveGroupGuard()

    // 觸控下拉 → 作廢所有 query，讓可見頁面重新抓取（Phase 4：取代 Vue 版逐 store 手動 refetch）。
    usePullToRefresh({ onRefresh: () => queryClient.invalidateQueries() })

    const meta = chromeFor(pathname)
    // 對齊 Vue 基準（App.vue routesWithBottomNav 白名單）：底部導航只在四個主 tab
    // 顯示，子頁（expense 詳情、群組管理）隱藏。
    const isMainTab = ['/dashboard', '/expenses', '/overview', '/settings'].includes(pathname)

    return (
        <div className="glass-page-bg min-h-screen w-full">
            <TopBar
                title={t(meta.titleKey)}
                showBackButton={meta.showBack}
                onBack={() => router.history.back()}
            />

            {/* key 隨路徑改變 → 每次導航重掛，套用 0.2s fade 轉場（tw-animate-css）。 */}
            <Suspense fallback={null}>
                <div key={pathname} className="animate-in fade-in duration-200">
                    <Outlet />
                </div>
            </Suspense>

            {isMainTab && (
                <BottomNavigation activeTab={meta.tab} hidden={hidden} onAddExpenseClick={() => setDrawerOpen(true)} />
            )}
            <AddExpenseDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        </div>
    )
}
