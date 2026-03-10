# 背景預載優化設計

> 日期：2026-03-10
> 狀態：已核准

## 問題

切換到統計/債務頁時會觸發全量資料載入（`fetchExpenses()` 全歷史），造成明顯卡頓。同時支出頁的無限滾動機制在全量載入後變得多餘，且存在冗餘資料查詢。

## 方案：App 啟動後背景全量預載

進入 app → 渲染當前頁（即時） → 背景靜默載入所有資料 → 切頁時資料已就緒。

## 設計細節

### 1. 背景預載機制

**新增 composable**：`src/shared/composables/useBackgroundPreload.ts`

- 在 `App.vue` 的 `onMounted` 中呼叫
- 等待 `authStore.initialized` 為 true 後啟動
- 用 `requestIdleCallback`（`setTimeout` fallback）排程，不阻塞 UI
- 載入順序：
  1. 全量支出 → `expenseStore.fetchExpenses()`
  2. 債務資料 → `settlementStore.fetchNetBalances()` + `fetchSimplifiedDebts()` + `fetchMonthlySnapshots()`（僅群組模式）
- 載入完成設定 `expenseStore.preloadStatus = 'done'`
- `watch(activeGroupId)` 變化時重新預載

**載入狀態**：`expenseStore.preloadStatus: 'idle' | 'loading' | 'done'`

**錯誤處理**：
- 背景失敗靜默 retry 一次
- 仍失敗時在使用者切頁時顯示錯誤
- 不影響當前頁面

### 2. 移除無限滾動，簡化支出頁

**刪除**：
- `src/features/expense/composables/useInfiniteExpenses.ts`
- `expenseStore` 的 `loadedMonths`、`hasMoreMonths`、`fetchNextMonth()`、`resetPaginationState()`、`fetchRecentExpenses()`
- `ExpensesPage.vue` 的 infinite scroll observer

**支出頁新行為**：
- `preloadStatus === 'done'` → 直接顯示
- `preloadStatus === 'loading'` → skeleton
- `preloadStatus === 'idle'` → 主動觸發 `fetchExpenses()`

**虛擬滾動**：用 `@vueuse/core` 的 `useVirtualList` 或手寫簡易版，只渲染可視區域 ± buffer。

**Dashboard**：從 store 全量資料用 computed 取最近 N 筆，不再呼叫 `fetchRecentExpenses()`。

### 3. 修復冗餘資料載入

**3a. 統一用戶資料快取**
- `expenseStore.usersMap` 為唯一用戶資料來源
- `settlementStore` 移除 `profileCache`，改讀 `expenseStore.usersMap`

**3b. 減少月度債務 RPC**
- 歷史月份：用 `snapshot_data` 的 `netBalances`/`simplifiedDebts`
- 僅當月（無快照）：才呼叫 RPC
- RPC 呼叫從 5 個降到 3 個（當月）或 1 個（歷史月）

**3c. 統計頁不再自行 fetch**
- 移除 `StatisticsPanel` 的 `onMounted` fetch
- `watch(preloadStatus)` 等待完成，預載前顯示 skeleton

### 4. 載入狀態 UX

| 頁面 | 預載未完成 | 預載完成 |
|------|-----------|---------|
| Dashboard | Skeleton cards | 直接顯示 |
| 支出頁 | Skeleton list | 全量 + 虛擬滾動 |
| 統計面板 | Skeleton 圖表 | 直接渲染 |
| 債務面板 | Skeleton cards | 直接顯示 |

- 不做 progress bar，只用 skeleton 佔位
- 群組切換：`preloadStatus` 重設 → 重新預載 → skeleton 過渡
- 下拉刷新：清快取 → 重新全量載入

## 不採用

- **Web Worker**：瓶頸在網路 I/O 非 CPU，Supabase client 綁定 main thread（auth token），序列化開銷可能抵消收益
- **伺服器端聚合**：工作量大，情侶記帳資料量不需要
- **分段背景載入**：增加複雜度，收益不大

## 影響範圍

| 檔案 | 變更類型 |
|------|---------|
| `src/shared/composables/useBackgroundPreload.ts` | 新增 |
| `src/features/expense/stores/expense.ts` | 修改（移除分頁、加 preloadStatus） |
| `src/features/expense/composables/useInfiniteExpenses.ts` | 刪除 |
| `src/pages/expenses/ExpensesPage.vue` | 修改（移除 infinite scroll，加虛擬滾動） |
| `src/pages/dashboard/DashboardPage.vue` | 修改（改用 computed） |
| `src/features/statistics/components/StatisticsPanel.vue` | 修改（移除 onMounted fetch） |
| `src/features/settlement/stores/settlement.ts` | 修改（移除 profileCache） |
| `src/features/settlement/composables/useMonthlySnapshots.ts` | 修改（減少 RPC） |
| `src/app/App.vue` | 修改（加入 useBackgroundPreload） |
