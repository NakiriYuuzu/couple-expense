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

        <!-- 圓餅圖 -->
        <Card class="relative overflow-hidden border-0 shadow-lg mb-6 animate-fade-in-up">
            <CardHeader class="pb-3">
                <CardTitle class="text-lg">{{ t('stats.expenseDistribution') }}</CardTitle>
                <CardDescription>
                    {{ currentPeriodLabel }} {{ t('stats.categoryPercentage') }}
                </CardDescription>
            </CardHeader>
            <CardContent class="pt-0">
                <div class="relative h-[300px]">
                    <Doughnut
                        v-if="chartData.datasets[0].data.length > 0"
                        :data="chartData"
                        :options="doughnutOptions"
                    />
                    <div v-else class="h-full flex items-center justify-center">
                        <p class="text-muted-foreground">{{ t('stats.noData') }}</p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- 長條圖 -->
        <Card class="relative overflow-hidden border-0 shadow-lg mb-6 animate-fade-in-up">
            <CardHeader class="pb-3">
                <CardTitle class="text-lg">{{ t('stats.expenseRanking') }}</CardTitle>
                <CardDescription>
                    {{ t('stats.categoryAmountComparison') }}
                </CardDescription>
            </CardHeader>
            <CardContent class="pt-0">
                <div class="relative h-[300px]">
                    <Bar
                        v-if="barChartData.datasets[0].data.length > 0"
                        :data="barChartData"
                        :options="barOptions"
                    />
                    <div v-else class="h-full flex items-center justify-center">
                        <p class="text-muted-foreground">{{ t('stats.noData') }}</p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- 趨勢折線圖 -->
        <Card class="relative overflow-hidden border-0 shadow-lg mb-6 animate-fade-in-up"
              v-if="timeRange === 'month'">
            <CardHeader class="pb-3">
                <CardTitle class="text-lg">{{ t('stats.dailyTrend') }}</CardTitle>
                <CardDescription>
                    {{ currentPeriodLabel }} {{ t('stats.dailyChangePattern') }}
                </CardDescription>
            </CardHeader>
            <CardContent class="pt-0">
                <div class="relative h-[300px]">
                    <Line
                        v-if="lineChartData.datasets[0].data.length > 0"
                        :data="lineChartData"
                        :options="lineOptions"
                    />
                    <div v-else class="h-full flex items-center justify-center">
                        <p class="text-muted-foreground">{{ t('stats.noData') }}</p>
                    </div>
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

        <!-- 情侶消費比例分析（僅在有情侶時顯示） -->
        <Card v-if="isInCouple"
              class="relative overflow-hidden border-0 shadow-lg mt-6 animate-fade-in-up">
            <CardHeader class="pb-3">
                <CardTitle class="text-lg">消費比例分析</CardTitle>
                <CardDescription>
                    情侶間的消費分配情況
                </CardDescription>
            </CardHeader>
            <CardContent class="pt-0">
                <!-- 調試信息 -->
                <div v-if="!spendingRatio" class="text-center py-8">
                    <p class="text-sm text-muted-foreground mb-2">調試信息</p>
                    <p class="text-xs text-muted-foreground">isInCouple: {{ isInCouple }}</p>
                    <p class="text-xs text-muted-foreground">couple: {{
                            coupleStore.couple?.id
                        }}</p>
                    <p class="text-xs text-muted-foreground">expenses 數量: {{
                            expenses.length
                        }}</p>
                    <p class="text-xs text-muted-foreground">expensesByUser keys:
                        {{ Object.keys(expensesByUser) }}</p>
                    <p class="text-xs text-muted-foreground">expensesByUser:
                        {{ JSON.stringify(expensesByUser, null, 2) }}</p>
                    <p class="text-xs text-muted-foreground">userProfile:
                        {{ coupleStore.userProfile?.id }}</p>
                    <p class="text-xs text-muted-foreground">partnerProfile:
                        {{ coupleStore.partnerProfile?.id }}</p>
                    <p class="text-xs text-muted-foreground">spendingRatio: {{ spendingRatio }}</p>
                    <p class="text-muted-foreground">
                        暫無消費比例資料，請確保有情侶設定且雙方都有消費記錄</p>
                </div>

                <!-- 有資料時顯示圖表和分析 -->
                <div v-else>
                    <!-- 詳細資訊 -->
                    <div class="space-y-4">
                        <div
                            v-for="(ratio, userId) in spendingRatio"
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
                                    <!-- 顯示是否為最高消費者 -->
                                    <span v-if="isHighestSpender(userId)"
                                          class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">
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
                            <!-- 進度條 -->
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
                </div>
            </CardContent>
        </Card>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useExpenseStore, useCoupleStore } from '@/stores'
import { Doughnut, Bar, Line } from 'vue-chartjs'
import {
    Chart as ChartJS,
    ArcElement,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js'

// 註冊 Chart.js 組件
ChartJS.register(
    ArcElement,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
)

const { t } = useI18n()
const expenseStore = useExpenseStore()
const coupleStore = useCoupleStore()
const {
    monthlyStats,
    yearlyStats,
    categoryLabels,
    expenses,
    monthlyExpensesByUser,
    spendingRatio,
    expensesByUser
} = expenseStore
const { isInCouple } = coupleStore

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

// 當前時期的統計數據
const currentPeriodStats = computed(() => {
    if (timeRange.value === 'month') {
        const monthKey = currentPeriod.value.toISOString().slice(0, 7)
        return monthlyStats[monthKey] || {}
    } else {
        const yearKey = currentPeriod.value.getFullYear().toString()
        return yearlyStats[yearKey] || {}
    }
})

// 排序後的類別統計
const sortedCategoryStats = computed(() => {
    const stats = currentPeriodStats.value
    const periodKey = timeRange.value === 'month'
        ? currentPeriod.value.toISOString().slice(0, 7)
        : currentPeriod.value.getFullYear().toString()

    const periodExpenses = expenses.filter(expense => {
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

        categoryStats[expense.category].total += amount
        categoryStats[expense.category].count += 1
    })

    return Object.fromEntries(
        Object.entries(categoryStats).sort(([, a], [, b]) => b.total - a.total)
    )
})

// 總金額
const totalAmount = computed(() => {
    return Object.values(currentPeriodStats.value).reduce((sum, amount) => sum + amount, 0)
})

// 總次數
const totalCount = computed(() => {
    const periodKey = timeRange.value === 'month'
        ? currentPeriod.value.toISOString().slice(0, 7)
        : currentPeriod.value.getFullYear().toString()

    return expenses.filter(expense => {
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

// 獲取類別顏色
const getCategoryColor = (category: string) => {
    const colorMap: Record<string, string> = {
        food: '#ef4444',     // 餐飲 - 紅色
        pet: '#f59e0b',      // 寵物 - 橙色
        shopping: '#3b82f6', // 購物 - 藍色
        transport: '#10b981', // 交通 - 綠色
        home: '#8b5cf6',     // 居家 - 紫色
        other: '#6b7280'     // 其他 - 灰色
    }
    return colorMap[category] || '#6b7280'
}

// 圓餅圖數據
const chartData = computed(() => {
    const labels = Object.keys(sortedCategoryStats.value).map(cat => categoryLabels[cat])
    const data = Object.values(sortedCategoryStats.value).map(stats => stats.total)
    const colors = Object.keys(sortedCategoryStats.value).map(cat => getCategoryColor(cat))

    return {
        labels,
        datasets: [{
            data,
            backgroundColor: colors,
            borderColor: '#ffffff',
            borderWidth: 2
        }]
    }
})

// 長條圖數據
const barChartData = computed(() => {
    const labels = Object.keys(sortedCategoryStats.value).map(cat => categoryLabels[cat])
    const data = Object.values(sortedCategoryStats.value).map(stats => stats.total)
    const colors = Object.keys(sortedCategoryStats.value).map(cat => getCategoryColor(cat))

    return {
        labels,
        datasets: [{
            label: t('stats.expenseAmount'),
            data,
            backgroundColor: colors.map(color => color + '80'), // 添加透明度
            borderColor: colors,
            borderWidth: 2,
            borderRadius: 8
        }]
    }
})

// 折線圖數據（每日消費趨勢）
const lineChartData = computed(() => {
    if (timeRange.value !== 'month') {
        return { labels: [], datasets: [] }
    }

    const monthKey = currentPeriod.value.toISOString().slice(0, 7)
    const daysInMonth = new Date(currentPeriod.value.getFullYear(), currentPeriod.value.getMonth() + 1, 0).getDate()

    const dailyData: Record<string, number> = {}

    // 初始化每天的數據
    for (let i = 1; i <= daysInMonth; i++) {
        const dayStr = `${ monthKey }-${ i.toString().padStart(2, '0') }`
        dailyData[dayStr] = 0
    }

    // 計算每天的消費
    expenses.forEach(expense => {
        if (expense.date.startsWith(monthKey)) {
            const amount = expense.amount
            dailyData[expense.date] = (dailyData[expense.date] || 0) + amount
        }
    })

    const labels = Object.keys(dailyData).map(date => {
        const day = parseInt(date.split('-')[2])
        return `${ day }${ t('stats.day') }`
    })

    const data = Object.values(dailyData)

    return {
        labels,
        datasets: [{
            label: t('stats.dailyExpense'),
            data,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.4,
            fill: true
        }]
    }
})

// 圓餅圖選項
const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'bottom' as const,
            labels: {
                padding: 15,
                font: {
                    size: 12
                },
                usePointStyle: true,
                pointStyle: 'circle'
            }
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 8,
            titleFont: {
                size: 14
            },
            bodyFont: {
                size: 13
            },
            callbacks: {
                label: (context: any) => {
                    const label = context.label || ''
                    const value = context.raw || 0
                    const percentage = getPercentage(value)
                    return `${ label }: NT$ ${ value.toLocaleString() } (${ percentage }%)`
                }
            }
        }
    },
    cutout: '65%'
}

// 長條圖選項
const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 8,
            titleFont: {
                size: 14
            },
            bodyFont: {
                size: 13
            },
            callbacks: {
                label: (context: any) => {
                    const value = context.raw || 0
                    const percentage = getPercentage(value)
                    return `NT$ ${ value.toLocaleString() } (${ percentage }%)`
                }
            }
        }
    },
    scales: {
        x: {
            grid: {
                display: false
            },
            ticks: {
                font: {
                    size: 12
                }
            }
        },
        y: {
            beginAtZero: true,
            grid: {
                color: 'rgba(0, 0, 0, 0.05)'
            },
            ticks: {
                font: {
                    size: 12
                },
                callback: (value: any) => {
                    return `NT$ ${ value.toLocaleString() }`
                }
            }
        }
    }
}

// 折線圖選項
const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 8,
            titleFont: {
                size: 14
            },
            bodyFont: {
                size: 13
            },
            callbacks: {
                label: (context: any) => {
                    const value = context.raw || 0
                    return `NT$ ${ value.toLocaleString() }`
                }
            }
        }
    },
    scales: {
        x: {
            grid: {
                display: false
            },
            ticks: {
                font: {
                    size: 11
                }
            }
        },
        y: {
            beginAtZero: true,
            grid: {
                color: 'rgba(0, 0, 0, 0.05)'
            },
            ticks: {
                font: {
                    size: 12
                },
                callback: (value: any) => {
                    return `NT$ ${ value.toLocaleString() }`
                }
            }
        }
    }
}

// 獲取使用者顏色
const getUserColor = (userId: string) => {
    // 為不同使用者分配不同顏色
    const colors = ['#3b82f6', '#ef4444'] // 藍色和紅色
    // @ts-ignore
    const ratioData = spendingRatio.value
    if (!ratioData) return colors[0]

    const userIds = Object.keys(ratioData)
    const index = userIds.indexOf(userId)
    return colors[index] || colors[0]
}

// 情侶消費圓餅圖數據
const coupleSpendingData = computed(() => {
    // @ts-ignore
    const ratioData = spendingRatio.value
    if (!ratioData) {
        return { labels: [], datasets: [{ data: [] }] }
    }

    const labels = Object.values(ratioData).map(ratio =>
        ratio.user?.display_name || '未知使用者'
    )
    const data = Object.values(ratioData).map(ratio => ratio.amount)
    const colors = Object.keys(ratioData).map(userId => getUserColor(userId))

    return {
        labels,
        datasets: [{
            data,
            backgroundColor: colors,
            borderColor: '#ffffff',
            borderWidth: 2
        }]
    }
})

// 情侶消費圓餅圖選項
const coupleSpendingOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'bottom' as const,
            labels: {
                padding: 15,
                font: {
                    size: 12
                },
                usePointStyle: true,
                pointStyle: 'circle'
            }
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 8,
            titleFont: {
                size: 14
            },
            bodyFont: {
                size: 13
            },
            callbacks: {
                label: (context: any) => {
                    const label = context.label || ''
                    const value = context.raw || 0
                    // @ts-ignore
                    const ratioData = spendingRatio.value
                    if (!ratioData) return `${ label }: NT$ ${ value.toLocaleString() }`

                    const userIds = Object.keys(ratioData)
                    const userId = userIds[context.dataIndex]
                    const userRatio = ratioData[userId as keyof typeof ratioData]
                    const percentage = userRatio?.percentage || 0
                    return `${ label }: NT$ ${ value.toLocaleString() } (${ percentage }%)`
                }
            }
        }
    },
    cutout: '65%'
}


// 判斷是否為最高消費者
const isHighestSpender = (userId: string) => {
    // @ts-ignore
    const ratioData = spendingRatio.value
    if (!ratioData) return false

    const currentRatio = ratioData[userId as keyof typeof ratioData]
    if (!currentRatio) return false

    const allRatios = Object.values(ratioData)
    const maxAmount = Math.max(...allRatios.map(r => r.amount))

    return currentRatio.amount === maxAmount
}

// 資料載入已在 App.vue 中統一處理
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
