import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { STALE } from '@/shared/lib/queryClient'
import { currentYearMonth } from '@/shared/lib/datetime'
import { normalizeNetBalances, normalizePositiveAmounts } from '@/shared/lib/integerDebt'
import { loadProfiles } from '@/features/group/api/profiles'
import type {
    NetBalance,
    SimplifiedDebt,
    MonthlyDebtSnapshot,
    MonthlyDebtStatus,
    SnapshotData,
    SettlementHistoryItem,
    SettlementRow
} from '@/entities/settlement/types'

const pad2 = (n: number): string => String(n).padStart(2, '0')

// snapshot_data 的 runtime schema（對照 Vue settlement.ts:14-26）：後端契約漂移時
// 略過該列而非整批失敗。
const snapshotDataSchema: z.ZodType<SnapshotData> = z.object({
    netBalances: z.array(z.object({ userId: z.string(), netBalance: z.number() })),
    simplifiedDebts: z.array(
        z.object({ fromUser: z.string(), toUser: z.string(), amount: z.number() })
    ),
    expenseCount: z.number(),
    totalExpense: z.number()
})

// 月狀態單一真相（settlement.ts:30-34）：對齊 DB CHECK（settled/partial/unsettled）。
function deriveSnapshotStatus(totalUnsettled: number, totalExpense: number): MonthlyDebtStatus {
    if (totalUnsettled === 0) return 'settled'
    if (totalUnsettled < totalExpense * 0.5) return 'partial'
    return 'unsettled'
}

// 邊界整數化（settlement.ts:38-62）：net balance 以 normalizeNetBalances、debt amount 以
// normalizePositiveAmounts 收斂到整數並過濾 0。
function normalizeNetBalanceRows<T extends { net_balance: number }>(rows: T[]): T[] {
    const normalized = normalizeNetBalances(rows.map((r) => r.net_balance))
    return rows.map((r, i) => ({ ...r, net_balance: normalized[i] ?? 0 }))
}

function normalizeAmountRows<T extends { amount: number }>(rows: T[]): T[] {
    const normalized = normalizePositiveAmounts(rows.map((r) => r.amount))
    return rows.map((r, i) => ({ ...r, amount: normalized[i] ?? 0 })).filter((r) => r.amount > 0)
}

function normalizeSnapshotNetBalances<T extends { netBalance: number }>(rows: T[]): T[] {
    const normalized = normalizeNetBalances(rows.map((r) => r.netBalance))
    return rows.map((r, i) => ({ ...r, netBalance: normalized[i] ?? 0 }))
}

// 首頁只需要「我欠誰／誰欠我」。第三方彼此間的債務若混入前五筆，會讓目前使用者的
// 實際欠款被擠掉，並使摘要看起來像判定錯誤。fromUser 是欠款人，toUser 是債權人。
export function filterDebtsForUser(
    debts: readonly SimplifiedDebt[],
    userId: string | null | undefined
): SimplifiedDebt[] {
    if (!userId) return []
    return debts.filter(
        (debt) => debt.fromUser.userId === userId || debt.toUser.userId === userId
    )
}

// [start, next-month-start) 的日期字串半開區間（date 欄位為 'YYYY-MM-DD'，字串比較即可）。
function monthDateRange(yearMonth: string): [string, string] {
    const [year, month] = yearMonth.split('-').map(Number)
    const nextMonth = month! === 12 ? 1 : month! + 1
    const nextYear = month! === 12 ? year! + 1 : year!
    return [`${yearMonth}-01`, `${nextYear}-${pad2(nextMonth)}-01`]
}

// ─── net balances（get_group_balances RPC，對照 settlement.ts:128-159）───
export async function fetchNetBalances(
    client: QueryClient,
    groupId: string
): Promise<NetBalance[]> {
    const { data, error } = await supabase.rpc('get_group_balances', { p_group_id: groupId })
    if (error) throw error

    const rows = normalizeNetBalanceRows(
        (data ?? []) as Array<{ user_id: string; net_balance: number }>
    )
    const profiles = await loadProfiles(client, rows.map((r) => r.user_id))

    return rows.map((r) => ({
        userId: r.user_id,
        displayName: profiles.get(r.user_id)?.display_name ?? null,
        avatarUrl: profiles.get(r.user_id)?.avatar_url ?? null,
        netBalance: r.net_balance
    }))
}

export function useBalances(groupId: string | null | undefined) {
    const client = useQueryClient()
    return useQuery({
        queryKey: queryKeys.balances(groupId ?? ''),
        queryFn: () => fetchNetBalances(client, groupId as string),
        // 短層：balances（群組結餘）15 秒
        staleTime: STALE.short,
        gcTime: STALE.short,
        enabled: !!groupId
    })
}

// ─── simplified debts（get_simplified_debts RPC，對照 settlement.ts:162-204）───
export async function fetchSimplifiedDebts(
    client: QueryClient,
    groupId: string
): Promise<SimplifiedDebt[]> {
    const [{ data, error }, userResult] = await Promise.all([
        supabase.rpc('get_simplified_debts', { p_group_id: groupId }),
        supabase.auth.getUser()
    ])
    if (error) throw error
    if (userResult.error) throw userResult.error

    const rows = normalizeAmountRows(
        (data ?? []) as Array<{ from_user: string; to_user: string; amount: number }>
    )
    const profiles = await loadProfiles(
        client,
        rows.flatMap((r) => [r.from_user, r.to_user])
    )

    const debts = rows.map((r) => ({
        fromUser: {
            userId: r.from_user,
            displayName: profiles.get(r.from_user)?.display_name ?? null,
            avatarUrl: profiles.get(r.from_user)?.avatar_url ?? null
        },
        toUser: {
            userId: r.to_user,
            displayName: profiles.get(r.to_user)?.display_name ?? null,
            avatarUrl: profiles.get(r.to_user)?.avatar_url ?? null
        },
        amount: r.amount
    }))

    return filterDebtsForUser(debts, userResult.data.user?.id)
}

export function useSimplifiedDebts(groupId: string | null | undefined) {
    const client = useQueryClient()
    return useQuery({
        queryKey: queryKeys.simplifiedDebts(groupId ?? ''),
        queryFn: () => fetchSimplifiedDebts(client, groupId as string),
        // 短層：simplified debts（群組互動）15 秒
        staleTime: STALE.short,
        gcTime: STALE.short,
        enabled: !!groupId
    })
}

// ─── month debts（real-time，對照 settlement.ts:403-502）───
export async function fetchMonthDebts(
    client: QueryClient,
    groupId: string,
    yearMonth: string
): Promise<MonthlyDebtSnapshot> {
    const [balancesResult, debtsResult] = await Promise.all([
        supabase.rpc('get_monthly_balances', { p_group_id: groupId, p_year_month: yearMonth }),
        supabase.rpc('get_monthly_simplified_debts', { p_group_id: groupId, p_year_month: yearMonth })
    ])

    if (balancesResult.error) throw balancesResult.error
    if (debtsResult.error) throw debtsResult.error

    const balanceRows = normalizeNetBalanceRows(
        (balancesResult.data ?? []) as Array<{ user_id: string; net_balance: number }>
    )
    const debtRows = normalizeAmountRows(
        (debtsResult.data ?? []) as Array<{ from_user: string; to_user: string; amount: number }>
    )

    const profiles = await loadProfiles(client, [
        ...balanceRows.map((r) => r.user_id),
        ...debtRows.flatMap((r) => [r.from_user, r.to_user])
    ])

    const [startDate, endDate] = monthDateRange(yearMonth)
    const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .select('amount')
        .eq('group_id', groupId)
        .gte('date', startDate)
        .lt('date', endDate)

    if (expenseError) throw expenseError

    const expenses = (expenseData ?? []) as Array<{ amount: number }>
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0)
    const totalUnsettled = debtRows.reduce((sum, d) => sum + d.amount, 0)

    return {
        id: null,
        groupId,
        yearMonth,
        netBalances: balanceRows.map((r) => ({
            userId: r.user_id,
            displayName: profiles.get(r.user_id)?.display_name ?? null,
            avatarUrl: profiles.get(r.user_id)?.avatar_url ?? null,
            netBalance: r.net_balance
        })),
        simplifiedDebts: debtRows.map((r) => ({
            fromUser: {
                userId: r.from_user,
                displayName: profiles.get(r.from_user)?.display_name ?? null,
                avatarUrl: profiles.get(r.from_user)?.avatar_url ?? null
            },
            toUser: {
                userId: r.to_user,
                displayName: profiles.get(r.to_user)?.display_name ?? null,
                avatarUrl: profiles.get(r.to_user)?.avatar_url ?? null
            },
            amount: r.amount
        })),
        expenseCount: expenses.length,
        totalExpense,
        totalUnsettled,
        status: deriveSnapshotStatus(totalUnsettled, totalExpense)
    }
}

// 月份一律取 datetime.currentYearMonth()（Taipei 分桶），預設查當月；
// 修 Vue 版以 new Date().toISOString().slice(0,7)（UTC 基準）造成月界錯月。
export function useMonthDebts(
    groupId: string | null | undefined,
    yearMonth: string = currentYearMonth()
) {
    const client = useQueryClient()
    return useQuery({
        queryKey: queryKeys.monthDebts(groupId ?? '', yearMonth),
        queryFn: () => fetchMonthDebts(client, groupId as string, yearMonth),
        // 短層：settlements / month debts（月份清償）15 秒
        staleTime: STALE.short,
        gcTime: STALE.short,
        enabled: !!groupId
    })
}

// ─── historical snapshots（get_monthly_snapshots RPC，對照 settlement.ts:300-382）───
export async function fetchSnapshots(
    client: QueryClient,
    groupId: string
): Promise<MonthlyDebtSnapshot[]> {
    const { data, error } = await supabase.rpc('get_monthly_snapshots', { p_group_id: groupId })
    if (error) throw error

    const rawRows = (data ?? []) as Array<{
        id: string
        year_month: string
        snapshot_data: unknown
        total_unsettled: number
        status: string
    }>

    // 逐列 runtime 驗證 snapshot_data；不合契約的列略過（單列漂移不拖垮整月清單）。
    const rows = rawRows.flatMap((row) => {
        const parsed = snapshotDataSchema.safeParse(row.snapshot_data)
        if (!parsed.success) return []
        return [{ ...row, snapshot_data: parsed.data }]
    })

    const userIds = new Set<string>()
    for (const row of rows) {
        for (const nb of row.snapshot_data.netBalances) userIds.add(nb.userId)
        for (const sd of row.snapshot_data.simplifiedDebts) {
            userIds.add(sd.fromUser)
            userIds.add(sd.toUser)
        }
    }

    const profiles = await loadProfiles(client, [...userIds])

    return rows.map((row) => {
        const normalizedNetBal = normalizeSnapshotNetBalances(row.snapshot_data.netBalances)
        const normalizedDebts = normalizeAmountRows(row.snapshot_data.simplifiedDebts)
        const totalUnsettled = normalizedDebts.reduce((sum, d) => sum + d.amount, 0)

        return {
            id: row.id,
            groupId,
            yearMonth: row.year_month,
            netBalances: normalizedNetBal.map((nb) => ({
                userId: nb.userId,
                displayName: profiles.get(nb.userId)?.display_name ?? null,
                avatarUrl: profiles.get(nb.userId)?.avatar_url ?? null,
                netBalance: nb.netBalance
            })),
            simplifiedDebts: normalizedDebts.map((sd) => ({
                fromUser: {
                    userId: sd.fromUser,
                    displayName: profiles.get(sd.fromUser)?.display_name ?? null,
                    avatarUrl: profiles.get(sd.fromUser)?.avatar_url ?? null
                },
                toUser: {
                    userId: sd.toUser,
                    displayName: profiles.get(sd.toUser)?.display_name ?? null,
                    avatarUrl: profiles.get(sd.toUser)?.avatar_url ?? null
                },
                amount: sd.amount
            })),
            expenseCount: row.snapshot_data.expenseCount,
            totalExpense: row.snapshot_data.totalExpense,
            totalUnsettled,
            status: deriveSnapshotStatus(totalUnsettled, row.snapshot_data.totalExpense)
        }
    })
}

export function useSnapshots(groupId: string | null | undefined) {
    const client = useQueryClient()
    return useQuery({
        queryKey: queryKeys.snapshots(groupId ?? ''),
        queryFn: () => fetchSnapshots(client, groupId as string),
        // 低頻資料，本機即時性靠 mutation invalidate
        staleTime: STALE.standard,
        gcTime: STALE.standard,
        enabled: !!groupId
    })
}

// ─── available months（get_expense_months RPC，對照 settlement.ts:385-400 + useMonthlySnapshots
// allMonths），一律併入 datetime.currentYearMonth()、降冪排序 ───
export async function fetchAvailableMonths(groupId: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_expense_months', { p_group_id: groupId })
    if (error) throw error

    const months = ((data ?? []) as Array<{ year_month: string }>).map((r) => r.year_month)
    const set = new Set<string>([currentYearMonth(), ...months])
    return [...set].sort().reverse()
}

export function useAvailableMonths(groupId: string | null | undefined) {
    return useQuery({
        queryKey: queryKeys.availableMonths(groupId ?? ''),
        queryFn: () => fetchAvailableMonths(groupId as string),
        // 低頻資料，本機即時性靠 mutation invalidate
        staleTime: STALE.standard,
        gcTime: STALE.standard,
        enabled: !!groupId
    })
}

// ─── settlement history（settlements 表，對照 settlement.ts:207-257 的
// fetchSettlementHistory + getSettlementHistory）：以 settled_at 降冪，並用 loadProfiles
// enrich paid_by / paid_to 的顯示名稱與頭像 ───
export async function fetchSettlementHistory(
    client: QueryClient,
    groupId: string
): Promise<SettlementHistoryItem[]> {
    const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', groupId)
        .order('settled_at', { ascending: false })
    if (error) throw error

    const rows = (data ?? []) as SettlementRow[]
    if (rows.length === 0) return []

    const profiles = await loadProfiles(client, rows.flatMap((r) => [r.paid_by, r.paid_to]))

    return rows.map((r) => ({
        id: r.id,
        paidBy: {
            userId: r.paid_by,
            displayName: profiles.get(r.paid_by)?.display_name ?? null,
            avatarUrl: profiles.get(r.paid_by)?.avatar_url ?? null
        },
        paidTo: {
            userId: r.paid_to,
            displayName: profiles.get(r.paid_to)?.display_name ?? null,
            avatarUrl: profiles.get(r.paid_to)?.avatar_url ?? null
        },
        amount: r.amount,
        notes: r.notes,
        settledAt: r.settled_at
    }))
}

export function useSettlementHistory(groupId: string | null | undefined) {
    const client = useQueryClient()
    return useQuery({
        queryKey: queryKeys.settlements(groupId ?? ''),
        queryFn: () => fetchSettlementHistory(client, groupId as string),
        // 短層：settlements 歷史（清算紀錄）15 秒
        staleTime: STALE.short,
        gcTime: STALE.short,
        enabled: !!groupId
    })
}