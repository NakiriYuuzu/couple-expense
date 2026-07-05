# CLAUDE.md

本檔案是本專案的 agent 工作指引。若與使用者當前指令衝突，以使用者當前指令為準。

## 專案現況

- repo：`couple-expense-react19`
- package name：`family-expense`
- 前端：React 19 + TypeScript + Vite 8 beta
- 後端：Supabase Auth、Postgres `group_expense` schema、RLS、Edge Functions
- 套件管理與指令：優先使用 Bun

## 必讀真相來源

修改前先讀實際程式碼與設定，不只依賴 README：

- [package.json](./package.json)
- [vite.config.ts](./vite.config.ts)
- [vitest.config.ts](./vitest.config.ts)
- [src/shared/lib/database.types.ts](./src/shared/lib/database.types.ts)
- [schema.sql](./schema.sql)
- [migrations/](./migrations)

## 常用命令

```bash
bun run dev
bun run build
bun run typecheck
bun run test
bun run preview
```

## 架構規範

- `src/routes/` 只做薄 route shell：loader/route params/懶載入頁面。
- `src/pages/` 組合頁面流程與 layout，不直接藏資料層複雜度。
- `src/features/*/api/` 放 TanStack Query hooks、mutation hooks、Supabase RPC 呼叫。
- `src/features/*/components/` 放 feature-local UI。
- `src/shared/lib/` 放跨 feature 的唯一真相模組。
- `src/shared/stores/` 放 Zustand store；伺服器資料不要放進 Zustand，交給 TanStack Query。

## 統一模組

### 時間

所有日曆日、月/週分桶與顯示口徑以 [src/shared/lib/datetime.ts](./src/shared/lib/datetime.ts) 為準。

- `APP_TZ = 'Asia/Taipei'`
- `taipeiDateString()`：UTC instant 轉台北日曆日 `YYYY-MM-DD`
- `currentYearMonth()`：台北月份 `YYYY-MM`
- `monthRangeUtc(yearMonth)`：台北月界轉 UTC 半開區間
- `weekStart()`：台北週一
- `formatDateTime()`：以 `Intl` 與 `Asia/Taipei` 顯示完整時間

不要在 feature 內自行用 `toISOString().slice(...)` 做日期分桶或顯示。

### 金額

所有幣別顯示以 [src/shared/lib/money.ts](./src/shared/lib/money.ts) 為準。

- `formatCurrency(amount, currency = 'TWD', { signed })`
- TWD/JPY 零小數，其餘幣別保留 2 位小數
- `signed: true` 時只有正數加 `+`，零不帶符號
- 內建負零防護，避免負號零（例如 `-NT 0`）

## Query Key 與快取

[src/shared/lib/queryKeys.ts](./src/shared/lib/queryKeys.ts) 是 TanStack Query key 唯一入口。

- 不要在 hook 內就地拼 `['expenses', ...]`。
- 涉及使用者資料的 key 必須包含 `userId` 或等價 scope。
- 涉及群組資料的 key 必須包含 `groupId`。
- 個人模式使用 `queryKeys.expenses(null)`，由工廠轉成 `'personal'` key segment。
- mutation 成功後用同一組 key 做目標式 invalidation。

[src/shared/lib/queryClient.ts](./src/shared/lib/queryClient.ts) 定義 staleTime 分層：

- `STALE.long = 600_000`：profile、user settings 類低變動資料
- `STALE.medium = 300_000`：groups 等中低頻資料
- `STALE.standard = 60_000`：expenses、reports、snapshots 等一般資料
- `STALE.short = 15_000`：balances、settlement/debt 類高變動資料

預設 `QueryClient` staleTime 是 30 秒、`retry: 1`、`refetchOnWindowFocus: true`。

## Supabase 規範

- client 端統一從 [src/shared/lib/supabase.ts](./src/shared/lib/supabase.ts) 匯入。
- DB 型別以 [src/shared/lib/database.types.ts](./src/shared/lib/database.types.ts) 為準。
- 群組新增走 `add_group_expense` RPC；群組編輯走 `update_group_expense` RPC。
- 單筆費用結清走 `settle_expense` RPC。
- 推播裝置寫入 `user_devices`，通知偏好寫入 `user_settings.notification_prefs`。
- Edge Functions 位於 [supabase/functions](./supabase/functions)，目前包含 `send-push`、`monthly-report`、`process-recurring`。

## 測試慣例

- 測試環境是 Vitest + happy-dom，設定在 [vitest.config.ts](./vitest.config.ts)。
- 全域測試 setup 在 [tests/setup.ts](./tests/setup.ts)，包含 localStorage/sessionStorage guard。
- React hooks/components 使用 React Testing Library。
- 每個 Query 測試建立自己的 `QueryClient`，通常關閉 retry，避免 cache 與重試污染測試。
- Supabase mock 優先使用 `vi.hoisted()` 建 chain builder，只 mock `supabase` client，不 mock 被測 hook 本身。
- Query key 相關測試要斷言 `queryKeys.*`，不要只斷言渲染結果。

範例可參考：

- [src/features/expense/api/__tests__/useExpenses.spec.tsx](./src/features/expense/api/__tests__/useExpenses.spec.tsx)
- [src/features/report/api/__tests__/useMonthlyReport.spec.tsx](./src/features/report/api/__tests__/useMonthlyReport.spec.tsx)
- [src/features/notification/api/__tests__/useNotificationMutations.spec.tsx](./src/features/notification/api/__tests__/useNotificationMutations.spec.tsx)

## 程式碼風格

- TypeScript/TSX 使用 4 個空白縮排。
- 不加分號。
- 不加 trailing comma。
- React 檔案保持函式式元件與 hooks pattern。
- 優先從既有 barrel 或 feature API 匯入，不新增平行風格。
- 只改任務必要檔案；不要順手重排或重構無關程式。
