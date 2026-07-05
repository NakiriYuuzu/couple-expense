import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { RefreshCw, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryUtils } from '@/features/expense/lib/categories'
import { formatCurrency } from '@/shared/lib/money'
import {
    useRecurringExpenses,
    useToggleRecurringExpense,
    useDeleteRecurringExpense
} from '@/features/expense/api/recurring'
import { useGroups } from '@/features/group/api/useGroups'
import type { RecurringExpense } from '@/entities/expense/types'
import type { CurrencyType } from '@/shared/lib/database.types'

// 週期費用（訂閱）清單（Phase 5.1，對照 Vue RecurringExpenseList.vue）。
// 消費 Phase 4 recurring hooks：useRecurringExpenses（清單）、useToggleRecurringExpense（啟用/停用，
// 重新啟用時 hook 內部會對齊 next_due_date）、useDeleteRecurringExpense（刪除）。錯誤一律以 mutation
// reject 上拋 → 此處以 sonner toast 呈現。金額走 formatCurrency（不硬編貨幣符號）。

interface Props {
    onEdit: (item: RecurringExpense) => void
}

export function RecurringExpenseList({ onEdit }: Props) {
    const { t } = useTranslation()
    const { data: groupsData } = useGroups()
    const { data, isLoading } = useRecurringExpenses()
    const toggle = useToggleRecurringExpense()
    const remove = useDeleteRecurringExpense()

    const items = data ?? []
    const groupCurrencies = useMemo(() => {
        const map = new Map<string, CurrencyType>()
        for (const g of groupsData ?? []) {
            map.set(g.group.id, g.settings?.currency ?? 'TWD')
        }
        return map
    }, [groupsData])

    const handleToggle = async (item: RecurringExpense) => {
        try {
            await toggle.mutateAsync(item)
            toast.success(t('recurring.toggleSuccess'))
        } catch {
            toast.error(t('recurring.toggleError'))
        }
    }

    const handleDelete = async (item: RecurringExpense) => {
        try {
            await remove.mutateAsync(item.id)
            toast.success(t('recurring.deleteSuccess'))
        } catch {
            toast.error(t('recurring.deleteError'))
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="glass flex items-center gap-3 rounded-2xl p-4">
                        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                        </div>
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                    </div>
                ))}
            </div>
        )
    }

    if (items.length === 0) {
        return (
            <div className="py-12 text-center">
                <RefreshCw className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="mb-1 text-sm font-medium text-muted-foreground">{t('recurring.empty')}</p>
                <p className="text-xs text-muted-foreground/70">{t('recurring.emptyDesc')}</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {items.map((item) => {
                const Icon = CategoryUtils.getIconByCategory(item.category)
                const itemCurrency = item.group_id ? groupCurrencies.get(item.group_id) ?? 'TWD' : 'TWD'
                return (
                    <div
                        key={item.id}
                        className={`glass rounded-2xl p-4 transition-all ${item.is_active ? '' : 'opacity-50'}`}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                                style={{ backgroundColor: CategoryUtils.getCategoryBgColor(item.category) }}
                            >
                                <Icon
                                    className="h-5 w-5"
                                    style={{ color: CategoryUtils.getCategoryColor(item.category) }}
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t('recurring.dueOn', { day: item.recurrence_day })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t('recurring.nextDue', { date: item.next_due_date })}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold text-foreground">
                                    {formatCurrency(item.amount, itemCurrency)}
                                </p>
                                <p className="text-xs text-muted-foreground">{t('recurring.monthlyAmount')}</p>
                            </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2 border-t border-glass-border pt-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="press-feedback hover-transition h-8 flex-1 rounded-full text-xs"
                                onClick={() => handleToggle(item)}
                            >
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                {item.is_active ? t('recurring.deactivate') : t('recurring.activate')}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="press-feedback hover-transition h-8 flex-1 rounded-full text-xs"
                                onClick={() => onEdit(item)}
                            >
                                <Pencil className="mr-1 h-3.5 w-3.5" />
                                {t('common.edit')}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="press-feedback hover-transition h-8 flex-1 rounded-full text-xs text-destructive hover:text-destructive"
                                onClick={() => handleDelete(item)}
                            >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                {t('common.delete')}
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
