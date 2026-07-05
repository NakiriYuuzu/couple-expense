import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/shared/lib/queryKeys'

// 費用寫入後的目標式 invalidate（取代 Vue 版手工快取編排）。
//   - expenses：以 ['expenses'] 前綴一次作廢（個人與群組兩個分區），因群組費用同時牽動
//     付款者的個人費用視圖。
//   - splits：以 ['splits'] 前綴作廢所有 expense 的分帳明細——update_group_expense 會
//     DELETE 舊 splits + INSERT 新 splits（同 expense id），不作廢會讓詳情頁分帳明細陳舊。
//   - 群組相關（groupId 非 null）：balances / simplifiedDebts / snapshots 全綁該群組；
//     monthDebts 以 ['monthDebts', groupId] 前綴作廢所有月份（一筆費用可落在任一月）；
//     availableMonths 亦作廢——補記到「原本無費用之月份」的費用需即時進月份選單。
export function invalidateExpenseScope(client: QueryClient, groupId: string | null): void {
    invalidateExpenseScopes(client, groupId ? [groupId] : [])
}

export function invalidateExpenseScopes(client: QueryClient, groupIds: string[]): void {
    void client.invalidateQueries({ queryKey: queryKeys.expensesRoot() })
    void client.invalidateQueries({ queryKey: queryKeys.splitsRoot() })
    void client.invalidateQueries({ queryKey: queryKeys.expenseSplitSharesRoot() })

    for (const groupId of [...new Set(groupIds)]) {
        void client.invalidateQueries({ queryKey: queryKeys.balances(groupId) })
        void client.invalidateQueries({ queryKey: queryKeys.simplifiedDebts(groupId) })
        void client.invalidateQueries({ queryKey: queryKeys.snapshots(groupId) })
        void client.invalidateQueries({ queryKey: queryKeys.monthDebtsRoot(groupId) })
        void client.invalidateQueries({ queryKey: queryKeys.availableMonths(groupId) })
    }
}
