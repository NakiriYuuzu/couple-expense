<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGroupStore } from '@/features/group/stores/group'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Button } from '@/shared/components/ui/button'
import { Separator } from '@/shared/components/ui/separator'
import { ChevronDown, User, Users, Plus, Settings, Check } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const groupStore = useGroupStore()
const { groups, activeGroupId, isPersonalContext } = storeToRefs(groupStore)

const currentLabel = computed(() => {
    if (isPersonalContext.value) return t('group.personal')
    const group = groups.value.find(g => g.id === activeGroupId.value)
    return group?.name ?? t('group.personal')
})

const handleSelectGroup = (groupId: string | null) => {
    groupStore.setActiveGroup(groupId)
}

const handleManageGroups = () => {
    router.push({ name: 'GroupList' })
}

const handleCreateGroup = () => {
    router.push({ name: 'GroupCreate' })
}
</script>

<template>
    <Popover>
        <PopoverTrigger asChild>
            <Button variant="ghost" class="flex items-center gap-1 px-3 py-2 h-auto">
                <component :is="isPersonalContext ? User : Users" class="h-4 w-4 text-brand-primary" />
                <span class="text-base font-medium">{{ currentLabel }}</span>
                <ChevronDown class="h-4 w-4 text-muted-foreground" />
            </Button>
        </PopoverTrigger>
        <PopoverContent class="w-64 p-2" align="center">
            <!-- Personal mode -->
            <button
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
                @click="handleSelectGroup(null)"
            >
                <User class="h-5 w-5 text-brand-primary" />
                <span class="flex-1 text-sm font-medium">{{ t('group.personal') }}</span>
                <Check v-if="isPersonalContext" class="h-4 w-4 text-brand-primary" />
            </button>

            <Separator v-if="groups.length > 0" class="my-1" />

            <!-- Group list -->
            <button
                v-for="group in groups"
                :key="group.id"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
                @click="handleSelectGroup(group.id)"
            >
                <Users class="h-5 w-5 text-brand-primary" />
                <span class="flex-1 text-sm font-medium truncate">{{ group.name }}</span>
                <Check v-if="activeGroupId === group.id" class="h-4 w-4 text-brand-primary" />
            </button>

            <Separator class="my-1" />

            <!-- Actions -->
            <button
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
                @click="handleCreateGroup"
            >
                <Plus class="h-5 w-5 text-muted-foreground" />
                <span class="flex-1 text-sm text-muted-foreground">{{ t('group.createNew') }}</span>
            </button>
            <button
                v-if="groups.length > 0"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
                @click="handleManageGroups"
            >
                <Settings class="h-5 w-5 text-muted-foreground" />
                <span class="flex-1 text-sm text-muted-foreground">{{ t('group.manageGroups') }}</span>
            </button>
        </PopoverContent>
    </Popover>
</template>
