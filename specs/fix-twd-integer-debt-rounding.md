# Plan: Fix TWD Integer Debt Rounding (PR #3)

## Task Description

修正 PR #3 (copilot/fix-debt-calculation-issue) 的所有問題，將 TWD 債務金額統一為整數。包含：
- 修正資料庫 migration 的 schema 錯誤（`public` → `group_expense`）
- 同步更新所有相關 RPC 函數（`get_simplified_debts`、`get_monthly_simplified_debts`、`get_monthly_balances`）
- 修正前端程式碼的閾值不一致問題
- 移除 dead code（`normalizeSignedAmounts`）
- 消除不必要的重複 normalization
- 新增 `integerDebt.ts` 單元測試
- 提供完整可從零部署的 schema

## Objective

完成後，所有債務金額（餘額、簡化債務、月結快照）在前後端皆為整數 TWD，且 migration 可正確套用到 `group_expense` schema。

## Problem Statement

PR #3 由 Copilot SWE Agent 自動生成，核心演算法正確但有以下問題：
1. **CRITICAL**: Migration 建在 `public` schema，但生產環境用 `group_expense` schema
2. **CRITICAL**: 引用不存在的 `public.get_group_balances()`
3. **CRITICAL**: `fetchMonthDebts` 仍用舊的 `< 0.01` 閾值判定 settled
4. **HIGH**: `get_monthly_simplified_debts` RPC 未更新為整數輸出
5. **HIGH**: `integerDebt.ts` 核心模組零測試
6. **HIGH**: `normalizeSignedAmounts` 已 export 但無人使用（dead code）
7. **MEDIUM**: `hasOutstandingDebts`/`totalGroupDebt` 對已整數化資料重複 normalize
8. **MEDIUM**: `normalizeDebtRows` 和 `normalizeSnapshotDebts` 結構相同可合併

## Solution Approach

以 PR #3 的 `integerDebt.ts` 演算法為基礎（largest-remainder method，數學上正確），修正所有整合問題：
- 前端：直接在 main 分支上套用修正版程式碼
- 資料庫：建立正確的 `group_expense` schema migration + 更新 `schema.sql` 完整參考 schema

## Relevant Files

**修改檔案：**
- `src/shared/lib/integerDebt.ts` — 新增，核心整數化演算法（移除 dead export）
- `src/features/settlement/stores/settlement.ts` — 加入 normalization，修正閾值
- `src/features/settlement/composables/useNetBalances.ts` — 改用整數閾值
- `src/features/split/composables/useDebtSimplification.ts` — 整合整數化
- `schema.sql` — 更新完整參考 schema（含整數化 RPC）

**測試檔案：**
- `src/shared/lib/__tests__/integerDebt.spec.ts` — 新增，核心演算法測試
- `src/features/split/composables/__tests__/useDebtSimplification.spec.ts` — 更新為整數語意
- `src/features/settlement/stores/__tests__/settlement.spec.ts` — 更新 normalization 測試

**資料庫：**
- `migrations/round_twd_debts_to_integer.sql` — 完整 migration（`group_expense` schema）

### New Files
- `src/shared/lib/__tests__/integerDebt.spec.ts`
- `src/shared/lib/integerDebt.ts`
- `migrations/round_twd_debts_to_integer.sql`

## Implementation Phases

### Phase 1: Foundation — 建立核心工具
建立 `integerDebt.ts` 並撰寫完整單元測試。

### Phase 2: Core Implementation — 整合前端 + 資料庫
修改 settlement store、useDebtSimplification、useNetBalances，建立正確的 migration。

### Phase 3: Integration & Polish — 更新 schema.sql + 驗證
更新 schema.sql 參考文件，執行所有測試，確保一致性。

## Step by Step Tasks

### 1. 建立 `integerDebt.ts` 核心模組
- 從 PR 分支取得 `integerDebt.ts`，移除未使用的 `normalizeSignedAmounts` export
- 只 export `normalizeNetBalances` 和 `normalizePositiveAmounts`
- 確認 code style：4-space indent, no semicolons, no trailing commas

### 2. 建立 `integerDebt.spec.ts` 單元測試
- 測試 `normalizeNetBalances`：
  - 空陣列 → `[]`
  - 單元素 `[0]` → `[0]`
  - 平衡陣列 `[33.6, 33.6, -67.2]` → sum = 0，全整數
  - 全零 `[0, 0, 0]` → `[0, 0, 0]`
  - NaN/Infinity 處理 → 視為 0
  - `-0` 處理 → 正規化為 `0`
  - 大數 `[100000.5, -100000.5]` → 整數，sum = 0
- 測試 `normalizePositiveAmounts`：
  - 空陣列 → `[]`
  - `[33.6, 33.2]` → 整數，sum 守恆
  - 全零 → `[0, 0]`
  - 含負數 → clamp 到 0
  - 自訂 targetTotal

### 3. 修改 `useDebtSimplification.ts`
- import `normalizeNetBalances` from `integerDebt`
- 先整數化 balances 再分離 debtors/creditors（合併為一次 map）
- 閾值改用整數語意（`amount > 0`，`remaining === 0`）
- 移除 `Math.round(amount * 100) / 100` 的小數四捨五入

### 4. 修改 `settlement.ts` store
- import `normalizeNetBalances`, `normalizePositiveAmounts` from `integerDebt`
- 新增 normalization helper functions（合併 `normalizeDebtRows` 和 `normalizeSnapshotDebts` 為一個泛型函數）
- `fetchNetBalances`: 對 RPC 回傳值做 `normalizeNetBalanceRows`
- `fetchSimplifiedDebts`: 對 RPC 回傳值做 `normalizeDebtRows`
- `fetchMonthlySnapshots`: 對 snapshot 資料做 normalize，`totalUnsettled === 0` 判定 settled
- `fetchMonthDebts`: 同上 normalize，`totalUnsettled === 0` 判定 settled（修正 `< 0.01`）
- `hasOutstandingDebts`: 直接用 `Math.abs(b.netBalance) > 0`，不重複 normalize
- `totalGroupDebt`: 直接 sum `b.netBalance > 0`，不重複 normalize

### 5. 修改 `useNetBalances.ts`
- `getBalanceStatus`: 用 `Math.round(amount)` 判定（與 PR 一致）

### 6. 建立資料庫 Migration
- 檔名：`migrations/round_twd_debts_to_integer.sql`
- Schema：`group_expense`（非 `public`）
- 更新函數：
  1. `get_simplified_debts` — `ROUND(x, 0)`, 閾值 `>= 0.5` / `<= -0.5`, transfer `< 1` 不輸出
  2. `get_monthly_simplified_debts` — 同上邏輯
  3. `get_monthly_balances` — `HAVING ABS(...) > 0.5`（與前端一致）

### 7. 更新 `schema.sql` 參考文件
- 更新 RPC 函數簽名註解，標明整數化行為
- 確保完整可從零部署

### 8. 更新測試檔案
- `useDebtSimplification.spec.ts`:
  - 修改所有 `toBeCloseTo` 為整數斷言
  - 修改 "rounded to 2 decimal places" → "rounded to whole dollars"
  - 新增 "ignores balances that round to zero" 測試
- `settlement.spec.ts`:
  - 保留 PR 的 normalization 測試
  - 確保 `totalUnsettled === 0` 語意正確

### 9. 驗證所有變更
- 執行 `bun run test` 確認所有測試通過
- 執行 `bun run typecheck` 確認型別正確
- 檢查 migration SQL 語法正確性

## Testing Strategy

### Unit Tests
1. **`integerDebt.spec.ts`** — 核心演算法邊界測試（sum 守恆、-0、NaN、大數、空陣列）
2. **`useDebtSimplification.spec.ts`** — 整數語意下的債務簡化
3. **`settlement.spec.ts`** — Store 層 normalization 整合

### Edge Cases
- `[33.6, 33.6, -67.2]` → sum = 0 且全整數
- `[0.4, -0.4]` → 四捨五入後皆為 0，無債務
- `-0` 不應出現在任何輸出
- 單人群組（只有一個餘額）
- 所有人都是欠款方（無收款方）

## Acceptance Criteria

- [ ] 所有債務金額在前端顯示為整數 TWD
- [ ] `integerDebt.ts` 有完整單元測試，覆蓋所有 export 函數
- [ ] Migration 正確使用 `group_expense` schema
- [ ] `get_simplified_debts`、`get_monthly_simplified_debts`、`get_monthly_balances` 三個 RPC 皆整數化
- [ ] 所有閾值一致（`=== 0` 或 `> 0`，不再有 `< 0.01`）
- [ ] 無 dead code export
- [ ] `schema.sql` 可作為完整從零部署參考
- [ ] 所有測試通過
- [ ] TypeScript 型別檢查通過

## Validation Commands

```bash
# 執行所有測試
powershell.exe -Command "bun run test"

# 型別檢查
powershell.exe -Command "bun run typecheck"

# 驗證 integerDebt 測試
powershell.exe -Command "bunx vitest run src/shared/lib/__tests__/integerDebt.spec.ts"

# 驗證 debt simplification 測試
powershell.exe -Command "bunx vitest run src/features/split/composables/__tests__/useDebtSimplification.spec.ts"

# 驗證 settlement store 測試
powershell.exe -Command "bunx vitest run src/features/settlement/stores/__tests__/settlement.spec.ts"
```

## Notes

- PR #3 的 `integerDebt.ts` 核心演算法（largest-remainder method）數學上是正確的，直接採用
- 資料庫 migration 不使用 Supabase MCP 的 `apply_migration`，而是產生 SQL 檔案由使用者手動執行或透過 CI 管道套用
- `schema.sql` 是參考文件，不直接執行；更新其中的 RPC 簽名註解即可
- 前端 normalization 是防禦性設計：即使 RPC 已整數化，前端仍做一次 normalize 以確保舊資料（snapshot）相容
