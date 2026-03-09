<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowRight } from 'lucide-vue-next'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'

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
}

const props = defineProps<Props>()

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
    <Card
        :class="[
            'transition-all duration-200',
            props.isCurrentUser
                ? 'border-brand-primary/40 bg-brand-accent/30'
                : 'border-border'
        ]"
    >
        <CardContent class="px-4 py-3">
            <div class="flex items-center gap-3">
                <!-- From user avatar -->
                <div class="flex flex-col items-center gap-1 flex-shrink-0">
                    <Avatar class="h-10 w-10">
                        <AvatarImage :src="props.fromUser.avatarUrl || ''" />
                        <AvatarFallback
                            :class="[
                                'text-sm font-medium',
                                props.isCurrentUser
                                    ? 'bg-brand-primary text-brand-primary-foreground'
                                    : 'bg-muted text-muted-foreground'
                            ]"
                        >
                            {{ getInitial(props.fromUser.displayName) }}
                        </AvatarFallback>
                    </Avatar>
                    <span class="text-xs text-muted-foreground max-w-[60px] truncate text-center">
                        {{ props.fromUser.displayName || t('common.unknown') }}
                    </span>
                </div>

                <!-- Arrow + amount -->
                <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span
                        :class="[
                            'text-base font-semibold',
                            props.isCurrentUser ? 'text-brand-primary' : 'text-foreground'
                        ]"
                    >
                        {{ formatAmount(props.amount) }}
                    </span>
                    <div class="flex items-center gap-1 text-muted-foreground">
                        <div class="h-px w-6 bg-muted-foreground/40" />
                        <ArrowRight class="h-4 w-4 flex-shrink-0" />
                        <div class="h-px w-6 bg-muted-foreground/40" />
                    </div>
                    <span class="text-xs text-muted-foreground">{{ t('settlement.owes') }}</span>
                </div>

                <!-- To user avatar -->
                <div class="flex flex-col items-center gap-1 flex-shrink-0">
                    <Avatar class="h-10 w-10">
                        <AvatarImage :src="props.toUser.avatarUrl || ''" />
                        <AvatarFallback class="bg-muted text-muted-foreground text-sm font-medium">
                            {{ getInitial(props.toUser.displayName) }}
                        </AvatarFallback>
                    </Avatar>
                    <span class="text-xs text-muted-foreground max-w-[60px] truncate text-center">
                        {{ props.toUser.displayName || t('common.unknown') }}
                    </span>
                </div>

                <!-- Settle button (only for current user) -->
                <div v-if="props.isCurrentUser" class="flex-shrink-0 ml-1">
                    <Button
                        size="sm"
                        class="bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground"
                        @click="emit('settle')"
                    >
                        {{ t('settlement.settle') }}
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
