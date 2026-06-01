import type {NavigationGuardNext, RouteLocationNormalized} from 'vue-router'
import { useAuthStore } from '@/features/auth/stores/auth'
import { routes } from '@/app/router/routes'

/**
 * 客制化個人的 router guard
 *
 * 注意：本 guard 僅做認證（requiresAuth + isLoggedIn）導流，
 * 「不」實作角色授權（meta.roles 未被讀取或比對）。
 * 真正的存取授權由後端 Supabase RLS / RPC 負責；前端 route guard 可被繞過，
 * 不應作為授權邊界。若未來要做 client 端 RBAC，需在此補上 meta.roles 比對，
 * 但仍須以 RLS 為最終把關。
 *
 * @param to
 * @param from
 * @param next
 */
export const routerBeforeGuard = async (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
    const authStore = useAuthStore()

    // 等待認證狀態初始化完成
    let waitCount = 0
    while (!authStore.initialized && waitCount < 50) { // 最多等待5秒
        await new Promise(resolve => setTimeout(resolve, 100))
        waitCount++
    }

    // 初始化逾時：fail-safe 處理。需驗證的頁面導向 startup（不放行），
    // 僅對 requiresAuth=false 的頁面直接放行，避免逾時下未登入者短暫進入受保護頁。
    if (!authStore.initialized) {
        console.warn('Auth initialization timeout')
        if (to.meta.requiresAuth) {
            next({
                name: routes.startup.name,
                query: { redirect: to.fullPath }
            })
        } else {
            next()
        }
        return
    }

    // 檢查路由是否需要認證
    if (to.meta.requiresAuth) {
        // 檢查是否已登入
        if (!authStore.isLoggedIn) {
            // 未登入，導向啟動頁面（登入頁）
            next({
                name: routes.startup.name,
                query: { redirect: to.fullPath } // 保存原本要去的頁面
            })
            return
        }
    }

    // 如果已登入且要訪問啟動頁面，導向首頁
    if (authStore.isLoggedIn && to.name === routes.startup.name && !to.query.redirect) {
        next({ name: routes.dashboard.name })
        return
    }

    // 允許導航
    next()
}
