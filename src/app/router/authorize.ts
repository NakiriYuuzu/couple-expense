/**
 * 權限設定（範例骨架，尚未實作）
 *
 * ⚠️ 重要：route guard（guard.ts）目前「不會」讀取或比對 meta.roles，
 * 因此把 roles 綁到 route meta 並不會產生任何授權效果。真正的存取授權
 * 由後端 Supabase RLS / RPC 負責；前端 route 設定可被繞過，不能當作授權邊界。
 * 下方 example 僅示範未來若要實作 client 端 RBAC 時的綁定方式，當下請勿
 * 依賴它保護任何敏感頁面。
 *
 * 這邊設定好權限后可以綁定在 Routes 的 meta 中
 * @example:
 * ```ts
 * import {authorize} from '@/routers/authorize.ts'
 * const projectRoute = {
 *     admin: {
 *         name: 'admin',
 *         path: '/admin',
 *         meta: {
 *             title: '系統管理',
 *             roles: authorize.adminAuth, <-- 加在這邊
 *             requiresAuth: true
 *         },
 *         component: () => import('@/Pages/Admin.vue')
 *     } satisfies RouteRecordRaw
 * },
 *
 * ```
 */
export default {
    adminAuth: ['admin'], // example: 只有 admin 可以進入
}
