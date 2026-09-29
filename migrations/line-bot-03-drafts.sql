-- LINE Bot 第 3 步：帳本切換、記帳草稿、確認入帳。
-- 需先執行 line-bot-01、02。只新增 line_bot 物件，不修改 group_expense；可重複執行。
--
-- 入帳一律「以綁定的使用者身分」執行：同一交易內 SET LOCAL ROLE authenticated，並設定
-- request.jwt.claims.sub，讓既有 RLS 與 add_group_expense 的 auth.uid() 檢查照常生效。

BEGIN;

-- 目前帳本；NULL = 個人帳。群組被刪除時退回個人帳。
ALTER TABLE line_bot.identities
    ADD COLUMN IF NOT EXISTS ledger_group_id uuid REFERENCES group_expense.groups (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS line_bot.drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    line_user_id text NOT NULL REFERENCES line_bot.identities (line_user_id) ON DELETE CASCADE,
    group_id uuid REFERENCES group_expense.groups (id) ON DELETE CASCADE,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 50),
    amount numeric(12, 2) NOT NULL CHECK (amount > 0),
    category text NOT NULL DEFAULT 'other'
        CHECK (category IN ('food', 'pet', 'shopping', 'transport', 'home', 'other')),
    expense_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    expense_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
);

REVOKE ALL ON line_bot.drafts FROM PUBLIC, anon, authenticated;
ALTER TABLE line_bot.drafts ENABLE ROW LEVEL SECURITY;

-- 使用者可選的群組帳本（有效成員＋有效群組）。
CREATE OR REPLACE FUNCTION line_bot.list_ledgers(p_line_user_id text)
RETURNS TABLE (group_id uuid, name text, is_current boolean)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT g.id, g.name, g.id IS NOT DISTINCT FROM i.ledger_group_id
    FROM line_bot.identities i
    JOIN group_expense.group_members gm ON gm.user_id = i.user_id AND gm.is_active = true
    JOIN group_expense.groups g ON g.id = gm.group_id AND g.is_active = true
    WHERE i.line_user_id = p_line_user_id
    ORDER BY g.name, g.id
$$;

-- 切換帳本：p_group_id NULL = 個人帳。回傳 false 代表不是該群組的有效成員。
CREATE OR REPLACE FUNCTION line_bot.set_ledger(p_line_user_id text, p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE line_bot.identities i
    SET ledger_group_id = p_group_id, updated_at = now()
    WHERE i.line_user_id = p_line_user_id
      AND (p_group_id IS NULL OR EXISTS (
          SELECT 1
          FROM group_expense.group_members gm
          JOIN group_expense.groups g ON g.id = gm.group_id AND g.is_active = true
          WHERE gm.group_id = p_group_id AND gm.user_id = i.user_id AND gm.is_active = true
      ));
    RETURN FOUND;
END
$$;

-- 建立草稿；目前帳本若已失去成員資格，改記個人帳。
CREATE OR REPLACE FUNCTION line_bot.create_draft(p_line_user_id text, p_title text, p_amount numeric)
RETURNS uuid
LANGUAGE sql
SET search_path = ''
AS $$
    INSERT INTO line_bot.drafts (line_user_id, group_id, title, amount)
    SELECT i.line_user_id,
           CASE WHEN EXISTS (
               SELECT 1
               FROM group_expense.group_members gm
               JOIN group_expense.groups g ON g.id = gm.group_id AND g.is_active = true
               WHERE gm.group_id = i.ledger_group_id AND gm.user_id = i.user_id AND gm.is_active = true
           ) THEN i.ledger_group_id END,
           p_title,
           p_amount
    FROM line_bot.identities i
    WHERE i.line_user_id = p_line_user_id
    RETURNING id
$$;

-- 草稿卡片內容；只回傳該 LINE 使用者自己的草稿。
-- 後續 migration 會改變回傳欄位；先刪除，確保整串 migration 可依序重跑。
DROP FUNCTION IF EXISTS line_bot.get_draft(text, uuid);
CREATE FUNCTION line_bot.get_draft(p_line_user_id text, p_draft_id uuid)
RETURNS TABLE (
    id uuid, title text, amount text, category text, expense_date text,
    status text, ledger_name text, is_expired boolean
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT d.id, d.title, d.amount::text, d.category, d.expense_date::text,
           d.status, g.name, d.expires_at <= now()
    FROM line_bot.drafts d
    LEFT JOIN group_expense.groups g ON g.id = d.group_id
    WHERE d.id = p_draft_id AND d.line_user_id = p_line_user_id
$$;

CREATE OR REPLACE FUNCTION line_bot.set_draft_category(p_line_user_id text, p_draft_id uuid, p_category text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE line_bot.drafts
    SET category = p_category
    WHERE id = p_draft_id AND line_user_id = p_line_user_id
      AND status = 'pending' AND expires_at > now();
    RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION line_bot.cancel_draft(p_line_user_id text, p_draft_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE line_bot.drafts
    SET status = 'cancelled'
    WHERE id = p_draft_id AND line_user_id = p_line_user_id AND status = 'pending';
    RETURN FOUND;
END
$$;

-- 確認入帳。草稿列鎖定後才檢查狀態，連按或並行確認只會入帳一次。
-- 回傳 confirmed / already_confirmed / not_found / cancelled / expired / failed。
-- failed：以使用者身分寫入被拒（例如已不是群組成員）；草稿維持 pending，錯誤寫入 DB log。
CREATE OR REPLACE FUNCTION line_bot.confirm_draft(p_line_user_id text, p_draft_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_draft line_bot.drafts;
    v_user_id uuid;
    v_icon text;
    v_splits jsonb;
    v_expense_id uuid;
BEGIN
    SELECT * INTO v_draft
    FROM line_bot.drafts
    WHERE id = p_draft_id AND line_user_id = p_line_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_draft.status = 'confirmed' THEN
        RETURN 'already_confirmed';
    END IF;
    IF v_draft.status = 'cancelled' THEN
        RETURN 'cancelled';
    END IF;
    IF v_draft.expires_at <= now() THEN
        RETURN 'expired';
    END IF;

    SELECT user_id INTO v_user_id FROM line_bot.identities WHERE line_user_id = p_line_user_id;

    -- 與 App 相同的類別 → icon 對照（src/features/expense/lib/categories.ts）。
    v_icon := CASE v_draft.category
        WHEN 'food' THEN 'restaurant'
        WHEN 'pet' THEN 'heart'
        WHEN 'shopping' THEN 'shopping'
        WHEN 'transport' THEN 'car'
        WHEN 'home' THEN 'home'
        ELSE 'package'
    END;

    IF v_draft.group_id IS NOT NULL THEN
        -- 有效成員均分，以「分」計算；尾差依加入順序分給前面的成員，總和必等於金額。
        WITH members AS (
            SELECT gm.user_id,
                   row_number() OVER (ORDER BY gm.joined_at, gm.user_id) AS rn,
                   count(*) OVER () AS n
            FROM group_expense.group_members gm
            WHERE gm.group_id = v_draft.group_id AND gm.is_active = true
        ), cents AS (
            SELECT (v_draft.amount * 100)::bigint AS total
        )
        SELECT jsonb_agg(
                   jsonb_build_object(
                       'user_id', m.user_id,
                       'amount', (((c.total / m.n) + CASE WHEN m.rn <= c.total % m.n THEN 1 ELSE 0 END) / 100.0)::numeric(12, 2),
                       'percentage', NULL,
                       'shares', NULL
                   ) ORDER BY m.rn)
        INTO v_splits
        FROM members m CROSS JOIN cents c;
    END IF;

    BEGIN
        -- 以使用者身分寫入；子交易結束或失敗時，角色與 claims 都會還原。
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;

        IF v_draft.group_id IS NULL THEN
            INSERT INTO group_expense.expenses (
                user_id, group_id, title, amount, category, icon, date, currency, paid_by
            ) VALUES (
                v_user_id, NULL, v_draft.title, v_draft.amount, v_draft.category, v_icon,
                v_draft.expense_date, 'TWD', v_user_id
            )
            RETURNING id INTO v_expense_id;
        ELSE
            v_expense_id := group_expense.add_group_expense(
                v_draft.group_id, v_draft.title, v_draft.amount, v_draft.category, v_icon,
                v_draft.expense_date, 'TWD', 'equal', v_user_id, NULL, v_splits
            );
        END IF;

        RESET ROLE;
        PERFORM set_config('request.jwt.claims', '', true);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'line_bot.confirm_draft % failed: %', p_draft_id, SQLERRM;
        RETURN 'failed';
    END;

    UPDATE line_bot.drafts SET status = 'confirmed', expense_id = v_expense_id WHERE id = v_draft.id;
    RETURN 'confirmed';
END
$$;

REVOKE ALL ON FUNCTION line_bot.list_ledgers(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.set_ledger(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.create_draft(text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.get_draft(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.set_draft_category(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.cancel_draft(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.confirm_draft(text, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
