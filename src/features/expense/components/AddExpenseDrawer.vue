<template>
    <Drawer v-model:open="isOpen">
        <DrawerContent class="max-h-[90vh] flex flex-col">

            <!-- Header -->
            <DrawerHeader class="text-center pb-2 shrink-0">
                <DrawerTitle class="text-xl font-semibold text-foreground">
                    {{ t('expense.addExpense') }}
                </DrawerTitle>
                <!-- Step indicator -->
                <div class="flex items-center justify-center gap-2 mt-2">
                    <div
                        v-for="step in totalSteps"
                        :key="step"
                        :class="[
                            'h-1.5 rounded-full transition-all duration-300',
                            step === currentStep
                                ? 'w-8 bg-brand-primary'
                                : step < currentStep
                                    ? 'w-4 bg-brand-primary/50'
                                    : 'w-4 bg-muted'
                        ]"
                    />
                </div>
                <DrawerDescription class="text-xs text-muted-foreground mt-1">
                    {{ t('expense.step') }} {{ currentStep }} / {{ totalSteps }} —
                    {{ currentStep === 1 ? t('expense.stepExpenseInfo') : t('split.stepSplitConfig') }}
                </DrawerDescription>
            </DrawerHeader>

            <!-- Step content (scrollable) -->
            <div class="flex-1 overflow-y-auto px-4">

                <!-- ========================================================
                     Step 1: Expense Info
                     ======================================================== -->
                <Transition name="step-fade" mode="out-in">
                    <form
                        v-if="currentStep === 1"
                        key="step1"
                        @submit.prevent="handleStep1Next"
                        class="space-y-4 pb-4 pt-2"
                    >
                        <!-- Title -->
                        <div class="space-y-1.5">
                            <label for="title" class="text-sm font-medium text-foreground">
                                {{ t('expense.title') }}
                            </label>
                            <Input
                                id="title"
                                v-model="formData.title"
                                :placeholder="t('expense.titlePlaceholder')"
                                class="h-12"
                                required
                                autocomplete="off"
                            />
                        </div>

                        <!-- Amount -->
                        <div class="space-y-1.5">
                            <label for="amount" class="text-sm font-medium text-foreground">
                                {{ t('expense.amount') }} (NT$)
                            </label>
                            <div class="relative">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                                    NT$
                                </span>
                                <Input
                                    id="amount"
                                    v-model="formData.amount"
                                    type="number"
                                    placeholder="0"
                                    class="h-12 pl-10"
                                    min="0"
                                    step="1"
                                    required
                                />
                            </div>
                        </div>

                        <!-- Context selector (personal vs group) -->
                        <div v-if="groupStore.isInAnyGroup" class="space-y-1.5">
                            <label class="text-sm font-medium text-foreground">
                                {{ t('expense.context') }}
                            </label>
                            <div class="flex gap-2 p-1 rounded-xl border border-border bg-muted/30">
                                <!-- Personal option -->
                                <button
                                    type="button"
                                    @click="selectContext(null)"
                                    :class="[
                                        'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200',
                                        formData.groupId === null
                                            ? 'bg-brand-primary text-brand-primary-foreground shadow-sm'
                                            : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                                    ]"
                                >
                                    <User class="h-4 w-4" />
                                    {{ t('expense.personal') }}
                                </button>
                                <!-- Group options -->
                                <button
                                    v-for="group in groupStore.groups"
                                    :key="group.id"
                                    type="button"
                                    @click="selectContext(group.id)"
                                    :class="[
                                        'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 truncate',
                                        formData.groupId === group.id
                                            ? 'bg-brand-primary text-brand-primary-foreground shadow-sm'
                                            : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                                    ]"
                                >
                                    <Users class="h-4 w-4 shrink-0" />
                                    <span class="truncate">{{ group.name }}</span>
                                </button>
                            </div>
                            <p class="text-xs text-muted-foreground">
                                {{ formData.groupId === null ? t('expense.personalDesc') : t('expense.groupDesc') }}
                            </p>
                        </div>

                        <!-- Category grid -->
                        <div class="space-y-1.5">
                            <label class="text-sm font-medium text-foreground">
                                {{ t('expense.category') }}
                            </label>
                            <div class="grid grid-cols-3 gap-2.5">
                                <button
                                    v-for="category in categories"
                                    :key="category.id"
                                    type="button"
                                    @click="formData.category = category.id"
                                    :class="[
                                        'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200',
                                        formData.category === category.id
                                            ? 'border-brand-primary bg-brand-accent'
                                            : 'border-border bg-background hover:border-brand-primary/50 hover:bg-brand-accent/50'
                                    ]"
                                >
                                    <div
                                        :class="[
                                            'flex h-10 w-10 items-center justify-center rounded-xl',
                                            formData.category === category.id
                                                ? 'bg-brand-primary'
                                                : 'bg-brand-accent'
                                        ]"
                                    >
                                        <component
                                            :is="category.icon"
                                            :class="[
                                                'h-5 w-5',
                                                formData.category === category.id
                                                    ? 'text-brand-primary-foreground'
                                                    : 'text-brand-primary'
                                            ]"
                                        />
                                    </div>
                                    <span class="text-xs font-medium text-foreground leading-tight text-center">
                                        {{ category.name }}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <!-- Date picker -->
                        <div class="space-y-1.5">
                            <label class="text-sm font-medium text-foreground">
                                {{ t('expense.date') }}
                            </label>
                            <Button
                                variant="outline"
                                type="button"
                                @click="showCalendar = !showCalendar"
                                :class="[
                                    'w-full h-12 justify-start text-left font-normal',
                                    !formData.date && 'text-muted-foreground'
                                ]"
                            >
                                <CalendarIcon class="mr-2 h-4 w-4 text-muted-foreground" />
                                {{ formData.date ? formatDate(formData.date) : t('home.selectDate') }}
                                <ChevronDown
                                    :class="[
                                        'ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200',
                                        showCalendar && 'rotate-180'
                                    ]"
                                />
                            </Button>
                            <div
                                v-show="showCalendar"
                                class="rounded-xl border border-border bg-background p-1 animate-in fade-in-0 zoom-in-95"
                            >
                                <Calendar
                                    v-model="selectedDate"
                                    :default-placeholder="defaultPlaceholder"
                                    weekday-format="short"
                                    class="**:data-[slot=calendar-cell-trigger]:size-12!"
                                    @update:model-value="(val) => { handleDateSelect(val); showCalendar = false }"
                                />
                            </div>
                        </div>
                    </form>

                    <!-- ========================================================
                         Step 2: Split Configuration
                         ======================================================== -->
                    <div
                        v-else-if="currentStep === 2"
                        key="step2"
                        class="space-y-1 pb-4 pt-2"
                    >
                        <!-- Expense summary pill -->
                        <div class="flex items-center justify-between p-3 rounded-xl bg-brand-accent border border-brand-primary/20 mb-4">
                            <div class="flex items-center gap-2">
                                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary">
                                    <component
                                        :is="selectedCategoryIcon"
                                        class="h-4 w-4 text-brand-primary-foreground"
                                    />
                                </div>
                                <div>
                                    <p class="text-sm font-semibold text-foreground leading-tight">
                                        {{ formData.title }}
                                    </p>
                                    <p class="text-xs text-muted-foreground">
                                        {{ formatDate(formData.date) }}
                                    </p>
                                </div>
                            </div>
                            <span class="text-lg font-bold text-brand-primary">
                                NT${{ formData.amount }}
                            </span>
                        </div>

                        <!-- SplitConfigurator -->
                        <SplitConfigurator
                            ref="splitConfiguratorRef"
                            :total-amount="totalAmount"
                            :group-id="formData.groupId!"
                            v-model:paid-by="splitData.paidBy"
                            v-model:split-method="splitData.splitMethod"
                            v-model:participants="splitData.participants"
                        />
                    </div>
                </Transition>
            </div>

            <!-- Footer actions (fixed at bottom) -->
            <div class="px-4 py-4 border-t border-border bg-background shrink-0">
                <div class="flex gap-3">
                    <!-- Cancel / Back -->
                    <template v-if="currentStep === 1">
                        <DrawerClose as-child>
                            <Button
                                variant="outline"
                                class="flex-1 h-12 text-foreground border-border hover:bg-accent"
                                type="button"
                            >
                                {{ t('common.cancel') }}
                            </Button>
                        </DrawerClose>
                    </template>
                    <template v-else>
                        <Button
                            variant="outline"
                            class="flex-1 h-12 text-foreground border-border hover:bg-accent"
                            type="button"
                            @click="currentStep = 1"
                        >
                            <ChevronLeft class="h-4 w-4 mr-1" />
                            {{ t('common.back') }}
                        </Button>
                    </template>

                    <!-- Next / Submit -->
                    <Button
                        :disabled="currentStep === 1 ? !isStep1Valid : !isSplitBalanced"
                        class="flex-1 h-12 bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground disabled:opacity-50"
                        type="button"
                        @click="handlePrimaryAction"
                    >
                        <template v-if="currentStep === 1 && isGroupExpense">
                            {{ t('expense.nextStep') }}
                            <ChevronRight class="h-4 w-4 ml-1" />
                        </template>
                        <template v-else>
                            <Plus class="h-4 w-4 mr-1" />
                            {{ t('expense.addExpense') }}
                        </template>
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
    DrawerDescription,
    DrawerClose
} from '@/shared/components/ui/drawer'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import {
    Plus,
    Calendar as CalendarIcon,
    User,
    Users,
    ChevronDown,
    ChevronLeft,
    ChevronRight
} from 'lucide-vue-next'
import { Calendar } from '@/shared/components/ui/calendar'
import {
    getLocalTimeZone,
    today,
    type DateValue,
    type CalendarDate
} from '@internationalized/date'
import { useCategories } from '@/features/expense/composables/useCategories'
import { useGroupStore } from '@/features/group/stores/group'
import { useExpenseStore } from '@/features/expense/stores/expense'
import SplitConfigurator from '@/features/split/components/SplitConfigurator.vue'
import type { SplitMethod } from '@/shared/lib/database.types'
import type { AddExpenseEvent } from '@/entities/expense/types'
import type { SplitParticipant } from '@/entities/split/types'

// ---------------------------------------------------------------------------
// i18n + stores + composables
// ---------------------------------------------------------------------------

const { t } = useI18n()
const { categories, getIconKey, getCategoryById } = useCategories()
const groupStore = useGroupStore()
const expenseStore = useExpenseStore()

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

interface Props {
    open?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    open: false
})

const emit = defineEmits<{
    (e: 'update:open', value: boolean): void
    (e: 'expense-added', expense: AddExpenseEvent): void
}>()

// ---------------------------------------------------------------------------
// Drawer open state
// ---------------------------------------------------------------------------

const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value)
})

// ---------------------------------------------------------------------------
// Step management
// ---------------------------------------------------------------------------

const currentStep = ref(1)
const totalSteps = computed(() => isGroupExpense.value ? 2 : 1)

// ---------------------------------------------------------------------------
// Step 1: form data
// ---------------------------------------------------------------------------

const resolvedDefaultGroupId = (): string | null => {
    const lastUsed = expenseStore.lastUsedGroupId
    const active = groupStore.activeGroupId
    const groups = groupStore.groups
    if (lastUsed && groups.some(g => g.id === lastUsed)) return lastUsed
    if (active && groups.some(g => g.id === active)) return active
    return null
}

interface ExpenseFormData {
    title: string
    amount: string
    category: string
    date: string
    groupId: string | null
}

const formData = ref<ExpenseFormData>({
    title: '',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    groupId: resolvedDefaultGroupId()
})

// ---------------------------------------------------------------------------
// Step 2: split data
// ---------------------------------------------------------------------------

interface SplitData {
    splitMethod: SplitMethod
    paidBy: string
    participants: SplitParticipant[]
}

const splitData = ref<SplitData>({
    splitMethod: 'equal',
    paidBy: '',
    participants: []
})

const splitConfiguratorRef = ref<InstanceType<typeof SplitConfigurator> | null>(null)

// ---------------------------------------------------------------------------
// Date picker state
// ---------------------------------------------------------------------------

const selectedDate = ref<DateValue>(today(getLocalTimeZone()))
const defaultPlaceholder = today(getLocalTimeZone())
const showCalendar = ref(false)

// ---------------------------------------------------------------------------
// Computed helpers
// ---------------------------------------------------------------------------

const isGroupExpense = computed(() => formData.value.groupId !== null)

const totalAmount = computed(() => parseFloat(formData.value.amount) || 0)

const selectedCategoryIcon = computed(() => {
    const cat = getCategoryById(formData.value.category)
    return cat?.icon ?? null
})

const isStep1Valid = computed(() =>
    formData.value.title.trim() !== '' &&
    formData.value.amount !== '' &&
    parseFloat(formData.value.amount) > 0 &&
    formData.value.category !== '' &&
    formData.value.date !== ''
)

const isSplitBalanced = computed(() =>
    splitConfiguratorRef.value?.isBalanced ?? false
)

// ---------------------------------------------------------------------------
// Context selector
// ---------------------------------------------------------------------------

const selectContext = (groupId: string | null) => {
    formData.value = { ...formData.value, groupId }
    // Reset split data when context changes
    splitData.value = {
        splitMethod: 'equal',
        paidBy: '',
        participants: []
    }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

const handleDateSelect = (date: DateValue | DateValue[] | undefined) => {
    if (date && !Array.isArray(date)) {
        selectedDate.value = date
        const calendarDate = date as CalendarDate
        formData.value = {
            ...formData.value,
            date: `${calendarDate.year}-${String(calendarDate.month).padStart(2, '0')}-${String(calendarDate.day).padStart(2, '0')}`
        }
    }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const handleStep1Next = () => {
    if (!isStep1Valid.value) return
    if (isGroupExpense.value) {
        currentStep.value = 2
    } else {
        submitExpense()
    }
}

const handlePrimaryAction = () => {
    if (currentStep.value === 1) {
        handleStep1Next()
    } else {
        submitExpense()
    }
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

const submitExpense = () => {
    if (!isStep1Valid.value) return
    if (currentStep.value === 2 && !isSplitBalanced.value) return

    const calculated = splitConfiguratorRef.value?.calculatedSplits ?? []

    const newExpense: AddExpenseEvent = {
        id: crypto.randomUUID(),
        title: formData.value.title.trim(),
        amount: `-NT ${Math.round(parseFloat(formData.value.amount))}`,
        category: formData.value.category,
        icon: getIconKey(formData.value.category),
        date: formData.value.date,
        groupId: formData.value.groupId,
        splitMethod: isGroupExpense.value ? splitData.value.splitMethod : undefined,
        splits: isGroupExpense.value
            ? calculated
                .filter(p => p.isIncluded)
                .map(p => ({
                    userId: p.userId,
                    amount: p.amount,
                    percentage: p.percentage,
                    shares: p.shares
                }))
            : undefined
    }

    emit('expense-added', newExpense)
    isOpen.value = false
}

// ---------------------------------------------------------------------------
// Reset form
// ---------------------------------------------------------------------------

const resetForm = () => {
    const todayDate = today(getLocalTimeZone())
    formData.value = {
        title: '',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        groupId: resolvedDefaultGroupId()
    }
    splitData.value = {
        splitMethod: 'equal',
        paidBy: '',
        participants: []
    }
    selectedDate.value = todayDate
    showCalendar.value = false
    currentStep.value = 1
}

// ---------------------------------------------------------------------------
// Lifecycle watchers
// ---------------------------------------------------------------------------

watch(isOpen, (opened) => {
    if (opened && formData.value.category === '') {
        formData.value = {
            ...formData.value,
            category: categories.value[0]?.id ?? ''
        }
    }
    if (!opened) {
        setTimeout(resetForm, 300)
    }
})
</script>

<style scoped>
.step-fade-enter-active,
.step-fade-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.step-fade-enter-from {
    opacity: 0;
    transform: translateX(20px);
}

.step-fade-leave-to {
    opacity: 0;
    transform: translateX(-20px);
}
</style>
