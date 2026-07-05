import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import { queryClient } from '@/shared/lib/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ensureAuthListener, whenAuthReady, useAuthStore } from '@/features/auth/authStore'
import { AppToaster } from '@/shared/components/AppToaster'
import { SwitchAccountOverlay } from '@/shared/components/SwitchAccountOverlay'
import { PwaUpdatePrompt } from '@/shared/components/PwaUpdatePrompt'
import type { RouterContext } from '@/shared/lib/routerContext'
import './styles/main.css'

// 在建立 router 前就啟動唯一的 auth listener（idempotent；AuthProvider 內的呼叫為安全冗餘）。
// 確保首個路由的 beforeLoad guard await whenAuthReady() 能被 INITIAL_SESSION 事件解除，
// 不會因 provider effect 尚未執行而永久卡在 loading。
ensureAuthListener()

const routerContext: RouterContext = {
    queryClient,
    auth: {
        whenReady: whenAuthReady,
        getSnapshot: () => useAuthStore.getState()
    }
}

const router = createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL,
    context: routerContext
})

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

const rootElement = document.getElementById('root')!

ReactDOM.createRoot(rootElement).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <RouterProvider router={router} />
                <SwitchAccountOverlay />
                <AppToaster />
                <PwaUpdatePrompt />
            </AuthProvider>
        </QueryClientProvider>
    </StrictMode>
)
