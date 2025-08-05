<template>
    <Drawer v-model:open="isOpen">
        <DrawerContent class="max-h-[85vh] flex flex-col">
            <DrawerHeader class="text-center pb-4">
                <DrawerTitle class="text-xl font-semibold text-foreground">{{ t('expense.addExpense') }}</DrawerTitle>
                <DrawerDescription class="text-muted-foreground">
                    {{ t('expense.addExpenseDesc') }}
                </DrawerDescription>
            </DrawerHeader>

            <!-- 表單內容 -->
            <div class="px-6 flex-1 overflow-y-auto">
                <form @submit.prevent="handleSubmit" class="space-y-4 pb-4">
                    <!-- 費用標題 -->
                    <div class="space-y-2">
                        <label for="title" class="text-sm font-medium text-foreground">
                            {{ t('expense.title') }}
                        </label>
                        <Input
                            id="title"
                            v-model="formData.title"
                            :placeholder="t('expense.titlePlaceholder')"
                            class="h-12"
                            required
                        />
                    </div>

                    <!-- 金額 -->
                    <div class="space-y-2">
                        <label for="amount" class="text-sm font-medium text-foreground">
                            {{ t('expense.amount') }} (NT$)
                        </label>
                        <Input
                            id="amount"
                            v-model="formData.amount"
                            type="number"
                            placeholder="0"
                            class="h-12"
                            min="0"
                            step="1"
                            required
                        />
                    </div>

                    <!-- 類別選擇 -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-foreground">
                            {{ t('expense.category') }}
                        </label>
                        <div class="grid grid-cols-3 gap-3">
                            <button
                                v-for="category in categories"
                                :key="category.id"
                                type="button"
                                @click="formData.category = category.id"
                                :class="[
                                    'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all duration-200',
                                    formData.category === category.id
                                        ? 'border-brand-primary bg-brand-accent'
                                        : 'border-border bg-background hover:border-brand-primary hover:bg-brand-accent'
                                ]"
                            >
                                <div :class="[
                                    'flex h-10 w-10 items-center justify-center rounded-lg',
                                    formData.category === category.id ? 'bg-brand-primary' : 'bg-brand-accent'
                                ]">
                                    <component 
                                        :is="category.icon" 
                                        :class="[
                                            'h-5 w-5',
                                            formData.category === category.id ? 'text-brand-primary-foreground' : 'text-brand-primary'
                                        ]" 
                                    />
                                </div>
                                <span class="text-xs font-medium text-foreground">
                                    {{ category.name }}
                                </span>
                            </button>
                        </div>
                    </div>

                    <!-- 日期選擇 -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-foreground">
                            {{ t('expense.date') }}
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    :class="[
                                        'w-full h-12 justify-start text-left font-normal',
                                        !formData.date && 'text-muted-foreground'
                                    ]"
                                >
                                    <CalendarIcon class="mr-2 h-4 w-4" />
                                    {{ formData.date ? formatDate(formData.date) : t('home.selectDate') }}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent class="w-auto p-0" align="start">
                                <Calendar 
                                    :model-value="selectedDate as any"
                                    @update:model-value="handleDateSelect"
                                    initial-focus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                </form>
            </div>
            
            <!-- 按鈕區域 - 固定在底部 -->
            <div class="px-6 py-4 border-t border-border bg-background">
                <div class="flex gap-3">
                    <DrawerClose asChild>
                        <Button 
                            variant="outline" 
                            class="flex-1 h-12 text-foreground border-brand-primary hover:bg-brand-accent"
                            type="button"
                        >
                            {{ t('common.cancel') }}
                        </Button>
                    </DrawerClose>
                    <Button 
                        type="submit"
                        :disabled="!isFormValid"
                        class="flex-1 h-12 bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground disabled:opacity-50"
                        @click="handleSubmit"
                    >
                        <Plus class="h-4 w-4 mr-2" />
                        {{ t('expense.addExpense') }}
                    </Button>
                </div>
            </div>
        </DrawerContent>
    </Drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { 
    Drawer, 
    DrawerContent, 
    DrawerHeader, 
    DrawerTitle, 
    DrawerDescription,
    DrawerClose 
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
    ShoppingBag, 
    Utensils, 
    Car, 
    Cat, 
    Home,
    Package,
    Plus,
    CalendarIcon
} from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarDate, getLocalTimeZone, today, parseDate, type DateValue } from '@internationalized/date'

const { t } = useI18n()

interface ExpenseCategory {
    id: string
    name: string
    icon: any
}

interface ExpenseFormData {
    title: string
    amount: string
    category: string
    date: string
}

interface Props {
    open?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    open: false
})

const emit = defineEmits<{
    (e: 'update:open', value: boolean): void
    (e: 'expense-added', expense: any): void
}>()

// 響應式狀態
const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value)
})

// 表單數據
const formData = ref<ExpenseFormData>({
    title: '',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0] // 預設今天
})

// 日期選擇器狀態
const selectedDate = ref<DateValue>(today(getLocalTimeZone()))

// 日期格式化函數
const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

// 處理日期選擇
const handleDateSelect = (date: DateValue | DateValue[] | undefined) => {
    if (date && !Array.isArray(date)) {
        selectedDate.value = date
        // 轉換為 ISO 字符串格式用於表單
        const calendarDate = date as CalendarDate
        formData.value.date = `${calendarDate.year}-${String(calendarDate.month).padStart(2, '0')}-${String(calendarDate.day).padStart(2, '0')}`
    }
}

// 費用類別
const categories = computed(() => [
    { id: 'food', name: t('expense.categories.food'), icon: Utensils },
    { id: 'pet', name: t('expense.categories.pet'), icon: Cat },
    { id: 'shopping', name: t('expense.categories.shopping'), icon: ShoppingBag },
    { id: 'transport', name: t('expense.categories.transport'), icon: Car },
    { id: 'home', name: t('expense.categories.home'), icon: Home },
    { id: 'other', name: t('expense.categories.other'), icon: Package },
])

// 表單驗證
const isFormValid = computed(() => {
    return formData.value.title.trim() !== '' &&
           formData.value.amount !== '' &&
           parseFloat(formData.value.amount) > 0 &&
           formData.value.category !== '' &&
           formData.value.date !== ''
})

// 重置表單
const resetForm = () => {
    const todayDate = today(getLocalTimeZone())
    formData.value = {
        title: '',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0]
    }
    selectedDate.value = todayDate
}

// 當 drawer 開啟時，預設選擇第一個類別
watch(isOpen, (newValue) => {
    if (newValue && formData.value.category === '') {
        formData.value.category = categories.value[0].id
    }
    if (!newValue) {
        // 當 drawer 關閉時重置表單
        setTimeout(resetForm, 300) // 延遲重置避免視覺閃爍
    }
})

// 提交表單
const handleSubmit = () => {
    if (!isFormValid.value) return

    // 建立類別到圖標的映射
    const categoryIconMap: Record<string, string> = {
        food: 'restaurant',
        pet: 'heart',
        shopping: 'shopping',
        transport: 'car',
        home: 'home',
        other: 'more'
    }

    const newExpense = {
        id: Date.now(), // 簡單的 ID 生成
        title: formData.value.title.trim(),
        amount: `-NT ${Math.round(parseFloat(formData.value.amount))}`,
        category: formData.value.category,
        icon: categoryIconMap[formData.value.category] || 'more',
        date: formData.value.date
    }

    emit('expense-added', newExpense)
    isOpen.value = false
}
</script>

<style scoped>
</style>