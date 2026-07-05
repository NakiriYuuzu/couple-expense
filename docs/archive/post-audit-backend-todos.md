# 稽核後後端 / 平台處理記錄（已歸檔）

原始文件建立於 2026-06-01，用於追蹤 Vue/v2 時期全面稽核後無法只在前端閉合的 Supabase、GitHub 與平台事項。React 19 rewrite Phase 9 將本文件歸檔；現行資料庫目標狀態請看 `schema.sql`、`docs/db-diagram.md` 與 `migrations/v3-*.sql`。

## 最終狀態

| 項目 | 最終狀態 | 現況說明 |
|---|---|---|
| P0-A `recurring_expenses.updated_at` 自動更新 trigger | 已套用 | Production 已補 `update_fe_recurring_expenses_updated_at`，呼叫 `group_expense.update_updated_at_column()`。React rewrite 不再要求 client 手動維護這個欄位。 |
| P0-B `process_recurring_expenses` 定期排程 | 已套用 | 已建立 `process-recurring-expenses-daily` cron，每天 UTC 01:00 執行 `group_expense.process_recurring_expenses()`。 |
| P1-A `add_group_expense` 金額守恆斷言 | 已套用 | Production RPC 已補 split amount 守恆斷言。React create path 走 `add_group_expense` RPC。 |
| P1-B GitHub branch protection | 已套用 | 已要求 `quality-gate` 與 `build-and-deploy` contexts，禁止 force push / deletion。 |
| P2 `add_group_expense` RPC 完全原子化（前端） | 已由 React rewrite 取代 | `src/features/expense/api/useAddExpense.ts` 的群組新增走 `add_group_expense` RPC；`src/features/expense/api/useUpdateExpense.ts` 的群組編輯走 v3-03 `update_group_expense` RPC。 |
| `public.create_couple` / `public.join_couple` 匿名可執行 | 已由 v3-04 取代 | `migrations/v3-04-hardening.sql` 以動態簽章 REVOKE `anon, authenticated` 的 EXECUTE。Phase 10 cutover 後是否 DROP 記在 `migrations/v3-99-post-cutover-cleanup.sql`。 |
| mutable `search_path` 函式 | 已由 v3-04 取代 | `migrations/v3-04-hardening.sql` 為 `process_recurring_expenses`、`update_updated_at_column`、`get_monthly_snapshots`、`settle_monthly_debt`、`get_expense_months`、`create_monthly_snapshot` 補 `SET search_path = group_expense, public`。 |
| `recurring_expenses` RLS 現況不明 | 已降級為 v3-04 report-only | v3-04 明確不自動 ENABLE RLS；需 live DB 驗證 owner bypass RLS 前提後再手動治理，避免 cron 靜默停擺。 |
| 平台層 `auth_otp_long_expiry`、`auth_leaked_password_protection`、Postgres 安全更新 | 不在 repo 內處理 | 屬 Supabase Dashboard / 平台設定，未由本 repo migration 自動套用。 |
| `useDebtSimplification.ts` dead code | 不再適用 | React rewrite 的 `src/features/split/lib` 與 settlement query path 已取代 Vue-era dead code；目前 repo 內無 `useDebtSimplification.ts`。 |
| perf roadmap | 已由 React rewrite 分流 | Phase 9 CHANGELOG 記錄首屏 JS bundle（gzip）體積較 Vue 版減少約 27%（244 KiB → 178 KiB）、支出清單虛擬化、背景更新提示；細項以現行 React 實作為準。 |

## 歷史 SQL 摘要

### `recurring_expenses.updated_at` trigger

```sql
DROP TRIGGER IF EXISTS update_fe_recurring_expenses_updated_at ON group_expense.recurring_expenses;
CREATE TRIGGER update_fe_recurring_expenses_updated_at
    BEFORE UPDATE ON group_expense.recurring_expenses
    FOR EACH ROW EXECUTE FUNCTION group_expense.update_updated_at_column();
```

### `process_recurring_expenses` cron

```sql
SELECT cron.schedule(
    'process-recurring-expenses-daily',
    '0 1 * * *',
    'SELECT group_expense.process_recurring_expenses();'
);
```

### `add_group_expense` split conservation

```sql
IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
    SELECT COALESCE(SUM((elem->>'amount')::numeric), 0) INTO v_split_sum
    FROM jsonb_array_elements(p_splits) AS elem;
    IF round(v_split_sum * 100) <> round(p_amount * 100) THEN
        RAISE EXCEPTION 'Split amounts (%) do not sum to expense amount (%)', v_split_sum, p_amount;
    END IF;
END IF;
```
