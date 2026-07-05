import { QueryClient } from '@tanstack/react-query'

export const STALE = {
    long: 600_000,
    medium: 300_000,
    standard: 60_000,
    short: 15_000
} as const

// App 唯一的 QueryClient（Phase 4 資料層在其上建立所有 query/mutation）。
// staleTime 30s（預設層）：切頁/重掛不狂打；retry 1：失敗只重試一次，避免離線時卡住 loading。
// refetchOnWindowFocus 保持為 true（預設值），用明確註解避免「預設行為遺漏」造成認知偏差。
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1
        }
    }
})
