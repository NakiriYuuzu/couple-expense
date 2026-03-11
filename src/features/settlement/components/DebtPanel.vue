<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, Wallet, ArrowRight } from 'lucide-vue-next'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Separator } from '@/shared/components/ui/separator'
import { useGroupStore } from '@/features/group/stores/group'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useSettlementStore } from '@/shared/stores'
import DebtStatusHero from '@/features/settlement/components/DebtStatusHero.vue'
import DebtSummaryCard from '@/features/settlement/components/DebtSummaryCard.vue'
import SettlementDrawer from '@/features/settlement/components/SettlementDrawer.vue'
import SettlementHistory from '@/features/settlement/components/SettlementHistory.vue'
import { useMonthlySnapshots } from '@/features/settlement/composables/useMonthlySnapshots'
import type { SimplifiedDebt } from '@/entities/settlement/types'

const { t } = useI18n()
const groupStore = useGroupStore()
const authStore = useAuthStore()
const settlementStore = useSettlementStore()

const isPersonalMode = computed(() => !groupStore.activeGroupId)
const currentUserId = computed(() => authStore.user?.id ?? '')
const currentYearMonth = computed(() => new Date().toISOString().slice(0, 7))

const {
    selectedMonth,
    allMonths,
    selectedSnapshot,
    isLoading
} = useMonthlySnapshots()

// ── Year control ──────────────────────────────────────────
const selectedYear = ref(new Date().getFullYear())

const availableYears = computed(() => {
    const years = new Set(allMonths.value.map(m => Number(m.slice(0, 4))))
    years.add(new Date().getFullYear())
    return [...years].sort()
})

const yearMonths = computed(() => {
    const yearStr = String(selectedYear.value)
    return allMonths.value.filter(m => m.startsWith(yearStr))
})

const canGoYearBack = computed(() => (availableYears.value[0] ?? selectedYear.value) < selectedYear.value)
const canGoYearForward = computed(() => selectedYear.value < new Date().getFullYear())

const navigateYear = (direction: -1 | 1) => {
    const newYear = selectedYear.value + direction
    if (direction === -1 && !canGoYearBack.value) return
    if (direction === 1 && !canGoYearForward.value) return
    selectedYear.value = newYear

    const monthsInYear = allMonths.value.filter(m => m.startsWith(String(newYear)))
    const firstMonth = monthsInYear[0]
    if (firstMonth) {
        selectedMonth.value = firstMonth
    }
}

// Sync selectedYear when selectedMonth changes externally
watch(selectedMonth, (m) => {
    const year = Number(m.slice(0, 4))
    if (year !== selectedYear.value) {
        selectedYear.value = year
    }
})

// ── Month pills ───────────────────────────────────────────
const formatMonthPill = (yearMonth: string): string => {
    const month = Number(yearMonth.slice(5, 7))
    if (yearMonth === currentYearMonth.value) return t('overview.currentMonth')
    return `${month}${t('overview.monthUnit')}`
}

const selectMonth = (month: string) => {
    selectedMonth.value = month
}

// ── Net balances helpers ──────────────────────────────────
const getInitial = (name: string | null) => name?.charAt(0).toUpperCase() ?? '?'

const balanceClass = (amount: number): string => {
    if (amount > 0) return 'text-green-600 dark:text-green-400'
    if (amount < 0) return 'text-red-500 dark:text-red-400'
    return 'text-muted-foreground'
}

const formatBalance = (amount: number): string => {
    const abs = Math.abs(amount)
    const formatted = `NT$ ${Math.round(abs).toLocaleString()}`
    if (amount > 0) return `+${formatted}`
    if (amount < 0) return `-${formatted}`
    return 'NT$ 0'
}

const formatCurrency = (val: number) => `NT$ ${Math.round(val).toLocaleString()}`

// ── Settlement drawer ─────────────────────────────────────
const isSettleDrawerOpen = ref(false)
const settleTargetUser = ref<{ userId: string; displayName: string | null; avatarUrl: string | null } | null>(null)
const settleSuggestedAmount = ref(0)
const settleYearMonth = ref<string | null>(null)
const editSettlementId = ref<string | null>(null)
const editNotes = ref<string | null>(null)
const settlementHistoryRef = ref<InstanceType<typeof SettlementHistory> | null>(null)

const handleSettle = (debt: SimplifiedDebt) => {
    const isFromCurrentUser = debt.fromUser.userId === currentUserId.value
    settleTargetUser.value = isFromCurrentUser ? debt.toUser : debt.fromUser
    settleSuggestedAmount.value = debt.amount
    settleYearMonth.value = selectedMonth.value
    editSettlementId.value = null
    editNotes.value = null
    isSettleDrawerOpen.value = true
}

const handleSettled = async () => {
    isSettleDrawerOpen.value = false
    const groupId = groupStore.activeGroupId
    if (!groupId) return

    const refreshMonth = settleYearMonth.value ?? selectedMonth.value
    const tasks: Promise<void>[] = [
        settlementStore.fetchMonthlySnapshots(groupId)
    ]
    if (refreshMonth) {
        tasks.push(settlementStore.fetchMonthDebts(groupId, refreshMonth, true))
    }
    await Promise.all(tasks)
    settlementHistoryRef.value?.loadHistory()
}

const handleHistoryChanged = async () => {
    const groupId = groupStore.activeGroupId
    if (!groupId) return
    await Promise.all([
        settlementStore.fetchMonthlySnapshots(groupId),
        settlementStore.fetchMonthDebts(groupId, selectedMonth.value, true)
    ])
}
</script>

<template>
    <div class="px-4 space-y-5">
        <!-- Personal Mode Placeholder -->
        <div
            v-if="isPersonalMode"
            class="flex flex-col items-center justify-center py-20 text-center"
        >
            <div class="w-16 h-16 rounded-full glass-elevated flex items-center justify-center mb-4">
                <Wallet class="h-8 w-8 text-muted-foreground" />
            </div>
            <p class="text-muted-foreground text-sm">
                {{ t('overview.selectGroupForDebts') }}
            </p>
        </div>

        <!-- Group Mode -->
        <template v-else>
            <!-- Hero Status Card -->
            <DebtStatusHero
                :snapshot="selectedSnapshot"
                :current-user-id="currentUserId"
                :is-loading="isLoading"
                @settle="handleSettle"
            />

            <!-- Year Navigator -->
            <div class="flex items-center justify-center gap-4">
                <button
                    class="p-1.5 rounded-full glass cursor-pointer press-feedback transition-opacity"
                    :class="canGoYearBack ? 'opacity-100' : 'opacity-30 pointer-events-none'"
                    :disabled="!canGoYearBack"
                    @click="navigateYear(-1)"
                >
                    <ChevronLeft class="h-4 w-4" />
                </button>
                <span class="text-sm font-semibold min-w-[80px] text-center">
                    {{ selectedYear }} {{ t('overview.yearUnit') }}
                </span>
                <button
                    class="p-1.5 rounded-full glass cursor-pointer press-feedback transition-opacity"
                    :class="canGoYearForward ? 'opacity-100' : 'opacity-30 pointer-events-none'"
                    :disabled="!canGoYearForward"
                    @click="navigateYear(1)"
                >
                    <ChevronRight class="h-4 w-4" />
                </button>
            </div>

            <!-- Month Pills -->
            <div
                v-if="yearMonths.length > 0"
                class="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4"
            >
                <button
                    v-for="month in yearMonths"
                    :key="month"
                    class="shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer press-feedback"
                    :class="selectedMonth === month
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'glass text-muted-foreground hover:text-foreground'"
                    @click="selectMonth(month)"
                >
                    {{ formatMonthPill(month) }}
                </button>
            </div>

            <!-- No months in this year -->
            <div
                v-else
                class="text-center py-6 text-sm text-muted-foreground"
            >
                {{ t('overview.noDataThisYear') }}
            </div>

            <!-- Monthly Summary -->
            <div
                v-if="selectedSnapshot && !isLoading"
                class="glass rounded-2xl p-4"
            >
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs text-muted-foreground">{{ t('overview.totalExpenses') }}</p>
                        <p class="text-xl font-bold mt-0.5">
                            {{ formatCurrency(selectedSnapshot.totalExpense) }}
                        </p>
                        <p class="text-xs text-muted-foreground mt-0.5">
                            {{ selectedSnapshot.expenseCount }} {{ t('stats.count') }}
                        </p>
                    </div>
                    <div>
                        <p class="text-xs text-muted-foreground">{{ t('overview.unsettledAmount') }}</p>
                        <p
                            class="text-xl font-bold mt-0.5"
                            :class="selectedSnapshot.totalUnsettled > 0
                                ? 'text-red-500 dark:text-red-400'
                                : 'text-green-600 dark:text-green-400'"
                        >
                            {{ formatCurrency(selectedSnapshot.totalUnsettled) }}
                        </p>
                        <p class="text-xs mt-0.5" :class="selectedSnapshot.totalUnsettled > 0
                            ? 'text-red-400/70 dark:text-red-500/70'
                            : 'text-green-500/70 dark:text-green-400/70'">
                            {{ selectedSnapshot.totalUnsettled > 0
                                ? t('overview.unsettled')
                                : t('overview.settled')
                            }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Loading summary skeleton -->
            <div v-else-if="isLoading" class="glass rounded-2xl p-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <div class="h-3 bg-muted rounded w-16" />
                        <div class="h-6 bg-muted rounded w-28" />
                    </div>
                    <div class="space-y-2">
                        <div class="h-3 bg-muted rounded w-16" />
                        <div class="h-6 bg-muted rounded w-24" />
                    </div>
                </div>
            </div>

            <!-- Debt Details -->
            <section v-if="selectedSnapshot?.simplifiedDebts.length">
                <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                    {{ t('overview.debtDetails') }}
                </h3>
                <div class="space-y-2.5">
                    <DebtSummaryCard
                        v-for="(debt, index) in selectedSnapshot.simplifiedDebts"
                        :key="index"
                        :from-user="debt.fromUser"
                        :to-user="debt.toUser"
                        :amount="debt.amount"
                        :is-current-user="
                            debt.fromUser.userId === currentUserId
                            || debt.toUser.userId === currentUserId
                        "
                        :is-debtor="debt.fromUser.userId === currentUserId"
                        @settle="handleSettle(debt)"
                    />
                </div>
            </section>

            <!-- Net Balances -->
            <section v-if="selectedSnapshot?.netBalances.length">
                <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                    {{ t('overview.memberBalances') }}
                </h3>
                <div class="glass rounded-2xl">
                    <div class="px-4 py-1">
                        <template v-for="(balance, index) in selectedSnapshot.netBalances" :key="balance.userId">
                            <div class="flex items-center gap-3 py-3">
                                <Avatar class="h-8 w-8 shrink-0">
                                    <AvatarImage :src="balance.avatarUrl ?? ''" />
                                    <AvatarFallback class="bg-brand-accent text-brand-primary text-xs font-medium">
                                        {{ getInitial(balance.displayName) }}
                                    </AvatarFallback>
                                </Avatar>
                                <div class="flex-1 min-w-0">
                                    <span class="text-sm font-medium truncate">
                                        {{ balance.displayName ?? t('common.unknown') }}
                                    </span>
                                    <span
                                        v-if="balance.userId === currentUserId"
                                        class="text-xs text-muted-foreground font-normal ml-1"
                                    >
                                        ({{ t('common.me') }})
                                    </span>
                                </div>
                                <span
                                    class="text-sm font-semibold shrink-0"
                                    :class="balanceClass(balance.netBalance)"
                                >
                                    {{ formatBalance(balance.netBalance) }}
                                </span>
                            </div>
                            <Separator v-if="index < selectedSnapshot!.netBalances.length - 1" />
                        </template>
                    </div>
                </div>
            </section>

            <!-- Settlement History -->
            <section v-if="groupStore.activeGroupId">
                <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                    {{ t('overview.settlementRecords') }}
                </h3>
                <div class="glass rounded-2xl px-4 py-2">
                    <SettlementHistory
                        ref="settlementHistoryRef"
                        :group-id="groupStore.activeGroupId"
                        @edit="(item) => {
                            settleTargetUser = item.paidTo
                            settleSuggestedAmount = item.amount
                            settleYearMonth = null
                            editSettlementId = item.id
                            editNotes = item.notes ?? null
                            isSettleDrawerOpen = true
                        }"
                        @changed="handleHistoryChanged"
                    />
                </div>
            </section>
        </template>

        <!-- Settlement Drawer -->
        <SettlementDrawer
            v-if="settleTargetUser && groupStore.activeGroupId"
            v-model:open="isSettleDrawerOpen"
            :group-id="groupStore.activeGroupId"
            :to-user="settleTargetUser"
            :suggested-amount="settleSuggestedAmount"
            :year-month="settleYearMonth"
            :edit-settlement-id="editSettlementId"
            :edit-notes="editNotes"
            @settled="handleSettled"
        />
    </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
