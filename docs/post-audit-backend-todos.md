# 稽核後 — 後端 / 平台處理記錄

2026-06-01 全面稽核後，無法在前端 repo 內閉合、需在 Supabase 後端或 GitHub 設定處理的事項。
**P0-A / P0-B / P1-A / P1-B 已於 2026-06-01 透過 Supabase MCP 與 gh 實際套用並驗證**（見下方各節）。

> 實際 schema 為 `group_expense`（非 `public`）。Supabase 專案 `iypwxhjeeyabxgcabgqg`。

---

## ✅ P0-A：`recurring_expenses.updated_at` 自動更新 trigger（已套用）

**背景**：production 本就有 5 個 `update_fe_*_updated_at` trigger（expenses / group_settings / groups / user_profiles / user_settings），全部呼叫 `group_expense.update_updated_at_column()`。唯獨 `recurring_expenses` 漏了——這正是 `recurring.ts` 原本要手動寫 `updated_at` 的原因。前端 commit `fad0605` 移除 client 端 `updated_at` 後，補上此 trigger 才能維持正確。

**已套用 migration `add_recurring_expenses_updated_at_trigger`**：

```sql
DROP TRIGGER IF EXISTS update_fe_recurring_expenses_updated_at ON group_expense.recurring_expenses;
CREATE TRIGGER update_fe_recurring_expenses_updated_at
    BEFORE UPDATE ON group_expense.recurring_expenses
    FOR EACH ROW EXECUTE FUNCTION group_expense.update_updated_at_column();
```

驗證：`pg_trigger` 查得 `update_fe_recurring_expenses_updated_at` 存在（1 筆）。

---

## ✅ P0-B：`process_recurring_expenses` 定期排程（已套用）

**背景**：`pg_cron` v1.6 已安裝；Edge Functions 列表為空（`process-recurring` 從未部署），故定期消費原本**完全無觸發點**。`process_recurring_expenses()` 以 `next_due_date <= CURRENT_DATE` 為條件、產生後推進 `next_due_date` 到下個月，**同日重複執行具冪等性**，且不依賴 `auth.uid()`，適合 cron 直接呼叫。

**已套用 migration `schedule_process_recurring_expenses_cron`**：

```sql
SELECT cron.schedule(
    'process-recurring-expenses-daily',
    '0 1 * * *',   -- 每天 UTC 01:00（台灣 09:00）
    'SELECT group_expense.process_recurring_expenses();'
);
```

驗證：`cron.job` 查得 `process-recurring-expenses-daily`、`schedule='0 1 * * *'`、`active=true`。

---

## ✅ P1-A：`add_group_expense` 金額守恆斷言（已套用）

**背景**：production 的 `add_group_expense`（`group_expense` schema，`SECURITY DEFINER` + `SET search_path`）對 explicit `p_splits` 逐筆 INSERT，原本無守恆斷言。已在 membership 檢查後加入整數分守恆斷言（原邏輯完整保留）。

**已套用 migration `add_group_expense_split_conservation_assert`** 的關鍵片段：

```sql
IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
    SELECT COALESCE(SUM((elem->>'amount')::numeric), 0) INTO v_split_sum
    FROM jsonb_array_elements(p_splits) AS elem;
    IF round(v_split_sum * 100) <> round(p_amount * 100) THEN
        RAISE EXCEPTION 'Split amounts (%) do not sum to expense amount (%)', v_split_sum, p_amount;
    END IF;
END IF;
```

驗證：`pg_proc.prosrc` 含守恆斷言（1 筆）；`get_advisors` 確認此 function 仍保有 `search_path`（未進 mutable 清單）。

---

## ✅ P1-B：GitHub branch protection（已套用）

**背景**：`ci.yml`（job 名 `quality-gate`）與 `deploy-gh-pages.yml`（job 名 `build-and-deploy`）為兩個獨立 workflow。設定 branch protection 讓 CI 成為硬閘門。

> 修正：實際 status check context 是 **`quality-gate`** 與 **`build-and-deploy`**（job 名稱），非先前誤寫的 `typecheck`/`test`（那是 step）。

**已透過 gh 套用**（require 兩個 check、strict=false、admin 不被卡、禁止 force push / 刪除）：

```bash
gh api -X PUT repos/NakiriYuuzu/couple-expense/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["quality-gate", "build-and-deploy"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

> 前提已解決：原本 `quality-gate` 因 31 個 pre-existing 型別債而紅；已於 commit `73cc16d` 清理至 0，typecheck 全綠後才啟用 protection，故不會卡死 PR。

---

## 待處理（前端 / 後續）

### P2：`add_group_expense` RPC 完全原子化（前端）
commit `ff3835d` 已用 client 補償刪除止血孤兒費用。根治需前端群組支出新增改走 `add_group_expense` RPC（單一 transaction），但需同步改寫 `expense.spec.ts:296-372` 的兩段式 mock。建議搭配 P1-A 一起做。

### `get_advisors` 揭露的既有問題（非本次引入，建議後續處理）
- **`public.create_couple` / `public.join_couple` 允許 `anon` 執行 SECURITY DEFINER**：couple→family 遷移殘留的 `public` schema 函式，匿名可透過 `/rest/v1/rpc/*` 呼叫。確認無人使用後應 `REVOKE EXECUTE` 或 `DROP`。
- **多個 function `search_path` mutable**（`process_recurring_expenses`、`update_updated_at_column`、`get_monthly_snapshots`、`settle_monthly_debt`、`get_expense_months`、`create_monthly_snapshot` 等）：建議補 `SET search_path`。其中 `process_recurring_expenses` 現已掛 cron 定期執行，優先補上。
- 平台層：`auth_otp_long_expiry`、`auth_leaked_password_protection` 未啟用、Postgres 版本有安全更新可升級。

### 其他
- `useDebtSimplification.ts` 為 dead code 但有專屬 spec，徹底移除需連 spec 一起刪。
- 效能 perf-* 路線圖見稽核報告（manualChunks、ChartView 單趟掃描、清單虛擬化等）。
