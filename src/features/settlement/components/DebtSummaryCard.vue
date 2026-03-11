<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowRight } from 'lucide-vue-next'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Button } from '@/shared/components/ui/button'

const { t } = useI18n()

interface UserInfo {
    userId: string
    displayName: string | null
    avatarUrl: string | null
}

interface Props {
    fromUser: UserInfo
    toUser: UserInfo
    amount: number
    isCurrentUser: boolean
    isDebtor?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    isDebtor: false
})

const emit = defineEmits<{
    settle: []
}>()

const getInitial = (displayName: string | null): string => {
    if (!displayName) return '?'
    return displayName.charAt(0).toUpperCase()
}

const formatAmount = (amount: number): string => {
    return `NT$ ${Math.abs(amount).toLocaleString()}`
}
</script>

<template>
    <div
        :class="[
            'glass rounded-2xl px-4 py-3 transition-all duration-200',
            props.isCurrentUser ? 'border-brand-primary/30' : ''
        ]"
    >
        <div class="flex items-center gap-3">
            <!-- From user -->
            <Avatar class="h-9 w-9 shrink-0">
                <AvatarImage :src="props.fromUser.avatarUrl || ''" />
                <AvatarFallback
                    :class="[
                        'text-xs font-medium',
                        props.isCurrentUser
                            ? 'bg-brand-primary text-brand-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                    ]"
                >
                    {{ getInitial(props.fromUser.displayName) }}
                </AvatarFallback>
            </Avatar>

            <!-- Names + arrow -->
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
                <span class="text-sm font-medium truncate max-w-[72px]">
                    {{ props.fromUser.displayName || t('common.unknown') }}
                </span>
                <ArrowRight class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span class="text-sm font-medium truncate max-w-[72px]">
                    {{ props.toUser.displayName || t('common.unknown') }}
                </span>
            </div>

            <!-- Amount -->
            <span
                :class="[
                    'text-sm font-bold shrink-0',
                    props.isCurrentUser ? 'text-brand-primary' : 'text-foreground'
                ]"
            >
                {{ formatAmount(props.amount) }}
            </span>

            <!-- Settle button (only when current user owes money) -->
            <Button
                v-if="props.isDebtor"
                size="sm"
                variant="outline"
                class="shrink-0 h-8 px-3 text-xs font-medium border-brand-primary/40 text-brand-primary hover:bg-brand-primary hover:text-white press-feedback cursor-pointer"
                @click="emit('settle')"
            >
                {{ t('settlement.settle') }}
            </Button>
        </div>
    </div>
</template>
