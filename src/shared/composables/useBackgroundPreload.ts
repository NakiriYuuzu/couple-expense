import { useExpenseStore, useGroupStore, useSettlementStore } from '@/shared/stores'

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

    // 版本計數器：每次 startPreload 遞增，過時的預載自動放棄結果
    let preloadVersion = 0

    const preloadExpenses = async (version: number): Promise<boolean> => {
        expenseStore.preloadStatus = 'loading'
        try {
            await expenseStore.fetchExpenses()
            if (version !== preloadVersion) return false
            expenseStore.preloadStatus = 'done'
            return true
        } catch {
            if (version !== preloadVersion) return false
            // Retry once
            try {
                await expenseStore.fetchExpenses()
                if (version !== preloadVersion) return false
                expenseStore.preloadStatus = 'done'
                return true
            } catch {
                if (version !== preloadVersion) return false
                expenseStore.preloadStatus = 'error'
                return false
            }
        }
    }

    const preloadSettlement = async (version: number): Promise<void> => {
        const groupId = groupStore.activeGroupId
        if (!groupId) return
        if (version !== preloadVersion) return

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
        const version = ++preloadVersion
        scheduleIdleTask(async () => {
            const ok = await preloadExpenses(version)
            if (ok && version === preloadVersion) {
                await preloadSettlement(version)
            }
        })
    }

    const refresh = async (): Promise<void> => {
        const version = ++preloadVersion
        expenseStore.preloadStatus = 'loading'
        try {
            await expenseStore.fetchExpenses()
            if (version !== preloadVersion) return
            expenseStore.preloadStatus = 'done'

            const groupId = groupStore.activeGroupId
            if (groupId) {
                await preloadSettlement(version)
            }
        } catch {
            if (version !== preloadVersion) return
            expenseStore.preloadStatus = 'error'
        }
    }

    return {
        startPreload,
        refresh
    }
}
