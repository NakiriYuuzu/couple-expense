-- LINE Bot 第 2 步：帳號綁定用的一次性 nonce。
-- 需先執行 line-bot-01-webhook.sql。只新增，可重複執行。

BEGIN;

CREATE TABLE IF NOT EXISTS line_bot.link_nonces (
    nonce_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON line_bot.link_nonces FROM PUBLIC, anon, authenticated;
ALTER TABLE line_bot.link_nonces ENABLE ROW LEVEL SECURITY;

-- LINE accountLink 事件：消耗 nonce（只能用一次、未過期）並建立對照，同一交易完成。
-- 回傳 linked / invalid_nonce / line_already_bound / user_already_bound。
CREATE OR REPLACE FUNCTION line_bot.complete_link(p_line_user_id text, p_nonce_hash text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_existing uuid;
BEGIN
    UPDATE line_bot.link_nonces
    SET used_at = now()
    WHERE nonce_hash = p_nonce_hash AND used_at IS NULL AND expires_at > now()
    RETURNING user_id INTO v_user_id;
    IF v_user_id IS NULL THEN
        RETURN 'invalid_nonce';
    END IF;

    INSERT INTO line_bot.identities (line_user_id, user_id)
    VALUES (p_line_user_id, v_user_id)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
        RETURN 'linked';
    END IF;

    SELECT user_id INTO v_existing FROM line_bot.identities WHERE line_user_id = p_line_user_id;
    IF v_existing IS NULL THEN
        RETURN 'user_already_bound';
    END IF;
    RETURN CASE WHEN v_existing = v_user_id THEN 'linked' ELSE 'line_already_bound' END;
END
$$;

REVOKE ALL ON FUNCTION line_bot.complete_link(text, text) FROM PUBLIC, anon, authenticated;

COMMIT;
