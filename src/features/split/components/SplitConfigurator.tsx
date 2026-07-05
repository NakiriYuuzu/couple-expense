import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Equal, DollarSign, Percent, Hash, Check, CheckCircle2, AlertCircle } from 'lucide-react'
import { calcSplits } from '@/features/split/lib/calcSplits'
import { formatCurrency } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import type { SplitMethod, CurrencyType } from '@/shared/lib/database.types'
import type { SplitParticipant } from '@/entities/split/types'

// 分帳設定器（Phase 5.1）：對照 Vue SplitConfigurator.vue 的 UI 與互動語意，但改為
// 純受控元件——split state（method / paidBy / participants）由父層持有，本元件只負責
// 渲染與回拋變更。金額拆分一律走 Phase 2 的 calcSplits（sum-then-round-once 守恆），
// 本元件不自行重寫任何金額邏輯。顯示名稱由父層以 resolveName 注入（與資料層解耦，
// 使本元件對 Dashboard / Expenses 頁面可重用且易測）。

export interface SplitConfiguratorProps {
    // 費用總額（currency 單位，整數）
    totalAmount: number
    splitMethod: SplitMethod
    onSplitMethodChange: (method: SplitMethod) => void
    paidBy: string
    onPaidByChange: (userId: string) => void
    participants: SplitParticipant[]
    onParticipantsChange: (next: SplitParticipant[]) => void
    // 金額顯示幣別（預設 TWD）；決定 formatCurrency 的零小數/符號
    currency?: CurrencyType
    // userId → 顯示名稱（父層以 profiles 快取 + 目前使用者「我」解析）
    resolveName?: (userId: string) => string
}

const SPLIT_METHODS: ReadonlyArray<{ value: SplitMethod; icon: typeof Equal }> = [
    { value: 'equal', icon: Equal },
    { value: 'exact', icon: DollarSign },
    { value: 'percentage', icon: Percent },
    { value: 'shares', icon: Hash }
]

// 由 <input> 取整數（擋非整數/負數/NaN）：金額與份數皆為 zero-decimal 整數語意。
function toInteger(raw: string, fallback = 0): number {
    const trimmed = raw.trim()
    if (trimmed === '') return fallback
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return fallback
    const truncated = Math.trunc(n)
    return truncated < 0 ? fallback : truncated
}

export function SplitConfigurator({
    totalAmount,
    splitMethod,
    onSplitMethodChange,
    paidBy,
    onPaidByChange,
    participants,
    onParticipantsChange,
    currency = 'TWD',
    resolveName
}: SplitConfiguratorProps) {
    const { t } = useTranslation()

    const included = useMemo(() => participants.filter(p => p.isIncluded), [participants])
    const includedCount = included.length

    // 唯一真相：以 calcSplits 產生每位 included 者的金額（順序與 included 子集一致）。
    const calc = useMemo(
        () => calcSplits(splitMethod, totalAmount, participants),
        [splitMethod, totalAmount, participants]
    )

    const amountByUser = useMemo(() => {
        const map = new Map<string, number>()
        included.forEach((p, i) => map.set(p.userId, calc.amounts[i] ?? 0))
        return map
    }, [included, calc])

    const nameOf = (p: SplitParticipant): string =>
        resolveName?.(p.userId) ?? p.displayName ?? t('common.unknown')

    const initialOf = (p: SplitParticipant): string => {
        const name = nameOf(p)
        return name.charAt(0) || '?'
    }

    // ── 變更處理 ───────────────────────────────────────────────
    const handleMethodChange = (method: SplitMethod) => {
        onSplitMethodChange(method)
        // 切換方式時把 included 的 percentage 重設為均分預設、shares 補 1（對照 Vue onSplitMethodChange）
        const defaultPct = includedCount > 0 ? Math.round((100 / includedCount) * 100) / 100 : 0
        onParticipantsChange(
            participants.map(p => ({
                ...p,
                percentage: p.isIncluded ? defaultPct : (p.percentage ?? 0),
                shares: p.shares ?? 1
            }))
        )
    }

    const updateAt = (index: number, patch: Partial<SplitParticipant>) => {
        const next = participants.map((p, i) => (i === index ? { ...p, ...patch } : p))
        onParticipantsChange(next)
        // 付款人被取消勾選 → 改選第一位仍 included 者（無則清空），避免 paid_by ∉ splits
        // 造成「隱形付款人」記錄（審查 A#1/B#1）。付款人 chips 僅渲染 included，state 需同步。
        if (patch.isIncluded === false && participants[index]?.userId === paidBy) {
            const firstIncluded = next.find(p => p.isIncluded)
            onPaidByChange(firstIncluded ? firstIncluded.userId : '')
        }
    }

    const isBalanced = calc.isBalanced

    return (
        <div className="space-y-4">
            {/* 分帳方式選擇 */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t('split.splitMethod')}</label>
                <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-muted/40 p-1">
                    {SPLIT_METHODS.map(({ value, icon: Icon }) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => handleMethodChange(value)}
                            aria-pressed={splitMethod === value}
                            className={cn(
                                'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs font-medium transition-all duration-200',
                                splitMethod === value
                                    ? 'bg-brand-primary text-brand-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {t(`split.${value}`)}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">{t(`split.${splitMethod}Desc`)}</p>
            </div>

            {/* 付款人 */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t('split.paidBy')}</label>
                <div className="flex flex-wrap gap-2">
                    {included.map(p => (
                        <button
                            key={p.userId}
                            type="button"
                            onClick={() => onPaidByChange(p.userId)}
                            aria-pressed={paidBy === p.userId}
                            className={cn(
                                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-200',
                                paidBy === p.userId
                                    ? 'border-brand-primary bg-brand-accent font-medium text-brand-primary'
                                    : 'border-border text-muted-foreground hover:border-brand-primary hover:text-foreground'
                            )}
                        >
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-[10px] text-brand-primary">
                                {initialOf(p)}
                            </span>
                            {nameOf(p)}
                            {paidBy === p.userId && <Check className="h-3.5 w-3.5" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* 參與者清單 */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">{t('split.participants')}</label>
                    <span className="text-xs text-muted-foreground">
                        {t('split.people', { n: includedCount })}
                    </span>
                </div>

                <div className="space-y-2">
                    {participants.map((p, index) => (
                        <div
                            key={p.userId}
                            className={cn(
                                'flex items-center gap-3 rounded-lg border p-3 transition-all duration-200',
                                p.isIncluded
                                    ? 'border-border bg-background'
                                    : 'border-border/50 bg-muted/20 opacity-60'
                            )}
                        >
                            <input
                                type="checkbox"
                                checked={p.isIncluded}
                                aria-label={nameOf(p)}
                                onChange={e => updateAt(index, { isIncluded: e.target.checked })}
                                className="h-4 w-4 shrink-0 accent-brand-primary"
                            />

                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-accent text-xs text-brand-primary">
                                {initialOf(p)}
                            </span>
                            <span className="flex-1 truncate text-sm font-medium">{nameOf(p)}</span>

                            <div className="flex shrink-0 items-center gap-1">
                                {splitMethod === 'equal' && (
                                    <span className="min-w-[60px] text-right text-sm font-semibold text-foreground">
                                        {formatCurrency(amountByUser.get(p.userId) ?? 0, currency)}
                                    </span>
                                )}

                                {splitMethod === 'exact' && (
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={p.amount ? p.amount : ''}
                                        disabled={!p.isIncluded}
                                        placeholder="0"
                                        min="0"
                                        step="1"
                                        aria-label={`${nameOf(p)} ${t('expense.amount')}`}
                                        onFocus={e => e.target.select()}
                                        onChange={e => updateAt(index, { amount: toInteger(e.target.value) })}
                                        className="h-8 w-24 rounded-md border border-border bg-background px-2 text-right text-sm focus:ring-1 focus:ring-brand-primary focus:outline-none disabled:opacity-40"
                                    />
                                )}

                                {splitMethod === 'percentage' && (
                                    <>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            value={p.percentage ? p.percentage : ''}
                                            disabled={!p.isIncluded}
                                            placeholder="0"
                                            min="0"
                                            max="100"
                                            step="1"
                                            aria-label={`${nameOf(p)} %`}
                                            onFocus={e => e.target.select()}
                                            onChange={e => updateAt(index, { percentage: toInteger(e.target.value) })}
                                            className="h-8 w-16 rounded-md border border-border bg-background px-2 text-right text-sm focus:ring-1 focus:ring-brand-primary focus:outline-none disabled:opacity-40"
                                        />
                                        <span className="text-xs text-muted-foreground">%</span>
                                        <span className="ml-1 text-xs text-muted-foreground">
                                            ≈{formatCurrency(amountByUser.get(p.userId) ?? 0, currency)}
                                        </span>
                                    </>
                                )}

                                {splitMethod === 'shares' && (
                                    <>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            value={p.shares ?? 1}
                                            disabled={!p.isIncluded}
                                            min="1"
                                            step="1"
                                            aria-label={`${nameOf(p)} ${t('split.shares')}`}
                                            onFocus={e => e.target.select()}
                                            onChange={e => updateAt(index, { shares: Math.max(1, toInteger(e.target.value, 1)) })}
                                            className="h-8 w-14 rounded-md border border-border bg-background px-2 text-right text-sm focus:ring-1 focus:ring-brand-primary focus:outline-none disabled:opacity-40"
                                        />
                                        <span className="text-xs text-muted-foreground">{t('split.shares')}</span>
                                        <span className="ml-1 text-xs text-muted-foreground">
                                            ≈{formatCurrency(amountByUser.get(p.userId) ?? 0, currency)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 守恆摘要 */}
            <div
                data-testid="split-balance"
                data-balanced={isBalanced}
                className={cn(
                    'flex items-center justify-between rounded-lg border p-3 text-sm font-medium transition-all duration-200',
                    isBalanced
                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                )}
            >
                <div className="flex items-center gap-2">
                    {isBalanced ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                    <span
                        className={
                            isBalanced
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-amber-700 dark:text-amber-400'
                        }
                    >
                        {isBalanced ? t('split.balanced') : t('split.notBalanced')}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                        {t('split.total')}: {formatCurrency(calc.total, currency)}
                    </span>
                    {!isBalanced && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                            {formatCurrency(calc.remaining, currency, { signed: true })}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
