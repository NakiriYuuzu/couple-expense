import { createRootRouteWithContext, Outlet, Navigate } from '@tanstack/react-router'
import type { RouterContext } from '@/shared/lib/routerContext'

// 根路由：注入 router context（queryClient + auth，供 beforeLoad guard 與 Phase 4 loader）。
// 未匹配路徑 → 導回 '/'（未登入見 startup；已登入由 redirectIfAuthed 續導 /dashboard）。
export const Route = createRootRouteWithContext<RouterContext>()({
    component: RootComponent,
    notFoundComponent: () => <Navigate to="/" />
})

function RootComponent() {
    return <Outlet />
}
