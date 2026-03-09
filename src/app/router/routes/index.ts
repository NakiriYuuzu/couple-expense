import { type RouteRecordRaw } from 'vue-router'

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
        meta: { title: '啟動頁面', roles: [], requiresAuth: false },
        component: () => import('@/pages/startup/StartupPage.vue')
    } satisfies RouteRecordRaw,
    dashboard: {
        name: 'Dashboard',
        path: '/dashboard',
        meta: { title: '總覽', roles: [], requiresAuth: true },
        component: () => import('@/pages/dashboard/DashboardPage.vue')
    } satisfies RouteRecordRaw,
    expenses: {
        name: 'Expenses',
        path: '/expenses',
        meta: { title: '支出', roles: [], requiresAuth: true },
        component: () => import('@/pages/expenses/ExpensesPage.vue')
    } satisfies RouteRecordRaw,
    expenseDetail: {
        name: 'ExpenseDetail',
        path: '/expenses/:id',
        meta: { title: '支出詳情', roles: [], requiresAuth: true },
        component: () => import('@/pages/expense-detail/ExpenseDetailPage.vue')
    } satisfies RouteRecordRaw,
    balances: {
        name: 'Balances',
        path: '/balances',
        meta: { title: '帳務', roles: [], requiresAuth: true },
        component: () => import('@/pages/balances/BalancesPage.vue')
    } satisfies RouteRecordRaw,
    statistics: {
        name: 'Statistics',
        path: '/statistics',
        meta: { title: '統計分析', roles: [], requiresAuth: true },
        component: () => import('@/pages/statistics/StatisticsPage.vue')
    } satisfies RouteRecordRaw,
    settings: {
        name: 'Settings',
        path: '/settings',
        meta: { title: '設定', roles: [], requiresAuth: true },
        component: () => import('@/pages/settings/SettingsPage.vue')
    } satisfies RouteRecordRaw,
    groupList: {
        name: 'GroupList',
        path: '/groups',
        meta: { title: '群組列表', roles: [], requiresAuth: true },
        component: () => import('@/pages/group-list/GroupListPage.vue')
    } satisfies RouteRecordRaw,
    groupCreate: {
        name: 'GroupCreate',
        path: '/groups/new',
        meta: { title: '建立群組', roles: [], requiresAuth: true },
        component: () => import('@/pages/group-create/GroupCreatePage.vue')
    } satisfies RouteRecordRaw,
    groupSettings: {
        name: 'GroupSettings',
        path: '/groups/:id',
        meta: { title: '群組設定', roles: [], requiresAuth: true },
        component: () => import('@/pages/group/GroupSettingsPage.vue')
    } satisfies RouteRecordRaw
}

/**
 * 這邊是專門給 router 使用的路由配置
 */
const objectRoutes = Object.values(routes)
const routerRoutes: RouteRecordRaw[] = [
    ...objectRoutes,
    {
        path: '/:pathMatch(.*)*',
        name: 'NotFound',
        redirect: { name: 'Startup' }
    }
]

export default routerRoutes
