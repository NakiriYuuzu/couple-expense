<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Button } from '@/shared/components/ui/button'
import { useRecurringExpenseStore } from '@/shared/stores'
import { CategoryUtils } from '@/features/expense/composables/useCategories'
import type { RecurringExpense } from '@/entities/expense/types'
import { toast } from 'vue-sonner'
import { RefreshCw, Pencil, Trash2, RotateCcw } from 'lucide-vue-next'

const emit = defineEmits<{
    edit: [item: RecurringExpense]
}>()

const { t } = useI18n()
const recurringStore = useRecurringExpenseStore()
const { items, loading } = storeToRefs(recurringStore)

onMounted(() => {
    recurringStore.fetchAll()
})

async function handleToggle(item: RecurringExpense) {
    const ok = await recurringStore.toggleActive(item.id)
    if (ok) {
        toast.success(t('recurring.toggleSuccess'))
    } else {
        toast.error(recurringStore.error ?? t('recurring.toggleError'))
    }
}

async function handleDelete(item: RecurringExpense) {
    const ok = await recurringStore.remove(item.id)
    if (ok) {
        toast.success(t('recurring.deleteSuccess'))
    } else {
        toast.error(recurringStore.error ?? t('recurring.deleteError'))
    }
}

function formatNextDue(dateStr: string) {
    return t('recurring.nextDue', { date: dateStr })
}

function formatDueOn(day: number) {
    return t('recurring.dueOn', { day })
}
</script>

<template>
    <!-- Skeleton 載入中 -->
    <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="glass rounded-2xl p-4 flex items-center gap-3">
            <div class="h-10 w-10 bg-muted rounded-xl animate-pulse" />
            <div class="flex-1 space-y-1.5">
                <div class="h-3.5 bg-muted rounded w-28 animate-pulse" />
                <div class="h-3 bg-muted rounded w-20 animate-pulse" />
            </div>
            <div class="h-4 bg-muted rounded w-16 animate-pulse" />
        </div>
    </div>

    <!-- 列表 -->
    <div v-else-if="items.length > 0" class="space-y-3">
        <div
            v-for="item in items"
            :key="item.id"
            :class="[
                'glass rounded-2xl p-4 transition-all',
                !item.is_active && 'opacity-50'
            ]"
        >
            <div class="flex items-center gap-3">
                <!-- 類別圖示 -->
                <div
                    class="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    :style="{ background: `var(--category-${item.category}-bg, var(--category-other-bg))` }"
                >
                    <component
                        :is="CategoryUtils.getIconByKey(CategoryUtils.getIconKey(item.category))"
                        class="h-5 w-5"
                        :style="{ color: `var(--category-${item.category}, var(--category-other))` }"
                    />
                </div>

                <!-- 標題與到期資訊 -->
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-foreground truncate">{{ item.title }}</p>
                    <p class="text-xs text-muted-foreground">{{ formatDueOn(item.recurrence_day) }}</p>
                    <p class="text-xs text-muted-foreground">{{ formatNextDue(item.next_due_date) }}</p>
                </div>

                <!-- 金額 -->
                <div class="text-right shrink-0">
                    <p class="text-sm font-semibold text-foreground">NT$ {{ item.amount.toLocaleString() }}</p>
                    <p class="text-xs text-muted-foreground">{{ t('recurring.monthlyAmount') }}</p>
                </div>
            </div>

            <!-- 操作按鈕 -->
            <div class="flex items-center gap-2 mt-3 pt-3 border-t border-glass-border">
                <!-- 啟用/停用 -->
                <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-8 text-xs rounded-full press-feedback hover-transition"
                    @click="handleToggle(item)"
                >
                    <RotateCcw class="h-3.5 w-3.5 mr-1" />
                    {{ item.is_active ? t('recurring.deactivate') : t('recurring.activate') }}
                </Button>

                <!-- 編輯 -->
                <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-8 text-xs rounded-full press-feedback hover-transition"
                    @click="emit('edit', item)"
                >
                    <Pencil class="h-3.5 w-3.5 mr-1" />
                    {{ t('common.edit') }}
                </Button>

                <!-- 刪除 -->
                <Button
                    variant="ghost"
                    size="sm"
                    class="flex-1 h-8 text-xs rounded-full text-destructive hover:text-destructive press-feedback hover-transition"
                    @click="handleDelete(item)"
                >
                    <Trash2 class="h-3.5 w-3.5 mr-1" />
                    {{ t('common.delete') }}
                </Button>
            </div>
        </div>
    </div>

    <!-- 空狀態 -->
    <div v-else class="text-center py-12">
        <RefreshCw class="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p class="text-muted-foreground text-sm font-medium mb-1">{{ t('recurring.empty') }}</p>
        <p class="text-muted-foreground/70 text-xs">{{ t('recurring.emptyDesc') }}</p>
    </div>
</template>
