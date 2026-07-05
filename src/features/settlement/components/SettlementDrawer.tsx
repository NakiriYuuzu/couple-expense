import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HandCoins, Pencil } from 'lucide-react'
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    DrawerFooter
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettleMonthlyDebt, useUpdateSettlement } from '@/features/settlement/api/mutations'
import { formatCurrency } from '@/shared/lib/money'
import { currentYearMonth } from '@/shared/lib/datetime'
import type { CurrencyType } from '@/shared/lib/database.types'

// 結算 / 編輯結算抽屜（對照 Vue SettlementDrawer.vue）。刻意只保留兩種模式：
//   - 結算：一律走 settleMonthlyDebt（帶 yearMonth；RPC 以 auth user 為付款方，故僅 debtor 觸發）
//   - 編輯：走 updateSettlement
// 金額限正整數；結算模式上限為建議（債務）金額；成功 toast 後關閉，送出中停用確認。

interface DrawerTarget {
    userId: string
    displayName: string | null
}

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    groupId: string
    toUser: DrawerTarget
    suggestedAmount: number
    yearMonth: string | null
    currency: CurrencyType
    editSettlementId: string | null
    editNotes: string | null
}

export function SettlementDrawer({
    open,
    onOpenChange,
    groupId,
    toUser,
    suggestedAmount,
    yearMonth,
    currency,
    editSettlementId,
    editNotes
}: Props) {
    const { t } = useTranslation()
    const settle = useSettleMonthlyDebt()
    const update = useUpdateSettlement()
    const isEdit = !!editSettlementId

    const [amount, setAmount] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // 開啟時回填建議金額與備註（對齊 Vue watch(open) → resetSettlementForm）。
    useEffect(() => {
        if (!open) return
        setAmount(suggestedAmount > 0 ? String(suggestedAmount) : '')
        setNotes(editNotes ?? '')
        setSubmitting(false)
    }, [open, suggestedAmount, editNotes])

    const currencySymbol = useMemo(
        () => formatCurrency(0, currency).replace(/[\d.,\s]/g, ''),
        [currency]
    )

    const amountNum = Number(amount)
    const isValid =
        amount.trim() !== '' &&
        Number.isInteger(amountNum) &&
        amountNum >= 1 &&
        (isEdit || amountNum <= suggestedAmount)

    const pending = submitting || settle.isPending || update.isPending

    const handleConfirm = async () => {
        if (!isValid || pending) return
        setSubmitting(true)
        try {
            if (isEdit && editSettlementId) {
                await update.mutateAsync({
                    settlementId: editSettlementId,
                    groupId,
                    amount: amountNum,
                    notes: notes.trim() || undefined
                })
                toast.success(t('settlement.editSuccess'))
            } else {
                await settle.mutateAsync({
                    groupId,
                    paidTo: toUser.userId,
                    amount: amountNum,
                    yearMonth: yearMonth ?? currentYearMonth(),
                    notes: notes.trim() || undefined
                })
                toast.success(t('settlement.settleSuccess'))
            }
            onOpenChange(false)
        } catch {
            toast.error(isEdit ? t('settlement.editFailed') : t('settlement.settleFailed'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="flex flex-col border-t border-glass-border-strong bg-card">
                <DrawerHeader className="px-6 pt-6 pb-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-accent text-brand-primary">
                            {isEdit ? <Pencil className="h-5 w-5" /> : <HandCoins className="h-5 w-5" />}
                        </span>
                        <div className="flex-1 text-left">
                            <DrawerTitle className="text-lg font-semibold text-foreground">
                                {isEdit
                                    ? t('settlement.editDrawerTitle')
                                    : t('settlement.settleDrawerTitle')}
                            </DrawerTitle>
                            <DrawerDescription className="text-sm text-muted-foreground">
                                {isEdit
                                    ? t('settlement.editDrawerDesc')
                                    : t('settlement.settleDrawerDesc')}
                            </DrawerDescription>
                        </div>
                    </div>
                </DrawerHeader>

                <div className="space-y-5 px-6 pb-2">
                    <div className="space-y-2">
                        <label htmlFor="settle-amount" className="text-sm font-medium text-foreground">
                            {t('settlement.amount')}
                        </label>
                        <div className="relative">
                            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                {currencySymbol}
                            </span>
                            <Input
                                id="settle-amount"
                                type="number"
                                inputMode="numeric"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                min="1"
                                step="1"
                                placeholder={t('settlement.amountPlaceholder')}
                                className="h-12 pl-12"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="settle-notes" className="text-sm font-medium text-foreground">
                            {t('settlement.notes')}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                                ({t('common.optional')})
                            </span>
                        </label>
                        <Input
                            id="settle-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder={t('settlement.notesPlaceholder')}
                            className="h-12"
                        />
                    </div>
                </div>

                <DrawerFooter className="gap-2 px-6 pt-4 pb-6">
                    <Button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!isValid || pending}
                        className="press-feedback h-12 w-full bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
                    >
                        {pending
                            ? t('common.processing')
                            : isEdit
                                ? t('settlement.confirmEdit')
                                : t('settlement.confirmSettle')}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={pending}
                        className="h-12 w-full"
                    >
                        {t('common.cancel')}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}
