import { useExpenseStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import { useSettlementStore } from '@/features/settlement/stores/settlement'

function scheduleIdleTask(fn: () => void): void {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(fn)
    } else {
        setTimeout(fn, 50)
    }
}

export function useBackgroundPreload() {
    const expenseStore = useExpenseStore()
    const groupStore = useGroupStore()
    const settlementStore = useSettlementStore()

    const preloadExpenses = async (): Promise<void> => {
        expenseStore.preloadStatus = 'loading'
        try {
            await expenseStore.fetchExpenses()
            expenseStore.preloadStatus = 'done'
        } catch {
            // Retry once
            try {
                await expenseStore.fetchExpenses()
                expenseStore.preloadStatus = 'done'
            } catch {
                expenseStore.preloadStatus = 'error'
            }
        }
    }

    const preloadSettlement = async (): Promise<void> => {
        const groupId = groupStore.activeGroupId
        if (!groupId) return

        await Promise.all([
            settlementStore.fetchNetBalances(groupId),
            settlementStore.fetchSimplifiedDebts(groupId),
            settlementStore.fetchAvailableMonths(groupId),
            settlementStore.fetchMonthlySnapshots(groupId),
            settlementStore.fetchCurrentMonthDebts(groupId)
        ]).catch(err => {
            console.error('背景預載結算資料失敗:', err)
        })
    }

    const startPreload = (): void => {
        scheduleIdleTask(async () => {
            await preloadExpenses()
            await preloadSettlement()
        })
    }

    const refresh = async (): Promise<void> => {
        expenseStore.preloadStatus = 'loading'
        try {
            await expenseStore.fetchExpenses()
            expenseStore.preloadStatus = 'done'

            const groupId = groupStore.activeGroupId
            if (groupId) {
                await preloadSettlement()
            }
        } catch {
            expenseStore.preloadStatus = 'error'
        }
    }

    return {
        startPreload,
        refresh
    }
}
