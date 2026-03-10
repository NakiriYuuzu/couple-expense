<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Badge } from '@/shared/components/ui/badge'
import type { GroupMemberRow, UserProfileRow } from '@/shared/lib/database.types'
import { Crown, Shield, User } from 'lucide-vue-next'

const { t } = useI18n()

interface MemberWithProfile {
    member: GroupMemberRow
    profile: UserProfileRow | null
}

interface Props {
    members: MemberWithProfile[]
}

defineProps<Props>()

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
</script>

<template>
    <div class="space-y-2">
        <div
            v-for="item in members"
            :key="item.member.id"
            class="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
        >
            <Avatar class="h-10 w-10">
                <AvatarImage :src="item.profile?.avatar_url || ''" />
                <AvatarFallback class="bg-brand-accent text-brand-primary text-sm">
                    {{ item.profile?.display_name?.charAt(0) || '?' }}
                </AvatarFallback>
            </Avatar>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                    {{ item.profile?.display_name || item.profile?.email || t('common.unknown') }}
                </p>
            </div>
            <Badge variant="secondary" class="flex items-center gap-1">
                <component :is="getRoleIcon(item.member.role)" class="h-3 w-3" />
                {{ getRoleLabel(item.member.role) }}
            </Badge>
        </div>
    </div>
</template>
