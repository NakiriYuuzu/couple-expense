import {type RouteRecordRaw} from 'vue-router'

/**
 * 這邊是提供給大家使用的，方便知道如何使用這些路由
 * @example
 * ```ts
 * import {routes} from '@/router/routes'
 * routes.index.name // 這樣就可以取得路由的 name
 * ```
 */
export const routes = {
    startup: {
        name: 'Startup',
        path: '/',
        meta: {
            title: '啟動頁面',
            roles: [],
            requiresAuth: false  // 登入頁不需要認證
        },
        component: () => import('@/views/Startup.vue')
    } satisfies RouteRecordRaw,
    index: {
        name: 'Home',
        path: '/home',
        meta: {
            title: '首頁',
            roles: [],
            requiresAuth: true  // 需要登入才能訪問
        },
        component: () => import('@/views/Home.vue')
    } satisfies RouteRecordRaw,
    search: {
        name: 'Search',
        path: '/search',
        meta: {
            title: '搜尋',
            roles: [],
            requiresAuth: true  // 需要登入才能訪問
        },
        component: () => import('@/views/Search.vue')
    } satisfies RouteRecordRaw,
    statistics: {
        name: 'Statistics',
        path: '/statistics',
        meta: {
            title: '統計分析',
            roles: [],
            requiresAuth: true  // 需要登入才能訪問
        },
        component: () => import('@/views/Statistics.vue')
    } satisfies RouteRecordRaw,
    settings: {
        name: 'Settings',
        path: '/settings',
        meta: {
            title: '設定',
            roles: [],
            requiresAuth: true  // 需要登入才能訪問
        },
        component: () => import('@/views/Settings.vue')
    } satisfies RouteRecordRaw,
    coupleSettings: {
        name: 'CoupleSettings',
        path: '/couple-settings',
        meta: {
            title: '情侶設定',
            roles: [],
            requiresAuth: true  // 需要登入才能訪問
        },
        component: () => import('@/views/CoupleSettings.vue')
    } satisfies RouteRecordRaw
}

/**
 * 這邊是專門給 router 使用的路由配置
 */
const objectRoutes = Object.values(routes)
const routerRoutes: RouteRecordRaw[] = [
    ...objectRoutes,
    // 404 fallback route - 必須放在最後，導向 startup
    {
        path: '/:pathMatch(.*)*',
        name: 'NotFound',
        redirect: { name: 'Startup' }
    }
]

export default routerRoutes
