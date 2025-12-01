<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import i18n from '@/i18n'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import TopBar from '@/components/TopBar.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import NotificationSettings from '@/components/NotificationSettings.vue'
import { useLocaleStore, useNotificationStore } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { useCoupleStore } from '@/stores/couple'
import { useExpenseStore } from '@/stores'
import { useAccountManagerStore } from '@/stores/accountManager'
import { routes } from '@/routers/routes/index.ts'
import { toast } from 'vue-sonner'
import { Progress } from '@/components/ui/progress'
import {
    Moon,
    Languages,
    Bell,
    ChevronRight,
    LogOut,
    UserCog,
    Wallet
} from 'lucide-vue-next'

const { t, locale } = useI18n()
const localeStore = useLocaleStore()
const notificationStore = useNotificationStore()
const authStore = useAuthStore()
const coupleStore = useCoupleStore()
const expenseStore = useExpenseStore()
const accountManagerStore = useAccountManagerStore()
const router = useRouter()

// 通知設定 Drawer 狀態
const isNotificationDrawerOpen = ref(false)

// 個人預算設定 Drawer 狀態
const isPersonalBudgetDrawerOpen = ref(false)
const personalBudgetInput = ref<number | null>(null)

// 登出確認 Dialog 狀態
const isLogoutDialogOpen = ref(false)
const isAccountSwitchDrawerOpen = ref(false)

// 獲取用戶資訊
const userEmail = computed(() => authStore.user?.email || '')
const currentUser = computed(() => authStore.user)

// 獲取所有儲存的帳號
const storedAccounts = computed(() => accountManagerStore.storedAccounts)
const currentAccountId = computed(() => accountManagerStore.currentAccountId)

// 個人預算相關
const personalBudgetUsage = computed(() => {
    const budget = coupleStore.personalBudget
    if (!budget || budget <= 0) return 0
    return Math.min((expenseStore.personalStats.month / budget) * 100, 100)
})

// 打開個人預算設定 Drawer
const openPersonalBudgetDrawer = () => {
    personalBudgetInput.value = coupleStore.personalBudget
    isPersonalBudgetDrawerOpen.value = true
}

// 儲存個人預算
const savePersonalBudget = async () => {
    try {
        await coupleStore.updatePersonalBudget(personalBudgetInput.value)
        toast.success(t('settings.personalBudgetSaved'))
        isPersonalBudgetDrawerOpen.value = false
    } catch (error) {
        console.error('儲存個人預算失敗:', error)
        toast.error(t('common.error'))
    }
}

// 清除個人預算
const clearPersonalBudget = async () => {
    try {
        await coupleStore.updatePersonalBudget(null)
        personalBudgetInput.value = null
        toast.success(t('settings.personalBudgetCleared'))
        isPersonalBudgetDrawerOpen.value = false
    } catch (error) {
        console.error('清除個人預算失敗:', error)
        toast.error(t('common.error'))
    }
}

// 處理語言變更
const handleLanguageChange = async (value: any) => {
    if (value && typeof value === 'string') {
        console.log('Changing language to:', value)
        console.log('Available messages:', i18n.global.availableLocales)
        console.log('Messages for', value, ':', i18n.global.messages[value as keyof typeof i18n.global.messages])
        
        // 更新 store
        localeStore.setLocale(value as 'zh-TW' | 'en')
        
        // 更新 i18n 實例
        i18n.global.locale.value = value as 'zh-TW' | 'en'
        
        // 等待下一個 tick 再更新本地 locale
        await nextTick()
        locale.value = value as 'zh-TW' | 'en'
        
        console.log('Language changed successfully')
    }
}

// 跳轉到通知設定
const goToNotificationSettings = () => {
    isNotificationDrawerOpen.value = true
}

// 跳轉到情侶設定頁面
const goToCoupleSettings = () => {
    router.push({ name: routes.coupleSettings.name })
}

// 清除所有資料
const clearAllData = () => {
    // 清除情侶資料
    coupleStore.couple = null
    coupleStore.userProfile = null
    coupleStore.partnerProfile = null
    coupleStore.coupleSettings = null
    // 清除費用資料
    expenseStore.expenses = []
}

// 登出處理
const handleLogout = async () => {
    try {
        await authStore.signOut()
        clearAllData()
        // 導向到啟動頁面
        router.push({ name: routes.startup.name })
        toast.success(t('settings.logoutSuccess'))
    } catch (error) {
        console.error('登出失敗:', error)
        toast.error(t('settings.logoutError'))
    } finally {
        isLogoutDialogOpen.value = false
    }
}

// 切換到已存在的帳號
const handleSwitchToAccount = async (accountId: string) => {
    try {
        // 如果是當前帳號，不需要切換
        if (accountId === currentAccountId.value) {
            isAccountSwitchDrawerOpen.value = false
            return
        }
        
        const result = await accountManagerStore.switchToAccount(accountId, router.currentRoute.value.fullPath)
        
        if (result.success) {
            // OAuth 會自動重新導向，不需要在這裡做任何事
            toast.info(t('settings.switchingAccount'))
        } else {
            toast.error(result.error || t('settings.switchAccountError'))
        }
    } catch (error) {
        console.error('切換帳號失敗:', error)
        toast.error(t('settings.switchAccountError'))
    }
}

// 新增帳號（使用 Google）
const handleAddAccount = async () => {
    try {
        const result = await accountManagerStore.addNewAccountWithGoogle(router.currentRoute.value.fullPath)
        
        if (result.success) {
            // OAuth 會自動重新導向，不需要在這裡做任何事
            toast.info(t('settings.addAccountInfo'))
        } else {
            toast.error(result.error || t('settings.addAccountError'))
        }
    } catch (error) {
        console.error('新增帳號失敗:', error)
        toast.error(t('settings.addAccountError'))
    }
}

// 移除帳號
const handleRemoveAccount = (accountId: string) => {
    // 不能移除當前帳號
    if (accountId === currentAccountId.value) {
        toast.error(t('settings.cannotRemoveCurrentAccount'))
        return
    }
    
    accountManagerStore.removeAccount(accountId)
    toast.success(t('settings.accountRemoved'))
}
</script>

<template>
    <div class="min-h-screen bg-background">
        <!-- 頂部導航欄 -->
        <TopBar :title="t('settings.title')" />

        <!-- 主要內容區域 -->
        <main class="px-4 pb-20">
            <div class="mt-6 space-y-4">
                <!-- 主題設定 -->
                <Card class="p-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent">
                                <Moon class="h-5 w-5 text-brand-primary" />
                            </div>
                            <div>
                                <h3 class="text-base font-medium text-foreground">{{ t('settings.theme') }}</h3>
                                <p class="text-sm text-muted-foreground">{{ t('settings.themeDesc') }}</p>
                            </div>
                        </div>
                        <ThemeToggle />
                    </div>
                </Card>

                <!-- 語言設定 -->
                <Card class="p-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent">
                                <Languages class="h-5 w-5 text-brand-primary" />
                            </div>
                            <div>
                                <h3 class="text-base font-medium text-foreground">{{ t('settings.language') }}</h3>
                                <p class="text-sm text-muted-foreground">{{ t('settings.languageDesc') }}</p>
                            </div>
                        </div>
                        <Select 
                            :defaultValue="localeStore.currentLocale"
                            @update:modelValue="handleLanguageChange"
                        >
                            <SelectTrigger class="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem 
                                    v-for="lang in localeStore.availableLocales" 
                                    :key="lang.value" 
                                    :value="lang.value"
                                >
                                    {{ lang.label }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </Card>

                <!-- 通知設定 -->
                <Card class="p-4 cursor-pointer hover:bg-accent transition-colors" @click="goToNotificationSettings">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent">
                                <Bell class="h-5 w-5 text-brand-primary" />
                            </div>
                            <div>
                                <h3 class="text-base font-medium text-foreground">{{ t('settings.notifications') }}</h3>
                                <p class="text-sm text-muted-foreground">
                                    {{ notificationStore.hasPermission ? '已啟用推播通知' : notificationStore.isBlocked ? '通知權限被封鎖' : '點擊設定推播通知' }}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <div v-if="notificationStore.hasPermission" class="w-2 h-2 bg-green-500 rounded-full"></div>
                            <div v-else-if="notificationStore.isBlocked" class="w-2 h-2 bg-red-500 rounded-full"></div>
                            <div v-else class="w-2 h-2 bg-yellow-500 rounded-full"></div>
                            <ChevronRight class="h-5 w-5 text-muted-foreground" />
                        </div>
                    </div>
                </Card>

                <!-- 個人預算設定 -->
                <Card class="p-4 cursor-pointer hover:bg-accent transition-colors" @click="openPersonalBudgetDrawer">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent">
                                <Wallet class="h-5 w-5 text-brand-primary" />
                            </div>
                            <div>
                                <h3 class="text-base font-medium text-foreground">{{ t('settings.personalBudget') }}</h3>
                                <p class="text-sm text-muted-foreground">
                                    {{ coupleStore.personalBudget
                                        ? `NT$ ${coupleStore.personalBudget.toLocaleString()}`
                                        : t('settings.personalBudgetNotSet')
                                    }}
                                </p>
                            </div>
                        </div>
                        <ChevronRight class="h-5 w-5 text-muted-foreground" />
                    </div>
                </Card>

                <!-- 更多設定項目 (未來擴展用) -->
                <div class="mt-8">
                    <h2 class="mb-4 text-sm font-medium text-muted-foreground">{{ t('settings.moreSettings') }}</h2>
                    
                    <!-- 情侶設定 -->
                    <Card class="p-4 mb-3 cursor-pointer hover:bg-accent transition-colors" @click="goToCoupleSettings">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent">
                                    <span class="text-lg">💑</span>
                                </div>
                                <div>
                                    <h3 class="text-base font-medium text-foreground">{{ t('couple.title') }}</h3>
                                    <p class="text-sm text-muted-foreground">{{ t('couple.manageSharedExpenses') }}</p>
                                </div>
                            </div>
                            <ChevronRight class="h-5 w-5 text-muted-foreground" />
                        </div>
                    </Card>
                    
                    <!-- 帳戶設定 -->
                    <Card class="p-4 mb-3">
                        <div class="space-y-4">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent">
                                    <span class="text-lg">👤</span>
                                </div>
                                <div>
                                    <h3 class="text-base font-medium text-foreground">{{ t('settings.account') }}</h3>
                                    <p class="text-sm text-muted-foreground">{{ userEmail }}</p>
                                </div>
                            </div>
                            
                            <!-- 切換帳號按鈕 -->
                            <Button 
                                variant="outline" 
                                class="w-full justify-start"
                                @click="isAccountSwitchDrawerOpen = true"
                            >
                                <UserCog class="mr-2 h-4 w-4" />
                                {{ t('settings.switchAccount') }}
                                <span v-if="storedAccounts.length > 1" class="ml-auto text-muted-foreground">
                                    {{ storedAccounts.length }}
                                </span>
                            </Button>
                            
                            <!-- 登出按鈕 -->
                            <Button 
                                variant="outline" 
                                class="w-full justify-start text-destructive hover:text-destructive"
                                @click="isLogoutDialogOpen = true"
                            >
                                <LogOut class="mr-2 h-4 w-4" />
                                {{ t('settings.logout') }}
                            </Button>
                        </div>
                    </Card>

                    <!-- 範例: 關於 -->
                    <Card class="p-4 cursor-pointer hover:bg-accent transition-colors">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent">
                                    <span class="text-lg">ℹ️</span>
                                </div>
                                <div>
                                    <h3 class="text-base font-medium text-foreground">{{ t('settings.about') }}</h3>
                                    <p class="text-sm text-muted-foreground">{{ t('settings.version') }}</p>
                                </div>
                            </div>
                            <ChevronRight class="h-5 w-5 text-muted-foreground" />
                        </div>
                    </Card>
                </div>
            </div>
        </main>

        <!-- 通知設定 Drawer -->
        <Drawer v-model:open="isNotificationDrawerOpen">
            <DrawerContent class="max-h-[90vh]">
                <DrawerHeader>
                    <DrawerTitle>推播通知設定</DrawerTitle>
                </DrawerHeader>
                <div class="px-4 pb-6 overflow-y-auto">
                    <NotificationSettings />
                </div>
            </DrawerContent>
        </Drawer>
        
        <!-- 登出確認 Dialog -->
        <Dialog v-model:open="isLogoutDialogOpen">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{{ t('settings.logoutConfirmTitle') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('settings.logoutConfirmDesc') }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="isLogoutDialogOpen = false">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button variant="destructive" @click="handleLogout">
                        {{ t('settings.confirmLogout') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        <!-- 帳號切換 Drawer -->
        <Drawer v-model:open="isAccountSwitchDrawerOpen">
            <DrawerContent class="max-h-[90vh]">
                <DrawerHeader>
                    <DrawerTitle>{{ t('settings.manageAccounts') }}</DrawerTitle>
                </DrawerHeader>
                <div class="px-4 pb-6 overflow-y-auto">
                    <!-- 帳號列表 -->
                    <div class="space-y-2 mb-4">
                        <div
                            v-for="account in storedAccounts"
                            :key="account.id"
                            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors"
                            :class="account.id === currentAccountId ? 'border-brand-primary bg-brand-accent' : 'border-border'"
                            @click="handleSwitchToAccount(account.id)"
                        >
                            <div class="flex items-center gap-3">
                                <!-- 頭像或默認圖標 -->
                                <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                    <img
                                        v-if="account.avatarUrl"
                                        :src="account.avatarUrl"
                                        :alt="account.name"
                                        class="w-10 h-10 rounded-full"
                                    >
                                    <span v-else class="text-lg">
                                        {{ account.email?.charAt(0)?.toUpperCase() || '?' }}
                                    </span>
                                </div>
                                <!-- 帳號資訊 -->
                                <div>
                                    <p class="font-medium text-foreground">
                                        {{ account.name || account.email }}
                                    </p>
                                    <p v-if="account.name" class="text-sm text-muted-foreground">
                                        {{ account.email }}
                                    </p>
                                </div>
                            </div>
                            <!-- 當前帳號標記 -->
                            <div class="flex items-center gap-2">
                                <span
                                    v-if="account.id === currentAccountId"
                                    class="text-xs bg-brand-primary text-primary-foreground px-2 py-1 rounded"
                                >
                                    {{ t('settings.current') }}
                                </span>
                                <!-- 移除帳號按鈕 -->
                                <Button
                                    v-if="account.id !== currentAccountId && storedAccounts.length > 1"
                                    variant="ghost"
                                    size="sm"
                                    @click.stop="handleRemoveAccount(account.id)"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </Button>
                            </div>
                        </div>
                    </div>

                    <!-- 新增帳號按鈕 -->
                    <Button
                        variant="outline"
                        class="w-full"
                        @click="handleAddAccount"
                    >
                        <svg class="mr-2 h-4 w-4" viewBox="0 0 24 24">
                            <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                fill="#4285F4"
                            />
                            <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853"
                            />
                            <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                fill="#FBBC05"
                            />
                            <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335"
                            />
                        </svg>
                        {{ t('settings.addAccountWithGoogle') }}
                    </Button>
                </div>
            </DrawerContent>
        </Drawer>

        <!-- 個人預算設定 Drawer -->
        <Drawer v-model:open="isPersonalBudgetDrawerOpen">
            <DrawerContent class="max-h-[90vh]">
                <DrawerHeader>
                    <DrawerTitle>{{ t('settings.personalBudgetTitle') }}</DrawerTitle>
                </DrawerHeader>
                <div class="px-4 pb-6 space-y-4">
                    <div class="space-y-2">
                        <Label>{{ t('settings.monthlyBudgetAmount') }}</Label>
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-muted-foreground">NT$</span>
                            <Input
                                v-model.number="personalBudgetInput"
                                type="number"
                                min="0"
                                step="100"
                                :placeholder="t('settings.enterBudgetAmount')"
                            />
                        </div>
                        <p class="text-xs text-muted-foreground">
                            {{ t('settings.personalBudgetDesc') }}
                        </p>
                    </div>

                    <!-- 當前使用進度 (若已設定預算) -->
                    <div v-if="coupleStore.personalBudget" class="space-y-2">
                        <Label>{{ t('settings.currentUsage') }}</Label>
                        <Progress :model-value="personalBudgetUsage" class="h-2" />
                        <div class="flex justify-between text-xs text-muted-foreground">
                            <span>NT$ {{ expenseStore.personalStats.month.toLocaleString() }}</span>
                            <span>{{ personalBudgetUsage.toFixed(0) }}%</span>
                        </div>
                    </div>

                    <div class="flex gap-2 pt-4">
                        <Button
                            variant="outline"
                            class="flex-1"
                            @click="clearPersonalBudget"
                        >
                            {{ t('settings.clearBudget') }}
                        </Button>
                        <Button
                            class="flex-1"
                            @click="savePersonalBudget"
                            :disabled="coupleStore.loading"
                        >
                            {{ t('common.save') }}
                        </Button>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    </div>
</template>

<style scoped>
</style>