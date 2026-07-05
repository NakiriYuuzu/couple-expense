-- Migration: v3-07 monthly report cron（每月月報・Cron 排程・additive-only）
-- Schema: group_expense
-- Date: 2026-07-05
-- Phase: React 19 重寫 Phase 7（每月月報・additive-only）
--
-- 鐵律：production 仍跑 Vue 版並共用同一個 Supabase 專案。本 migration 僅新增 pg_cron
--       排程，不建表、不 ALTER、不觸碰 v3-02 已定義的 group_expense.monthly_reports
--       表、RLS、policy 與 GRANT，重跑安全（idempotent）。
--
-- ⚠ 本檔僅寫好待審——套用到 live DB 需使用者另行核准執行
--
-- 用途：新增月報 cron（每月 1 號）於 server 端呼叫 Edge Function monthly-report，
--       由該函式彙整上月支出、寫入 group_expense.monthly_reports 並推播。
--
-- 設計補註（為避免誤會）：
-- 1) group_expense.monthly_reports 已在 v3-02 完整建表（id / created_at / year_month /
--    data / read_at / notified_at）並完成 RLS + 欄位級 GRANT（authenticated 只能
--    SELECT 自己列 + UPDATE(read_at)）。本檔不重建、不新增欄位、不改權限模型。
-- 2) 「每次重新產生要刷新」的語意由 Edge Function 每次 upsert 整包覆寫 data（其中已
--    含 generatedAt 時間戳）承載，不需要額外的資料庫欄位；created_at 維持首次建立
--    時間，notified_at/read_at 因 upsert 未帶這兩欄而自然保留，idempotent 不重推。

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 月報排程（idempotent）------------------------------------------------------
-- 時程：UTC 01:00 on every 1st = 台北時間每月 1 號 09:00。

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-report') THEN
        PERFORM cron.unschedule('monthly-report');
    END IF;
END;
$$;

SELECT cron.schedule(
    'monthly-report',
    '0 1 1 * *',
    $monthly_report_job$
    DO $$
    DECLARE
        v_url         text := group_expense.get_send_push_secret('monthly_report_url');
        v_service_key text := group_expense.get_send_push_secret('send_push_service_key');
    BEGIN
        IF coalesce(v_url, '') = '' OR coalesce(v_service_key, '') = '' THEN
            RAISE WARNING 'monthly-report cron: monthly_report_url 或 send_push_service_key 未設定，略過本次呼叫';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := '{}'::jsonb
        );
    END;
    $$
    $monthly_report_job$
);

-- == 驗證 SQL ================================================================
-- (a) 月報排程是否建立，cron.name/schedule 是否符合預期
-- SELECT jobname, schedule, active
-- FROM cron.job
-- WHERE jobname = 'monthly-report';

-- (b) Cron 呼叫端所需 secret 是否已建（本機應由 docs/fcm-setup.md #9 確認）
-- SELECT name FROM vault.decrypted_secrets
-- WHERE name IN ('monthly_report_url', 'send_push_service_key');
