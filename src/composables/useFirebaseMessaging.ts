import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  initializeMessaging,
  requestNotificationPermission,
  onForegroundMessage,
  getNotificationPermission,
  isFCMSupported,
  type MessagePayload
} from '@/lib/firebase'

export interface NotificationState {
  permission: NotificationPermission
  token: string | null
  isSupported: boolean
  isInitialized: boolean
  isLoading: boolean
  error: string | null
}

export const useFirebaseMessaging = () => {
  // 響應式狀態
  const state = ref<NotificationState>({
    permission: 'default',
    token: null,
    isSupported: false,
    isInitialized: false,
    isLoading: false,
    error: null
  })

  // 前景訊息回調
  const messageCallbacks = ref<Set<(payload: MessagePayload) => void>>(new Set())
  let unsubscribeMessage: (() => void) | null = null

  // 計算屬性
  const isPermissionGranted = computed(() => state.value.permission === 'granted')
  const isPermissionDenied = computed(() => state.value.permission === 'denied')
  const canRequestPermission = computed(() => 
    state.value.permission === 'default' && state.value.isSupported
  )

  // 初始化 Firebase Cloud Messaging
  const initialize = async (): Promise<boolean> => {
    if (state.value.isInitialized) {
      return true
    }

    state.value.isLoading = true
    state.value.error = null

    try {
      // 檢查支援性
      const supported = await isFCMSupported()
      state.value.isSupported = supported

      if (!supported) {
        state.value.error = 'FCM is not supported in this browser'
        return false
      }

      // 初始化 messaging
      const messaging = await initializeMessaging()
      if (!messaging) {
        state.value.error = 'Failed to initialize Firebase Cloud Messaging'
        return false
      }

      // 更新權限狀態
      state.value.permission = getNotificationPermission()
      state.value.isInitialized = true

      // 設置前景訊息監聽器
      setupForegroundMessageListener()

      console.log('Firebase Cloud Messaging initialized successfully')
      return true
    } catch (error) {
      state.value.error = `Initialization failed: ${error}`
      console.error('FCM initialization error:', error)
      return false
    } finally {
      state.value.isLoading = false
    }
  }

  // 請求通知權限並獲取 token
  const requestPermission = async (): Promise<string | null> => {
    if (!state.value.isSupported) {
      state.value.error = 'FCM is not supported'
      return null
    }

    state.value.isLoading = true
    state.value.error = null

    try {
      const token = await requestNotificationPermission()
      
      // 更新狀態
      state.value.permission = getNotificationPermission()
      state.value.token = token

      if (token) {
        console.log('FCM token obtained:', token)
      } else {
        state.value.error = 'Failed to get FCM token'
      }

      return token
    } catch (error) {
      state.value.error = `Permission request failed: ${error}`
      console.error('FCM permission request error:', error)
      return null
    } finally {
      state.value.isLoading = false
    }
  }

  // 設置前景訊息監聽器
  const setupForegroundMessageListener = () => {
    if (unsubscribeMessage) {
      return // 已經設置過了
    }

    unsubscribeMessage = onForegroundMessage((payload) => {
      // 通知所有已註冊的回調
      messageCallbacks.value.forEach(callback => {
        try {
          callback(payload)
        } catch (error) {
          console.error('Error in message callback:', error)
        }
      })
    })
  }

  // 監聽前景訊息
  const onMessage = (callback: (payload: MessagePayload) => void): (() => void) => {
    messageCallbacks.value.add(callback)

    // 返回取消監聽的函數
    return () => {
      messageCallbacks.value.delete(callback)
    }
  }

  // 顯示瀏覽器通知（用於前景訊息）
  const showNotification = (payload: MessagePayload) => {
    if (!isPermissionGranted.value) {
      console.warn('Notification permission not granted')
      return
    }

    const { notification, data } = payload
    
    const title = notification?.title || '記帳寶通知'
    const options: NotificationOptions = {
      body: notification?.body || '您有新的通知',
      icon: notification?.icon || '/web-app-manifest-192x192.png',
      badge: '/web-app-manifest-192x192.png',
      tag: data?.tag || 'couple-expense-notification',
      data: data || {},
      requireInteraction: data?.requireInteraction === 'true'
    }

    try {
      const browserNotification = new Notification(title, options)
      
      // 設置點擊事件
      browserNotification.onclick = () => {
        const clickAction = data?.click_action || '/'
        window.open(clickAction, '_blank')
        browserNotification.close()
      }

      // 自動關閉（5秒後）
      setTimeout(() => {
        browserNotification.close()
      }, 5000)
    } catch (error) {
      console.error('Failed to show notification:', error)
    }
  }

  // 重新獲取 token（用於 token 刷新）
  const refreshToken = async (): Promise<string | null> => {
    if (!isPermissionGranted.value) {
      return null
    }

    return requestPermission()
  }

  // 檢查並更新權限狀態
  const checkPermissionStatus = (): NotificationPermission => {
    const permission = getNotificationPermission()
    state.value.permission = permission
    return permission
  }

  // 清理函數
  const cleanup = () => {
    if (unsubscribeMessage) {
      unsubscribeMessage()
      unsubscribeMessage = null
    }
    messageCallbacks.value.clear()
  }

  // 生命週期
  onMounted(() => {
    // 自動初始化
    initialize()
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    // 狀態
    state: computed(() => state.value),
    isPermissionGranted,
    isPermissionDenied,
    canRequestPermission,

    // 方法
    initialize,
    requestPermission,
    onMessage,
    showNotification,
    refreshToken,
    checkPermissionStatus,
    cleanup
  }
}

// 全域實例（單例模式）
let globalMessagingInstance: ReturnType<typeof useFirebaseMessaging> | null = null

export const useGlobalFirebaseMessaging = () => {
  if (!globalMessagingInstance) {
    globalMessagingInstance = useFirebaseMessaging()
  }
  return globalMessagingInstance
}