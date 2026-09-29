-- LINE Bot：記一筆卡片（預選分類、切換帳本）與草稿的帳本、分配方式（付款人、參與者）、日期。
-- 需先執行 line-bot-01～05 與 v3-08。只修改 line_bot 物件；可重複執行。
--
-- 分配模型：付款人 paid_by ＋ 參與者 participants，金額由參與者以「分」均分。
--   均分＝全部有效成員；我全付＝只有自己；對方全付＝只有對方（自己代墊）。
--
-- 個人帳本的最近紀錄／本月統計改為與網頁版「我的支出」相同：個人費用＋自己在群組費用的分攤。

BEGIN;

ALTER TABLE line_bot.identities
    ADD COLUMN IF NOT EXISTS pending_category text
        CHECK (pending_category IN ('food', 'pet', 'shopping', 'transport', 'home', 'other')),
    ADD COLUMN IF NOT EXISTS pending_category_at timestamptz;

ALTER TABLE line_bot.drafts
    ADD COLUMN IF NOT EXISTS paid_by uuid,
    ADD COLUMN IF NOT EXISTS participants uuid[];

-- 記一筆卡片上點分類：10 分鐘內下一筆輸入會套用這個分類。
CREATE OR REPLACE FUNCTION line_bot.set_pending_category(p_line_user_id text, p_category text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE line_bot.identities
    SET pending_category = p_category, pending_category_at = now(), updated_at = now()
    WHERE line_user_id = p_line_user_id;
    RETURN FOUND;
END
$$;

-- 建立草稿：帶入預選分類（並清除）；群組帳本預設自己付款、全體有效成員均分。
CREATE OR REPLACE FUNCTION line_bot.create_draft(p_line_user_id text, p_title text, p_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_identity line_bot.identities;
    v_group uuid;
    v_id uuid;
BEGIN
    SELECT * INTO v_identity FROM line_bot.identities WHERE line_user_id = p_line_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT l.group_id INTO v_group FROM line_bot.current_ledger(p_line_user_id) l;

    INSERT INTO line_bot.drafts (line_user_id, group_id, title, amount, category, paid_by, participants)
    VALUES (
        p_line_user_id,
        v_group,
        p_title,
        p_amount,
        CASE WHEN v_identity.pending_category_at > now() - interval '10 minutes'
             THEN v_identity.pending_category ELSE 'other' END,
        v_identity.user_id,
        CASE WHEN v_group IS NOT NULL THEN ARRAY(
            SELECT gm.user_id FROM group_expense.group_members gm
            WHERE gm.group_id = v_group AND gm.is_active = true
            ORDER BY gm.joined_at, gm.user_id
        ) END
    )
    RETURNING id INTO v_id;

    UPDATE line_bot.identities
    SET pending_category = NULL, pending_category_at = NULL
    WHERE line_user_id = p_line_user_id;
    RETURN v_id;
END
$$;

-- 草稿卡片內容；members 只在群組草稿列出有效成員與付款人／參與者狀態。
DROP FUNCTION IF EXISTS line_bot.get_draft(text, uuid);
CREATE FUNCTION line_bot.get_draft(p_line_user_id text, p_draft_id uuid)
RETURNS TABLE (
    id uuid, title text, amount text, category text, expense_date text,
    status text, ledger_name text, is_expired boolean, expense_id uuid, group_id uuid, members jsonb
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT d.id, d.title, d.amount::text, d.category, d.expense_date::text,
           d.status, g.name, d.expires_at <= now(), d.expense_id, d.group_id,
           coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                          'userId', gm.user_id,
                          'name', coalesce(p.display_name, split_part(p.email, '@', 1), '成員'),
                          'isMe', gm.user_id = i.user_id,
                          'isPayer', gm.user_id = coalesce(d.paid_by, i.user_id),
                          'isParticipant', d.participants IS NULL OR gm.user_id = ANY (d.participants)
                      ) ORDER BY gm.joined_at, gm.user_id)
               FROM group_expense.group_members gm
               LEFT JOIN group_expense.user_profiles p ON p.id = gm.user_id
               WHERE gm.group_id = d.group_id AND gm.is_active = true
           ), '[]'::jsonb)
    FROM line_bot.drafts d
    JOIN line_bot.identities i ON i.line_user_id = d.line_user_id
    LEFT JOIN group_expense.groups g ON g.id = d.group_id
    WHERE d.id = p_draft_id AND d.line_user_id = p_line_user_id
$$;

-- 只改這筆草稿的帳本（NULL＝個人）；群組必須是有效成員。切換後重設為自己付款、全體均分。
CREATE OR REPLACE FUNCTION line_bot.set_draft_ledger(p_line_user_id text, p_draft_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE line_bot.drafts d
    SET group_id = p_group_id,
        paid_by = i.user_id,
        participants = CASE WHEN p_group_id IS NOT NULL THEN ARRAY(
            SELECT gm.user_id FROM group_expense.group_members gm
            WHERE gm.group_id = p_group_id AND gm.is_active = true
            ORDER BY gm.joined_at, gm.user_id
        ) END
    FROM line_bot.identities i
    WHERE d.id = p_draft_id AND d.line_user_id = p_line_user_id AND i.line_user_id = d.line_user_id
      AND d.status = 'pending' AND d.expires_at > now()
      AND (p_group_id IS NULL OR EXISTS (
          SELECT 1
          FROM group_expense.group_members gm
          JOIN group_expense.groups g ON g.id = gm.group_id AND g.is_active = true
          WHERE gm.group_id = p_group_id AND gm.user_id = i.user_id AND gm.is_active = true
      ));
    RETURN FOUND;
END
$$;

-- 付款人必須是群組有效成員。
CREATE OR REPLACE FUNCTION line_bot.set_draft_payer(p_line_user_id text, p_draft_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE line_bot.drafts d
    SET paid_by = p_user_id
    WHERE d.id = p_draft_id AND d.line_user_id = p_line_user_id
      AND d.status = 'pending' AND d.expires_at > now() AND d.group_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM group_expense.group_members gm
                  WHERE gm.group_id = d.group_id AND gm.user_id = p_user_id AND gm.is_active = true);
    RETURN FOUND;
END
$$;

-- p_mode：all＝全部有效成員；only＝只有 p_user_id；toggle＝加入／移除 p_user_id（至少保留一人）。
CREATE OR REPLACE FUNCTION line_bot.set_draft_participants(
    p_line_user_id text, p_draft_id uuid, p_mode text, p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_draft line_bot.drafts;
    v_members uuid[];
    v_next uuid[];
BEGIN
    SELECT * INTO v_draft FROM line_bot.drafts
    WHERE id = p_draft_id AND line_user_id = p_line_user_id
      AND status = 'pending' AND expires_at > now() AND group_id IS NOT NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    v_members := ARRAY(
        SELECT gm.user_id FROM group_expense.group_members gm
        WHERE gm.group_id = v_draft.group_id AND gm.is_active = true
        ORDER BY gm.joined_at, gm.user_id
    );
    IF p_mode <> 'all' AND NOT (p_user_id = ANY (v_members)) THEN
        RETURN false;
    END IF;

    v_next := CASE p_mode
        WHEN 'all' THEN v_members
        WHEN 'only' THEN ARRAY[p_user_id]
        WHEN 'toggle' THEN ARRAY(
            SELECT m FROM unnest(v_members) WITH ORDINALITY AS t(m, ord)
            WHERE (m = ANY (coalesce(v_draft.participants, v_members))) <> (m = p_user_id)
            ORDER BY ord
        )
    END;
    IF v_next IS NULL OR cardinality(v_next) = 0 THEN
        RETURN false;
    END IF;

    UPDATE line_bot.drafts SET participants = v_next WHERE id = v_draft.id;
    RETURN true;
END
$$;

-- 日期限制在台北今天的前 5 年到後 1 年，避免誤觸。
CREATE OR REPLACE FUNCTION line_bot.set_draft_date(p_line_user_id text, p_draft_id uuid, p_date date)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_today date := (now() AT TIME ZONE 'Asia/Taipei')::date;
BEGIN
    IF p_date IS NULL OR p_date < v_today - interval '5 years' OR p_date > v_today + interval '1 year' THEN
        RETURN false;
    END IF;
    UPDATE line_bot.drafts
    SET expense_date = p_date
    WHERE id = p_draft_id AND line_user_id = p_line_user_id AND status = 'pending' AND expires_at > now();
    RETURN FOUND;
END
$$;

-- 確認入帳（取代 03 版）：群組以草稿的付款人與參與者入帳；
-- 付款人或任一參與者已不是有效成員時回傳 failed，不默默改變分攤。
CREATE OR REPLACE FUNCTION line_bot.confirm_draft(p_line_user_id text, p_draft_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_draft line_bot.drafts;
    v_user_id uuid;
    v_icon text;
    v_paid_by uuid;
    v_participants uuid[];
    v_active integer;
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
        v_paid_by := coalesce(v_draft.paid_by, v_user_id);
        v_participants := coalesce(v_draft.participants, ARRAY(
            SELECT gm.user_id FROM group_expense.group_members gm
            WHERE gm.group_id = v_draft.group_id AND gm.is_active = true
        ));
        SELECT count(*) INTO v_active
        FROM group_expense.group_members gm
        WHERE gm.group_id = v_draft.group_id AND gm.is_active = true AND gm.user_id = ANY (v_participants);
        IF cardinality(v_participants) = 0 OR v_active <> cardinality(v_participants) THEN
            RAISE WARNING 'line_bot.confirm_draft % failed: participant no longer active', p_draft_id;
            RETURN 'failed';
        END IF;

        -- 參與者以「分」均分；尾差依加入順序分給前面的人，總和必等於金額。
        WITH members AS (
            SELECT gm.user_id,
                   row_number() OVER (ORDER BY gm.joined_at, gm.user_id) AS rn,
                   count(*) OVER () AS n
            FROM group_expense.group_members gm
            WHERE gm.group_id = v_draft.group_id AND gm.is_active = true AND gm.user_id = ANY (v_participants)
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
                v_draft.expense_date, 'TWD', 'equal', v_paid_by, NULL, v_splits
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

-- 最近紀錄（取代 04 版）：個人帳本也列出自己有分攤的群組費用，amount 為自己的分攤，total_amount 為總額。
DROP FUNCTION IF EXISTS line_bot.recent_expenses(text, integer, integer);
CREATE FUNCTION line_bot.recent_expenses(p_line_user_id text, p_offset integer, p_limit integer)
RETURNS TABLE (
    title text, amount text, currency text, category text, expense_date text,
    payer_name text, paid_by_me boolean, group_name text, total_amount text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_user uuid;
    v_group uuid;
BEGIN
    SELECT l.user_id, l.group_id INTO v_user, v_group FROM line_bot.current_ledger(p_line_user_id) l;
    IF v_user IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    RETURN QUERY
        SELECT e.title,
               CASE WHEN v_group IS NULL AND e.group_id IS NOT NULL THEN s.amount ELSE e.amount END::text,
               coalesce(e.currency, 'TWD'), e.category, e.date::text,
               coalesce(p.display_name, split_part(p.email, '@', 1)),
               coalesce(e.paid_by, e.user_id) = v_user,
               CASE WHEN v_group IS NULL THEN g.name END,
               e.amount::text
        FROM group_expense.expenses e
        LEFT JOIN group_expense.expense_splits s ON s.expense_id = e.id AND s.user_id = v_user
        LEFT JOIN group_expense.groups g ON g.id = e.group_id
        LEFT JOIN group_expense.user_profiles p ON p.id = coalesce(e.paid_by, e.user_id)
        WHERE (v_group IS NULL AND e.group_id IS NULL AND e.user_id = v_user)
           OR (v_group IS NULL AND e.group_id IS NOT NULL AND s.amount > 0)
           OR (v_group IS NOT NULL AND e.group_id = v_group)
        ORDER BY e.date DESC, e.created_at DESC, e.id
        OFFSET greatest(p_offset, 0)
        LIMIT least(greatest(p_limit, 1), 21);

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END
$$;

-- 本月統計（取代 04 版）：個人帳本＝個人費用＋自己在群組費用的分攤；只計台幣。
CREATE OR REPLACE FUNCTION line_bot.month_summary(p_line_user_id text)
RETURNS TABLE (category text, this_month text, last_month text)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_user uuid;
    v_group uuid;
    v_this date := date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date;
    v_last date := (date_trunc('month', now() AT TIME ZONE 'Asia/Taipei') - interval '1 month')::date;
    v_next date := (date_trunc('month', now() AT TIME ZONE 'Asia/Taipei') + interval '1 month')::date;
BEGIN
    SELECT l.user_id, l.group_id INTO v_user, v_group FROM line_bot.current_ledger(p_line_user_id) l;
    IF v_user IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    RETURN QUERY
        WITH items AS (
            SELECT e.category, e.date,
                   CASE WHEN v_group IS NULL AND e.group_id IS NOT NULL THEN s.amount ELSE e.amount END AS amount
            FROM group_expense.expenses e
            LEFT JOIN group_expense.expense_splits s ON s.expense_id = e.id AND s.user_id = v_user
            WHERE ((v_group IS NULL AND e.group_id IS NULL AND e.user_id = v_user)
                OR (v_group IS NULL AND e.group_id IS NOT NULL AND s.amount > 0)
                OR (v_group IS NOT NULL AND e.group_id = v_group))
              AND coalesce(e.currency, 'TWD') = 'TWD'
              AND e.date >= v_last AND e.date < v_next
        )
        SELECT i.category,
               coalesce(sum(i.amount) FILTER (WHERE i.date >= v_this), 0)::text,
               coalesce(sum(i.amount) FILTER (WHERE i.date < v_this), 0)::text
        FROM items i
        GROUP BY i.category
        ORDER BY coalesce(sum(i.amount) FILTER (WHERE i.date >= v_this), 0) DESC, i.category;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END
$$;

REVOKE ALL ON FUNCTION line_bot.set_pending_category(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.create_draft(text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.get_draft(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.set_draft_ledger(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.set_draft_payer(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.set_draft_participants(text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.set_draft_date(text, uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.confirm_draft(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.recent_expenses(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.month_summary(text) FROM PUBLIC, anon, authenticated;

COMMIT;
