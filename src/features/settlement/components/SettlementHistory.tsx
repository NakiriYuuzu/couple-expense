import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle, Pencil, Trash2 } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSettlementHistory } from '@/features/settlement/api/queries'
import { useDeleteSettlement } from '@/features/settlement/api/mutations'
import { formatCurrency } from '@/shared/lib/money'
import { formatDateTime } from '@/shared/lib/datetime'
import type { CurrencyType } from '@/shared/lib/database.types'
import type { SettlementHistoryItem } from '@/entities/settlement/types'

// 結算歷史清單（對照 Vue SettlementHistory.vue）：settled_at 走 datetime.formatDateTime、
// 金額走 formatCurrency。自己付款（paidBy === currentUser）的紀錄可編輯 / 刪除；刪除走確認 Dialog。

interface Props {
    groupId: string
    currentUserId: string | null
    currency: CurrencyType
    onEdit: (item: SettlementHistoryItem) => void
}

const getInitial = (name: string | null): string => name?.charAt(0).toUpperCase() ?? '?'

export function SettlementHistory({ groupId, currentUserId, currency, onEdit }: Props) {
    const { t } = useTranslation()
    const { data, isLoading } = useSettlementHistory(groupId)
    const del = useDeleteSettlement()

    const [deleteTarget, setDeleteTarget] = useState<SettlementHistoryItem | null>(null)
    const [deleting, setDeleting] = useState(false)

    const items = data ?? []

    const handleDeleteConfirm = async () => {
        if (!deleteTarget || deleting) return
        setDeleting(true)
        try {
            await del.mutateAsync({ settlementId: deleteTarget.id, groupId })
            toast.success(t('settlement.deleteSuccess'))
            setDeleteTarget(null)
        } catch {
            toast.error(t('settlement.deleteFailed'))
        } finally {
            setDeleting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-3" data-testid="overview-settlement-history">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                        </div>
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                    </div>
                ))}
            </div>
        )
    }

    if (items.length === 0) {
        return (
            <div className="py-6 text-center" data-testid="overview-settlement-history">
                <CheckCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{t('settlement.noHistory')}</p>
            </div>
        )
    }

    return (
        <>
            <div className="space-y-1" data-testid="overview-settlement-history">
                {items.map((item) => {
                    const isOwn = item.paidBy.userId === currentUserId
                    return (
                        <div key={item.id} className="flex items-start gap-3 py-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-accent text-xs font-medium text-brand-primary">
                                {getInitial(item.paidBy.displayName)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="truncate text-sm font-medium text-foreground">
                                        {item.paidBy.displayName ?? t('common.unknown')}
                                    </span>
                                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium text-foreground">
                                        {item.paidTo.displayName ?? t('common.unknown')}
                                    </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {formatDateTime(item.settledAt, {
                                            month: '2-digit',
                                            day: '2-digit'
                                        })}
                                    </span>
                                    {item.notes && (
                                        <span className="max-w-[150px] truncate text-xs text-muted-foreground">
                                            · {item.notes}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                <span className="text-sm font-semibold text-foreground">
                                    {formatCurrency(item.amount, currency)}
                                </span>
                                {isOwn && (
                                    <>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={t('common.edit')}
                                            className="ml-0.5 text-muted-foreground"
                                            onClick={() => onEdit(item)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={t('common.delete')}
                                            className="text-destructive"
                                            onClick={() => setDeleteTarget(item)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            <Dialog
                open={!!deleteTarget}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null)
                }}
            >
                <DialogContent className="bg-card sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('settlement.deleteConfirmTitle')}</DialogTitle>
                        <DialogDescription>{t('settlement.deleteConfirmDesc')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={deleting}
                        >
                            {deleting ? t('common.processing') : t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
