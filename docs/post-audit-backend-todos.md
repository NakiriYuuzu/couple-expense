# 稽核後 — 後端 / 平台待辦（repo 外）

本檔列出 2026-06-01 全面稽核後，**無法在前端 repo 內閉合**、需在 Supabase 後端或 GitHub 設定處理的事項。前端已修復的部分見 `fix/audit-findings` 分支的 7 個 commit。

> **Schema 注意**：以下 SQL 以 `group_expense` schema 為準（與前端 `supabase.ts` 的 `db.schema` 設定一致）。若你的 RPC/表實際部署在 `public`（如 `migrations/v2-schema-migration.sql` 所示），請將 `group_expense.` 替換為 `public.`。執行前務必在 staging 驗證。

---

## P0-A：`recurring_expenses.updated_at` 自動更新 trigger（配套 recurring-7）

**為什麼緊急**：前端 commit `fad0605` 已移除 `recurring.ts` update 時 client 端寫入的 `updated_at`（原本受裝置時鐘影響、與 create 路徑不一致）。但全 repo 查無任何 `BEFORE UPDATE` trigger 或 `moddatetime`——亦即 `expenses`、`group_settings`、`recurring_expenses` 等表在 UPDATE 時 `updated_at` **本來就不會更新**（只有 INSERT 的 `DEFAULT now()`）。移除 client 端寫入後，若不補 trigger，`recurring_expenses.updated_at` 編輯後將停留在建立時間。

**修法（建議用 Supabase 內建 `moddatetime`，套用到所有有 `updated_at` 的表）**：

```sql
-- 1) 啟用 moddatetime extension（Supabase 已內建）
create extension if not exists moddatetime schema extensions;

-- 2) recurring_expenses（本次直接受影響）
create trigger handle_updated_at
    before update on group_expense.recurring_expenses
    for each row execute function extensions.moddatetime(updated_at);

-- 3) 建議一併補上其他同樣只靠 INSERT DEFAULT 的表，根治既有不一致
create trigger handle_updated_at
    before update on group_expense.expenses
    for each row execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at
    before update on group_expense.group_settings
    for each row execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at
    before update on group_expense.user_profiles
    for each row execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at
    before update on group_expense.user_settings
    for each row execute function extensions.moddatetime(updated_at);
```

**驗證**：`update group_expense.recurring_expenses set is_active = is_active where id = '<某id>';` 後確認 `updated_at` 已變為當下時間。

---

## P0-B：`process_recurring_expenses` 定期排程（recurring-5）

**問題**：定期消費的唯一觸發點是 `supabase/functions/process-recurring/index.ts`（呼叫 `process_recurring_expenses()` RPC），但 repo 內無任何 cron / pg_cron / config.toml 排程。亦即 UI 承諾「自動產生定期消費」，但沒設排程就**永遠不會執行**。

**修法（二選一）**：

### 方案 A（推薦，最簡單）：pg_cron 直接呼叫 RPC

```sql
create extension if not exists pg_cron;

-- 每天 01:00（資料庫時區，通常 UTC）產生當期定期消費
select cron.schedule(
    'process-recurring-expenses-daily',
    '0 1 * * *',
    $$ select group_expense.process_recurring_expenses(); $$
);

-- 查詢已排程任務
select * from cron.job;
```

### 方案 B：pg_cron + pg_net 呼叫 edge function（若邏輯需放在 edge function）

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
    'process-recurring-expenses-daily',
    '0 1 * * *',
    $$
    select net.http_post(
        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-recurring',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
        )
    );
    $$
);
```

**注意**：`process_recurring_expenses` 本體不在 repo，請確認它對「已產生過的當期」具**冪等性**（重複執行同一天不應重複建立記錄），否則 cron 重試會產生重複扣款。建議在 RPC 內以 `next_due_date <= current_date` 為條件並在產生後推進 `next_due_date`。

---

## P1-A：`add_group_expense` 金額守恆斷言 + `expense_splits` CHECK（split-calc-4）

**問題**：`add_group_expense`（`migrations/v2-schema-migration.sql:700`）對 explicit `p_splits` 逐筆 INSERT，**全程無 `SUM(splits.amount) = p_amount` 守恆斷言**；`expense_splits.amount` 也只有 `numeric NOT NULL`、無 CHECK。前端 `isBalanced` gate 是唯一防線，繞過（直接打 RPC 或 client bug）即可寫入不平資料，污染後端欠款聚合。

**修法**：在 `add_group_expense` 的 explicit splits 分支結束後，加總守恆斷言（以整數分比較，避免浮點誤差）：

```sql
-- 在 FOR v_split IN ... LOOP 結束後、函式 RETURN 之前插入：
IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
    DECLARE v_split_sum numeric;
    BEGIN
        SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
        INTO   v_split_sum
        FROM   jsonb_array_elements(p_splits) AS elem;

        IF ROUND(v_split_sum * 100) <> ROUND(p_amount * 100) THEN
            RAISE EXCEPTION 'Split amounts (%) do not sum to expense amount (%)',
                v_split_sum, p_amount;
        END IF;
    END;
END IF;
```

（前端已在 `split.ts` 的 `updateExpenseSplits` 備妥 opt-in `expectedTotal` 守恆守護，可作為裸 upsert 路徑的對應防線——啟用方式見 P2。）

**驗證**：以 `p_splits` 金額加總 ≠ `p_amount` 呼叫 RPC，應被 `RAISE EXCEPTION` 拒絕。

---

## P1-B：GitHub branch protection — 讓 CI 成為硬閘門（ci-cd-2）

**問題**：commit `69e524a` 新增的 `ci.yml`（typecheck + test）與 `deploy-gh-pages.yml` 是**兩個獨立 workflow、無依賴**。push 到 main 時兩者並行，deploy job 本身不跑 typecheck/test——即使 CI 紅燈，部署仍會成功上線。真正的硬閘門需要 repo 設定。

**修法（gh CLI）**：

```bash
gh api -X PUT repos/NakiriYuuzu/couple-expense/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=typecheck' \
  -f 'required_status_checks[contexts][]=test' \
  -F 'enforce_admins=false' \
  -F 'required_pull_request_reviews=null' \
  -F 'restrictions=null'
```

> `contexts` 的名稱需對應 `ci.yml` 中 job 的顯示名稱（確認 ci.yml 內 job id / name 後填入）。

**或用 GitHub UI**：Settings → Branches → Add branch ruleset → 對 `main` 勾選 **Require status checks to pass**，選擇 CI 的 typecheck 與 test job。

---

## P2：`add_group_expense` RPC 完全原子化（H1 長期解，前端）

**現況**：commit `ff3835d` 已用 **client 端補償刪除**（splits upsert 失敗時 `delete` 剛建立的 expense）止血孤兒費用，但若補償刪除本身失敗（網路/RLS）仍會殘留——僅縮小窗口、非根除。

**根治**：前端群組支出新增改走既有的 `add_group_expense` RPC（單一 transaction 內寫 `expenses` + `expense_splits`）。

**為何未在本次做**：`expense.spec.ts:296-372` 的測試 mock 嚴格斷言「`insert(.single)` + `upsert(.toHaveBeenCalledWith)`」兩段式路徑，且 mock 無 `.rpc()` 方法。改走 RPC 需同步改寫該測試。屬獨立的一次小重構，建議搭配 P1-A 的守恆斷言一起做。

---

## 待確認的次要項

- **`useDebtSimplification.ts` dead code**：前端確認生產零引用，但有專屬 `useDebtSimplification.spec.ts`。若要徹底移除，需連 spec 一起刪（本次保留未動）。
- **`split.ts` 的 `expectedTotal` 守恆守護啟用**：目前 opt-in。啟用需 `ExpenseDetailPage.vue` 傳入第三參數（總額），並更新 `ExpenseDetailPage.spec.ts:12` 的源碼字串斷言。
- **既有 typecheck 型別債（31 項）**：`datetime.ts`、shadcn `auto-form`/`native-select`、`i18n/index.ts` 的 `process` 等，與本次稽核無關，建議獨立排程清理（CI 的 typecheck 閘門會持續暴露它們）。
- **效能 perf-\***：除 `perf-3`（已順手）外未做。小資料量下衝擊有限，路線圖見稽核報告（P1 manualChunks、P2 ChartView 單趟掃描、P5 清單虛擬化等）。
