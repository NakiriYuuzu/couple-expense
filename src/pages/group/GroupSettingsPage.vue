<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TopBar from '@/shared/components/TopBar.vue'
import GroupInvite from '@/features/group/components/GroupInvite.vue'
import GroupMemberList from '@/features/group/components/GroupMemberList.vue'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card } from '@/shared/components/ui/card'
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
    Shield,
    Wallet,
    ChevronRight
} from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const groupStore = useGroupStore()

const groupId = route.params.id as string

// Local loading states
const pageLoading = ref(false)
const settingsSaving = ref(false)
const leaveLoading = ref(false)

// Member profiles
interface MemberWithProfile {
    member: GroupMemberRow
    profile: UserProfileRow | null
}

const membersWithProfiles = ref<MemberWithProfile[]>([])

// Budget settings form
const budgetForm = ref({
    monthly_budget: 0,
    budget_start_day: 1,
    default_split_method: 'equal' as SplitMethod,
    currency: 'TWD' as Currency,
    category_budgets: {
        food: 0,
        transport: 0,
        shopping: 0,
        home: 0,
        pet: 0,
        other: 0
    } as CategoryBudgets
})

// Derived data from store
const group = computed(() => groupStore.groups.find(g => g.id === groupId) ?? null)
const groupSettings = computed(() => groupStore.settingsByGroup[groupId] ?? null)
const members = computed(() => groupStore.membersByGroup[groupId] ?? [])

const currentUserId = computed(() => groupStore.userProfile?.id ?? null)

const currentMemberRole = computed(() => {
    if (!currentUserId.value) return 'member'
    const self = members.value.find(m => m.user_id === currentUserId.value)
    return self?.role ?? 'member'
})

const isOwnerOrAdmin = computed(() =>
    currentMemberRole.value === 'owner' || currentMemberRole.value === 'admin'
)

const isOwner = computed(() => currentMemberRole.value === 'owner')

const canLeave = computed(() => !isOwner.value)

const splitMethods = [
    { value: 'equal', label: () => t('group.splitEqual') },
    { value: 'exact', label: () => t('group.splitExact') },
    { value: 'percentage', label: () => t('group.splitPercentage') },
    { value: 'shares', label: () => t('group.splitShares') }
]

const currencies = ['TWD', 'USD', 'EUR', 'JPY', 'CNY']

const categoryKeys: (keyof CategoryBudgets)[] = [
    'food', 'transport', 'shopping', 'home', 'pet', 'other'
]

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

const syncBudgetForm = () => {
    const settings = groupSettings.value
    if (!settings) return

    const catBudgets = (settings.category_budgets as Record<string, number> | null) ?? {}

    budgetForm.value = {
        monthly_budget: settings.monthly_budget ?? 0,
        budget_start_day: settings.budget_start_day ?? 1,
        default_split_method: (settings.default_split_method ?? 'equal') as SplitMethod,
        currency: (settings.currency ?? 'TWD') as Currency,
        category_budgets: {
            food: catBudgets.food ?? 0,
            transport: catBudgets.transport ?? 0,
            shopping: catBudgets.shopping ?? 0,
            home: catBudgets.home ?? 0,
            pet: catBudgets.pet ?? 0,
            other: catBudgets.other ?? 0
        }
    }
}

const fetchMemberProfiles = async () => {
    const memberList = members.value
    if (memberList.length === 0) {
        membersWithProfiles.value = []
        return
    }

    const userIds = memberList.map(m => m.user_id)

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
        (profiles ?? []).map(p => [p.id, p])
    )

    membersWithProfiles.value = memberList.map(member => ({
        member,
        profile: profileMap.get(member.user_id) ?? null
    }))
}

const handleSaveSettings = async () => {
    settingsSaving.value = true

    // Set as the active group for updateGroupSettings to work
    const prevActiveGroupId = groupStore.activeGroupId
    groupStore.setActiveGroup(groupId)

    try {
        await groupStore.updateGroupSettings({
            monthly_budget: budgetForm.value.monthly_budget,
            budget_start_day: budgetForm.value.budget_start_day,
            default_split_method: budgetForm.value.default_split_method,
            currency: budgetForm.value.currency,
            category_budgets: budgetForm.value.category_budgets
        })
        toast.success(t('group.settingsSaved'))
    } catch (err) {
        const message = err instanceof Error ? err.message : t('common.error')
        toast.error(message)
        // Restore previous active group if something went wrong
        groupStore.setActiveGroup(prevActiveGroupId)
    } finally {
        settingsSaving.value = false
    }
}

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

onMounted(async () => {
    pageLoading.value = true
    try {
        await Promise.all([
            groupStore.fetchUserProfile(),
            groupStore.fetchUserGroups()
        ])
        await fetchMemberProfiles()
        syncBudgetForm()
    } catch {
        toast.error(t('group.fetchError'))
    } finally {
        pageLoading.value = false
    }
})
</script>

<template>
    <div class="min-h-screen bg-background">
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

        <main class="px-4 pb-24 pt-6 space-y-6">

            <!-- Loading state -->
            <div v-if="pageLoading" class="space-y-4">
                <Skeleton class="h-32 w-full rounded-xl" />
                <Skeleton class="h-24 w-full rounded-xl" />
                <Skeleton class="h-48 w-full rounded-xl" />
            </div>

            <!-- Not found -->
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
                <!-- Section 1: Group info -->
                <Card class="p-5 space-y-4">
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
                </Card>

                <!-- Section 2: Invitation code -->
                <Card class="p-5 space-y-4">
                    <div class="flex items-center gap-2">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent">
                            <ChevronRight class="h-5 w-5 text-brand-primary" />
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
                </Card>

                <!-- Section 3: Members -->
                <Card class="p-5 space-y-4">
                    <div class="flex items-center gap-2">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent">
                            <Users class="h-5 w-5 text-brand-primary" />
                        </div>
                        <h2 class="text-base font-semibold text-foreground">
                            {{ t('group.members') }}
                        </h2>
                    </div>

                    <Separator />

                    <GroupMemberList :members="membersWithProfiles" />
                </Card>

                <!-- Section 4: Budget settings (owner/admin only) -->
                <Card v-if="isOwnerOrAdmin && groupSettings" class="p-5 space-y-4">
                    <div class="flex items-center gap-2">
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent">
                            <Wallet class="h-5 w-5 text-brand-primary" />
                        </div>
                        <h2 class="text-base font-semibold text-foreground">
                            {{ t('group.budgetSettings') }}
                        </h2>
                    </div>

                    <Separator />

                    <div class="space-y-5">
                        <!-- Monthly budget -->
                        <div class="space-y-2">
                            <Label for="monthly-budget">{{ t('group.monthlyBudget') }}</Label>
                            <div class="flex items-center gap-2">
                                <span class="text-sm text-muted-foreground">
                                    {{ budgetForm.currency }}
                                </span>
                                <Input
                                    id="monthly-budget"
                                    v-model.number="budgetForm.monthly_budget"
                                    type="number"
                                    min="0"
                                    step="100"
                                    :placeholder="t('group.monthlyBudgetPlaceholder')"
                                />
                            </div>
                        </div>

                        <!-- Budget start day -->
                        <div class="space-y-2">
                            <Label for="budget-start-day">{{ t('group.budgetStartDay') }}</Label>
                            <Select
                                :model-value="String(budgetForm.budget_start_day)"
                                @update:model-value="budgetForm.budget_start_day = Number($event)"
                            >
                                <SelectTrigger id="budget-start-day">
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
                        </div>

                        <!-- Default split method -->
                        <div class="space-y-2">
                            <Label for="split-method">{{ t('group.defaultSplitMethod') }}</Label>
                            <Select
                                :model-value="budgetForm.default_split_method"
                                @update:model-value="budgetForm.default_split_method = $event as SplitMethod"
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

                        <!-- Currency -->
                        <div class="space-y-2">
                            <Label for="currency">{{ t('group.currency') }}</Label>
                            <Select
                                :model-value="budgetForm.currency"
                                @update:model-value="budgetForm.currency = $event as Currency"
                            >
                                <SelectTrigger id="currency">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="cur in currencies"
                                        :key="cur"
                                        :value="cur"
                                    >
                                        {{ cur }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <!-- Category budgets -->
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
                                        v-model.number="budgetForm.category_budgets[key]"
                                        type="number"
                                        min="0"
                                        step="100"
                                        :placeholder="'0'"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- Save button -->
                        <Button
                            class="w-full bg-brand-primary hover:bg-brand-primary/90 text-primary-foreground"
                            :disabled="settingsSaving"
                            @click="handleSaveSettings"
                        >
                            <Spinner v-if="settingsSaving" class="mr-2 h-4 w-4" />
                            {{ t('common.save') }}
                        </Button>
                    </div>
                </Card>

                <!-- Section 5: Danger zone (non-owner) -->
                <Card v-if="canLeave" class="p-5 space-y-4 border-destructive/30">
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
                </Card>

                <!-- Owner note: cannot leave -->
                <Card v-if="isOwner" class="p-4 bg-muted/30">
                    <div class="flex items-center gap-2">
                        <Crown class="h-4 w-4 text-brand-primary" />
                        <p class="text-xs text-muted-foreground">
                            {{ t('group.ownerCannotLeave') }}
                        </p>
                    </div>
                </Card>
            </template>
        </main>
    </div>
</template>
