-- Migration: v3-01 user_devices（通知子系統・儲存層）
-- Schema: group_expense
-- Date: 2026-07-04
-- Phase: React 19 重寫 Phase 1（資料庫結構收斂・additive-only）
--
-- 鐵律：production 仍跑 Vue 版並共用同一個 Supabase 專案。本 migration 為純新增
--       （新表 + RLS + index），不觸碰任何既有物件，重跑安全（idempotent）。
--
-- 用途：登入使用者的推播裝置註冊表。一人多裝置、token 輪換、殭屍 token 清理都在此收斂。
--
-- 生命週期（Q5 重新規劃後的通知子系統；已對齊本表 RLS 現實，見下方「設計事實」）：
--   1. 登入 / 開啟 app（authenticated，client 路徑）：只能 upsert / 更新「自己擁有」的 token 列。
--        以 fcm_token 為衝突鍵 upsert，但 DO UPDATE 僅在「該 token 已屬於自己」時才通過
--          SET platform = EXCLUDED.platform,
--              user_agent = EXCLUDED.user_agent,
--              last_seen_at = timezone('utc', now());   -- 每次開啟刷新活躍時間
--   2. 發送推播遇 FCM 回傳 UNREGISTERED / NotRegistered：send-push 端（service_role）即刻 DELETE 該列。
--   3. last_seen_at 逾 90 天的殭屍列：由月報 cron（service_role）順帶清理
--        DELETE FROM group_expense.user_devices
--        WHERE last_seen_at < timezone('utc', now()) - interval '90 days';
--
-- 設計事實（token 換手 / rehoming 與 RLS 的關係——Phase 6 據此實作）：
--   同一實體裝置換「另一個使用者」登入時，那筆 fcm_token 列的 user_id 需要換手（rehome）。
--   這件事 **不可能由 client（authenticated）完成**：
--     • UPDATE policy 的 USING (user_id = auth.uid()) 會擋下「改寫別人擁有的既有列」；
--     • UNIQUE(fcm_token) 又擋下「換一列重新 INSERT」。
--   因此 rehoming 只能走 service_role 路徑：
--     (a) send-push 遇 UNREGISTERED 時刪除舊列（見 2），新使用者於下次開啟 app 重新註冊；或
--     (b) edge function 以 service_role bypass RLS 直接把該列 user_id 改綁到新使用者。
--
-- 權限模型：authenticated 只能 CRUD 自己的列（RLS own rows；跨使用者 rehoming 不可能由 client 完成）；
--          service_role bypass RLS 供 send-push 刪 UNREGISTERED、cron 清殭屍、以及必要時的 rehome。

-- schema usage（既有表已授權，此處為防禦性補綴，idempotent）
GRANT USAGE ON SCHEMA group_expense TO authenticated, service_role;

-- 1. 建表 --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_expense.user_devices (
    id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL,
    fcm_token    text        NOT NULL,
    platform     text        NOT NULL,
    user_agent   text,
    last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT user_devices_pkey PRIMARY KEY (id),
    CONSTRAINT user_devices_fcm_token_key UNIQUE (fcm_token),
    CONSTRAINT user_devices_platform_check
        CHECK (platform IN ('web', 'android-pwa', 'ios-pwa')),
    CONSTRAINT user_devices_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

COMMENT ON TABLE group_expense.user_devices
    IS '推播裝置註冊表：一人多裝置；登入/開啟 app upsert（衝突鍵 fcm_token）刷新 last_seen_at；UNREGISTERED 即刪；last_seen_at 逾 90 天由月報 cron 清理。';
COMMENT ON COLUMN group_expense.user_devices.fcm_token
    IS 'Firebase Cloud Messaging registration token；UNIQUE。同一使用者以此為 upsert 衝突鍵刷新自己的列；換人登入的跨使用者改綁（rehome）須由 service_role 執行（client RLS 擋改他人列、UNIQUE 擋重插），非 client upsert 可完成。';
COMMENT ON COLUMN group_expense.user_devices.last_seen_at
    IS '最後一次登入/開啟 app 的時間；逾 90 天視為殭屍裝置，由月報 cron 順帶 DELETE。';

-- 2. index -------------------------------------------------------------------
--    user_id：send-push 依 user 撈全部裝置（必要）
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id
    ON group_expense.user_devices (user_id);
--    last_seen_at：cron 依時間掃殭屍列（清理掃描用）
CREATE INDEX IF NOT EXISTS idx_user_devices_last_seen_at
    ON group_expense.user_devices (last_seen_at);

-- 3. RLS ---------------------------------------------------------------------
ALTER TABLE group_expense.user_devices ENABLE ROW LEVEL SECURITY;

-- authenticated 精確授權：只給 own-rows CRUD 所需權限（service_role bypass RLS 另計）
REVOKE ALL ON group_expense.user_devices FROM anon;
REVOKE ALL ON group_expense.user_devices FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON group_expense.user_devices TO authenticated;
GRANT ALL ON group_expense.user_devices TO service_role;

-- own-rows 四支 policy（idempotent：DROP IF EXISTS 只清本 migration 自建的 policy）
DROP POLICY IF EXISTS user_devices_select_own ON group_expense.user_devices;
CREATE POLICY user_devices_select_own ON group_expense.user_devices
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_devices_insert_own ON group_expense.user_devices;
CREATE POLICY user_devices_insert_own ON group_expense.user_devices
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_devices_update_own ON group_expense.user_devices;
CREATE POLICY user_devices_update_own ON group_expense.user_devices
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_devices_delete_own ON group_expense.user_devices;
CREATE POLICY user_devices_delete_own ON group_expense.user_devices
    FOR DELETE USING (user_id = auth.uid());


-- == 驗證 SQL ================================================================
-- 套用後貼到 Supabase SQL Editor 逐段驗證。

-- (a) 表 + 欄位存在檢查（應回 7 欄）
-- SELECT column_name, data_type, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_schema = 'group_expense' AND table_name = 'user_devices'
-- ORDER  BY ordinal_position;

-- (b) RLS 已啟用（relrowsecurity 應為 true）
-- SELECT relrowsecurity
-- FROM   pg_class
-- WHERE  oid = 'group_expense.user_devices'::regclass;

-- (c) pg_policies 檢查（應回 4 筆：select/insert/update/delete own）
-- SELECT policyname, cmd, qual, with_check
-- FROM   pg_policies
-- WHERE  schemaname = 'group_expense' AND tablename = 'user_devices'
-- ORDER  BY policyname;

-- (d) UNIQUE(fcm_token) 存在（upsert 衝突鍵；應回 1 筆）
-- SELECT conname FROM pg_constraint
-- WHERE  conrelid = 'group_expense.user_devices'::regclass AND contype = 'u';

-- (e) platform CHECK 生效（下列 INSERT 應 RAISE check violation；註解避免誤跑）
-- INSERT INTO group_expense.user_devices (user_id, fcm_token, platform)
-- VALUES (auth.uid(), 'tok_test', 'desktop');   -- 'desktop' 不在白名單 → 應失敗
