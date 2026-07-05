-- Migration: v3-02 monthly_reports（每月月報快取表）
-- Schema: group_expense
-- Date: 2026-07-04
-- Phase: React 19 重寫 Phase 1（資料庫結構收斂・additive-only）
--
-- 鐵律：production 仍跑 Vue 版並共用同一個 Supabase 專案。純新增，不動既有物件，重跑安全。
--
-- 用途：service_role（月報 cron / edge function）每月為每位使用者產生一份月報快照存入 data。
--       前端 authenticated 只讀自己的月報，並可回寫 read_at（已讀）。
--
-- data 結構（示意）：{ personal:{total,byCategory}, groups:[...], compare:{...} }
-- notified_at：推播去重欄位——cron 重跑時，notified_at 已有值者不再推播（重跑不重推）。
--
-- 權限模型（取捨見檔尾「Design note」）：
--   authenticated：SELECT own rows；UPDATE own rows 但「僅允許改 read_at」——
--                  以「欄位級 GRANT UPDATE (read_at)」達成（非 trigger），
--                  RLS 再把可改的列限縮到自己。
--   INSERT / 改 read_at 以外的欄位（data / notified_at ...）：不授權給 authenticated，
--                  由 service_role 執行——service_role bypass RLS 且具全表權限。

GRANT USAGE ON SCHEMA group_expense TO authenticated, service_role;

-- 1. 建表 --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_expense.monthly_reports (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL,
    year_month  text        NOT NULL,
    data        jsonb       NOT NULL,
    read_at     timestamptz,
    notified_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT monthly_reports_pkey PRIMARY KEY (id),
    CONSTRAINT monthly_reports_user_year_month_key UNIQUE (user_id, year_month),
    -- year_month 必須為 YYYY-MM（月份 01–12）
    CONSTRAINT monthly_reports_year_month_check
        CHECK (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT monthly_reports_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

COMMENT ON TABLE group_expense.monthly_reports
    IS '每月月報快取：service_role 產生 data；authenticated 只讀自己並可回寫 read_at；notified_at 供推播去重（重跑不重推）。';
COMMENT ON COLUMN group_expense.monthly_reports.data
    IS '月報快照 jsonb：{personal:{total,byCategory}, groups:[...], compare:{...}}。';
COMMENT ON COLUMN group_expense.monthly_reports.read_at
    IS '使用者已讀時間；唯一允許 authenticated 回寫的欄位（欄位級 GRANT UPDATE (read_at)）。';
COMMENT ON COLUMN group_expense.monthly_reports.notified_at
    IS '推播已送出時間；cron 重跑時非 NULL 者不再推播（去重）。僅 service_role 可寫。';

-- 2. index -------------------------------------------------------------------
--    依 user 撈月報清單（列表頁）
CREATE INDEX IF NOT EXISTS idx_monthly_reports_user_id
    ON group_expense.monthly_reports (user_id);

-- 3. RLS + 欄位級授權 --------------------------------------------------------
ALTER TABLE group_expense.monthly_reports ENABLE ROW LEVEL SECURITY;

-- authenticated：清掉全部權限後只精確授回「SELECT 全欄」與「UPDATE 僅 read_at」。
-- 不授 INSERT / DELETE / 其他欄位 UPDATE → 這些操作在權限層即被拒（RLS 之前）。
REVOKE ALL ON group_expense.monthly_reports FROM anon;
REVOKE ALL ON group_expense.monthly_reports FROM authenticated;
GRANT SELECT ON group_expense.monthly_reports TO authenticated;
GRANT UPDATE (read_at) ON group_expense.monthly_reports TO authenticated;  -- 欄位級：只有 read_at 可改
GRANT ALL ON group_expense.monthly_reports TO service_role;                 -- cron / edge function（另 bypass RLS）

-- own-rows policy：SELECT 自己 + UPDATE 自己（可改的欄位已由上方欄位級 GRANT 限死為 read_at）
DROP POLICY IF EXISTS monthly_reports_select_own ON group_expense.monthly_reports;
CREATE POLICY monthly_reports_select_own ON group_expense.monthly_reports
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS monthly_reports_update_read_at_own ON group_expense.monthly_reports;
CREATE POLICY monthly_reports_update_read_at_own ON group_expense.monthly_reports
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
-- 註：不建 INSERT / DELETE policy → authenticated 無對應權限亦無 policy，RLS 預設拒絕。
--     service_role 具 BYPASSRLS，INSERT/UPSERT/清理不受上述 policy 影響。


-- == Design note（R2 取捨）===================================================
-- 「UPDATE own rows 但僅允許改 read_at」有兩種常見手段：
--   (A) 欄位級 GRANT UPDATE (read_at)  ← 本檔採用
--       宣告式、由權限系統強制、無額外執行成本；authenticated 只有 read_at 的
--       UPDATE 權限，嘗試改 data / notified_at 會因缺欄位權限被拒。
--   (B) BEFORE UPDATE trigger 檢查 OLD/NEW 其他欄位不變，否則 RAISE。
--       較囉嗦、每次 UPDATE 都跑函式；但不依賴「無其他 blanket GRANT UPDATE」的前提。
-- 選 (A)。前提：authenticated 對本表無其他來源的 blanket `GRANT UPDATE`（如 schema
-- 預設權限 ALTER DEFAULT PRIVILEGES）。上方已先 `REVOKE ALL ... FROM authenticated`
-- 再精確授回，於本表範圍內閉合此前提；跨 schema 的 default privileges 需 live DB 驗證。


-- == 驗證 SQL ================================================================
-- (a) 欄位存在檢查（應回 7 欄）
-- SELECT column_name, data_type, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_schema = 'group_expense' AND table_name = 'monthly_reports'
-- ORDER  BY ordinal_position;

-- (b) RLS 已啟用
-- SELECT relrowsecurity FROM pg_class
-- WHERE  oid = 'group_expense.monthly_reports'::regclass;

-- (c) pg_policies 檢查（應回 2 筆：select_own / update_read_at_own）
-- SELECT policyname, cmd, qual, with_check
-- FROM   pg_policies
-- WHERE  schemaname = 'group_expense' AND tablename = 'monthly_reports'
-- ORDER  BY policyname;

-- (d) 欄位級授權驗證：authenticated 應只對 read_at 有 UPDATE、無 INSERT/DELETE
-- SELECT privilege_type, column_name
-- FROM   information_schema.column_privileges
-- WHERE  table_schema = 'group_expense' AND table_name = 'monthly_reports'
--   AND  grantee = 'authenticated' AND privilege_type = 'UPDATE';   -- 應只回 read_at
-- SELECT privilege_type
-- FROM   information_schema.role_table_grants
-- WHERE  table_schema = 'group_expense' AND table_name = 'monthly_reports'
--   AND  grantee = 'authenticated';                                 -- 應只有 SELECT（無 INSERT/DELETE）

-- (e) year_month CHECK 生效（下列 INSERT 應 RAISE；註解避免誤跑，且需 service_role）
-- INSERT INTO group_expense.monthly_reports (user_id, year_month, data)
-- VALUES (auth.uid(), '2026-13', '{}'::jsonb);   -- 月份 13 不合法 → 應失敗
