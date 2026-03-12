<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useExpenseStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import CalendarView from '@/features/statistics/components/CalendarView.vue'
import { VisXYContainer, VisArea, VisAxis, VisLine } from '@unovis/vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { ExpenseRow } from '@/shared/lib/database.types'
import { CategoryUtils } from '@/features/expense/composables/useCategories'

const { t } = useI18n()
const expenseStore = useExpenseStore()
const groupStore = useGroupStore()

const isPreloading = computed(() =>
    expenseStore.preloadStatus === 'loading' || expenseStore.preloadStatus === 'idle'
)

const isPersonalMode = computed(() => !groupStore.activeGroupId)
const scope = computed(() => isPersonalMode.value ? 'personal' : 'group')

// Time range controls
const timeRange = ref<'month' | 'year'>('month')
const currentPeriod = ref(new Date())

const currentPeriodLabel = computed(() => {
    const d = currentPeriod.value
    if (timeRange.value === 'month') {
        return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
    }
    return `${d.getFullYear()} 年`
})

const navigatePeriod = (direction: -1 | 1) => {
    const d = new Date(currentPeriod.value)
    if (timeRange.value === 'month') {
        d.setMonth(d.getMonth() + direction)
    } else {
        d.setFullYear(d.getFullYear() + direction)
    }
    currentPeriod.value = d
}

// Scoped expenses
const scopedExpenses = computed(() => {
    if (isPersonalMode.value) {
        return expenseStore.mySpendingExpenses
    }
    return expenseStore.groupExpenses
})

// Period-filtered expenses
const periodExpenses = computed(() => {
    const d = currentPeriod.value
    return scopedExpenses.value.filter((e: ExpenseRow) => {
        const expDate = new Date(e.date)
        if (timeRange.value === 'month') {
            return expDate.getFullYear() === d.getFullYear()
                && expDate.getMonth() === d.getMonth()
        }
        return expDate.getFullYear() === d.getFullYear()
    })
})

// Summary stats
const totalAmount = computed(() =>
    periodExpenses.value.reduce((sum: number, e: ExpenseRow) => sum + e.amount, 0)
)

const todayTotal = computed(() => {
    const today = new Date().toISOString().slice(0, 10)
    return scopedExpenses.value
        .filter((e: ExpenseRow) => e.date === today)
        .reduce((sum: number, e: ExpenseRow) => sum + e.amount, 0)
})

const dailyAverage = computed(() => {
    const d = currentPeriod.value
    const daysInPeriod = timeRange.value === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        : 365
    return totalAmount.value / Math.max(daysInPeriod, 1)
})

// Category stats
const categoryStats = computed(() => {
    const stats: Record<string, { total: number; count: number }> = {}
    for (const e of periodExpenses.value) {
        if (!stats[e.category]) {
            stats[e.category] = { total: 0, count: 0 }
        }
        stats[e.category].total += e.amount
        stats[e.category].count++
    }
    return Object.entries(stats)
        .map(([category, data]) => ({
            category,
            ...data,
            percentage: totalAmount.value > 0
                ? (data.total / totalAmount.value * 100)
                : 0
        }))
        .sort((a, b) => b.total - a.total)
})

// Area chart data
const areaCategories = computed(() => categoryStats.value.map(c => c.category))

const chartLegendItems = computed(() => areaCategories.value.map((category) => ({
    category,
    label: t(`expense.categories.${category}`, category),
    color: CategoryUtils.getCategoryColor(category)
})))

const xAxisHint = computed(() => timeRange.value === 'month'
    ? t('overview.areaChartXAxisMonthHint')
    : t('overview.areaChartXAxisYearHint')
)

const yAxisHint = computed(() => t('overview.areaChartYAxisHint'))

const areaChartData = computed(() => {
    const categories = areaCategories.value
    const d = currentPeriod.value

    if (timeRange.value === 'month') {
        const weeks: Record<number, Record<string, number>> = {}
        for (const e of periodExpenses.value) {
            const expDate = new Date(e.date)
            const weekNum = Math.ceil(expDate.getDate() / 7)
            if (!weeks[weekNum]) weeks[weekNum] = {}
            weeks[weekNum][e.category] = (weeks[weekNum][e.category] ?? 0) + e.amount
        }

        const totalWeeks = Math.ceil(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() / 7)
        return Array.from({ length: totalWeeks }, (_, i) => {
            const weekData: Record<string, number> = { x: i + 1 }
            for (const cat of categories) {
                weekData[cat] = weeks[i + 1]?.[cat] ?? 0
            }
            return weekData
        })
    } else {
        const months: Record<number, Record<string, number>> = {}
        for (const e of periodExpenses.value) {
            const expDate = new Date(e.date)
            const month = expDate.getMonth()
            if (!months[month]) months[month] = {}
            months[month][e.category] = (months[month][e.category] ?? 0) + e.amount
        }

        return Array.from({ length: 12 }, (_, i) => {
            const monthData: Record<string, number> = { x: i + 1 }
            for (const cat of categories) {
                monthData[cat] = months[i]?.[cat] ?? 0
            }
            return monthData
        })
    }
})

const formatCurrency = (val: number) => {
    return `NT$ ${Math.round(val).toLocaleString()}`
}

const formatXAxisTick = (value: number) => {
    return timeRange.value === 'month'
        ? t('overview.areaChartWeekTick', { value })
        : t('overview.areaChartMonthTick', { value })
}

const formatYAxisTick = (value: number) => {
    if (value === 0) return 'NT$ 0'
    return `NT$ ${Math.round(value).toLocaleString()}`
}
</script>

<template>
    <div class="px-4 space-y-4">
        <!-- Skeleton 載入中 -->
        <template v-if="isPreloading">
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div class="glass rounded-2xl p-4 space-y-2">
                        <div class="h-3 bg-muted rounded w-16 animate-pulse" />
                        <div class="h-6 bg-muted rounded w-24 animate-pulse" />
                    </div>
                    <div class="glass rounded-2xl p-4 space-y-2">
                        <div class="h-3 bg-muted rounded w-16 animate-pulse" />
                        <div class="h-6 bg-muted rounded w-24 animate-pulse" />
                    </div>
                </div>
                <div class="glass rounded-2xl p-4 h-48 flex items-center justify-center">
                    <div class="h-4 bg-muted rounded w-32 animate-pulse" />
                </div>
            </div>
        </template>

        <template v-else>
            <!-- Summary Cards -->
            <div class="grid grid-cols-2 gap-3">
                <div class="glass rounded-2xl p-4">
                    <p class="text-xs text-muted-foreground">{{ t('overview.monthlyTotal') }}</p>
                    <p class="text-xl font-bold mt-1">{{ formatCurrency(totalAmount) }}</p>
                </div>
                <div class="glass rounded-2xl p-4">
                    <p class="text-xs text-muted-foreground">
                        {{ timeRange === 'month' ? t('overview.todayExpense') : t('overview.dailyAverage') }}
                    </p>
                    <p class="text-xl font-bold mt-1">
                        {{ formatCurrency(timeRange === 'month' ? todayTotal : dailyAverage) }}
                    </p>
                </div>
            </div>

            <!-- Period Controls -->
            <div class="flex items-center justify-between">
                <div class="flex gap-1">
                    <button
                        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer"
                        :class="timeRange === 'month'
                            ? 'bg-brand-primary text-white'
                            : 'glass text-muted-foreground'"
                        @click="timeRange = 'month'"
                    >
                        {{ t('overview.byMonth') }}
                    </button>
                    <button
                        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer"
                        :class="timeRange === 'year'
                            ? 'bg-brand-primary text-white'
                            : 'glass text-muted-foreground'"
                        @click="timeRange = 'year'"
                    >
                        {{ t('overview.byYear') }}
                    </button>
                </div>

                <div class="flex items-center gap-2">
                    <button
                        class="p-1.5 rounded-full glass cursor-pointer press-feedback"
                        @click="navigatePeriod(-1)"
                    >
                        <ChevronLeft class="h-4 w-4" />
                    </button>
                    <span class="text-sm font-medium min-w-[100px] text-center">
                        {{ currentPeriodLabel }}
                    </span>
                    <button
                        class="p-1.5 rounded-full glass cursor-pointer press-feedback"
                        @click="navigatePeriod(1)"
                    >
                        <ChevronRight class="h-4 w-4" />
                    </button>
                </div>
            </div>

            <!-- Area Chart -->
            <div
                v-if="areaChartData.length > 0 && areaCategories.length > 0"
                class="glass rounded-2xl p-4"
            >
                <h3 class="text-sm font-medium mb-3">{{ t('overview.areaChartTitle') }}</h3>
                <div class="flex flex-wrap items-center gap-2 mb-3">
                    <div
                        v-for="item in chartLegendItems"
                        :key="item.category"
                        class="inline-flex items-center gap-2 rounded-full bg-background/60 px-2.5 py-1 text-xs"
                    >
                        <span
                            class="block h-2.5 w-2.5 rounded-full"
                            :style="{ backgroundColor: item.color }"
                        />
                        <span>{{ item.label }}</span>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
                    <span>{{ xAxisHint }}</span>
                    <span>{{ yAxisHint }}</span>
                </div>
                <div class="h-auto">
                    <VisXYContainer :data="areaChartData">
                        <VisArea
                            v-for="cat in areaCategories"
                            :key="cat"
                            :x="(d: Record<string, number>) => d.x"
                            :y="(d: Record<string, number>) => d[cat] ?? 0"
                            :color="CategoryUtils.getCategoryColor(cat)"
                            :opacity="0.6"
                            :curve-type="'basis'"
                        />
                        <VisLine
                            v-for="cat in areaCategories"
                            :key="`line-${cat}`"
                            :x="(d: Record<string, number>) => d.x"
                            :y="(d: Record<string, number>) => d[cat] ?? 0"
                            :color="CategoryUtils.getCategoryColor(cat)"
                            :width="1.5"
                            :curve-type="'basis'"
                        />
                        <VisAxis
                            type="x"
                            :num-ticks="areaChartData.length"
                            :tick-format="formatXAxisTick"
                        />
                        <VisAxis
                            type="y"
                            :num-ticks="4"
                            :tick-format="formatYAxisTick"
                        />
                    </VisXYContainer>
                </div>
            </div>

            <!-- Category Breakdown -->
            <div
                v-if="categoryStats.length > 0"
                class="glass rounded-2xl p-4"
            >
                <h3 class="text-sm font-medium mb-3">{{ t('overview.categoryBreakdown') }}</h3>
                <div class="space-y-3">
                    <div
                        v-for="stat in categoryStats"
                        :key="stat.category"
                        class="flex items-center gap-3"
                    >
                        <div
                            class="w-3 h-3 rounded-full shrink-0"
                            :style="{ backgroundColor: `var(--category-${stat.category})` }"
                        />
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-sm">
                                    {{ t(`expense.categories.${stat.category}`, stat.category) }}
                                </span>
                                <span class="text-sm font-medium">
                                    {{ formatCurrency(stat.total) }}
                                </span>
                            </div>
                            <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    class="h-full rounded-full transition-all duration-300"
                                    :style="{
                                        width: `${stat.percentage}%`,
                                        backgroundColor: `var(--category-${stat.category})`
                                    }"
                                />
                            </div>
                            <div class="flex items-center justify-between mt-0.5">
                                <span class="text-xs text-muted-foreground">
                                    {{ stat.count }} {{ t('stats.count') }}
                                </span>
                                <span class="text-xs text-muted-foreground">
                                    {{ stat.percentage.toFixed(1) }}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Calendar View -->
            <CalendarView :scope="scope" />
        </template>
    </div>
</template>
