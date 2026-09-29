-- LINE Bot 第 1 步：webhook 事件去重與 LINE 帳號對照表。
-- 只新增獨立 schema line_bot，不修改 group_expense 既有物件，與 v3-08 無相依。
-- 僅供 Edge Function 以 SUPABASE_DB_URL（資料庫擁有者）存取；
-- 不開放 anon / authenticated，也不要把 line_bot 加進 API exposed schemas。
-- 可重複執行。

BEGIN;

CREATE SCHEMA IF NOT EXISTS line_bot;
REVOKE ALL ON SCHEMA line_bot FROM PUBLIC, anon, authenticated;

-- 以 LINE webhookEventId 去重，重送事件只處理一次。
CREATE TABLE IF NOT EXISTS line_bot.webhook_events (
    webhook_event_id text PRIMARY KEY,
    event_type text NOT NULL,
    line_user_id text,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    error text
);

-- LINE 帳號 ↔ 既有 Supabase 使用者；第 2 步綁定流程寫入。
CREATE TABLE IF NOT EXISTS line_bot.identities (
    line_user_id text PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
    is_following boolean NOT NULL DEFAULT true,
    linked_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON ALL TABLES IN SCHEMA line_bot FROM PUBLIC, anon, authenticated;

-- 縱深防禦：即使日後誤授權，沒有 policy 也讀寫不到。
ALTER TABLE line_bot.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_bot.identities ENABLE ROW LEVEL SECURITY;

COMMIT;
