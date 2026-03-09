<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { HandCoins } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    DrawerFooter
} from '@/shared/components/ui/drawer'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useSettlementStore } from '@/features/settlement/stores/settlement'

const { t } = useI18n()
const settlementStore = useSettlementStore()

interface ToUser {
    userId: string
    displayName: string | null
}

interface Props {
    open: boolean
    groupId: string
    toUser: ToUser
    suggestedAmount: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    settled: []
}>()

const amount = ref<string>('')
const notes = ref<string>('')
const submitting = ref(false)

// Sync amount with suggestedAmount whenever the drawer opens
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            amount.value = props.suggestedAmount > 0
                ? props.suggestedAmount.toString()
                : ''
            notes.value = ''
        }
    }
)

const handleClose = () => {
    emit('update:open', false)
}

const handleConfirm = async () => {
    const parsedAmount = parseFloat(amount.value)

    if (!amount.value || isNaN(parsedAmount) || parsedAmount <= 0) {
        toast.error(t('settlement.invalidAmount'))
        return
    }

    submitting.value = true

    try {
        await settlementStore.createSettlement(
            props.groupId,
            props.toUser.userId,
            parsedAmount,
            notes.value.trim() || undefined
        )

        toast.success(t('settlement.settleSuccess'))
        emit('settled')
        emit('update:open', false)
    } catch {
        toast.error(t('settlement.settleFailed'))
    } finally {
        submitting.value = false
    }
}
</script>

<template>
    <Drawer :open="props.open" @update:open="emit('update:open', $event)">
        <DrawerContent>
            <DrawerHeader class="px-6 pt-6 pb-4">
                <div class="flex items-center gap-3 mb-1">
                    <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-accent">
                        <HandCoins class="h-5 w-5 text-brand-primary" />
                    </div>
                    <div class="flex-1 text-left">
                        <DrawerTitle class="text-lg font-semibold">
                            {{ t('settlement.settleDrawerTitle') }}
                        </DrawerTitle>
                        <DrawerDescription class="text-sm text-muted-foreground">
                            {{
                                t('settlement.settleDrawerDesc', {
                                    name: props.toUser.displayName || t('common.unknown')
                                })
                            }}
                        </DrawerDescription>
                    </div>
                </div>
            </DrawerHeader>

            <div class="px-6 pb-2 space-y-5">
                <!-- Amount input -->
                <div class="space-y-2">
                    <Label for="settle-amount" class="text-sm font-medium">
                        {{ t('settlement.amount') }}
                    </Label>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                            NT$
                        </span>
                        <Input
                            id="settle-amount"
                            v-model="amount"
                            type="number"
                            min="0"
                            step="1"
                            class="pl-12 text-base h-12"
                            :placeholder="t('settlement.amountPlaceholder')"
                        />
                    </div>
                </div>

                <!-- Notes textarea -->
                <div class="space-y-2">
                    <Label for="settle-notes" class="text-sm font-medium">
                        {{ t('settlement.notes') }}
                        <span class="text-muted-foreground font-normal ml-1">
                            {{ t('common.optional') }}
                        </span>
                    </Label>
                    <textarea
                        id="settle-notes"
                        v-model="notes"
                        rows="3"
                        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                        :placeholder="t('settlement.notesPlaceholder')"
                    />
                </div>
            </div>

            <DrawerFooter class="px-6 pb-6 pt-4 flex flex-col gap-2">
                <Button
                    class="w-full h-12 bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground text-base font-medium"
                    :disabled="submitting || !amount || parseFloat(amount) <= 0"
                    @click="handleConfirm"
                >
                    <span v-if="submitting">{{ t('common.processing') }}</span>
                    <span v-else>
                        {{ t('settlement.confirmSettle') }}
                    </span>
                </Button>
                <Button
                    variant="ghost"
                    class="w-full h-12 text-base"
                    :disabled="submitting"
                    @click="handleClose"
                >
                    {{ t('common.cancel') }}
                </Button>
            </DrawerFooter>
        </DrawerContent>
    </Drawer>
</template>
