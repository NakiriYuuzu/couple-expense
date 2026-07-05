-- Migration: v3-05 user_settings.notification_prefs（通知子系統・偏好層）
-- Schema: group_expense
-- Date: 2026-07-04
-- Phase: React 19 重寫 Phase 1（資料庫結構收斂・additive-only）
--
-- 鐵律：production 仍跑 Vue 版並共用同一個 Supabase 專案。
--       ADD COLUMN IF NOT EXISTS + NOT NULL DEFAULT——既有列由 DEFAULT 自動回填，
--       既有 INSERT 路徑（未帶此欄）不受影響，重跑安全。
--
-- 用途：三種通知事件（Q11）各自開關；send-push / 月報 cron 發送前依此過濾。
--   - split_assigned      被指派分帳
--   - settlement_received 收到結算
--   - monthly_report      每月月報

ALTER TABLE group_expense.user_settings
    ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL
    DEFAULT '{"split_assigned":true,"settlement_received":true,"monthly_report":true}'::jsonb;

COMMENT ON COLUMN group_expense.user_settings.notification_prefs
    IS '三種推播事件開關 jsonb：{split_assigned, settlement_received, monthly_report}；send-push/月報 cron 發送前過濾。預設全開。';


-- == 驗證 SQL ================================================================
-- (a) 欄位存在 + 型別 + NOT NULL + 預設值
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM   information_schema.columns
-- WHERE  table_schema = 'group_expense' AND table_name = 'user_settings'
--   AND  column_name = 'notification_prefs';
--   -- 期望：jsonb / NO / '{"split_assigned": true, ...}'::jsonb

-- (b) 既有列已被 DEFAULT 回填（不應有任何 NULL）
-- SELECT count(*) AS null_prefs
-- FROM   group_expense.user_settings
-- WHERE  notification_prefs IS NULL;   -- 期望 0
