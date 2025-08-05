// Firebase Messaging Service Worker
// 使用 Firebase v9+ 現代 API

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDKwISWCrsxXQWxuZiEUxS8etnfNDhSjsI",
    authDomain: "coupleexpense.firebaseapp.com",
    projectId: "coupleexpense",
    storageBucket: "coupleexpense.firebasestorage.app",
    messagingSenderId: "1015357448845",
    appId: "1:1015357448845:web:a452918ff76ea21163f8c4"
}

// Initialize Firebase
firebase.initializeApp(firebaseConfig)

// Initialize Firebase Cloud Messaging and get a reference to the service
const messaging = firebase.messaging()

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('Received background message:', payload)

    const {notification, data} = payload

    // 自定義通知標題和內容
    const notificationTitle = notification?.title || '記帳寶通知'
    const notificationOptions = {
        body: notification?.body || '您有新的通知',
        icon: notification?.icon || '/web-app-manifest-192x192.png',
        badge: '/web-app-manifest-192x192.png',
        image: notification?.image,
        data: {
            ...data,
            click_action: data?.click_action || '/',
            time: new Date().toISOString()
        },
        tag: data?.tag || 'couple-expense-notification',
        requireInteraction: data?.requireInteraction === 'true',
        silent: false,
        // 添加操作按鈕
        actions: [
            {
                action: 'view',
                title: '查看',
                icon: '/web-app-manifest-192x192.png'
            },
            {
                action: 'dismiss',
                title: '關閉'
            }
        ]
    }

    // 顯示通知
    return self.registration.showNotification(notificationTitle, notificationOptions)
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('Notification click received:', event)

    const notification = event.notification
    const action = event.action
    const data = notification.data || {}

    // 關閉通知
    notification.close()

    // 根據不同的操作處理
    if (action === 'dismiss') {
        // 只關閉通知，不做其他操作
        return
    }

    // 默認操作或查看操作
    const urlToOpen = data.click_action || '/'

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // 檢查是否已有相同 URL 的窗口打開
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i]
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus()
                }
            }

            // 如果沒有找到現有窗口，打開新窗口
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen)
            }
        })
    )
})

// Handle notification close
self.addEventListener('notificationclose', (event) => {
    console.log('Notification closed:', event)

    // 可以在這裡添加分析追蹤
    const data = event.notification.data
    if (data?.trackClose) {
        // 發送關閉通知的分析數據
        console.log('Tracking notification close:', data)
    }
})

// 監聽來自主執行緒的訊息
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting()
    }
})

console.log('Firebase Messaging Service Worker initialized')
