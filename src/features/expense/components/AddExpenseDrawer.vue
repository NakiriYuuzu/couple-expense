<template>
    <Drawer v-model:open="isOpen">
        <DrawerContent
            :id="drawerContentId"
            class="max-h-[90vh] flex flex-col glass-elevated !border-0 !border-t border-glass-border-strong"
        >

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
                                    : 'w-4 glass-light'
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
                        <!-- Recent expenses quick-copy -->
                        <div v-if="recentExpenses.length > 0" class="space-y-1.5">
                            <label class="text-xs text-muted-foreground">{{ t('expense.recentQuickCopy') }}</label>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="recent in recentExpenses"
                                    :key="recent.title"
                                    type="button"
                                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-light text-xs font-medium text-foreground press-feedback hover-transition"
                                    @click="applyRecentExpense(recent)"
                                >
                                    <component
                                        :is="CategoryUtils.getIconByKey(recent.icon)"
                                        class="h-3.5 w-3.5 text-muted-foreground"
                                    />
                                    {{ recent.title }}
                                    <span class="text-muted-foreground">NT${{ recent.amount }}</span>
                                </button>
                            </div>
                        </div>

                        <!-- Title -->
                        <div class="space-y-1.5">
                            <label for="title" class="text-sm font-medium text-foreground">
                                {{ t('expense.title') }}
                            </label>
                            <Input
                                id="title"
                                v-model="title"
                                v-bind="titleAttrs"
                                :placeholder="t('expense.titlePlaceholder')"
                                class="h-12"
                                :aria-invalid="Boolean(errors.title)"
                                autocomplete="off"
                            />
                            <p v-if="errors.title" class="text-xs text-destructive">
                                {{ errors.title }}
                            </p>
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
                                    :model-value="formData.amount ?? ''"
                                    type="number"
                                    placeholder="0"
                                    class="h-12 pl-10"
                                    min="0"
                                    step="1"
                                    :aria-invalid="Boolean(errors.amount)"
                                    @update:model-value="setFieldValue('amount', $event === '' ? undefined : Number($event))"
                                />
                            </div>
                            <p v-if="errors.amount" class="text-xs text-destructive">
                                {{ errors.amount }}
                            </p>
                        </div>

                        <!-- Context selector (personal vs group) -->
                        <div v-if="groupStore.isInAnyGroup" class="space-y-1.5">
                            <label class="text-sm font-medium text-foreground">
                                {{ t('expense.context') }}
                            </label>
                            <div class="flex gap-2 p-1 rounded-xl glass-light">
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
                                    @click="setFieldValue('category', category.id)"
                                    :class="[
                                        'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 press-feedback',
                                        formData.category === category.id
                                            ? 'glass-heavy'
                                            : 'border-transparent glass-light hover:glass'
                                    ]"
                                    :style="formData.category === category.id
                                        ? { borderColor: 'var(--category-' + category.id + ')' }
                                        : undefined
                                    "
                                >
                                    <div
                                        class="flex h-10 w-10 items-center justify-center rounded-xl"
                                        :style="formData.category === category.id
                                            ? { backgroundColor: 'var(--category-' + category.id + ')' }
                                            : { backgroundColor: 'var(--category-' + category.id + '-bg)' }
                                        "
                                    >
                                        <component
                                            :is="category.icon"
                                            :class="'h-5 w-5'"
                                            :style="formData.category === category.id
                                                ? { color: 'white' }
                                                : { color: 'var(--category-' + category.id + ')' }
                                            "
                                        />
                                    </div>
                                    <span class="text-xs font-medium text-foreground leading-tight text-center">
                                        {{ category.name }}
                                    </span>
                                </button>
                            </div>
                            <p v-if="errors.category" class="text-xs text-destructive">
                                {{ errors.category }}
                            </p>
                        </div>

                        <!-- Date picker -->
                        <div class="space-y-1.5">
                            <label class="text-sm font-medium text-foreground">
                                {{ t('expense.date') }}
                            </label>
                            <Popover v-slot="{ close }">
                                <PopoverTrigger as-child>
                                    <Button
                                        variant="outline"
                                        type="button"
                                        :class="[
                                            'group w-full h-12 justify-start text-left font-normal',
                                            !formData.date && 'text-muted-foreground',
                                            errors.date && 'border-destructive'
                                        ]"
                                        :aria-invalid="Boolean(errors.date)"
                                    >
                                        <CalendarIcon class="mr-2 h-4 w-4 text-muted-foreground" />
                                        {{ formData.date ? formatDate(formData.date) : t('home.selectDate') }}
                                        <ChevronDown
                                            class="ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                                        />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    :to="`#${drawerContentId}`"
                                    class="w-auto p-0"
                                    align="start"
                                >
                                    <Calendar
                                        :model-value="selectedDate as any"
                                        :default-placeholder="defaultPlaceholder"
                                        weekday-format="short"
                                        class="**:data-[slot=calendar-cell-trigger]:size-12!"
                                        @update:model-value="(val) => handleCalendarModelUpdate(val, close)"
                                    />
                                </PopoverContent>
                            </Popover>
                            <p v-if="errors.date" class="text-xs text-destructive">
                                {{ errors.date }}
                            </p>
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
                        <div class="flex items-center justify-between p-3 rounded-xl glass-elevated mb-4">
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
                                        {{ formatDate(formData.date ?? '') }}
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
            <div class="px-4 py-4 glass-heavy shrink-0">
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
                        :disabled="isSubmitting || (currentStep === 1 ? !isStep1Valid : !isSplitBalanced)"
                        class="flex-1 h-12 bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground disabled:opacity-50 press-feedback"
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
import { computed, ref, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import {
    getLocalTimeZone,
    today,
    type DateValue,
    type CalendarDate
} from '@internationalized/date'
import { useCategories, CategoryUtils } from '@/features/expense/composables/useCategories'
import { useRecentExpenses } from '@/features/expense/composables/useRecentExpenses'
import { useGroupStore } from '@/features/group/stores/group'
import { useExpenseStore } from '@/features/expense/stores/expense'
import SplitConfigurator from '@/features/split/components/SplitConfigurator.vue'
import type { SplitMethod } from '@/shared/lib/database.types'
import type { AddExpenseEvent, CategoryId } from '@/entities/expense/types'
import type { SplitParticipant } from '@/entities/split/types'

// ---------------------------------------------------------------------------
// i18n + stores + composables
// ---------------------------------------------------------------------------

const { t } = useI18n()
const { categories, getIconKey, getCategoryById } = useCategories()
const { recentExpenses } = useRecentExpenses()
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
const drawerContentId = 'add-expense-drawer-content'

// ---------------------------------------------------------------------------
// Step management
// ---------------------------------------------------------------------------

const currentStep = ref(1)
const isSubmitting = ref(false)
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
    amount: number | undefined
    category: CategoryId | ''
    date: string
    groupId: string | null
}

const buildTodayDateString = (): string => {
    return new Date().toISOString().split('T')[0] ?? new Date().toISOString()
}

const buildInitialFormValues = (): ExpenseFormData => ({
    title: '',
    amount: undefined,
    category: '',
    date: buildTodayDateString(),
    groupId: resolvedDefaultGroupId()
})

const expenseFormSchema = computed(() => z.object({
    title: z.string()
        .trim()
        .min(1, t('validation.required')),
    amount: z.number({
        required_error: t('validation.required'),
        invalid_type_error: t('validation.number')
    }).positive(t('validation.positiveNumber')),
    category: z.string()
        .trim()
        .min(1, t('validation.required')),
    date: z.string()
        .trim()
        .min(1, t('validation.required')),
    groupId: z.string().nullable()
}))

const {
    values: formData,
    errors,
    defineField,
    handleSubmit,
    resetForm,
    setFieldValue,
    validate
} = useForm({
    validationSchema: computed(() => toTypedSchema(expenseFormSchema.value)),
    initialValues: buildInitialFormValues()
})

const [title, titleAttrs] = defineField('title')

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

const selectedDate = ref<DateValue | undefined>(today(getLocalTimeZone()) as DateValue)
const defaultPlaceholder = today(getLocalTimeZone()) as DateValue

// ---------------------------------------------------------------------------
// Computed helpers
// ---------------------------------------------------------------------------

const isGroupExpense = computed(() => formData.groupId !== null)

const totalAmount = computed(() => formData.amount ?? 0)

const selectedCategoryIcon = computed(() => {
    const cat = getCategoryById((formData.category ?? '') as CategoryId | '')
    return cat?.icon ?? null
})

const isStep1Valid = computed(() => expenseFormSchema.value.safeParse(formData).success)

const isSplitBalanced = computed(() =>
    splitConfiguratorRef.value?.isBalanced ?? false
)

// ---------------------------------------------------------------------------
// Context selector
// ---------------------------------------------------------------------------

const applyRecentExpense = (recent: { title: string; category: string; icon: string; amount: number }) => {
    setFieldValue('title', recent.title)
    setFieldValue('amount', recent.amount)
    setFieldValue('category', recent.category as CategoryId)
}

const selectContext = (groupId: string | null) => {
    setFieldValue('groupId', groupId)
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
        setFieldValue(
            'date',
            `${calendarDate.year}-${String(calendarDate.month).padStart(2, '0')}-${String(calendarDate.day).padStart(2, '0')}`
        )
    }
}

const handleCalendarModelUpdate = (date: DateValue | DateValue[] | undefined, close: () => void) => {
    if (date && !Array.isArray(date)) {
        selectedDate.value = date
    }

    handleDateSelect(date)
    close()
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const handleStep1Next = async () => {
    const result = await validate()

    if (!result.valid) return

    if (isGroupExpense.value) {
        currentStep.value = 2
    } else {
        await submitExpense()
    }
}

const handlePrimaryAction = () => {
    if (currentStep.value === 1) {
        void handleStep1Next()
    } else {
        void submitExpense()
    }
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

const submitExpense = handleSubmit(async (validatedValues) => {
    if (isSubmitting.value) return
    if (currentStep.value === 2 && !isSplitBalanced.value) return

    isSubmitting.value = true
    try {
        const calculated = splitConfiguratorRef.value?.calculatedSplits ?? []

        const newExpense: AddExpenseEvent = {
            id: crypto.randomUUID(),
            title: validatedValues.title,
            amount: `-NT ${Math.round(validatedValues.amount)}`,
            category: validatedValues.category as CategoryId,
            icon: getIconKey(validatedValues.category as CategoryId),
            date: validatedValues.date,
            groupId: validatedValues.groupId,
            paidBy: isGroupExpense.value ? splitData.value.paidBy : undefined,
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
    } finally {
        isSubmitting.value = false
    }
})

// ---------------------------------------------------------------------------
// Reset form
// ---------------------------------------------------------------------------

const resetExpenseForm = () => {
    const todayDate = today(getLocalTimeZone())
    resetForm({
        values: buildInitialFormValues()
    })
    splitData.value = {
        splitMethod: 'equal',
        paidBy: '',
        participants: []
    }
    selectedDate.value = todayDate
    currentStep.value = 1
}

// ---------------------------------------------------------------------------
// Lifecycle watchers
// ---------------------------------------------------------------------------

watch(isOpen, (opened) => {
    if (opened && formData.category === '') {
        setFieldValue('category', categories.value[0]?.id ?? '')
    }
    if (!opened) {
        setTimeout(resetExpenseForm, 300)
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
