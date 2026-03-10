<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { toast } from 'vue-sonner'
import TopBar from '@/shared/components/TopBar.vue'
import GroupInvite from '@/features/group/components/GroupInvite.vue'
import GroupMemberList from '@/features/group/components/GroupMemberList.vue'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Separator } from '@/shared/components/ui/separator'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Spinner } from '@/shared/components/ui/spinner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '@/shared/components/ui/alert-dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/shared/components/ui/select'
import { useGroupStore } from '@/features/group/stores/group'
import { usePullToRefresh } from '@/shared/composables/usePullToRefresh'
import { supabase } from '@/shared/lib/supabase'
import { routes } from '@/app/router/routes/index.ts'
import type { UserProfileRow, GroupMemberRow } from '@/shared/lib/database.types'
import type { CategoryBudgets, SplitMethod, Currency } from '@/entities/group/types'
import {
    Settings,
    Users,
    CalendarDays,
    LogOut,
    Crown,
    Wallet,
    ChevronRight
} from 'lucide-vue-next'

interface MemberWithProfile {
    member: GroupMemberRow
    profile: UserProfileRow | null
}

type CategoryBudgetKey = keyof CategoryBudgets

interface BudgetSettingsFormValues {
    monthly_budget: number | undefined
    budget_start_day: number | undefined
    default_split_method: SplitMethod
    currency: Currency
    category_budgets: Record<CategoryBudgetKey, number | undefined>
}

type BudgetFieldPath =
    | 'monthly_budget'
    | 'budget_start_day'
    | 'default_split_method'
    | 'currency'
    | `category_budgets.${CategoryBudgetKey}`

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const groupStore = useGroupStore()

const groupId = route.params.id as string
const pageLoading = ref(false)
const settingsSaving = ref(false)
const leaveLoading = ref(false)
const membersWithProfiles = ref<MemberWithProfile[]>([])

const group = computed(() => groupStore.groups.find(g => g.id === groupId) ?? null)
const groupSettings = computed(() => groupStore.settingsByGroup[groupId] ?? null)
const members = computed(() => groupStore.membersByGroup[groupId] ?? [])
const currentUserId = computed(() => groupStore.userProfile?.id ?? null)

const currentMemberRole = computed(() => {
    if (!currentUserId.value) return 'member'
    const self = members.value.find(member => member.user_id === currentUserId.value)
    return self?.role ?? 'member'
})

const isOwnerOrAdmin = computed(() =>
    currentMemberRole.value === 'owner' || currentMemberRole.value === 'admin'
)

const isOwner = computed(() => currentMemberRole.value === 'owner')
const canLeave = computed(() => !isOwner.value)

const splitMethodValues = ['equal', 'exact', 'percentage', 'shares'] as const
const currencyValues = ['TWD', 'USD', 'EUR', 'JPY', 'CNY'] as const

const splitMethods = [
    { value: 'equal', label: () => t('group.splitEqual') },
    { value: 'exact', label: () => t('group.splitExact') },
    { value: 'percentage', label: () => t('group.splitPercentage') },
    { value: 'shares', label: () => t('group.splitShares') }
] as const

const categoryKeys: CategoryBudgetKey[] = [
    'food',
    'transport',
    'shopping',
    'home',
    'pet',
    'other'
]

const requiredFieldMessage = t('validation.required')
const numberFieldMessage = t('validation.number')

const nonNegativeNumberSchema = z.preprocess((value) => {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed === '') return undefined
        return Number(trimmed)
    }

    return value
}, z.number({
    required_error: requiredFieldMessage,
    invalid_type_error: numberFieldMessage
}).min(0, numberFieldMessage))

const budgetStartDaySchema = z.preprocess((value) => {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed === '') return undefined
        return Number(trimmed)
    }

    return value
}, z.number({
    required_error: requiredFieldMessage,
    invalid_type_error: numberFieldMessage
}).int().min(1, numberFieldMessage).max(28, numberFieldMessage))

const budgetSettingsSchema = toTypedSchema(z.object({
    monthly_budget: nonNegativeNumberSchema,
    budget_start_day: budgetStartDaySchema,
    default_split_method: z.enum(splitMethodValues),
    currency: z.enum(currencyValues),
    category_budgets: z.object({
        food: nonNegativeNumberSchema,
        transport: nonNegativeNumberSchema,
        shopping: nonNegativeNumberSchema,
        home: nonNegativeNumberSchema,
        pet: nonNegativeNumberSchema,
        other: nonNegativeNumberSchema
    })
}))

const buildBudgetFormValues = (settings = groupSettings.value): BudgetSettingsFormValues => {
    const categoryBudgets = (settings?.category_budgets as Record<string, number> | null) ?? {}

    return {
        monthly_budget: settings?.monthly_budget ?? 0,
        budget_start_day: settings?.budget_start_day ?? 1,
        default_split_method: (settings?.default_split_method ?? 'equal') as SplitMethod,
        currency: (settings?.currency ?? 'TWD') as Currency,
        category_budgets: {
            food: categoryBudgets.food ?? 0,
            transport: categoryBudgets.transport ?? 0,
            shopping: categoryBudgets.shopping ?? 0,
            home: categoryBudgets.home ?? 0,
            pet: categoryBudgets.pet ?? 0,
            other: categoryBudgets.other ?? 0
        }
    }
}

const budgetSettingsForm = useForm<BudgetSettingsFormValues>({
    validationSchema: budgetSettingsSchema,
    initialValues: buildBudgetFormValues()
})

const getCategoryLabel = (key: string) => {
    return t(`expense.category.${key}`)
}

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
}

const updateBudgetField = (field: BudgetFieldPath, value: string | number) => {
    budgetSettingsForm.setFieldValue(field, value === '' ? undefined : Number(value))
}

const updateBudgetSelectField = (
    field: 'budget_start_day' | 'default_split_method' | 'currency',
    value: string | null
) => {
    if (!value) return
    budgetSettingsForm.setFieldValue(
        field,
        field === 'budget_start_day' ? Number(value) : value
    )
}

const syncBudgetForm = () => {
    if (!groupSettings.value) return

    budgetSettingsForm.resetForm({
        values: buildBudgetFormValues(groupSettings.value)
    })
}

const fetchMemberProfiles = async () => {
    const memberList = members.value
    if (memberList.length === 0) {
        membersWithProfiles.value = []
        return
    }

    const userIds = memberList.map(member => member.user_id)

    const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*')
        .in('id', userIds)

    if (error) {
        console.error('獲取成員資料失敗:', error)
        membersWithProfiles.value = memberList.map(member => ({ member, profile: null }))
        return
    }

    const profileMap = new Map<string, UserProfileRow>(
        (profiles ?? []).map(profile => [profile.id, profile])
    )

    membersWithProfiles.value = memberList.map(member => ({
        member,
        profile: profileMap.get(member.user_id) ?? null
    }))
}

const handleSaveSettings = budgetSettingsForm.handleSubmit(async (values) => {
    settingsSaving.value = true

    const prevActiveGroupId = groupStore.activeGroupId
    groupStore.setActiveGroup(groupId)

    try {
        await groupStore.updateGroupSettings({
            monthly_budget: values.monthly_budget ?? 0,
            budget_start_day: values.budget_start_day ?? 1,
            default_split_method: values.default_split_method,
            currency: values.currency,
            category_budgets: {
                food: values.category_budgets.food ?? 0,
                transport: values.category_budgets.transport ?? 0,
                shopping: values.category_budgets.shopping ?? 0,
                home: values.category_budgets.home ?? 0,
                pet: values.category_budgets.pet ?? 0,
                other: values.category_budgets.other ?? 0
            }
        })
        toast.success(t('group.settingsSaved'))
    } catch (err) {
        const message = err instanceof Error ? err.message : t('common.error')
        toast.error(message)
        groupStore.setActiveGroup(prevActiveGroupId)
    } finally {
        settingsSaving.value = false
    }
})

const handleLeaveGroup = async () => {
    leaveLoading.value = true
    try {
        await groupStore.leaveGroup(groupId)
        toast.success(t('group.leaveSuccess'))
        router.push({ name: routes.dashboard.name })
    } catch (err) {
        const message = err instanceof Error ? err.message : t('common.error')
        toast.error(message)
    } finally {
        leaveLoading.value = false
    }
}

const refreshPageData = async () => {
    await Promise.all([
        groupStore.fetchUserProfile(),
        groupStore.fetchUserGroups()
    ])
    await fetchMemberProfiles()
    syncBudgetForm()
}

usePullToRefresh({
    onRefresh: async () => {
        try {
            await refreshPageData()
            toast.success(t('common.refreshed'))
        } catch (error) {
            console.error('刷新失敗:', error)
            toast.error(t('common.refreshFailed'))
        }
    }
})

onMounted(async () => {
    pageLoading.value = true
    try {
        await refreshPageData()
    } catch {
        toast.error(t('group.fetchError'))
    } finally {
        pageLoading.value = false
    }
})
</script>

<template>
    <div class="min-h-screen bg-background glass-page-bg">
        <TopBar
            :title="group?.name ?? t('group.groupSettings')"
            :show-back-button="true"
            @back="router.back()"
        >
            <template #action>
                <div class="flex h-10 w-10 items-center justify-center">
                    <Settings class="h-5 w-5 text-muted-foreground" />
                </div>
            </template>
        </TopBar>

        <main class="px-4 pb-28 pt-6 space-y-6">
            <div v-if="pageLoading" class="space-y-4">
                <Skeleton class="h-32 w-full rounded-xl" />
                <Skeleton class="h-24 w-full rounded-xl" />
                <Skeleton class="h-48 w-full rounded-xl" />
            </div>

            <div
                v-else-if="!group"
                class="flex flex-col items-center justify-center pt-20 gap-4"
            >
                <p class="text-muted-foreground">{{ t('group.notFound') }}</p>
                <Button variant="outline" @click="router.back()">
                    {{ t('common.back') }}
                </Button>
            </div>

            <template v-else>
                <div class="glass rounded-2xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent">
                            <Users class="h-5 w-5 text-brand-primary" />
                        </div>
                        <h2 class="text-base font-semibold text-foreground">
                            {{ t('group.groupInfo') }}
                        </h2>
                    </div>

                    <Separator />

                    <div class="space-y-3">
                        <div>
                            <p class="text-xs text-muted-foreground mb-1">{{ t('group.groupName') }}</p>
                            <p class="text-sm font-medium text-foreground">{{ group.name }}</p>
                        </div>

                        <div v-if="group.description">
                            <p class="text-xs text-muted-foreground mb-1">{{ t('group.groupDescription') }}</p>
                            <p class="text-sm text-foreground">{{ group.description }}</p>
                        </div>

                        <div class="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays class="h-3.5 w-3.5" />
                            <span>{{ t('group.createdAt') }}: {{ formatDate(group.created_at) }}</span>
                        </div>

                        <div class="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users class="h-3.5 w-3.5" />
                            <span>{{ t('group.memberCount', { count: members.length }) }}</span>
                        </div>
                    </div>
                </div>

                <div class="glass-elevated rounded-2xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl glass-light text-purple-600 dark:text-purple-400">
                            <ChevronRight class="h-5 w-5" />
                        </div>
                        <h2 class="text-base font-semibold text-foreground">
                            {{ t('group.invitationCode') }}
                        </h2>
                    </div>

                    <Separator />

                    <GroupInvite
                        v-if="group.invitation_code"
                        :invitation-code="group.invitation_code"
                    />
                    <p v-else class="text-sm text-muted-foreground">
                        {{ t('group.noInvitationCode') }}
                    </p>
                </div>

                <div class="glass rounded-2xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl glass-light text-blue-600 dark:text-blue-400">
                            <Users class="h-5 w-5" />
                        </div>
                        <h2 class="text-base font-semibold text-foreground">
                            {{ t('group.members') }}
                        </h2>
                    </div>

                    <Separator />

                    <GroupMemberList :members="membersWithProfiles" />
                </div>

                <div v-if="isOwnerOrAdmin && groupSettings" class="glass rounded-2xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl glass-light text-amber-600 dark:text-amber-400">
                            <Wallet class="h-5 w-5" />
                        </div>
                        <h2 class="text-base font-semibold text-foreground">
                            {{ t('group.budgetSettings') }}
                        </h2>
                    </div>

                    <Separator />

                    <form class="space-y-5" @submit="handleSaveSettings">
                        <div class="space-y-2">
                            <Label for="monthly-budget">{{ t('group.monthlyBudget') }}</Label>
                            <div class="flex items-center gap-2">
                                <span class="text-sm text-muted-foreground">
                                    {{ budgetSettingsForm.values.currency }}
                                </span>
                                <Input
                                    id="monthly-budget"
                                    :model-value="budgetSettingsForm.values.monthly_budget ?? ''"
                                    type="number"
                                    min="0"
                                    step="100"
                                    :class="budgetSettingsForm.errors.value.monthly_budget ? 'border-destructive' : ''"
                                    :placeholder="t('group.monthlyBudgetPlaceholder')"
                                    @update:model-value="value => updateBudgetField('monthly_budget', value)"
                                />
                            </div>
                            <p v-if="budgetSettingsForm.errors.value.monthly_budget" class="text-xs text-destructive">
                                {{ budgetSettingsForm.errors.value.monthly_budget }}
                            </p>
                        </div>

                        <div class="space-y-2">
                            <Label for="budget-start-day">{{ t('group.budgetStartDay') }}</Label>
                            <Select
                                :model-value="String(budgetSettingsForm.values.budget_start_day ?? '')"
                                @update:model-value="value => updateBudgetSelectField('budget_start_day', typeof value === 'string' ? value : null)"
                            >
                                <SelectTrigger
                                    id="budget-start-day"
                                    :class="budgetSettingsForm.errors.value.budget_start_day ? 'border-destructive' : ''"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="day in 28"
                                        :key="day"
                                        :value="String(day)"
                                    >
                                        {{ t('group.dayOfMonth', { day }) }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p v-if="budgetSettingsForm.errors.value.budget_start_day" class="text-xs text-destructive">
                                {{ budgetSettingsForm.errors.value.budget_start_day }}
                            </p>
                        </div>

                        <div class="space-y-2">
                            <Label for="split-method">{{ t('group.defaultSplitMethod') }}</Label>
                            <Select
                                :model-value="budgetSettingsForm.values.default_split_method"
                                @update:model-value="value => updateBudgetSelectField('default_split_method', typeof value === 'string' ? value : null)"
                            >
                                <SelectTrigger id="split-method">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="method in splitMethods"
                                        :key="method.value"
                                        :value="method.value"
                                    >
                                        {{ method.label() }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div class="space-y-2">
                            <Label for="currency">{{ t('group.currency') }}</Label>
                            <Select
                                :model-value="budgetSettingsForm.values.currency"
                                @update:model-value="value => updateBudgetSelectField('currency', typeof value === 'string' ? value : null)"
                            >
                                <SelectTrigger id="currency">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="currency in currencyValues"
                                        :key="currency"
                                        :value="currency"
                                    >
                                        {{ currency }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div class="space-y-3">
                            <Label>{{ t('group.categoryBudgets') }}</Label>
                            <div class="grid grid-cols-2 gap-3">
                                <div
                                    v-for="key in categoryKeys"
                                    :key="key"
                                    class="space-y-1"
                                >
                                    <Label :for="`cat-${key}`" class="text-xs text-muted-foreground">
                                        {{ getCategoryLabel(key) }}
                                    </Label>
                                    <Input
                                        :id="`cat-${key}`"
                                        :model-value="budgetSettingsForm.values.category_budgets?.[key] ?? ''"
                                        type="number"
                                        min="0"
                                        step="100"
                                        :class="budgetSettingsForm.errors.value[`category_budgets.${key}`] ? 'border-destructive' : ''"
                                        :placeholder="'0'"
                                        @update:model-value="value => updateBudgetField(`category_budgets.${key}`, value)"
                                    />
                                    <p v-if="budgetSettingsForm.errors.value[`category_budgets.${key}`]" class="text-xs text-destructive">
                                        {{ budgetSettingsForm.errors.value[`category_budgets.${key}`] }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            class="w-full bg-brand-primary hover:bg-brand-primary/90 text-primary-foreground"
                            :disabled="settingsSaving"
                        >
                            <Spinner v-if="settingsSaving" class="mr-2 h-4 w-4" />
                            {{ t('common.save') }}
                        </Button>
                    </form>
                </div>

                <div v-if="canLeave" class="glass rounded-2xl p-5 space-y-4 border-destructive/30">
                    <div class="flex items-center gap-2">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                            <LogOut class="h-5 w-5 text-destructive" />
                        </div>
                        <h2 class="text-base font-semibold text-destructive">
                            {{ t('group.dangerZone') }}
                        </h2>
                    </div>

                    <Separator class="bg-destructive/20" />

                    <div class="space-y-3">
                        <div>
                            <p class="text-sm font-medium text-foreground">{{ t('group.leaveGroup') }}</p>
                            <p class="text-xs text-muted-foreground mt-1">
                                {{ t('group.leaveGroupDesc') }}
                            </p>
                        </div>

                        <AlertDialog>
                            <AlertDialogTrigger as-child>
                                <Button
                                    variant="destructive"
                                    class="w-full"
                                    :disabled="leaveLoading"
                                >
                                    <Spinner v-if="leaveLoading" class="mr-2 h-4 w-4" />
                                    <LogOut v-else class="mr-2 h-4 w-4" />
                                    {{ t('group.leaveGroup') }}
                                </Button>
                            </AlertDialogTrigger>

                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        {{ t('group.leaveConfirmTitle') }}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {{ t('group.leaveConfirmDesc', { name: group.name }) }}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        {{ t('common.cancel') }}
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        class="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                        @click="handleLeaveGroup"
                                    >
                                        {{ t('group.confirmLeave') }}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>

                <div v-if="isOwner" class="glass rounded-2xl p-4">
                    <div class="flex items-center gap-2">
                        <Crown class="h-4 w-4 text-brand-primary" />
                        <p class="text-xs text-muted-foreground">
                            {{ t('group.ownerCannotLeave') }}
                        </p>
                    </div>
                </div>
            </template>
        </main>
    </div>
</template>
