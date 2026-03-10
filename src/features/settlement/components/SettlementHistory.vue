<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle, ArrowRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/shared/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Separator } from '@/shared/components/ui/separator'
import { useSettlementStore } from '@/shared/stores'
import { useAuthStore } from '@/features/auth/stores/auth'
import { toast } from 'vue-sonner'
import type { SettlementHistoryItem } from '@/entities/settlement/types'

const { t } = useI18n()
const settlementStore = useSettlementStore()
const authStore = useAuthStore()

interface Props {
    groupId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
    edit: [item: SettlementHistoryItem]
    changed: []
}>()

const loading = ref(false)
const historyItems = ref<SettlementHistoryItem[]>([])
const deleteTarget = ref<SettlementHistoryItem | null>(null)
const isDeleteDialogOpen = ref(false)
const isDeleting = ref(false)

const currentUserId = computed(() => authStore.user?.id ?? '')

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
        month: '2-digit',
        day: '2-digit'
    })
}

const isOwnSettlement = (item: SettlementHistoryItem): boolean => {
    return item.paidBy.userId === currentUserId.value
}

const handleEdit = (item: SettlementHistoryItem) => {
    emit('edit', item)
}

const handleDeleteClick = (item: SettlementHistoryItem) => {
    deleteTarget.value = item
    isDeleteDialogOpen.value = true
}

const handleDeleteConfirm = async () => {
    if (!deleteTarget.value) return

    isDeleting.value = true
    try {
        await settlementStore.deleteSettlement(
            deleteTarget.value.id,
            props.groupId
        )
        toast.success(t('settlement.deleteSuccess'))
        isDeleteDialogOpen.value = false
        deleteTarget.value = null
        await loadHistory()
        emit('changed')
    } catch {
        toast.error(t('settlement.deleteFailed'))
    } finally {
        isDeleting.value = false
    }
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

defineExpose({ loadHistory })

onMounted(loadHistory)
</script>

<template>
    <!-- Loading skeletons -->
    <div v-if="loading" class="space-y-0">
        <div v-for="i in 3" :key="i" class="flex items-center gap-3 py-3">
            <Skeleton class="h-8 w-8 rounded-full shrink-0" />
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
        class="py-6 text-center"
    >
        <CheckCircle class="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
        <p class="text-sm text-muted-foreground">
            {{ t('settlement.noHistory') }}
        </p>
    </div>

    <!-- History list (flat, no collapsible) -->
    <div v-else class="space-y-0">
        <template v-for="(item, index) in historyItems" :key="item.id">
            <div class="flex items-start gap-3 py-3">
                <!-- Paid-by avatar -->
                <Avatar class="h-8 w-8 shrink-0">
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
                        <ArrowRight class="h-3 w-3 text-muted-foreground shrink-0" />
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

                <!-- Amount + Actions -->
                <div class="shrink-0 flex items-center gap-1">
                    <CheckCircle class="h-3.5 w-3.5 text-green-500" />
                    <span class="text-sm font-semibold text-foreground">
                        {{ formatAmount(item.amount) }}
                    </span>

                    <!-- Dropdown menu (only for own settlements) -->
                    <DropdownMenu v-if="isOwnSettlement(item)">
                        <DropdownMenuTrigger as-child>
                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-7 w-7 ml-0.5 cursor-pointer"
                            >
                                <MoreHorizontal class="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" class="w-32">
                            <DropdownMenuItem class="cursor-pointer" @click="handleEdit(item)">
                                <Pencil class="h-3.5 w-3.5 mr-2" />
                                {{ t('common.edit') }}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                class="text-destructive focus:text-destructive cursor-pointer"
                                @click="handleDeleteClick(item)"
                            >
                                <Trash2 class="h-3.5 w-3.5 mr-2" />
                                {{ t('common.delete') }}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <Separator v-if="index < historyItems.length - 1" />
        </template>
    </div>

    <!-- Delete confirmation dialog -->
    <AlertDialog v-model:open="isDeleteDialogOpen">
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{{ t('settlement.deleteConfirmTitle') }}</AlertDialogTitle>
                <AlertDialogDescription>
                    {{ t('settlement.deleteConfirmDesc') }}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel :disabled="isDeleting">
                    {{ t('common.cancel') }}
                </AlertDialogCancel>
                <AlertDialogAction
                    class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    :disabled="isDeleting"
                    @click.prevent="handleDeleteConfirm"
                >
                    {{ isDeleting ? t('common.processing') : t('common.delete') }}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
