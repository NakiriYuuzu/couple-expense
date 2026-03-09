<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { History, ChevronDown, ChevronUp, CheckCircle, ArrowRight } from 'lucide-vue-next'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from '@/shared/components/ui/collapsible'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Separator } from '@/shared/components/ui/separator'
import { useSettlementStore } from '@/features/settlement/stores/settlement'
import type { SettlementHistoryItem } from '@/entities/settlement/types'

const { t } = useI18n()
const settlementStore = useSettlementStore()

interface Props {
    groupId: string
}

const props = defineProps<Props>()

const isOpen = ref(false)
const loading = ref(false)
const historyItems = ref<SettlementHistoryItem[]>([])

const getInitial = (displayName: string | null): string => {
    if (!displayName) return '?'
    return displayName.charAt(0).toUpperCase()
}

const formatAmount = (amount: number): string => {
    return `NT$ ${Math.abs(amount).toLocaleString()}`
}

const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
}

const loadHistory = async () => {
    if (loading.value) return

    loading.value = true
    try {
        await settlementStore.fetchSettlementHistory(props.groupId)
        historyItems.value = await settlementStore.getSettlementHistory()
    } finally {
        loading.value = false
    }
}

onMounted(loadHistory)
</script>

<template>
    <Collapsible v-model:open="isOpen" class="space-y-0">
        <!-- Section header / trigger -->
        <CollapsibleTrigger as-child>
            <button
                type="button"
                class="flex w-full items-center justify-between py-3 px-1 text-left transition-colors hover:text-brand-primary"
            >
                <div class="flex items-center gap-2">
                    <History class="h-4 w-4 text-muted-foreground" />
                    <span class="text-sm font-medium text-foreground">
                        {{ t('settlement.history') }}
                    </span>
                    <span
                        v-if="historyItems.length > 0"
                        class="text-xs text-muted-foreground"
                    >
                        ({{ historyItems.length }})
                    </span>
                </div>
                <ChevronDown
                    v-if="!isOpen"
                    class="h-4 w-4 text-muted-foreground transition-transform"
                />
                <ChevronUp
                    v-else
                    class="h-4 w-4 text-muted-foreground transition-transform"
                />
            </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
            <!-- Loading skeletons -->
            <div v-if="loading" class="space-y-3 pt-2">
                <div v-for="i in 3" :key="i" class="flex items-center gap-3 py-3">
                    <Skeleton class="h-8 w-8 rounded-full" />
                    <div class="flex-1 space-y-1.5">
                        <Skeleton class="h-3.5 w-3/4" />
                        <Skeleton class="h-3 w-1/3" />
                    </div>
                    <Skeleton class="h-4 w-16" />
                </div>
            </div>

            <!-- Empty state -->
            <div
                v-else-if="historyItems.length === 0"
                class="py-8 text-center"
            >
                <CheckCircle class="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p class="text-sm text-muted-foreground">
                    {{ t('settlement.noHistory') }}
                </p>
            </div>

            <!-- History timeline -->
            <div v-else class="pt-2 space-y-0">
                <template v-for="(item, index) in historyItems" :key="item.id">
                    <div class="flex items-start gap-3 py-3">
                        <!-- Paid-by avatar -->
                        <Avatar class="h-8 w-8 flex-shrink-0">
                            <AvatarImage :src="item.paidBy.avatarUrl || ''" />
                            <AvatarFallback class="bg-brand-accent text-brand-primary text-xs font-medium">
                                {{ getInitial(item.paidBy.displayName) }}
                            </AvatarFallback>
                        </Avatar>

                        <!-- Content -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1 flex-wrap">
                                <span class="text-sm font-medium truncate">
                                    {{ item.paidBy.displayName || t('common.unknown') }}
                                </span>
                                <ArrowRight class="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span class="text-sm font-medium truncate">
                                    {{ item.paidTo.displayName || t('common.unknown') }}
                                </span>
                            </div>
                            <div class="flex items-center gap-2 mt-0.5">
                                <span class="text-xs text-muted-foreground">
                                    {{ formatDate(item.settledAt) }}
                                </span>
                                <span
                                    v-if="item.notes"
                                    class="text-xs text-muted-foreground truncate max-w-[150px]"
                                >
                                    · {{ item.notes }}
                                </span>
                            </div>
                        </div>

                        <!-- Amount -->
                        <div class="flex-shrink-0 flex items-center gap-1.5">
                            <CheckCircle class="h-3.5 w-3.5 text-green-500" />
                            <span class="text-sm font-semibold text-foreground">
                                {{ formatAmount(item.amount) }}
                            </span>
                        </div>
                    </div>

                    <Separator v-if="index < historyItems.length - 1" />
                </template>
            </div>
        </CollapsibleContent>
    </Collapsible>
</template>
