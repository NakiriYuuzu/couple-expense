import { redirect } from '@tanstack/react-router'
import type { RouterContext } from '@/shared/lib/routerContext'
import { sanitizeRedirect } from './redirect'

// 兩個 beforeLoad guard 的共用核心（純函式，方便測試——不依賴 router 樹）。
// 皆先 await auth ready（事件驅動 promise），再讀同步快照判斷登入狀態。

interface RequireAuthArgs {
    context: RouterContext
    location: { href: string }
}

interface RedirectIfAuthedArgs {
    context: RouterContext
    search: { redirect?: string }
}

// 受保護頁：未登入 → 導向 startup（'/'），帶當前 href 作 redirect 參數供回登後還原。
export async function requireAuth({ context, location }: RequireAuthArgs): Promise<void> {
    await context.auth.whenReady()
    if (!context.auth.getSnapshot().user) {
        throw redirect({ to: '/', search: { redirect: location.href } })
    }
}

// startup 頁：已登入 → 導向 redirect 目標（經白名單）或 /dashboard。
// href + reloadDocument:false 確保站內 SPA 導航（非整頁重載）。
export async function redirectIfAuthed({ context, search }: RedirectIfAuthedArgs): Promise<void> {
    await context.auth.whenReady()
    if (context.auth.getSnapshot().user) {
        const target = sanitizeRedirect(search.redirect)
        if (target) {
            throw redirect({ href: target, reloadDocument: false })
        }
        throw redirect({ to: '/dashboard' })
    }
}
