import type { QueryClient } from '@tanstack/react-query'
import type { AuthSnapshot } from '@/features/auth/authStore'

// TanStack Router 的 context 型別：queryClient 供 Phase 4 loader/prefetch 使用，
// auth 供 beforeLoad guard 以「事件驅動 ready promise + 同步快照」判斷登入狀態
// （取代 Vue 版 guard 的 100ms 輪詢）。
export interface RouterContext {
    queryClient: QueryClient
    auth: {
        whenReady: () => Promise<void>
        getSnapshot: () => AuthSnapshot
    }
}
