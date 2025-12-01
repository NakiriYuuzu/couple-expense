<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import TopBar from '@/components/TopBar.vue'
import ExpenseItem from '@/components/ExpenseItem.vue'
import { useExpenseStore, useCoupleStore } from '@/stores'
import { usePullToRefresh } from '@/composables/usePullToRefresh'
import { CategoryUtils } from '@/composables/useCategories'
import { toast } from 'vue-sonner'
import { User, Home, ChevronRight, TrendingUp, TrendingDown } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const expenseStore = useExpenseStore()
const coupleStore = useCoupleStore()

const {
    personalExpenses,
    familyExpenses,
    personalStats,
    familyStats,
    spendingRatio
} = storeToRefs(expenseStore)

const { isInCouple, coupleSettings, userProfile, partnerProfile, personalBudget } = storeToRefs(coupleStore)

// 個人最近 3 筆支出
const recentPersonalExpenses = computed(() => {
    return [...personalExpenses.value]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3)
})

// 家庭最近 3 筆支出
const recentFamilyExpenses = computed(() => {
    return [...familyExpenses.value]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3)
})

// 格式化金額
const formatAmount = (amount: number) => {
    return `NT$ ${Math.round(amount).toLocaleString()}`
}

// 計算預算使用百分比
const budgetPercentage = computed(() => {
    if (!coupleSettings.value?.monthly_budget) return 0
    return Math.min(100, Math.round((familyStats.value.month / coupleSettings.value.monthly_budget) * 100))
})

// 計算個人預算使用百分比
const personalBudgetPercentage = computed(() => {
    if (!personalBudget.value || personalBudget.value <= 0) return 0
    return Math.min(100, Math.round((personalStats.value.month / personalBudget.value) * 100))
})

// 轉換支出資料格式
const convertExpense = (expense: any) => ({
    id: expense.id,
    title: expense.title,
    amount: `NT ${Math.round(expense.amount)}`,
    category: expense.category,
    icon: CategoryUtils.getIconKey(expense.category),
    user: expense.user
})

// 導航到支出列表
const goToExpenses = (tab: 'personal' | 'family') => {
    router.push({ name: 'Expenses', query: { tab } })
}

// 下拉刷新
usePullToRefresh({
    onRefresh: async () => {
        try {
            await Promise.all([
                expenseStore.fetchExpenses(),
                coupleStore.fetchUserProfile()
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

            <!-- 家庭支出區塊（僅在已加入家庭時顯示） -->
            <section v-if="isInCouple" class="mt-6 animate-slide-in-right">
                <div class="flex items-center gap-2 mb-4">
                    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent">
                        <Home class="h-4 w-4 text-brand-primary" />
                    </div>
                    <h2 class="text-lg font-semibold text-foreground">{{ t('dashboard.family') }}</h2>
                </div>

                <Card class="border-0 shadow-md py-0 pt-2">
                    <CardContent class="p-4">
                        <!-- 統計摘要 -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.monthTotal') }}</p>
                                <p class="text-2xl font-bold text-foreground">{{ formatAmount(familyStats.month) }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-muted-foreground">{{ t('dashboard.todayTotal') }}</p>
                                <p class="text-xl font-semibold text-foreground">{{ formatAmount(familyStats.today) }}</p>
                            </div>
                        </div>

                        <!-- 消費比例（雙方頭像 + 進度條） -->
                        <div v-if="spendingRatio && Object.keys(spendingRatio).length === 2" class="mt-4 pt-4 border-t border-border">
                            <p class="text-sm font-medium text-muted-foreground mb-3">{{ t('dashboard.spendingRatio') }}</p>
                            <div class="space-y-3">
                                <template v-for="(ratio, userId) in spendingRatio" :key="userId">
                                    <div class="flex items-center gap-3">
                                        <Avatar class="h-8 w-8">
                                            <AvatarImage :src="ratio.user?.avatar_url || ''" />
                                            <AvatarFallback class="bg-brand-accent text-brand-primary text-xs">
                                                {{ ratio.user?.display_name?.charAt(0) || '?' }}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div class="flex-1">
                                            <div class="flex items-center justify-between mb-1">
                                                <span class="text-sm font-medium">{{ ratio.user?.display_name || t('common.unknown') }}</span>
                                                <span class="text-sm text-muted-foreground">{{ ratio.percentage }}%</span>
                                            </div>
                                            <Progress :model-value="ratio.percentage" class="h-2" />
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </div>

                        <!-- 最近支出 -->
                        <div v-if="recentFamilyExpenses.length > 0" class="mt-4 pt-4 border-t border-border">
                            <p class="text-sm font-medium text-muted-foreground mb-3">{{ t('dashboard.recentExpenses') }}</p>
                            <div class="space-y-2">
                                <ExpenseItem
                                    v-for="expense in recentFamilyExpenses"
                                    :key="expense.id"
                                    v-bind="convertExpense(expense)"
                                    :show-user="true"
                                    class="py-2"
                                />
                            </div>
                        </div>

                        <!-- 空狀態 -->
                        <div v-else class="mt-4 pt-4 border-t border-border text-center py-6">
                            <p class="text-sm text-muted-foreground">{{ t('dashboard.noFamilyExpenses') }}</p>
                        </div>

                        <!-- 查看更多按鈕 -->
                        <Button
                            type="button"
                            variant="ghost"
                            class="w-full mt-4 text-brand-primary hover:text-brand-primary hover:bg-brand-accent"
                            @click.stop="goToExpenses('family')"
                        >
                            {{ t('dashboard.viewMore') }}
                            <ChevronRight class="h-4 w-4 ml-1" />
                        </Button>
                    </CardContent>
                </Card>
            </section>

            <!-- 預算進度（僅在有設定預算時顯示） -->
<!--            <section v-if="isInCouple && coupleSettings?.monthly_budget" class="mt-6 animate-fade-in-up">-->
<!--                <Card class="border-0 shadow-md overflow-hidden">-->
<!--                    <div-->
<!--                        class="absolute inset-0 bg-gradient-to-br transition-all duration-300"-->
<!--                        :class="budgetPercentage >= 100-->
<!--                            ? 'from-red-500/10 to-red-600/10'-->
<!--                            : budgetPercentage >= 80-->
<!--                            ? 'from-yellow-500/10 to-yellow-600/10'-->
<!--                            : 'from-brand-primary/10 to-brand-primary/5'"-->
<!--                    />-->
<!--                    <CardContent class="relative p-4">-->
<!--                        <div class="flex items-center justify-between mb-3">-->
<!--                            <div class="flex items-center gap-2">-->
<!--                                <component-->
<!--                                    :is="budgetPercentage >= 100 ? TrendingDown : TrendingUp"-->
<!--                                    :class="[-->
<!--                                        'h-5 w-5',-->
<!--                                        budgetPercentage >= 100 ? 'text-red-500' : budgetPercentage >= 80 ? 'text-yellow-500' : 'text-brand-primary'-->
<!--                                    ]"-->
<!--                                />-->
<!--                                <span class="text-sm font-medium text-foreground">{{ t('dashboard.budgetProgress') }}</span>-->
<!--                            </div>-->
<!--                            <span-->
<!--                                :class="[-->
<!--                                    'text-sm font-bold',-->
<!--                                    budgetPercentage >= 100 ? 'text-red-500' : budgetPercentage >= 80 ? 'text-yellow-500' : 'text-brand-primary'-->
<!--                                ]"-->
<!--                            >-->
<!--                                {{ budgetPercentage }}%-->
<!--                            </span>-->
<!--                        </div>-->
<!--                        <Progress-->
<!--                            :model-value="budgetPercentage"-->
<!--                            class="h-3"-->
<!--                            :class="budgetPercentage >= 100 ? '[&>div]:bg-red-500' : budgetPercentage >= 80 ? '[&>div]:bg-yellow-500' : ''"-->
<!--                        />-->
<!--                        <div class="flex items-center justify-between mt-2 text-xs text-muted-foreground">-->
<!--                            <span>{{ formatAmount(familyStats.month) }}</span>-->
<!--                            <span>{{ formatAmount(coupleSettings.monthly_budget) }}</span>-->
<!--                        </div>-->
<!--                    </CardContent>-->
<!--                </Card>-->
<!--            </section>-->
        </main>
    </div>
</template>
