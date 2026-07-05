import type { DevicePlatform } from '@/shared/lib/database.types'

// 偵測目前裝置對應 user_devices.platform 的哪個列舉值（見 migrations/v3-01-user-devices.sql
// 的 CHECK 限制：'web' | 'android-pwa' | 'ios-pwa'）。判斷順序：先看是否以 standalone
// （已加入主畫面）模式執行，非 standalone 一律視為 'web'；standalone 時再依 UA 細分陣營。
export function detectDevicePlatform(): DevicePlatform {
    const ua = navigator.userAgent
    const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true

    if (!isStandalone) return 'web'

    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
    if (isIOS) return 'ios-pwa'

    if (/Android/.test(ua)) return 'android-pwa'

    return 'web'
}
