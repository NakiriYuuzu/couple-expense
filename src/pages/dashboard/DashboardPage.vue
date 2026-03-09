<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Progress } from '@/shared/components/ui/progress'
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
import { User, Users, ChevronRight, TrendingUp, TrendingDown, Scale } from 'lucide-vue-next'

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

// 導航到支出列表
const goToExpenses = (tab: 'personal' | 'group') => {
    router.push({ name: 'Expenses', query: { tab } })
}

// 導航到結算頁面
const goToBalances = () => {
    router.push({ name: 'Balances' })
}

// 載入群組相關資料（結算摘要）
const loadGroupData = async (groupId: string) => {
    await settlementStore.fetchSimplifiedDebts(groupId)
}

// 監聽 activeGroupId 切換，重新載入結算資料
watch(activeGroupId, (newId) => {
    if (newId) {
        loadGroupData(newId)
    }
}, { immediate: false })

// 下拉刷新
usePullToRefresh({
    onRefresh: async () => {
        try {
            const refreshTasks: Promise<unknown>[] = [
                expenseStore.fetchExpenses(),
                groupStore.fetchUserProfile()
            ]
            if (activeGroupId.value) {
                refreshTasks.push(loadGroupData(activeGroupId.value))
            }
            await Promise.all(refreshTasks)
            toast.success(t('common.refreshed'))
        } catch (error) {
            console.error('刷新失敗:', error)
            toast.error(t('common.refreshFailed'))
        }
    }
})

// 初始載入群組結算資料
onMounted(() => {
    if (activeGroupId.value) {
        loadGroupData(activeGroupId.value)
    }
})
</script>

<template>
    <div class="min-h-screen bg-background">
        <!-- TopBar 整合 GroupSwitcher（若有加入任何群組才顯示切換器） -->
        <TopBar :title="topBarTitle">
            <template v-if="isInAnyGroup" #action>
                <GroupSwitcher />
            </template>
        </TopBar>

        <main class="px-4 pb-24">
            <!-- 個人模式 -->
            <template v-if="isPersonalContext">
                <!-- 個人支出摘要區塊 -->
                <section class="mt-6 animate-slide-in-left">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent">
                            <User class="h-4 w-4 text-brand-primary" />
                        </div>
                        <h2 class="text-lg font-semibold text-foreground">{{ t('dashboard.personal') }}</h2>
                    </div>

                    <Card class="border-0 shadow-md py-0 pt-2">
                        <CardContent class="p-4">
                            <!-- 統計摘要：月總 + 今日 -->
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

                            <!-- 最近個人支出 -->
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

                            <!-- 查看更多 -->
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
            </template>

            <!-- 群組模式 -->
            <template v-else>
                <!-- 群組支出摘要區塊 -->
                <section class="mt-6 animate-slide-in-right">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent">
                            <Users class="h-4 w-4 text-brand-primary" />
                        </div>
                        <h2 class="text-lg font-semibold text-foreground">{{ t('dashboard.group') }}</h2>
                    </div>

                    <Card class="border-0 shadow-md py-0 pt-2">
                        <CardContent class="p-4">
                            <!-- 群組本月總支出 + 你的份額 -->
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-muted-foreground">{{ t('dashboard.monthTotal') }}</p>
                                    <p class="text-2xl font-bold text-foreground">{{ formatAmount(groupStats.month) }}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-muted-foreground">{{ t('dashboard.myShare', '我的份額') }}</p>
                                    <p class="text-xl font-semibold text-foreground">{{ formatAmount(myGroupExpenseTotal) }}</p>
                                </div>
                            </div>

                            <!-- 快速債務摘要 -->
                            <div v-if="debtSummary.length > 0" class="mt-4 pt-4 border-t border-border">
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
                                            <span class="font-semibold text-red-500">NT$ {{ Math.round(debt.amount).toLocaleString() }}</span>
                                        </template>
                                        <template v-else-if="debt.toUser.userId === currentUserId">
                                            <span class="text-muted-foreground">
                                                <span class="font-medium text-foreground">{{ debt.fromUser.displayName ?? t('common.unknown', '未知') }}</span>
                                                {{ t('dashboard.owesYou', ' 欠你') }}
                                            </span>
                                            <span class="font-semibold text-green-500">NT$ {{ Math.round(debt.amount).toLocaleString() }}</span>
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

                            <!-- 最近群組支出（含分帳 badge） -->
                            <div v-if="recentGroupExpenses.length > 0" class="mt-4 pt-4 border-t border-border">
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
                            <div v-else class="mt-4 pt-4 border-t border-border text-center py-6">
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.noGroupExpenses') }}</p>
                            </div>

                            <!-- 操作按鈕組 -->
                            <div class="mt-4 flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    class="flex-1 text-brand-primary hover:text-brand-primary hover:bg-brand-accent"
                                    @click.stop="goToExpenses('group')"
                                >
                                    {{ t('dashboard.viewMore') }}
                                    <ChevronRight class="h-4 w-4 ml-1" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    class="flex-1"
                                    @click.stop="goToBalances"
                                >
                                    <Scale class="h-4 w-4 mr-1" />
                                    {{ t('nav.balances', '結算') }}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </template>
        </main>
    </div>
</template>
