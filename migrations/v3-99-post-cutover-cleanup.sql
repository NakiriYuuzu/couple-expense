-- ############################################################################
-- ##                                                                        ##
-- ##   ⚠⚠⚠  DO NOT RUN — Phase 10 CUTOVER 完成前絕不可執行  ⚠⚠⚠            ##
-- ##                                                                        ##
-- ##   本檔為「破壞性清理清單」，全檔以註解狀態保存。                        ##
-- ##   production 仍跑 Vue 版並共用同一個 Supabase 專案——在 React 版正式    ##
-- ##   接管（cutover）且舊版下線前，執行以下任何一條都可能弄壞線上服務。    ##
-- ##                                                                        ##
-- ##   解除註解前置條件（全部成立才可逐條評估）：                            ##
-- ##     1. React 版已 cutover 且 Vue 版已停用 / 下線                        ##
-- ##     2. 每一條 DROP 前已完成資料匯出封存並驗證備份可還原                 ##
-- ##     3. 逐條在 staging 演練通過                                          ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration: v3-99 post-cutover cleanup（僅記錄，不執行）
-- Schema: group_expense / public
-- Date: 2026-07-04
-- Phase: React 19 重寫 Phase 1 記錄；實際執行落在 Phase 10 cutover 之後


-- ============================================================================
-- 1. DROP legacy 封存表（先匯出封存再刪）
-- ----------------------------------------------------------------------------
-- legacy_transactions / legacy_users 為 V1 資料唯讀封存。cutover 後如確認不再需要：
--   先匯出（Dashboard 匯出 CSV 或 pg_dump --table）→ 存檔驗證 → 再 DROP。
--
-- -- 匯出範例（在可寫入處執行；勿在 SQL Editor 直接 COPY 到 server 檔案系統）：
-- --   pg_dump ... --schema=group_expense \
-- --     --table=group_expense.legacy_transactions \
-- --     --table=group_expense.legacy_users > legacy_archive_YYYYMMDD.sql
--
-- DROP TABLE IF EXISTS group_expense.legacy_transactions;
-- DROP TABLE IF EXISTS group_expense.legacy_users;


-- ============================================================================
-- 2. DROP public schema 遺留函式（couple→family 遷移殘留）
-- ----------------------------------------------------------------------------
-- v3-04 已先 REVOKE EXECUTE FROM anon, authenticated（止血）。cutover 後確認
-- 30 天以上零呼叫，再 DROP。先跑 v3-04 檔尾 (c) pg_stat_statements 查詢確認。
--
-- -- DROP FUNCTION IF EXISTS public.create_couple(...);   -- 簽章以 live DB 為準
-- -- DROP FUNCTION IF EXISTS public.join_couple(...);     -- 簽章以 live DB 為準
-- --
-- -- 亦評估：public schema 內其他 couple 期殘留物件（表 / view / trigger）。
-- -- 逐一以下列查詢盤點後再決定：
-- --   SELECT p.proname, pg_get_function_identity_arguments(p.oid)
-- --   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- --   WHERE n.nspname = 'public';


-- ============================================================================
-- 3. category 欄位補 CHECK 約束（收斂為 6 值 CategoryType）
-- ----------------------------------------------------------------------------
-- 現況：expenses.category / recurring_expenses.category 為 free-form text（無 CHECK），
--       前端以 toValidCategory() 把未知值 coerce 成 'other'。cutover 後若要 DB 層收斂：
--   ⚠ 破壞性前置：務必先 UPDATE 既有列，把不在白名單的 category 一律改為 'other'，
--     否則 ADD CONSTRAINT 會因既有列違反而失敗。
--
-- -- UPDATE group_expense.expenses
-- --   SET category = 'other'
-- --   WHERE category NOT IN ('food','pet','shopping','transport','home','other');
-- -- ALTER TABLE group_expense.expenses
-- --   ADD CONSTRAINT expenses_category_check
-- --   CHECK (category IN ('food','pet','shopping','transport','home','other'));
-- --
-- -- UPDATE group_expense.recurring_expenses
-- --   SET category = 'other'
-- --   WHERE category NOT IN ('food','pet','shopping','transport','home','other');
-- -- ALTER TABLE group_expense.recurring_expenses
-- --   ADD CONSTRAINT recurring_expenses_category_check
-- --   CHECK (category IN ('food','pet','shopping','transport','home','other'));


-- ============================================================================
-- 4. 作廢的 add_fcm_token_to_user_settings.sql 對應欄位評估
-- ----------------------------------------------------------------------------
-- 舊 migration 在 public.user_settings 加了 fcm_token 欄位（單一 token）。
-- v3 通知子系統改用 group_expense.user_devices（一人多裝置、含 platform / last_seen）。
-- cutover 後 fcm_token 欄位作廢，評估移除：
--   ⚠ 破壞性前置：確認 Vue 版與 React 版皆不再讀寫 user_settings.fcm_token，
--     且資料已無保留價值（token 本就會過期輪換，通常無需遷移）。
--   注意 schema 差異：舊欄位在 public.user_settings；v2 後主 schema 為 group_expense，
--     實際欄位落點需 live DB 確認（可能兩處皆需檢查）。
--
-- -- ALTER TABLE public.user_settings          DROP COLUMN IF EXISTS fcm_token;
-- -- ALTER TABLE group_expense.user_settings   DROP COLUMN IF EXISTS fcm_token;   -- 若存在


-- ============================================================================
-- 5.（可選）其他 cutover 後收斂
-- ----------------------------------------------------------------------------
-- - useDebtSimplification 對應之 dead code 與其 spec（前端）——非 DB，記錄於此以免遺漏。
-- - 盤點 v2-schema-migration.sql 遷移期在 public schema 建立、之後搬到 group_expense
--   後未清的殘留物件。
-- - 平台層：啟用 auth_leaked_password_protection、縮短 auth_otp_long_expiry、
--   升級 Postgres 安全版本（Dashboard 操作，非本檔 SQL）。
