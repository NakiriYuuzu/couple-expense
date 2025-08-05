import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGlobalFirebaseMessaging, type NotificationState } from '@/composables/useFirebaseMessaging'
import { type MessagePayload } from '@/lib/firebase'
import { toast } from 'vue-sonner'

export interface NotificationSettings {
  enabled: boolean
  expenseReminders: boolean
  dailySummary: boolean
  weeklyReport: boolean
  budgetAlerts: boolean
  soundEnabled: boolean
  vibrationEnabled: boolean
}

export interface NotificationHistory {
  id: string
  title: string
  body: string
  timestamp: Date
  read: boolean
  type: 'expense' | 'reminder' | 'report' | 'budget' | 'general'
  data?: any
}

// 本地通知 payload 接口，與 Firebase MessagePayload 兼容
export interface NotificationPayload {
  title?: string
  body?: string
  icon?: string
  badge?: string
  image?: string
  data?: any
  tag?: string
  requireInteraction?: boolean
}

export const useNotificationStore = defineStore('notification', () => {
  // 使用全域 Firebase Messaging composable
  const messagingComposable = useGlobalFirebaseMessaging()
  
  // Store 專屬狀態
  const isLoading = ref(false)
  
  const settings = ref<NotificationSettings>({
    enabled: true,
    expenseReminders: true,
    dailySummary: true,
    weeklyReport: true,
    budgetAlerts: true,
    soundEnabled: true,
    vibrationEnabled: true
  })

  const history = ref<NotificationHistory[]>([])
  const unreadCount = ref(0)

  // 從 messaging composable 獲取狀態
  const fcmState = computed(() => messagingComposable.state.value)
  const isInitialized = computed(() => fcmState.value.isInitialized)
  const fcmToken = computed(() => fcmState.value.token)
  const permissionStatus = computed(() => fcmState.value.permission)
  const isSupported = computed(() => fcmState.value.isSupported)

  // Computed
  const canRequestPermission = computed(() => messagingComposable.canRequestPermission.value)
  const hasPermission = computed(() => messagingComposable.isPermissionGranted.value)
  const isBlocked = computed(() => messagingComposable.isPermissionDenied.value)

  const unreadNotifications = computed(() => {
    return history.value.filter(n => !n.read)
  })

  // Actions
  const initialize = async (): Promise<boolean> => {
    try {
      isLoading.value = true
      
      // 首先載入已保存的設定
      await loadSettingsFromBackend()
      
      // Check if FCM is supported
      await messagingComposable.initialize()
      
      if (!isSupported.value) {
        console.warn('Notifications not supported on this device')
        return false
      }

      // Permission status is automatically synced from messagingComposable

      // Initialize FCM service if permission is granted
      if (permissionStatus.value === 'granted') {
        // Re-initialize if permission is already granted
        const success = await messagingComposable.initialize()
        if (success) {
          
          // Try to save token to backend, but don't fail if it doesn't work
          if (fcmToken.value) {
            try {
              await saveTokenToBackend(fcmToken.value)
            } catch (error) {
              console.warn('無法保存 FCM token 到資料庫，但通知功能仍可正常運作')
              // 不阻止初始化完成
            }
          }
        } else {
          // If initialization failed, try to clear any stored invalid tokens
          try {
            await clearFcmToken()
          } catch (error) {
            console.warn('無法清理 FCM token，但這不會影響通知功能')
          }
        }
      }

      return isInitialized.value
    } catch (error) {
      console.error('Failed to initialize notifications:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const requestPermission = async (): Promise<boolean> => {
    try {
      isLoading.value = true

      if (!isSupported.value) {
        toast.error('此裝置不支援推播通知')
        return false
      }

      const token = await messagingComposable.requestPermission()
      const granted = !!token

      if (granted) {
        const success = await messagingComposable.initialize()
        if (success) {
          const newToken = messagingComposable.state.value.token
          
          // Check if token has changed
          if (newToken && newToken !== fcmToken.value) {
            try {
              await saveTokenToBackend(newToken)
            } catch (error) {
              console.warn('無法保存 FCM token 到資料庫，但通知功能仍可正常運作')
            }
          }
          
          if (fcmToken.value) {
            toast.success('推播通知已啟用')
          }
        } else {
          await clearFcmToken()
          toast.error('初始化推播通知失敗')
        }
      } else {
        toast.error('推播通知權限被拒絕')
      }

      return granted
    } catch (error) {
      console.error('Failed to request permission:', error)
      toast.error('請求推播通知權限時發生錯誤')
      return false
    } finally {
      isLoading.value = false
    }
  }

  const updateSettings = async (newSettings: Partial<NotificationSettings>) => {
    settings.value = { ...settings.value, ...newSettings }
    
    // Save settings to backend
    await saveSettingsToBackend(settings.value)
    
    toast.success('通知設定已更新')
  }

  const showLocalNotification = async (payload: NotificationPayload) => {
    if (!hasPermission.value || !settings.value.enabled) {
      return
    }

    try {
      // Convert NotificationPayload to MessagePayload format
      const messagePayload: MessagePayload = {
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon
        },
        data: payload.data || {},
        from: '',
        collapseKey: '',
        messageId: Date.now().toString()
      }
      
      await messagingComposable.showNotification(messagePayload)
      
      // Add to history
      addToHistory({
        id: Date.now().toString(),
        title: payload.title || '通知',
        body: payload.body || '',
        timestamp: new Date(),
        read: false,
        type: payload.data?.type || 'general',
        data: payload.data
      })
    } catch (error) {
      console.error('Failed to show notification:', error)
    }
  }

  const addToHistory = (notification: NotificationHistory) => {
    history.value.unshift(notification)
    unreadCount.value = unreadNotifications.value.length
    
    // Keep only last 100 notifications
    if (history.value.length > 100) {
      history.value = history.value.slice(0, 100)
    }
  }

  const markAsRead = (notificationId: string) => {
    const notification = history.value.find(n => n.id === notificationId)
    if (notification && !notification.read) {
      notification.read = true
      unreadCount.value = unreadNotifications.value.length
    }
  }

  const markAllAsRead = () => {
    history.value.forEach(notification => {
      notification.read = true
    })
    unreadCount.value = 0
  }

  const clearHistory = () => {
    history.value = []
    unreadCount.value = 0
  }

  const deleteNotification = (notificationId: string) => {
    const index = history.value.findIndex(n => n.id === notificationId)
    if (index > -1) {
      const notification = history.value[index]
      history.value.splice(index, 1)
      
      if (!notification.read) {
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    }
  }

  const testNotification = async () => {
    await showLocalNotification({
      title: '測試通知',
      body: '這是一個測試通知，用來確認推播功能正常運作',
      icon: '/web-app-manifest-192x192.png',
      data: {
        type: 'test',
        action: 'test'
      }
    })
  }

  // Helper functions
  const saveTokenToBackend = async (token: string): Promise<void> => {
    try {
      console.log('Saving FCM token to user_settings:', token)
      
      // 動態導入 couple store 以避免循環依賴
      const { useCoupleStore } = await import('./couple')
      const coupleStore = useCoupleStore()
      
      // 將 FCM token 存儲到 user_settings 表
      await coupleStore.updateUserSettings({ fcm_token: token })
      
      console.log('FCM token saved successfully')
    } catch (error) {
      console.error('Failed to save FCM token:', error)
      
      // 檢查是否是因為 fcm_token 欄位不存在
      if (error && typeof error === 'object' && 'code' in error) {
        const dbError = error as { code: string; message: string }
        if (dbError.code === '42703' || dbError.message?.includes('fcm_token')) {
          console.warn('📋 fcm_token 欄位不存在')
          console.info('🔧 請執行以下 SQL 來添加該欄位:')
          console.info('   ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS fcm_token text;')
          console.info('💡 或使用 migrations/add_fcm_token_to_user_settings.sql 遷移腳本')
          // 不拋出錯誤，讓應用繼續運行
          return
        }
      }
      
      throw error
    }
  }

  const saveSettingsToBackend = async (settings: NotificationSettings): Promise<void> => {
    try {
      console.log('Saving notification settings to user_settings:', settings)
      
      // 動態導入 couple store 以避免循環依賴
      const { useCoupleStore } = await import('./couple')
      const coupleStore = useCoupleStore()
      
      // 獲取當前用戶設定，然後更新通知設定部分
      const currentSettings = coupleStore.userSettings
      const updatedUserSettings = {
        ...currentSettings,
        // 可以考慮添加 notification_settings 欄位到資料庫，或使用現有欄位
        push_notifications: settings.enabled
      }
      
      // 暫時將設定保存到 localStorage 作為主要存儲
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('notification-settings', JSON.stringify(settings))
      }
      
      console.log('Notification settings saved successfully')
    } catch (error) {
      console.error('Failed to save notification settings:', error)
      // 至少保存到 localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem('notification-settings', JSON.stringify(settings))
        } catch (localError) {
          console.error('Failed to save to localStorage:', localError)
        }
      }
    }
  }

  const loadSettingsFromBackend = async (): Promise<void> => {
    try {
      console.log('Loading notification settings from storage')
      
      // 先嘗試從 localStorage 載入設定
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedSettings = localStorage.getItem('notification-settings')
        if (savedSettings) {
          try {
            const parsedSettings = JSON.parse(savedSettings) as NotificationSettings
            // 合併載入的設定與預設設定，確保所有欄位都存在
            settings.value = {
              enabled: parsedSettings.enabled ?? settings.value.enabled,
              expenseReminders: parsedSettings.expenseReminders ?? settings.value.expenseReminders,
              dailySummary: parsedSettings.dailySummary ?? settings.value.dailySummary,
              weeklyReport: parsedSettings.weeklyReport ?? settings.value.weeklyReport,
              budgetAlerts: parsedSettings.budgetAlerts ?? settings.value.budgetAlerts,
              soundEnabled: parsedSettings.soundEnabled ?? settings.value.soundEnabled,
              vibrationEnabled: parsedSettings.vibrationEnabled ?? settings.value.vibrationEnabled
            }
            console.log('Notification settings loaded from localStorage:', settings.value)
            return
          } catch (parseError) {
            console.error('Failed to parse saved settings:', parseError)
            // 移除損壞的資料
            localStorage.removeItem('notification-settings')
          }
        }
      }
      
      // 如果 localStorage 沒有資料，嘗試從資料庫載入
      try {
        const { useCoupleStore } = await import('./couple')
        const coupleStore = useCoupleStore()
        
        if (coupleStore.userSettings) {
          // 從 user_settings 的 push_notifications 欄位載入基本設定
          if (coupleStore.userSettings.push_notifications !== undefined) {
            settings.value.enabled = coupleStore.userSettings.push_notifications
          }
          console.log('Basic notification settings loaded from database')
        }
      } catch (dbError) {
        console.warn('Failed to load settings from database:', dbError)
      }
      
    } catch (error) {
      console.error('Failed to load notification settings:', error)
    }
  }

  // 真正的每日總結通知
  const generateDailySummary = async () => {
    try {
      if (!hasPermission.value || !settings.value.dailySummary) {
        return
      }

      // 動態導入 expense store 以避免循環依賴
      const { useExpenseStore } = await import('./expense')
      const expenseStore = useExpenseStore()
      
      const today = new Date().toISOString().split('T')[0]
      const todayExpenses = expenseStore.expenses.filter(e => e.date === today)
      
      if (todayExpenses.length === 0) {
        return
      }

      const totalAmount = todayExpenses.reduce((sum, e) => sum + e.amount, 0)
      const topCategory = todayExpenses.reduce((acc, curr) => {
        acc[curr.category] = (acc[curr.category] || 0) + curr.amount
        return acc
      }, {} as Record<string, number>)

      const maxCategory = Object.entries(topCategory).reduce((a, b) => 
        topCategory[a[0]] > topCategory[b[0]] ? a : b
      )

      const categoryNames = {
        food: '餐飲', pet: '寵物', shopping: '購物',
        transport: '交通', home: '居家', other: '其他'
      }

      await showLocalNotification({
        title: '📊 今日支出總結',
        body: `今日共 ${todayExpenses.length} 筆支出，總計 NT$${totalAmount.toLocaleString()}，主要支出在${categoryNames[maxCategory[0] as keyof typeof categoryNames]}`,
        icon: '/web-app-manifest-192x192.png',
        data: {
          type: 'daily_summary',
          amount: totalAmount,
          count: todayExpenses.length,
          topCategory: maxCategory[0]
        }
      })

    } catch (error) {
      console.error('生成每日總結失敗:', error)
    }
  }

  // 真正的週報通知
  const generateWeeklyReport = async () => {
    try {
      if (!hasPermission.value || !settings.value.weeklyReport) {
        return
      }

      const { useExpenseStore } = await import('./expense')
      const expenseStore = useExpenseStore()
      
      const stats = expenseStore.stats
      const weekTotal = stats.week
      
      if (weekTotal === 0) {
        return
      }

      // 找出本週最高支出類別
      const topCategory = Object.entries(stats.byCategory).reduce((a, b) => 
        (a[1] as number) > (b[1] as number) ? a : b
      )

      const categoryNames = {
        food: '餐飲', pet: '寵物', shopping: '購物',
        transport: '交通', home: '居家', other: '其他'
      }

      await showLocalNotification({
        title: '📈 本週支出報告',
        body: `本週總支出 NT$${weekTotal.toLocaleString()}，主要開銷在${categoryNames[topCategory[0] as keyof typeof categoryNames]} (NT$${(topCategory[1] as number).toLocaleString()})`,
        icon: '/web-app-manifest-192x192.png',
        requireInteraction: true,
        data: {
          type: 'weekly_report',
          amount: weekTotal,
          topCategory: topCategory[0],
          topAmount: topCategory[1]
        }
      })

    } catch (error) {
      console.error('生成週報失敗:', error)
    }
  }

  // 設定每日通知排程
  const setupDailyNotifications = () => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    // 每日晚上 9 點發送總結
    const now = new Date()
    const target = new Date()
    target.setHours(21, 0, 0, 0) // 晚上 9 點

    if (target <= now) {
      target.setDate(target.getDate() + 1)
    }

    const timeUntilTarget = target.getTime() - now.getTime()

    setTimeout(() => {
      generateDailySummary()
      // 設定每日重複
      setInterval(generateDailySummary, 24 * 60 * 60 * 1000)
    }, timeUntilTarget)
  }

  // 設定週報排程
  const setupWeeklyNotifications = () => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    // 每週日晚上 8 點發送週報
    const now = new Date()
    const target = new Date()
    
    // 計算下個週日
    const daysUntilSunday = (7 - now.getDay()) % 7
    if (daysUntilSunday === 0 && now.getHours() >= 20) {
      // 如果今天是週日且已過晚上8點，設為下週日
      target.setDate(now.getDate() + 7)
    } else {
      target.setDate(now.getDate() + daysUntilSunday)
    }
    
    target.setHours(20, 0, 0, 0) // 晚上 8 點

    const timeUntilTarget = target.getTime() - now.getTime()

    setTimeout(() => {
      generateWeeklyReport()
      // 設定每週重複
      setInterval(generateWeeklyReport, 7 * 24 * 60 * 60 * 1000)
    }, timeUntilTarget)
  }

  // 清理過期的 FCM token（當 token 無效時調用）
  const clearFcmToken = async (): Promise<void> => {
    try {
      console.log('Clearing invalid FCM token')
      
      // Clear token is handled internally by messaging composable
      await messagingComposable.cleanup()
      
      // 嘗試清除資料庫中的 FCM token，但不因此失敗
      try {
        const { useCoupleStore } = await import('./couple')
        const coupleStore = useCoupleStore()
        await coupleStore.updateUserSettings({ fcm_token: null })
      } catch (dbError) {
        console.warn('無法從資料庫清除 FCM token，但本地清理已完成')
      }
      
      console.log('FCM token cleared successfully')
    } catch (error) {
      console.error('Failed to clear FCM token:', error)
    }
  }

  // 驗證並更新 FCM token（定期調用以確保 token 有效）
  const validateAndUpdateToken = async (): Promise<boolean> => {
    try {
      if (!hasPermission.value || !isInitialized.value) {
        return false
      }

      // Check if token exists and permission is granted
      const isValid = !!messagingComposable.state.value.token && messagingComposable.state.value.permission === 'granted'
      
      if (!isValid) {
        // Token 無效，清理它
        await clearFcmToken()
        return false
      }

      // 檢查是否有新的 token
      const currentToken = messagingComposable.state.value.token
      if (currentToken && currentToken !== fcmToken.value) {
        try {
          await saveTokenToBackend(currentToken)
          console.log('FCM token updated')
        } catch (error) {
          console.warn('無法更新資料庫中的 FCM token，但本地已更新')
        }
      }

      return true
    } catch (error) {
      console.error('Token validation failed:', error)
      await clearFcmToken()
      return false
    }
  }

  return {
    // State
    isInitialized,
    fcmToken,
    permissionStatus,
    isSupported,
    isLoading,
    settings,
    history,
    unreadCount,
    
    // Computed
    canRequestPermission,
    hasPermission,
    isBlocked,
    unreadNotifications,
    
    // Actions
    initialize,
    requestPermission,
    updateSettings,
    showLocalNotification,
    addToHistory,
    markAsRead,
    markAllAsRead,
    clearHistory,
    deleteNotification,
    testNotification,
    generateDailySummary,
    generateWeeklyReport,
    setupDailyNotifications,
    setupWeeklyNotifications,
    clearFcmToken,
    validateAndUpdateToken,
    loadSettingsFromBackend
  }
}, {
  persist: {
    // 只持久化不敏感的狀態，設定由我們的 localStorage 邏輯處理
    pick: ['history'],
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  }
})