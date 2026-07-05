import { useEffect, useRef, useState } from 'react'

// 觸控下拉刷新（重寫，不依賴 pulltorefreshjs 套件）：
// 僅在頁面捲動到頂（scrollY===0）時，於觸控下拉超過門檻後觸發 onRefresh
// （Phase 4 起 onRefresh = () => queryClient.invalidateQueries()）。
interface Options {
    onRefresh: () => void | Promise<void>
    threshold?: number
    maxPull?: number
    disabled?: boolean
}

export function usePullToRefresh(options: Options): { pullDistance: number; isRefreshing: boolean } {
    const { onRefresh, threshold = 60, maxPull = 80, disabled = false } = options
    const [pullDistance, setPullDistance] = useState(0)
    const [isRefreshing, setIsRefreshing] = useState(false)

    // 以 ref 保存最新 onRefresh，避免因 callback 變動而重掛 listener
    const onRefreshRef = useRef(onRefresh)
    onRefreshRef.current = onRefresh

    useEffect(() => {
        if (disabled) return

        let startY = 0
        let pulling = false
        let distance = 0

        const onTouchStart = (e: TouchEvent) => {
            if (window.scrollY > 0) return
            startY = e.touches[0].clientY
            pulling = true
            distance = 0
        }

        const onTouchMove = (e: TouchEvent) => {
            if (!pulling) return
            const delta = e.touches[0].clientY - startY
            if (delta <= 0) {
                distance = 0
                setPullDistance(0)
                return
            }
            // 阻尼：越拉越沉，且封頂 maxPull
            distance = Math.min(maxPull, delta * 0.5)
            setPullDistance(distance)
        }

        const onTouchEnd = () => {
            if (!pulling) return
            pulling = false
            if (distance >= threshold) {
                setIsRefreshing(true)
                Promise.resolve(onRefreshRef.current()).finally(() => {
                    setIsRefreshing(false)
                    setPullDistance(0)
                })
            } else {
                setPullDistance(0)
            }
            distance = 0
        }

        window.addEventListener('touchstart', onTouchStart, { passive: true })
        window.addEventListener('touchmove', onTouchMove, { passive: true })
        window.addEventListener('touchend', onTouchEnd)
        return () => {
            window.removeEventListener('touchstart', onTouchStart)
            window.removeEventListener('touchmove', onTouchMove)
            window.removeEventListener('touchend', onTouchEnd)
        }
    }, [disabled, threshold, maxPull])

    return { pullDistance, isRefreshing }
}
