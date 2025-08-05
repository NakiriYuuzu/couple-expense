<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import 'vue-sonner/style.css'
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'
import BottomNavigation from '@/components/BottomNavigation.vue'
import AddExpenseDrawer from '@/components/AddExpenseDrawer.vue'
import { routes } from '@/routers/routes/index.ts'
import { useExpenseStore } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { useCoupleStore } from '@/stores/couple'

const router = useRouter()
const route = useRoute()
const expenseStore = useExpenseStore()
const authStore = useAuthStore()
const coupleStore = useCoupleStore()

// 定義頁面索引來決定動畫方向
const pageIndexMap: Record<string, number> = {
    '/': 0,               // Startup
    '/home': 1,           // Home
    '/search': 2,         // Search
    '/statistics': 3,     // Statistics
    '/settings': 4        // Settings
}

// 需要顯示底部導航的路由
const routesWithBottomNav = ['/home', '/search', '/statistics', '/settings']

// 是否顯示底部導航
const showBottomNavigation = computed(() => {
    return routesWithBottomNav.includes(route.path)
})

// 當前活躍的標籤
const activeTab = computed(() => {
    switch (route.path) {
        case '/home':
            return 'home'
        case '/search':
            return 'search'
        case '/statistics':
            return 'statistics'
        case '/settings':
            return 'settings'
        default:
            return 'home'
    }
})

// Drawer 狀態
const isAddExpenseDrawerOpen = ref(false)

// 追踪前一個頁面索引
const previousPageIndex = ref(0)

// 根據路由變化決定過渡動畫名稱
const getTransitionName = (route: RouteLocationNormalized) => {
    const currentIndex = pageIndexMap[route.path] ?? 0
    const prevIndex = previousPageIndex.value
    
    // 更新前一個頁面索引
    previousPageIndex.value = currentIndex
    
    if (currentIndex > prevIndex) {
        return 'slide-left'  // 向左滑動（前進）
    } else if (currentIndex < prevIndex) {
        return 'slide-right' // 向右滑動（後退）
    } else {
        return 'fade'        // 淡入淡出（同級或首次進入）
    }
}

// 監聽路由變化來更新頁面索引
router.beforeEach((to, from) => {
    const fromIndex = pageIndexMap[from.path] ?? 0
    previousPageIndex.value = fromIndex
})

// 底部導航處理器
const handleNavigation = (tab: string) => {
    switch (tab) {
        case 'home':
            router.push({ name: routes.index.name })
            break
        case 'search':
            router.push({ name: routes.search.name })
            break
        case 'statistics':
            router.push({ name: routes.statistics.name })
            break
        case 'settings':
            router.push({ name: routes.settings.name })
            break
        default:
            console.log('Unknown tab:', tab)
    }
}

const handleAddNew = () => {
    isAddExpenseDrawerOpen.value = true
}

const handleExpenseAdded = async (expense: any) => {
    console.log('New expense added:', expense)
    
    try {
        // 從 "-NT 150" 格式中提取數字
        const amount = Math.abs(parseInt(expense.amount.replace(/[^\d]/g, '')))
        
        // 轉換格式以符合 store 的期望 (CreateExpenseData)
        const storeExpense = {
            title: expense.title,
            amount: amount, // 數字類型，正數
            category: expense.category,
            icon: expense.icon,
            date: expense.date // 已經是 "2025-08-03" 格式
        }
        
        // 添加到 store
        await expenseStore.addExpense(storeExpense)
    } catch (error) {
        console.error('新增費用失敗:', error)
    }
}

// 載入所有需要的資料
const loadAllData = async () => {
    if (!authStore.isLoggedIn) return
    
    try {
        // 1. 先載入 couple 資料
        await coupleStore.fetchUserProfile()
        
        // 2. 再載入 expense 資料（會根據情侶狀態載入共同消費）
        await expenseStore.fetchExpenses()
    } catch (error) {
        console.error('載入資料失敗:', error)
    }
}

// 監聽用戶登入狀態變化，自動加載資料
watch(() => authStore.isLoggedIn, async (isLoggedIn) => {
    if (isLoggedIn && authStore.user) {
        await loadAllData()
    } else {
        // 用戶登出時清空所有資料
        coupleStore.couple = null
        coupleStore.userProfile = null
        coupleStore.partnerProfile = null
        coupleStore.coupleSettings = null
        coupleStore.userSettings = null
        expenseStore.expenses = []
    }
}, { immediate: true })

// 應用初始化
onMounted(async () => {
    // 如果用戶已經登入，載入所有資料
    if (authStore.isLoggedIn) {
        await loadAllData()
    }
})
</script>

<template>
    <Toaster/>
    <div class="app-container">
        <!-- 主要內容區域 -->
        <div class="main-content">
            <RouterView v-slot="{ Component, route }">
                <Transition 
                    :name="getTransitionName(route)" 
                    mode="out-in"
                    appear
                >
                    <component :is="Component" :key="route.path" />
                </Transition>
            </RouterView>
        </div>
        
        <!-- 底部導航欄 - 固定不參與動畫 -->
        <BottomNavigation 
            v-if="showBottomNavigation"
            :active-tab="activeTab"
            @navigate="handleNavigation"
            @add="handleAddNew"
        />
        
        <!-- 新增費用 Drawer - 全局 -->
        <AddExpenseDrawer 
            v-model:open="isAddExpenseDrawerOpen"
            @expense-added="handleExpenseAdded"
        />
    </div>
</template>

<style scoped>
/* 應用容器 */
.app-container {
    position: relative;
    overflow-x: hidden;
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* 主要內容區域 */
.main-content {
    position: relative;
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
}

/* 頁面切換動畫 */

/* 淡入淡出動畫 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* 向左滑動動畫（前進） */
.slide-left-enter-active,
.slide-left-leave-active {
    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.slide-left-enter-from {
    transform: translateX(100%);
    opacity: 0;
}

.slide-left-leave-to {
    transform: translateX(-100%);
    opacity: 0;
}

/* 向右滑動動畫（後退） */
.slide-right-enter-active,
.slide-right-leave-active {
    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.slide-right-enter-from {
    transform: translateX(-100%);
    opacity: 0;
}

.slide-right-leave-to {
    transform: translateX(100%);
    opacity: 0;
}

/* 確保動畫期間頁面定位正確 */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    overflow-y: auto;
}
</style>
