import { useEffect, useState } from 'react'

// 純邏輯：依捲動量決定浮動導航是否隱藏。抽出成獨立函式方便單元測試
// （對齊 Vue useScrollDirection：下捲超過門檻且已離頂 → 隱藏；明顯上捲 → 顯示）。
export function nextNavHidden(
    prevHidden: boolean,
    params: { delta: number; y: number; threshold?: number }
): boolean {
    const { delta, y, threshold = 5 } = params
    if (delta > threshold && y > 60) return true
    if (delta < -3) return false
    return prevHidden
}

// 下捲隱藏、上捲出現。以 rAF 節流，passive scroll listener。
export function useScrollDirection(threshold = 5): boolean {
    const [hidden, setHidden] = useState(false)

    useEffect(() => {
        let lastScrollY = window.scrollY
        let ticking = false

        const onScroll = () => {
            if (ticking) return
            ticking = true
            requestAnimationFrame(() => {
                const y = window.scrollY
                const delta = y - lastScrollY
                setHidden((prev) => nextNavHidden(prev, { delta, y, threshold }))
                lastScrollY = y
                ticking = false
            })
        }

        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [threshold])

    return hidden
}
