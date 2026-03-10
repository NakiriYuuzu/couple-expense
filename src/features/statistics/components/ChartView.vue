<template>
    <div class="animate-fade-up">
        <!-- 控制器區域 -->
        <div class="mb-8">
            <h2 class="mb-4 text-lg font-semibold text-foreground">{{
                    t('stats.chartAnalysis')
                }}</h2>

            <!-- 時間範圍選擇器 -->
            <div class="glass-light rounded-full p-1 mb-4 flex items-center justify-center space-x-2">
                <Button
                    variant="ghost"
                    size="sm"
                    class="rounded-full press-feedback hover-transition"
                    :class="timeRange === 'month' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''"
                    @click="setTimeRange('month')"
                >
                    {{ t('stats.byMonth') }}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    class="rounded-full press-feedback hover-transition"
                    :class="timeRange === 'year' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''"
                    @click="setTimeRange('year')"
                >
                    {{ t('stats.byYear') }}
                </Button>
            </div>

            <!-- 月份/年份選擇器 -->
            <div class="glass rounded-2xl p-4">
                <div class="flex items-center justify-between">
                    <Button variant="outline" size="sm" class="press-feedback hover-transition" @click="changePeriod(-1)">
                        <ChevronLeft class="h-4 w-4"/>
                    </Button>
                    <h3 class="font-semibold text-lg">{{ currentPeriodLabel }}</h3>
                    <Button variant="outline" size="sm" class="press-feedback hover-transition" @click="changePeriod(1)">
                        <ChevronRight class="h-4 w-4"/>
                    </Button>
                </div>
            </div>
        </div>

        <!-- 統計卡片區域 -->
        <div class="grid gap-4 sm:grid-cols-2 mb-8">
            <!-- 總消費卡片 -->
            <div class="glass-elevated rounded-2xl overflow-hidden p-4 sm:p-6 animate-fade-up stagger-1 hover-transition">
                <p class="text-sm font-medium text-muted-foreground">{{ t('stats.totalExpense') }}</p>
                <p class="mt-2 text-2xl sm:text-3xl font-bold text-foreground">NT$
                    {{ totalAmount.toLocaleString() }}</p>
            </div>

            <!-- 消費筆數卡片 -->
            <div class="glass-elevated rounded-2xl overflow-hidden p-4 sm:p-6 animate-fade-up stagger-2 hover-transition">
                <p class="text-sm font-medium text-muted-foreground">{{
                        t('stats.transactionCount')
                    }}</p>
                <p class="mt-2 text-2xl sm:text-3xl font-bold text-foreground">{{ totalCount }}
                    {{ t('stats.count') }}</p>
            </div>
        </div>

        <!-- 面積圖 - 類別消費分佈 -->
        <div class="glass rounded-2xl overflow-hidden mb-6 animate-fade-up">
            <div class="p-6 pb-0">
                <h3 class="text-lg font-semibold">{{ t('stats.expenseDistribution') }}</h3>
                <p class="text-sm text-muted-foreground">
                    {{ currentPeriodLabel }} {{ t('stats.categoryPercentage') }}
                </p>
            </div>
            <div class="p-6 pt-4">
                <template v-if="areaChartData.length > 0">
                    <ChartContainer :config="areaChartConfig">
                        <VisXYContainer :data="areaChartData" :svg-defs="areaChartSvgDefs">
                            <VisArea
                                :x="(d: AreaData) => d.index"
                                :y="areaChartYAccessors"
                                :color="(_d: AreaData, i: number) => areaChartFillColors[i]"
                                :opacity="0.4"
                            />
                            <VisLine
                                :x="(d: AreaData) => d.index"
                                :y="areaChartYAccessors"
                                :color="(_d: AreaData, i: number) => areaChartLineColors[i]"
                                :line-width="1"
                            />
                            <VisAxis
                                type="x"
                                :tick-line="false"
                                :domain-line="false"
                                :grid-line="false"
                                :num-ticks="Math.min(areaChartData.length, 6)"
                                :tick-format="(i: number) => areaChartData[i]?.label || ''"
                            />
                            <VisAxis
                                type="y"
                                :num-ticks="3"
                                :tick-line="false"
                                :domain-line="false"
                                :tick-format="() => ''"
                            />
                            <ChartTooltip />
                            <ChartCrosshair
                                :template="componentToString(areaChartConfig, ChartTooltipContent, { labelKey: 'label' })"
                                :color="(_d: AreaData, i: number) => areaChartLineColors[i % areaChartLineColors.length]"
                            />
                        </VisXYContainer>
                    </ChartContainer>
                </template>
                <div v-else class="h-[200px] flex items-center justify-center">
                    <p class="text-muted-foreground">{{ t('stats.noData') }}</p>
                </div>
            </div>
            <div class="px-6 py-4 border-t border-glass-border">
                <div class="flex w-full items-start gap-2 text-sm">
                    <div class="grid gap-2">
                        <div class="flex items-center gap-2 leading-none font-medium">
                            {{ t('stats.totalExpense') }}: NT$ {{ totalAmount.toLocaleString() }}
                            <TrendingUp class="h-4 w-4" />
                        </div>
                        <div class="text-muted-foreground flex items-center gap-2 leading-none">
                            {{ currentPeriodLabel }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 長條圖 - 水平方向 -->
        <div class="glass rounded-2xl overflow-hidden mb-6 animate-fade-up">
            <div class="p-6 pb-0">
                <h3 class="text-lg font-semibold">{{ t('stats.expenseRanking') }}</h3>
                <p class="text-sm text-muted-foreground">
                    {{ t('stats.categoryAmountComparison') }}
                </p>
            </div>
            <div class="p-6 pt-4">
                <template v-if="barChartData.length > 0">
                    <ChartContainer :config="barChartConfig">
                        <VisXYContainer :data="barChartData">
                            <VisGroupedBar
                                :x="(d: BarData) => d.index"
                                :y="(d: BarData) => d.amount"
                                :color="(d: BarData) => barChartConfig[d.category]?.color"
                                :rounded-corners="5"
                                :orientation="Orientation.Horizontal"
                            />
                            <VisAxis
                                type="y"
                                :tick-line="false"
                                :domain-line="false"
                                :grid-line="false"
                                :num-ticks="barChartData.length"
                                :tick-format="(i: number) => barChartData.find(d => d.index === i)?.label || ''"
                                :tick-values="barChartData.map(d => d.index)"
                            />
                            <ChartTooltip />
                            <ChartCrosshair
                                :template="componentToString(barChartConfig, ChartTooltipContent, { hideLabel: true })"
                                color="#0000"
                            />
                        </VisXYContainer>
                    </ChartContainer>
                </template>
                <div v-else class="h-[200px] flex items-center justify-center">
                    <p class="text-muted-foreground">{{ t('stats.noData') }}</p>
                </div>
            </div>
            <div class="px-6 py-4 border-t border-glass-border flex flex-col items-start gap-2 text-sm">
                <div class="flex gap-2 font-medium leading-none">
                    {{ t('stats.totalExpense') }}: NT$ {{ totalAmount.toLocaleString() }}
                    <TrendingUp class="h-4 w-4" />
                </div>
                <div class="leading-none text-muted-foreground">
                    {{ currentPeriodLabel }}
                </div>
            </div>
        </div>

        <!-- 每日消費趨勢 - 互動式長條圖 -->
        <div class="glass rounded-2xl overflow-hidden mb-6 animate-fade-up py-4 sm:py-0"
              v-if="timeRange === 'month'">
            <div class="flex flex-col items-stretch border-b border-glass-border !p-0 sm:flex-row">
                <div class="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
                    <h3 class="text-lg font-semibold">{{ t('stats.dailyTrend') }}</h3>
                    <p class="text-sm text-muted-foreground">
                        {{ currentPeriodLabel }} {{ t('stats.dailyChangePattern') }}
                    </p>
                </div>
                <div class="flex" v-if="Object.keys(sortedCategoryStats).length > 0">
                    <button
                        v-for="category in trendChartCategories"
                        :key="category"
                        :data-active="activeTrendCategory === category"
                        class="data-[active=true]:bg-muted/50 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6 press-feedback hover-transition"
                        @click="activeTrendCategory = category"
                    >
                        <span class="text-muted-foreground text-xs">
                            {{ trendChartConfig[category]?.label }}
                        </span>
                        <span class="text-lg leading-none font-bold sm:text-3xl">
                            {{ trendChartTotals[category]?.toLocaleString() || 0 }}
                        </span>
                    </button>
                </div>
            </div>
            <div class="px-2 sm:p-6">
                <template v-if="trendChartData.length > 0">
                    <ChartContainer :config="trendChartConfig" class="aspect-auto h-[250px] w-full" cursor>
                        <VisXYContainer
                            :data="trendChartData"
                            :margin="{ left: -24 }"
                            :y-domain="[0, undefined]"
                        >
                            <VisGroupedBar
                                :x="(d: TrendData) => d.date"
                                :y="(d: TrendData) => d[activeTrendCategory] as number"
                                :color="trendChartConfig[activeTrendCategory]?.color"
                                :bar-padding="0.1"
                                :rounded-corners="false"
                            />
                            <VisAxis
                                type="x"
                                :tick-line="false"
                                :domain-line="false"
                                :grid-line="false"
                                :tick-format="(d: number) => {
                                    const date = new Date(d)
                                    return `${date.getMonth() + 1}/${date.getDate()}`
                                }"
                            />
                            <VisAxis
                                type="y"
                                :num-ticks="3"
                                :tick-line="false"
                                :domain-line="false"
                            />
                            <ChartTooltip />
                            <ChartCrosshair
                                :template="componentToString(trendChartConfig, ChartTooltipContent, {
                                    labelFormatter(d: number | Date) {
                                        const date = new Date(d)
                                        return `${date.getMonth() + 1}/${date.getDate()}`
                                    },
                                })"
                                color="#0000"
                            />
                        </VisXYContainer>
                    </ChartContainer>
                </template>
                <div v-else class="h-[250px] flex items-center justify-center">
                    <p class="text-muted-foreground">{{ t('stats.noData') }}</p>
                </div>
            </div>
        </div>

        <!-- 詳細統計表格 -->
        <div class="glass rounded-2xl overflow-hidden animate-fade-up">
            <div class="p-6 pb-3">
                <h3 class="text-lg font-semibold">{{ t('stats.detailedStats') }}</h3>
            </div>
            <div class="px-6 pb-6 pt-0">
                <div class="space-y-3">
                    <div
                        v-for="(stats, category) in sortedCategoryStats"
                        :key="category"
                        class="space-y-2"
                    >
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <div
                                    class="w-4 h-4 rounded-full"
                                    :style="{ backgroundColor: getCategoryColor(String(category)) }"
                                ></div>
                                <span class="font-medium">{{ categoryLabels[category] }}</span>
                            </div>
                            <div class="text-right">
                                <p class="font-semibold">NT$ {{ stats.total.toLocaleString() }}</p>
                                <p class="text-sm text-muted-foreground">
                                    {{ stats.count }} {{ t('stats.count') }}
                                    ({{ getPercentage(stats.total) }}%)
                                </p>
                            </div>
                        </div>
                        <!-- 進度條 -->
                        <div class="glass-light w-full rounded-full h-2.5">
                            <div
                                class="h-2.5 rounded-full transition-all duration-300"
                                :style="{
                  width: `${getPercentage(stats.total)}%`,
                  backgroundColor: getCategoryColor(String(category))
                }"
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 成員消費比例分析（僅在家庭統計時顯示） -->
        <div v-if="isInGroup && scope === 'group'"
              class="glass rounded-2xl overflow-hidden mt-6 animate-fade-up">
            <div class="p-6 pb-3">
                <h3 class="text-lg font-semibold">{{ t('stats.spendingRatioAnalysis') }}</h3>
                <p class="text-sm text-muted-foreground">
                    {{ t('stats.spendingDistribution') }}
                </p>
            </div>
            <div class="px-6 pb-6 pt-0">
                <!-- 調試信息 -->
                <div v-if="!currentPeriodSpendingRatio" class="text-center py-8">
                    <p class="text-muted-foreground">
                        {{ currentPeriodLabel }} {{ t('stats.noSpendingRatioData') }}</p>
                </div>

                <!-- 有資料時顯示圖表和分析 -->
                <div v-else>
                    <!-- 詳細資訊 -->
                    <div class="space-y-4">
                        <div
                            v-for="(ratio, userId) in currentPeriodSpendingRatio"
                            :key="userId"
                            class="space-y-2"
                        >
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <div
                                        class="w-4 h-4 rounded-full"
                                        :style="{ backgroundColor: getUserColor(userId) }"
                                    ></div>
                                    <span class="font-medium">{{
                                            ratio.user?.display_name || t('expense.unknownUser')
                                        }}</span>
                                    <span v-if="isHighestSpender(userId)"
                                          class="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-full">
                    {{ t('stats.highestSpender') }}
                  </span>
                                </div>
                                <div class="text-right">
                                    <p class="font-semibold">NT$ {{
                                            ratio.amount.toLocaleString()
                                        }}</p>
                                    <p class="text-sm text-muted-foreground">
                                        {{ ratio.percentage }}%
                                    </p>
                                </div>
                            </div>
                            <div class="glass-light w-full rounded-full h-2.5">
                                <div
                                    class="h-2.5 rounded-full transition-all duration-300"
                                    :style="{
                    width: `${ratio.percentage}%`,
                    backgroundColor: getUserColor(userId)
                  }"
                                ></div>
                            </div>
                        </div>
                    </div>

                    <!-- 結算按鈕 -->
                    <div class="mt-6 pt-4 border-t border-glass-border">
                        <Button
                            @click="toggleSettlement"
                            variant="outline"
                            class="w-full press-feedback hover-transition"
                        >
                            <span v-if="!showSettlement">{{ t('stats.viewSettlement') }}</span>
                            <span v-else>{{ t('stats.hideSettlement') }}</span>
                        </Button>
                    </div>

                    <!-- 結算信息 -->
                    <div v-if="showSettlement && settlementInfo" class="mt-4 p-4 glass-light rounded-2xl">
                        <div class="text-center space-y-3">
                            <div class="flex items-center justify-center gap-2">
                                <Wallet class="h-5 w-5 text-brand-primary" />
                                <h3 class="text-lg font-semibold text-foreground">{{ t('stats.settlementInfo') }}</h3>
                            </div>

                            <div class="glass rounded-2xl p-4">
                                <p class="text-sm text-muted-foreground mb-2">{{ t('stats.spendingDifference') }}</p>
                                <p class="text-2xl font-bold text-foreground">NT$ {{ settlementInfo.difference.toLocaleString() }}</p>
                            </div>

                            <div class="flex items-center justify-center gap-3 text-base">
                                <span class="font-medium text-foreground">{{ settlementInfo.payer.user?.display_name }}</span>
                                <span class="text-muted-foreground">{{ t('stats.shouldPay') }}</span>
                                <span class="font-bold text-2xl text-brand-primary">NT$ {{ settlementInfo.halfDifference.toLocaleString() }}</span>
                                <span class="text-muted-foreground">{{ t('stats.toWord') }}</span>
                                <span class="font-medium text-foreground">{{ settlementInfo.receiver.user?.display_name }}</span>
                            </div>

                            <p class="text-xs text-muted-foreground pt-2 border-t border-glass-border">
                                {{ t('stats.afterSettlement') }} NT$ {{ (settlementInfo.difference / 2 + Math.min(settlementInfo.payer.amount, settlementInfo.receiver.amount)).toLocaleString() }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/shared/components/ui/button'
import { ChevronLeft, ChevronRight, TrendingUp, Wallet } from 'lucide-vue-next'
import { useExpenseStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import type { ExpenseUser } from '@/entities/expense/types'
import { CategoryUtils } from '@/features/expense/composables/useCategories'

// Unovis 導入
import { Orientation } from '@unovis/ts'
import {
    VisGroupedBar,
    VisXYContainer,
    VisAxis,
    VisLine,
    VisArea
} from '@unovis/vue'
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartCrosshair,
    componentToString,
    type ChartConfig
} from '@/shared/components/ui/chart'

// Props
const props = withDefaults(defineProps<{
    scope: 'personal' | 'group'
}>(), {
    scope: 'personal'
})

// 資料類型定義
interface AreaData {
    index: number
    label: string
    [key: string]: string | number  // 動態 key 用於存放各類別金額
}

interface BarData {
    index: number
    category: string
    label: string
    amount: number
}

interface TrendData {
    date: Date
    [key: string]: Date | number  // 動態 key 用於存放各類別金額
}

const { t } = useI18n()
const expenseStore = useExpenseStore()
const groupStore = useGroupStore()
const { categoryLabels } = expenseStore
const isInGroup = groupStore.isInAnyGroup

// 根據 scope 選擇對應的支出資料
const scopedExpenses = computed(() => {
    return props.scope === 'personal'
        ? expenseStore.personalExpenses
        : expenseStore.groupExpenses
})

const showSettlement = ref(false)

// 時間範圍選擇
const timeRange = ref<'month' | 'year'>('month')

// 當前選中的時期
const currentPeriod = ref(new Date())

// 設置時間範圍
const setTimeRange = (range: 'month' | 'year') => {
    timeRange.value = range
}

// 當前時期標籤
const currentPeriodLabel = computed(() => {
    if (timeRange.value === 'month') {
        return currentPeriod.value.toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: 'long'
        })
    } else {
        return `${ currentPeriod.value.getFullYear() } ${ t('stats.year') }`
    }
})

// 排序後的類別統計
const sortedCategoryStats = computed(() => {
    const periodKey = timeRange.value === 'month'
        ? currentPeriod.value.toISOString().slice(0, 7)
        : currentPeriod.value.getFullYear().toString()

    const periodExpenses = scopedExpenses.value.filter(expense => {
        if (timeRange.value === 'month') {
            return expense.date.startsWith(periodKey)
        } else {
            return expense.date.startsWith(periodKey)
        }
    })

    const categoryStats: Record<string, { total: number; count: number }> = {}

    periodExpenses.forEach(expense => {
        const amount = expense.amount

        if (!categoryStats[expense.category]) {
            categoryStats[expense.category] = { total: 0, count: 0 }
        }

        categoryStats[expense.category]!.total += amount
        categoryStats[expense.category]!.count += 1
    })

    return Object.fromEntries(
        Object.entries(categoryStats).sort(([, a], [, b]) => b.total - a.total)
    )
})

// 總金額
const totalAmount = computed(() => {
    return Object.values(sortedCategoryStats.value).reduce((sum, stats) => sum + stats.total, 0)
})

// 總次數
const totalCount = computed(() => {
    const periodKey = timeRange.value === 'month'
        ? currentPeriod.value.toISOString().slice(0, 7)
        : currentPeriod.value.getFullYear().toString()

    return scopedExpenses.value.filter(expense => {
        if (timeRange.value === 'month') {
            return expense.date.startsWith(periodKey)
        } else {
            return expense.date.startsWith(periodKey)
        }
    }).length
})

// 切換時期
const changePeriod = (direction: number) => {
    const newPeriod = new Date(currentPeriod.value)
    if (timeRange.value === 'month') {
        newPeriod.setMonth(newPeriod.getMonth() + direction)
    } else {
        newPeriod.setFullYear(newPeriod.getFullYear() + direction)
    }
    currentPeriod.value = newPeriod
}

// 獲取百分比
const getPercentage = (amount: number) => {
    return totalAmount.value > 0 ? Math.round((amount / totalAmount.value) * 100) : 0
}

// ChartConfig - 用於 tooltip、圖例和顏色配置
// 按照 shadcn-vue 官方範例：chartConfig 定義顏色，資料中使用 var(--color-KEY) 引用
const chartConfig = computed<ChartConfig>(() => {
    const config: ChartConfig = {
        food: {
            label: categoryLabels.food || '餐飲',
            color: CategoryUtils.getCategoryColor('food'),
        },
        pet: {
            label: categoryLabels.pet || '寵物',
            color: CategoryUtils.getCategoryColor('pet'),
        },
        shopping: {
            label: categoryLabels.shopping || '購物',
            color: CategoryUtils.getCategoryColor('shopping'),
        },
        transport: {
            label: categoryLabels.transport || '交通',
            color: CategoryUtils.getCategoryColor('transport'),
        },
        home: {
            label: categoryLabels.home || '居家',
            color: CategoryUtils.getCategoryColor('home'),
        },
        other: {
            label: categoryLabels.other || '其他',
            color: CategoryUtils.getCategoryColor('other'),
        },
    }
    return config
})

// 獲取類別顏色 - 委派給集中式顏色管理
const getCategoryColor = (category: string) => {
    return CategoryUtils.getCategoryColor(category)
}

// 面積圖設定
const areaChartConfig = computed<ChartConfig>(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    const config: ChartConfig = {}
    categories.forEach((category) => {
        config[category] = {
            label: categoryLabels[category] || category,
            color: CategoryUtils.getCategoryColor(category),
        }
    })
    return config
})

// 面積圖 SVG 漸層定義
const areaChartSvgDefs = computed(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    return categories.map((category) => {
        const color = CategoryUtils.getCategoryColor(category)
        return `
        <linearGradient id="fill${category}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stop-color="${color}" stop-opacity="0.8"/>
            <stop offset="95%" stop-color="${color}" stop-opacity="0.1"/>
        </linearGradient>
    `
    }).join('')
})

// 面積圖填充顏色
const areaChartFillColors = computed(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    return categories.map(category => `url(#fill${category})`)
})

// 面積圖線條顏色
const areaChartLineColors = computed(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    return categories.map((category) => CategoryUtils.getCategoryColor(category))
})

// 面積圖 Y 軸存取器（堆疊）
const areaChartYAccessors = computed(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    return categories.map(category => (d: AreaData) => d[category] as number)
})

// 面積圖資料 - 按時間顯示各類別消費
const areaChartData = computed<AreaData[]>(() => {
    const periodKey = timeRange.value === 'month'
        ? currentPeriod.value.toISOString().slice(0, 7)
        : currentPeriod.value.getFullYear().toString()

    const categories = Object.keys(sortedCategoryStats.value)
    if (categories.length === 0) return []

    // 按月份視圖：顯示每週資料；按年份視圖：顯示每月資料
    if (timeRange.value === 'month') {
        // 將當月按週分組
        const weeksData: AreaData[] = []
        const year = currentPeriod.value.getFullYear()
        const month = currentPeriod.value.getMonth()
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        for (let week = 0; week < Math.ceil(daysInMonth / 7); week++) {
            const weekStart = week * 7 + 1
            const weekEnd = Math.min((week + 1) * 7, daysInMonth)
            const weekData: AreaData = {
                index: week,
                label: `${weekStart}-${weekEnd}${t('stats.day')}`,
            }

            categories.forEach(category => {
                weekData[category] = 0
            })

            scopedExpenses.value.forEach(expense => {
                if (expense.date.startsWith(periodKey)) {
                    const dayPart = expense.date.split('-')[2]
                    if (dayPart) {
                        const day = parseInt(dayPart)
                        if (day >= weekStart && day <= weekEnd && categories.includes(expense.category)) {
                            weekData[expense.category] = (weekData[expense.category] as number || 0) + expense.amount
                        }
                    }
                }
            })

            weeksData.push(weekData)
        }

        return weeksData
    } else {
        // 年份視圖：顯示每月資料
        const monthsData: AreaData[] = []
        const year = currentPeriod.value.getFullYear()

        for (let month = 0; month < 12; month++) {
            const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
            const monthData: AreaData = {
                index: month,
                label: `${month + 1}月`,
            }

            categories.forEach(category => {
                monthData[category] = 0
            })

            scopedExpenses.value.forEach(expense => {
                if (expense.date.startsWith(monthKey) && categories.includes(expense.category)) {
                    monthData[expense.category] = (monthData[expense.category] as number || 0) + expense.amount
                }
            })

            monthsData.push(monthData)
        }

        return monthsData
    }
})

// 長條圖設定
const barChartConfig = computed<ChartConfig>(() => {
    const entries = Object.entries(sortedCategoryStats.value)
    const config: ChartConfig = {}
    entries.forEach(([category]) => {
        config[category] = {
            label: categoryLabels[category] || category,
            color: CategoryUtils.getCategoryColor(category),
        }
    })
    return config
})

// 長條圖資料
const barChartData = computed<BarData[]>(() => {
    return Object.entries(sortedCategoryStats.value).map(([category, stats], index) => ({
        index,
        category,
        label: categoryLabels[category] || category,
        amount: stats.total,
    }))
})

// 趨勢圖 - 當前選中的類別
const activeTrendCategory = ref<string>('')

// 趨勢圖顯示的類別（取前兩個消費最高的類別）
const trendChartCategories = computed(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    return categories.slice(0, 2)
})

// 趨勢圖設定
const trendChartConfig = computed<ChartConfig>(() => {
    const categories = trendChartCategories.value
    const config: ChartConfig = {}
    categories.forEach((category) => {
        config[category] = {
            label: categoryLabels[category] || category,
            color: CategoryUtils.getCategoryColor(category),
        }
    })
    return config
})

// 趨勢圖各類別總計
const trendChartTotals = computed<Record<string, number>>(() => {
    const totals: Record<string, number> = {}
    trendChartCategories.value.forEach(category => {
        totals[category] = sortedCategoryStats.value[category]?.total || 0
    })
    return totals
})

// 監聽趨勢圖類別變化，自動初始化選中類別
watch(trendChartCategories, (categories) => {
    if (!activeTrendCategory.value || !categories.includes(activeTrendCategory.value)) {
        activeTrendCategory.value = categories[0] || ''
    }
}, { immediate: true })

// 趨勢圖資料（每日各類別消費）
const trendChartData = computed<TrendData[]>(() => {
    if (timeRange.value !== 'month') {
        return []
    }

    const categories = trendChartCategories.value
    if (categories.length === 0) return []

    const year = currentPeriod.value.getFullYear()
    const month = currentPeriod.value.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const monthKey = currentPeriod.value.toISOString().slice(0, 7)

    const dailyData: TrendData[] = []

    // 初始化每天的數據
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day)
        const dayData: TrendData = { date: dateObj }
        categories.forEach(category => {
            dayData[category] = 0
        })
        dailyData.push(dayData)
    }

    // 計算每天各類別的消費
    scopedExpenses.value.forEach(expense => {
        if (expense.date.startsWith(monthKey) && categories.includes(expense.category)) {
            const dayPart = expense.date.split('-')[2]
            if (dayPart) {
                const day = parseInt(dayPart)
                const dayIndex = day - 1
                if (dailyData[dayIndex]) {
                    dailyData[dayIndex][expense.category] =
                        (dailyData[dayIndex][expense.category] as number || 0) + expense.amount
                }
            }
        }
    })

    return dailyData
})

// 獲取使用者顏色
const getUserColor = (userId: string) => {
    const colors = ['#3b82f6', '#ef4444']
    const ratioData = currentPeriodSpendingRatio.value
    if (!ratioData) return colors[0]

    const userIds = Object.keys(ratioData)
    const index = userIds.indexOf(userId)
    return colors[index] || colors[0]
}

// 判斷是否為最高消費者
const isHighestSpender = (userId: string) => {
    const ratioData = currentPeriodSpendingRatio.value
    if (!ratioData) return false

    const currentRatio = ratioData[userId as keyof typeof ratioData]
    if (!currentRatio) return false

    const allRatios = Object.values(ratioData)
    const maxAmount = Math.max(...allRatios.map(r => r.amount))

    return currentRatio.amount === maxAmount
}

const currentPeriodSpendingRatio = computed(() => {
    // 成員消費比例分析只在家庭統計時顯示
    if (!isInGroup || props.scope !== 'group') return null

    const periodKey = timeRange.value === 'month'
        ? currentPeriod.value.toISOString().slice(0, 7)
        : currentPeriod.value.getFullYear().toString()

    const periodExpenses = scopedExpenses.value.filter(expense => {
        if (timeRange.value === 'month') {
            return expense.date.startsWith(periodKey)
        } else {
            return expense.date.startsWith(periodKey)
        }
    })

    const userStats: Record<string, {
        total: number
        count: number
        user: ExpenseUser
    }> = {}

    periodExpenses.forEach(expense => {
        const userId = expense.user_id
        const userInfo = expense.user || {
            id: userId,
            display_name: null,
            avatar_url: null
        }

        if (!userStats[userId]) {
            userStats[userId] = {
                total: 0,
                count: 0,
                user: userInfo
            }
        }

        userStats[userId].total += expense.amount
        userStats[userId].count += 1
    })

    const userIds = Object.keys(userStats)
    if (userIds.length === 0) return null

    const total = Object.values(userStats).reduce((sum, stat) => sum + stat.total, 0)
    if (total === 0) return null

    const ratios: Record<string, {
        percentage: number
        amount: number
        user: ExpenseUser
    }> = {}

    userIds.forEach(userId => {
        const stat = userStats[userId]
        if (stat) {
            ratios[userId] = {
                percentage: Math.round((stat.total / total) * 100),
                amount: stat.total,
                user: stat.user
            }
        }
    })

    return ratios
})

const settlementInfo = computed(() => {
    const ratioData = currentPeriodSpendingRatio.value
    if (!ratioData) return null

    const userIds = Object.keys(ratioData)
    if (userIds.length !== 2) return null

    const [user1Id, user2Id] = userIds
    if (!user1Id || !user2Id) return null

    const user1 = ratioData[user1Id]
    const user2 = ratioData[user2Id]
    if (!user1 || !user2) return null

    const difference = Math.abs(user1.amount - user2.amount)
    const halfDifference = Math.round(difference / 2)

    const payer = user1.amount > user2.amount ? user2 : user1
    const receiver = user1.amount > user2.amount ? user1 : user2

    return {
        difference,
        halfDifference,
        payer,
        receiver
    }
})

const toggleSettlement = () => {
    showSettlement.value = !showSettlement.value
}
</script>

<style scoped>
/* Animations are now defined globally in main.css */
</style>
