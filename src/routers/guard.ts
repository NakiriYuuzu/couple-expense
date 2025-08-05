import type {NavigationGuardNext, RouteLocationNormalized} from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { routes } from '@/routers/routes'

/**
 * 客制化個人的 router guard
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
    
    // 如果初始化失敗，允許訪問（降級處理）
    if (!authStore.initialized) {
        console.warn('Auth initialization timeout, allowing navigation')
        next()
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
        next({ name: routes.index.name })
        return
    }
    
    // 允許導航
    next()
}
