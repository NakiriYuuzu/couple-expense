import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { Search, SlidersHorizontal, User, Users, RefreshCw, Plus, Wallet, HandCoins } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RecurringExpenseList } from '@/features/expense/components/RecurringExpenseList'
import { RecurringExpenseDrawer } from '@/features/expense/components/RecurringExpenseDrawer'
import { ExpenseGroup } from '@/features/expense/components/ExpenseGroup'
import { useExpenses } from '@/features/expense/api/useExpenses'
import type { ExpenseWithUser } from '@/features/expense/api/useExpenses'
import { useDeleteExpense } from '@/features/expense/api/useDeleteExpense'
import { useGroups } from '@/features/group/api/useGroups'
import { ScopeChips, type ExpenseScope } from '@/shared/components/ScopeChips'
import { CategoryUtils, categoryIds } from '@/features/expense/lib/categories'
import { formatCurrency } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import type { DisplayExpense, RecurringExpense, CategoryId } from '@/entities/expense/types'
import type { CurrencyType } from '@/shared/lib/database.types'

const HEADER_ESTIMATE_HEIGHT = 118
const ROW_ESTIMATE_HEIGHT = 88

// 支出列表（Phase 5.1，對照 Vue ExpensesPage.vue）。搜尋 + 篩選 Dialog + personal/group/recurring
// tabs + 依日期分組列表 + 週期費用入口。走 useExpenses（作用中範疇）、useDeleteExpense（批次刪除），
// 金額一律 formatCurrency（依費用所屬群組幣別）。

type MainTab = 'personal' | 'group' | 'recurring'
type TypeFilter = 'all' | 'personal' | 'debt'

interface Filters {
    startDate: string
    endDate: string
    categories: string[]
    minAmount: string
    maxAmount: string
}

const EMPTY_FILTERS: Filters = {
    startDate: '',
    endDate: '',
    categories: [],
    minAmount: '',
    maxAmount: ''
}

export default function ExpensesPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { data: expensesData, isLoading } = useExpenses()
    const { data: groupsData, isSuccess: groupsLoaded } = useGroups()
    const { deleteByDate } = useDeleteExpense()

    const isInGroup = (groupsData ?? []).length > 0

    const [activeTab, setActiveTab] = useState<MainTab>('personal')
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
    // 群組 tab 的群組過濾：預設全部群組；指向的群組已不在清單 → 收斂回全部。
    const [groupFilter, setGroupFilter] = useState<ExpenseScope>('all')
    useEffect(() => {
        if (
            groupFilter !== 'all' &&
            groupsLoaded &&
            !(groupsData ?? []).some((g) => g.group.id === groupFilter)
        )
            setGroupFilter('all')
    }, [groupFilter, groupsLoaded, groupsData])

    const filterCurrency: CurrencyType =
        groupFilter !== 'all'
            ? (groupsData ?? []).find((g) => g.group.id === groupFilter)?.settings?.currency ?? 'TWD'
            : 'TWD'
    const [searchQuery, setSearchQuery] = useState('')
    const [filterOpen, setFilterOpen] = useState(false)
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

    const [recurringDrawerOpen, setRecurringDrawerOpen] = useState(false)
    const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null)

    // group_id → { name, currency }（供群組 badge 與逐費用幣別解析）
    const groupMeta = useMemo(() => {
        const map = new Map<string, { name: string; currency: CurrencyType }>()
        for (const g of groupsData ?? []) {
            map.set(g.group.id, { name: g.group.name, currency: g.settings?.currency ?? 'TWD' })
        }
        return map
    }, [groupsData])

    const allExpenses = useMemo(() => expensesData ?? [], [expensesData])

    // 當前 tab 的來源子集
    const activeExpenses = useMemo(() => {
        if (activeTab === 'group') {
            return groupFilter === 'all'
                ? allExpenses.filter((e) => e.group_id !== null)
                : allExpenses.filter((e) => e.group_id === groupFilter)
        }
        // personal tab：all / personal（group_id null）/ debt（group_id 非 null）
        if (typeFilter === 'personal') return allExpenses.filter((e) => e.group_id === null)
        if (typeFilter === 'debt') return allExpenses.filter((e) => e.group_id !== null)
        return allExpenses
    }, [activeTab, typeFilter, allExpenses, groupFilter])

    const hasActiveFilters =
        searchQuery.trim() !== '' ||
        filters.categories.length > 0 ||
        filters.startDate !== '' ||
        filters.endDate !== '' ||
        filters.minAmount !== '' ||
        filters.maxAmount !== ''

    // single-pass 篩選
    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        const min = filters.minAmount ? parseFloat(filters.minAmount) : null
        const max = filters.maxAmount ? parseFloat(filters.maxAmount) : null
        return activeExpenses.filter(
            (e) =>
                (!q || e.title.toLowerCase().includes(q)) &&
                (!filters.startDate || e.date >= filters.startDate) &&
                (!filters.endDate || e.date <= filters.endDate) &&
                (filters.categories.length === 0 || filters.categories.includes(e.category)) &&
                (min === null || e.amount >= min) &&
                (max === null || e.amount <= max)
        )
    }, [activeExpenses, searchQuery, filters])

    // 依日期分組（YYYY-MM-DD 分桶，顯示以 / 分隔，降冪）
    const groups = useMemo(() => {
        const currencyOf = (e: ExpenseWithUser): CurrencyType =>
            e.currency ?? (e.group_id ? groupMeta.get(e.group_id)?.currency ?? 'TWD' : 'TWD')
        const byDate = new Map<string, DisplayExpense[]>()
        for (const e of filtered) {
            const currency = currencyOf(e)
            const list = byDate.get(e.date) ?? []
            list.push({
                id: e.id,
                title: e.title,
                amount: formatCurrency(e.amount, currency),
                numericAmount: e.amount,
                currency,
                category: e.category,
                icon: CategoryUtils.getIconKey(e.category),
                user: e.user,
                groupId: e.group_id,
                groupName: e.group_id ? groupMeta.get(e.group_id)?.name ?? null : null,
                splitMethod: e.split_method,
                isSettled: e.is_settled
            })
            byDate.set(e.date, list)
        }
        return [...byDate.entries()]
            .map(([date, exps]) => ({ date, display: date.replace(/-/g, '/'), expenses: exps }))
            .sort((a, b) => b.date.localeCompare(a.date))
    }, [filtered, activeTab, groupMeta])

    const toggleCategory = (id: string) => {
        setFilters((f) => ({
            ...f,
            categories: f.categories.includes(id)
                ? f.categories.filter((c) => c !== id)
                : [...f.categories, id]
        }))
    }

    const resetFilters = () => {
        setFilters(EMPTY_FILTERS)
        setSearchQuery('')
    }

    const handleDeleteAll = (expenses: DisplayExpense[]) => {
        void deleteByDate.mutateAsync({
            expenseIds: expenses.map((e) => e.id),
            groupIds: expenses.map((e) => e.groupId).filter((id): id is string => !!id)
        })
    }

    const openAddRecurring = () => {
        setEditingRecurring(null)
        setRecurringDrawerOpen(true)
    }
    const openEditRecurring = (item: RecurringExpense) => {
        setEditingRecurring(item)
        setRecurringDrawerOpen(true)
    }

    const typeFilterButtons: ReadonlyArray<{ value: TypeFilter; label: string; icon: typeof Wallet | null }> = [
        { value: 'all', label: t('dashboard.filterAll'), icon: null },
        { value: 'personal', label: t('dashboard.filterPersonal'), icon: Wallet },
        { value: 'debt', label: t('dashboard.filterDebt'), icon: HandCoins }
    ]

    const emptyText = hasActiveFilters
        ? t('search.noResultsFound')
        : activeTab === 'group'
          ? t('expenses.noGroupExpenses')
          : t('expenses.noPersonalExpenses')

    return (
        <div>
            {/* 搜尋列 */}
            <div className="sticky top-[52px] z-30 bg-background/80 px-4 py-3 backdrop-blur-xl">
                <div className="glass flex gap-2 rounded-full p-1.5">
                    <div className="relative flex-1">
                        <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('search.searchTransaction')}
                            aria-label={t('search.searchTransaction')}
                            className="h-11 border-0 bg-transparent pr-4 pl-10 shadow-none focus-visible:ring-0"
                        />
                    </div>
                    <div className="relative">
                        <Button
                            variant="outline"
                            size="icon"
                            className="press-feedback hover-transition h-11 w-11 rounded-full"
                            aria-label={t('search.filterConditions')}
                            onClick={() => setFilterOpen(true)}
                        >
                            <SlidersHorizontal className="h-5 w-5" />
                        </Button>
                        {hasActiveFilters && (
                            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
                        )}
                    </div>
                </div>
            </div>

            <main className="px-4 pb-28">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MainTab)} className="mt-4">
                    <TabsList className="glass-light grid w-full grid-cols-3 rounded-full p-[2px]">
                        <TabsTrigger value="personal" className="press-feedback flex items-center gap-2 rounded-full">
                            <User className="h-4 w-4" />
                            {t('expense.personal')}
                        </TabsTrigger>
                        <TabsTrigger
                            value="group"
                            disabled={!isInGroup}
                            className="press-feedback flex items-center gap-2 rounded-full"
                        >
                            <Users className="h-4 w-4" />
                            {t('expense.group')}
                        </TabsTrigger>
                        <TabsTrigger value="recurring" className="press-feedback flex items-center gap-2 rounded-full">
                            <RefreshCw className="h-4 w-4" />
                            {t('recurring.title')}
                        </TabsTrigger>
                    </TabsList>

                    {/* 個人 */}
                    <TabsContent value="personal" className="mt-4">
                        <div className="mb-4 flex gap-2">
                            {typeFilterButtons.map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setTypeFilter(f.value)}
                                    aria-pressed={typeFilter === f.value}
                                    className={cn(
                                        'press-feedback flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                                        typeFilter === f.value
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'glass text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {f.icon && <f.icon className="h-3.5 w-3.5" />}
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <ExpenseListBody
                            isLoading={isLoading}
                            groups={groups}
                            showUser={false}
                            currency={'TWD'}
                            emptyText={emptyText}
                            emptyIcon={<User className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />}
                            onExpenseClick={(id) => navigate({ to: '/expenses/$id', params: { id } })}
                            onDeleteAll={handleDeleteAll}
                        />
                    </TabsContent>

                    {/* 群組 */}
                    <TabsContent value="group" className="mt-4">
                        {isInGroup && (
                            <ScopeChips
                                className="mb-4"
                                value={groupFilter}
                                onChange={setGroupFilter}
                                groups={(groupsData ?? []).map((g) => ({
                                    id: g.group.id,
                                    name: g.group.name
                                }))}
                                includePersonal={false}
                            />
                        )}
                        <ExpenseListBody
                            isLoading={isLoading}
                            groups={groups}
                            showUser
                            currency={filterCurrency}
                            emptyText={emptyText}
                            emptyIcon={<Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />}
                            onExpenseClick={(id) => navigate({ to: '/expenses/$id', params: { id } })}
                            onDeleteAll={handleDeleteAll}
                        />
                    </TabsContent>

                    {/* 週期費用 */}
                    <TabsContent value="recurring" className="mt-4">
                        <div className="mb-3 flex justify-end">
                            <Button size="sm" className="press-feedback gap-2 rounded-full" onClick={openAddRecurring}>
                                <Plus className="h-4 w-4" />
                                {t('recurring.add')}
                            </Button>
                        </div>
                        <RecurringExpenseList onEdit={openEditRecurring} />
                    </TabsContent>
                </Tabs>
            </main>

            <RecurringExpenseDrawer
                open={recurringDrawerOpen}
                onOpenChange={setRecurringDrawerOpen}
                editItem={editingRecurring}
            />

            {/* 篩選 Dialog */}
            <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
                <DialogContent className="bg-card sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('search.filterConditions')}</DialogTitle>
                        <DialogDescription>{t('search.setFilterDesc')}</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {/* 日期範圍 */}
                        <div className="space-y-2">
                            <Label>{t('search.dateRange')}</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    type="date"
                                    value={filters.startDate}
                                    aria-label={t('search.startDate')}
                                    onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                                />
                                <Input
                                    type="date"
                                    value={filters.endDate}
                                    aria-label={t('search.endDate')}
                                    onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* 類別 */}
                        <div className="space-y-2">
                            <Label>{t('search.category')}</Label>
                            <div className="grid grid-cols-3 gap-3">
                                {categoryIds.map((id: CategoryId) => {
                                    const Icon = CategoryUtils.getIconByCategory(id)
                                    const selected = filters.categories.includes(id)
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => toggleCategory(id)}
                                            aria-pressed={selected}
                                            className={cn(
                                                'press-feedback flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all duration-200',
                                                selected
                                                    ? 'border-brand-primary bg-brand-accent'
                                                    : 'border-border bg-background hover:border-brand-primary'
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'flex h-10 w-10 items-center justify-center rounded-lg',
                                                    selected ? 'bg-brand-primary' : 'bg-brand-accent'
                                                )}
                                            >
                                                <Icon
                                                    className={cn(
                                                        'h-5 w-5',
                                                        selected ? 'text-brand-primary-foreground' : 'text-brand-primary'
                                                    )}
                                                />
                                            </span>
                                            <span className="text-xs font-medium text-foreground">
                                                {t(`expense.categories.${id}`)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* 金額範圍 */}
                        <div className="space-y-2">
                            <Label>{t('search.amountRange')}</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    type="number"
                                    min="0"
                                    value={filters.minAmount}
                                    placeholder={t('search.minAmountPlaceholder')}
                                    aria-label={t('search.minAmount')}
                                    onChange={(e) => setFilters((f) => ({ ...f, minAmount: e.target.value }))}
                                />
                                <Input
                                    type="number"
                                    min="0"
                                    value={filters.maxAmount}
                                    placeholder={t('search.maxAmountPlaceholder')}
                                    aria-label={t('search.maxAmount')}
                                    onChange={(e) => setFilters((f) => ({ ...f, maxAmount: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" className="press-feedback" onClick={resetFilters}>
                            {t('search.reset')}
                        </Button>
                        <Button
                            className="press-feedback bg-brand-primary hover:bg-brand-primary/90"
                            onClick={() => setFilterOpen(false)}
                        >
                            {t('search.applyFilter')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// 列表主體：載入骨架 / 分組清單 / 空狀態
interface ListBodyProps {
    isLoading: boolean
    groups: { date: string; display: string; expenses: DisplayExpense[] }[]
    showUser: boolean
    currency: CurrencyType
    emptyText: string
    emptyIcon: ReactNode
    onExpenseClick: (id: string) => void
    onDeleteAll: (expenses: DisplayExpense[]) => void
}

function ExpenseListBody({
    isLoading,
    groups,
    showUser,
    currency,
    emptyText,
    emptyIcon,
    onExpenseClick,
    onDeleteAll
}: ListBodyProps) {
    const listOffsetRef = useRef(0)
    const listRef = useRef<HTMLDivElement>(null)

    const virtualizer = useWindowVirtualizer({
        count: groups.length,
        getItemKey: (index) => groups[index]?.date ?? `group-${index}`,
        estimateSize: (index) => {
            const group = groups[index]
            if (!group) return HEADER_ESTIMATE_HEIGHT
            return HEADER_ESTIMATE_HEIGHT + group.expenses.length * ROW_ESTIMATE_HEIGHT
        },
        overscan: 5,
        // 對齊改動前清單的 space-y-4（1rem）群組間距：絕對定位下 wrapper 之間沒有 CSS 間距，
        // 由 virtualizer 的 gap 在 start 計算中補上，否則卡片會相貼。
        gap: 16,
        initialRect: process.env.NODE_ENV === 'test' ? { width: 1024, height: 768 } : undefined,
        ...(process.env.NODE_ENV === 'test'
            ? {
                    measureElement: (element: Element, entry?: ResizeObserverEntry) => {
                        const measuredHeight =
                            entry?.contentBoxSize?.[0]?.blockSize ??
                            entry?.borderBoxSize?.[0]?.blockSize ??
                            Number(entry?.contentRect?.height)

                        if (Number.isFinite(measuredHeight) && measuredHeight > 0) return measuredHeight

                        const index = Number((element as HTMLElement).dataset?.index)
                        if (!Number.isInteger(index)) return HEADER_ESTIMATE_HEIGHT

                        const group = groups[index]
                        if (!group) return HEADER_ESTIMATE_HEIGHT
                        return HEADER_ESTIMATE_HEIGHT + group.expenses.length * ROW_ESTIMATE_HEIGHT
                    }
              }
            : {}),
        scrollMargin: listOffsetRef.current
    })

    useEffect(() => {
        const listElement = listRef.current
        if (!listElement) return

        const updateScrollMargin = () => {
            const rect = listElement.getBoundingClientRect()
            const nextScrollMargin = rect.top + window.scrollY

            if (listOffsetRef.current === nextScrollMargin) return
            listOffsetRef.current = nextScrollMargin
            virtualizer.setOptions({
                ...virtualizer.options,
                scrollMargin: nextScrollMargin
            })
            virtualizer.measure()
        }

        updateScrollMargin()
        window.addEventListener('resize', updateScrollMargin)
        return () => window.removeEventListener('resize', updateScrollMargin)
    }, [virtualizer])

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="glass space-y-3 rounded-2xl p-4">
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-10 animate-pulse rounded-lg bg-muted" />
                        <div className="h-10 animate-pulse rounded-lg bg-muted" />
                    </div>
                ))}
            </div>
        )
    }

    if (groups.length === 0) {
        return (
            <div className="py-12 text-center">
                {emptyIcon}
                <p className="mb-4 text-muted-foreground">{emptyText}</p>
            </div>
        )
    }

    return (
        <div className="relative w-full">
            <div className="relative w-full" ref={listRef} style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const group = groups[virtualItem.index]

                    if (!group) return null

                    return (
                        <div
                            key={virtualItem.key}
                            data-virtual-item="true"
                            data-index={virtualItem.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`
                            }}
                        >
                            <ExpenseGroup
                                date={group.display}
                                expenses={group.expenses}
                                showUser={showUser}
                                currency={currency}
                                onExpenseClick={onExpenseClick}
                                onDeleteAll={onDeleteAll}
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
