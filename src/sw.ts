/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'
import type { MessagePayload } from 'firebase/messaging/sw'

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: (string | { url: string; revision: string | null })[]
}

// registerType: 'autoUpdate' 在 generateSW 策略下由 workbox-build 自動加這兩行；injectManifest
// 策略下自己的 SW 要手動補上，行為才會跟 Vue 版（vite-plugin-pwa 預設 autoUpdate）一致：
// 新 SW 一裝好就跳過 waiting、立刻接管所有分頁，不需要使用者手動觸發更新。
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA 離線 fallback：導覽請求一律回退到 precache 的 index.html。denylist 對照 Vue 版
// vite.config.ts 既有的 navigateFallbackDenylist: [/^\/api/]。
registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
        denylist: [/^\/api/]
    })
)

// Google Fonts 快取，對照 Vue 版 vite.config.ts 既有的 workbox.runtimeCaching 設定。
registerRoute(
    /^https:\/\/fonts\.googleapis\.com\/.*/i,
    new CacheFirst({
        cacheName: 'google-fonts-cache',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
            })
        ]
    })
)

// ── FCM 背景推播 ──────────────────────────────────────────────
// injectManifest 的自訂 SW 一樣走 Vite 建置，import.meta.env 在這裡跟 client 端一樣做靜態替換。
// 無憑證時（VITE_FIREBASE_* 缺漏，dev/test/CI 常態）整段跳過——絕不能讓這段拖垮上面已經
// 設定好的 precache/offline fallback，那才是 PWA 能不能開的關鍵。
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const isFirebaseConfigured = Boolean(
    firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId
)

if (isFirebaseConfigured) {
    const messaging = getMessaging(initializeApp(firebaseConfig))

    // send-push 只送 data-only message（message.data = {title, body, url, ...}，不帶 notification
    // 欄位）——若帶 notification 欄位，Firebase Messaging SDK 收到背景推播時會自己顯示一則系統通知，
    // 這裡的 onBackgroundMessage 又會再顯示一則，使用者會看到重複的兩則通知。改讀 payload.data
    // 而非 payload.notification，型別守衛比照下面 notificationclick 的 data.url 寫法：缺漏時空字串。
    onBackgroundMessage(messaging, (payload: MessagePayload) => {
        const iconUrl = new URL('web-app-manifest-192x192.png', self.registration.scope).href
        const title = typeof payload.data?.title === 'string' ? payload.data.title : ''
        const body = typeof payload.data?.body === 'string' ? payload.data.body : ''
        const dataUrl = typeof payload.data?.url === 'string' ? payload.data.url : ''

        void self.registration.showNotification(title, {
            body,
            icon: iconUrl,
            data: { url: dataUrl }
        })
    })
}

// 通知點擊導向對應頁：data.url 為 app-relative path（不含前導 slash，發送端與本檔的約定），
// 相對 self.registration.scope 解析成完整 URL，與部署 base path 無關。優先 focus 既有分頁
// 並導頁，完全沒有分頁時才開新視窗。
self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    const dataUrl = typeof event.notification.data?.url === 'string' ? event.notification.data.url : ''
    const targetUrl = new URL(dataUrl, self.registration.scope).href

    event.waitUntil(
        (async () => {
            const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

            const matched = clientsList.find((client) => client.url === targetUrl)
            if (matched) {
                await matched.focus()
                return
            }

            const [existing] = clientsList
            if (existing) {
                await existing.focus()
                await existing.navigate(targetUrl)
                return
            }

            await self.clients.openWindow(targetUrl)
        })()
    )
})
