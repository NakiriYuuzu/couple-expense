import { ref, computed, watch } from 'vue'
import { useSettlementStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import type { MonthlyDebtSnapshot } from '@/entities/settlement/types'

function getCurrentYearMonth(): string {
    return new Date().toISOString().slice(0, 7)
}

export function useMonthlySnapshots() {
    const settlementStore = useSettlementStore()
    const groupStore = useGroupStore()

    const selectedMonth = ref(getCurrentYearMonth())
    const isLoading = ref(false)

    // All months: available expense months + historical snapshots + current month
    const allMonths = computed<string[]>(() => {
        const current = getCurrentYearMonth()
        const expenseMonths = settlementStore.availableMonths
        const snapshotMonths = settlementStore.monthlySnapshots.map(s => s.yearMonth)
        const allSet = new Set([current, ...expenseMonths, ...snapshotMonths])
        return [...allSet].sort().reverse()
    })

    // The snapshot for the selected month (cache → snapshots → null)
    const selectedSnapshot = computed<MonthlyDebtSnapshot | null>(() => {
        const month = selectedMonth.value

        // Check real-time cache first
        const cached = settlementStore.monthDebtCache[month]
        if (cached) return cached

        // Check historical snapshots
        return settlementStore.monthlySnapshots.find(
            s => s.yearMonth === month
        ) ?? null
    })

    // Load data when group changes
    const loadData = async () => {
        const groupId = groupStore.activeGroupId
        if (!groupId) return

        isLoading.value = true
        try {
            await Promise.all([
                settlementStore.fetchAvailableMonths(groupId),
                settlementStore.fetchMonthlySnapshots(groupId),
                settlementStore.fetchCurrentMonthDebts(groupId)
            ])
            selectedMonth.value = getCurrentYearMonth()
        } finally {
            isLoading.value = false
        }
    }

    // Fetch debts when selected month changes
    watch(selectedMonth, async (newMonth) => {
        const groupId = groupStore.activeGroupId
        if (!groupId) return

        // Skip if already cached
        if (settlementStore.monthDebtCache[newMonth]) return

        isLoading.value = true
        try {
            await settlementStore.fetchMonthDebts(groupId, newMonth)
        } finally {
            isLoading.value = false
        }
    })

    const refreshCurrentMonth = async () => {
        const groupId = groupStore.activeGroupId
        if (!groupId) return
        await settlementStore.fetchCurrentMonthDebts(groupId)
    }

    watch(
        () => groupStore.activeGroupId,
        (newId) => {
            if (newId) {
                loadData()
            } else {
                settlementStore.clearSettlementData()
            }
        },
        { immediate: true }
    )

    return {
        selectedMonth,
        allMonths,
        selectedSnapshot,
        isLoading,
        loadData,
        refreshCurrentMonth
    }
}
