<template>
    <Drawer v-model:open="isOpen">
        <DrawerContent class="max-h-[90vh] flex flex-col bg-card !border-0 !border-t border-glass-border-strong">

            <!-- Header -->
            <DrawerHeader class="text-center pb-2 shrink-0">
                <DrawerTitle class="text-xl font-semibold text-foreground">
                    {{ isEdit ? t('recurring.edit') : t('recurring.add') }}
                </DrawerTitle>
                <DrawerDescription class="text-xs text-muted-foreground mt-1">
                    {{ t('recurring.emptyDesc') }}
                </DrawerDescription>
            </DrawerHeader>

            <!-- Form content (scrollable) -->
            <div class="flex-1 overflow-y-auto px-4">
                <form class="space-y-4 pb-4 pt-2" @submit.prevent="handleSubmit">

                    <!-- Title -->
                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-foreground">
                            {{ t('expense.title') }}
                        </label>
                        <Input
                            v-model="form.title"
                            :placeholder="t('expense.titlePlaceholder')"
                            class="h-12"
                            autocomplete="off"
                        />
                    </div>

                    <!-- Amount -->
                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-foreground">
                            {{ t('expense.amount') }} (NT$)
                        </label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                                NT$
                            </span>
                            <Input
                                v-model="form.amount"
                                type="number"
                                min="0"
                                step="1"
                                placeholder="0"
                                class="h-12 pl-10"
                            />
                        </div>
                    </div>

                    <!-- Category grid -->
                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-foreground">
                            {{ t('expense.category') }}
                        </label>
                        <div class="grid grid-cols-3 gap-2.5">
                            <button
                                v-for="cat in categories"
                                :key="cat.id"
                                type="button"
                                @click="form.category = cat.id as CategoryId"
                                :class="[
                                    'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 press-feedback',
                                    form.category === cat.id
                                        ? 'glass-heavy'
                                        : 'border-transparent glass-light hover:glass'
                                ]"
                                :style="form.category === cat.id
                                    ? { borderColor: 'var(--category-' + cat.id + ')' }
                                    : undefined
                                "
                            >
                                <div
                                    class="flex h-10 w-10 items-center justify-center rounded-xl"
                                    :style="form.category === cat.id
                                        ? { backgroundColor: 'var(--category-' + cat.id + ')' }
                                        : { backgroundColor: 'var(--category-' + cat.id + '-bg)' }
                                    "
                                >
                                    <component
                                        :is="CategoryUtils.getIconByKey(cat.iconKey)"
                                        class="h-5 w-5"
                                        :style="form.category === cat.id
                                            ? { color: 'white' }
                                            : { color: 'var(--category-' + cat.id + ')' }
                                        "
                                    />
                                </div>
                                <span class="text-xs font-medium text-foreground leading-tight text-center">
                                    {{ cat.name }}
                                </span>
                            </button>
                        </div>
                    </div>

                    <!-- Recurrence day -->
                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-foreground">
                            {{ t('recurring.recurrenceDay') }}
                        </label>
                        <Input
                            v-model="form.recurrence_day"
                            type="number"
                            min="1"
                            max="31"
                            :placeholder="t('recurring.recurrenceDayPlaceholder')"
                            class="h-12"
                        />
                        <p v-if="nextDueDatePreview" class="text-xs text-muted-foreground">
                            {{ t('recurring.nextDueDate') }}：{{ nextDueDatePreview }}
                        </p>
                    </div>

                    <!-- Notes -->
                    <div class="space-y-1.5">
                        <label class="text-sm font-medium text-foreground">
                            {{ t('expense.notes') }}
                            <span class="text-muted-foreground text-xs">({{ t('common.optional') }})</span>
                        </label>
                        <Input
                            v-model="form.notes"
                            :placeholder="t('expense.notesPlaceholder')"
                            class="h-12"
                        />
                    </div>
                </form>
            </div>

            <!-- Footer actions (fixed at bottom) -->
            <div class="px-4 py-4 bg-card border-t border-border shrink-0">
                <div class="flex gap-3">
                    <Button
                        variant="outline"
                        class="flex-1 h-12 text-foreground border-border hover:bg-accent"
                        type="button"
                        @click="isOpen = false"
                    >
                        {{ t('common.cancel') }}
                    </Button>
                    <Button
                        :disabled="!isValid || isSubmitting"
                        class="flex-1 h-12 bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground disabled:opacity-50 press-feedback"
                        type="button"
                        @click="handleSubmit"
                    >
                        {{ isSubmitting ? t('common.saving') : t('common.save') }}
                    </Button>
                </div>
            </div>

        </DrawerContent>
    </Drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription
} from '@/shared/components/ui/drawer'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useRecurringExpenseStore } from '@/shared/stores'
import { useCategories, CategoryUtils } from '@/features/expense/composables/useCategories'
import type { RecurringExpense, CreateRecurringExpenseData, UpdateRecurringExpenseData } from '@/entities/expense/types'
import type { CategoryId } from '@/entities/expense/types'
import { toast } from 'vue-sonner'

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const props = defineProps<{
    open: boolean
    editItem?: RecurringExpense | null
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    saved: []
}>()

// ---------------------------------------------------------------------------
// i18n + stores + composables
// ---------------------------------------------------------------------------

const { t } = useI18n()
const recurringStore = useRecurringExpenseStore()
const { categories } = useCategories()

// ---------------------------------------------------------------------------
// Drawer open state
// ---------------------------------------------------------------------------

const isOpen = computed({
    get: () => props.open,
    set: (v) => emit('update:open', v)
})

const isEdit = computed(() => !!props.editItem)

// ---------------------------------------------------------------------------
// Form data
// ---------------------------------------------------------------------------

const form = ref({
    title: '',
    amount: '',
    category: 'other' as CategoryId,
    recurrence_day: '',
    notes: ''
})

const isSubmitting = ref(false)

// ---------------------------------------------------------------------------
// Auto-calculate next_due_date from recurrence_day
// ---------------------------------------------------------------------------

function formatLocalDate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function computeNextDueDate(day: number): string {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()

    const daysInThisMonth = new Date(year, month + 1, 0).getDate()
    const clampedDay = Math.min(day, daysInThisMonth)
    const thisMonthDate = new Date(year, month, clampedDay)

    if (thisMonthDate > today) {
        return formatLocalDate(thisMonthDate)
    }

    const nextMonth = month + 1
    const nextYear = nextMonth > 11 ? year + 1 : year
    const normalizedMonth = nextMonth > 11 ? 0 : nextMonth
    const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate()
    const clampedNextDay = Math.min(day, daysInNextMonth)
    const nextMonthDate = new Date(nextYear, normalizedMonth, clampedNextDay)
    return formatLocalDate(nextMonthDate)
}

const nextDueDatePreview = computed(() => {
    const day = parseInt(form.value.recurrence_day)
    if (isNaN(day) || day < 1 || day > 31) return ''
    const dateStr = computeNextDueDate(day)
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isValid = computed(() => {
    const day = parseInt(form.value.recurrence_day)
    return (
        form.value.title.trim() !== ''
        && parseFloat(form.value.amount) > 0
        && !isNaN(day) && day >= 1 && day <= 31
    )
})

// ---------------------------------------------------------------------------
// Form reset
// ---------------------------------------------------------------------------

function resetForm() {
    const today = new Date()
    form.value = {
        title: '',
        amount: '',
        category: 'other',
        recurrence_day: String(today.getDate()),
        notes: ''
    }
}

// ---------------------------------------------------------------------------
// Lifecycle watchers
// ---------------------------------------------------------------------------

watch(() => props.editItem, (item) => {
    if (item) {
        form.value = {
            title: item.title,
            amount: String(item.amount),
            category: item.category,
            recurrence_day: String(item.recurrence_day),
            notes: item.notes ?? ''
        }
    } else {
        resetForm()
    }
}, { immediate: true })

watch(() => props.open, (open) => {
    if (open && !props.editItem) {
        resetForm()
    }
})

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

async function handleSubmit() {
    if (!isValid.value || isSubmitting.value) return
    isSubmitting.value = true

    const day = parseInt(form.value.recurrence_day)
    const nextDueDate = computeNextDueDate(day)

    try {
        if (isEdit.value && props.editItem) {
            const payload: UpdateRecurringExpenseData = {
                title: form.value.title.trim(),
                amount: parseFloat(form.value.amount),
                category: form.value.category,
                recurrence_day: day,
                next_due_date: nextDueDate,
                notes: form.value.notes.trim() || undefined
            }
            const ok = await recurringStore.update(props.editItem.id, payload)
            if (ok) {
                toast.success(t('recurring.updateSuccess'))
                emit('saved')
                isOpen.value = false
            } else {
                toast.error(recurringStore.error ?? t('recurring.updateError'))
            }
        } else {
            const payload: CreateRecurringExpenseData = {
                title: form.value.title.trim(),
                amount: parseFloat(form.value.amount),
                category: form.value.category,
                recurrence_day: day,
                next_due_date: nextDueDate,
                notes: form.value.notes.trim() || undefined
            }
            const created = await recurringStore.create(payload)
            if (created) {
                toast.success(t('recurring.createSuccess'))
                emit('saved')
                isOpen.value = false
            } else {
                toast.error(recurringStore.error ?? t('recurring.createError'))
            }
        }
    } finally {
        isSubmitting.value = false
    }
}
</script>
