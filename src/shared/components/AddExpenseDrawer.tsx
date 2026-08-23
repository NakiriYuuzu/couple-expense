import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, User, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    DrawerClose
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SplitConfigurator } from '@/features/split/components/SplitConfigurator'
import { calcSplits } from '@/features/split/lib/calcSplits'
import { CategoryUtils, categoryIds, categoryColors } from '@/features/expense/lib/categories'
import { useAddExpense } from '@/features/expense/api/useAddExpense'
import type { CreateExpenseInput, SplitInput } from '@/features/expense/api/useAddExpense'
import { useRecentExpenses } from '@/features/expense/api/useRecentExpenses'
import type { RecentExpense } from '@/features/expense/api/useRecentExpenses'
import { useGroups, useGroupMembers, useGroupSettings } from '@/features/group/api/useGroups'
import { loadProfiles } from '@/features/group/api/profiles'
import { useSessionStore } from '@/shared/stores/session'
import { useAuthStore } from '@/features/auth/authStore'
import { DatePicker } from '@/shared/components/DatePicker'
import { taipeiDateString } from '@/shared/lib/datetime'
import { formatCurrency } from '@/shared/lib/money'
import { queryKeys } from '@/shared/lib/queryKeys'
import { cn } from '@/shared/lib/utils'
import type { CategoryId } from '@/entities/expense/types'
import type { SplitParticipant } from '@/entities/split/types'
import type { SplitMethod, CurrencyType } from '@/shared/lib/database.types'

// 全域新增支出 Drawer（Phase 5.1）：對照 Vue AddExpenseDrawer.vue 的兩步驟流程。
//   Step 1：表單（標題 / 金額整數 / 類別 / 日期 / 群組上下文）
//   Step 2：群組模式時顯示 SplitConfigurator（個人模式跳過，一步送出）
// 送出走 Phase 4 的 useAddExpense；金額顯示一律走 formatCurrency，日期預設 taipeiDateString。

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const DEFAULT_CATEGORY: CategoryId = categoryIds[0] ?? 'food'

export function AddExpenseDrawer({ open, onOpenChange }: Props) {
    const { t } = useTranslation()
    const client = useQueryClient()

    // ── 資料層 ─────────────────────────────────────────────────
    const { data: groupsData } = useGroups()
    const groups = useMemo(
        () => (groupsData ?? []).map(g => ({ id: g.group.id, name: g.group.name })),
        [groupsData]
    )
    const isInAnyGroup = groups.length > 0
    const activeGroupId = useSessionStore(s => s.activeGroupId)
    const currentUserId = useAuthStore(s => s.user?.id ?? '')
    const addExpense = useAddExpense()
    const recentExpenses = useRecentExpenses()

    // 預設群組 = 目前作用中群組，但須驗證使用者仍是成員（useGroups 僅回傳有效成員身分的群組）；
    // 否則回退個人模式。等同 Vue resolvedDefaultGroupId 的 active→null 回退鏈（React 無獨立
    // lastUsedGroupId 持久層，activeGroupId 即「上次使用」的單一真相，見整合契約註記）。
    const defaultGroupId = useMemo(
        () => (activeGroupId && groups.some(g => g.id === activeGroupId) ? activeGroupId : null),
        [activeGroupId, groups]
    )

    // ── 表單狀態 ───────────────────────────────────────────────
    const [step, setStep] = useState<1 | 2>(1)
    const [title, setTitle] = useState('')
    const [amount, setAmount] = useState<number | undefined>(undefined)
    const [category, setCategory] = useState<CategoryId>(DEFAULT_CATEGORY)
    const [date, setDate] = useState(() => taipeiDateString())
    const [groupId, setGroupId] = useState<string | null>(null)

    // ── 分帳狀態 ───────────────────────────────────────────────
    const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal')
    const [paidBy, setPaidBy] = useState('')
    const [participants, setParticipants] = useState<SplitParticipant[]>([])

    const members = useGroupMembers(groupId)
    const settings = useGroupSettings(groupId)
    const currency: CurrencyType = settings?.currency ?? 'TWD'

    const isGroupExpense = groupId !== null
    const totalAmount = amount ?? 0
    const totalSteps = isGroupExpense ? 2 : 1

    // 以 ref 持有最新的 defaultGroupId，讓重置只綁定 open 轉換，不會因 groups 晚載入
    // 造成 defaultGroupId null→gid 變動而在使用者編輯途中重置表單。
    const defaultGroupIdRef = useRef(defaultGroupId)
    useEffect(() => {
        defaultGroupIdRef.current = defaultGroupId
    }, [defaultGroupId])

    // 開啟時重置整個表單（含以驗證後的 defaultGroupId 預選群組）。
    useEffect(() => {
        if (!open) return
        setStep(1)
        setTitle('')
        setAmount(undefined)
        setCategory(DEFAULT_CATEGORY)
        setDate(taipeiDateString())
        setGroupId(defaultGroupIdRef.current)
        setSplitMethod('equal')
        setPaidBy('')
        setParticipants([])
    }, [open])

    // 進入群組模式且成員載入後，從成員建立初始參與者（全員 included、均分預設）。
    // participants.length 為 0 作為守門，避免覆蓋使用者已做的勾選/金額編輯。
    useEffect(() => {
        if (!groupId || participants.length > 0 || members.length === 0) return
        const n = members.length
        setParticipants(
            members.map(m => ({
                userId: m.user_id,
                displayName: null,
                avatarUrl: null,
                amount: 0,
                percentage: Math.round((100 / n) * 100) / 100,
                shares: 1,
                isIncluded: true
            }))
        )
        setPaidBy(prev => prev || currentUserId)
        setSplitMethod(settings?.default_split_method ?? 'equal')
    }, [groupId, members, participants.length, currentUserId, settings])

    // 成員名稱（reuse Phase 4 profiles.ts；未命中則以「我」/未知回退）。
    const memberIds = useMemo(() => members.map(m => m.user_id), [members])
    const memberIdsKey = useMemo(() => [...memberIds].sort().join(','), [memberIds])
    const { data: profileMap } = useQuery({
        queryKey: queryKeys.memberProfiles(memberIdsKey),
        queryFn: () => loadProfiles(client, memberIds),
        enabled: memberIds.length > 0
    })
    const resolveName = (userId: string): string => {
        if (userId === currentUserId) return t('common.me')
        return profileMap?.get(userId)?.display_name || t('common.unknown')
    }

    // ── 分帳計算（送出與守恆判定的唯一真相）─────────────────────
    const calc = useMemo(
        () => calcSplits(splitMethod, totalAmount, participants),
        [splitMethod, totalAmount, participants]
    )
    const isSplitBalanced = calc.isBalanced

    // ── 驗證 ───────────────────────────────────────────────────
    const amountInvalid = amount !== undefined && (!Number.isInteger(amount) || amount <= 0)
    const isStep1Valid =
        title.trim().length > 0 &&
        amount !== undefined &&
        Number.isInteger(amount) &&
        amount > 0 &&
        category.length > 0 &&
        date.length > 0

    // 金額輸入框的幣別符號（走 money.ts 派生，不硬編碼）。
    const currencySymbol = useMemo(
        () => formatCurrency(0, currency).replace(/[\d.,\s]/g, ''),
        [currency]
    )

    // ── 動作 ───────────────────────────────────────────────────
    const applyRecent = (r: RecentExpense) => {
        setTitle(r.title)
        setAmount(r.amount)
        setCategory(r.category as CategoryId)
    }

    const selectContext = (id: string | null) => {
        setGroupId(id)
        setParticipants([])
        setPaidBy('')
        setSplitMethod('equal')
    }

    const submit = async () => {
        if (addExpense.isPending) return
        if (!isStep1Valid) return
        if (isGroupExpense && !isSplitBalanced) return

        const amt = amount as number
        const icon = CategoryUtils.getIconKey(category)

        let input: CreateExpenseInput
        if (isGroupExpense && groupId) {
            const included = participants.filter(p => p.isIncluded)
            const splits: SplitInput[] = included.map((p, i) => ({
                userId: p.userId,
                amount: calc.amounts[i] ?? 0,
                // 只持久化該分帳方式實際使用的派生欄位（對照 Vue submitExpense）
                percentage: splitMethod === 'percentage' ? p.percentage : undefined,
                shares: splitMethod === 'shares' ? p.shares : undefined
            }))
            input = {
                title: title.trim(),
                amount: amt,
                category,
                icon,
                date,
                group_id: groupId,
                currency,
                split_method: splitMethod,
                paid_by: paidBy || currentUserId,
                splits
            }
        } else {
            input = {
                title: title.trim(),
                amount: amt,
                category,
                icon,
                date,
                group_id: null
            }
        }

        try {
            await addExpense.mutateAsync(input)
            toast.success(t('expense.expenseAdded'))
            onOpenChange(false)
        } catch {
            toast.error(t('expense.addFailed'))
        }
    }

    const handlePrimary = () => {
        if (step === 1) {
            if (!isStep1Valid) return
            if (isGroupExpense) setStep(2)
            else void submit()
        } else {
            void submit()
        }
    }

    const SummaryIcon = CategoryUtils.getIconByCategory(category)

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent
                id="add-expense-drawer-content"
                className="flex min-w-0 max-h-[90dvh] max-w-full flex-col overflow-x-hidden border-t border-glass-border-strong bg-card"
            >
                <DrawerHeader className="min-w-0 shrink-0 pb-2 text-center">
                    <DrawerTitle className="truncate text-xl font-semibold text-foreground">
                        {t('expense.addExpense')}
                    </DrawerTitle>
                    <div className="mt-2 flex items-center justify-center gap-2">
                        {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                            <div
                                key={s}
                                className={cn(
                                    'h-1.5 rounded-full transition-all duration-300',
                                    s === step
                                        ? 'w-8 bg-brand-primary'
                                        : s < step
                                          ? 'w-4 bg-brand-primary/50'
                                          : 'glass-light w-4'
                                )}
                            />
                        ))}
                    </div>
                    <DrawerDescription className="mt-1 truncate text-xs text-muted-foreground">
                        {t('expense.step', { n: step })} / {totalSteps} —{' '}
                        {step === 1 ? t('expense.stepExpenseInfo') : t('split.stepSplitConfig')}
                    </DrawerDescription>
                </DrawerHeader>

                <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4">
                    {step === 1 ? (
                        <div className="min-w-0 space-y-4 pt-2 pb-4">
                            {/* 最近記錄快速複製 */}
                            {recentExpenses.length > 0 && (
                                <div className="min-w-0 space-y-1.5">
                                    <label className="text-xs text-muted-foreground">
                                        {t('expense.recentQuickCopy')}
                                    </label>
                                    <div className="flex min-w-0 flex-wrap gap-2">
                                        {recentExpenses.map(recent => {
                                            const Icon = CategoryUtils.getIconByKey(recent.icon)
                                            return (
                                                <button
                                                    key={recent.title}
                                                    type="button"
                                                    onClick={() => applyRecent(recent)}
                                                    className="glass-light press-feedback hover-transition inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground"
                                                >
                                                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                    <span className="min-w-0 truncate">{recent.title}</span>
                                                    <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                                                        {formatCurrency(recent.amount, currency)}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 標題 */}
                            <div className="min-w-0 space-y-1.5">
                                <label htmlFor="expense-title" className="text-sm font-medium text-foreground">
                                    {t('expense.title')}
                                </label>
                                <Input
                                    id="expense-title"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder={t('expense.titlePlaceholder')}
                                    className="h-12 min-w-0"
                                    autoComplete="off"
                                />
                            </div>

                            {/* 金額 */}
                            <div className="min-w-0 space-y-1.5">
                                <label htmlFor="expense-amount" className="text-sm font-medium text-foreground">
                                    {t('expense.amount')}
                                </label>
                                <div className="relative min-w-0">
                                    <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                        {currencySymbol}
                                    </span>
                                    <Input
                                        id="expense-amount"
                                        type="number"
                                        inputMode="numeric"
                                        value={amount ?? ''}
                                        onChange={e =>
                                            setAmount(e.target.value === '' ? undefined : Number(e.target.value))
                                        }
                                        placeholder="0"
                                        className="h-12 min-w-0 pl-12"
                                        min="0"
                                        step="1"
                                        aria-invalid={amountInvalid}
                                    />
                                </div>
                                {amountInvalid && (
                                    <p className="text-xs text-destructive">
                                        {Number.isInteger(amount)
                                            ? t('validation.positiveNumber')
                                            : t('validation.number')}
                                    </p>
                                )}
                            </div>

                            {/* 上下文（個人 / 群組）*/}
                            {isInAnyGroup && (
                                <div className="min-w-0 space-y-1.5">
                                    <label className="text-sm font-medium text-foreground">
                                        {t('expense.context')}
                                    </label>
                                    <div className="glass-light grid min-w-0 grid-cols-2 gap-2 rounded-xl p-1 sm:flex">
                                        <button
                                            type="button"
                                            onClick={() => selectContext(null)}
                                            aria-pressed={groupId === null}
                                            className={cn(
                                                'flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 sm:flex-1',
                                                groupId === null
                                                    ? 'bg-brand-primary text-brand-primary-foreground shadow-sm'
                                                    : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                                            )}
                                        >
                                            <User className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{t('expense.personal')}</span>
                                        </button>
                                        {groups.map(group => (
                                            <button
                                                key={group.id}
                                                type="button"
                                                onClick={() => selectContext(group.id)}
                                                aria-pressed={groupId === group.id}
                                                className={cn(
                                                    'flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 sm:flex-1',
                                                    groupId === group.id
                                                        ? 'bg-brand-primary text-brand-primary-foreground shadow-sm'
                                                        : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                                                )}
                                            >
                                                <Users className="h-4 w-4 shrink-0" />
                                                <span className="truncate">{group.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {groupId === null ? t('expense.personalDesc') : t('expense.groupDesc')}
                                    </p>
                                </div>
                            )}

                            {/* 類別 */}
                            <div className="min-w-0 space-y-1.5">
                                <label className="text-sm font-medium text-foreground">
                                    {t('expense.category')}
                                </label>
                                <div className="grid min-w-0 grid-cols-3 gap-2.5">
                                    {categoryIds.map(id => {
                                        const Icon = CategoryUtils.getIconByCategory(id)
                                        const selected = category === id
                                        const color = categoryColors[id]
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => setCategory(id)}
                                                aria-pressed={selected}
                                                className={cn(
                                                    'press-feedback flex min-w-0 flex-col items-center gap-2 rounded-xl border-2 p-2.5 transition-all duration-200 sm:p-3',
                                                    selected
                                                        ? 'glass-heavy'
                                                        : 'glass-light border-transparent hover:glass'
                                                )}
                                                style={selected ? { borderColor: color.color } : undefined}
                                            >
                                                <span
                                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                                                    style={{
                                                        backgroundColor: selected ? color.color : color.bg
                                                    }}
                                                >
                                                    <Icon
                                                        className="h-5 w-5"
                                                        style={{ color: selected ? 'white' : color.color }}
                                                    />
                                                </span>
                                                <span className="max-w-full truncate text-center text-xs leading-tight font-medium text-foreground">
                                                    {t(`expense.categories.${id}`)}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* 日期 */}
                            <div className="min-w-0 space-y-1.5">
                                <label htmlFor="expense-date" className="text-sm font-medium text-foreground">
                                    {t('expense.date')}
                                </label>
                                <DatePicker
                                    id="expense-date"
                                    value={date}
                                    onChange={setDate}
                                    className="h-12 min-w-0"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="min-w-0 space-y-1 pt-2 pb-4">
                            {/* 費用摘要 */}
                            <div className="glass-elevated mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl p-3">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary">
                                        <SummaryIcon className="h-4 w-4 text-brand-primary-foreground" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm leading-tight font-semibold text-foreground">
                                            {title}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">{date}</p>
                                    </div>
                                </div>
                                <span className="ml-auto shrink-0 whitespace-nowrap text-lg font-bold text-brand-primary">
                                    {formatCurrency(totalAmount, currency)}
                                </span>
                            </div>

                            <SplitConfigurator
                                totalAmount={totalAmount}
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
                    )}
                </div>

                {/* 底部動作 */}
                <div className="min-w-0 shrink-0 border-t border-border bg-card px-4 py-4">
                    <div className="flex min-w-0 gap-3">
                        {step === 1 ? (
                            <DrawerClose asChild>
                                <Button
                                    variant="outline"
                                    type="button"
                                    className="h-12 min-w-0 flex-1 border-border text-foreground hover:bg-accent"
                                >
                                    <span className="truncate">{t('common.cancel')}</span>
                                </Button>
                            </DrawerClose>
                        ) : (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setStep(1)}
                                className="h-12 min-w-0 flex-1 border-border text-foreground hover:bg-accent"
                            >
                                <ChevronLeft className="mr-1 h-4 w-4 shrink-0" />
                                <span className="truncate">{t('common.back')}</span>
                            </Button>
                        )}

                        <Button
                            type="button"
                            onClick={handlePrimary}
                            disabled={
                                addExpense.isPending || (step === 1 ? !isStep1Valid : !isSplitBalanced)
                            }
                            className="press-feedback h-12 min-w-0 flex-1 bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
                        >
                            {step === 1 && isGroupExpense ? (
                                <>
                                    <span className="truncate">{t('expense.nextStep')}</span>
                                    <ChevronRight className="ml-1 h-4 w-4 shrink-0" />
                                </>
                            ) : (
                                <>
                                    <Plus className="mr-1 h-4 w-4 shrink-0" />
                                    <span className="truncate">{t('expense.addExpense')}</span>
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}