<template>
    <div class="animate-fade-in-up">
        <!-- 統計卡片區域 -->
        <div class="grid gap-4 sm:grid-cols-2 mb-8">
            <!-- 月總消費卡片 -->
            <Card class="relative overflow-hidden border-0 shadow-lg animate-slide-in-left hover:shadow-xl transition-all duration-300">
                <div class="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary/80" />
                <CardContent class="relative p-4 sm:p-6">
                    <p class="text-sm font-medium text-white/80">{{ t('stats.monthlyTotal') }}</p>
                    <p class="mt-2 text-2xl sm:text-3xl font-bold text-white">NT$ {{ monthlyTotal.toLocaleString() }}</p>
                </CardContent>
            </Card>

            <!-- 今日消費/平均每日卡片 -->
            <Card class="relative overflow-hidden border-0 shadow-lg animate-slide-in-left hover:shadow-xl transition-all duration-300">
                <div class="absolute inset-0 bg-gradient-to-br from-brand-primary/40 to-brand-primary/60" />
                <CardContent class="relative p-4 sm:p-6">
                    <p class="text-sm font-medium text-white/80">
                        {{ isCurrentMonth ? t('stats.todayExpense') : t('stats.dailyAverage') }}
                    </p>
                    <p class="mt-2 text-2xl sm:text-3xl font-bold text-white">
                        NT$ {{ isCurrentMonth ? todayTotal.toLocaleString() : Math.round(monthlyTotal / (currentMonthExpenses.length || 1)).toLocaleString() }}
                    </p>
                </CardContent>
            </Card>
        </div>

        <!-- 日曆區域 -->
        <div class="animate-fade-in-up">
            <h2 class="mb-4 text-lg font-semibold text-foreground">{{ t('stats.calendarView') }}</h2>
            
            <!-- 自定義日曆組件 -->
            <CalendarRoot
                v-slot="{ date, grid, weekDays }"
                :placeholder="selectedDate as any"
                @update:placeholder="(value: any) => selectedDate = value"
                class="rounded-md border-0 shadow-lg bg-card p-4"
            >
            <CalendarHeader>
                <CalendarHeading class="flex w-full items-center justify-between gap-2">
                    <!-- 月份選擇器 -->
                    <Select
                        :model-value="selectedDate.month.toString()"
                        @update:model-value="(v) => {
                            if (!v || !selectedDate) return;
                            if (Number(v) === selectedDate?.month) return;
                            selectedDate = selectedDate.set({ month: Number(v) })
                        }"
                    >
                        <SelectTrigger :aria-label="t('stats.selectMonth')" class="w-[60%]">
                            <SelectValue>{{ monthNames[selectedDate.month - 1] }}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem
                                v-for="(month, index) in monthNames"
                                :key="index + 1"
                                :value="(index + 1).toString()"
                            >
                                {{ month }}
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <!-- 年份選擇器 -->
                    <Select
                        :model-value="selectedDate.year.toString()"
                        @update:model-value="(v) => {
                            if (!v || !selectedDate) return;
                            if (Number(v) === selectedDate?.year) return;
                            selectedDate = selectedDate.set({ year: Number(v) })
                        }"
                    >
                        <SelectTrigger :aria-label="t('stats.selectYear')" class="w-[40%]">
                            <SelectValue>{{ selectedDate.year }} {{ t('stats.year') }}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem
                                v-for="year in availableYears"
                                :key="year"
                                :value="year.toString()"
                            >
                                {{ year }} {{ t('stats.year') }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </CalendarHeading>
            </CalendarHeader>

            <div class="flex flex-col space-y-4 pt-4">
                <CalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full">
                    <CalendarGridHead>
                        <CalendarGridRow class="flex">
                            <CalendarHeadCell 
                                v-for="day in weekDays" 
                                :key="day"
                                class="flex-1 text-center text-xs font-medium text-muted-foreground py-2"
                            >
                                {{ day }}
                            </CalendarHeadCell>
                        </CalendarGridRow>
                    </CalendarGridHead>
                    <CalendarGridBody class="grid gap-1">
                        <CalendarGridRow
                            v-for="(weekDates, index) in month.rows"
                            :key="`weekDate-${index}`"
                            class="flex gap-1"
                        >
                            <CalendarCell
                                v-for="weekDate in weekDates"
                                :key="weekDate.toString()"
                                :date="weekDate"
                                class="flex-1"
                            >
                                <CalendarCellTrigger
                                    :day="weekDate"
                                    :month="month.value"
                                    class="relative w-full h-20 p-2 flex flex-col items-center justify-start border border-border/20 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                                    :class="{ 'cursor-pointer': getDayTotal(weekDate) }"
                                    @click="getDayTotal(weekDate) && handleDayClick(weekDate)"
                                >
                                    <span class="text-sm font-medium mb-auto">{{ weekDate.day }}</span>
                                    <span
                                        v-if="getDayTotal(weekDate)"
                                        class="text-[8px] text-destructive font-bold leading-none px-1.5 py-0.5 bg-destructive/10 rounded-sm mt-auto"
                                    >
                                        ${{ getDayTotal(weekDate) }}
                                    </span>
                                </CalendarCellTrigger>
                            </CalendarCell>
                        </CalendarGridRow>
                    </CalendarGridBody>
                </CalendarGrid>
            </div>
        </CalendarRoot>
        </div>

        <!-- 消費明細 Dialog -->
        <Dialog v-model:open="isExpenseDialogOpen">
            <DialogContent class="max-w-md max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{{ formatDate(selectedDayDate) }}</DialogTitle>
                    <DialogDescription>
                        共 {{ selectedDayExpenses.length }} 筆消費，總計 NT$ {{ selectedDayExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString() }}
                    </DialogDescription>
                </DialogHeader>

                <div class="space-y-2 mt-4">
                    <ExpenseItem
                        v-for="expense in displayExpenses"
                        :key="expense.id"
                        :id="expense.id"
                        :title="expense.title"
                        :amount="expense.amount"
                        :category="expense.category"
                        :icon="expense.icon"
                        :user="expense.user"
                        :show-user="isInCouple"
                    />
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardContent } from '@/components/ui/card'
import {
    CalendarRoot,
    CalendarCell,
    CalendarCellTrigger,
    CalendarGrid,
    CalendarGridBody,
    CalendarGridHead,
    CalendarGridRow,
    CalendarHeadCell,
    CalendarHeader,
    CalendarHeading
} from 'reka-ui'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import ExpenseItem from '@/components/ExpenseItem.vue'
import { useExpenseStore, useCoupleStore } from '@/stores'
import { getLocalTimeZone, today } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import type { Expense } from '@/stores/expense'
import { CategoryUtils } from '@/composables/useCategories'

// Props
const props = withDefaults(defineProps<{
    scope: 'personal' | 'family'
}>(), {
    scope: 'personal'
})

const { t } = useI18n()
const expenseStore = useExpenseStore()
const coupleStore = useCoupleStore()
const { categoryLabels } = expenseStore
const { isInCouple } = coupleStore

// 根據 scope 選擇對應的支出資料
const scopedExpenses = computed(() => {
    return props.scope === 'personal'
        ? expenseStore.personalExpenses
        : expenseStore.familyExpenses
})

// 當前日期
const todayDate = new Date()
const todayDateStr = todayDate.toISOString().split('T')[0]

// 選中的日期（用於日曆組件）
const selectedDate = ref<DateValue>(today(getLocalTimeZone()))

const isExpenseDialogOpen = ref(false)
const selectedDayExpenses = ref<Expense[]>([])
const selectedDayDate = ref('')

const convertStoreExpense = (storeExpense: Expense) => {
    return {
        id: storeExpense.id,
        title: storeExpense.title,
        amount: `NT ${Math.round(storeExpense.amount)}`,
        category: storeExpense.category,
        icon: CategoryUtils.getIconKey(storeExpense.category),
        user: storeExpense.user
    }
}

// 月份名稱
const monthNames = computed(() => [
    t('stats.months.january'), t('stats.months.february'), t('stats.months.march'),
    t('stats.months.april'), t('stats.months.may'), t('stats.months.june'),
    t('stats.months.july'), t('stats.months.august'), t('stats.months.september'),
    t('stats.months.october'), t('stats.months.november'), t('stats.months.december')
])

// 可用的年份列表（根據數據動態生成）
const availableYears = computed(() => {
    const years = new Set<number>()
    scopedExpenses.value.forEach(expense => {
        years.add(parseInt(expense.date.substring(0, 4)))
    })
    // 確保當前年份在列表中
    years.add(todayDate.getFullYear())
    return Array.from(years).sort((a, b) => b - a)
})

// 是否為當前月份
const isCurrentMonth = computed(() => {
    return selectedDate.value.year === todayDate.getFullYear() &&
        selectedDate.value.month === (todayDate.getMonth() + 1)
})

// 當前選中月份的費用
const currentMonthExpenses = computed(() => {
    const monthStr = `${selectedDate.value.year}-${selectedDate.value.month.toString().padStart(2, '0')}`
    return scopedExpenses.value.filter(expense => expense.date.startsWith(monthStr))
})

// 月度總消費
const monthlyTotal = computed(() => {
    return currentMonthExpenses.value.reduce((sum, expense) => {
        return sum + expense.amount
    }, 0)
})


// 今日總消費
const todayTotal = computed(() => {
    const todayExpenses = scopedExpenses.value.filter(expense => expense.date === todayDateStr)
    return todayExpenses.reduce((sum, expense) => {
        return sum + expense.amount
    }, 0)
})


// 獲取指定日期的總消費（用於日曆顯示）
const getDayTotal = (day: DateValue) => {
    if (!day) return 0
    const dateStr = `${ day.year }-${ day.month.toString().padStart(2, '0') }-${ day.day.toString().padStart(2, '0') }`
    const dayExpenses = scopedExpenses.value.filter(expense => expense.date === dateStr)

    if (dayExpenses.length === 0) return 0

    const total = dayExpenses.reduce((sum, expense) => {
        return sum + expense.amount
    }, 0)

    return total > 0 ? total.toFixed(0) : 0
}

const handleDayClick = (day: DateValue) => {
    if (!day) return

    const dateStr = `${ day.year }-${ day.month.toString().padStart(2, '0') }-${ day.day.toString().padStart(2, '0') }`
    const dayExpenses = scopedExpenses.value.filter(expense => expense.date === dateStr)

    if (dayExpenses.length === 0) return

    selectedDayExpenses.value = dayExpenses
    selectedDayDate.value = dateStr
    isExpenseDialogOpen.value = true
}

const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-')
    return `${year} 年 ${parseInt(month)} 月 ${parseInt(day)} 日`
}

const displayExpenses = computed(() => {
    return selectedDayExpenses.value.map(convertStoreExpense)
})
</script>

<style scoped>
/* 動畫定義 */
@keyframes slide-in-left {
    from {
        transform: translateX(-50px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slide-in-right {
    from {
        transform: translateX(50px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

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
.animate-slide-in-left {
    animation: slide-in-left 0.5s ease-out forwards;
}

.animate-slide-in-right {
    animation: slide-in-right 0.5s ease-out 0.1s forwards;
    opacity: 0;
}

.animate-fade-in-up {
    animation: fade-in-up 0.6s ease-out 0.3s forwards;
    opacity: 0;
}
</style>
