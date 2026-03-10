<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TopBar from '@/shared/components/TopBar.vue'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'

import { Skeleton } from '@/shared/components/ui/skeleton'
import { useGroupStore } from '@/features/group/stores/group'
import { usePullToRefresh } from '@/shared/composables/usePullToRefresh'
import { routes } from '@/app/router/routes/index.ts'
import {
    Users,
    Plus,
    ChevronRight,
    Crown,
    Shield,
    User
} from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const groupStore = useGroupStore()

const loading = ref(false)

const groupColors = ['bg-purple-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500']

const currentUserId = computed(() => groupStore.userProfile?.id ?? null)

const getRoleForGroup = (groupId: string) => {
    const members = groupStore.membersByGroup[groupId] ?? []
    const self = members.find(m => m.user_id === currentUserId.value)
    return self?.role ?? 'member'
}

const getRoleIcon = (role: string) => {
    switch (role) {
        case 'owner': return Crown
        case 'admin': return Shield
        default: return User
    }
}

const getRoleLabel = (role: string) => {
    switch (role) {
        case 'owner': return t('group.owner')
        case 'admin': return t('group.admin')
        default: return t('group.member')
    }
}

const getRoleBadgeVariant = (role: string) => {
    switch (role) {
        case 'owner': return 'default' as const
        case 'admin': return 'secondary' as const
        default: return 'outline' as const
    }
}

const getMemberCount = (groupId: string) => {
    return (groupStore.membersByGroup[groupId] ?? []).length
}

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
}

const isActiveGroup = (groupId: string) => groupStore.activeGroupId === groupId

const navigateToGroup = (groupId: string) => {
    router.push({ name: routes.groupSettings.name, params: { id: groupId } })
}

const navigateToCreate = () => {
    router.push({ name: routes.groupCreate.name })
}

const fetchGroups = async () => {
    loading.value = true
    try {
        await Promise.all([
            groupStore.fetchUserProfile(),
            groupStore.fetchUserGroups()
        ])
    } catch {
        toast.error(t('group.fetchError'))
    } finally {
        loading.value = false
    }
}

usePullToRefresh({
    onRefresh: async () => {
        try {
            await Promise.all([
                groupStore.fetchUserProfile(),
                groupStore.fetchUserGroups()
            ])
            toast.success(t('common.refreshed'))
        } catch (error) {
            console.error('刷新失敗:', error)
            toast.error(t('common.refreshFailed'))
        }
    }
})

onMounted(fetchGroups)
</script>

<template>
    <div class="min-h-screen bg-background glass-page-bg">
        <TopBar
            :title="t('group.groupList')"
            :show-back-button="true"
            @back="router.back()"
        >
            <template #action>
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-10 w-10 rounded-full"
                    @click="navigateToCreate"
                >
                    <Plus class="h-5 w-5" />
                </Button>
            </template>
        </TopBar>

        <main class="px-4 pb-28 pt-6">
            <!-- Loading state -->
            <div v-if="loading" class="space-y-3">
                <Skeleton
                    v-for="n in 3"
                    :key="n"
                    class="h-24 w-full rounded-xl"
                />
            </div>

            <!-- Empty state -->
            <div
                v-else-if="groupStore.groups.length === 0"
                class="flex flex-col items-center justify-center pt-20 gap-6"
            >
                <div class="flex h-24 w-24 items-center justify-center rounded-full bg-brand-accent">
                    <Users class="h-12 w-12 text-brand-primary" />
                </div>
                <div class="text-center space-y-2">
                    <h3 class="text-lg font-semibold text-foreground">
                        {{ t('group.noGroupsTitle') }}
                    </h3>
                    <p class="text-sm text-muted-foreground">
                        {{ t('group.noGroupsDesc') }}
                    </p>
                </div>
                <Button
                    class="bg-brand-primary hover:bg-brand-primary/90 text-primary-foreground"
                    @click="navigateToCreate"
                >
                    <Plus class="mr-2 h-4 w-4" />
                    {{ t('group.createOrJoin') }}
                </Button>
            </div>

            <!-- Group list -->
            <div v-else class="space-y-3">
                <div
                    v-for="(group, index) in groupStore.groups"
                    :key="group.id"
                    class="glass rounded-2xl p-4 cursor-pointer press-feedback hover-transition relative overflow-hidden"
                    :class="isActiveGroup(group.id) ? 'border-brand-primary ring-1 ring-brand-primary' : ''"
                    @click="navigateToGroup(group.id)"
                >
                    <!-- Colored top stripe -->
                    <div :class="['absolute top-0 left-0 right-0 h-1 rounded-t-xl', groupColors[index % groupColors.length]]" />

                    <!-- Active indicator -->
                    <div
                        v-if="isActiveGroup(group.id)"
                        class="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary rounded-l-xl"
                    />

                    <div class="flex items-center gap-3">
                        <!-- Group avatar -->
                        <div :class="['flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white', groupColors[index % groupColors.length]]">
                            {{ group.name.charAt(0) }}
                        </div>

                        <!-- Group info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="text-base font-semibold text-foreground truncate">
                                    {{ group.name }}
                                </h3>
                                <Badge
                                    v-if="isActiveGroup(group.id)"
                                    variant="default"
                                    class="bg-brand-primary text-primary-foreground text-xs shrink-0"
                                >
                                    {{ t('group.active') }}
                                </Badge>
                            </div>
                            <div class="flex items-center gap-3 mt-1">
                                <span class="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Users class="h-3 w-3" />
                                    {{ t('group.memberCount', { count: getMemberCount(group.id) }) }}
                                </span>
                                <span class="text-xs text-muted-foreground">
                                    {{ formatDate(group.created_at) }}
                                </span>
                            </div>
                        </div>

                        <!-- Role badge + chevron -->
                        <div class="flex items-center gap-2 shrink-0">
                            <Badge :variant="getRoleBadgeVariant(getRoleForGroup(group.id))" class="flex items-center gap-1">
                                <component
                                    :is="getRoleIcon(getRoleForGroup(group.id))"
                                    class="h-3 w-3"
                                />
                                {{ getRoleLabel(getRoleForGroup(group.id)) }}
                            </Badge>
                            <ChevronRight class="h-4 w-4 text-muted-foreground" />
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- FAB for creating group -->
        <div
            v-if="!loading && groupStore.groups.length > 0"
            class="fixed bottom-6 right-6"
        >
            <Button
                size="lg"
                class="h-14 w-14 rounded-full glass-elevated bg-brand-primary hover:bg-brand-primary/90 text-primary-foreground press-feedback"
                @click="navigateToCreate"
            >
                <Plus class="h-6 w-6" />
            </Button>
        </div>
    </div>
</template>
