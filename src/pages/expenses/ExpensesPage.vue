<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useStorage, refDebounced } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Calendar } from '@/shared/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Slider } from '@/shared/components/ui/slider'
import { type DateValue } from '@internationalized/date'
import TopBar from '@/shared/components/TopBar.vue'
import ExpenseGroup from '@/features/expense/components/ExpenseGroup.vue'
import { useExpenseStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import { usePullToRefresh } from '@/shared/composables/usePullToRefresh'
import { useCategories, CategoryUtils } from '@/features/expense/composables/useCategories'
import type { Expense } from '@/features/expense/stores/expense'
import type { DisplayExpense } from '@/entities/expense/types'
import { toast } from 'vue-sonner'
import { User, Users, Calendar as CalendarIcon, Search, SlidersHorizontal, Plus } from 'lucide-vue-next'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { categories } = useCategories()
const expenseStore = useExpenseStore()
const groupStore = useGroupStore()

const {
    personalExpenses,
    groupExpenses
} = storeToRefs(expenseStore)

const isInGroup = computed(() => groupStore.isInAnyGroup)

// 持久化 Tab 選擇（localStorage），URL query 可覆蓋
const savedTab = useStorage<string>('expenses-active-tab', 'personal')
const urlTab = route.query.tab as string | undefined
const resolvedTab = urlTab || savedTab.value || 'personal'
const activeTab = ref<string>(resolvedTab === 'group' && !groupStore.isInAnyGroup ? 'personal' : resolvedTab)

const isPreloading = computed(() => expenseStore.preloadStatus === 'loading' || expenseStore.preloadStatus === 'idle')

// 搜尋查詢（300ms debounce 減少每次按鍵觸發的計算）
const searchQuery = ref('')
const debouncedSearch = refDebounced(searchQuery, 300)

// 篩選 Dialog 狀態
const isFilterDialogOpen = ref(false)

// 日期選擇狀態
const startDateValue = ref<DateValue>()
const endDateValue = ref<DateValue>()

// 篩選條件
const filters = ref({
    startDate: null as string | null,
    endDate: null as string | null,
    categories: [] as string[],
    minAmount: '',
    maxAmount: ''
})

// 滑動條數值
const sliderValues = ref([0, 3000])
const maxPossibleAmount = 10000

// 是否有啟用的篩選條件
const hasActiveFilters = computed(() => {
    return filters.value.categories.length > 0
        || filters.value.startDate !== null
        || filters.value.endDate !== null
        || filters.value.minAmount !== ''
        || filters.value.maxAmount !== ''
})

// 防止 slider ↔ input 循環觸發的 flag
const syncingFromSlider = ref(false)

// 監聽滑動條變化並更新輸入框
watch(sliderValues, (newValues) => {
    syncingFromSlider.value = true
    filters.value.minAmount = (newValues[0] ?? 0).toString()
    filters.value.maxAmount = (newValues[1] ?? maxPossibleAmount).toString()
    nextTick(() => { syncingFromSlider.value = false })
})

// 監聽輸入框變化並更新滑動條（slider 驅動時跳過）
watch(() => [filters.value.minAmount, filters.value.maxAmount], ([min, max]) => {
    if (syncingFromSlider.value) return
    sliderValues.value = [
        min ? parseFloat(min) : 0,
        max ? parseFloat(max) : maxPossibleAmount
    ]
})

// 監聽 route query 變化
watch(() => route.query.tab, (newTab) => {
    if (newTab && (newTab === 'personal' || newTab === 'group')) {
        activeTab.value = newTab
    }
})

// 監聽 tab 變化，更新 URL 和持久化儲存
watch(activeTab, (newTab) => {
    savedTab.value = newTab
    router.replace({ query: { ...route.query, tab: newTab } })
})

// 懶計算：只取當前 tab 的支出來源
const activeExpenses = computed(() =>
    activeTab.value === 'group'
        ? groupExpenses.value
        : personalExpenses.value
)

// 快取 DisplayExpense 轉換（避免每次 computed 重算時重建所有物件）
const displayExpenseMap = computed(() => {
    const map = new Map<string, DisplayExpense>()
    for (const e of activeExpenses.value) {
        map.set(e.id, {
            id: e.id,
            title: e.title,
            amount: `NT ${Math.round(e.amount)}`,
            numericAmount: e.amount,
            category: e.category,
            icon: CategoryUtils.getIconKey(e.category),
            user: e.user,
            groupId: e.group_id,
            splitMethod: e.split_method,
            isSettled: e.is_settled
        })
    }
    return map
})

// 篩選邏輯（single-pass，使用 debounced 搜尋值）
const applyFilters = (expenses: Expense[]) => {
    const query = debouncedSearch.value?.toLowerCase()
    const startDate = filters.value.startDate?.replace(/\//g, '-')
    const endDate = filters.value.endDate?.replace(/\//g, '-')
    const cats = filters.value.categories
    const min = filters.value.minAmount ? parseFloat(filters.value.minAmount) : null
    const max = filters.value.maxAmount ? parseFloat(filters.value.maxAmount) : null

    return expenses.filter(e =>
        (!query || e.title.toLowerCase().includes(query))
        && (!startDate || e.date >= startDate)
        && (!endDate || e.date <= endDate)
        && (cats.length === 0 || cats.includes(e.category))
        && (min === null || e.amount >= min)
        && (max === null || e.amount <= max)
    )
}

// 篩選後的支出（只計算活躍 tab）
const filteredExpenses = computed(() => applyFilters(activeExpenses.value))

// 按日期分組工具函式
const groupByDate = (expenses: Expense[]): { date: string; expenses: DisplayExpense[] }[] => {
    const groups: Record<string, DisplayExpense[]> = {}

    for (const expense of expenses) {
        const displayDate = expense.date.replace(/-/g, '/')
        if (!groups[displayDate]) {
            groups[displayDate] = []
        }
        const display = displayExpenseMap.value.get(expense.id)
        if (display) {
            groups[displayDate].push(display)
        }
    }

    return Object.entries(groups)
        .map(([date, exps]) => ({ date, expenses: exps }))
        .sort((a, b) => b.date.localeCompare(a.date))
}

// 活躍 tab 的分組結果
const expenseGroups = computed(() => groupByDate(filteredExpenses.value))

// 日期格式化
const formatDate = (dateStr: string) => {
    return dateStr
}

// 日期選擇處理
const handleStartDateSelect = (date: DateValue | undefined) => {
    if (date) {
        filters.value.startDate = `${date.year}/${String(date.month).padStart(2, '0')}/${String(date.day).padStart(2, '0')}`
    }
}

const handleEndDateSelect = (date: DateValue | undefined) => {
    if (date) {
        filters.value.endDate = `${date.year}/${String(date.month).padStart(2, '0')}/${String(date.day).padStart(2, '0')}`
    }
}

// 切換類別選擇
const toggleCategory = (categoryId: string) => {
    const index = filters.value.categories.indexOf(categoryId)
    if (index > -1) {
        filters.value = {
            ...filters.value,
            categories: filters.value.categories.filter((_, i) => i !== index)
        }
    } else {
        filters.value = {
            ...filters.value,
            categories: [...filters.value.categories, categoryId]
        }
    }
}

// 重設篩選
const resetFilters = () => {
    filters.value = {
        startDate: null,
        endDate: null,
        categories: [],
        minAmount: '',
        maxAmount: ''
    }
    startDateValue.value = undefined
    endDateValue.value = undefined
    sliderValues.value = [0, maxPossibleAmount]
    searchQuery.value = ''
}

// 套用篩選
const handleApplyFilters = () => {
    isFilterDialogOpen.value = false
}

// 處理費用項目點擊 → 導航到詳情頁
const handleExpenseClick = (expense: DisplayExpense) => {
    if (expense.id) {
        router.push({ name: 'ExpenseDetail', params: { id: expense.id } })
    }
}

// 下拉刷新
usePullToRefresh({
    onRefresh: async () => {
        try {
            expenseStore.preloadStatus = 'loading'
            await expenseStore.fetchExpenses()
            expenseStore.preloadStatus = 'done'
            toast.success(t('common.refreshed'))
        } catch (err) {
            console.error('刷新失敗:', err)
            expenseStore.preloadStatus = 'error'
            toast.error(t('common.refreshFailed'))
        }
    }
})
</script>

<template>
    <div class="min-h-screen bg-background glass-page-bg">
        <TopBar :title="t('nav.expenses')" />

        <!-- 搜尋區域 -->
        <div class="sticky top-[64px] z-40 px-4 py-3">
            <div class="flex gap-2 glass rounded-full p-1.5">
                <!-- 搜尋輸入框 -->
                <div class="flex-1 relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        v-model="searchQuery"
                        type="text"
                        :placeholder="t('search.searchTransaction')"
                        class="pl-10 pr-4 h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                </div>

                <!-- 篩選按鈕 -->
                <div class="relative">
                    <Button
                        variant="outline"
                        size="icon"
                        class="h-11 w-11 rounded-full press-feedback hover-transition"
                        @click="isFilterDialogOpen = true"
                    >
                        <SlidersHorizontal class="h-5 w-5" />
                    </Button>
                    <span
                        v-if="hasActiveFilters"
                        class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-red-500 rounded-full"
                    />
                </div>
            </div>
        </div>

        <main class="px-4 pb-28">
            <!-- Tab 切換 -->
            <Tabs v-model="activeTab" class="mt-4">
                <TabsList class="grid w-full grid-cols-2 rounded-full glass-light p-[2px]">
                    <TabsTrigger
                        value="personal"
                        class="flex items-center gap-2 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-200 press-feedback"
                    >
                        <User class="h-4 w-4" />
                        {{ t('expense.personal') }}
                    </TabsTrigger>
                    <TabsTrigger
                        value="group"
                        :disabled="!isInGroup"
                        class="flex items-center gap-2 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-200 press-feedback"
                    >
                        <Users class="h-4 w-4" />
                        {{ t('expense.group') }}
                    </TabsTrigger>
                </TabsList>

                <!-- 個人支出列表 -->
                <TabsContent value="personal" class="mt-4">
                    <!-- Skeleton 載入中 -->
                    <div v-if="isPreloading" class="space-y-4">
                        <div v-for="i in 3" :key="i" class="glass rounded-2xl p-4 space-y-3">
                            <div class="h-4 bg-muted rounded w-24 animate-pulse" />
                            <div v-for="j in 2" :key="j" class="flex items-center gap-3">
                                <div class="h-10 w-10 bg-muted rounded-lg animate-pulse" />
                                <div class="flex-1 space-y-1.5">
                                    <div class="h-3.5 bg-muted rounded w-32 animate-pulse" />
                                    <div class="h-3 bg-muted rounded w-20 animate-pulse" />
                                </div>
                                <div class="h-4 bg-muted rounded w-16 animate-pulse" />
                            </div>
                        </div>
                    </div>

                    <!-- 支出列表 -->
                    <div v-else-if="expenseGroups.length > 0" class="space-y-4">
                        <ExpenseGroup
                            v-for="group in expenseGroups"
                            :key="group.date"
                            :date="group.date"
                            :expenses="group.expenses"
                            :show-user="false"
                            @expense-click="handleExpenseClick"
                        />
                    </div>

                    <!-- 空狀態 -->
                    <div v-else-if="!expenseStore.loading" class="text-center py-12">
                        <User class="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p class="text-muted-foreground mb-4">
                            {{ searchQuery || filters.categories.length > 0 ? t('search.noResultsFound') : t('expenses.noPersonalExpenses') }}
                        </p>
                        <Button variant="outline" class="rounded-full gap-2 press-feedback">
                            <Plus class="h-4 w-4" />
                            {{ t('expense.addExpense') }}
                        </Button>
                    </div>
                </TabsContent>

                <!-- 群組支出列表 -->
                <TabsContent value="group" class="mt-4">
                    <!-- Skeleton 載入中 -->
                    <div v-if="isPreloading" class="space-y-4">
                        <div v-for="i in 3" :key="i" class="glass rounded-2xl p-4 space-y-3">
                            <div class="h-4 bg-muted rounded w-24 animate-pulse" />
                            <div v-for="j in 2" :key="j" class="flex items-center gap-3">
                                <div class="h-10 w-10 bg-muted rounded-lg animate-pulse" />
                                <div class="flex-1 space-y-1.5">
                                    <div class="h-3.5 bg-muted rounded w-32 animate-pulse" />
                                    <div class="h-3 bg-muted rounded w-20 animate-pulse" />
                                </div>
                                <div class="h-4 bg-muted rounded w-16 animate-pulse" />
                            </div>
                        </div>
                    </div>

                    <!-- 支出列表 -->
                    <div v-else-if="expenseGroups.length > 0" class="space-y-4">
                        <ExpenseGroup
                            v-for="group in expenseGroups"
                            :key="group.date"
                            :date="group.date"
                            :expenses="group.expenses"
                            :show-user="true"
                            @expense-click="handleExpenseClick"
                        />
                    </div>

                    <!-- 空狀態 -->
                    <div v-else-if="!expenseStore.loading" class="text-center py-12">
                        <Users class="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p class="text-muted-foreground mb-4">
                            {{ searchQuery || filters.categories.length > 0 ? t('search.noResultsFound') : t('expenses.noGroupExpenses') }}
                        </p>
                        <Button variant="outline" class="rounded-full gap-2 press-feedback">
                            <Plus class="h-4 w-4" />
                            {{ t('expense.addExpense') }}
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>
        </main>

        <!-- 篩選 Dialog -->
        <Dialog v-model:open="isFilterDialogOpen">
            <DialogContent class="sm:max-w-md glass-elevated">
                <DialogHeader>
                    <DialogTitle>{{ t('search.filterConditions') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('search.setFilterDesc') }}
                    </DialogDescription>
                </DialogHeader>

                <div class="grid gap-4 py-4">
                    <!-- 日期範圍 -->
                    <div class="space-y-2">
                        <Label>{{ t('search.dateRange') }}</Label>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            class="w-full justify-start text-left font-normal"
                                        >
                                            <CalendarIcon class="mr-2 h-4 w-4" />
                                            {{ filters.startDate ? formatDate(filters.startDate) : t('search.startDate') }}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent class="w-auto p-0" align="start">
                                        <Calendar v-model="startDateValue" @update:model-value="handleStartDateSelect" />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            class="w-full justify-start text-left font-normal"
                                        >
                                            <CalendarIcon class="mr-2 h-4 w-4" />
                                            {{ filters.endDate ? formatDate(filters.endDate) : t('search.endDate') }}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent class="w-auto p-0" align="start">
                                        <Calendar v-model="endDateValue" @update:model-value="handleEndDateSelect" />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>

                    <!-- 類別 -->
                    <div class="space-y-2">
                        <Label>{{ t('search.category') }}</Label>
                        <div class="grid grid-cols-3 gap-3">
                            <button
                                v-for="category in categories"
                                :key="category.id"
                                type="button"
                                @click="toggleCategory(category.id)"
                                :class="[
                                    'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all duration-200 press-feedback',
                                    filters.categories.includes(category.id)
                                        ? 'border-brand-primary bg-brand-accent'
                                        : 'border-border bg-background hover:border-brand-primary hover:bg-brand-accent'
                                ]"
                            >
                                <div :class="[
                                    'flex h-10 w-10 items-center justify-center rounded-lg',
                                    filters.categories.includes(category.id) ? 'bg-brand-primary' : 'bg-brand-accent'
                                ]">
                                    <component
                                        :is="category.icon"
                                        :class="[
                                            'h-5 w-5',
                                            filters.categories.includes(category.id) ? 'text-brand-primary-foreground' : 'text-brand-primary'
                                        ]"
                                    />
                                </div>
                                <span class="text-xs font-medium text-foreground">
                                    {{ category.name }}
                                </span>
                            </button>
                        </div>
                    </div>

                    <!-- 金額範圍 -->
                    <div class="space-y-3">
                        <Label>{{ t('search.amountRange') }}</Label>
                        <div class="grid grid-cols-2 gap-2">
                            <Input
                                v-model="filters.minAmount"
                                type="number"
                                :placeholder="t('search.minAmountPlaceholder')"
                                min="0"
                            />
                            <Input
                                v-model="filters.maxAmount"
                                type="number"
                                :placeholder="t('search.maxAmountPlaceholder')"
                                min="0"
                            />
                        </div>
                        <!-- 滑動條 -->
                        <div class="px-2 pt-2">
                            <Slider
                                v-model="sliderValues"
                                :max="maxPossibleAmount"
                                :step="10"
                                class="mb-2"
                            />
                            <div class="flex justify-between text-xs text-muted-foreground">
                                <span>NT$ {{ sliderValues[0] }}</span>
                                <span>NT$ {{ sliderValues[1] }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" class="press-feedback" @click="resetFilters">
                        {{ t('search.reset') }}
                    </Button>
                    <Button @click="handleApplyFilters" class="bg-brand-primary hover:bg-brand-primary/90 press-feedback">
                        {{ t('search.applyFilter') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    </div>
</template>
