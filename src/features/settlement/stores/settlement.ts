import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import type { SettlementRow, UserProfileRow } from '@/shared/lib/database.types'
import type { NetBalance, SimplifiedDebt, SettlementHistoryItem, MonthlyDebtSnapshot } from '@/entities/settlement/types'
import { normalizeNetBalances, normalizePositiveAmounts } from '@/shared/lib/integerDebt'

type UserProfileLookup = Pick<UserProfileRow, 'display_name' | 'avatar_url'>

// Normalization helpers — apply integer rounding at the data boundary

const normalizeNetBalanceRows = <T extends { net_balance: number }>(rows: T[]): T[] => {
    const normalized = normalizeNetBalances(rows.map(row => row.net_balance))
    return rows.map((row, index) => ({
        ...row,
        net_balance: normalized[index] ?? 0
    }))
}

const normalizeAmountRows = <T extends { amount: number }>(rows: T[]): T[] => {
    const normalized = normalizePositiveAmounts(rows.map(row => row.amount))
    return rows
        .map((row, index) => ({
            ...row,
            amount: normalized[index] ?? 0
        }))
        .filter(row => row.amount > 0)
}

const normalizeSnapshotNetBalances = <T extends { netBalance: number }>(rows: T[]): T[] => {
    const normalized = normalizeNetBalances(rows.map(row => row.netBalance))
    return rows.map((row, index) => ({
        ...row,
        netBalance: normalized[index] ?? 0
    }))
}

export const useSettlementStore = defineStore('settlement', () => {
    // State
    const netBalances = ref<NetBalance[]>([])
    const simplifiedDebts = ref<SimplifiedDebt[]>([])
    const settlements = ref<SettlementRow[]>([])
    const loadingCount = ref(0)
    const loading = computed(() => loadingCount.value > 0)
    const error = ref<string | null>(null)
    const monthlySnapshots = ref<MonthlyDebtSnapshot[]>([])
    const currentMonthSnapshot = ref<MonthlyDebtSnapshot | null>(null)
    const availableMonths = ref<string[]>([])
    const monthDebtCache = ref<Record<string, MonthlyDebtSnapshot>>({})
    const profileCache = ref<Map<string, UserProfileLookup>>(new Map())

    // Computed — netBalances is already normalized by fetchNetBalances, no need to re-normalize
    const hasOutstandingDebts = computed(() =>
        netBalances.value.some(b => Math.abs(b.netBalance) > 0)
    )

    const totalGroupDebt = computed(() =>
        netBalances.value
            .filter(b => b.netBalance > 0)
            .reduce((sum, b) => sum + b.netBalance, 0)
    )

    // Helper: fetch user profiles by IDs and build a lookup map（含 store-level 快取）
    const fetchUserProfilesMap = async (
        userIds: string[]
    ): Promise<Map<string, UserProfileLookup>> => {
        if (userIds.length === 0) return new Map()

        // 過濾出未快取的 IDs
        const uncachedIds = userIds.filter(id => !profileCache.value.has(id))

        if (uncachedIds.length > 0) {
            const { data, error: profilesError } = await supabase
                .from('user_profiles')
                .select('id, display_name, avatar_url')
                .in('id', uncachedIds)

            if (profilesError) {
                console.error('獲取用戶資料失敗:', profilesError)
            }

            const rows = (data ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>

            // Immutable cache update
            const nextCache = new Map(profileCache.value)
            for (const p of rows) {
                nextCache.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url })
            }
            profileCache.value = nextCache
        }

        // 從快取回傳請求的 profiles
        const result = new Map<string, UserProfileLookup>()
        for (const id of userIds) {
            const cached = profileCache.value.get(id)
            if (cached) result.set(id, cached)
        }
        return result
    }

    // Action: fetch net balances for a group
    const fetchNetBalances = async (groupId: string): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { data, error: rpcError } = await supabase
                .rpc('get_group_balances', { p_group_id: groupId })

            if (rpcError) throw rpcError

            const rows = normalizeNetBalanceRows(
                (data ?? []) as Array<{ user_id: string; net_balance: number }>
            )
            const userIds = rows.map(r => r.user_id)
            const profilesMap = await fetchUserProfilesMap(userIds)

            netBalances.value = rows.map(r => {
                const profile = profilesMap.get(r.user_id)
                return {
                    userId: r.user_id,
                    displayName: profile?.display_name ?? null,
                    avatarUrl: profile?.avatar_url ?? null,
                    netBalance: r.net_balance
                }
            })
        } catch (err) {
            console.error('獲取群組餘額失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取群組餘額失敗'
        } finally {
            loadingCount.value--
        }
    }

    // Action: fetch simplified debts for a group
    const fetchSimplifiedDebts = async (groupId: string): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { data, error: rpcError } = await supabase
                .rpc('get_simplified_debts', { p_group_id: groupId })

            if (rpcError) throw rpcError

            const rows = normalizeAmountRows(
                (data ?? []) as Array<{ from_user: string; to_user: string; amount: number }>
            )
            const allUserIds = [
                ...new Set(rows.flatMap(r => [r.from_user, r.to_user]))
            ]

            const profilesMap = await fetchUserProfilesMap(allUserIds)

            simplifiedDebts.value = rows.map(r => {
                const fromProfile = profilesMap.get(r.from_user)
                const toProfile = profilesMap.get(r.to_user)
                return {
                    fromUser: {
                        userId: r.from_user,
                        displayName: fromProfile?.display_name ?? null,
                        avatarUrl: fromProfile?.avatar_url ?? null
                    },
                    toUser: {
                        userId: r.to_user,
                        displayName: toProfile?.display_name ?? null,
                        avatarUrl: toProfile?.avatar_url ?? null
                    },
                    amount: r.amount
                }
            })
        } catch (err) {
            console.error('獲取簡化債務失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取簡化債務失敗'
        } finally {
            loadingCount.value--
        }
    }

    // Action: fetch settlement history for a group
    const fetchSettlementHistory = async (groupId: string): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { data, error: queryError } = await supabase
                .from('settlements')
                .select('*')
                .eq('group_id', groupId)
                .order('settled_at', { ascending: false })

            if (queryError) throw queryError

            settlements.value = (data ?? []) as SettlementRow[]
        } catch (err) {
            console.error('獲取結算歷史失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取結算歷史失敗'
        } finally {
            loadingCount.value--
        }
    }

    // Async getter: settlement history enriched with user profiles
    const getSettlementHistory = async (): Promise<SettlementHistoryItem[]> => {
        const rows = settlements.value
        if (rows.length === 0) return []

        const userIds = [...new Set(rows.flatMap(r => [r.paid_by, r.paid_to]))]
        const profilesMap = await fetchUserProfilesMap(userIds)

        return rows.map(r => {
            const paidByProfile = profilesMap.get(r.paid_by)
            const paidToProfile = profilesMap.get(r.paid_to)
            return {
                id: r.id,
                paidBy: {
                    userId: r.paid_by,
                    displayName: paidByProfile?.display_name ?? null,
                    avatarUrl: paidByProfile?.avatar_url ?? null
                },
                paidTo: {
                    userId: r.paid_to,
                    displayName: paidToProfile?.display_name ?? null,
                    avatarUrl: paidToProfile?.avatar_url ?? null
                },
                amount: r.amount,
                notes: r.notes,
                settledAt: r.settled_at
            }
        })
    }

    // Action: create a settlement record and refresh balances
    const createSettlement = async (
        groupId: string,
        paidTo: string,
        amount: number,
        notes?: string
    ): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { error: rpcError } = await supabase
                .rpc('settle_debt', {
                    p_group_id: groupId,
                    p_paid_to: paidTo,
                    p_amount: amount,
                    p_notes: notes
                })

            if (rpcError) throw rpcError

            // Refresh balances and debts after settlement
            await Promise.all([
                fetchNetBalances(groupId),
                fetchSimplifiedDebts(groupId)
            ])
        } catch (err) {
            console.error('建立結算記錄失敗:', err)
            error.value = err instanceof Error ? err.message : '建立結算記錄失敗'
            throw err
        } finally {
            loadingCount.value--
        }
    }

    // Action: fetch all monthly snapshots for a group
    const fetchMonthlySnapshots = async (groupId: string): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { data, error: rpcError } = await supabase
                .rpc('get_monthly_snapshots', { p_group_id: groupId })

            if (rpcError) throw rpcError

            const rows = (data ?? []) as unknown as Array<{
                id: string
                year_month: string
                snapshot_data: {
                    netBalances: Array<{ userId: string; netBalance: number }>
                    simplifiedDebts: Array<{ fromUser: string; toUser: string; amount: number }>
                    expenseCount: number
                    totalExpense: number
                }
                total_unsettled: number
                status: string
            }>

            const allUserIds = new Set<string>()
            for (const row of rows) {
                for (const nb of row.snapshot_data.netBalances) {
                    allUserIds.add(nb.userId)
                }
                for (const sd of row.snapshot_data.simplifiedDebts) {
                    allUserIds.add(sd.fromUser)
                    allUserIds.add(sd.toUser)
                }
            }

            const profilesMap = await fetchUserProfilesMap([...allUserIds])

            monthlySnapshots.value = rows.map(row => {
                const normalizedNetBal = normalizeSnapshotNetBalances(row.snapshot_data.netBalances)
                const normalizedDebts = normalizeAmountRows(row.snapshot_data.simplifiedDebts)
                const totalUnsettled = normalizedDebts.reduce((sum, debt) => sum + debt.amount, 0)

                return {
                    id: row.id,
                    groupId,
                    yearMonth: row.year_month,
                    netBalances: normalizedNetBal.map(nb => ({
                        userId: nb.userId,
                        displayName: profilesMap.get(nb.userId)?.display_name ?? null,
                        avatarUrl: profilesMap.get(nb.userId)?.avatar_url ?? null,
                        netBalance: nb.netBalance
                    })),
                    simplifiedDebts: normalizedDebts.map(sd => ({
                        fromUser: {
                            userId: sd.fromUser,
                            displayName: profilesMap.get(sd.fromUser)?.display_name ?? null,
                            avatarUrl: profilesMap.get(sd.fromUser)?.avatar_url ?? null
                        },
                        toUser: {
                            userId: sd.toUser,
                            displayName: profilesMap.get(sd.toUser)?.display_name ?? null,
                            avatarUrl: profilesMap.get(sd.toUser)?.avatar_url ?? null
                        },
                        amount: sd.amount
                    })),
                    expenseCount: row.snapshot_data.expenseCount,
                    totalExpense: row.snapshot_data.totalExpense,
                    totalUnsettled,
                    status: totalUnsettled === 0
                        ? 'settled'
                        : row.status as MonthlyDebtSnapshot['status']
                }
            })
        } catch (err) {
            console.error('獲取月結快照失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取月結快照失敗'
        } finally {
            loadingCount.value--
        }
    }

    // Action: fetch available months with expenses for a group
    const fetchAvailableMonths = async (groupId: string): Promise<void> => {
        try {
            const { data, error: rpcError } = await supabase
                .rpc('get_expense_months', { p_group_id: groupId })

            if (rpcError) throw rpcError

            availableMonths.value = ((data ?? []) as Array<{ year_month: string }>)
                .map(r => r.year_month)
        } catch (err) {
            console.error('獲取可用月份失敗:', err)
        }
    }

    // Action: fetch debts for any month (real-time calculation)
    const fetchMonthDebts = async (
        groupId: string,
        yearMonth: string,
        forceRefresh = false
    ): Promise<void> => {
        if (!forceRefresh && monthDebtCache.value[yearMonth]) return

        try {
            loadingCount.value++
            error.value = null

            const [balancesResult, debtsResult] = await Promise.all([
                supabase.rpc('get_monthly_balances', {
                    p_group_id: groupId,
                    p_year_month: yearMonth
                }),
                supabase.rpc('get_monthly_simplified_debts', {
                    p_group_id: groupId,
                    p_year_month: yearMonth
                })
            ])

            if (balancesResult.error) throw balancesResult.error
            if (debtsResult.error) throw debtsResult.error

            const balanceRows = normalizeNetBalanceRows(
                (balancesResult.data ?? []) as Array<{ user_id: string; net_balance: number }>
            )
            const debtRows = normalizeAmountRows(
                (debtsResult.data ?? []) as Array<{ from_user: string; to_user: string; amount: number }>
            )

            const allUserIds = [
                ...new Set([
                    ...balanceRows.map(r => r.user_id),
                    ...debtRows.flatMap(r => [r.from_user, r.to_user])
                ])
            ]
            const profilesMap = await fetchUserProfilesMap(allUserIds)

            const startDate = `${yearMonth}-01`
            const nextMonth = new Date(startDate)
            nextMonth.setMonth(nextMonth.getMonth() + 1)
            const endDate = nextMonth.toISOString().slice(0, 10)

            const { data: expenseData } = await supabase
                .from('expenses')
                .select('amount')
                .eq('group_id', groupId)
                .gte('date', startDate)
                .lt('date', endDate)

            const expenses = (expenseData ?? []) as Array<{ amount: number }>
            const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0)
            const totalUnsettled = debtRows.reduce((sum, d) => sum + d.amount, 0)

            const snapshot: MonthlyDebtSnapshot = {
                id: null,
                groupId,
                yearMonth,
                netBalances: balanceRows.map(r => ({
                    userId: r.user_id,
                    displayName: profilesMap.get(r.user_id)?.display_name ?? null,
                    avatarUrl: profilesMap.get(r.user_id)?.avatar_url ?? null,
                    netBalance: r.net_balance
                })),
                simplifiedDebts: debtRows.map(r => ({
                    fromUser: {
                        userId: r.from_user,
                        displayName: profilesMap.get(r.from_user)?.display_name ?? null,
                        avatarUrl: profilesMap.get(r.from_user)?.avatar_url ?? null
                    },
                    toUser: {
                        userId: r.to_user,
                        displayName: profilesMap.get(r.to_user)?.display_name ?? null,
                        avatarUrl: profilesMap.get(r.to_user)?.avatar_url ?? null
                    },
                    amount: r.amount
                })),
                expenseCount: expenses.length,
                totalExpense,
                totalUnsettled,
                status: totalUnsettled === 0 ? 'settled'
                    : totalUnsettled < totalExpense * 0.5 ? 'partial'
                    : 'unsettled'
            }

            // Immutable cache update
            monthDebtCache.value = { ...monthDebtCache.value, [yearMonth]: snapshot }

            // Backward compatibility
            const currentYearMonth = new Date().toISOString().slice(0, 7)
            if (yearMonth === currentYearMonth) {
                currentMonthSnapshot.value = snapshot
            }
        } catch (err) {
            console.error('獲取月份債務失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取月份債務失敗'
        } finally {
            loadingCount.value--
        }
    }

    // Convenience wrapper for current month
    const fetchCurrentMonthDebts = async (groupId: string): Promise<void> => {
        const currentYearMonth = new Date().toISOString().slice(0, 7)
        await fetchMonthDebts(groupId, currentYearMonth, true)
    }

    // Action: settle debt for a specific month
    const settleMonthlyDebt = async (
        groupId: string,
        paidTo: string,
        amount: number,
        yearMonth: string,
        notes?: string
    ): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { error: rpcError } = await supabase
                .rpc('settle_monthly_debt', {
                    p_group_id: groupId,
                    p_paid_to: paidTo,
                    p_amount: amount,
                    p_notes: notes,
                    p_year_month: yearMonth
                })

            if (rpcError) throw rpcError

            // Force refresh the settled month's cache
            await fetchMonthDebts(groupId, yearMonth, true)
            await fetchMonthlySnapshots(groupId)
        } catch (err) {
            console.error('月結結算失敗:', err)
            error.value = err instanceof Error ? err.message : '月結結算失敗'
            throw err
        } finally {
            loadingCount.value--
        }
    }

    // Action: update an existing settlement
    const updateSettlement = async (
        settlementId: string,
        groupId: string,
        amount: number,
        notes?: string
    ): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { error: rpcError } = await supabase
                .rpc('update_settlement', {
                    p_settlement_id: settlementId,
                    p_amount: amount,
                    p_notes: notes
                })

            if (rpcError) throw rpcError

            await Promise.all([
                fetchNetBalances(groupId),
                fetchSimplifiedDebts(groupId)
            ])
        } catch (err) {
            console.error('更新結算記錄失敗:', err)
            error.value = err instanceof Error ? err.message : '更新結算記錄失敗'
            throw err
        } finally {
            loadingCount.value--
        }
    }

    // Action: delete a settlement record
    const deleteSettlement = async (
        settlementId: string,
        groupId: string
    ): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { error: rpcError } = await supabase
                .rpc('delete_settlement', {
                    p_settlement_id: settlementId
                })

            if (rpcError) throw rpcError

            await Promise.all([
                fetchNetBalances(groupId),
                fetchSimplifiedDebts(groupId)
            ])
        } catch (err) {
            console.error('刪除結算記錄失敗:', err)
            error.value = err instanceof Error ? err.message : '刪除結算記錄失敗'
            throw err
        } finally {
            loadingCount.value--
        }
    }

    // Action: settle an entire expense in one shot (RPC: settle_expense)
    const settleExpense = async (
        expenseId: string,
        groupId: string,
        expenseYearMonth: string,
        notes?: string
    ): Promise<number> => {
        try {
            loadingCount.value++
            error.value = null

            const { data, error: rpcError } = await supabase
                .rpc('settle_expense', {
                    p_expense_id: expenseId,
                    p_notes: notes
                })

            if (rpcError) throw rpcError

            await Promise.all([
                fetchNetBalances(groupId),
                fetchSimplifiedDebts(groupId),
                fetchMonthDebts(groupId, expenseYearMonth, true),
                fetchMonthlySnapshots(groupId)
            ])

            return (data as number | null) ?? 0
        } catch (err) {
            console.error('結算費用失敗:', err)
            error.value = err instanceof Error ? err.message : '結算費用失敗'
            throw err
        } finally {
            loadingCount.value--
        }
    }

    // Action: clear all settlement data
    const clearSettlementData = (): void => {
        netBalances.value = []
        simplifiedDebts.value = []
        settlements.value = []
        monthlySnapshots.value = []
        currentMonthSnapshot.value = null
        availableMonths.value = []
        monthDebtCache.value = {}
        profileCache.value = new Map()
        error.value = null
    }

    // Action: invalidate profile cache for a specific user or all users
    const invalidateProfileCache = (userId?: string): void => {
        if (userId) {
            const nextCache = new Map(profileCache.value)
            nextCache.delete(userId)
            profileCache.value = nextCache
        } else {
            profileCache.value = new Map()
        }
    }

    return {
        // State
        netBalances,
        simplifiedDebts,
        settlements,
        monthlySnapshots,
        currentMonthSnapshot,
        availableMonths,
        monthDebtCache,
        loading,
        error,

        // Computed
        hasOutstandingDebts,
        totalGroupDebt,

        // Actions
        fetchNetBalances,
        fetchSimplifiedDebts,
        fetchSettlementHistory,
        getSettlementHistory,
        createSettlement,
        settleExpense,
        updateSettlement,
        deleteSettlement,
        clearSettlementData,
        fetchMonthlySnapshots,
        fetchAvailableMonths,
        fetchMonthDebts,
        fetchCurrentMonthDebts,
        settleMonthlyDebt,
        invalidateProfileCache
    }
})
