<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import TopBar from '@/shared/components/TopBar.vue'
import ExpenseItem from '@/features/expense/components/ExpenseItem.vue'
import GroupSwitcher from '@/features/group/components/GroupSwitcher.vue'
import { useExpenseStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import { useSettlementStore } from '@/features/settlement/stores/settlement'
import { usePullToRefresh } from '@/shared/composables/usePullToRefresh'
import { CategoryUtils } from '@/features/expense/composables/useCategories'
import type { Expense } from '@/features/expense/stores/expense'
import type { DisplayExpense } from '@/entities/expense/types'
import { toast } from 'vue-sonner'
import { ChevronRight, TrendingUp, TrendingDown, Scale } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const expenseStore = useExpenseStore()
const groupStore = useGroupStore()
const settlementStore = useSettlementStore()

const {
    personalExpenses,
    groupExpenses,
    personalStats,
    groupStats
} = storeToRefs(expenseStore)

const {
    activeGroupId,
    activeGroup,
    isPersonalContext,
    isInAnyGroup,
    userProfile
} = storeToRefs(groupStore)

const { simplifiedDebts } = storeToRefs(settlementStore)

// 當前使用者 ID
const currentUserId = computed(() => userProfile.value?.id ?? null)

// TopBar 標題：個人模式顯示「總覽」，群組模式顯示群組名稱
const topBarTitle = computed(() => {
    if (isPersonalContext.value) return t('nav.dashboard')
    return activeGroup.value?.name ?? t('nav.dashboard')
})

// 個人預算
const personalBudget = computed(() => groupStore.personalBudget)

// 個人最近 3 筆支出
const recentPersonalExpenses = computed(() => {
    return [...personalExpenses.value]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3)
})

// 群組最近 3 筆支出
const recentGroupExpenses = computed(() => {
    return [...groupExpenses.value]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3)
})

// 格式化金額
const formatAmount = (amount: number) => {
    return `NT$ ${Math.round(amount).toLocaleString()}`
}

// 計算個人預算使用百分比
const personalBudgetPercentage = computed(() => {
    if (!personalBudget.value || personalBudget.value <= 0) return 0
    return Math.min(100, Math.round((personalStats.value.month / personalBudget.value) * 100))
})

// 你在此群組的支出份額（user_id === currentUserId）
const myGroupExpenseTotal = computed(() => {
    if (!currentUserId.value) return 0
    return groupExpenses.value
        .filter(e => e.user_id === currentUserId.value)
        .reduce((sum, e) => sum + e.amount, 0)
})

// 前 3 筆與我相關的債務摘要
const debtSummary = computed(() => {
    return simplifiedDebts.value.slice(0, 3)
})

// 分帳方式中文標籤
const splitMethodLabel = (method: string | null | undefined): string => {
    switch (method) {
        case 'equal': return t('split.methods.equal', '均分')
        case 'exact': return t('split.methods.exact', '指定')
        case 'percentage': return t('split.methods.percentage', '比例')
        case 'shares': return t('split.methods.shares', '份數')
        default: return ''
    }
}

// 轉換支出資料格式
const convertExpense = (expense: Expense): DisplayExpense => ({
    id: expense.id,
    title: expense.title,
    amount: `NT ${Math.round(expense.amount)}`,
    category: expense.category,
    icon: CategoryUtils.getIconKey(expense.category),
    user: expense.user,
    groupId: expense.group_id,
    splitMethod: expense.split_method,
    isSettled: expense.is_settled
})

// 導航到支出詳情
const goToExpenseDetail = (id: string) => {
    router.push({ name: 'ExpenseDetail', params: { id } })
}

// 導航到支出列表
const goToExpenses = (tab: 'personal' | 'group') => {
    router.push({ name: 'Expenses', query: { tab } })
}

// 導航到總覽頁面（債務面板）
const goToBalances = () => {
    router.push({ name: 'Overview' })
}

// 下拉刷新
usePullToRefresh({
    onRefresh: async () => {
        try {
            const refreshTasks: Promise<unknown>[] = [
                (async () => {
                    expenseStore.preloadStatus = 'loading'
                    await expenseStore.fetchExpenses()
                    expenseStore.preloadStatus = 'done'
                })(),
                groupStore.fetchUserProfile()
            ]
            if (activeGroupId.value) {
                refreshTasks.push(
                    settlementStore.fetchSimplifiedDebts(activeGroupId.value)
                )
            }
            await Promise.all(refreshTasks)
            toast.success(t('common.refreshed'))
        } catch (error) {
            console.error('刷新失敗:', error)
            toast.error(t('common.refreshFailed'))
        }
    }
})

// 問候語：根據當前時間回傳早安/午安/晚安
const greetingText = computed(() => {
    const hour = new Date().getHours()
    if (hour < 12) return '早安'
    if (hour < 18) return '午安'
    return '晚安'
})

// 今日日期：格式化為 zh-TW 格式
const todayDateText = computed(() => {
    return new Date().toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    })
})

// 預算環形圖 SVG 路徑計算
const budgetRingColor = computed(() => {
    const pct = personalBudgetPercentage.value
    if (pct >= 100) return { stroke: 'text-red-500', text: 'text-red-500' }
    if (pct >= 80) return { stroke: 'text-yellow-500', text: 'text-yellow-500' }
    return { stroke: 'text-green-500', text: 'text-green-500' }
})

const budgetRingStrokeDasharray = computed(() => {
    const circumference = 2 * Math.PI * 50
    const pct = Math.min(personalBudgetPercentage.value, 100)
    const filled = (pct / 100) * circumference
    return `${filled} ${circumference - filled}`
})

</script>

<template>
    <div class="min-h-screen bg-background glass-page-bg">
        <!-- TopBar 整合 GroupSwitcher（若有加入任何群組才顯示切換器） -->
        <TopBar :title="topBarTitle">
            <template v-if="isInAnyGroup" #action>
                <GroupSwitcher />
            </template>
        </TopBar>

        <main class="px-4 pb-28">
            <!-- Greeting -->
            <section class="mt-4 animate-fade-up stagger-1">
                <p class="text-sm text-muted-foreground">{{ greetingText }}，{{ userProfile?.display_name ?? '' }}</p>
                <p class="text-xs text-muted-foreground/70 mt-0.5">{{ todayDateText }}</p>
            </section>

            <!-- 個人模式 -->
            <template v-if="isPersonalContext">
                <!-- 月總覽卡片 -->
                <section class="mt-4 animate-fade-up stagger-2">
                    <div class="glass-elevated rounded-2xl p-5">
                        <p class="text-xs text-muted-foreground uppercase tracking-wider">{{ t('dashboard.monthTotal') }}</p>
                        <p class="text-3xl font-bold text-foreground mt-1 font-heading">{{ formatAmount(personalStats.month) }}</p>
                        <div class="flex items-center gap-4 mt-3 pt-3 border-t border-glass-border">
                            <div>
                                <p class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ t('dashboard.todayTotal') }}</p>
                                <p class="text-base font-semibold text-foreground mt-0.5">{{ formatAmount(personalStats.today) }}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 預算環形圖 -->
                <section
                    v-if="personalBudget"
                    class="mt-4 animate-fade-up stagger-3"
                >
                    <div class="glass rounded-2xl p-4 flex items-center gap-5">
                            <!-- SVG Donut -->
                            <div class="relative flex-shrink-0" style="width: 120px; height: 120px;">
                                <svg
                                    viewBox="0 0 120 120"
                                    class="w-full h-full -rotate-90"
                                >
                                    <!-- Background track -->
                                    <circle
                                        cx="60"
                                        cy="60"
                                        r="50"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="10"
                                        class="text-muted/50"
                                    />
                                    <!-- Filled arc -->
                                    <circle
                                        cx="60"
                                        cy="60"
                                        r="50"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="10"
                                        stroke-linecap="round"
                                        :stroke-dasharray="budgetRingStrokeDasharray"
                                        :stroke-dashoffset="0"
                                        :class="budgetRingColor.stroke"
                                        style="transition: stroke-dasharray 0.6s ease;"
                                    />
                                </svg>
                                <!-- Center percentage text -->
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <span
                                        :class="['text-xl font-bold font-heading', budgetRingColor.text]"
                                    >
                                        {{ personalBudgetPercentage }}%
                                    </span>
                                </div>
                            </div>

                            <!-- Budget info -->
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 mb-2">
                                    <component
                                        :is="personalBudgetPercentage >= 100 ? TrendingDown : TrendingUp"
                                        :class="[
                                            'h-4 w-4',
                                            personalBudgetPercentage >= 100 ? 'text-red-500' : personalBudgetPercentage >= 80 ? 'text-yellow-500' : 'text-brand-primary'
                                        ]"
                                    />
                                    <span class="text-sm font-medium text-muted-foreground">{{ t('dashboard.personalBudgetProgress') }}</span>
                                </div>
                                <div class="text-sm text-muted-foreground space-y-0.5">
                                    <p>{{ formatAmount(personalStats.month) }} / {{ formatAmount(personalBudget) }}</p>
                                </div>
                            </div>
                    </div>
                </section>

                <!-- 最近個人支出 -->
                <section class="mt-4 animate-fade-up stagger-4">
                    <div class="glass rounded-2xl p-4">
                            <div v-if="recentPersonalExpenses.length > 0">
                                <p class="text-sm font-medium text-muted-foreground mb-3">{{ t('dashboard.recentExpenses') }}</p>
                                <div class="space-y-2">
                                    <ExpenseItem
                                        v-for="expense in recentPersonalExpenses"
                                        :key="expense.id"
                                        v-bind="convertExpense(expense)"
                                        :show-user="false"
                                        class="py-2"
                                        @click="goToExpenseDetail(expense.id)"
                                    />
                                </div>
                            </div>

                            <!-- 空狀態 -->
                            <div v-else class="text-center py-6">
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.noPersonalExpenses') }}</p>
                            </div>

                            <!-- 查看更多 -->
                            <Button
                                type="button"
                                variant="ghost"
                                class="w-full mt-4 text-brand-primary hover:text-brand-primary hover:bg-brand-accent press-feedback"
                                @click.stop="goToExpenses('personal')"
                            >
                                {{ t('dashboard.viewMore') }}
                                <ChevronRight class="h-4 w-4 ml-1" />
                            </Button>
                    </div>
                </section>
            </template>

            <!-- 群組模式 -->
            <template v-else>
                <!-- 群組月總覽 -->
                <section class="mt-4 animate-fade-up stagger-2">
                    <div class="glass-elevated rounded-2xl p-5">
                        <p class="text-xs text-muted-foreground uppercase tracking-wider">{{ t('dashboard.monthTotal') }}</p>
                        <p class="text-3xl font-bold text-foreground mt-1 font-heading">{{ formatAmount(groupStats.month) }}</p>
                        <div class="flex items-center gap-4 mt-3 pt-3 border-t border-glass-border">
                            <div>
                                <p class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ t('dashboard.myShare', '我的份額') }}</p>
                                <p class="text-base font-semibold text-foreground mt-0.5">{{ formatAmount(myGroupExpenseTotal) }}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 快速債務摘要 -->
                <section
                    v-if="debtSummary.length > 0"
                    class="mt-4 animate-fade-up stagger-3"
                >
                    <div class="glass rounded-2xl p-4">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <Scale class="h-4 w-4 text-brand-primary" />
                                    <p class="text-sm font-medium text-muted-foreground">{{ t('dashboard.debtSummary', '餘額摘要') }}</p>
                                </div>
                                <button
                                    class="text-xs text-brand-primary hover:underline"
                                    @click="goToBalances"
                                >
                                    {{ t('dashboard.viewBalances', '查看全部') }}
                                </button>
                            </div>
                            <div class="space-y-2">
                                <div
                                    v-for="(debt, index) in debtSummary"
                                    :key="index"
                                    class="flex items-center justify-between text-sm"
                                >
                                    <template v-if="debt.fromUser.userId === currentUserId">
                                        <span class="text-muted-foreground">
                                            {{ t('dashboard.youOwe', '你欠') }}
                                            <span class="font-medium text-foreground">{{ debt.toUser.displayName ?? t('common.unknown', '未知') }}</span>
                                        </span>
                                        <span class="bg-red-50 text-red-600 rounded-full px-2 py-0.5 text-sm font-semibold dark:bg-red-950 dark:text-red-400">
                                            NT$ {{ Math.round(debt.amount).toLocaleString() }}
                                        </span>
                                    </template>
                                    <template v-else-if="debt.toUser.userId === currentUserId">
                                        <span class="text-muted-foreground">
                                            <span class="font-medium text-foreground">{{ debt.fromUser.displayName ?? t('common.unknown', '未知') }}</span>
                                            {{ t('dashboard.owesYou', ' 欠你') }}
                                        </span>
                                        <span class="bg-green-50 text-green-600 rounded-full px-2 py-0.5 text-sm font-semibold dark:bg-green-950 dark:text-green-400">
                                            NT$ {{ Math.round(debt.amount).toLocaleString() }}
                                        </span>
                                    </template>
                                    <template v-else>
                                        <span class="text-muted-foreground">
                                            <span class="font-medium text-foreground">{{ debt.fromUser.displayName ?? t('common.unknown', '未知') }}</span>
                                            {{ t('dashboard.owes', ' 欠') }}
                                            <span class="font-medium text-foreground">{{ debt.toUser.displayName ?? t('common.unknown', '未知') }}</span>
                                        </span>
                                        <span class="font-semibold text-foreground">NT$ {{ Math.round(debt.amount).toLocaleString() }}</span>
                                    </template>
                                </div>
                            </div>
                    </div>
                </section>

                <!-- 最近群組支出（含分帳 badge） -->
                <section class="mt-4 animate-fade-up stagger-4">
                    <div class="glass rounded-2xl p-4">
                            <div v-if="recentGroupExpenses.length > 0">
                                <p class="text-sm font-medium text-muted-foreground mb-3">{{ t('dashboard.recentExpenses') }}</p>
                                <div class="space-y-2">
                                    <div
                                        v-for="expense in recentGroupExpenses"
                                        :key="expense.id"
                                        class="relative"
                                    >
                                        <ExpenseItem
                                            v-bind="convertExpense(expense)"
                                            :show-user="true"
                                            class="py-2"
                                            @click="goToExpenseDetail(expense.id)"
                                        />
                                        <!-- 分帳方式 badge -->
                                        <Badge
                                            v-if="expense.split_method"
                                            variant="secondary"
                                            class="absolute top-1 right-0 text-[10px] px-1.5 py-0"
                                        >
                                            {{ splitMethodLabel(expense.split_method) }}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <!-- 空狀態 -->
                            <div v-else class="text-center py-6">
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.noGroupExpenses') }}</p>
                            </div>

                            <!-- 操作按鈕組 -->
                            <div class="mt-4 flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    class="flex-1 text-brand-primary hover:text-brand-primary hover:bg-brand-accent press-feedback"
                                    @click.stop="goToExpenses('group')"
                                >
                                    {{ t('dashboard.viewMore') }}
                                    <ChevronRight class="h-4 w-4 ml-1" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    class="flex-1 press-feedback"
                                    @click.stop="goToBalances"
                                >
                                    <Scale class="h-4 w-4 mr-1" />
                                    {{ t('nav.balances', '結算') }}
                                </Button>
                            </div>
                    </div>
                </section>
            </template>
        </main>
    </div>
</template>
