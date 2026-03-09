<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
import { User, Users, Calendar as CalendarIcon, Search, SlidersHorizontal } from 'lucide-vue-next'

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

// 當前選中的 Tab（從 URL query 讀取或預設為 'personal'）
const activeTab = ref<string>((route.query.tab as string) || 'personal')

// 搜尋查詢
const searchQuery = ref('')

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

// 監聽滑動條變化並更新輸入框
watch(sliderValues, (newValues) => {
    filters.value.minAmount = newValues[0].toString()
    filters.value.maxAmount = newValues[1].toString()
})

// 監聯輸入框變化並更新滑動條
watch(() => [filters.value.minAmount, filters.value.maxAmount], ([min, max]) => {
    const minNum = min ? parseFloat(min) : 0
    const maxNum = max ? parseFloat(max) : maxPossibleAmount
    sliderValues.value = [minNum, maxNum]
})

// 監聽 route query 變化
watch(() => route.query.tab, (newTab) => {
    if (newTab && (newTab === 'personal' || newTab === 'group')) {
        activeTab.value = newTab
    }
})

// 監聽 tab 變化，更新 URL
watch(activeTab, (newTab) => {
    router.replace({ query: { ...route.query, tab: newTab } })
})

// 轉換 store 資料格式為組件需要的格式
const convertStoreExpense = (storeExpense: Expense): DisplayExpense => {
    return {
        id: storeExpense.id,
        title: storeExpense.title,
        amount: `NT ${Math.round(storeExpense.amount)}`,
        category: storeExpense.category,
        icon: CategoryUtils.getIconKey(storeExpense.category),
        user: storeExpense.user,
        groupId: storeExpense.group_id,
        splitMethod: storeExpense.split_method,
        isSettled: storeExpense.is_settled
    }
}

// 篩選邏輯
const applyFilters = (expenses: Expense[]) => {
    let result = [...expenses]

    // 文字搜尋
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        result = result.filter(expense =>
            expense.title.toLowerCase().includes(query)
        )
    }

    // 日期範圍篩選
    if (filters.value.startDate) {
        const startDate = filters.value.startDate.replace(/\//g, '-')
        result = result.filter(expense => expense.date >= startDate)
    }
    if (filters.value.endDate) {
        const endDate = filters.value.endDate.replace(/\//g, '-')
        result = result.filter(expense => expense.date <= endDate)
    }

    // 類別篩選
    if (filters.value.categories.length > 0) {
        result = result.filter(expense =>
            filters.value.categories.includes(expense.category)
        )
    }

    // 金額範圍篩選
    if (filters.value.minAmount) {
        const min = parseFloat(filters.value.minAmount)
        result = result.filter(expense => expense.amount >= min)
    }
    if (filters.value.maxAmount) {
        const max = parseFloat(filters.value.maxAmount)
        result = result.filter(expense => expense.amount <= max)
    }

    return result
}

// 篩選後的個人支出
const filteredPersonalExpenses = computed(() => applyFilters(personalExpenses.value))

// 篩選後的群組支出
const filteredGroupExpenses = computed(() => applyFilters(groupExpenses.value))

// 個人支出分組
const personalExpenseGroups = computed(() => {
    const groups: Record<string, DisplayExpense[]> = {}

    filteredPersonalExpenses.value.forEach(expense => {
        const displayDate = expense.date.replace(/-/g, '/')
        if (!groups[displayDate]) {
            groups[displayDate] = []
        }
        groups[displayDate].push(convertStoreExpense(expense))
    })

    return Object.entries(groups)
        .map(([date, expenses]) => ({ date, expenses }))
        .sort((a, b) => b.date.localeCompare(a.date))
})

// 群組支出分組
const groupExpenseGroups = computed(() => {
    const groups: Record<string, DisplayExpense[]> = {}

    filteredGroupExpenses.value.forEach(expense => {
        const displayDate = expense.date.replace(/-/g, '/')
        if (!groups[displayDate]) {
            groups[displayDate] = []
        }
        groups[displayDate].push(convertStoreExpense(expense))
    })

    return Object.entries(groups)
        .map(([date, expenses]) => ({ date, expenses }))
        .sort((a, b) => b.date.localeCompare(a.date))
})

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
        filters.value.categories.splice(index, 1)
    } else {
        filters.value.categories.push(categoryId)
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
            await expenseStore.fetchExpenses()
            toast.success(t('common.refreshed'))
        } catch (error) {
            console.error('刷新失敗:', error)
            toast.error(t('common.refreshFailed'))
        }
    }
})
</script>

<template>
    <div class="min-h-screen bg-background">
        <TopBar :title="t('nav.expenses')" />

        <!-- 搜尋區域 -->
        <div class="sticky top-[64px] z-40 bg-background px-4 py-3 border-b border-border">
            <div class="flex gap-2">
                <!-- 搜尋輸入框 -->
                <div class="flex-1 relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        v-model="searchQuery"
                        type="text"
                        :placeholder="t('search.searchTransaction')"
                        class="pl-10 pr-4 h-11"
                    />
                </div>

                <!-- 篩選按鈕 -->
                <Button
                    variant="outline"
                    size="icon"
                    class="h-11 w-11"
                    @click="isFilterDialogOpen = true"
                >
                    <SlidersHorizontal class="h-5 w-5" />
                </Button>
            </div>
        </div>

        <main class="px-4 pb-24">
            <!-- Tab 切換 -->
            <Tabs v-model="activeTab" class="mt-4">
                <TabsList class="grid w-full grid-cols-2">
                    <TabsTrigger value="personal" class="flex items-center gap-2">
                        <User class="h-4 w-4" />
                        {{ t('expense.personal') }}
                    </TabsTrigger>
                    <TabsTrigger value="group" :disabled="!isInGroup" class="flex items-center gap-2">
                        <Users class="h-4 w-4" />
                        {{ t('expense.group') }}
                    </TabsTrigger>
                </TabsList>

                <!-- 個人支出列表 -->
                <TabsContent value="personal" class="mt-4">
                    <div v-if="personalExpenseGroups.length > 0" class="space-y-4">
                        <ExpenseGroup
                            v-for="group in personalExpenseGroups"
                            :key="group.date"
                            :date="group.date"
                            :expenses="group.expenses"
                            :show-user="false"
                            @expense-click="handleExpenseClick"
                        />
                    </div>
                    <div v-else class="text-center py-12">
                        <User class="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p class="text-muted-foreground">
                            {{ searchQuery || filters.categories.length > 0 ? t('search.noResultsFound') : t('expenses.noPersonalExpenses') }}
                        </p>
                    </div>
                </TabsContent>

                <!-- 群組支出列表 -->
                <TabsContent value="group" class="mt-4">
                    <div v-if="groupExpenseGroups.length > 0" class="space-y-4">
                        <ExpenseGroup
                            v-for="group in groupExpenseGroups"
                            :key="group.date"
                            :date="group.date"
                            :expenses="group.expenses"
                            :show-user="true"
                            @expense-click="handleExpenseClick"
                        />
                    </div>
                    <div v-else class="text-center py-12">
                        <Users class="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p class="text-muted-foreground">
                            {{ searchQuery || filters.categories.length > 0 ? t('search.noResultsFound') : t('expenses.noGroupExpenses') }}
                        </p>
                    </div>
                </TabsContent>
            </Tabs>
        </main>

        <!-- 篩選 Dialog -->
        <Dialog v-model:open="isFilterDialogOpen">
            <DialogContent class="sm:max-w-md">
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
                                    'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all duration-200',
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
                    <Button variant="outline" @click="resetFilters">
                        {{ t('search.reset') }}
                    </Button>
                    <Button @click="handleApplyFilters" class="bg-brand-primary hover:bg-brand-primary/90">
                        {{ t('search.applyFilter') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    </div>
</template>
