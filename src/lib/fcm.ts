import { requestNotificationPermission, onForegroundMessage } from './firebase'
import { toast } from 'vue-sonner'

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

export class FCMService {
  private static instance: FCMService
  private token: string | null = null
  private isInitialized = false

  private constructor() {}

  static getInstance(): FCMService {
    if (!FCMService.instance) {
      FCMService.instance = new FCMService()
    }
    return FCMService.instance
  }

  // Initialize FCM service
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) {
        return true
      }

      // Check if service worker is available
      if (!('serviceWorker' in navigator)) {
        console.warn('Service Worker not supported')
        return false
      }

      // Check if notifications are supported
      if (!('Notification' in window)) {
        console.warn('Notifications not supported')
        return false
      }

      // Request permission and get token
      this.token = await requestNotificationPermission()
      
      if (this.token) {
        this.isInitialized = true
        this.setupMessageListener()
        return true
      }

      return false
    } catch (error) {
      console.error('FCM initialization failed:', error)
      return false
    }
  }

  // Get FCM token
  getToken(): string | null {
    return this.token
  }

  // Setup foreground message listener
  private setupMessageListener(): void {
    const unsubscribe = onForegroundMessage((payload: any) => {
      if (payload) {
        this.handleForegroundMessage(payload)
      }
    })
    // Note: You might want to store unsubscribe function for cleanup
  }

  // Handle foreground messages
  private handleForegroundMessage(payload: any): void {
    const { notification, data } = payload
    
    if (notification) {
      // Show toast notification in foreground
      toast.info(notification.title || '新通知', {
        description: notification.body,
        duration: 5000,
        action: data?.action ? {
          label: data.action.label || '查看',
          onClick: () => this.handleNotificationClick(data)
        } : undefined
      })

      // Also show browser notification if page is not focused
      if (document.hidden) {
        this.showNotification({
          title: notification.title,
          body: notification.body,
          icon: notification.icon || '/web-app-manifest-192x192.png',
          data: data
        })
      }
    }
  }

  // Show local notification
  async showNotification(payload: NotificationPayload): Promise<void> {
    try {
      if (Notification.permission !== 'granted') {
        console.warn('Notification permission not granted')
        return
      }

      const options: NotificationOptions = {
        body: payload.body,
        icon: payload.icon || '/web-app-manifest-192x192.png',
        badge: payload.badge || '/web-app-manifest-192x192.png',
        data: payload.data,
        tag: payload.tag,
        requireInteraction: payload.requireInteraction || false
      }

      const notification = new Notification(payload.title || '通知', options)
      
      notification.onclick = () => {
        this.handleNotificationClick(payload.data)
        notification.close()
      }

    } catch (error) {
      console.error('Failed to show notification:', error)
    }
  }

  // Handle notification click
  private handleNotificationClick(data?: any): void {
    // Focus the window
    if (window) {
      window.focus()
    }

    // Handle custom actions based on data
    if (data) {
      console.log('Notification clicked with data:', data)
      
      // Example: Navigate to specific route
      if (data.route) {
        // You can integrate with Vue Router here
        window.location.href = data.route
      }
      
      // Example: Trigger custom action
      if (data.action) {
        // Handle custom actions
        this.handleCustomAction(data.action)
      }
    }
  }

  // Handle custom notification actions
  private handleCustomAction(action: string): void {
    switch (action) {
      case 'view_expense':
        // Navigate to expense view
        break
      case 'add_expense':
        // Open add expense modal
        break
      default:
        console.log('Unknown action:', action)
    }
  }

  // Check notification permission status
  getPermissionStatus(): NotificationPermission {
    return Notification.permission
  }

  // Request notification permission
  async requestPermission(): Promise<boolean> {
    try {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    } catch (error) {
      console.error('Failed to request permission:', error)
      return false
    }
  }

  // Validate FCM token (check if token is still valid)
  async validateToken(): Promise<boolean> {
    try {
      if (!this.token) {
        return false
      }

      // Try to refresh token to check if it's still valid
      const newToken = await requestNotificationPermission()
      
      if (newToken && newToken !== this.token) {
        // Token has changed, update it
        this.token = newToken
        return true
      }
      
      return !!newToken
    } catch (error) {
      console.error('Token validation failed:', error)
      return false
    }
  }

  // Clear token when it becomes invalid
  clearToken(): void {
    this.token = null
    this.isInitialized = false
  }

  // Check if FCM is supported
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'Notification' in window
  }
}

// Export singleton instance
export const fcmService = FCMService.getInstance()