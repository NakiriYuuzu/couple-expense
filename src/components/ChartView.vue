<template>
    <div class="animate-fade-in-up">
        <!-- 控制器區域 -->
        <div class="mb-8">
            <h2 class="mb-4 text-lg font-semibold text-foreground">{{
                    t('stats.chartAnalysis')
                }}</h2>

            <!-- 時間範圍選擇器 -->
            <Card class="relative overflow-hidden border-0 shadow-lg mb-4">
                <CardContent class="p-4">
                    <div class="flex items-center justify-center space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            :class="timeRange === 'month' ? 'bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary/20 dark:text-primary dark:border-primary dark:hover:bg-primary/30' : 'dark:hover:bg-accent dark:hover:text-accent-foreground'"
                            @click="setTimeRange('month')"
                        >
                            {{ t('stats.byMonth') }}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            :class="timeRange === 'year' ? 'bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary/20 dark:text-primary dark:border-primary dark:hover:bg-primary/30' : 'dark:hover:bg-accent dark:hover:text-accent-foreground'"
                            @click="setTimeRange('year')"
                        >
                            {{ t('stats.byYear') }}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <!-- 月份/年份選擇器 -->
            <Card class="relative overflow-hidden border-0 shadow-lg">
                <CardContent class="p-4">
                    <div class="flex items-center justify-between">
                        <Button variant="outline" size="sm" @click="changePeriod(-1)">
                            <ChevronLeft class="h-4 w-4"/>
                        </Button>
                        <h3 class="font-semibold text-lg">{{ currentPeriodLabel }}</h3>
                        <Button variant="outline" size="sm" @click="changePeriod(1)">
                            <ChevronRight class="h-4 w-4"/>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- 統計卡片區域 -->
        <div class="grid gap-4 sm:grid-cols-2 mb-8">
            <!-- 總消費卡片 -->
            <Card
                class="relative overflow-hidden border-0 shadow-lg animate-slide-in-left hover:shadow-xl transition-all duration-300">
                <div
                    class="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary/80"/>
                <CardContent class="relative p-4 sm:p-6">
                    <p class="text-sm font-medium text-white/80">{{ t('stats.totalExpense') }}</p>
                    <p class="mt-2 text-2xl sm:text-3xl font-bold text-white">NT$
                        {{ totalAmount.toLocaleString() }}</p>
                </CardContent>
            </Card>

            <!-- 消費筆數卡片 -->
            <Card
                class="relative overflow-hidden border-0 shadow-lg animate-slide-in-right hover:shadow-xl transition-all duration-300">
                <div
                    class="absolute inset-0 bg-gradient-to-br from-brand-primary/60 to-brand-primary"/>
                <CardContent class="relative p-4 sm:p-6">
                    <p class="text-sm font-medium text-white/80">{{
                            t('stats.transactionCount')
                        }}</p>
                    <p class="mt-2 text-2xl sm:text-3xl font-bold text-white">{{ totalCount }}
                        {{ t('stats.count') }}</p>
                </CardContent>
            </Card>
        </div>

        <!-- 面積圖 - 類別消費分佈 -->
        <Card class="relative overflow-hidden border-0 shadow-lg mb-6 animate-fade-in-up">
            <CardHeader>
                <CardTitle class="text-lg">{{ t('stats.expenseDistribution') }}</CardTitle>
                <CardDescription>
                    {{ currentPeriodLabel }} {{ t('stats.categoryPercentage') }}
                </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
            <CardFooter>
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
            </CardFooter>
        </Card>

        <!-- 長條圖 - 水平方向 -->
        <Card class="relative overflow-hidden border-0 shadow-lg mb-6 animate-fade-in-up">
            <CardHeader>
                <CardTitle class="text-lg">{{ t('stats.expenseRanking') }}</CardTitle>
                <CardDescription>
                    {{ t('stats.categoryAmountComparison') }}
                </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
            <CardFooter class="flex-col items-start gap-2 text-sm">
                <div class="flex gap-2 font-medium leading-none">
                    {{ t('stats.totalExpense') }}: NT$ {{ totalAmount.toLocaleString() }}
                    <TrendingUp class="h-4 w-4" />
                </div>
                <div class="leading-none text-muted-foreground">
                    {{ currentPeriodLabel }}
                </div>
            </CardFooter>
        </Card>

        <!-- 每日消費趨勢 - 互動式長條圖 -->
        <Card class="relative overflow-hidden border-0 shadow-lg mb-6 animate-fade-in-up py-4 sm:py-0"
              v-if="timeRange === 'month'">
            <CardHeader class="flex flex-col items-stretch border-b !p-0 sm:flex-row">
                <div class="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
                    <CardTitle class="text-lg">{{ t('stats.dailyTrend') }}</CardTitle>
                    <CardDescription>
                        {{ currentPeriodLabel }} {{ t('stats.dailyChangePattern') }}
                    </CardDescription>
                </div>
                <div class="flex" v-if="Object.keys(sortedCategoryStats).length > 0">
                    <button
                        v-for="category in trendChartCategories"
                        :key="category"
                        :data-active="activeTrendCategory === category"
                        class="data-[active=true]:bg-muted/50 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
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
            </CardHeader>
            <CardContent class="px-2 sm:p-6">
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
            </CardContent>
        </Card>

        <!-- 詳細統計表格 -->
        <Card class="relative overflow-hidden border-0 shadow-lg animate-fade-in-up">
            <CardHeader class="pb-3">
                <CardTitle class="text-lg">{{ t('stats.detailedStats') }}</CardTitle>
            </CardHeader>
            <CardContent class="pt-0">
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
                        <div class="w-full bg-muted rounded-full h-2.5">
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
            </CardContent>
        </Card>

        <!-- 情侶消費比例分析（僅在家庭統計且有情侶時顯示） -->
        <Card v-if="isInCouple && scope === 'family'"
              class="relative overflow-hidden border-0 shadow-lg mt-6 animate-fade-in-up">
            <CardHeader class="pb-3">
                <CardTitle class="text-lg">消費比例分析</CardTitle>
                <CardDescription>
                    情侶間的消費分配情況
                </CardDescription>
            </CardHeader>
            <CardContent class="pt-0">
                <!-- 調試信息 -->
                <div v-if="!currentPeriodSpendingRatio" class="text-center py-8">
                    <p class="text-muted-foreground">
                        {{ currentPeriodLabel }} 暫無消費比例資料</p>
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
                                            ratio.user?.display_name || '未知使用者'
                                        }}</span>
                                    <span v-if="isHighestSpender(userId)"
                                          class="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-full">
                    花費最多
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
                            <div class="w-full bg-muted rounded-full h-2.5">
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
                    <div class="mt-6 pt-4 border-t">
                        <Button
                            @click="toggleSettlement"
                            variant="outline"
                            class="w-full"
                        >
                            <span v-if="!showSettlement">查看結算金額</span>
                            <span v-else>隱藏結算金額</span>
                        </Button>
                    </div>

                    <!-- 結算信息 -->
                    <div v-if="showSettlement && settlementInfo" class="mt-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div class="text-center space-y-3">
                            <div class="flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd" />
                                </svg>
                                <h3 class="text-lg font-semibold text-blue-900 dark:text-blue-100">結算資訊</h3>
                            </div>

                            <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">消費差額</p>
                                <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">NT$ {{ settlementInfo.difference.toLocaleString() }}</p>
                            </div>

                            <div class="flex items-center justify-center gap-3 text-base">
                                <span class="font-medium text-gray-700 dark:text-gray-300">{{ settlementInfo.payer.user?.display_name }}</span>
                                <span class="text-gray-500 dark:text-gray-400">需支付</span>
                                <span class="font-bold text-2xl text-blue-600 dark:text-blue-400">NT$ {{ settlementInfo.halfDifference.toLocaleString() }}</span>
                                <span class="text-gray-500 dark:text-gray-400">給</span>
                                <span class="font-medium text-gray-700 dark:text-gray-300">{{ settlementInfo.receiver.user?.display_name }}</span>
                            </div>

                            <p class="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-blue-200 dark:border-blue-800">
                                結算後雙方各自負擔 NT$ {{ (settlementInfo.difference / 2 + Math.min(settlementInfo.payer.amount, settlementInfo.receiver.amount)).toLocaleString() }}
                            </p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-vue-next'
import { useExpenseStore, useCoupleStore } from '@/stores'

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
} from '@/components/ui/chart'

// Props
const props = withDefaults(defineProps<{
    scope: 'personal' | 'family'
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
const coupleStore = useCoupleStore()
const { categoryLabels } = expenseStore
const { isInCouple } = coupleStore

// 根據 scope 選擇對應的支出資料
const scopedExpenses = computed(() => {
    return props.scope === 'personal'
        ? expenseStore.personalExpenses
        : expenseStore.familyExpenses
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
        // 預設類別顏色配置 - 使用 chart CSS 變數
        food: {
            label: categoryLabels.food || '餐飲',
            color: 'var(--chart-1)',
        },
        pet: {
            label: categoryLabels.pet || '寵物',
            color: 'var(--chart-2)',
        },
        shopping: {
            label: categoryLabels.shopping || '購物',
            color: 'var(--chart-3)',
        },
        transport: {
            label: categoryLabels.transport || '交通',
            color: 'var(--chart-4)',
        },
        home: {
            label: categoryLabels.home || '居家',
            color: 'var(--chart-5)',
        },
        other: {
            label: categoryLabels.other || '其他',
            color: 'var(--muted-foreground)',
        },
    }
    return config
})

// 獲取類別顏色 - 用於非圖表區域（如進度條、圖例指示器）
const getCategoryColor = (category: string) => {
    return chartConfig.value[category]?.color || 'var(--muted-foreground)'
}

// 面積圖設定
const areaChartConfig = computed<ChartConfig>(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    const config: ChartConfig = {}
    categories.forEach((category, index) => {
        config[category] = {
            label: categoryLabels[category] || category,
            color: `var(--chart-${index + 1})`,
        }
    })
    return config
})

// 面積圖 SVG 漸層定義
const areaChartSvgDefs = computed(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    return categories.map((category, index) => `
        <linearGradient id="fill${category}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stop-color="var(--chart-${index + 1})" stop-opacity="0.8"/>
            <stop offset="95%" stop-color="var(--chart-${index + 1})" stop-opacity="0.1"/>
        </linearGradient>
    `).join('')
})

// 面積圖填充顏色
const areaChartFillColors = computed(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    return categories.map(category => `url(#fill${category})`)
})

// 面積圖線條顏色
const areaChartLineColors = computed(() => {
    const categories = Object.keys(sortedCategoryStats.value)
    return categories.map((_, index) => `var(--chart-${index + 1})`)
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
    entries.forEach(([category], index) => {
        config[category] = {
            label: categoryLabels[category] || category,
            color: `var(--chart-${index + 1})`,
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
    categories.forEach((category, index) => {
        config[category] = {
            label: categoryLabels[category] || category,
            color: `var(--chart-${index + 1})`,
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
    // 情侶消費比例分析只在家庭統計時顯示
    if (!isInCouple || props.scope !== 'family') return null

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
        user: any
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
        user: any
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
