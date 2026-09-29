-- LINE Bot 圖文選單：最近紀錄、本月統計、誰欠誰。
-- 需先執行 line-bot-01～03。只新增 line_bot 函式，不修改 group_expense；可重複執行。
--
-- 查詢在函式內「以綁定的使用者身分」執行（SET LOCAL ROLE authenticated ＋ request.jwt.claims），
-- 所以只看得到該使用者在 App 裡本來就看得到的資料（既有 RLS）。

BEGIN;

-- 目前帳本；已不是有效成員或群組已停用時，視為個人帳（group_id NULL）。
CREATE OR REPLACE FUNCTION line_bot.current_ledger(p_line_user_id text)
RETURNS TABLE (user_id uuid, group_id uuid, name text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT i.user_id, g.id, g.name
    FROM line_bot.identities i
    LEFT JOIN group_expense.group_members gm
        ON gm.group_id = i.ledger_group_id AND gm.user_id = i.user_id AND gm.is_active = true
    LEFT JOIN group_expense.groups g
        ON g.id = gm.group_id AND g.is_active = true
    WHERE i.line_user_id = p_line_user_id
$$;

-- 目前帳本的紀錄，新到舊。個人帳 = 自己建立的個人支出；群組帳 = 該群組所有支出。
-- 後續 migration 會改變回傳欄位；先刪除，確保整串 migration 可依序重跑。
DROP FUNCTION IF EXISTS line_bot.recent_expenses(text, integer, integer);
CREATE FUNCTION line_bot.recent_expenses(p_line_user_id text, p_offset integer, p_limit integer)
RETURNS TABLE (
    title text, amount text, currency text, category text, expense_date text,
    payer_name text, paid_by_me boolean
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
        SELECT e.title, e.amount::text, coalesce(e.currency, 'TWD'), e.category, e.date::text,
               coalesce(p.display_name, split_part(p.email, '@', 1)),
               coalesce(e.paid_by, e.user_id) = v_user
        FROM group_expense.expenses e
        LEFT JOIN group_expense.user_profiles p ON p.id = coalesce(e.paid_by, e.user_id)
        WHERE (v_group IS NULL AND e.group_id IS NULL AND e.user_id = v_user)
           OR (v_group IS NOT NULL AND e.group_id = v_group)
        ORDER BY e.date DESC, e.created_at DESC, e.id
        OFFSET greatest(p_offset, 0)
        LIMIT least(greatest(p_limit, 1), 21);

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END
$$;

-- 本月與上月（台北時間）各分類的 TWD 支出。其他幣別不計入。
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
        SELECT e.category,
               coalesce(sum(e.amount) FILTER (WHERE e.date >= v_this), 0)::text,
               coalesce(sum(e.amount) FILTER (WHERE e.date < v_this), 0)::text
        FROM group_expense.expenses e
        WHERE ((v_group IS NULL AND e.group_id IS NULL AND e.user_id = v_user)
            OR (v_group IS NOT NULL AND e.group_id = v_group))
          AND coalesce(e.currency, 'TWD') = 'TWD'
          AND e.date >= v_last AND e.date < v_next
        GROUP BY e.category
        ORDER BY coalesce(sum(e.amount) FILTER (WHERE e.date >= v_this), 0) DESC, e.category;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END
$$;

-- 目前群組帳本的簡化欠款（沿用 App 的 get_simplified_debts）。個人帳回傳空集合。
-- get_simplified_debts 本身不檢查成員資格；這裡的群組已由 current_ledger 確認是有效成員。
CREATE OR REPLACE FUNCTION line_bot.ledger_debts(p_line_user_id text)
RETURNS TABLE (from_name text, to_name text, amount text, from_me boolean, to_me boolean)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_user uuid;
    v_group uuid;
BEGIN
    SELECT l.user_id, l.group_id INTO v_user, v_group FROM line_bot.current_ledger(p_line_user_id) l;
    IF v_user IS NULL OR v_group IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    RETURN QUERY
        SELECT coalesce(pf.display_name, split_part(pf.email, '@', 1)),
               coalesce(pt.display_name, split_part(pt.email, '@', 1)),
               d.amount::text,
               d.from_user = v_user,
               d.to_user = v_user
        FROM group_expense.get_simplified_debts(v_group) d
        LEFT JOIN group_expense.user_profiles pf ON pf.id = d.from_user
        LEFT JOIN group_expense.user_profiles pt ON pt.id = d.to_user;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END
$$;

REVOKE ALL ON FUNCTION line_bot.current_ledger(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.recent_expenses(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.month_summary(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION line_bot.ledger_debts(text) FROM PUBLIC, anon, authenticated;

COMMIT;
