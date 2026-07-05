import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Trash2, User, Calendar, DollarSign, Loader2, HandCoins } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SplitConfigurator } from '@/features/split/components/SplitConfigurator'
import { calcSplits } from '@/features/split/lib/calcSplits'
import { useExpenses } from '@/features/expense/api/useExpenses'
import { useExpenseSplits } from '@/features/expense/api/useExpenseSplits'
import { useUpdateExpense } from '@/features/expense/api/useUpdateExpense'
import type { UpdateExpenseInput } from '@/features/expense/api/useUpdateExpense'
import { useDeleteExpense } from '@/features/expense/api/useDeleteExpense'
import { useSettleExpense } from '@/features/settlement/api/mutations'
import { useGroups } from '@/features/group/api/useGroups'
import { loadProfiles } from '@/features/group/api/profiles'
import { useAuthStore } from '@/features/auth/authStore'
import { DatePicker } from '@/shared/components/DatePicker'
import { CategoryUtils, categoryIds } from '@/features/expense/lib/categories'
import { formatCurrency } from '@/shared/lib/money'
import { queryKeys } from '@/shared/lib/queryKeys'
import { cn } from '@/shared/lib/utils'
import type { CategoryId } from '@/entities/expense/types'
import type { SplitParticipant } from '@/entities/split/types'
import type { SplitMethod } from '@/shared/lib/database.types'

// 支出詳情（Phase 5.1，對照 Vue ExpenseDetailPage.vue）。
//   顯示：從 useExpenses 找該筆 + useExpenseSplits 顯示分帳明細（僅群組費用）。
//   編輯：群組費用走 useUpdateExpense 原子 RPC（複用 SplitConfigurator 編輯 splits）；個人費用裸表 update。
//   單筆結清：useSettleExpense（群組且未結算時）。
//   刪除 + 完整 undo：useDeleteExpense 的 remove→snapshot→undo，以 sonner action toast 提供復原。
// 金額全走 formatCurrency + 該費用所屬群組幣別。

export default function ExpenseDetailPage({ id }: { id: string }) {
    const { t } = useTranslation()
    const router = useRouter()
    const client = useQueryClient()
    const currentUserId = useAuthStore((s) => s.user?.id ?? null)

    const { data: expensesData, isLoading } = useExpenses()
    const expense = useMemo(
        () => (expensesData ?? []).find((e) => e.id === id) ?? null,
        [expensesData, id]
    )

    const isGroup = !!expense?.group_id
    const { data: groupsData } = useGroups()
    const groupDetails = expense?.group_id
        ? groupsData?.find((g) => g.group.id === expense.group_id) ?? null
        : null
    const currency = groupDetails?.settings?.currency ?? 'TWD'
    const members = groupDetails?.members ?? []

    const {
        data: splitsData,
        isLoading: splitsLoading,
        isError: splitsError,
        isSuccess: splitsLoaded
    } = useExpenseSplits(isGroup ? id : null)
    const splits = useMemo(() => splitsData ?? [], [splitsData])
    const groupMembersReady = !isGroup || splits.length > 0 || members.length > 0
    const groupSplitsReady = !isGroup || (splitsLoaded && groupMembersReady)

    // 分帳成員名稱（reuse Phase 4 profiles.ts；union 成員 + split user 以覆蓋編輯與明細）。
    const profileIds = useMemo(
        () => [...new Set([...members.map((m) => m.user_id), ...splits.map((s) => s.user_id)])],
        [members, splits]
    )
    const profileIdsKey = useMemo(() => [...profileIds].sort().join(','), [profileIds])
    const { data: profileMap } = useQuery({
        queryKey: queryKeys.detailProfiles(profileIdsKey),
        queryFn: () => loadProfiles(client, profileIds),
        enabled: profileIds.length > 0
    })
    const resolveName = (userId: string): string => {
        if (userId === currentUserId) return t('common.me')
        return profileMap?.get(userId)?.display_name || t('expense.unknownUser')
    }

    // ── 編輯狀態 ───────────────────────────────────────────────
    const [editOpen, setEditOpen] = useState(false)
    const [editTitle, setEditTitle] = useState('')
    const [editAmount, setEditAmount] = useState<number | undefined>(undefined)
    const [editCategory, setEditCategory] = useState<CategoryId>('food')
    const [editDate, setEditDate] = useState('')
    const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal')
    const [paidBy, setPaidBy] = useState('')
    const [participants, setParticipants] = useState<SplitParticipant[]>([])

    const [deleteOpen, setDeleteOpen] = useState(false)
    const [settleOpen, setSettleOpen] = useState(false)

    const updateExpense = useUpdateExpense()
    const settleExpense = useSettleExpense()
    const { remove, undo } = useDeleteExpense()

    const editCalc = useMemo(
        () => calcSplits(splitMethod, editAmount ?? 0, participants),
        [splitMethod, editAmount, participants]
    )

    const buildEditParticipants = (): SplitParticipant[] => {
        const splitMap = new Map(splits.map((s) => [s.user_id, s]))
        const ids = [...new Set([...members.map((m) => m.user_id), ...splitMap.keys()])]
        return ids.map((userId) => {
            const s = splitMap.get(userId)
            return {
                userId,
                displayName: null,
                avatarUrl: null,
                amount: s?.amount ?? 0,
                percentage: s?.percentage ?? undefined,
                shares: s?.shares ?? undefined,
                isIncluded: s !== undefined || splits.length === 0
            }
        })
    }

    const openEdit = () => {
        if (!expense) return
        if (expense.group_id && !groupSplitsReady) return
        setEditTitle(expense.title)
        setEditAmount(expense.amount)
        setEditCategory(expense.category as CategoryId)
        setEditDate(expense.date)
        if (expense.group_id) {
            setSplitMethod((expense.split_method ?? 'equal') as SplitMethod)
            setPaidBy(expense.paid_by ?? expense.user_id)
            setParticipants(buildEditParticipants())
        }
        setEditOpen(true)
    }

    const editValid =
        editTitle.trim().length > 0 &&
        editAmount !== undefined &&
        Number.isInteger(editAmount) &&
        editAmount > 0 &&
        editDate.length > 0 &&
        groupSplitsReady

    const saveEdit = async () => {
        if (!expense || !editValid || updateExpense.isPending) return
        const updates: UpdateExpenseInput = {
            title: editTitle.trim(),
            amount: editAmount as number,
            category: editCategory,
            date: editDate
        }
        try {
            if (expense.group_id) {
                if (!editCalc.isBalanced) {
                    toast.error(t('split.notBalanced'))
                    return
                }
                const included = participants.filter((p) => p.isIncluded)
                const splitPayload = included.map((p, i) => ({
                    userId: p.userId,
                    amount: editCalc.amounts[i] ?? 0,
                    percentage: splitMethod === 'percentage' ? p.percentage : undefined,
                    shares: splitMethod === 'shares' ? p.shares : undefined
                }))
                await updateExpense.mutateAsync({
                    id,
                    groupId: expense.group_id,
                    updates: { ...updates, split_method: splitMethod, paid_by: paidBy, is_settled: false },
                    splits: splitPayload
                })
            } else {
                await updateExpense.mutateAsync({ id, groupId: null, updates })
            }
            setEditOpen(false)
            toast.success(t('expense.updated'))
        } catch {
            toast.error(t('expense.updateFailed'))
        }
    }

    const handleDelete = async () => {
        if (!expense) return
        setDeleteOpen(false)
        const title = expense.title
        try {
            const snapshot = await remove.mutateAsync({ expenseId: id, groupId: expense.group_id })
            router.history.back()
            toast.success(`${t('expense.deleted')}「${title}」`, {
                action: {
                    label: t('common.undo'),
                    onClick: () => {
                        void undo
                            .mutateAsync(snapshot)
                            .then(() => toast.success(t('expense.restored')))
                            .catch(() => toast.error(t('expense.restoreFailed')))
                    }
                },
                duration: 5000
            })
        } catch {
            toast.error(t('expense.deleteFailed'))
        }
    }

    const handleSettle = async () => {
        if (!expense?.group_id) return
        setSettleOpen(false)
        try {
            const count = await settleExpense.mutateAsync({ expenseId: id, groupId: expense.group_id })
            toast.success(t('settlement.expenseSettleSuccess', { count }))
        } catch {
            toast.error(t('settlement.expenseSettleFailed'))
        }
    }

    // ── 載入 / 找不到 ──────────────────────────────────────────
    if (!expense && isLoading) {
        return (
            <main className="flex flex-col items-center justify-center gap-4 px-4 py-20">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            </main>
        )
    }

    if (!expense) {
        return (
            <main className="px-4 py-12 text-center">
                <p className="text-muted-foreground">{t('expense.notFound')}</p>
            </main>
        )
    }

    const HeroIcon = CategoryUtils.getIconByCategory(expense.category)
    const canSettle = isGroup && !expense.is_settled

    return (
        <main className="space-y-4 px-4 pt-6 pb-28">
            {/* 基本資訊 Hero */}
            <div
                className="glass-elevated space-y-4 rounded-2xl p-5"
                style={{
                    background: `linear-gradient(135deg, var(--category-${expense.category}-bg), var(--card))`
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-accent">
                        <HeroIcon className="h-7 w-7 text-brand-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-medium text-card-foreground">{expense.title}</h2>
                        <p className="text-xs text-muted-foreground">{t(`expense.categories.${expense.category}`)}</p>
                    </div>
                    {expense.split_method && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {t(`split.methods.${expense.split_method}`)}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-4xl font-bold text-expense">
                        {formatCurrency(expense.amount, currency)}
                    </span>
                    {expense.is_settled && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-green-600">
                            {t('expense.settled')}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {expense.date.replace(/-/g, '/')}
                    </span>
                    {isGroup && expense.user && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            {t('expense.paidBy')}: {expense.user.display_name || t('expense.unknownUser')}
                        </span>
                    )}
                </div>

                {expense.notes && (
                    <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-xs leading-relaxed text-muted-foreground">{expense.notes}</p>
                    </div>
                )}
            </div>

            {/* 分帳明細（僅群組） */}
            {isGroup && (
                <div className="glass space-y-3 rounded-2xl p-5">
                    <h3 className="text-sm font-medium text-foreground">{t('split.detail')}</h3>
                    {splitsLoading ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">{t('common.loading')}</p>
                    ) : splitsError ? (
                        <p className="py-4 text-center text-xs text-destructive">{t('common.error')}</p>
                    ) : splitsLoaded && splits.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">{t('split.noData')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {splits.map((s) => (
                                <li key={s.id} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-accent text-[10px] text-brand-primary">
                                            {resolveName(s.user_id).charAt(0) || '?'}
                                        </span>
                                        <span className="text-xs text-foreground">{resolveName(s.user_id)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {s.percentage !== null && (
                                            <span className="text-[10px] text-muted-foreground">{s.percentage}%</span>
                                        )}
                                        {s.shares !== null && (
                                            <span className="text-[10px] text-muted-foreground">×{s.shares}</span>
                                        )}
                                        <span className="text-xs font-medium text-expense">
                                            {formatCurrency(s.amount, currency)}
                                        </span>
                                        {s.is_settled && (
                                            <span className="rounded-full bg-muted px-1 py-0 text-[9px] text-green-600">
                                                {t('expense.settled')}
                                            </span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* 結清此筆 */}
            {canSettle && (
                <Button
                    className="press-feedback w-full bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90"
                    disabled={settleExpense.isPending}
                    onClick={() => setSettleOpen(true)}
                >
                    <HandCoins className="mr-2 h-4 w-4" />
                    {settleExpense.isPending ? t('common.processing') : t('settlement.settleExpense')}
                </Button>
            )}

            {/* 編輯 / 刪除 */}
            <div className="flex gap-3">
                <Button
                    variant="outline"
                    className="press-feedback flex-1"
                    disabled={!groupSplitsReady}
                    onClick={openEdit}
                >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('common.edit')}
                </Button>
                <Button variant="destructive" className="press-feedback flex-1" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('common.delete')}
                </Button>
            </div>

            {/* 刪除確認 */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="bg-card sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('expense.confirmDelete')}</DialogTitle>
                        <DialogDescription>{t('expense.confirmDeleteDesc')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            {t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 結清確認 */}
            <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
                <DialogContent className="bg-card sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('settlement.expenseSettleConfirmTitle')}</DialogTitle>
                        <DialogDescription>{t('settlement.expenseSettleConfirmDesc')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSettleOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handleSettle}>{t('settlement.confirmSettle')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 編輯 Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-card sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('expense.edit')}</DialogTitle>
                        <DialogDescription>{t('expense.editDesc')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="detail-edit-title">{t('expense.title')}</Label>
                            <Input
                                id="detail-edit-title"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder={t('expense.titlePlaceholder')}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="detail-edit-amount">{t('expense.amount')}</Label>
                            <Input
                                id="detail-edit-amount"
                                type="number"
                                inputMode="numeric"
                                min="0"
                                step="1"
                                value={editAmount ?? ''}
                                onChange={(e) =>
                                    setEditAmount(e.target.value === '' ? undefined : Number(e.target.value))
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>{t('expense.category')}</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {categoryIds.map((cid) => {
                                    const Icon = CategoryUtils.getIconByCategory(cid)
                                    const selected = editCategory === cid
                                    return (
                                        <button
                                            key={cid}
                                            type="button"
                                            onClick={() => setEditCategory(cid)}
                                            aria-pressed={selected}
                                            className={cn(
                                                'flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 transition-all duration-200',
                                                selected
                                                    ? 'border-brand-primary bg-brand-accent'
                                                    : 'border-border bg-background hover:border-brand-primary/50'
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'flex h-8 w-8 items-center justify-center rounded-lg',
                                                    selected ? 'bg-brand-primary' : 'bg-brand-accent'
                                                )}
                                            >
                                                <Icon
                                                    className={cn(
                                                        'h-4 w-4',
                                                        selected ? 'text-brand-primary-foreground' : 'text-brand-primary'
                                                    )}
                                                />
                                            </span>
                                            <span className="text-xs font-medium">{t(`expense.categories.${cid}`)}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="detail-edit-date">{t('expense.date')}</Label>
                            <DatePicker
                                id="detail-edit-date"
                                value={editDate}
                                onChange={setEditDate}
                            />
                        </div>

                        {isGroup && (
                            <div className="space-y-2">
                                <Label>{t('split.stepSplitConfig')}</Label>
                                <div className="rounded-xl border border-border bg-background p-3">
                                    <SplitConfigurator
                                        totalAmount={editAmount ?? 0}
                                        currency={currency}
                                        splitMethod={splitMethod}
                                        onSplitMethodChange={setSplitMethod}
                                        paidBy={paidBy}
                                        onPaidByChange={setPaidBy}
                                        participants={participants}
                                        onParticipantsChange={setParticipants}
                                        resolveName={resolveName}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            className="flex-1 bg-brand-primary hover:bg-brand-primary/90"
                            disabled={!editValid || updateExpense.isPending}
                            onClick={saveEdit}
                        >
                            {updateExpense.isPending ? t('common.saving') : t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    )
}
