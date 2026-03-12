<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronUp, CircleDot, CheckCircle2, AlertCircle } from 'lucide-vue-next'
import DebtSummaryCard from '@/features/settlement/components/DebtSummaryCard.vue'
import SettlementHistory from '@/features/settlement/components/SettlementHistory.vue'
import type { MonthlyDebtSnapshot, SimplifiedDebt } from '@/entities/settlement/types'

interface Props {
    snapshot: MonthlyDebtSnapshot
    currentUserId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
    settle: [snapshot: MonthlyDebtSnapshot, debt: SimplifiedDebt]
}>()

const { t } = useI18n()
const isExpanded = ref(false)

const toggleExpand = () => {
    isExpanded.value = !isExpanded.value
}

const monthLabel = computed(() => {
    const [year, month] = props.snapshot.yearMonth.split('-')
    return `${year} 年 ${parseInt(month, 10)} 月`
})

const statusConfig = computed(() => {
    switch (props.snapshot.status) {
        case 'in_progress':
            return {
                icon: CircleDot,
                label: t('overview.inProgress'),
                class: 'text-brand-primary',
                dotClass: 'bg-brand-primary'
            }
        case 'settled':
            return {
                icon: CheckCircle2,
                label: t('overview.settled'),
                class: 'text-green-600 dark:text-green-400',
                dotClass: 'bg-green-500'
            }
        case 'partial':
            return {
                icon: AlertCircle,
                label: t('overview.partiallyUnsettled'),
                class: 'text-amber-600 dark:text-amber-400',
                dotClass: 'bg-amber-500'
            }
        default:
            return {
                icon: AlertCircle,
                label: t('overview.unsettled'),
                class: 'text-red-600 dark:text-red-400',
                dotClass: 'bg-red-500'
            }
    }
})

const formatCurrency = (val: number) => `NT$ ${Math.round(val).toLocaleString()}`

const handleSettle = (debt: SimplifiedDebt) => {
    emit('settle', props.snapshot, debt)
}
</script>

<template>
    <div class="glass rounded-2xl overflow-hidden">
        <!-- Collapsed Summary -->
        <button
            class="w-full p-4 flex items-center justify-between cursor-pointer press-feedback"
            @click="toggleExpand"
        >
            <div class="flex items-center gap-3">
                <div
                    class="w-2 h-2 rounded-full shrink-0"
                    :class="statusConfig.dotClass"
                />
                <div class="text-left">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium">{{ monthLabel }}</span>
                        <span
                            class="text-xs px-1.5 py-0.5 rounded-full"
                            :class="statusConfig.class"
                        >
                            {{ statusConfig.label }}
                        </span>
                    </div>
                    <p class="text-xs text-muted-foreground mt-0.5">
                        <template v-if="snapshot.totalUnsettled > 0">
                            {{ t('overview.totalUnsettled') }} {{ formatCurrency(snapshot.totalUnsettled) }}
                            · {{ t('overview.pendingSettlement', { count: snapshot.simplifiedDebts.length }) }}
                        </template>
                        <template v-else>
                            {{ t('balance.allSettledDesc') }}
                        </template>
                    </p>
                </div>
            </div>
            <component
                :is="isExpanded ? ChevronUp : ChevronDown"
                class="h-4 w-4 text-muted-foreground shrink-0"
            />
        </button>

        <!-- Expanded Details -->
        <Transition name="expand">
            <div v-if="isExpanded" class="border-t border-glass-border">
                <!-- Simplified Debts -->
                <div
                    v-if="snapshot.simplifiedDebts.length > 0"
                    class="p-4 space-y-3"
                >
                    <DebtSummaryCard
                        v-for="(debt, index) in snapshot.simplifiedDebts"
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

                <!-- Net Balances -->
                <div
                    v-if="snapshot.netBalances.length > 0"
                    class="px-4 pb-4"
                >
                    <h4 class="text-xs font-medium text-muted-foreground mb-2">
                        {{ t('balance.netBalances') }}
                    </h4>
                    <div class="space-y-2">
                        <div
                            v-for="balance in snapshot.netBalances"
                            :key="balance.userId"
                            class="flex items-center justify-between py-1.5"
                        >
                            <span class="text-sm">
                                {{ balance.displayName ?? t('common.unknown') }}
                                <span
                                    v-if="balance.userId === currentUserId"
                                    class="text-xs text-muted-foreground"
                                >
                                    ({{ t('common.me') }})
                                </span>
                            </span>
                            <span
                                class="text-sm font-medium"
                                :class="{
                                    'text-green-600 dark:text-green-400': balance.netBalance > 0,
                                    'text-red-600 dark:text-red-400': balance.netBalance < 0,
                                    'text-muted-foreground': balance.netBalance === 0
                                }"
                            >
                                {{ balance.netBalance > 0 ? '+' : '' }}{{ formatCurrency(balance.netBalance) }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Settlement History for this month -->
                <div class="px-4 pb-4">
                    <SettlementHistory
                        v-if="snapshot.groupId"
                        :group-id="snapshot.groupId"
                    />
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
    transition: all 0.2s ease-out;
    overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
    opacity: 0;
    max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
    opacity: 1;
    max-height: 2000px;
}

@media (prefers-reduced-motion: reduce) {
    .expand-enter-active,
    .expand-leave-active {
        transition: none;
    }
}
</style>
