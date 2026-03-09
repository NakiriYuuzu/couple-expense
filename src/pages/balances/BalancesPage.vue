<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Wallet, Users, TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
import TopBar from '@/shared/components/TopBar.vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Separator } from '@/shared/components/ui/separator'
import { Skeleton } from '@/shared/components/ui/skeleton'
import DebtSummaryCard from '@/features/settlement/components/DebtSummaryCard.vue'
import SettlementDrawer from '@/features/settlement/components/SettlementDrawer.vue'
import SettlementHistory from '@/features/settlement/components/SettlementHistory.vue'
import { useSettlementStore } from '@/features/settlement/stores/settlement'
import { useGroupStore } from '@/features/group/stores/group'
import { useGroupContext } from '@/features/group/composables/useGroupContext'
import { useNetBalances } from '@/features/settlement/composables/useNetBalances'
import type { SimplifiedDebt } from '@/entities/settlement/types'

const { t } = useI18n()
const settlementStore = useSettlementStore()
const groupStore = useGroupStore()
const { isPersonalMode, activeGroupName, activeGroupId } = useGroupContext()
const { formatBalance, getBalanceStatus } = useNetBalances()

const { netBalances, simplifiedDebts, loading, totalGroupDebt } = storeToRefs(settlementStore)
const { userProfile } = storeToRefs(groupStore)

// Settlement drawer state
const settleDrawerOpen = ref(false)
const selectedDebt = ref<SimplifiedDebt | null>(null)

const currentUserId = computed(() => userProfile.value?.id ?? null)

const isCurrentUserDebt = (debt: SimplifiedDebt): boolean => {
    return debt.fromUser.userId === currentUserId.value
}

const handleSettle = (debt: SimplifiedDebt) => {
    selectedDebt.value = debt
    settleDrawerOpen.value = true
}

const handleSettled = async () => {
    selectedDebt.value = null
    if (activeGroupId.value) {
        await loadBalanceData(activeGroupId.value)
    }
}

const loadBalanceData = async (groupId: string) => {
    await Promise.all([
        settlementStore.fetchNetBalances(groupId),
        settlementStore.fetchSimplifiedDebts(groupId)
    ])
}

const getInitial = (displayName: string | null): string => {
    if (!displayName) return '?'
    return displayName.charAt(0).toUpperCase()
}

const balanceStatusIcon = (amount: number) => {
    const status = getBalanceStatus(amount)
    if (status === 'owed') return TrendingUp
    if (status === 'owes') return TrendingDown
    return Minus
}

const balanceStatusClass = (amount: number): string => {
    const status = getBalanceStatus(amount)
    if (status === 'owed') return 'text-green-600 dark:text-green-400'
    if (status === 'owes') return 'text-red-500 dark:text-red-400'
    return 'text-muted-foreground'
}

// Load data when groupId changes
watch(
    activeGroupId,
    async (newId) => {
        if (newId) {
            await loadBalanceData(newId)
        } else {
            settlementStore.clearSettlementData()
        }
    }
)

onMounted(async () => {
    if (activeGroupId.value) {
        await loadBalanceData(activeGroupId.value)
    }
})
</script>

<template>
    <div class="min-h-screen bg-background">
        <TopBar :title="t('nav.balances')" />

        <main class="px-4 pb-24 pt-6">
            <!-- Personal mode: no active group -->
            <div v-if="isPersonalMode" class="flex flex-col items-center justify-center py-20 text-center">
                <div class="flex h-20 w-20 items-center justify-center rounded-full bg-brand-accent mb-5">
                    <Wallet class="h-10 w-10 text-brand-primary" />
                </div>
                <h2 class="text-lg font-semibold text-foreground mb-2">
                    {{ t('balance.selectGroupTitle') }}
                </h2>
                <p class="text-sm text-muted-foreground max-w-[260px]">
                    {{ t('balance.selectGroupDesc') }}
                </p>
            </div>

            <!-- Group mode: show balances -->
            <template v-else>
                <!-- Header: Group name + Total debt -->
                <div class="mb-6">
                    <div class="flex items-center gap-2 mb-1">
                        <Users class="h-4 w-4 text-muted-foreground" />
                        <span class="text-sm text-muted-foreground">{{ activeGroupName }}</span>
                    </div>
                    <div v-if="loading" class="space-y-1">
                        <Skeleton class="h-8 w-40" />
                        <Skeleton class="h-4 w-28" />
                    </div>
                    <div v-else>
                        <p class="text-2xl font-bold text-foreground">
                            NT$ {{ totalGroupDebt.toLocaleString() }}
                        </p>
                        <p class="text-sm text-muted-foreground">
                            {{ t('balance.totalOutstanding') }}
                        </p>
                    </div>
                </div>

                <!-- Simplified debts section -->
                <section class="mb-6">
                    <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        {{ t('balance.simplifiedDebts') }}
                    </h3>

                    <!-- Loading state -->
                    <div v-if="loading" class="space-y-3">
                        <div v-for="i in 2" :key="i" class="rounded-xl border p-4">
                            <div class="flex items-center gap-3">
                                <Skeleton class="h-10 w-10 rounded-full" />
                                <div class="flex-1 space-y-2">
                                    <Skeleton class="h-4 w-24" />
                                    <Skeleton class="h-3 w-16" />
                                </div>
                                <Skeleton class="h-10 w-10 rounded-full" />
                            </div>
                        </div>
                    </div>

                    <!-- Debts list -->
                    <div v-else-if="simplifiedDebts.length > 0" class="space-y-3">
                        <DebtSummaryCard
                            v-for="(debt, index) in simplifiedDebts"
                            :key="index"
                            :from-user="debt.fromUser"
                            :to-user="debt.toUser"
                            :amount="debt.amount"
                            :is-current-user="isCurrentUserDebt(debt)"
                            @settle="handleSettle(debt)"
                        />
                    </div>

                    <!-- All settled empty state -->
                    <div v-else class="flex flex-col items-center py-8 text-center">
                        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                            <Wallet class="h-7 w-7 text-green-600 dark:text-green-400" />
                        </div>
                        <p class="text-sm font-medium text-foreground mb-1">
                            {{ t('balance.allSettled') }}
                        </p>
                        <p class="text-xs text-muted-foreground">
                            {{ t('balance.allSettledDesc') }}
                        </p>
                    </div>
                </section>

                <!-- Net balances section -->
                <section class="mb-6">
                    <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        {{ t('balance.netBalances') }}
                    </h3>

                    <Card v-if="!loading && netBalances.length > 0">
                        <CardContent class="px-4 py-2">
                            <template v-for="(balance, index) in netBalances" :key="balance.userId">
                                <div class="flex items-center gap-3 py-3">
                                    <Avatar class="h-9 w-9 flex-shrink-0">
                                        <AvatarImage :src="balance.avatarUrl || ''" />
                                        <AvatarFallback class="bg-brand-accent text-brand-primary text-sm font-medium">
                                            {{ getInitial(balance.displayName) }}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-medium truncate">
                                            {{ balance.displayName || t('common.unknown') }}
                                            <span
                                                v-if="balance.userId === currentUserId"
                                                class="text-xs text-muted-foreground font-normal ml-1"
                                            >
                                                ({{ t('common.me') }})
                                            </span>
                                        </p>
                                    </div>

                                    <div class="flex items-center gap-1.5 flex-shrink-0">
                                        <component
                                            :is="balanceStatusIcon(balance.netBalance)"
                                            class="h-3.5 w-3.5"
                                            :class="balanceStatusClass(balance.netBalance)"
                                        />
                                        <span
                                            class="text-sm font-semibold"
                                            :class="balanceStatusClass(balance.netBalance)"
                                        >
                                            {{ formatBalance(balance.netBalance) }}
                                        </span>
                                    </div>
                                </div>
                                <Separator v-if="index < netBalances.length - 1" />
                            </template>
                        </CardContent>
                    </Card>

                    <!-- Loading skeleton for net balances -->
                    <Card v-else-if="loading">
                        <CardContent class="px-4 py-2">
                            <div v-for="i in 3" :key="i" class="flex items-center gap-3 py-3">
                                <Skeleton class="h-9 w-9 rounded-full" />
                                <Skeleton class="h-4 flex-1" />
                                <Skeleton class="h-4 w-20" />
                            </div>
                        </CardContent>
                    </Card>

                    <!-- Empty -->
                    <div v-else class="text-center py-6 text-sm text-muted-foreground">
                        {{ t('balance.noBalances') }}
                    </div>
                </section>

                <!-- Settlement history section -->
                <section v-if="activeGroupId">
                    <Card>
                        <CardHeader class="px-4 pb-0 pt-4">
                            <CardTitle class="text-base font-semibold">
                                {{ t('settlement.historySection') }}
                            </CardTitle>
                        </CardHeader>
                        <CardContent class="px-4 pb-4 pt-2">
                            <SettlementHistory :group-id="activeGroupId" />
                        </CardContent>
                    </Card>
                </section>
            </template>
        </main>

        <!-- Settlement drawer -->
        <SettlementDrawer
            v-if="selectedDebt && activeGroupId"
            v-model:open="settleDrawerOpen"
            :group-id="activeGroupId"
            :to-user="selectedDebt.toUser"
            :suggested-amount="selectedDebt.amount"
            @settled="handleSettled"
        />
    </div>
</template>
