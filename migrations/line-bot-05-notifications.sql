-- LINE Bot：群組新增費用時，私訊通知其他已綁定 LINE 的成員。
-- 需先執行 line-bot-01～04。可重複執行。
--
-- 流程：expenses 新增群組費用 → 交易提交時（deferred trigger）寫入 line_bot.notification_outbox
--       → pg_net 呼叫 line-notify Edge Function → 逐筆 LINE push → 回寫結果。
-- 通知失敗不影響記帳：trigger 內的錯誤只記 WARNING；未送出的由 cron 每 10 分鐘補送，最多 5 次。
-- 這是 line_bot 對 group_expense 唯一的修改：在 expenses 上加一個 trigger，不改資料或既有物件。

BEGIN;

CREATE TABLE IF NOT EXISTS line_bot.notification_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 不設 FK：費用在送出前被刪除時，送出階段會標為 skipped。
    expense_id uuid NOT NULL,
    line_user_id text NOT NULL REFERENCES line_bot.identities (line_user_id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    sent_at timestamptz,
    UNIQUE (expense_id, line_user_id)
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
    ON line_bot.notification_outbox (created_at) WHERE status IN ('pending', 'sending');

REVOKE ALL ON line_bot.notification_outbox FROM PUBLIC, anon, authenticated;
ALTER TABLE line_bot.notification_outbox ENABLE ROW LEVEL SECURITY;

-- 以 pg_net 非同步呼叫 line-notify。網址與密鑰放在 Vault（line_notify_url、line_notify_secret）。
-- 沒有 pg_net／Vault 或尚未設定時直接略過，由 cron 之後補送。
CREATE OR REPLACE FUNCTION line_bot.request_notify_drain()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_url text;
    v_secret text;
BEGIN
    IF to_regclass('vault.decrypted_secrets') IS NULL OR to_regnamespace('net') IS NULL THEN
        RETURN;
    END IF;
    EXECUTE $q$
        SELECT max(decrypted_secret) FILTER (WHERE name = 'line_notify_url'),
               max(decrypted_secret) FILTER (WHERE name = 'line_notify_secret')
        FROM vault.decrypted_secrets
        WHERE name IN ('line_notify_url', 'line_notify_secret')
    $q$ INTO v_url, v_secret;
    IF coalesce(v_url, '') = '' OR coalesce(v_secret, '') = '' THEN
        RAISE WARNING 'line_bot: Vault 缺少 line_notify_url 或 line_notify_secret，略過通知';
        RETURN;
    END IF;
    EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
        USING v_url,
              jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
              '{}'::jsonb;
END
$$;

-- 收件人：同群組其他有效成員，已綁定且未封鎖 Bot，「分帳通知」未關閉（沿用 App 設定）。
CREATE OR REPLACE FUNCTION line_bot.enqueue_group_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer;
BEGIN
    IF NEW.group_id IS NULL THEN
        RETURN NULL;
    END IF;
    BEGIN
        INSERT INTO line_bot.notification_outbox (expense_id, line_user_id)
        SELECT NEW.id, i.line_user_id
        FROM group_expense.group_members gm
        JOIN line_bot.identities i ON i.user_id = gm.user_id AND i.is_following
        LEFT JOIN group_expense.user_settings us ON us.user_id = gm.user_id
        WHERE gm.group_id = NEW.group_id
          AND gm.is_active = true
          AND gm.user_id <> NEW.user_id
          AND coalesce((us.notification_prefs ->> 'split_assigned')::boolean, true)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN
            PERFORM line_bot.request_notify_drain();
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'line_bot.enqueue_group_expense % failed: %', NEW.id, SQLERRM;
    END;
    RETURN NULL;
END
$$;

-- DEFERRABLE INITIALLY DEFERRED：在交易提交時才執行，此時同一交易寫入的分帳已存在。
DROP TRIGGER IF EXISTS line_bot_notify_group_expense ON group_expense.expenses;
CREATE CONSTRAINT TRIGGER line_bot_notify_group_expense
    AFTER INSERT ON group_expense.expenses
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION line_bot.enqueue_group_expense();

-- 取出待送通知並標為 sending（SKIP LOCKED：同時執行也不會重複取到）。
-- 超過 5 分鐘仍是 sending 視為中斷，重新取出；LINE 端以 retry key 去重。
CREATE OR REPLACE FUNCTION line_bot.claim_notifications(p_limit integer)
RETURNS TABLE (
    id uuid, line_user_id text, expense_id uuid, attempts integer,
    group_name text, creator_name text, title text, amount text, currency text,
    category text, expense_date text, my_share text, recipient_active boolean
)
LANGUAGE sql
SET search_path = ''
AS $$
    WITH claimed AS (
        UPDATE line_bot.notification_outbox o
        SET status = 'sending', claimed_at = now(), attempts = o.attempts + 1
        WHERE o.id IN (
            SELECT n.id FROM line_bot.notification_outbox n
            WHERE (n.status = 'pending' OR (n.status = 'sending' AND n.claimed_at < now() - interval '5 minutes'))
              AND n.attempts < 5
            ORDER BY n.created_at
            LIMIT least(greatest(p_limit, 1), 50)
            FOR UPDATE SKIP LOCKED
        )
        RETURNING o.id, o.line_user_id, o.expense_id, o.attempts
    )
    SELECT c.id, c.line_user_id, c.expense_id, c.attempts,
           g.name,
           coalesce(p.display_name, split_part(p.email, '@', 1)),
           e.title, e.amount::text, coalesce(e.currency, 'TWD'), e.category, e.date::text,
           (SELECT s.amount::text FROM group_expense.expense_splits s
            WHERE s.expense_id = e.id AND s.user_id = r.user_id),
           EXISTS (SELECT 1 FROM group_expense.group_members gm
                   WHERE gm.group_id = e.group_id AND gm.user_id = r.user_id AND gm.is_active = true)
    FROM claimed c
    JOIN line_bot.identities r ON r.line_user_id = c.line_user_id
    LEFT JOIN group_expense.expenses e ON e.id = c.expense_id
    LEFT JOIN group_expense.groups g ON g.id = e.group_id
    LEFT JOIN group_expense.user_profiles p ON p.id = e.user_id
$$;

-- p_result：sent / skipped / failed / retry（retry 在 5 次內退回 pending，之後標 failed）。
CREATE OR REPLACE FUNCTION line_bot.finish_notification(p_id uuid, p_result text, p_error text)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
    UPDATE line_bot.notification_outbox
    SET status = CASE
            WHEN p_result = 'retry' THEN CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END
            ELSE p_result
        END,
        last_error = left(p_error, 500),
        sent_at = CASE WHEN p_result = 'sent' THEN now() END
    WHERE id = p_id AND status = 'sending'
$$;

REVOKE ALL ON FUNCTION line_bot.request_notify_drain() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.enqueue_group_expense() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.claim_notifications(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.finish_notification(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- 補送：每 10 分鐘，只有在有待送通知時才呼叫。
DO $cron$
BEGIN
    IF to_regnamespace('cron') IS NOT NULL THEN
        PERFORM cron.schedule(
            'line-bot-notify-retry',
            '*/10 * * * *',
            $job$SELECT line_bot.request_notify_drain()
                 WHERE EXISTS (SELECT 1 FROM line_bot.notification_outbox
                               WHERE status IN ('pending', 'sending') AND attempts < 5)$job$
        );
    END IF;
END
$cron$;

COMMIT;
