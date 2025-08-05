import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { 
  getMessaging, 
  getToken, 
  onMessage, 
  isSupported,
  type Messaging,
  type MessagePayload 
} from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Initialize Firebase
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

// Firebase Cloud Messaging instance
let messaging: Messaging | null = null

// 初始化 Firebase Cloud Messaging
const initializeMessaging = async (): Promise<Messaging | null> => {
  try {
    // 檢查瀏覽器支援性
    const supported = await isSupported()
    if (!supported || typeof window === 'undefined') {
      console.warn('FCM is not supported in this environment')
      return null
    }

    // 註冊專用的 Firebase Messaging Service Worker
    let registration: ServiceWorkerRegistration | undefined

    try {
      // 使用正確的 base path
      const baseUrl = import.meta.env.VITE_APP_ROUTER_BASE || '/'
      const swPath = baseUrl === '/' ? '/firebase-messaging-sw.js' : `${baseUrl}firebase-messaging-sw.js`
      const swScope = baseUrl === '/' ? '/firebase-cloud-messaging-push-scope' : `${baseUrl}firebase-cloud-messaging-push-scope`
      
      console.log('Registering Firebase SW:', { swPath, swScope, baseUrl })
      
      registration = await navigator.serviceWorker.register(swPath, {
        scope: swScope,
      })
      console.log('Firebase Messaging Service Worker registered successfully')
    } catch (error) {
      console.warn('Failed to register Firebase SW, using default:', error)
      // 如果註冊失敗，使用現有的 Service Worker
      registration = await navigator.serviceWorker.getRegistration()
    }

    // 初始化 messaging
    messaging = getMessaging(app)
    console.log('Firebase Cloud Messaging initialized')
    
    return messaging
  } catch (error) {
    console.error('Failed to initialize Firebase Cloud Messaging:', error)
    return null
  }
}

// 請求通知權限並獲取 FCM token
const requestNotificationPermission = async (): Promise<string | null> => {
  try {
    // 確保 messaging 已初始化
    if (!messaging) {
      await initializeMessaging()
    }

    if (!messaging) {
      throw new Error('Firebase Cloud Messaging not available')
    }

    // 請求通知權限
    const permission = await Notification.requestPermission()
    
    if (permission !== 'granted') {
      console.log('Notification permission denied')
      return null
    }

    // 獲取 FCM registration token
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    })

    if (token) {
      console.log('FCM Registration Token:', token)
      return token
    } else {
      console.log('No FCM registration token available')
      return null
    }
  } catch (error) {
    console.error('Error getting FCM token:', error)
    return null
  }
}

// 監聽前景訊息
const onForegroundMessage = (callback: (payload: MessagePayload) => void): (() => void) | null => {
  if (!messaging) {
    console.warn('Firebase Cloud Messaging not initialized')
    return null
  }

  return onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload)
    callback(payload)
  })
}

// 檢查通知權限狀態
const getNotificationPermission = (): NotificationPermission => {
  return Notification.permission
}

// 檢查 FCM 是否支援
const isFCMSupported = (): Promise<boolean> => {
  return isSupported()
}

export {
  app,
  messaging,
  initializeMessaging,
  requestNotificationPermission,
  onForegroundMessage,
  getNotificationPermission,
  isFCMSupported
}

export type { MessagePayload }