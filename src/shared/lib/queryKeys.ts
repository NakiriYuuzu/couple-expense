// Query key 唯一入口（Phase 4）：全 app 的 TanStack Query key 一律經此工廠產生，
// 禁止在 hook 內就地拼 ['expenses', ...] 這類字面陣列。集中定義的價值：
//   - groupId 進 key → 切群組即換 cache 分區，切換自動 refetch、競態由 Query 內建隔離
//     （架構級消滅 P1-1 首次切換吞噬 / P2 慢回應覆寫新資料）
//   - mutation 成功後以同一組 key 做目標式 invalidate（取代 Vue 版手工 cache 編排）
// 全部回傳 `as const` tuple，讓 key 型別穩定、prefix invalidation（如 ['monthDebts', groupId]）可用。

export const queryKeys = {
    // 全範疇單一分區（RLS 限定可見範圍，client 端各頁自行過濾）
    expensesRoot: () => ['expenses'] as const,
    expenses: () => ['expenses', 'all'] as const,
    splitsRoot: () => ['splits'] as const,
    splits: (expenseId: string) => ['splits', expenseId] as const,
    expenseSplitSharesRoot: () => ['expenseSplitShares'] as const,
    expenseSplitShares: (userId: string, expenseIdsKey: string) => ['expenseSplitShares', userId, expenseIdsKey] as const,
    balances: (groupId: string) => ['balances', groupId] as const,
    simplifiedDebts: (groupId: string) => ['simplifiedDebts', groupId] as const,
    monthDebtsRoot: (groupId: string) => ['monthDebts', groupId] as const,
    monthDebts: (groupId: string, yearMonth: string) => ['monthDebts', groupId, yearMonth] as const,
    snapshots: (groupId: string) => ['snapshots', groupId] as const,
    settlements: (groupId: string) => ['settlements', groupId] as const,
    availableMonths: (groupId: string) => ['availableMonths', groupId] as const,
    profiles: (userId: string) => ['profiles', userId] as const,
    detailProfiles: (profileIdsKey: string) => ['detailProfiles', profileIdsKey] as const,
    memberProfiles: (profileIdsKey: string) => ['member-profiles', profileIdsKey] as const,
    userProfileBudget: (userId: string) => ['userProfileBudget', userId] as const,
    groups: () => ['groups'] as const,
    groupMembers: (groupId: string) => ['groupMembers', groupId] as const,
    groupSettings: (groupId: string) => ['groupSettings', groupId] as const,
    recurring: () => ['recurring'] as const,
    monthlyReports: (userId: string) => ['monthlyReports', userId] as const,
    monthlyReport: (userId: string, yearMonth: string) => ['monthlyReports', userId, yearMonth] as const,
    userSettings: (userId: string) => ['userSettings', userId] as const,
    notificationPrefs: (userId: string) => ['notificationPrefs', userId] as const
} as const
