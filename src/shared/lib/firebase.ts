import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging'

// Firebase 在本專案只用於 Cloud Messaging（Auth/DB 留在 Supabase）。config 走 VITE_FIREBASE_*
// env——本機/CI/test 常態性缺漏這些變數，因此本檔全程 lazy + guarded：
//   - 絕不在 module top-level 呼叫 initializeApp（import 這個檔案本身必須 100% 安全）
//   - initializeApp/getMessaging 只在 isPushConfigured 為 true 且真的被呼叫時才建立
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

// 推播是否已設定：任一必要值缺漏就視為未設定，呼叫端（Settings 通知主開關）依此顯示
// 「推播未設定」狀態並 disable 開關，其餘功能不受影響。
export const isPushConfigured = Boolean(
    firebaseConfig.apiKey &&
        firebaseConfig.projectId &&
        firebaseConfig.messagingSenderId &&
        firebaseConfig.appId &&
        vapidKey
)

let app: FirebaseApp | null = null
function getFirebaseApp(): FirebaseApp {
    if (!app) app = initializeApp(firebaseConfig)
    return app
}

let messaging: Messaging | null = null
function getFirebaseMessaging(): Messaging {
    if (!messaging) messaging = getMessaging(getFirebaseApp())
    return messaging
}

// 瀏覽器是否具備推播所需能力（Notification API + Service Worker + FCM SDK 本身的 isSupported）。
// 三者皆需同步/非同步分開判斷；任一為否即視為不支援（例如 iOS Safari 未加入主畫面）。
export async function isPushBrowserSupported(): Promise<boolean> {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false
    try {
        return await isSupported()
    } catch {
        return false
    }
}

export type PushTokenResult =
    | { status: 'success'; token: string }
    | { status: 'unconfigured' }
    | { status: 'unsupported' }
    | { status: 'permission-denied' }
    | { status: 'error'; error: unknown }

// 請求通知權限並取得 FCM registration token。沿用 vite-plugin-pwa 註冊的同一支 SW
// （透過 navigator.serviceWorker.ready 取得該 registration，本函式不自行註冊新 SW）。
// 若權限已是 granted，requestPermission() 只會立即 resolve 現有狀態、不會重新彈窗，
// 因此本函式同時服務「使用者主動開啟」與「已授權時的靜默 token 輪換」兩種呼叫情境。
export async function requestPushToken(): Promise<PushTokenResult> {
    if (!isPushConfigured) return { status: 'unconfigured' }
    if (!(await isPushBrowserSupported())) return { status: 'unsupported' }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { status: 'permission-denied' }

    try {
        const registration = await navigator.serviceWorker.ready
        const token = await getToken(getFirebaseMessaging(), { vapidKey, serviceWorkerRegistration: registration })
        return { status: 'success', token }
    } catch (error) {
        return { status: 'error', error }
    }
}

// 停用推播用：僅在權限已是 granted 時取得目前 token（不觸發權限請求），
// 供呼叫端拿去刪除 user_devices 對應列。任何非 granted 狀態或取得失敗一律回傳 null。
export async function getCurrentPushToken(): Promise<string | null> {
    if (!isPushConfigured) return null
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null

    try {
        const registration = await navigator.serviceWorker.ready
        return await getToken(getFirebaseMessaging(), { vapidKey, serviceWorkerRegistration: registration })
    } catch {
        return null
    }
}
