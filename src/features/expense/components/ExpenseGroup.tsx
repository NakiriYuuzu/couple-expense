import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, MoreHorizontal, Trash2 } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ExpenseItem } from './ExpenseItem'
import { formatCurrency } from '@/shared/lib/money'
import type { DisplayExpense } from '@/entities/expense/types'
import type { CurrencyType } from '@/shared/lib/database.types'

// 依日期分組容器（Phase 5.1，對照 Vue ExpenseGroup.vue）。標題列顯示日期 + 當日總計，
// 內容為該日的 ExpenseItem 清單。當日總計以 numericAmount 依幣別加總後走 formatCurrency（不 regex
// 解析已格式化字串）。可選的「全部刪除」入口以 onDeleteAll(expenses) 回拋——由父層接
// useDeleteExpense 的 deleteByDate（批次刪除不可 undo，parity-neutral）。

interface Props {
    date: string
    expenses: DisplayExpense[]
    showUser?: boolean
    currency?: CurrencyType
    onExpenseClick: (id: string) => void
    onDeleteAll?: (expenses: DisplayExpense[]) => void
}

export function ExpenseGroup({
    date,
    expenses,
    showUser = false,
    currency = 'TWD',
    onExpenseClick,
    onDeleteAll
}: Props) {
    const { t } = useTranslation()
    const [confirmOpen, setConfirmOpen] = useState(false)

    const dailyTotals = useMemo(() => {
        const totals = new Map<CurrencyType, number>()
        for (const e of expenses) {
            const rowCurrency = e.currency ?? currency
            totals.set(rowCurrency, (totals.get(rowCurrency) ?? 0) + (e.numericAmount ?? 0))
        }
        return [...totals.entries()]
    }, [expenses, currency])

    const confirmDeleteAll = () => {
        onDeleteAll?.(expenses)
        setConfirmOpen(false)
    }

    return (
        <div className="glass hover-transition min-w-0 rounded-2xl p-4">
            {/* 日期標題列 */}
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <h3 className="truncate text-sm font-normal text-foreground">{date}</h3>
                </div>
                <div className="ml-auto flex max-w-full min-w-0 items-center justify-end gap-2">
                    <span className="min-w-0 text-right text-sm font-semibold text-expense [overflow-wrap:anywhere]">
                        {dailyTotals.map(([totalCurrency, total]) => formatCurrency(total, totalCurrency)).join(' / ')}
                    </span>
                    {onDeleteAll && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 rounded-full hover:bg-accent"
                                    aria-label={t('expense.moreActions')}
                                >
                                    <MoreHorizontal className="h-4 w-4 text-foreground" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                    className="cursor-pointer text-destructive focus:text-destructive"
                                    onSelect={() => setConfirmOpen(true)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {t('expense.deleteAll')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            {/* 費用列表 */}
            <div className="min-w-0 space-y-2">
                {expenses.map((expense) => (
                    <ExpenseItem
                        key={expense.id}
                        title={expense.title}
                        amount={expense.amount}
                        category={expense.category}
                        icon={expense.icon}
                        user={expense.user}
                        showUser={showUser}
                        groupName={expense.groupName ?? null}
                        splitMethod={expense.splitMethod ?? null}
                        isSettled={expense.isSettled}
                        onClick={() => expense.id && onExpenseClick(expense.id)}
                    />
                ))}
            </div>

            {/* 全部刪除確認 */}
            {onDeleteAll && (
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <DialogContent className="bg-card sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{t('expense.confirmDeleteTitle')}</DialogTitle>
                            <DialogDescription>
                                {t('expense.confirmDeleteDateDesc', { date })}
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button variant="destructive" onClick={confirmDeleteAll}>
                                {t('expense.confirmDeleteBtn')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}