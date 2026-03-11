<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HandCoins, CheckCircle2, Wallet } from 'lucide-vue-next'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import type { MonthlyDebtSnapshot, SimplifiedDebt } from '@/entities/settlement/types'

const { t } = useI18n()

interface Props {
    snapshot: MonthlyDebtSnapshot | null
    currentUserId: string
    isLoading: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
    settle: [debt: SimplifiedDebt]
}>()

const heroState = computed(() => {
    if (!props.snapshot) return null
    const debts = props.snapshot.simplifiedDebts

    const owes = debts.filter(d => d.fromUser.userId === props.currentUserId)
    const owed = debts.filter(d => d.toUser.userId === props.currentUserId)
    const owesTotal = owes.reduce((sum, d) => sum + d.amount, 0)
    const owedTotal = owed.reduce((sum, d) => sum + d.amount, 0)

    if (owesTotal > 0) {
        const sorted = [...owes].sort((a, b) => b.amount - a.amount)
        const primary = sorted[0]
        if (!primary) return null
        return {
            type: 'owes' as const,
            amount: owesTotal,
            partner: primary.toUser,
            primaryDebt: primary,
            count: owes.length
        }
    }

    if (owedTotal > 0) {
        const sorted = [...owed].sort((a, b) => b.amount - a.amount)
        const primary = sorted[0]
        if (!primary) return null
        return {
            type: 'owed' as const,
            amount: owedTotal,
            partner: primary.fromUser,
            primaryDebt: primary,
            count: owed.length
        }
    }

    return null
})

const isAllSettled = computed(() => {
    if (!props.snapshot) return false
    return props.snapshot.totalUnsettled === 0
})

const getInitial = (name: string | null) => name?.charAt(0).toUpperCase() ?? '?'

const formatAmount = (amount: number) => `NT$ ${Math.round(amount).toLocaleString()}`
</script>

<template>
    <!-- Loading -->
    <div v-if="isLoading" class="glass-elevated rounded-2xl p-6">
        <div class="flex items-center gap-4">
            <Skeleton class="h-14 w-14 rounded-full shrink-0" />
            <div class="flex-1 space-y-2">
                <Skeleton class="h-4 w-28" />
                <Skeleton class="h-8 w-40" />
            </div>
        </div>
        <Skeleton class="h-11 w-full mt-4 rounded-lg" />
    </div>

    <!-- User owes someone -->
    <div
        v-else-if="heroState?.type === 'owes'"
        class="relative rounded-2xl p-5 overflow-hidden border border-red-300/40 dark:border-red-700/30 bg-gradient-to-br from-red-50/90 via-background/80 to-orange-50/60 dark:from-red-950/40 dark:via-background/80 dark:to-orange-950/30"
    >
        <div class="flex items-center gap-4">
            <Avatar class="h-14 w-14 ring-2 ring-red-300/50 dark:ring-red-700/40 shrink-0">
                <AvatarImage :src="heroState.partner.avatarUrl ?? ''" />
                <AvatarFallback class="bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-lg font-semibold">
                    {{ getInitial(heroState.partner.displayName) }}
                </AvatarFallback>
            </Avatar>
            <div class="flex-1 min-w-0">
                <p class="text-sm text-red-600/80 dark:text-red-400/80 font-medium">
                    {{ t('overview.heroYouOwe', { name: heroState.partner.displayName ?? t('common.unknown') }) }}
                    <span v-if="heroState.count > 1" class="text-xs opacity-70 ml-1">
                        {{ t('overview.andMore', { count: heroState.count - 1 }) }}
                    </span>
                </p>
                <p class="text-3xl font-bold text-red-700 dark:text-red-300 tracking-tight mt-0.5">
                    {{ formatAmount(heroState.amount) }}
                </p>
            </div>
        </div>
        <Button
            class="w-full mt-4 h-11 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white font-medium press-feedback cursor-pointer"
            @click="emit('settle', heroState.primaryDebt)"
        >
            <HandCoins class="h-4 w-4 mr-2" />
            {{ t('overview.settleNow') }}
        </Button>
    </div>

    <!-- Someone owes user -->
    <div
        v-else-if="heroState?.type === 'owed'"
        class="relative rounded-2xl p-5 overflow-hidden border border-green-300/40 dark:border-green-700/30 bg-gradient-to-br from-green-50/90 via-background/80 to-emerald-50/60 dark:from-green-950/40 dark:via-background/80 dark:to-emerald-950/30"
    >
        <div class="flex items-center gap-4">
            <Avatar class="h-14 w-14 ring-2 ring-green-300/50 dark:ring-green-700/40 shrink-0">
                <AvatarImage :src="heroState.partner.avatarUrl ?? ''" />
                <AvatarFallback class="bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 text-lg font-semibold">
                    {{ getInitial(heroState.partner.displayName) }}
                </AvatarFallback>
            </Avatar>
            <div class="flex-1 min-w-0">
                <p class="text-sm text-green-600/80 dark:text-green-400/80 font-medium">
                    {{ t('overview.heroOwesYou', { name: heroState.partner.displayName ?? t('common.unknown') }) }}
                    <span v-if="heroState.count > 1" class="text-xs opacity-70 ml-1">
                        {{ t('overview.andMore', { count: heroState.count - 1 }) }}
                    </span>
                </p>
                <p class="text-3xl font-bold text-green-700 dark:text-green-300 tracking-tight mt-0.5">
                    {{ formatAmount(heroState.amount) }}
                </p>
            </div>
        </div>
    </div>

    <!-- All settled -->
    <div
        v-else-if="isAllSettled"
        class="relative rounded-2xl p-5 overflow-hidden border border-green-300/30 dark:border-green-700/20 bg-gradient-to-br from-green-50/70 via-background/80 to-teal-50/50 dark:from-green-950/30 dark:via-background/80 dark:to-teal-950/20 text-center"
    >
        <CheckCircle2 class="h-10 w-10 mx-auto text-green-500 dark:text-green-400 mb-2" />
        <p class="text-lg font-bold text-green-700 dark:text-green-300">
            {{ t('overview.allClear') }}
        </p>
        <p class="text-sm text-green-600/60 dark:text-green-400/60 mt-1">
            {{ t('overview.allClearDesc') }}
        </p>
    </div>

    <!-- No data -->
    <div
        v-else
        class="glass rounded-2xl p-6 text-center"
    >
        <Wallet class="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
        <p class="text-sm text-muted-foreground">
            {{ t('overview.noDebtsThisMonth') }}
        </p>
    </div>
</template>
