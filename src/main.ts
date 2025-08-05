import './assets/css/style.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from '@/routers'
import pinia from '@/stores'
import i18n from '@/i18n'
import { useNotificationStore } from '@/stores'

const app = createApp(App)

app.use(router)
app.use(pinia)
app.use(i18n)

// 初始化通知服務
const initializeNotifications = async () => {
  try {
    const notificationStore = useNotificationStore()
    await notificationStore.initialize()
    console.log('Notification service initialized')
  } catch (error) {
    console.error('Failed to initialize notification service:', error)
  }
}

// 應用程式載入後初始化通知
app.mount('#app')

// 在 DOM 載入完成後初始化通知
document.addEventListener('DOMContentLoaded', () => {
  initializeNotifications()
})
