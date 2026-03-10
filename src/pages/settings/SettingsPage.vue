<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import i18n from '@/shared/i18n'
import { z } from 'zod'

import { Button } from '@/shared/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/shared/components/ui/drawer'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import TopBar from '@/shared/components/TopBar.vue'
import ThemeToggle from '@/shared/components/ThemeToggle.vue'
import { useLocaleStore } from '@/shared/stores'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useGroupStore } from '@/features/group/stores/group'
import { useExpenseStore } from '@/shared/stores'
import { useAccountManagerStore } from '@/features/auth/stores/accountManager'
import { routes } from '@/app/router/routes/index.ts'
import { toast } from 'vue-sonner'
import { Progress } from '@/shared/components/ui/progress'
import {
    Moon,
    Languages,
    ChevronRight,
    LogOut,
    UserCog,
    Users,
    Wallet,
    UserCircle,
    Info,
    Pencil,
    Check,
    X
} from 'lucide-vue-next'
import { useSettlementStore } from '@/features/settlement/stores/settlement'

const { t, locale } = useI18n()
const localeStore = useLocaleStore()
const authStore = useAuthStore()
const groupStore = useGroupStore()
const expenseStore = useExpenseStore()
const accountManagerStore = useAccountManagerStore()
const settlementStore = useSettlementStore()
const router = useRouter()

// 個人預算設定 Drawer 狀態
const isPersonalBudgetDrawerOpen = ref(false)

// 登出確認 Dialog 狀態
const isLogoutDialogOpen = ref(false)
const isAccountSwitchDrawerOpen = ref(false)

// 獲取用戶資訊
const userEmail = computed(() => authStore.user?.email || '')
const currentUser = computed(() => authStore.user)
const displayName = computed(() =>
    groupStore.userProfile?.display_name || userEmail.value
)

// 行內編輯 display name
const isEditingName = ref(false)
const editNameValue = ref('')
const isSavingName = ref(false)
const nameValidationError = ref('')

const startEditingName = () => {
    editNameValue.value = groupStore.userProfile?.display_name || ''
    nameValidationError.value = ''
    isEditingName.value = true
}

const cancelEditingName = () => {
    isEditingName.value = false
    nameValidationError.value = ''
}

const validateDisplayName = (value: string): boolean => {
    const trimmed = value.trim()
    if (!trimmed) {
        nameValidationError.value = t('settings.displayNameRequired')
        return false
    }
    if (trimmed.length > 50) {
        nameValidationError.value = t('settings.displayNameMaxLength')
        return false
    }
    nameValidationError.value = ''
    return true
}

const saveDisplayName = async () => {
    const trimmed = editNameValue.value.trim()
    if (!validateDisplayName(editNameValue.value)) return
    if (trimmed === (groupStore.userProfile?.display_name || '')) {
        isEditingName.value = false
        return
    }

    try {
        isSavingName.value = true
        await groupStore.updateUserProfile({ display_name: trimmed })

        const userId = authStore.user?.id
        if (userId) {
            settlementStore.invalidateProfileCache(userId)
            accountManagerStore.updateAccountName(userId, trimmed)
        }

        // Fire-and-forget: sync Auth metadata
        authStore.updateProfile({ data: { full_name: trimmed } }).catch(() => {})

        toast.success(t('settings.displayNameSaved'))
        isEditingName.value = false
    } catch (err) {
        console.error('更新顯示名稱失敗:', err)
        toast.error(t('settings.displayNameError'))
    } finally {
        isSavingName.value = false
    }
}

// 獲取所有儲存的帳號
const storedAccounts = computed(() => accountManagerStore.storedAccounts)
const currentAccountId = computed(() => accountManagerStore.currentAccountId)

// 個人預算相關
const personalBudgetUsage = computed(() => {
    const budget = groupStore.personalBudget
    if (!budget || budget <= 0) return 0
    return Math.min((expenseStore.personalStats.month / budget) * 100, 100)
})

const personalBudgetFormSchema = toTypedSchema(z.object({
    personalBudgetInput: z.number({
        invalid_type_error: t('validation.number')
    }).min(0, t('validation.number')).optional()
}))

const personalBudgetForm = useForm({
    validationSchema: personalBudgetFormSchema,
    initialValues: {
        personalBudgetInput: undefined
    }
})

const personalBudgetError = computed(() =>
    personalBudgetForm.errors.value.personalBudgetInput ?? ''
)

const budgetToInputValue = (value: number | null | undefined) =>
    value === null || value === undefined
        ? undefined
        : value

// 打開個人預算設定 Drawer
const openPersonalBudgetDrawer = () => {
    personalBudgetForm.resetForm({
        values: {
            personalBudgetInput: budgetToInputValue(groupStore.personalBudget)
        }
    })
    isPersonalBudgetDrawerOpen.value = true
}

// 儲存個人預算
const savePersonalBudget = personalBudgetForm.handleSubmit(async (values) => {
    try {
        await groupStore.updatePersonalBudget(
            values.personalBudgetInput ?? null
        )
        toast.success(t('settings.personalBudgetSaved'))
        isPersonalBudgetDrawerOpen.value = false
    } catch (error) {
        console.error('儲存個人預算失敗:', error)
        toast.error(t('common.error'))
    }
})

// 清除個人預算
const clearPersonalBudget = async () => {
    try {
        await groupStore.updatePersonalBudget(null)
        personalBudgetForm.resetForm({
            values: {
                personalBudgetInput: undefined
            }
        })
        toast.success(t('settings.personalBudgetCleared'))
        isPersonalBudgetDrawerOpen.value = false
    } catch (error) {
        console.error('清除個人預算失敗:', error)
        toast.error(t('common.error'))
    }
}

// 處理語言變更
const handleLanguageChange = async (value: unknown) => {
    if (typeof value === 'string' && value) {
        const newLocale = value as 'zh-TW' | 'en'

        // 更新 store
        localeStore.setLocale(newLocale)

        // 更新 i18n 實例
        i18n.global.locale.value = newLocale

        // 等待下一個 tick 再更新本地 locale
        await nextTick()
        locale.value = newLocale
    }
}

// 跳轉到群組列表頁面
const goToGroupList = () => {
    router.push({ name: 'GroupList' })
}

// 清除所有資料
const clearAllData = () => {
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
    <div class="min-h-screen bg-background glass-page-bg">
        <!-- 頂部導航欄 -->
        <TopBar :title="t('settings.title')" />

        <!-- 主要內容區域 -->
        <main class="px-4 pb-28">
            <!-- 用戶資訊 -->
            <div class="flex flex-col items-center py-6 gap-3">
                <Avatar class="h-16 w-16">
                    <AvatarImage :src="groupStore.userProfile?.avatar_url || currentUser?.user_metadata?.avatar_url || ''" />
                    <AvatarFallback class="bg-primary text-primary-foreground text-xl font-heading">
                        {{ displayName?.charAt(0)?.toUpperCase() || '?' }}
                    </AvatarFallback>
                </Avatar>
                <div class="text-center">
                    <!-- 顯示模式 -->
                    <div v-if="!isEditingName" class="flex items-center justify-center gap-1.5">
                        <p class="text-lg font-semibold font-heading text-foreground">
                            {{ displayName }}
                        </p>
                        <button
                            class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            @click="startEditingName"
                        >
                            <Pencil class="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <!-- 編輯模式 -->
                    <div v-else class="flex flex-col items-center gap-1.5">
                        <div class="flex items-center gap-1.5">
                            <Input
                                v-model="editNameValue"
                                class="h-8 w-48 text-center text-sm"
                                :class="nameValidationError ? 'border-destructive' : ''"
                                :placeholder="t('settings.displayNamePlaceholder')"
                                :disabled="isSavingName"
                                @keydown.enter="saveDisplayName"
                                @keydown.escape="cancelEditingName"
                            />
                            <button
                                class="p-1 rounded-md text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors disabled:opacity-50"
                                :disabled="isSavingName"
                                @click="saveDisplayName"
                            >
                                <Check class="h-4 w-4" />
                            </button>
                            <button
                                class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                :disabled="isSavingName"
                                @click="cancelEditingName"
                            >
                                <X class="h-4 w-4" />
                            </button>
                        </div>
                        <p v-if="nameValidationError" class="text-xs text-destructive">
                            {{ nameValidationError }}
                        </p>
                    </div>
                    <p class="text-sm text-muted-foreground">{{ userEmail }}</p>
                </div>
            </div>

            <div class="space-y-4">
                <!-- 外觀區塊標題 -->
                <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">外觀</h2>

                <!-- 主題設定 -->
                <div class="glass rounded-2xl p-4 hover-transition">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg glass-light text-purple-600 dark:text-purple-400">
                                <Moon class="h-5 w-5" />
                            </div>
                            <div>
                                <h3 class="text-base font-medium text-foreground">{{ t('settings.theme') }}</h3>
                                <p class="text-sm text-muted-foreground">{{ t('settings.themeDesc') }}</p>
                            </div>
                        </div>
                        <ThemeToggle />
                    </div>
                </div>

                <!-- 語言設定 -->
                <div class="glass rounded-2xl p-4 hover-transition">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg glass-light text-blue-600 dark:text-blue-400">
                                <Languages class="h-5 w-5" />
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
                </div>

                <!-- 預算區塊標題 -->
                <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 mt-8">預算</h2>

                <!-- 個人預算設定 -->
                <div class="glass rounded-2xl p-4 cursor-pointer press-feedback hover-transition" @click="openPersonalBudgetDrawer">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg glass-light text-amber-600 dark:text-amber-400">
                                <Wallet class="h-5 w-5" />
                            </div>
                            <div>
                                <h3 class="text-base font-medium text-foreground">{{ t('settings.personalBudget') }}</h3>
                                <p class="text-sm text-muted-foreground">
                                    {{ groupStore.personalBudget
                                        ? `NT$ ${groupStore.personalBudget.toLocaleString()}`
                                        : t('settings.personalBudgetNotSet')
                                    }}
                                </p>
                            </div>
                        </div>
                        <ChevronRight class="h-5 w-5 text-muted-foreground" />
                    </div>
                </div>

                <!-- 更多設定項目 -->
                <div class="mt-8">
                    <h2 class="mb-4 text-sm font-medium text-muted-foreground">{{ t('settings.moreSettings') }}</h2>

                    <!-- 群組設定 -->
                    <div class="glass rounded-2xl p-4 mb-3 cursor-pointer press-feedback hover-transition" @click="goToGroupList">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg glass-light text-emerald-600 dark:text-emerald-400">
                                    <Users class="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 class="text-base font-medium text-foreground">{{ t('group.title') }}</h3>
                                    <p class="text-sm text-muted-foreground">{{ t('group.manageGroups') }}</p>
                                </div>
                            </div>
                            <ChevronRight class="h-5 w-5 text-muted-foreground" />
                        </div>
                    </div>

                    <!-- 帳戶設定 -->
                    <div class="glass rounded-2xl p-4 mb-3">
                        <div class="space-y-4">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg glass-light text-slate-600 dark:text-slate-400">
                                    <UserCircle class="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 class="text-base font-medium text-foreground">{{ t('settings.account') }}</h3>
                                    <p class="text-sm text-muted-foreground">{{ userEmail }}</p>
                                </div>
                            </div>

                            <!-- 切換帳號按鈕 -->
                            <Button
                                variant="outline"
                                class="w-full justify-start press-feedback"
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
                                class="w-full justify-start text-destructive hover:text-destructive press-feedback"
                                @click="isLogoutDialogOpen = true"
                            >
                                <LogOut class="mr-2 h-4 w-4" />
                                {{ t('settings.logout') }}
                            </Button>
                        </div>
                    </div>

                    <!-- 關於 -->
                    <div class="glass rounded-2xl p-4 cursor-pointer press-feedback hover-transition">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg glass-light text-sky-600 dark:text-sky-400">
                                    <Info class="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 class="text-base font-medium text-foreground">{{ t('settings.about') }}</h3>
                                    <p class="text-sm text-muted-foreground">{{ t('settings.version') }}</p>
                                </div>
                            </div>
                            <ChevronRight class="h-5 w-5 text-muted-foreground" />
                        </div>
                    </div>
                </div>
            </div>
        </main>

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
                <form class="px-4 pb-6 space-y-4" @submit="savePersonalBudget">
                    <div class="space-y-2">
                        <Label>{{ t('settings.monthlyBudgetAmount') }}</Label>
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-muted-foreground">NT$</span>
                            <Input
                                :model-value="personalBudgetForm.values.personalBudgetInput ?? ''"
                                type="number"
                                min="0"
                                step="100"
                                :class="personalBudgetError ? 'border-destructive' : ''"
                                :placeholder="t('settings.enterBudgetAmount')"
                                @update:model-value="personalBudgetForm.setFieldValue('personalBudgetInput', $event === '' ? undefined : Number($event))"
                            />
                        </div>
                        <p v-if="personalBudgetError" class="text-xs text-destructive">
                            {{ personalBudgetError }}
                        </p>
                        <p class="text-xs text-muted-foreground">
                            {{ t('settings.personalBudgetDesc') }}
                        </p>
                    </div>

                    <!-- 當前使用進度 (若已設定預算) -->
                    <div v-if="groupStore.personalBudget" class="space-y-2">
                        <Label>{{ t('settings.currentUsage') }}</Label>
                        <Progress :model-value="personalBudgetUsage" class="h-2" />
                        <div class="flex justify-between text-xs text-muted-foreground">
                            <span>NT$ {{ expenseStore.personalStats.month.toLocaleString() }}</span>
                            <span>{{ personalBudgetUsage.toFixed(0) }}%</span>
                        </div>
                    </div>

                    <div class="flex gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            class="flex-1"
                            @click="clearPersonalBudget"
                        >
                            {{ t('settings.clearBudget') }}
                        </Button>
                        <Button
                            type="submit"
                            class="flex-1"
                            :disabled="groupStore.loading"
                        >
                            {{ t('common.save') }}
                        </Button>
                    </div>
                </form>
            </DrawerContent>
        </Drawer>
    </div>
</template>

<style scoped>
</style>
