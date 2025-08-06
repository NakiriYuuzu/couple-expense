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
import { routes } from '@/routers/routes/index.ts'
import { toast } from 'vue-sonner'
import { 
    Moon, 
    Languages, 
    Bell,
    ChevronRight,
    LogOut,
    UserCog
} from 'lucide-vue-next'

const { t, locale } = useI18n()
const localeStore = useLocaleStore()
const notificationStore = useNotificationStore()
const authStore = useAuthStore()
const coupleStore = useCoupleStore()
const expenseStore = useExpenseStore()
const router = useRouter()

// 通知設定 Drawer 狀態
const isNotificationDrawerOpen = ref(false)

// 登出確認 Dialog 狀態
const isLogoutDialogOpen = ref(false)
const isSwitchAccountDialogOpen = ref(false)

// 切換帳號表單狀態
const switchAccountForm = ref({
    email: '',
    password: ''
})
const isSwitchingAccount = ref(false)

// 獲取用戶資訊
const userEmail = computed(() => authStore.user?.email || '')

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
    coupleStore.userSettings = null
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

// 切換帳號處理
const handleSwitchAccount = async () => {
    if (!switchAccountForm.value.email || !switchAccountForm.value.password) {
        toast.error(t('settings.pleaseEnterCredentials'))
        return
    }
    
    try {
        isSwitchingAccount.value = true
        
        // 先登出當前帳號
        await authStore.signOut()
        clearAllData()
        
        // 登入新帳號
        await authStore.signIn(switchAccountForm.value.email, switchAccountForm.value.password)
        
        // 重新載入資料
        await Promise.all([
            coupleStore.fetchUserProfile(),
            expenseStore.fetchExpenses()
        ])
        
        // 清空表單
        switchAccountForm.value = { email: '', password: '' }
        isSwitchAccountDialogOpen.value = false
        
        toast.success(t('settings.switchAccountSuccess'))
    } catch (error) {
        console.error('切換帳號失敗:', error)
        toast.error(t('settings.switchAccountError'))
    } finally {
        isSwitchingAccount.value = false
    }
}

// 使用 Google 切換帳號
const handleSwitchWithGoogle = async () => {
    try {
        isSwitchingAccount.value = true
        
        // 先登出當前帳號
        await authStore.signOut()
        clearAllData()
        
        // 使用 Google 登入
        await authStore.signInWithGoogle()
        
        // 重新載入資料
        await Promise.all([
            coupleStore.fetchUserProfile(),
            expenseStore.fetchExpenses()
        ])
        
        isSwitchAccountDialogOpen.value = false
        toast.success(t('settings.switchAccountSuccess'))
    } catch (error) {
        console.error('Google 切換帳號失敗:', error)
        toast.error(t('settings.switchAccountError'))
    } finally {
        isSwitchingAccount.value = false
    }
}

// 開啟切換帳號對話框
const openSwitchAccountDialog = () => {
    switchAccountForm.value = { email: '', password: '' }
    isSwitchAccountDialogOpen.value = true
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
                                @click="openSwitchAccountDialog"
                            >
                                <UserCog class="mr-2 h-4 w-4" />
                                {{ t('settings.switchAccount') }}
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
        
        <!-- 切換帳號 Dialog -->
        <Dialog v-model:open="isSwitchAccountDialogOpen">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.switchAccountTitle') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('settings.switchAccountDesc') }}
                    </DialogDescription>
                </DialogHeader>
                
                <div class="grid gap-4 py-4">
                    <!-- Email 輸入 -->
                    <div class="grid gap-2">
                        <Label for="switch-email">{{ t('settings.email') }}</Label>
                        <Input
                            id="switch-email"
                            v-model="switchAccountForm.email"
                            type="email"
                            :placeholder="t('settings.enterEmail')"
                            :disabled="isSwitchingAccount"
                            @keyup.enter="handleSwitchAccount"
                        />
                    </div>
                    
                    <!-- 密碼輸入 -->
                    <div class="grid gap-2">
                        <Label for="switch-password">{{ t('settings.password') }}</Label>
                        <Input
                            id="switch-password"
                            v-model="switchAccountForm.password"
                            type="password"
                            :placeholder="t('settings.enterPassword')"
                            :disabled="isSwitchingAccount"
                            @keyup.enter="handleSwitchAccount"
                        />
                    </div>
                    
                    <!-- 分隔線 -->
                    <div class="relative">
                        <div class="absolute inset-0 flex items-center">
                            <span class="w-full border-t" />
                        </div>
                        <div class="relative flex justify-center text-xs uppercase">
                            <span class="bg-background px-2 text-muted-foreground">
                                {{ t('settings.or') }}
                            </span>
                        </div>
                    </div>
                    
                    <!-- Google 登入按鈕 -->
                    <Button 
                        variant="outline" 
                        @click="handleSwitchWithGoogle"
                        :disabled="isSwitchingAccount"
                        class="w-full"
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
                        {{ t('settings.switchWithGoogle') }}
                    </Button>
                </div>
                
                <DialogFooter>
                    <Button 
                        variant="outline" 
                        @click="isSwitchAccountDialogOpen = false"
                        :disabled="isSwitchingAccount"
                    >
                        {{ t('common.cancel') }}
                    </Button>
                    <Button 
                        @click="handleSwitchAccount"
                        :disabled="isSwitchingAccount || !switchAccountForm.email || !switchAccountForm.password"
                    >
                        {{ isSwitchingAccount ? t('settings.switching') : t('settings.confirmSwitch') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<style scoped>
</style>