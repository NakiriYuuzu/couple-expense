<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Pencil, Trash2, User, Calendar, DollarSign, Loader2 } from 'lucide-vue-next'
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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogScrollContent,
    DialogTitle
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Calendar as CalendarComponent } from '@/shared/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { parseDate, type DateValue } from '@internationalized/date'
import SplitBadge from '@/features/split/components/SplitBadge.vue'
import SplitConfigurator from '@/features/split/components/SplitConfigurator.vue'
import { useExpenseStore } from '@/shared/stores'
import { useSplitStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import { useCategories, CategoryUtils, type CategoryId } from '@/features/expense/composables/useCategories'
import type { SplitMethod } from '@/entities/split/types'
import type { SplitParticipant } from '@/entities/split/types'
import { supabase } from '@/shared/lib/supabase'
import { toast } from 'vue-sonner'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { categories } = useCategories()

const expenseId = route.params.id as string
const expenseStore = useExpenseStore()
const splitStore = useSplitStore()
const groupStore = useGroupStore()

// 從已載入的 expenses 中找到這筆
const expense = computed(() =>
    expenseStore.expenses.find(e => e.id === expenseId) ?? null
)

// 分帳資料
const splits = computed(() => splitStore.getSplitsForExpense(expenseId))

type SplitProfileMap = Record<string, { displayName: string | null; avatarUrl: string | null }>

const splitProfiles = ref<SplitProfileMap>({})

const detailedSplits = computed(() =>
    splits.value.map(split => ({
        ...split,
        displayName: splitProfiles.value[split.user_id]?.displayName ?? null,
        avatarUrl: splitProfiles.value[split.user_id]?.avatarUrl ?? null
    }))
)

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
const editSplitConfiguratorKey = ref(0)
const editSplitConfiguratorRef = ref<InstanceType<typeof SplitConfigurator> | null>(null)

const editExpenseSchema = computed(() => z.object({
    title: z.string()
        .trim()
        .min(1, t('validation.required')),
    amount: z.number({
        required_error: t('validation.required'),
        invalid_type_error: t('validation.number')
    }).positive(t('validation.positiveNumber')),
    category: z.string()
        .trim()
        .min(1, t('validation.required')),
    date: z.string()
        .trim()
        .min(1, t('validation.required'))
}))

const {
    values: editForm,
    errors: editErrors,
    defineField: defineEditField,
    handleSubmit: handleEditSubmit,
    resetForm: resetEditForm,
    setFieldValue: setEditFieldValue
} = useForm({
    validationSchema: computed(() => toTypedSchema(editExpenseSchema.value)),
    initialValues: {
        title: '',
        amount: undefined,
        category: 'food',
        date: ''
    }
})

const [editTitle, editTitleAttrs] = defineEditField('title')

const editSplitData = ref<{
    splitMethod: SplitMethod
    paidBy: string
    participants: SplitParticipant[]
}>({
    splitMethod: 'equal',
    paidBy: '',
    participants: []
})

const buildEditParticipants = (): SplitParticipant[] => {
    if (!expense.value?.group_id) return []

    const members = groupStore.membersByGroup[expense.value.group_id] ?? []
    const splitMap = new Map(splits.value.map(split => [split.user_id, split]))
    const participantIds = members.length > 0
        ? members.map(member => member.user_id)
        : Array.from(splitMap.keys())

    return participantIds.map(userId => {
        const split = splitMap.get(userId)

        return {
            userId,
            displayName: null,
            avatarUrl: null,
            amount: split?.amount ?? 0,
            percentage: split?.percentage ?? undefined,
            shares: split?.shares ?? undefined,
            isIncluded: split !== undefined || splits.value.length === 0
        }
    })
}

const openEditDialog = () => {
    if (!expense.value) return
    resetEditForm({
        values: {
            title: expense.value.title,
            amount: expense.value.amount,
            category: expense.value.category,
            date: expense.value.date.replace(/-/g, '/')
        }
    })
    const dateParts = expense.value.date.split('-')
    editDateValue.value = parseDate(`${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`)

    if (expense.value.group_id) {
        editSplitData.value = {
            splitMethod: (expense.value.split_method ?? 'equal') as SplitMethod,
            paidBy: expense.value.paid_by ?? expense.value.user_id,
            participants: buildEditParticipants()
        }
        editSplitConfiguratorKey.value += 1
    }

    isEditDialogOpen.value = true
}

const handleEditDateSelect = (date: DateValue | undefined) => {
    if (date) {
        setEditFieldValue(
            'date',
            `${date.year}/${String(date.month).padStart(2, '0')}/${String(date.day).padStart(2, '0')}`
        )
    }
}

const formatEditDate = (dateStr: string) => {
    if (!dateStr) return t('home.selectDate')
    return dateStr
}

const saveEditExpense = handleEditSubmit(async (validatedValues) => {
    if (!expense.value) return
    try {
        const storeDate = validatedValues.date.replace(/\//g, '-')
        const updates = {
            title: validatedValues.title,
            amount: Math.round(validatedValues.amount),
            category: validatedValues.category as CategoryId,
            date: storeDate
        }

        if (expense.value.group_id) {
            if (!(editSplitConfiguratorRef.value?.isBalanced ?? false)) {
                toast.error(t('split.notBalanced'))
                return
            }

            const calculatedSplits = editSplitConfiguratorRef.value?.calculatedSplits ?? []
            const splitPayload = calculatedSplits
                .filter(participant => participant.isIncluded)
                .map(participant => ({
                    userId: participant.userId,
                    amount: participant.amount,
                    percentage: participant.percentage,
                    shares: participant.shares
                }))

            await expenseStore.updateExpense(expense.value.id, {
                ...updates,
                split_method: editSplitData.value.splitMethod,
                paid_by: editSplitData.value.paidBy,
                is_settled: false
            })

            await splitStore.updateExpenseSplits(expense.value.id, splitPayload)
        } else {
            await expenseStore.updateExpense(expense.value.id, updates)
        }

        isEditDialogOpen.value = false
        toast.success(t('expense.updated'))
    } catch (err) {
        console.error('更新費用失敗:', err)
        toast.error(t('expense.updateFailed'))
    }
})

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

const loadSplitProfiles = async () => {
    const unresolvedIds = [...new Set(splits.value.map(split => split.user_id))]
        .filter(userId => !(userId in splitProfiles.value))

    if (unresolvedIds.length === 0) return

    const { data, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, display_name, avatar_url')
        .in('id', unresolvedIds)

    if (profileError) {
        console.error('載入分帳成員資料失敗:', profileError)
        return
    }

    const nextProfiles: SplitProfileMap = {}

    for (const profile of data ?? []) {
        nextProfiles[profile.id] = {
            displayName: profile.display_name ?? null,
            avatarUrl: profile.avatar_url ?? null
        }
    }

    splitProfiles.value = {
        ...splitProfiles.value,
        ...nextProfiles
    }
}

// 載入分帳資料
onMounted(async () => {
    if (expense.value?.group_id) {
        await splitStore.fetchSplitsForExpense(expenseId)
    }
})

const debouncedLoadSplitProfiles = useDebounceFn(loadSplitProfiles, 300)

watch(splits, () => {
    void debouncedLoadSplitProfiles()
}, { immediate: true })
</script>

<template>
    <div class="min-h-screen bg-background glass-page-bg">
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

        <main class="px-4 pb-28 pt-6 space-y-4">
            <!-- 載入中 -->
            <div v-if="!expense && expenseStore.loading" class="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 class="h-8 w-8 animate-spin text-brand-primary" />
                <p class="text-sm text-muted-foreground">{{ t('common.loading', '載入中...') }}</p>
            </div>

            <!-- 找不到 -->
            <div v-else-if="!expense" class="text-center py-12">
                <p class="text-muted-foreground">{{ t('expense.notFound', '找不到此支出記錄') }}</p>
            </div>

            <template v-else>
                <!-- 基本資訊 Card (Hero) -->
                <div
                    class="glass-elevated rounded-2xl p-5 space-y-4"
                    :style="{ background: `linear-gradient(135deg, var(--category-${expense.category}-bg), var(--card))` }"
                >
                    <!-- 分類圖標 + 標題 -->
                    <div class="flex items-center gap-3">
                        <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-accent">
                            <component
                                v-if="iconComponent"
                                :is="iconComponent"
                                class="h-7 w-7 text-brand-primary"
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
                        <span class="text-4xl font-bold text-expense">{{ formattedAmount }}</span>
                        <Badge v-if="expense.is_settled" variant="secondary" class="text-[10px] text-green-600">
                            {{ t('expense.settled', '已結算') }}
                        </Badge>
                    </div>

                    <!-- 日期 + 付款人 pills -->
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="inline-flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1 text-sm text-muted-foreground">
                            <Calendar class="h-4 w-4" />
                            {{ formattedDate }}
                        </span>

                        <span
                            v-if="expense.group_id && expense.user"
                            class="inline-flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1 text-sm text-muted-foreground"
                        >
                            <User class="h-4 w-4" />
                            {{ t('expense.paidBy', '付款人') }}：{{ expense.user.display_name || t('expense.unknownUser', '未知使用者') }}
                        </span>
                    </div>

                    <!-- 備註 -->
                    <div v-if="expense.notes" class="rounded-lg bg-muted/50 px-3 py-2">
                        <p class="text-xs text-muted-foreground leading-relaxed">{{ expense.notes }}</p>
                    </div>
                </div>

                <!-- 分帳明細 Section（僅群組支出） -->
                <div v-if="expense.group_id" class="glass rounded-2xl p-5 space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-medium text-foreground">{{ t('split.detail', '分帳明細') }}</h3>
                        <SplitBadge v-if="expense.split_method" :method="expense.split_method" />
                    </div>

                    <!-- 分帳載入中 -->
                    <div v-if="splitStore.loading" class="text-center py-4">
                        <p class="text-xs text-muted-foreground">{{ t('common.loading', '載入中...') }}</p>
                    </div>

                    <!-- 無分帳資料 -->
                    <div v-else-if="detailedSplits.length === 0" class="text-center py-4">
                        <p class="text-xs text-muted-foreground">{{ t('split.noData', '無分帳資料') }}</p>
                    </div>

                    <!-- 參與者列表 -->
                    <ul v-else class="space-y-2">
                        <li
                            v-for="split in detailedSplits"
                            :key="split.id"
                            class="flex items-center justify-between gap-3"
                        >
                            <div class="flex items-center gap-2">
                                <Avatar class="h-7 w-7">
                                    <AvatarImage :src="split.avatarUrl || ''" :alt="split.displayName || t('expense.unknownUser', '未知使用者')" />
                                    <AvatarFallback class="text-[10px]">
                                        {{ getAvatarFallback(split.displayName) }}
                                    </AvatarFallback>
                                </Avatar>
                                <span class="text-xs text-foreground">{{ split.displayName || t('expense.unknownUser', '未知使用者') }}</span>
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
                        class="flex-1 press-feedback"
                        @click="openEditDialog"
                    >
                        <Pencil class="h-4 w-4 mr-2" />
                        {{ t('common.edit', '編輯') }}
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger as-child>
                            <Button variant="destructive" class="flex-1 press-feedback">
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
            <DialogScrollContent class="sm:max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden p-0 gap-0">
                <DialogHeader class="px-6 pt-6 pb-4 border-b border-border">
                    <DialogTitle>{{ t('expense.edit') }}</DialogTitle>
                    <DialogDescription>{{ t('expense.editDesc') }}</DialogDescription>
                </DialogHeader>

                <div class="overflow-y-auto px-6 py-4 max-h-[calc(100vh-14rem)]">
                    <div class="space-y-4">
                    <!-- 費用標題 -->
                    <div class="space-y-2">
                        <Label for="detail-edit-title">{{ t('expense.title') }}</Label>
                        <Input
                            id="detail-edit-title"
                            v-model="editTitle"
                            v-bind="editTitleAttrs"
                            :placeholder="t('expense.titlePlaceholder')"
                            :aria-invalid="Boolean(editErrors.title)"
                        />
                        <p v-if="editErrors.title" class="text-xs text-destructive">
                            {{ editErrors.title }}
                        </p>
                    </div>

                    <!-- 金額 -->
                    <div class="space-y-2">
                        <Label for="detail-edit-amount">{{ t('expense.amount') }} (NT$)</Label>
                        <Input
                            id="detail-edit-amount"
                            :model-value="editForm.amount ?? ''"
                            type="number"
                            min="0"
                            step="1"
                            :aria-invalid="Boolean(editErrors.amount)"
                            @update:model-value="setEditFieldValue('amount', $event === '' ? undefined : Number($event))"
                        />
                        <p v-if="editErrors.amount" class="text-xs text-destructive">
                            {{ editErrors.amount }}
                        </p>
                    </div>

                    <!-- 類別選擇 -->
                    <div class="space-y-2">
                        <Label>{{ t('expense.category') }}</Label>
                        <div class="grid grid-cols-3 gap-2">
                            <button
                                v-for="category in categories"
                                :key="category.id"
                                type="button"
                                @click="setEditFieldValue('category', category.id)"
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
                        <p v-if="editErrors.category" class="text-xs text-destructive">
                            {{ editErrors.category }}
                        </p>
                    </div>

                    <!-- 日期選擇 -->
                    <div class="space-y-2">
                        <Label>{{ t('expense.date') }}</Label>
                        <Popover>
                            <PopoverTrigger as-child>
                                <Button
                                    variant="outline"
                                    :class="[
                                        'w-full justify-start text-left font-normal',
                                        editErrors.date && 'border-destructive'
                                    ]"
                                    :aria-invalid="Boolean(editErrors.date)"
                                >
                                    <Calendar class="mr-2 h-4 w-4" />
                                    {{ formatEditDate(editForm.date ?? '') }}
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
                        <p v-if="editErrors.date" class="text-xs text-destructive">
                            {{ editErrors.date }}
                        </p>
                    </div>

                    <div v-if="expense?.group_id" class="space-y-2">
                        <Label>{{ t('split.stepSplitConfig') }}</Label>
                        <div class="rounded-xl border border-border bg-background p-3">
                            <SplitConfigurator
                                :key="editSplitConfiguratorKey"
                                ref="editSplitConfiguratorRef"
                                :total-amount="editForm.amount ?? 0"
                                :group-id="expense.group_id"
                                v-model:paid-by="editSplitData.paidBy"
                                v-model:split-method="editSplitData.splitMethod"
                                v-model:participants="editSplitData.participants"
                            />
                        </div>
                    </div>
                    </div>
                </div>

                <DialogFooter class="flex-col sm:flex-row gap-2 border-t border-border bg-background px-6 py-4">
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
            </DialogScrollContent>
        </Dialog>
    </div>
</template>
