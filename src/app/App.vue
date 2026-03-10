<script setup lang="ts">
import { Toaster } from '@/shared/components/ui/sonner'
import 'vue-sonner/style.css'
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import BottomNavigation from '@/shared/components/BottomNavigation.vue'
import AddExpenseDrawer from '@/features/expense/components/AddExpenseDrawer.vue'
import { routes } from '@/app/router/routes/index.ts'
import { useExpenseStore, useThemeStore, useSettlementStore } from '@/shared/stores'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useGroupStore } from '@/features/group/stores/group'
import { useBackgroundPreload } from '@/shared/composables/useBackgroundPreload'
import type { AddExpenseEvent } from '@/entities/expense/types'

const router = useRouter()
const route = useRoute()
const expenseStore = useExpenseStore()
const authStore = useAuthStore()
const groupStore = useGroupStore()
const themeStore = useThemeStore()
const settlementStore = useSettlementStore()
const { startPreload } = useBackgroundPreload()

// 頁面索引（保留用於其他邏輯參考）
const pageIndexMap: Record<string, number> = {
    '/': 0,
    '/dashboard': 1,
    '/expenses': 2,
    '/overview': 3,
    '/settings': 4
}

// 需要顯示底部導航的路由
const routesWithBottomNav = ['/dashboard', '/expenses', '/overview', '/settings']

// 是否顯示底部導航
const showBottomNavigation = computed(() => {
    return routesWithBottomNav.includes(route.path)
})

// 當前活躍的標籤
const activeTab = computed(() => {
    switch (route.path) {
        case '/dashboard':
            return 'dashboard'
        case '/expenses':
            return 'expenses'
        case '/overview':
            return 'overview'
        case '/settings':
            return 'settings'
        default:
            return 'dashboard'
    }
})

// Drawer 狀態
const isAddExpenseDrawerOpen = ref(false)

// 所有頁面統一使用 fade 過渡
const transitionName = 'fade'

// 底部導航處理器
const handleNavigation = (tab: string) => {
    switch (tab) {
        case 'dashboard':
            router.push({ name: routes.dashboard.name })
            break
        case 'expenses':
            router.push({ name: routes.expenses.name })
            break
        case 'overview':
            router.push({ name: routes.overview.name })
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

const handleExpenseAdded = async (expense: AddExpenseEvent) => {
    try {
        // 從 "-NT 150" 格式中提取數字
        const amount = Math.abs(parseInt(expense.amount.replace(/[^\d]/g, '')))

        // 轉換格式以符合 store 的期望 (CreateExpenseData)
        const storeExpense = {
            title: expense.title,
            amount: amount,
            category: expense.category,
            icon: expense.icon,
            date: expense.date,
            group_id: expense.groupId,
            paid_by: expense.paidBy,
            split_method: expense.splitMethod,
            splits: expense.splits
        }

        await expenseStore.addExpense(storeExpense)
    } catch (error) {
        console.error('新增費用失敗:', error)
    }
}

// 載入所有需要的資料
const loadAllData = async () => {
    if (!authStore.isLoggedIn) return

    try {
        // 1. 先載入用戶資料和群組資料
        await Promise.all([
            groupStore.fetchUserProfile(),
            groupStore.fetchUserGroups()
        ])

        // 2. 背景預載 expenses + settlement
        startPreload()
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
        expenseStore.expenses = []
        expenseStore.preloadStatus = 'idle'
        settlementStore.clearSettlementData()
    }
}, { immediate: true })

// 監聽群組切換，重新背景預載
watch(() => groupStore.activeGroupId, () => {
    if (authStore.isLoggedIn) {
        startPreload()
    }
})

// 應用初始化
onMounted(() => {
    themeStore.initializeTheme()
})
</script>

<template>
    <Toaster position="top-right" richColors />
    <div class="app-container">
        <!-- 主要內容區域 -->
        <div class="main-content">
            <RouterView v-slot="{ Component, route }">
                <Transition
                    :name="transitionName"
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
            @add-click="handleAddNew"
        />

        <!-- 新增費用 Drawer - 全局 -->
        <AddExpenseDrawer
            v-model:open="isAddExpenseDrawerOpen"
            @expense-added="handleExpenseAdded"
        />
    </div>
</template>

<style scoped>
.app-container {
    position: relative;
    overflow-x: hidden;
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

.main-content {
    position: relative;
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
}

/* 頁面切換 - 統一 fade 過渡 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
