import type { RouterHistory } from '@tanstack/react-router'

interface BackTarget {
    history: Pick<RouterHistory, 'canGoBack' | 'back'>
    navigate: (options: { to: '/dashboard'; replace: true }) => unknown
}

// 返回上一頁；若是從外部連結（例如 LINE 通知）直接開啟、App 內沒有上一頁，改回首頁。
export function goBack(router: BackTarget): void {
    if (router.history.canGoBack()) {
        router.history.back()
        return
    }
    void router.navigate({ to: '/dashboard', replace: true })
}
