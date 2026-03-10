<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { HandCoins, Pencil } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { z } from 'zod'
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
    yearMonth?: string | null
    editSettlementId?: string | null
    editNotes?: string | null
}

const props = withDefaults(defineProps<Props>(), {
    yearMonth: null,
    editSettlementId: null,
    editNotes: null
})

const emit = defineEmits<{
    'update:open': [value: boolean]
    settled: []
}>()

const isEditMode = computed(() => !!props.editSettlementId)

const settlementSchema = toTypedSchema(z.object({
    amount: z.number({
        required_error: t('validation.required'),
        invalid_type_error: t('validation.number')
    }).positive(t('settlement.invalidAmount')),
    notes: z.string()
}))

const settlementForm = useForm({
    validationSchema: settlementSchema,
    initialValues: {
        amount: undefined,
        notes: ''
    }
})

const submitting = computed(() => settlementForm.isSubmitting.value)
const amountError = computed(() => settlementForm.errors.value.amount ?? '')

const resetSettlementForm = () => {
    settlementForm.resetForm({
        values: {
            amount: props.suggestedAmount > 0
                ? props.suggestedAmount
                : undefined,
            notes: props.editNotes ?? ''
        }
    })
}

// Sync amount with suggestedAmount whenever the drawer opens
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            resetSettlementForm()
        }
    }
)

const handleClose = () => {
    emit('update:open', false)
}

const submitSettlementForm = settlementForm.handleSubmit(async (values) => {
    try {
        if (isEditMode.value) {
            await settlementStore.updateSettlement(
                props.editSettlementId!,
                props.groupId,
                values.amount,
                values.notes.trim() || undefined
            )
            toast.success(t('settlement.editSuccess'))
        } else if (props.yearMonth) {
            await settlementStore.settleMonthlyDebt(
                props.groupId,
                props.toUser.userId,
                values.amount,
                props.yearMonth,
                values.notes.trim() || undefined
            )
            toast.success(t('settlement.settleSuccess'))
        } else {
            await settlementStore.createSettlement(
                props.groupId,
                props.toUser.userId,
                values.amount,
                values.notes.trim() || undefined
            )
            toast.success(t('settlement.settleSuccess'))
        }

        emit('settled')
        emit('update:open', false)
    } catch {
        toast.error(isEditMode.value
            ? t('settlement.editFailed')
            : t('settlement.settleFailed')
        )
    }
})
</script>

<template>
    <Drawer :open="props.open" @update:open="emit('update:open', $event)">
        <DrawerContent>
            <DrawerHeader class="px-6 pt-6 pb-4">
                <div class="flex items-center gap-3 mb-1">
                    <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-accent">
                        <Pencil v-if="isEditMode" class="h-5 w-5 text-brand-primary" />
                        <HandCoins v-else class="h-5 w-5 text-brand-primary" />
                    </div>
                    <div class="flex-1 text-left">
                        <DrawerTitle class="text-lg font-semibold">
                            {{ isEditMode
                                ? t('settlement.editDrawerTitle')
                                : t('settlement.settleDrawerTitle')
                            }}
                        </DrawerTitle>
                        <DrawerDescription class="text-sm text-muted-foreground">
                            {{ isEditMode
                                ? t('settlement.editDrawerDesc')
                                : t('settlement.settleDrawerDesc', {
                                    name: props.toUser.displayName || t('common.unknown')
                                })
                            }}
                        </DrawerDescription>
                    </div>
                </div>
            </DrawerHeader>

            <div class="px-6 pb-2 space-y-5">
                <form class="space-y-5" @submit="submitSettlementForm">
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
                                :model-value="settlementForm.values.amount ?? ''"
                                type="number"
                                min="0"
                                step="1"
                                class="pl-12 text-base h-12"
                                :class="amountError ? 'border-destructive' : ''"
                                :placeholder="t('settlement.amountPlaceholder')"
                                @update:model-value="settlementForm.setFieldValue('amount', $event === '' ? undefined : Number($event))"
                            />
                        </div>
                        <p v-if="amountError" class="text-xs text-destructive">
                            {{ amountError }}
                        </p>
                    </div>

                    <div class="space-y-2">
                        <Label for="settle-notes" class="text-sm font-medium">
                            {{ t('settlement.notes') }}
                            <span class="text-muted-foreground font-normal ml-1">
                                {{ t('common.optional') }}
                            </span>
                        </Label>
                        <textarea
                            id="settle-notes"
                            :value="settlementForm.values.notes"
                            rows="3"
                            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                            :placeholder="t('settlement.notesPlaceholder')"
                            @input="settlementForm.setFieldValue('notes', ($event.target as HTMLTextAreaElement).value)"
                        />
                    </div>

                    <DrawerFooter class="px-0 pb-4 pt-4 flex flex-col gap-2">
                        <Button
                            type="submit"
                            class="w-full h-12 bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground text-base font-medium"
                            :disabled="submitting"
                        >
                            <span v-if="submitting">{{ t('common.processing') }}</span>
                            <span v-else>
                                {{ isEditMode
                                    ? t('settlement.confirmEdit')
                                    : t('settlement.confirmSettle')
                                }}
                            </span>
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            class="w-full h-12 text-base"
                            :disabled="submitting"
                            @click="handleClose"
                        >
                            {{ t('common.cancel') }}
                        </Button>
                    </DrawerFooter>
                </form>
            </div>
        </DrawerContent>
    </Drawer>
</template>
