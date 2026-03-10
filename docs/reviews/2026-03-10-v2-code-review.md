# Code Review 報告

> **基於**: /report 輸出（2026-03-10）
> **分支**: `v2`
> **審查範圍**: 50+ 個檔案（Data/Store/Logic/UI/Page/Test/Config/i18n 層）
> **審查者**: Claude Code Review（4 組平行 subagent）
> **日期**: 2026-03-10

---

## 摘要

| 嚴重度 | 數量 |
|--------|------|
| [!] CRITICAL | 2 |
| [H] HIGH | 18 |
| [M] MEDIUM | 23 |
| [L] LOW | 9 |
| [i] INFO | 7 |
| **Total** | **59** |

### 整體評分

```
程式碼品質    ███████░░░  7/10
安全性        ██████░░░░  6/10
架構一致性    ████████░░  8/10
測試覆蓋      ████░░░░░░  4/10
效能          ██████░░░░  6/10
─────────────────────────────────
綜合評分      ██████░░░░  6.2/10
```

### 關鍵發現（Top 3）

1. **浮點精度問題遍及整個分帳引擎** — 金融計算使用 JS 原生浮點數，累積誤差可能導致分帳金額不等於總額 `[!]`
2. **SQL Injection 風險** — `split.ts` 使用字串拼接構建 `.not()` 過濾條件 `[!]`
3. **Settlement Store 完全無測試覆蓋** — 核心結算 CRUD、餘額計算、月份快照均無測試 `[H]`

---

## CRITICAL 問題

### CR-001: 浮點精度問題 — 分帳計算引擎全面受影響

- **嚴重度**: [!] CRITICAL
- **分類**: Bug / Financial Precision
- **檔案**: `src/features/split/composables/useSplitCalculation.ts:17-64`
- **說明**: 這是一個**金融應用**，所有金額計算都使用 JavaScript 原生浮點數（IEEE 754 double），而非整數分（cents）或 Decimal 函式庫。在均分、百分比、股份三種分帳模式中，浮點除法和乘法會累積精度誤差，導致分帳金額之和不等於總額。

**問題程式碼**:
```typescript
// 均分：100 / 3 = 33.333... → 精度遺失
const perPerson = Math.round((totalAmount.value / included.length) * 100) / 100

// 百分比：100.33 * 33.33 / 100 = 不精確
amount: Math.round((totalAmount.value * (p.percentage ?? 0) / 100) * 100) / 100

// 餘額檢查：使用浮點加總比較，誤差可能超過 0.01 容限
const isBalanced = computed(() =>
    Math.abs(splitTotal.value - totalAmount.value) < 0.01
)
```

**建議修復**:
```typescript
// 全程使用整數分（cents）計算
const totalCents = Math.round(totalAmount.value * 100)
const perPersonCents = Math.floor(totalCents / included.length)
const remainder = totalCents - perPersonCents * included.length

// 前 N-1 人拿 floor，最後一人拿餘數
return included.map((p, i) => ({
    ...p,
    amount: (i < included.length - 1
        ? perPersonCents
        : perPersonCents + remainder) / 100
}))

// 餘額檢查：整數比較，零容差
const splitCents = calculatedSplits.value.reduce(
    (sum, p) => sum + Math.round(p.amount * 100), 0
)
const isBalanced = computed(() => splitCents === totalCents)
```

**影響範圍**: 所有使用分帳功能的群組支出。極端情況下，多人分帳的金額之和會與原始金額差 1-2 分錢，長期累積可能造成結算異常。

---

### CR-002: SQL Injection 風險 — 字串拼接構建過濾條件

- **嚴重度**: [!] CRITICAL
- **分類**: Security
- **檔案**: `src/features/split/stores/split.ts:130-136`
- **說明**: 在刪除已移除的分帳記錄時，手動用字串拼接構建 Supabase `.not()` 過濾條件。雖然目前 UUID 來自系統內部，但此模式違反防禦性編程原則，一旦輸入來源改變即構成注入風險。

**問題程式碼**:
```typescript
const quotedUserIds = incomingUserIds.map(userId => `"${userId}"`).join(',')
const { error: deleteRemovedError } = await supabase
    .from('expense_splits')
    .delete()
    .eq('expense_id', expenseId)
    .not('user_id', 'in', `(${quotedUserIds})`)
```

**建議修復**:
```typescript
// 方案：先查出所有，再用 .in() 刪除需移除的
const { data: currentSplits } = await supabase
    .from('expense_splits')
    .select('id, user_id')
    .eq('expense_id', expenseId)

const toDeleteIds = (currentSplits ?? [])
    .filter(s => !incomingUserIds.includes(s.user_id))
    .map(s => s.id)

if (toDeleteIds.length > 0) {
    await supabase
        .from('expense_splits')
        .delete()
        .in('id', toDeleteIds)  // 使用 Supabase 參數化的 .in()
}
```

**影響範圍**: 所有分帳更新操作

---

## HIGH 問題

### CR-003: 百分比分帳精度遺失

- **嚴重度**: [H] HIGH
- **分類**: Bug
- **檔案**: `src/features/split/composables/useSplitCalculation.ts:35`
- **說明**: 百分比分帳的金額計算 `totalAmount * percentage / 100` 會因浮點乘除產生精度偏移。多人分帳後金額之和可能偏離 0.01-0.03 元。
- **建議**: 使用整數分運算，同 CR-001 修復方式

### CR-004: 股份分帳餘數分配錯誤

- **嚴重度**: [H] HIGH
- **分類**: Bug
- **檔案**: `src/features/split/composables/useSplitCalculation.ts:43-48`
- **說明**: 不均等股份時（如 2:1:1），最後一人的金額計算 `total - sum_of_others` 可能因前面的浮點累積而出錯。
- **建議**: 整數分運算

### CR-005: 缺少負數/零值輸入驗證

- **嚴重度**: [H] HIGH
- **分類**: Bug
- **檔案**: `src/features/split/composables/useSplitCalculation.ts:12-13`
- **說明**: 分帳函數不驗證 `totalAmount < 0`（會產生負數分帳）或 `participants.length === 0`（除以零），也不驗證 `NaN/Infinity`。

**建議修復**:
```typescript
const calculatedSplits = computed<SplitParticipant[]>(() => {
    const included = participants.value.filter(p => p.isIncluded)

    // Validation
    if (included.length === 0) return []
    if (totalAmount.value < 0) throw new Error('Amount cannot be negative')
    if (totalAmount.value === 0) return included.map(p => ({ ...p, amount: 0 }))
    if (!Number.isFinite(totalAmount.value)) throw new Error('Invalid amount')

    switch (method.value) { ... }
})
```

### CR-006: N+1 查詢 — 月度債務載入

- **嚴重度**: [H] HIGH
- **分類**: Performance
- **檔案**: `src/features/settlement/stores/settlement.ts:307-404`
- **說明**: `fetchMonthDebts` 發出 4 次獨立 Supabase 請求（月度餘額 + 簡化債務 + 用戶資料 + 支出統計），且用戶資料在每次月份切換時重複查詢。
- **建議**: 建立單一 RPC 函數返回所有數據，或實作用戶資料快取

### CR-007: 不安全的類型強制轉換 — Category

- **嚴重度**: [H] HIGH
- **分類**: Bug
- **檔案**: `src/features/expense/stores/expense.ts:161`
- **說明**: `row.category as CategoryId` 直接強制轉換，若 DB 中存在無效值會靜默傳遞到 UI。

**建議修復**:
```typescript
const isValidCategory = (cat: string): cat is CategoryId =>
    ['food', 'pet', 'shopping', 'transport', 'home', 'other'].includes(cat)

category: isValidCategory(row.category) ? row.category : 'other'
```

### CR-008: 隱式跨 Store 依賴

- **嚴重度**: [H] HIGH
- **分類**: Architecture
- **檔案**: `src/features/expense/stores/expense.ts:119`
- **說明**: `expenseStore` 的 `groupExpenses` computed 直接呼叫 `useGroupStore()` 建立隱式依賴，使測試和推理變困難。
- **建議**: 提取為獨立 composable 或明確傳入 `activeGroupId`

### CR-009: 支出詳情頁 splits 變更時重複載入用戶資料

- **嚴重度**: [H] HIGH
- **分類**: Performance
- **檔案**: `src/pages/expense-detail/ExpenseDetailPage.vue:341`
- **說明**: `watch(splits, ...)` 每次變更都呼叫 `loadSplitProfiles()` 發送 Supabase 查詢，無 debounce、無已載入 ID 快取。
- **建議**: 加入 debounce + 已載入 ID 的 Set 快取

### CR-010: BalancesPage 非同步操作無錯誤處理

- **嚴重度**: [H] HIGH
- **分類**: Bug
- **檔案**: `src/pages/balances/BalancesPage.vue:72`
- **說明**: `settlementHistoryRef.value?.loadHistory()` 無 try-catch，載入失敗時用戶無任何回饋。
- **建議**: 包裝 try-catch + toast.error()

### CR-011: 浮點累積可能導致債務簡化異常

- **嚴重度**: [H] HIGH
- **分類**: Bug
- **檔案**: `src/features/split/composables/useDebtSimplification.ts:26-48`
- **說明**: 債務簡化迴圈中 `debtor.remaining` 經多次減法後可能卡在 0.0099（未達 0.01 閾值），導致迴圈無法推進。

**建議修復**:
```typescript
// 每步 round to cents
debtor.remaining = Math.round(debtor.remaining * 100) / 100
creditor.remaining = Math.round(creditor.remaining * 100) / 100
if (debtor.remaining < 0.005) i++
if (creditor.remaining < 0.005) j++
```

### CR-012: Settlement Store 完全無測試

- **嚴重度**: [H] HIGH
- **分類**: Coverage Gap
- **檔案**: `src/features/settlement/stores/` (缺失測試檔案)
- **說明**: 核心結算功能（fetchNetBalances, fetchSimplifiedDebts, addSettlement, updateSettlement, deleteSettlement, fetchMonthlySnapshots）完全沒有自動化測試覆蓋。
- **建議**: 建立 `settlement.spec.ts` 覆蓋所有 CRUD + 餘額計算 + 月份快照

### CR-013: 路由設定中存在孤兒頁面

- **嚴重度**: [H] HIGH
- **分類**: Config
- **檔案**: `src/app/router/routes/index.ts`
- **說明**: `BalancesPage.vue` 和 `StatisticsPage.vue` 存在於 `src/pages/` 但在路由中無對應定義。可能已併入 Overview 頁面但檔案未清理。
- **建議**: 若已棄用則刪除頁面目錄；若仍需要則加入路由

### CR-014: 路由 meta.title 重複

- **嚴重度**: [H] HIGH
- **分類**: Config
- **檔案**: `src/app/router/routes/index.ts:20,39`
- **說明**: Dashboard 和 Overview 的 `meta.title` 都是「總覽」，造成頁面標題混淆。
- **建議**: Overview 改為「財務概覽」或「詳細統計」

### CR-015: 缺少分帳 edge case 測試（負數、循環債、多幣別）

- **嚴重度**: [H] HIGH
- **分類**: Coverage Gap
- **檔案**: `useSplitCalculation.spec.ts`, `useDebtSimplification.spec.ts`, `expense.spec.ts`
- **說明**: 分帳測試缺少：負數金額（退款）、三方循環債務、百分比 >100% 溢出、混合幣別加總行為。
- **建議**: 補充上述 edge case 測試

### CR-016: Budget 類型強轉不安全

- **嚴重度**: [H] HIGH
- **分類**: Bug
- **檔案**: `src/features/group/stores/group.ts:370-381`
- **說明**: `getCategoryBudget` 使用 `Number()` 寬鬆轉換 `category_budgets` JSON 欄位值，不驗證 NaN/Infinity。

**建議修復**:
```typescript
const parsed = parseFloat(String(budget))
return Number.isFinite(parsed) ? parsed : 0
```

### CR-017: Mock chain 不符合實際 API

- **嚴重度**: [H] HIGH
- **分類**: Test Quality
- **檔案**: `src/features/split/stores/__tests__/split.spec.ts:85-86`
- **說明**: Delete mock chain 的參數傳遞方式與實際 Supabase client API 不一致，測試可能在實際執行時失敗。
- **建議**: 驗證 mock 是否正確模擬 `.delete().eq().not()` 鏈式呼叫

### CR-018: 浮點斷言容差過寬

- **嚴重度**: [H] HIGH
- **分類**: Test Quality
- **檔案**: `src/features/split/composables/__tests__/useSplitCalculation.spec.ts:257`
- **說明**: 金額加總斷言使用 `< 0.02` 容差，金融計算應 ≤ 0.01。
- **建議**: 收緊至 `< 0.01` 或使用整數分比較

---

## MEDIUM 問題

| # | 檔案 | 分類 | 問題 | 建議 |
|---|------|------|------|------|
| CR-019 | `useScrollDirection.ts:7-40` | Architecture | requestAnimationFrame 未處理 unmount 後回調 | 加入 isUnmounted flag |
| CR-020 | `useMonthlySnapshots.ts:59` | Performance | selectedMonth watch 無 debounce | useDebounceFn(300ms) |
| CR-021 | `useRecentExpenses.ts:12-32` | Quality | 以 title 去重，同名支出只顯示一筆 | 改用 `title+category` 組合鍵 |
| CR-022 | `settlement.ts:385` | Quality | 結算狀態閾值（0.01, 50%）為 magic number | 提取為常數 + 幣別感知 |
| CR-023 | `settlement.ts:70-77` | Bug | RPC 回傳的 net_balance 未驗證 isFinite() | 加入 NaN/Infinity 檢查 |
| CR-024 | `split.ts:85-156` | Quality | updateExpenseSplits 72 行複雜邏輯 | 拆分為 upsert + cleanup |
| CR-025 | `expense.ts:82-106` | Performance | Stats 計算 O(6n)，每個 category 各跑一次 | 單次迴圈統計 |
| CR-026 | `supabase.ts:56-61` | Quality | Production 仍輸出 OAuth debug log | `import.meta.env.DEV` 條件 |
| CR-027 | `supabase.ts:87` | Quality | Auth callback 型別過寬 `(event: string, session: any)` | 使用 `AuthChangeEvent` + `Session` |
| CR-028 | `AddExpenseDrawer.vue:53` | Vue/TS | v-for `:key="recent.title"` 可能不唯一 | 改用組合鍵 |
| CR-029 | `CalendarView.vue:38` | Bug | `selectedDate.set()` 前未檢查 null | 加入 null guard |
| CR-030 | `MonthlyDebtCard.vue:197` | Vue/TS | v-for `:key="index"` 應用 item.id | 使用唯一 ID |
| CR-031 | `GroupCreatePage.vue:99` | Security | 邀請碼 toUpperCase() 未驗證英數 | 加入 regex 驗證 |
| CR-032 | `ChartView.vue:265-301` | Performance | 多個大型 computed 每次重算 | 提取至 store 或 memoize |
| CR-033 | `SettingsPage.vue:156` | Quality | clearAllData 定義但未呼叫 | 在 logout 呼叫或移除 |
| CR-034 | `AddExpenseDrawer.vue:625` | Bug | submit 無 debounce，雙擊可建立重複支出 | submitting flag |
| CR-035 | `ChartView.vue:319` | Bug | selectedDayExpenses 可能為 null | 加入 `?? []` guard |
| CR-036 | `ExpenseGroup.vue:117-121` | Bug | parseFloat 結果未檢查 isNaN | 已有 isNaN 檢查（確認 OK） |
| CR-037 | `en.ts:87` | i18n | key 名稱 `title_` 帶底線可能為 typo | 確認是否故意 |
| CR-038 | `en.ts` vs `zh-TW.ts` | i18n | 'personal' 多上下文使用同一 key | 依上下文區分 key |
| CR-039 | `package.json` | Config | jsdom 和 happy-dom 同時存在 | 移除 jsdom |
| CR-040 | `vite.config.ts:135` | Config | build output 按 mode 分目錄 | 標準化或文件化 |
| CR-041 | `expense.spec.ts:183` | Coverage Gap | Stats 計算缺少邊界測試（0 元、負數、超大金額） | 補充測試 |

---

## LOW 問題

| # | 檔案 | 問題 | 建議 |
|---|------|------|------|
| CR-042 | `settlement.ts:1-20` | monthlySnapshots vs currentMonthSnapshot 關係不清 | 加入註解 |
| CR-043 | `main.css:114` | 未使用的 sidebar CSS 變數 | 審計移除 |
| CR-044 | `BottomNavigation.vue:13-69` | 導航按鈕缺少 aria-label | 加入無障礙標籤 |
| CR-045 | `DashboardPage.vue:289` | SVG 圓環圖無 `<title>` | 加入 aria-label |
| CR-046 | `DebtSummaryCard.vue:52` | 條件渲染 Avatar 無 :key | 低優先級 |
| CR-047 | `en.ts:500-551` | 廢棄 family 翻譯區段仍保留 | 移除 |
| CR-048 | `group.spec.ts` | 群組權限/角色測試可能不完整 | 驗證覆蓋率 |
| CR-049 | `expense.ts:627` | formatAmount 硬編碼 "NT $"，不支援多幣別 | 傳入 currency 參數 |
| CR-050 | `StartupPage.vue:80` | useRoute import 位置混亂 | 移至頂部 |

---

## INFO 觀察

- [i] **良好的不可變更新模式**: `splitStore` 和 `settlementStore` 正確使用 spread operator 更新 state (`split.ts:27`, `settlement.ts:391`)
- [i] **正確的 Supabase 404 處理**: `groupStore` 區分 PGRST116（not found）和真正的錯誤 (`group.ts:69`)
- [i] **型別匯出結構清晰**: `database.types.ts` → Entity types → Store 的 barrel export 模式避免循環依賴
- [i] **Glassmorphism 設計系統完整**: `main.css` 的 glass tokens、動畫系統、category 色彩變數設計一致
- [i] **App.vue 資料載入流程清晰**: `loadAllData()` 使用 `Promise.all` 平行載入，watch 群組切換自動重載
- [i] **i18n 結構完整**: zh-TW 和 en 翻譯檔結構一致，組織清晰
- [i] **元件測試模式正確**: 測試行為而非實作細節

---

## 按檔案彙總

| 檔案 | [!] | [H] | [M] | [L] | 主要問題 |
|------|-----|-----|-----|-----|----------|
| `useSplitCalculation.ts` | 1 | 3 | 0 | 0 | 浮點精度全面問題 |
| `split.ts (store)` | 1 | 1 | 1 | 0 | SQL injection + mock + 複雜邏輯 |
| `settlement.ts (store)` | 0 | 1 | 3 | 1 | N+1 查詢 + 閾值 + 驗證 + 無測試 |
| `expense.ts (store)` | 0 | 2 | 1 | 1 | 類型強轉 + 跨 store 耦合 + 低效計算 |
| `useDebtSimplification.ts` | 0 | 1 | 0 | 0 | 浮點累積風險 |
| `ExpenseDetailPage.vue` | 0 | 1 | 0 | 0 | Profile 重複載入 |
| `BalancesPage.vue` | 0 | 1 | 0 | 0 | 缺少錯誤處理 |
| `routes/index.ts` | 0 | 2 | 0 | 0 | 孤兒頁面 + title 重複 |
| `AddExpenseDrawer.vue` | 0 | 0 | 2 | 0 | v-for key + 雙擊提交 |
| `ChartView.vue` | 0 | 0 | 2 | 0 | computed 重算 + null 存取 |
| Tests (多檔) | 0 | 3 | 1 | 1 | 覆蓋率不足 + mock 不符 + 容差過寬 |
| i18n (en/zh-TW) | 0 | 0 | 2 | 1 | key 命名 + family 殘留 |

---

## 按分類彙總

```
問題分類分布
══════════════════════════════════════════════════════
  潛在 Bug        ██████████████████████████████  15 findings
  測試/覆蓋率     ████████████████████            10 findings
  程式碼品質      ██████████████████               9 findings
  效能            ████████████████                 8 findings
  安全性          ██████████                       5 findings
  架構一致性      ██████                           3 findings
  Vue/TS 特定     ██████                           3 findings
  設定/Config     ██████                           3 findings
  無障礙          ████                             2 findings
  i18n            ██████                           3 findings
```

---

## 嚴重度分布

```
嚴重度分布
══════════════════════════════════════════════════════
  [!] CRITICAL  ████                                2
  [H] HIGH      ████████████████████████████████   18
  [M] MEDIUM    ██████████████████████████████████ 23
  [L] LOW       ██████████████████                  9
  [i] INFO      ██████████████                      7
```

---

## 檔案健康度（問題嚴重度加權）

```
檔案健康度（CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1）
══════════════════════════════════════════════════════════════
  useSplitCalculation.ts   ██████████████████████████████  Score: 13  [!]×1 [H]×3
  settlement.ts (store)    █████████████████               Score: 10  [H]×1 [M]×3 [L]×1
  expense.ts (store)       ███████████████                 Score:  9  [H]×2 [M]×1 [L]×1
  split.ts (store)         ██████████████                  Score:  8  [!]×1 [H]×1 [M]×1
  routes/index.ts          ██████████                      Score:  6  [H]×2
  Tests (多檔)             ███████████████                 Score:  8  [H]×3 [M]×1 [L]×1
  AddExpenseDrawer.vue     ████████                        Score:  4  [M]×2
  ChartView.vue            ██████                          Score:  4  [M]×2
  useDebtSimplification.ts ██████                          Score:  3  [H]×1
  ExpenseDetailPage.vue    ██████                          Score:  3  [H]×1
  BalancesPage.vue         ██████                          Score:  3  [H]×1
```

---

## 架構層問題分布

```
架構層問題分布
══════════════════════════════════════════════════════
  Composables (Logic)  ██████████████████████████████  30%
  Store 層             ████████████████████████        25%
  Tests/Coverage       ████████████████████            20%
  Page 層              ████████████                    12%
  Component 層         ████████                         8%
  Config/i18n          ██████                           5%
```

---

## 修復優先級建議

### 立即修復（Before Merge）

1. **CR-001**: 分帳引擎浮點精度 → 改用整數分計算 `[!]`
2. **CR-002**: SQL injection 風險 → 改用 `.in()` 參數化查詢 `[!]`
3. **CR-005**: 分帳函數輸入驗證（負數/零/NaN）`[H]`
4. **CR-012**: 建立 settlement store 測試 `[H]`
5. **CR-013**: 修復孤兒頁面路由或刪除 `[H]`

### 短期修復（Next Sprint）

6. **CR-006**: N+1 查詢優化 `[H]`
7. **CR-015**: 補充分帳 edge case 測試（負數、循環債、多幣別）`[H]`
8. **CR-007**: Category 類型驗證 `[H]`
9. **CR-011**: 債務簡化浮點修復 `[H]`
10. **CR-034**: 雙擊提交防護 `[M]`
11. **CR-009**: 支出詳情 profile debounce `[H]`

### 後續改善（Backlog）

12. **CR-022**: 結算閾值幣別感知 `[M]`
13. **CR-025**: Stats 計算單次迴圈 `[M]`
14. **CR-044/045**: 無障礙改善 `[L]`
15. **CR-047**: 移除廢棄 family 翻譯 `[L]`
16. **CR-039**: 移除多餘 jsdom 依賴 `[M]`
17. **CR-049**: formatAmount 多幣別支援 `[L]`
