<template>
    <div class="min-h-screen bg-background">
        <!-- 頂部導航欄 -->
        <TopBar :title="t('search.title')" />

        <!-- 搜尋區域 -->
        <div class="sticky top-[64px] z-40 bg-background px-4 py-4 shadow-sm">
            <div class="flex gap-2">
                <!-- 搜尋輸入框 -->
                <div class="flex-1 relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        v-model="searchQuery"
                        type="text"
                        :placeholder="t('search.searchTransaction')"
                        class="pl-10 pr-4 h-12"
                        @input="handleSearch"
                    />
                </div>
                
                <!-- 篩選按鈕 -->
                <Button
                    variant="outline"
                    size="icon"
                    class="h-12 w-12"
                    @click="isFilterDialogOpen = true"
                >
                    <SlidersHorizontal class="h-5 w-5" />
                </Button>
            </div>
        </div>

        <!-- 主要內容區域 -->
        <main class="px-4 pb-24">
            <!-- 搜尋結果 -->
            <div v-if="filteredExpenses.length > 0" class="mt-6 space-y-4 animate-fade-in-up">
                <ExpenseGroup
                    v-for="group in groupedExpenses"
                    :key="group.date"
                    :date="group.date"
                    :expenses="group.expenses"
                    @expense-click="handleExpenseClick"
                />
            </div>

            <!-- 無結果顯示 -->
            <div v-else class="flex flex-col items-center justify-center mt-20">
                <Search class="h-12 w-12 text-muted-foreground mb-4" />
                <p class="text-muted-foreground text-center">
                    {{ searchQuery ? t('search.noResultsFound') : t('search.enterKeywordToSearch') }}
                </p>
            </div>
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
                        <div class="grid grid-cols-3 gap-2">
                            <div
                                v-for="category in categories"
                                :key="category.id"
                                @click="toggleCategory(category.id)"
                                :class="[
                                    'flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all',
                                    filters.categories.includes(category.id)
                                        ? 'border-brand-primary bg-brand-accent'
                                        : 'border-border hover:border-brand-primary'
                                ]"
                            >
                                <component :is="category.icon" class="h-6 w-6 mb-1" :class="[
                                    filters.categories.includes(category.id)
                                        ? 'text-brand-primary'
                                        : 'text-muted-foreground'
                                ]" />
                                <span class="text-xs" :class="[
                                    filters.categories.includes(category.id)
                                        ? 'text-brand-primary font-medium'
                                        : 'text-muted-foreground'
                                ]">{{ category.label }}</span>
                            </div>
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
                    <Button @click="applyFilters">
                        {{ t('search.applyFilter') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- 編輯費用 Dialog -->
        <Dialog v-model:open="isEditDialogOpen">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('home.editExpense') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('home.editExpenseDesc') }}
                    </DialogDescription>
                </DialogHeader>

                <div class="grid gap-4 py-4">
                    <!-- 標題 -->
                    <div class="space-y-2">
                        <Label for="edit-title">{{ t('home.title_') }}</Label>
                        <Input
                            id="edit-title"
                            v-model="editForm.title"
                            :placeholder="t('home.enterExpenseTitle')"
                        />
                    </div>

                    <!-- 金額 -->
                    <div class="space-y-2">
                        <Label for="edit-amount">{{ t('home.amount') }}</Label>
                        <Input
                            id="edit-amount"
                            v-model="editForm.amount"
                            type="number"
                            min="0"
                            step="1"
                            :placeholder="t('home.enterAmount')"
                        />
                    </div>

                    <!-- 類別選擇 -->
                    <div class="space-y-2">
                        <Label>{{ t('search.category') }}</Label>
                        <div class="grid grid-cols-3 gap-2">
                            <div
                                v-for="category in categories"
                                :key="category.id"
                                @click="editForm.category = category.id as 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'"
                                :class="[
                                    'flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all',
                                    editForm.category === category.id
                                        ? 'border-brand-primary bg-brand-accent'
                                        : 'border-border hover:border-brand-primary'
                                ]"
                            >
                                <component :is="category.icon" class="h-6 w-6 mb-1" :class="[
                                    editForm.category === category.id
                                        ? 'text-brand-primary'
                                        : 'text-muted-foreground'
                                ]" />
                                <span class="text-xs" :class="[
                                    editForm.category === category.id
                                        ? 'text-brand-primary font-medium'
                                        : 'text-muted-foreground'
                                ]">{{ category.label }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 日期 -->
                    <div class="space-y-2">
                        <Label>{{ t('home.date') }}</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    class="w-full justify-start text-left font-normal"
                                >
                                    <CalendarIcon class="mr-2 h-4 w-4" />
                                    {{ formatEditDate(editForm.date) }}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent class="w-auto p-0" align="start">
                                <Calendar v-model="editDateValue" @update:model-value="handleEditDateSelect" />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" @click="cancelEditExpense">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button @click="saveEditExpense">
                        {{ t('common.save') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { 
    parseDate,
    type DateValue 
} from '@internationalized/date'
import TopBar from '@/components/TopBar.vue'
import ExpenseGroup from '@/components/ExpenseGroup.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { useExpenseStore } from '@/stores'
import { 
    Search, 
    SlidersHorizontal, 
    Calendar as CalendarIcon,
    Utensils,
    ShoppingBag,
    Bus,
    Cat,
    Home,
    Package
} from 'lucide-vue-next'

const { t } = useI18n()
const expenseStore = useExpenseStore()
const { expenses } = expenseStore

// 搜尋查詢
const searchQuery = ref('')

// 篩選 Dialog 狀態
const isFilterDialogOpen = ref(false)

// 日期選擇狀態
const startDateValue = ref<DateValue>()
const endDateValue = ref<DateValue>()

// 編輯日期選擇器的值
const editDateValue = ref<DateValue>()

// 類別選項
const categories = computed(() => [
    { id: 'food', label: t('expense.categories.food'), icon: Utensils },
    { id: 'pet', label: t('expense.categories.pet'), icon: Cat },
    { id: 'shopping', label: t('expense.categories.shopping'), icon: ShoppingBag },
    { id: 'transport', label: t('expense.categories.transport'), icon: Bus },
    { id: 'home', label: t('expense.categories.home'), icon: Home },
    { id: 'other', label: t('expense.categories.other'), icon: Package }
])

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

// 計算最大金額
const maxPossibleAmount = computed(() => {
    return 10000 // 固定設定為 10000
})

// 監聽滑動條變化並更新輸入框
watch(sliderValues, (newValues) => {
    filters.value.minAmount = newValues[0].toString()
    filters.value.maxAmount = newValues[1].toString()
})

// 監聽輸入框變化並更新滑動條
watch(() => [filters.value.minAmount, filters.value.maxAmount], ([min, max]) => {
    const minNum = min ? parseFloat(min) : 0
    const maxNum = max ? parseFloat(max) : maxPossibleAmount.value
    sliderValues.value = [minNum, maxNum]
})

// 轉換 store 資料格式為組件需要的格式
const convertStoreExpense = (storeExpense: any) => {
    return {
        id: storeExpense.id,
        title: storeExpense.title,
        amount: `NT ${Math.round(storeExpense.amount)}`, // store 中已經是數字類型
        category: storeExpense.category,
        icon: storeExpense.icon
    }
}

// 篩選後的費用
const filteredExpenses = computed(() => {
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
        // 轉換顯示日期格式 "2025/08/03" 到 store 格式 "2025-08-03"
        const startDate = filters.value.startDate.replace(/\//g, '-')
        result = result.filter(expense => expense.date >= startDate)
    }
    if (filters.value.endDate) {
        // 轉換顯示日期格式 "2025/08/03" 到 store 格式 "2025-08-03"
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
})

// 按日期分組的費用
const groupedExpenses = computed(() => {
    const groups: Record<string, any[]> = {}
    
    filteredExpenses.value.forEach(expense => {
        // 轉換日期格式從 "2025-08-03" 到 "2025/08/03"
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

// 搜尋處理
const handleSearch = () => {
    // 搜尋邏輯已經由 computed 處理
}

// 日期格式化
const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
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
    sliderValues.value = [0, maxPossibleAmount.value]
}

// 套用篩選
const applyFilters = () => {
    isFilterDialogOpen.value = false
}

// 編輯 Dialog 狀態
const isEditDialogOpen = ref(false)
const editingExpense = ref<any>(null)

// 編輯表單數據
const editForm = ref({
    title: '',
    amount: 0,
    category: 'food' as 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other',
    date: ''
})

// 處理費用項目點擊
const handleExpenseClick = (expense: any) => {
    // 找到原始資料
    const originalExpense = expenses.find(e => e.id === expense.id)
    if (originalExpense) {
        editForm.value = {
            title: originalExpense.title,
            amount: originalExpense.amount, // 已經是數字類型
            category: originalExpense.category,
            date: originalExpense.date.replace(/-/g, '/') // 轉換為顯示格式
        }
        // 設置日期選擇器的值
        const dateParts = originalExpense.date.split('-')
        editDateValue.value = parseDate(`${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`)
        editingExpense.value = originalExpense
        isEditDialogOpen.value = true
    }
}

// 處理編輯日期選擇
const handleEditDateSelect = (date: DateValue | undefined) => {
    if (date) {
        editForm.value.date = `${date.year}/${String(date.month).padStart(2, '0')}/${String(date.day).padStart(2, '0')}`
    }
}

// 格式化編輯日期顯示
const formatEditDate = (dateStr: string) => {
    if (!dateStr) return t('home.selectDate')
    return dateStr
}

// 儲存編輯
const saveEditExpense = async () => {
    if (editingExpense.value) {
        try {
            // 轉換日期格式從 "2025/08/03" 到 "2025-08-03"
            const storeDate = editForm.value.date.replace(/\//g, '-')
            
            await expenseStore.updateExpense(editingExpense.value.id, {
                title: editForm.value.title,
                amount: Math.round(editForm.value.amount), // 數字類型
                category: editForm.value.category,
                date: storeDate
            })
            
            isEditDialogOpen.value = false
            editingExpense.value = null
        } catch (error) {
            console.error('更新費用失敗:', error)
        }
    }
}

// 取消編輯
const cancelEditExpense = () => {
    isEditDialogOpen.value = false
    editingExpense.value = null
}
</script>

<style scoped>
/* 動畫定義 */
@keyframes fade-in-up {
    from {
        transform: translateY(30px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

/* 動畫類別 */
.animate-fade-in-up {
    animation: fade-in-up 0.6s ease-out forwards;
}
</style>