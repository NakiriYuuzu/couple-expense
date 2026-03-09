import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import type { SettlementRow, UserProfileRow } from '@/shared/lib/database.types'
import type { NetBalance, SimplifiedDebt, SettlementHistoryItem } from '@/entities/settlement/types'

type UserProfileLookup = Pick<UserProfileRow, 'display_name' | 'avatar_url'>

export const useSettlementStore = defineStore('settlement', () => {
    // State
    const netBalances = ref<NetBalance[]>([])
    const simplifiedDebts = ref<SimplifiedDebt[]>([])
    const settlements = ref<SettlementRow[]>([])
    const loadingCount = ref(0)
    const loading = computed(() => loadingCount.value > 0)
    const error = ref<string | null>(null)

    // Computed
    const hasOutstandingDebts = computed(() =>
        netBalances.value.some(b => Math.abs(b.netBalance) > 0.01)
    )

    const totalGroupDebt = computed(() =>
        netBalances.value
            .filter(b => b.netBalance > 0)
            .reduce((sum, b) => sum + b.netBalance, 0)
    )

    // Helper: fetch user profiles by IDs and build a lookup map
    const fetchUserProfilesMap = async (
        userIds: string[]
    ): Promise<Map<string, UserProfileLookup>> => {
        if (userIds.length === 0) return new Map()

        const { data, error: profilesError } = await supabase
            .from('user_profiles')
            .select('id, display_name, avatar_url')
            .in('id', userIds)

        if (profilesError) {
            console.error('獲取用戶資料失敗:', profilesError)
        }

        const rows = (data ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>

        return new Map(
            rows.map(p => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }])
        )
    }

    // Action: fetch net balances for a group
    const fetchNetBalances = async (groupId: string): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            // @ts-expect-error RPC function types not in generated types yet
            const { data, error: rpcError } = await supabase
                .rpc('get_group_balances', { p_group_id: groupId })

            if (rpcError) throw rpcError

            const rows = (data ?? []) as Array<{ user_id: string; net_balance: number }>
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

            // @ts-expect-error RPC function types not in generated types yet
            const { data, error: rpcError } = await supabase
                .rpc('get_simplified_debts', { p_group_id: groupId })

            if (rpcError) throw rpcError

            const rows = (data ?? []) as Array<{ from_user: string; to_user: string; amount: number }>
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

            // @ts-expect-error RPC function types not in generated types yet
            const { error: rpcError } = await supabase
                .rpc('settle_debt', {
                    p_group_id: groupId,
                    p_paid_to: paidTo,
                    p_amount: amount,
                    p_notes: notes ?? null
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

    // Action: clear all settlement data
    const clearSettlementData = (): void => {
        netBalances.value = []
        simplifiedDebts.value = []
        settlements.value = []
        error.value = null
    }

    return {
        // State
        netBalances,
        simplifiedDebts,
        settlements,
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
        clearSettlementData
    }
})
