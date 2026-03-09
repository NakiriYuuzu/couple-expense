<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Pencil, Trash2, User, Calendar, DollarSign } from 'lucide-vue-next'
import TopBar from '@/shared/components/TopBar.vue'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '@/shared/components/ui/alert-dialog'
import {
    Avatar,
    AvatarFallback,
    AvatarImage
} from '@/shared/components/ui/avatar'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Calendar as CalendarComponent } from '@/shared/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { parseDate, type DateValue } from '@internationalized/date'
import SplitBadge from '@/features/split/components/SplitBadge.vue'
import { useExpenseStore } from '@/shared/stores'
import { useSplitStore } from '@/shared/stores'
import { useCategories, CategoryUtils, type CategoryId } from '@/features/expense/composables/useCategories'
import { toast } from 'vue-sonner'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { categories } = useCategories()

const expenseId = route.params.id as string
const expenseStore = useExpenseStore()
const splitStore = useSplitStore()

// 從已載入的 expenses 中找到這筆
const expense = computed(() =>
    expenseStore.expenses.find(e => e.id === expenseId) ?? null
)

// 分帳資料
const splits = computed(() => splitStore.getSplitsForExpense(expenseId))

// 圖標元件
const iconComponent = computed(() => {
    if (!expense.value) return null
    return CategoryUtils.getIconByKey(CategoryUtils.getIconKey(expense.value.category))
})

// 格式化金額
const formattedAmount = computed(() => {
    if (!expense.value) return ''
    return `NT$ ${Math.round(expense.value.amount).toLocaleString()}`
})

// 格式化日期
const formattedDate = computed(() => {
    if (!expense.value) return ''
    return expense.value.date.replace(/-/g, '/')
})

// 編輯 Dialog 狀態
const isEditDialogOpen = shallowRef(false)
const editDateValue = shallowRef<DateValue | undefined>(undefined)

const editForm = shallowRef({
    title: '',
    amount: 0,
    category: 'food' as CategoryId,
    date: ''
})

const openEditDialog = () => {
    if (!expense.value) return
    editForm.value = {
        title: expense.value.title,
        amount: expense.value.amount,
        category: expense.value.category,
        date: expense.value.date.replace(/-/g, '/')
    }
    const dateParts = expense.value.date.split('-')
    editDateValue.value = parseDate(`${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`)
    isEditDialogOpen.value = true
}

const handleEditDateSelect = (date: DateValue | undefined) => {
    if (date) {
        editForm.value = {
            ...editForm.value,
            date: `${date.year}/${String(date.month).padStart(2, '0')}/${String(date.day).padStart(2, '0')}`
        }
    }
}

const formatEditDate = (dateStr: string) => {
    if (!dateStr) return t('home.selectDate')
    return dateStr
}

const saveEditExpense = async () => {
    if (!expense.value) return
    try {
        const storeDate = editForm.value.date.replace(/\//g, '-')
        await expenseStore.updateExpense(expense.value.id, {
            title: editForm.value.title,
            amount: Math.round(editForm.value.amount),
            category: editForm.value.category,
            date: storeDate
        })
        isEditDialogOpen.value = false
        toast.success(t('expense.updated'))
    } catch (err) {
        console.error('更新費用失敗:', err)
        toast.error(t('expense.updateFailed'))
    }
}

const cancelEditExpense = () => {
    isEditDialogOpen.value = false
}

// 刪除費用
const handleDelete = async () => {
    if (!expense.value) return
    const deletedExpense = { ...expense.value }
    const expenseTitle = deletedExpense.title

    try {
        await expenseStore.deleteExpense(deletedExpense.id)
        router.back()
        toast.success(`${t('expense.deleted')}「${expenseTitle}」`, {
            action: {
                label: t('common.undo'),
                onClick: async () => {
                    try {
                        await expenseStore.addExpense({
                            title: deletedExpense.title,
                            amount: deletedExpense.amount,
                            category: deletedExpense.category,
                            icon: deletedExpense.icon ?? CategoryUtils.getIconKey(deletedExpense.category),
                            date: deletedExpense.date,
                            group_id: deletedExpense.group_id
                        })
                        toast.success(t('expense.restored'))
                        await expenseStore.fetchExpenses()
                    } catch (err) {
                        console.error('復原失敗:', err)
                        toast.error(t('expense.restoreFailed'))
                    }
                }
            },
            duration: 5000
        })
    } catch (err) {
        console.error('刪除費用失敗:', err)
        toast.error(t('expense.deleteFailed'))
    }
}

// 取得使用者頭像 fallback 文字
const getAvatarFallback = (displayName: string | null | undefined) => {
    if (!displayName) return '?'
    return displayName.slice(0, 1).toUpperCase()
}

// 載入分帳資料
onMounted(async () => {
    if (expense.value?.group_id) {
        await splitStore.fetchSplitsForExpense(expenseId)
    }
})
</script>

<template>
    <div class="min-h-screen bg-background">
        <TopBar
            :title="t('expense.detail', '支出詳情')"
            :show-back-button="true"
            @back="router.back()"
        >
            <template #action>
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-10 w-10 rounded-full"
                    @click="openEditDialog"
                >
                    <Pencil class="h-5 w-5" />
                </Button>
            </template>
        </TopBar>

        <main class="px-4 pb-24 pt-6 space-y-4">
            <!-- 載入中或找不到 -->
            <div v-if="!expense" class="text-center py-12">
                <p class="text-muted-foreground">{{ t('expense.notFound', '找不到此支出記錄') }}</p>
            </div>

            <template v-else>
                <!-- 基本資訊 Card -->
                <div class="bg-card rounded-2xl p-5 shadow-sm space-y-4">
                    <!-- 分類圖標 + 標題 -->
                    <div class="flex items-center gap-3">
                        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-accent">
                            <component
                                v-if="iconComponent"
                                :is="iconComponent"
                                class="h-5 w-5 text-brand-primary"
                            />
                        </div>
                        <div class="flex-1 min-w-0">
                            <h2 class="text-base font-medium text-card-foreground truncate">
                                {{ expense.title }}
                            </h2>
                            <p class="text-xs text-muted-foreground">{{ expense.category }}</p>
                        </div>
                        <SplitBadge v-if="expense.split_method" :method="expense.split_method" />
                    </div>

                    <!-- 金額 -->
                    <div class="flex items-center gap-2">
                        <DollarSign class="h-4 w-4 text-muted-foreground" />
                        <span class="text-2xl font-semibold text-expense">{{ formattedAmount }}</span>
                        <Badge v-if="expense.is_settled" variant="secondary" class="text-[10px] text-green-600">
                            {{ t('expense.settled', '已結算') }}
                        </Badge>
                    </div>

                    <!-- 日期 -->
                    <div class="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar class="h-4 w-4" />
                        <span>{{ formattedDate }}</span>
                    </div>

                    <!-- 付款人（群組支出） -->
                    <div v-if="expense.group_id && expense.user" class="flex items-center gap-2 text-sm text-muted-foreground">
                        <User class="h-4 w-4" />
                        <span>{{ t('expense.paidBy', '付款人') }}：{{ expense.user.display_name || t('expense.unknownUser', '未知使用者') }}</span>
                    </div>

                    <!-- 備註 -->
                    <div v-if="expense.notes" class="rounded-lg bg-muted/50 px-3 py-2">
                        <p class="text-xs text-muted-foreground leading-relaxed">{{ expense.notes }}</p>
                    </div>
                </div>

                <!-- 分帳明細 Section（僅群組支出） -->
                <div v-if="expense.group_id" class="bg-card rounded-2xl p-5 shadow-sm space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-medium text-foreground">{{ t('split.detail', '分帳明細') }}</h3>
                        <SplitBadge v-if="expense.split_method" :method="expense.split_method" />
                    </div>

                    <!-- 分帳載入中 -->
                    <div v-if="splitStore.loading" class="text-center py-4">
                        <p class="text-xs text-muted-foreground">{{ t('common.loading', '載入中...') }}</p>
                    </div>

                    <!-- 無分帳資料 -->
                    <div v-else-if="splits.length === 0" class="text-center py-4">
                        <p class="text-xs text-muted-foreground">{{ t('split.noData', '無分帳資料') }}</p>
                    </div>

                    <!-- 參與者列表 -->
                    <ul v-else class="space-y-2">
                        <li
                            v-for="split in splits"
                            :key="split.id"
                            class="flex items-center justify-between gap-3"
                        >
                            <div class="flex items-center gap-2">
                                <Avatar class="h-7 w-7">
                                    <AvatarImage :src="''" :alt="split.user_id" />
                                    <AvatarFallback class="text-[10px]">
                                        {{ getAvatarFallback(split.user_id) }}
                                    </AvatarFallback>
                                </Avatar>
                                <span class="text-xs text-foreground">{{ split.user_id }}</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <span
                                    v-if="split.percentage !== null"
                                    class="text-[10px] text-muted-foreground"
                                >
                                    {{ split.percentage }}%
                                </span>
                                <span
                                    v-if="split.shares !== null"
                                    class="text-[10px] text-muted-foreground"
                                >
                                    {{ split.shares }}份
                                </span>
                                <span class="text-xs font-medium text-expense">
                                    NT$ {{ Math.round(split.amount) }}
                                </span>
                                <Badge
                                    v-if="split.is_settled"
                                    variant="secondary"
                                    class="text-[9px] px-1 py-0 text-green-600"
                                >
                                    {{ t('expense.settled', '已結算') }}
                                </Badge>
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- 操作區域 -->
                <div class="flex gap-3">
                    <Button
                        variant="outline"
                        class="flex-1"
                        @click="openEditDialog"
                    >
                        <Pencil class="h-4 w-4 mr-2" />
                        {{ t('common.edit', '編輯') }}
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger as-child>
                            <Button variant="destructive" class="flex-1">
                                <Trash2 class="h-4 w-4 mr-2" />
                                {{ t('common.delete', '刪除') }}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{{ t('expense.confirmDelete', '確認刪除') }}</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {{ t('expense.confirmDeleteDesc', '確定要刪除這筆支出記錄嗎？此操作無法撤銷。') }}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>{{ t('common.cancel', '取消') }}</AlertDialogCancel>
                                <AlertDialogAction @click="handleDelete">
                                    {{ t('common.delete', '刪除') }}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </template>
        </main>

        <!-- 編輯費用 Dialog -->
        <Dialog v-model:open="isEditDialogOpen">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('expense.edit') }}</DialogTitle>
                    <DialogDescription>{{ t('expense.editDesc') }}</DialogDescription>
                </DialogHeader>

                <div class="space-y-4 py-4">
                    <!-- 費用標題 -->
                    <div class="space-y-2">
                        <Label for="detail-edit-title">{{ t('expense.title') }}</Label>
                        <Input
                            id="detail-edit-title"
                            v-model="editForm.title"
                            :placeholder="t('expense.titlePlaceholder')"
                        />
                    </div>

                    <!-- 金額 -->
                    <div class="space-y-2">
                        <Label for="detail-edit-amount">{{ t('expense.amount') }} (NT$)</Label>
                        <Input
                            id="detail-edit-amount"
                            v-model="editForm.amount"
                            type="number"
                            min="0"
                            step="1"
                        />
                    </div>

                    <!-- 類別選擇 -->
                    <div class="space-y-2">
                        <Label>{{ t('expense.category') }}</Label>
                        <div class="grid grid-cols-3 gap-2">
                            <button
                                v-for="category in categories"
                                :key="category.id"
                                type="button"
                                @click="editForm = { ...editForm, category: category.id }"
                                :class="[
                                    'flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all duration-200',
                                    editForm.category === category.id
                                        ? 'border-brand-primary bg-brand-accent'
                                        : 'border-border bg-background hover:border-brand-primary/50'
                                ]"
                            >
                                <div :class="[
                                    'flex h-8 w-8 items-center justify-center rounded-lg',
                                    editForm.category === category.id ? 'bg-brand-primary' : 'bg-brand-accent'
                                ]">
                                    <component
                                        :is="category.icon"
                                        :class="[
                                            'h-4 w-4',
                                            editForm.category === category.id ? 'text-brand-primary-foreground' : 'text-brand-primary'
                                        ]"
                                    />
                                </div>
                                <span class="text-xs font-medium">{{ category.name }}</span>
                            </button>
                        </div>
                    </div>

                    <!-- 日期選擇 -->
                    <div class="space-y-2">
                        <Label>{{ t('expense.date') }}</Label>
                        <Popover>
                            <PopoverTrigger as-child>
                                <Button variant="outline" class="w-full justify-start text-left font-normal">
                                    <Calendar class="mr-2 h-4 w-4" />
                                    {{ formatEditDate(editForm.date) }}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent class="w-auto p-0" align="start">
                                <CalendarComponent
                                    :model-value="editDateValue as any"
                                    @update:model-value="handleEditDateSelect"
                                    initial-focus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <DialogFooter class="flex-col sm:flex-row gap-2">
                    <Button variant="outline" @click="cancelEditExpense" class="flex-1">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button
                        @click="saveEditExpense"
                        class="flex-1 bg-brand-primary hover:bg-brand-primary/90"
                        :disabled="expenseStore.loading"
                    >
                        {{ expenseStore.loading ? t('common.saving', '儲存中...') : t('common.save') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
