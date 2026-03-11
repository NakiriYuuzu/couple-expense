import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettlementStore } from '@/shared/stores'

export function useNetBalances() {
    const settlementStore = useSettlementStore()
    const { netBalances, simplifiedDebts, settlements, loading } = storeToRefs(settlementStore)

    // Format a balance amount for display
    const formatBalance = (amount: number): string => {
        const abs = Math.abs(amount)
        if (amount > 0) return `+NT$ ${abs.toLocaleString()}`
        if (amount < 0) return `-NT$ ${abs.toLocaleString()}`
        return 'NT$ 0'
    }

    // Determine balance status for a given amount (integer TWD)
    const getBalanceStatus = (amount: number): 'owed' | 'owes' | 'settled' => {
        const rounded = Math.round(amount)
        if (rounded > 0) return 'owed'
        if (rounded < 0) return 'owes'
        return 'settled'
    }

    // Whether there are any outstanding debts across all balances
    const hasOutstandingDebts = computed(() => settlementStore.hasOutstandingDebts)

    // Sum of all positive (receivable) net balances
    const totalGroupDebt = computed(() => settlementStore.totalGroupDebt)

    return {
        netBalances,
        simplifiedDebts,
        settlements,
        loading,
        hasOutstandingDebts,
        totalGroupDebt,
        formatBalance,
        getBalanceStatus
    }
}
