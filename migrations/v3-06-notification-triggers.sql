-- Migration: v3-06 notification triggers（通知子系統・觸發層）
-- Schema: group_expense
-- Date: 2026-07-05
-- Phase: React 19 重寫 Phase 6（推播通知・additive-only）
--
-- 鐵律：production 仍跑 Vue 版並共用同一個 Supabase 專案。本 migration 僅新增
--       extension/function/trigger，不觸碰任何既有資料表或既有函式，重跑安全
--       （idempotent：CREATE EXTENSION IF NOT EXISTS、CREATE OR REPLACE FUNCTION、
--       DROP TRIGGER IF EXISTS）。
--
-- ⚠ 本檔僅寫好待審——套用到 live DB 需使用者另行核准執行（見 docs/fcm-setup.md 套用步驟）。
--
-- 用途：group_expense.expense_splits / group_expense.settlements 有新列 INSERT 時，
--       以 pg_net 非同步呼叫 Edge Function send-push（見
--       supabase/functions/send-push/index.ts），通知「被分帳者」（split_assigned）
--       與「收到結算的人」（settlement_received）。
--
-- 前置需求（套用前務必確認；未備妥時 trigger 只會 RAISE WARNING 並略過推播，
-- 不會擋住記帳/結算交易——見下方「設計取捨」）：
--   1. pg_net extension 已啟用（本檔會 CREATE EXTENSION IF NOT EXISTS pg_net；預期安裝於
--      Supabase 預設的 net schema，執行角色需具備建立此 allow-listed extension 的權限——
--      Supabase SQL Editor 所用的 postgres 角色具備）。
--   2. Supabase Vault 已啟用，且已建立以下三把密鑰（設定步驟見 docs/fcm-setup.md）：
--        send_push_url            → send-push Edge Function 的完整呼叫網址
--        send_push_shared_secret  → 與 send-push 環境變數 SEND_PUSH_WEBHOOK_SECRET 相同的隨機字串
--        send_push_service_key    → 專案的 service_role key（legacy JWT 格式，用於通過 Supabase
--                                    平台 verify_jwt = true 的閘道；見下方「設計取捨」說明）
--      若專案不使用 Vault，改用檔尾「替代方案（GUC）」並自行調整
--      get_send_push_secret() 的實作。
--
-- 設計取捨：
--   • 兩個 trigger 都是 STATEMENT-level + REFERENCING NEW TABLE（transition table），
--     而非 ROW-level——關鍵情境是 group_expense.settle_expense() 會在單一 statement 內
--     對「同一位收款人」一次 INSERT 多筆 settlements（一筆支出多位債務人分別結清給
--     同一位付款人）。ROW-level trigger 會對同一人狂發多次推播；STATEMENT-level 依
--     收件人聚合後，同一 statement 內每位收件人只送一次 http_post。
--   • 推播失敗（pg_net 未裝、Vault 密鑰未設、FCM 端點錯誤……）一律只 RAISE WARNING、
--     絕不讓例外往外傳——推播是加值功能，不該讓核心記帳/結算交易因此失敗或 rollback。
--     每位收件人的 http_post 各自包一層 EXCEPTION，避免其中一人失敗連帶擋下其他人；
--     函式最外層再包一層兜底。
--   • notification_prefs 的事件開關過濾**不在**這裡做，而是由 send-push 內部依
--     user_settings.notification_prefs 過濾（見 supabase/functions/send-push/index.ts
--     的 isValidPayload / recipientIds 邏輯）；本檔只負責「偵測事件 + 找出候選收件人 +
--     呼叫 send-push」。
--   • split_assigned 排除付款人自己：JOIN expenses 取得 paid_by 後於 WHERE 排除
--     （ns.user_id IS DISTINCT FROM e.paid_by）。
--   • Authorization 標頭帶 Vault 的 send_push_service_key（值＝專案 service_role key，legacy
--     JWT 格式）：Supabase 平台預設 verify_jwt = true，請求若沒有合法 Supabase JWT，會在
--     抵達 send-push 之前就被平台閘道擋下（401 UNAUTHORIZED_NO_AUTH_HEADER），連 function
--     本體都不會執行——單靠 x-webhook-secret 標頭無法通過這一層。因此 Authorization（過平台
--     驗證後，send-push 內 isAuthorized() 再核對是否等於 SUPABASE_SERVICE_ROLE_KEY）才是
--     主要驗證路徑之一。isAuthorized() 採 OR 關係，任一條件成立即可通過：Authorization
--     Bearer <service_role key> 或 x-webhook-secret。若 service_role key 外洩，Authorization
--     單獨就已足夠通過；x-webhook-secret 只是缺少/無效 Authorization 時的備援，不是
--     多一層防護。url／service_key 任一為空（NULL 或空字串）即略過本次推播（見下方檢查）。
--   • data.url 依前端 src/sw.ts 的 notificationclick 契約（app-relative path、不含前導
--     slash，經 new URL(dataUrl, self.registration.scope) 解析）：split_assigned 給
--     'expenses/' || expense_id（對應路由檔 src/routes/_authenticated/expenses/$id.tsx）；
--     settlement_received 給 'overview'（對應 src/routes/_authenticated/overview.tsx）。

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 0. 共用：讀取 send-push 呼叫設定（URL + 共享密鑰）--------------------------------
--    採 Supabase Vault（原生管理、加密於 at rest、有存取稽核）。
CREATE OR REPLACE FUNCTION group_expense.get_send_push_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_value text;
BEGIN
    SELECT decrypted_secret INTO v_value
    FROM vault.decrypted_secrets
    WHERE name = p_name
    LIMIT 1;

    RETURN v_value;  -- NULL 表示尚未於 Vault 建立此密鑰；呼叫端需自行判斷是否略過
EXCEPTION WHEN OTHERS THEN
    -- Vault 未啟用 / decrypted_secrets 不可讀等情況：視為未設定，不阻斷呼叫端交易。
    RAISE WARNING 'get_send_push_secret(%): %', p_name, SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION group_expense.get_send_push_secret(text)
    IS '讀取 send-push 呼叫設定（send_push_url / send_push_shared_secret / send_push_service_key）於 Supabase Vault；查無或 Vault 不可用時回傳 NULL 並僅 WARNING，不拋例外。替代方案見檔尾 GUC 備註。';

-- 1. split_assigned：新支出的 splits 產生時，通知被分帳者（排除付款人自己）---------------
CREATE OR REPLACE FUNCTION group_expense.notify_split_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_url         text := group_expense.get_send_push_secret('send_push_url');
    v_secret      text := group_expense.get_send_push_secret('send_push_shared_secret');
    v_service_key text := group_expense.get_send_push_secret('send_push_service_key');
    v_row         record;
BEGIN
    IF coalesce(v_url, '') = '' OR coalesce(v_service_key, '') = '' THEN
        RAISE WARNING 'notify_split_assigned: send_push_url 或 send_push_service_key 未設定，略過本次推播';
        RETURN NULL;
    END IF;

    -- 聚合鍵：(recipient, expense)。單一 add_group_expense 呼叫僅對一筆支出產生 splits，
    -- 故常態下等同「依收件人聚合」；多留 expense 維度是為了防禦未來可能出現的批次匯入
    -- （單一 statement 內對多筆支出同時 INSERT splits）情境，避免把不同支出的訊息混在一起。
    FOR v_row IN
        SELECT
            ns.user_id     AS recipient_id,
            e.id           AS expense_id,
            e.title        AS expense_title,
            count(*)       AS split_count,
            sum(ns.amount) AS total_amount
        FROM new_splits ns
        JOIN group_expense.expenses e ON e.id = ns.expense_id
        WHERE e.group_id IS NOT NULL                -- 僅群組支出才有「被分帳」語意
          AND ns.user_id IS DISTINCT FROM e.paid_by  -- 排除付款人自己
        GROUP BY ns.user_id, e.id, e.title
    LOOP
        BEGIN
            PERFORM net.http_post(
                url     := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key,
                    'x-webhook-secret', v_secret
                ),
                body    := jsonb_build_object(
                    'userIds', jsonb_build_array(v_row.recipient_id),
                    'event', 'split_assigned',
                    'title', '新的分帳',
                    'body', format('「%s」有新的分帳給你，金額 %s', v_row.expense_title, round(v_row.total_amount)),
                    'data', jsonb_build_object(
                        'expenseId', v_row.expense_id::text,
                        'splitCount', v_row.split_count::text,
                        'url', 'expenses/' || v_row.expense_id::text
                    )
                )
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'notify_split_assigned: http_post failed for user %, expense %: %',
                v_row.recipient_id, v_row.expense_id, SQLERRM;
        END;
    END LOOP;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_split_assigned: unexpected error: %', SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION group_expense.notify_split_assigned()
    IS 'STATEMENT-level AFTER INSERT ON expense_splits：以 transition table 依 (recipient, expense) 聚合，逐收件人呼叫 send-push（event=split_assigned），排除付款人自己；僅群組支出（group_id NOT NULL）觸發。任何失敗只 WARNING，不影響原交易。';

DROP TRIGGER IF EXISTS trg_notify_split_assigned ON group_expense.expense_splits;
CREATE TRIGGER trg_notify_split_assigned
    AFTER INSERT ON group_expense.expense_splits
    REFERENCING NEW TABLE AS new_splits
    FOR EACH STATEMENT
    EXECUTE FUNCTION group_expense.notify_split_assigned();

-- 2. settlement_received：新結算 INSERT 時，通知收款人 -----------------------------------
CREATE OR REPLACE FUNCTION group_expense.notify_settlement_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_url         text := group_expense.get_send_push_secret('send_push_url');
    v_secret      text := group_expense.get_send_push_secret('send_push_shared_secret');
    v_service_key text := group_expense.get_send_push_secret('send_push_service_key');
    v_row         record;
BEGIN
    IF coalesce(v_url, '') = '' OR coalesce(v_service_key, '') = '' THEN
        RAISE WARNING 'notify_settlement_received: send_push_url 或 send_push_service_key 未設定，略過本次推播';
        RETURN NULL;
    END IF;

    -- 聚合鍵：paid_to（收款人）。group_expense.settle_expense() 會在單一 statement 內
    -- 對同一位收款人一次 INSERT 多筆 settlements（一筆支出多位債務人分別結清給同一位
    -- 付款人），故以此聚合，避免對同一人狂發多則推播。
    FOR v_row IN
        SELECT
            ns.paid_to     AS recipient_id,
            count(*)       AS settlement_count,
            sum(ns.amount) AS total_amount
        FROM new_settlements ns
        GROUP BY ns.paid_to
    LOOP
        BEGIN
            PERFORM net.http_post(
                url     := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key,
                    'x-webhook-secret', v_secret
                ),
                body    := jsonb_build_object(
                    'userIds', jsonb_build_array(v_row.recipient_id),
                    'event', 'settlement_received',
                    'title', '收到結算',
                    'body', CASE WHEN v_row.settlement_count = 1
                                 THEN format('你收到一筆結算，金額 %s', round(v_row.total_amount))
                                 ELSE format('你收到 %s 筆結算，共 %s', v_row.settlement_count, round(v_row.total_amount))
                            END,
                    'data', jsonb_build_object(
                        'settlementCount', v_row.settlement_count::text,
                        'url', 'overview'
                    )
                )
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'notify_settlement_received: http_post failed for user %: %',
                v_row.recipient_id, SQLERRM;
        END;
    END LOOP;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_settlement_received: unexpected error: %', SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION group_expense.notify_settlement_received()
    IS 'STATEMENT-level AFTER INSERT ON settlements：以 transition table 依 paid_to 聚合（settle_expense 一次可能對同一收款人產生多筆列），逐收件人呼叫 send-push（event=settlement_received）。任何失敗只 WARNING，不影響原交易。';

DROP TRIGGER IF EXISTS trg_notify_settlement_received ON group_expense.settlements;
CREATE TRIGGER trg_notify_settlement_received
    AFTER INSERT ON group_expense.settlements
    REFERENCING NEW TABLE AS new_settlements
    FOR EACH STATEMENT
    EXECUTE FUNCTION group_expense.notify_settlement_received();


-- == 替代方案（GUC，未採用，供不用 Vault 的專案參考）==================================
-- 若目標 Supabase 專案不啟用 Vault，可改用資料庫層級自訂設定（GUC）取代
-- get_send_push_secret() 的實作：
--   ALTER DATABASE postgres SET app.settings.send_push_url = 'https://<project-ref>.supabase.co/functions/v1/send-push';
--   ALTER DATABASE postgres SET app.settings.send_push_secret = '<random-secret>';
-- 並將 get_send_push_secret() 函式體改為：
--   RETURN current_setting('app.settings.' || p_name, true);
-- 取捨：GUC 設定簡單、免額外查詢 vault schema；但密鑰明碼存在 pg_settings（superuser 可見），
-- 且無版本化 / rotate / 存取稽核機制。Vault 由 Supabase 原生管理、加密於 at rest，故本檔採 Vault。


-- == 驗證 SQL ========================================================================
-- 套用後貼到 Supabase SQL Editor 逐段驗證。

-- (a) pg_net extension 已啟用
-- SELECT extname, extnamespace::regnamespace FROM pg_extension WHERE extname = 'pg_net';

-- (b) 兩個 trigger 皆已建立且為 STATEMENT-level（tgtype 的 ROW bit 應為 0）
-- SELECT tgname, tgrelid::regclass, tgtype
-- FROM   pg_trigger
-- WHERE  tgname IN ('trg_notify_split_assigned', 'trg_notify_settlement_received');

-- (c) Vault 密鑰是否已建立（期望回傳 3 筆；需 service_role / postgres 執行）
-- SELECT name FROM vault.decrypted_secrets
-- WHERE  name IN ('send_push_url', 'send_push_shared_secret', 'send_push_service_key');

-- (d) 手動觸發驗證（請在測試群組操作，勿在 production 資料上測試）：
--     新增一筆群組支出並指定分帳給另一位成員 → 於 Supabase Dashboard →
--     Edge Functions → send-push → Logs 檢查是否收到呼叫；或查詢 pg_net 的
--     非同步回應紀錄：
-- SELECT id, status_code, created, response_body
-- FROM   net._http_response
-- ORDER  BY id DESC
-- LIMIT  20;
