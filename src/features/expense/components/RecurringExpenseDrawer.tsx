import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryUtils, categoryIds } from '@/features/expense/lib/categories'
import { formatCurrency } from '@/shared/lib/money'
import { taipeiDateString } from '@/shared/lib/datetime'
import { cn } from '@/shared/lib/utils'
import {
    useCreateRecurringExpense,
    useUpdateRecurringExpense
} from '@/features/expense/api/recurring'
import { useActiveGroup, useGroups } from '@/features/group/api/useGroups'
import type {
    RecurringExpense,
    CreateRecurringExpenseData,
    UpdateRecurringExpenseData,
    CategoryId
} from '@/entities/expense/types'
import type { CurrencyType } from '@/shared/lib/database.types'

// 週期費用新增/編輯抽屜（Phase 5.1，對照 Vue RecurringExpenseDrawer.vue）。
// 走 Phase 4 useCreateRecurringExpense / useUpdateRecurringExpense。next_due_date 由 recurrence_day
// 以 Taipei 日曆基準推算（對齊 recurring.ts:computeNextDueDate，避免裝置時區飄日）。

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    editItem?: RecurringExpense | null
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

// 依 recurrence_day 推算下次到期日（Taipei 基準、含當日、月底截斷），對齊 recurring.ts 的私有實作。
function computeNextDueDate(day: number): string {
    const [year, month, today] = taipeiDateString().split('-').map(Number)
    const daysInThisMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
    const clampedDay = Math.min(day, daysInThisMonth)
    if (clampedDay >= today!) {
        return `${year}-${pad2(month!)}-${pad2(clampedDay)}`
    }
    const nextMonth = month! === 12 ? 1 : month! + 1
    const nextYear = month! === 12 ? year! + 1 : year!
    const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
    const clampedNextDay = Math.min(day, daysInNextMonth)
    return `${nextYear}-${pad2(nextMonth)}-${pad2(clampedNextDay)}`
}

const DEFAULT_CATEGORY: CategoryId = 'other'

export function RecurringExpenseDrawer({ open, onOpenChange, editItem }: Props) {
    const { t } = useTranslation()
    const { activeGroupId } = useActiveGroup()
    const { data: groupsData } = useGroups()
    const create = useCreateRecurringExpense()
    const update = useUpdateRecurringExpense()
    const isEdit = !!editItem

    const [title, setTitle] = useState('')
    const [amount, setAmount] = useState('')
    const [category, setCategory] = useState<CategoryId>(DEFAULT_CATEGORY)
    const [recurrenceDay, setRecurrenceDay] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // 開啟時初始化：編輯帶入既有值；新增回填「今天的號數」為預設 recurrence_day。
    useEffect(() => {
        if (!open) return
        if (editItem) {
            setTitle(editItem.title)
            setAmount(String(editItem.amount))
            setCategory(editItem.category)
            setRecurrenceDay(String(editItem.recurrence_day))
            setNotes(editItem.notes ?? '')
        } else {
            const [, , todayDay] = taipeiDateString().split('-')
            setTitle('')
            setAmount('')
            setCategory(DEFAULT_CATEGORY)
            setRecurrenceDay(todayDay ?? '')
            setNotes('')
        }
    }, [open, editItem])

    const groupCurrencies = useMemo(() => {
        const map = new Map<string, CurrencyType>()
        for (const g of groupsData ?? []) {
            if (g.settings?.currency) {
                map.set(g.group.id, g.settings.currency)
            }
        }
        return map
    }, [groupsData])
    const currency = editItem
        ? editItem.group_id
            ? groupCurrencies.get(editItem.group_id) ?? 'TWD'
            : 'TWD'
        : activeGroupId
            ? groupCurrencies.get(activeGroupId) ?? null
            : 'TWD'
    const currencyReady = currency !== null
    const currencySymbol = useMemo(
        () => currency ? formatCurrency(0, currency).replace(/[\d.,\s]/g, '') : '',
        [currency]
    )

    const dayNum = parseInt(recurrenceDay, 10)
    const amountNum = parseFloat(amount)
    const isValid =
        currencyReady &&
        title.trim() !== '' &&
        Number.isFinite(amountNum) &&
        amountNum > 0 &&
        !Number.isNaN(dayNum) &&
        dayNum >= 1 &&
        dayNum <= 31

    const nextDuePreview = isValid ? computeNextDueDate(dayNum) : ''

    const handleSubmit = async () => {
        if (!isValid || submitting) return
        setSubmitting(true)
        const nextDueDate = computeNextDueDate(dayNum)
        try {
            if (isEdit && editItem) {
                const payload: UpdateRecurringExpenseData = {
                    title: title.trim(),
                    amount: amountNum,
                    category,
                    recurrence_day: dayNum,
                    next_due_date: nextDueDate,
                    notes: notes.trim() || undefined
                }
                await update.mutateAsync({ id: editItem.id, payload })
                toast.success(t('recurring.updateSuccess'))
            } else {
                const payload: CreateRecurringExpenseData = {
                    title: title.trim(),
                    amount: amountNum,
                    category,
                    recurrence_day: dayNum,
                    next_due_date: nextDueDate,
                    notes: notes.trim() || undefined
                }
                await create.mutateAsync(payload)
                toast.success(t('recurring.createSuccess'))
            }
            onOpenChange(false)
        } catch {
            toast.error(isEdit ? t('recurring.updateError') : t('recurring.createError'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="flex max-h-[90vh] flex-col border-t border-glass-border-strong bg-card">
                <DrawerHeader className="shrink-0 pb-2 text-center">
                    <DrawerTitle className="text-xl font-semibold text-foreground">
                        {isEdit ? t('recurring.edit') : t('recurring.add')}
                    </DrawerTitle>
                    <DrawerDescription className="mt-1 text-xs text-muted-foreground">
                        {t('recurring.emptyDesc')}
                    </DrawerDescription>
                </DrawerHeader>

                <div className="flex-1 overflow-y-auto px-4">
                    <div className="space-y-4 pt-2 pb-4">
                        {/* 標題 */}
                        <div className="space-y-1.5">
                            <label htmlFor="recurring-title" className="text-sm font-medium text-foreground">
                                {t('expense.title')}
                            </label>
                            <Input
                                id="recurring-title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={t('expense.titlePlaceholder')}
                                className="h-12"
                                autoComplete="off"
                            />
                        </div>

                        {/* 金額 */}
                        <div className="space-y-1.5">
                            <label htmlFor="recurring-amount" className="text-sm font-medium text-foreground">
                                {t('expense.amount')}
                            </label>
                            <div className="relative">
                                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                    {currencyReady ? currencySymbol : t('common.loading')}
                                </span>
                                <Input
                                    id="recurring-amount"
                                    type="number"
                                    inputMode="numeric"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    step="1"
                                    className="h-12 pl-12"
                                />
                            </div>
                        </div>

                        {/* 類別 */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">
                                {t('expense.category')}
                            </label>
                            <div className="grid grid-cols-3 gap-2.5">
                                {categoryIds.map((id) => {
                                    const Icon = CategoryUtils.getIconByCategory(id)
                                    const selected = category === id
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setCategory(id)}
                                            aria-pressed={selected}
                                            className={cn(
                                                'press-feedback flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all duration-200',
                                                selected ? 'glass-heavy' : 'glass-light border-transparent hover:glass'
                                            )}
                                            style={selected ? { borderColor: CategoryUtils.getCategoryColor(id) } : undefined}
                                        >
                                            <span
                                                className="flex h-10 w-10 items-center justify-center rounded-xl"
                                                style={{
                                                    backgroundColor: selected
                                                        ? CategoryUtils.getCategoryColor(id)
                                                        : CategoryUtils.getCategoryBgColor(id)
                                                }}
                                            >
                                                <Icon
                                                    className="h-5 w-5"
                                                    style={{ color: selected ? 'white' : CategoryUtils.getCategoryColor(id) }}
                                                />
                                            </span>
                                            <span className="text-center text-xs leading-tight font-medium text-foreground">
                                                {t(`expense.categories.${id}`)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* 每月幾號 */}
                        <div className="space-y-1.5">
                            <label htmlFor="recurring-day" className="text-sm font-medium text-foreground">
                                {t('recurring.recurrenceDay')}
                            </label>
                            <Input
                                id="recurring-day"
                                type="number"
                                inputMode="numeric"
                                value={recurrenceDay}
                                onChange={(e) => setRecurrenceDay(e.target.value)}
                                min="1"
                                max="31"
                                placeholder={t('recurring.recurrenceDayPlaceholder')}
                                className="h-12"
                            />
                            {nextDuePreview && (
                                <p className="text-xs text-muted-foreground">
                                    {t('recurring.nextDueDate')}: {nextDuePreview}
                                </p>
                            )}
                        </div>

                        {/* 備註 */}
                        <div className="space-y-1.5">
                            <label htmlFor="recurring-notes" className="text-sm font-medium text-foreground">
                                {t('expense.notes')}{' '}
                                <span className="text-xs text-muted-foreground">({t('common.optional')})</span>
                            </label>
                            <Input
                                id="recurring-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={t('expense.notesPlaceholder')}
                                className="h-12"
                            />
                        </div>
                    </div>
                </div>

                <div className="shrink-0 border-t border-border bg-card px-4 py-4">
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="h-12 flex-1 border-border text-foreground hover:bg-accent"
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!isValid || submitting}
                            className="press-feedback h-12 flex-1 bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
                        >
                            {submitting ? t('common.saving') : t('common.save')}
                        </Button>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
