<template>
    <div class="space-y-4">
        <!-- Split method selector -->
        <div class="space-y-2">
            <label class="text-sm font-medium text-foreground">
                {{ t('split.splitMethod') }}
            </label>
            <div class="grid grid-cols-4 gap-1.5 p-1 bg-muted/40 rounded-xl">
                <button
                    v-for="method in splitMethods"
                    :key="method.value"
                    type="button"
                    @click="onSplitMethodChange(method.value)"
                    :class="[
                        'flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs font-medium transition-all duration-200',
                        splitMethod === method.value
                            ? 'bg-brand-primary text-brand-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    ]"
                >
                    <component :is="method.icon" class="h-4 w-4" />
                    {{ method.label }}
                </button>
            </div>
            <p class="text-xs text-muted-foreground">
                {{ currentMethodDescription }}
            </p>
        </div>

        <!-- Paid by selector -->
        <div class="space-y-2">
            <label class="text-sm font-medium text-foreground">
                {{ t('split.paidBy') }}
            </label>
            <div class="flex flex-wrap gap-2">
                <button
                    v-for="p in participantsWithProfiles"
                    :key="p.userId"
                    type="button"
                    @click="onPaidByChange(p.userId)"
                    :class="[
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all duration-200',
                        paidBy === p.userId
                            ? 'border-brand-primary bg-brand-accent text-brand-primary font-medium'
                            : 'border-border text-muted-foreground hover:border-brand-primary hover:text-foreground'
                    ]"
                >
                    <Avatar class="h-5 w-5">
                        <AvatarImage :src="p.avatarUrl || ''" />
                        <AvatarFallback class="text-[10px] bg-brand-accent text-brand-primary">
                            {{ p.displayName?.charAt(0) || '?' }}
                        </AvatarFallback>
                    </Avatar>
                    {{ p.displayName || t('common.unknown') }}
                    <Check v-if="paidBy === p.userId" class="h-3.5 w-3.5" />
                </button>
            </div>
        </div>

        <!-- Participants list with amount inputs -->
        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-foreground">
                    {{ t('split.participants') }}
                </label>
                <span class="text-xs text-muted-foreground">
                    {{ includedCount }} {{ t('split.people') }}
                </span>
            </div>

            <div class="space-y-2">
                <div
                    v-for="(p, index) in localParticipants"
                    :key="p.userId"
                    :class="[
                        'flex items-center gap-3 p-3 rounded-lg border transition-all duration-200',
                        p.isIncluded
                            ? 'border-border bg-background'
                            : 'border-border/50 bg-muted/20 opacity-60'
                    ]"
                >
                    <!-- Checkbox -->
                    <Checkbox
                        :checked="p.isIncluded"
                        @update:checked="(v) => toggleParticipant(index, v)"
                        class="data-[state=checked]:bg-brand-primary data-[state=checked]:border-brand-primary"
                    />

                    <!-- Avatar + name -->
                    <Avatar class="h-8 w-8 shrink-0">
                        <AvatarImage :src="p.avatarUrl || ''" />
                        <AvatarFallback class="text-xs bg-brand-accent text-brand-primary">
                            {{ p.displayName?.charAt(0) || '?' }}
                        </AvatarFallback>
                    </Avatar>
                    <span class="text-sm font-medium flex-1 truncate">
                        {{ p.displayName || t('common.unknown') }}
                    </span>

                    <!-- Amount/input area -->
                    <div class="flex items-center gap-1 shrink-0">
                        <!-- Equal: show computed amount, read-only -->
                        <template v-if="splitMethod === 'equal'">
                            <span class="text-sm font-semibold text-foreground min-w-[60px] text-right">
                                NT${{ formatAmount(getCalculatedAmount(p.userId)) }}
                            </span>
                        </template>

                        <!-- Exact: editable NT$ amount -->
                        <template v-else-if="splitMethod === 'exact'">
                            <span class="text-xs text-muted-foreground">NT$</span>
                            <input
                                type="number"
                                inputmode="decimal"
                                :value="p.amount ? p.amount : ''"
                                :disabled="!p.isIncluded"
                                placeholder="0"
                                @focus="handleNumericFocus"
                                @input="updateExactAmount(index, $event)"
                                class="w-20 h-8 text-right text-sm border border-border rounded-md px-2 bg-background focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-40"
                                min="0"
                                step="1"
                            />
                        </template>

                        <!-- Percentage: editable %, show computed NT$ -->
                        <template v-else-if="splitMethod === 'percentage'">
                            <input
                                type="number"
                                inputmode="decimal"
                                :value="p.percentage ? p.percentage : ''"
                                :disabled="!p.isIncluded"
                                placeholder="0"
                                @focus="handleNumericFocus"
                                @input="updatePercentage(index, $event)"
                                class="w-16 h-8 text-right text-sm border border-border rounded-md px-2 bg-background focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-40"
                                min="0"
                                max="100"
                                step="1"
                            />
                            <span class="text-xs text-muted-foreground">%</span>
                            <span class="text-xs text-muted-foreground ml-1">
                                ≈NT${{ formatAmount(getCalculatedAmount(p.userId)) }}
                            </span>
                        </template>

                        <!-- Shares: editable share count, show computed NT$ -->
                        <template v-else-if="splitMethod === 'shares'">
                            <input
                                type="number"
                                inputmode="numeric"
                                :value="p.shares ?? 1"
                                :disabled="!p.isIncluded"
                                @focus="handleNumericFocus"
                                @input="updateShares(index, $event)"
                                class="w-14 h-8 text-right text-sm border border-border rounded-md px-2 bg-background focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-40"
                                min="1"
                                step="1"
                            />
                            <span class="text-xs text-muted-foreground">{{ t('split.shares') }}</span>
                            <span class="text-xs text-muted-foreground ml-1">
                                ≈NT${{ formatAmount(getCalculatedAmount(p.userId)) }}
                            </span>
                        </template>
                    </div>
                </div>
            </div>
        </div>

        <!-- Balance summary -->
        <div
            :class="[
                'flex items-center justify-between p-3 rounded-lg border text-sm font-medium transition-all duration-200',
                isBalanced
                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                    : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
            ]"
        >
            <div class="flex items-center gap-2">
                <component
                    :is="isBalanced ? CheckCircle2 : AlertCircle"
                    :class="[
                        'h-4 w-4',
                        isBalanced ? 'text-green-600' : 'text-amber-500'
                    ]"
                />
                <span :class="isBalanced ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'">
                    {{ isBalanced ? t('split.balanced') : t('split.notBalanced') }}
                </span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-muted-foreground text-xs">
                    {{ t('split.total') }}: NT${{ formatAmount(splitTotal) }}
                </span>
                <span
                    v-if="!isBalanced"
                    class="text-amber-600 dark:text-amber-400 text-xs"
                >
                    {{ remainingAmount > 0 ? '+' : '' }}NT${{ formatAmount(remainingAmount) }}
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Equal, DollarSign, Percent, Hash, Check, CheckCircle2, AlertCircle } from 'lucide-vue-next'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { useGroupStore } from '@/features/group/stores/group'
import { useSplitCalculation } from '@/features/split/composables/useSplitCalculation'
import { supabase } from '@/shared/lib/supabase'
import type { SplitMethod, GroupMemberRow } from '@/shared/lib/database.types'
import type { SplitParticipant } from '@/entities/split/types'

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

interface Props {
    totalAmount: number
    groupId: string
    paidBy: string
    splitMethod: SplitMethod
    participants: SplitParticipant[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
    (e: 'update:paidBy', value: string): void
    (e: 'update:splitMethod', value: SplitMethod): void
    (e: 'update:participants', value: SplitParticipant[]): void
}>()

const { t } = useI18n()
const groupStore = useGroupStore()

// ---------------------------------------------------------------------------
// Split method options
// ---------------------------------------------------------------------------

const splitMethods = computed(() => [
    { value: 'equal' as SplitMethod, label: t('split.equal'), icon: Equal },
    { value: 'exact' as SplitMethod, label: t('split.exact'), icon: DollarSign },
    { value: 'percentage' as SplitMethod, label: t('split.percentage'), icon: Percent },
    { value: 'shares' as SplitMethod, label: t('split.shares'), icon: Hash }
])

const currentMethodDescription = computed(() => {
    const key = `split.${props.splitMethod}Desc` as const
    return t(key)
})

// ---------------------------------------------------------------------------
// Local mutable copy of participants
// ---------------------------------------------------------------------------

const localParticipants = ref<SplitParticipant[]>(props.participants.length > 0
    ? [...props.participants]
    : []
)

// Keep local in sync with parent prop when parent resets
watch(() => props.participants, (incoming) => {
    if (incoming.length > 0 && localParticipants.value.length === 0) {
        localParticipants.value = [...incoming]
    }
}, { deep: true })

// ---------------------------------------------------------------------------
// User profile cache for display names / avatars
// ---------------------------------------------------------------------------

interface ProfileCache {
    [userId: string]: { displayName: string | null; avatarUrl: string | null }
}

const profileCache = ref<ProfileCache>({})

const loadProfiles = async (members: GroupMemberRow[]) => {
    const unresolved = members
        .map(m => m.user_id)
        .filter(id => !(id in profileCache.value))

    if (unresolved.length === 0) return

    const { data } = await supabase
        .from('user_profiles')
        .select('id, display_name, avatar_url')
        .in('id', unresolved)

    const updates: ProfileCache = {}
    for (const row of data ?? []) {
        updates[row.id] = {
            displayName: row.display_name ?? null,
            avatarUrl: row.avatar_url ?? null
        }
    }
    profileCache.value = { ...profileCache.value, ...updates }
}

// Build initial participant list from group members when groupId changes or on mount
const initParticipants = async () => {
    const members = groupStore.membersByGroup[props.groupId] ?? []
    await loadProfiles(members)

    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData.user?.id ?? ''

    // If parent already provided participants, just enrich profile info
    if (props.participants.length > 0) {
        const enriched = props.participants.map(p => ({
            ...p,
            displayName: profileCache.value[p.userId]?.displayName ?? p.displayName,
            avatarUrl: profileCache.value[p.userId]?.avatarUrl ?? p.avatarUrl
        }))
        localParticipants.value = enriched
        return
    }

    // Build from scratch using group members
    const built: SplitParticipant[] = members.map(m => {
        const profile = profileCache.value[m.user_id]
        return {
            userId: m.user_id,
            displayName: profile?.displayName ?? null,
            avatarUrl: profile?.avatarUrl ?? null,
            amount: 0,
            percentage: Math.round((100 / members.length) * 100) / 100,
            shares: 1,
            isIncluded: true
        }
    })

    // Default paidBy to current user if not set
    if (!props.paidBy && currentUserId) {
        emit('update:paidBy', currentUserId)
    }

    localParticipants.value = built
    emit('update:participants', built)
}

watch(() => props.groupId, () => initParticipants(), { immediate: true })

// ---------------------------------------------------------------------------
// Participants with profiles (for "paid by" selector)
// ---------------------------------------------------------------------------

const participantsWithProfiles = computed(() =>
    localParticipants.value.filter(p => p.isIncluded)
)

const includedCount = computed(() =>
    localParticipants.value.filter(p => p.isIncluded).length
)

// ---------------------------------------------------------------------------
// Split calculation
// ---------------------------------------------------------------------------

const totalAmountRef = computed(() => props.totalAmount)
const splitMethodRef = computed(() => props.splitMethod)

const { calculatedSplits, splitTotal, isBalanced, remainingAmount } = useSplitCalculation(
    totalAmountRef,
    localParticipants,
    splitMethodRef
)

const getCalculatedAmount = (userId: string): number => {
    const found = calculatedSplits.value.find(p => p.userId === userId)
    return found?.amount ?? 0
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

const onSplitMethodChange = (method: SplitMethod) => {
    emit('update:splitMethod', method)

    // Reset per-person inputs to sensible defaults when method changes
    const included = localParticipants.value.filter(p => p.isIncluded)
    const defaultPct = included.length > 0
        ? Math.round((100 / included.length) * 100) / 100
        : 0

    const updated = localParticipants.value.map(p => ({
        ...p,
        percentage: p.isIncluded ? defaultPct : (p.percentage ?? 0),
        shares: p.shares ?? 1
    }))
    localParticipants.value = updated
    emit('update:participants', updated)
}

const onPaidByChange = (userId: string) => {
    emit('update:paidBy', userId)
}

const toggleParticipant = (index: number, included: boolean | 'indeterminate') => {
    const isIncluded = included === true
    const updated = localParticipants.value.map((p, i) =>
        i === index ? { ...p, isIncluded } : p
    )
    localParticipants.value = updated
    emit('update:participants', updated)
}

// Select-on-focus so users can type a new value directly without first
// clearing the existing default (e.g., 0 / 1).
const handleNumericFocus = (event: FocusEvent) => {
    const target = event.target as HTMLInputElement | null
    target?.select()
}

const updateExactAmount = (index: number, event: Event) => {
    const value = parseFloat((event.target as HTMLInputElement).value) || 0
    const updated = localParticipants.value.map((p, i) =>
        i === index ? { ...p, amount: value } : p
    )
    localParticipants.value = updated
    emit('update:participants', updated)
}

const updatePercentage = (index: number, event: Event) => {
    const value = parseFloat((event.target as HTMLInputElement).value) || 0
    const updated = localParticipants.value.map((p, i) =>
        i === index ? { ...p, percentage: value } : p
    )
    localParticipants.value = updated
    emit('update:participants', updated)
}

const updateShares = (index: number, event: Event) => {
    const value = parseInt((event.target as HTMLInputElement).value) || 1
    const updated = localParticipants.value.map((p, i) =>
        i === index ? { ...p, shares: value } : p
    )
    localParticipants.value = updated
    emit('update:participants', updated)
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const formatAmount = (amount: number): string =>
    amount.toFixed(0)

// ---------------------------------------------------------------------------
// Expose validation for parent
// ---------------------------------------------------------------------------

defineExpose({ isBalanced, splitTotal, calculatedSplits })
</script>

<style scoped>
</style>
