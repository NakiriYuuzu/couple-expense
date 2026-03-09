<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Progress } from '@/shared/components/ui/progress'
import TopBar from '@/shared/components/TopBar.vue'
import ExpenseItem from '@/features/expense/components/ExpenseItem.vue'
import { useExpenseStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import { usePullToRefresh } from '@/shared/composables/usePullToRefresh'
import { CategoryUtils } from '@/features/expense/composables/useCategories'
import type { Expense } from '@/features/expense/stores/expense'
import type { DisplayExpense } from '@/entities/expense/types'
import { toast } from 'vue-sonner'
import { User, Users, ChevronRight, TrendingUp, TrendingDown } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const expenseStore = useExpenseStore()
const groupStore = useGroupStore()

const {
    personalExpenses,
    groupExpenses,
    personalStats,
    groupStats
} = storeToRefs(expenseStore)

const isInGroup = computed(() => groupStore.isInAnyGroup)
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

// 轉換支出資料格式
const convertExpense = (expense: Expense): DisplayExpense => ({
    id: expense.id,
    title: expense.title,
    amount: `NT ${Math.round(expense.amount)}`,
    category: expense.category,
    icon: CategoryUtils.getIconKey(expense.category),
    user: expense.user
})

// 導航到支出列表
const goToExpenses = (tab: 'personal' | 'group') => {
    router.push({ name: 'Expenses', query: { tab } })
}

// 下拉刷新
usePullToRefresh({
    onRefresh: async () => {
        try {
            await Promise.all([
                expenseStore.fetchExpenses(),
                groupStore.fetchUserProfile()
            ])
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
        <TopBar :title="t('nav.dashboard')" />

        <main class="px-4 pb-24">
            <!-- 個人支出區塊 -->
            <section class="mt-6 animate-slide-in-left">
                <div class="flex items-center gap-2 mb-4">
                    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent">
                        <User class="h-4 w-4 text-brand-primary" />
                    </div>
                    <h2 class="text-lg font-semibold text-foreground">{{ t('dashboard.personal') }}</h2>
                </div>

                <Card class="border-0 shadow-md py-0 pt-2">
                    <CardContent class="p-4">
                        <!-- 統計摘要 -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.monthTotal') }}</p>
                                <p class="text-2xl font-bold text-foreground">{{ formatAmount(personalStats.month) }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.todayTotal') }}</p>
                                <p class="text-xl font-semibold text-foreground">{{ formatAmount(personalStats.today) }}</p>
                            </div>
                        </div>

                        <!-- 最近支出 -->
                        <div v-if="recentPersonalExpenses.length > 0" class="mt-4 pt-4 border-t border-border">
                            <p class="text-sm font-medium text-muted-foreground mb-3">{{ t('dashboard.recentExpenses') }}</p>
                            <div class="space-y-2">
                                <ExpenseItem
                                    v-for="expense in recentPersonalExpenses"
                                    :key="expense.id"
                                    v-bind="convertExpense(expense)"
                                    :show-user="false"
                                    class="py-2"
                                />
                            </div>
                        </div>

                        <!-- 空狀態 -->
                        <div v-else class="mt-4 pt-4 border-t border-border text-center py-6">
                            <p class="text-sm text-muted-foreground">{{ t('dashboard.noPersonalExpenses') }}</p>
                        </div>

                        <!-- 個人預算進度（僅在有設定預算時顯示） -->
                        <div v-if="personalBudget" class="mt-4 pt-4 border-t border-border">
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <component
                                        :is="personalBudgetPercentage >= 100 ? TrendingDown : TrendingUp"
                                        :class="[
                                            'h-4 w-4',
                                            personalBudgetPercentage >= 100 ? 'text-red-500' : personalBudgetPercentage >= 80 ? 'text-yellow-500' : 'text-brand-primary'
                                        ]"
                                    />
                                    <span class="text-sm text-muted-foreground">{{ t('dashboard.personalBudgetProgress') }}</span>
                                </div>
                                <span
                                    :class="[
                                        'text-sm font-semibold',
                                        personalBudgetPercentage >= 100 ? 'text-red-500' : personalBudgetPercentage >= 80 ? 'text-yellow-500' : 'text-brand-primary'
                                    ]"
                                >
                                    {{ personalBudgetPercentage }}%
                                </span>
                            </div>
                            <Progress
                                :model-value="personalBudgetPercentage"
                                class="h-2"
                                :class="personalBudgetPercentage >= 100 ? '[&>div]:bg-red-500' : personalBudgetPercentage >= 80 ? '[&>div]:bg-yellow-500' : ''"
                            />
                            <div class="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>{{ formatAmount(personalStats.month) }}</span>
                                <span>{{ formatAmount(personalBudget) }}</span>
                            </div>
                        </div>

                        <!-- 查看更多按鈕 -->
                        <Button
                            type="button"
                            variant="ghost"
                            class="w-full mt-4 text-brand-primary hover:text-brand-primary hover:bg-brand-accent"
                            @click.stop="goToExpenses('personal')"
                        >
                            {{ t('dashboard.viewMore') }}
                            <ChevronRight class="h-4 w-4 ml-1" />
                        </Button>
                    </CardContent>
                </Card>
            </section>

            <!-- 群組支出區塊（僅在已加入群組時顯示） -->
            <section v-if="isInGroup" class="mt-6 animate-slide-in-right">
                <div class="flex items-center gap-2 mb-4">
                    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent">
                        <Users class="h-4 w-4 text-brand-primary" />
                    </div>
                    <h2 class="text-lg font-semibold text-foreground">{{ t('dashboard.group') }}</h2>
                </div>

                <Card class="border-0 shadow-md py-0 pt-2">
                    <CardContent class="p-4">
                        <!-- 統計摘要 -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.monthTotal') }}</p>
                                <p class="text-2xl font-bold text-foreground">{{ formatAmount(groupStats.month) }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.todayTotal') }}</p>
                                <p class="text-xl font-semibold text-foreground">{{ formatAmount(groupStats.today) }}</p>
                            </div>
                        </div>

                        <!-- 最近支出 -->
                        <div v-if="recentGroupExpenses.length > 0" class="mt-4 pt-4 border-t border-border">
                            <p class="text-sm font-medium text-muted-foreground mb-3">{{ t('dashboard.recentExpenses') }}</p>
                            <div class="space-y-2">
                                <ExpenseItem
                                    v-for="expense in recentGroupExpenses"
                                    :key="expense.id"
                                    v-bind="convertExpense(expense)"
                                    :show-user="true"
                                    class="py-2"
                                />
                            </div>
                        </div>

                        <!-- 空狀態 -->
                        <div v-else class="mt-4 pt-4 border-t border-border text-center py-6">
                            <p class="text-sm text-muted-foreground">{{ t('dashboard.noGroupExpenses') }}</p>
                        </div>

                        <!-- 查看更多按鈕 -->
                        <Button
                            type="button"
                            variant="ghost"
                            class="w-full mt-4 text-brand-primary hover:text-brand-primary hover:bg-brand-accent"
                            @click.stop="goToExpenses('group')"
                        >
                            {{ t('dashboard.viewMore') }}
                            <ChevronRight class="h-4 w-4 ml-1" />
                        </Button>
                    </CardContent>
                </Card>
            </section>

        </main>
    </div>
</template>
