<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import i18n from '@/i18n'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import TopBar from '@/components/TopBar.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import NotificationSettings from '@/components/NotificationSettings.vue'
import { useLocaleStore, useNotificationStore } from '@/stores'
import { routes } from '@/routers/routes/index.ts'
import { 
    Moon, 
    Languages, 
    Bell,
    ChevronRight
} from 'lucide-vue-next'

const { t, locale } = useI18n()
const localeStore = useLocaleStore()
const notificationStore = useNotificationStore()
const router = useRouter()

// 通知設定 Drawer 狀態
const isNotificationDrawerOpen = ref(false)

// 主題相關
const isDarkMode = ref(false)

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
                    
                    <!-- 範例: 帳戶設定 -->
                    <Card class="p-4 mb-3 cursor-pointer hover:bg-accent transition-colors">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent">
                                    <span class="text-lg">👤</span>
                                </div>
                                <div>
                                    <h3 class="text-base font-medium text-foreground">{{ t('settings.account') }}</h3>
                                    <p class="text-sm text-muted-foreground">{{ t('settings.accountDesc') }}</p>
                                </div>
                            </div>
                            <ChevronRight class="h-5 w-5 text-muted-foreground" />
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
    </div>
</template>

<style scoped>
</style>