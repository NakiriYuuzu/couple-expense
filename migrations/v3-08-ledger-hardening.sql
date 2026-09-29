-- v3-08: verified group access, validated splits, serialized financial RPCs.
-- Review live metadata and v3-08-ledger-hardening.md BEFORE applying.
-- Requires the reviewed v3 schema and fix_settlement_reliability.sql, including expense_id.
-- Does not migrate user data, repair historical balances, or change settlement reversal semantics.
-- Fresh definitions are mirrored in schema.sql; this migration is transactional and re-runnable.
BEGIN;

DO $preflight$
DECLARE
    v_table text;
    v_routines text[] := ARRAY[
        'join_group', 'leave_group', 'add_group_expense', 'get_group_balances',
        'get_simplified_debts', 'settle_debt', 'get_monthly_snapshots',
        'get_monthly_balances', 'get_monthly_simplified_debts', 'get_expense_months',
        'settle_monthly_debt', 'update_settlement', 'delete_settlement',
        'update_group_expense', 'settle_expense'
    ];
BEGIN
    FOREACH v_table IN ARRAY ARRAY['groups', 'group_members', 'group_settings', 'expenses', 'expense_splits', 'settlements', 'monthly_debt_snapshots'] LOOP
        IF to_regclass('group_expense.' || v_table) IS NULL THEN
            RAISE EXCEPTION 'Missing prerequisite table: group_expense.%', v_table;
        END IF;
    END LOOP;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='group_expense' AND table_name='settlements' AND column_name='expense_id'
    ) THEN
        RAISE EXCEPTION 'Missing settlement reliability prerequisite: expense_id';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles r, pg_class c
        WHERE r.rolname=current_user AND c.oid='group_expense.group_members'::regclass
          AND (r.rolsuper OR r.rolbypassrls OR (c.relowner=r.oid AND NOT c.relforcerowsecurity))
    ) THEN
        RAISE EXCEPTION 'Migration owner must bypass group_members RLS for the membership helper';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE ((n.nspname='group_expense' AND p.proname = ANY(v_routines))
            OR (n.nspname='private' AND p.proname IN (
                'generate_invitation_code', 'is_group_member', 'assert_group_access',
                'lock_group_ledger', 'validate_group_expense'
            )))
          AND p.proowner <> current_user::regrole
    ) THEN
        RAISE EXCEPTION 'Function owner drift: review RPC and helper owners before applying';
    END IF;
    IF EXISTS (
        SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='group_expense' AND p.proname = ANY(v_routines)
        GROUP BY p.proname HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'RPC overload drift: review function signatures before applying';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='group_expense' AND tablename IN ('groups', 'group_members', 'group_settings', 'expenses', 'expense_splits', 'settlements', 'monthly_debt_snapshots')
          AND (tablename, policyname) NOT IN (
              ('groups', 'groups_select_policy'),
              ('groups', 'groups_update_policy'),
              ('groups', 'groups_delete_policy'),
              ('groups', 'groups_insert_policy'),
              ('group_members', 'group_members_select_policy'),
              ('group_members', 'group_members_insert_policy'),
              ('group_members', 'group_members_update_policy'),
              ('group_members', 'group_members_delete_policy'),
              ('group_settings', 'group_settings_select_policy'),
              ('group_settings', 'group_settings_update_policy'),
              ('group_settings', 'group_settings_insert_policy'),
              ('expenses', 'expenses_select_policy'),
              ('expenses', 'expenses_insert_policy'),
              ('expenses', 'expenses_update_policy'),
              ('expenses', 'expenses_delete_policy'),
              ('expense_splits', 'expense_splits_select_policy'),
              ('expense_splits', 'expense_splits_insert_policy'),
              ('expense_splits', 'expense_splits_update_policy'),
              ('expense_splits', 'expense_splits_delete_policy'),
              ('settlements', 'settlements_select_policy'),
              ('settlements', 'settlements_insert_policy'),
              ('monthly_debt_snapshots', 'monthly_debt_snapshots_select_policy'),
              -- 2026-09-29 正式環境實際的 policy 名稱（已逐條核對，均由下方新 policy 取代）
              ('groups', 'Owner can delete group'),
              ('groups', 'Authenticated users can create groups'),
              ('groups', 'Members can read their groups'),
              ('groups', 'Owner can update group'),
              ('group_members', 'Members can leave or owner can remove'),
              ('group_members', 'Owner/admin can add members'),
              ('group_members', 'Members can see group members'),
              ('group_members', 'Owner/admin can update members'),
              ('group_settings', 'Owner can insert group settings'),
              ('group_settings', 'Members can read group settings'),
              ('group_settings', 'Owner/admin can update group settings'),
              ('expenses', 'Creator can delete own expenses'),
              ('expenses', 'Authenticated users can create expenses'),
              ('expenses', 'Users can read own and group expenses'),
              ('expenses', 'Creator can update own expenses'),
              ('expense_splits', 'Expense creator can delete splits'),
              ('expense_splits', 'Expense creator can manage splits'),
              ('expense_splits', 'Users can read splits for visible expenses'),
              ('expense_splits', 'Expense creator can update splits'),
              ('settlements', 'Group members can create settlements'),
              ('settlements', 'Group members can read settlements'),
              ('monthly_debt_snapshots', 'Group members can read snapshots')
          )
    ) THEN
        RAISE EXCEPTION 'Unexpected RLS policies: review live policies before applying';
    END IF;
END;
$preflight$;

-- 2026-09-29 正式環境沒有 private schema（schema.sql 快照才有），helper 需要它。
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION private.generate_invitation_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $$
    -- UUIDv4's first six bytes are random; retain the format without a pgcrypto schema dependency.
    SELECT upper(
        substring(
            replace(replace(encode(substring(uuid_send(gen_random_uuid()), 1, 6), 'base64'), '+', ''), '/', ''),
            1, 8
        )
    )
$$;

-- Authorization helpers (v3-08-ledger-hardening.sql)
-- ============================================================================

-- No caller-controlled user ID: policies only ask about the authenticated actor.
-- The owner must bypass group_members RLS to avoid recursive policy evaluation.
CREATE OR REPLACE FUNCTION private.is_group_member(p_group_id uuid, p_roles text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM group_expense.group_members gm
        WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()
          AND gm.is_active = true
          AND (p_roles IS NULL OR gm.role = ANY(p_roles))
    );
$$;

CREATE OR REPLACE FUNCTION private.assert_group_access(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
    -- Check the actual database role, not a caller-provided actor parameter.
    -- The second branch preserves trusted direct SQL/cron sessions without JWTs.
    IF current_setting('role', true) = 'service_role'
       OR (current_setting('role', true) = 'none'
           AND pg_has_role(session_user, 'service_role', 'USAGE'))
       OR private.is_group_member(p_group_id) THEN
        RETURN;
    END IF;
    RAISE EXCEPTION 'Caller is not an active member of the group' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION private.lock_group_ledger(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
    PERFORM private.assert_group_access(p_group_id);
    PERFORM 1 FROM group_expense.groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found';
    END IF;
    -- Membership can change while waiting for another transaction's group lock.
    PERFORM private.assert_group_access(p_group_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_group_expense(
    p_group_id uuid, p_amount numeric, p_paid_by uuid, p_splits jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_split jsonb;
    v_amount numeric;
    v_sum numeric;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 OR NOT (p_amount < 'Infinity'::numeric) THEN
        RAISE EXCEPTION 'Expense amount must be finite and greater than zero';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = p_group_id AND user_id = p_paid_by AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Payer is not an active member of the group';
    END IF;
    IF p_splits IS NULL THEN RETURN; END IF;
    IF jsonb_typeof(p_splits) <> 'array' THEN
        RAISE EXCEPTION 'p_splits must be a JSON array';
    END IF;
    IF jsonb_array_length(p_splits) = 0 THEN RETURN; END IF;

    FOR v_split IN SELECT jsonb_array_elements(p_splits) LOOP
        v_amount := (v_split->>'amount')::numeric;
        IF v_amount IS NULL OR v_amount < 0 OR NOT (v_amount < 'Infinity'::numeric) THEN
            RAISE EXCEPTION 'Split amount must be finite and non-negative';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM group_expense.group_members
            WHERE group_id = p_group_id AND user_id = (v_split->>'user_id')::uuid AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Split user is not an active member of the group';
        END IF;
    END LOOP;
    IF jsonb_array_length(p_splits) <> (
        SELECT count(DISTINCT (s->>'user_id')::uuid) FROM jsonb_array_elements(p_splits) s
    ) THEN
        RAISE EXCEPTION 'duplicate user_id in splits';
    END IF;
    SELECT sum((s->>'amount')::numeric) INTO v_sum FROM jsonb_array_elements(p_splits) s;
    -- Preserve the existing sum-then-round-once, cent-based contract.
    IF round(v_sum * 100) <> round(p_amount * 100) THEN
        RAISE EXCEPTION 'Split amounts (%) do not sum to expense amount (%)', v_sum, p_amount;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.is_group_member(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.assert_group_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.lock_group_ledger(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_group_expense(uuid, numeric, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_group_member(uuid, text[]) TO authenticated, service_role;

-- ============================================================================

ALTER TABLE group_expense.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.group_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.monthly_debt_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS groups_select_policy ON group_expense.groups;
DROP POLICY IF EXISTS groups_update_policy ON group_expense.groups;
DROP POLICY IF EXISTS groups_delete_policy ON group_expense.groups;
DROP POLICY IF EXISTS groups_insert_policy ON group_expense.groups;
DROP POLICY IF EXISTS group_members_select_policy ON group_expense.group_members;
DROP POLICY IF EXISTS group_members_insert_policy ON group_expense.group_members;
DROP POLICY IF EXISTS group_members_update_policy ON group_expense.group_members;
DROP POLICY IF EXISTS group_members_delete_policy ON group_expense.group_members;
DROP POLICY IF EXISTS group_settings_select_policy ON group_expense.group_settings;
DROP POLICY IF EXISTS group_settings_update_policy ON group_expense.group_settings;
DROP POLICY IF EXISTS group_settings_insert_policy ON group_expense.group_settings;
DROP POLICY IF EXISTS expenses_select_policy ON group_expense.expenses;
DROP POLICY IF EXISTS expenses_insert_policy ON group_expense.expenses;
DROP POLICY IF EXISTS expenses_update_policy ON group_expense.expenses;
DROP POLICY IF EXISTS expenses_delete_policy ON group_expense.expenses;
DROP POLICY IF EXISTS expense_splits_select_policy ON group_expense.expense_splits;
DROP POLICY IF EXISTS expense_splits_insert_policy ON group_expense.expense_splits;
DROP POLICY IF EXISTS expense_splits_update_policy ON group_expense.expense_splits;
DROP POLICY IF EXISTS expense_splits_delete_policy ON group_expense.expense_splits;
DROP POLICY IF EXISTS settlements_select_policy ON group_expense.settlements;
DROP POLICY IF EXISTS settlements_insert_policy ON group_expense.settlements;
DROP POLICY IF EXISTS monthly_debt_snapshots_select_policy ON group_expense.monthly_debt_snapshots;
-- 2026-09-29 正式環境使用描述性 policy 名稱；permissive policy 會以 OR 合併，
-- 不移除的話舊的寬鬆規則（例如允許直接新增群組費用）會讓下方收緊失效。
DROP POLICY IF EXISTS "Owner can delete group" ON group_expense.groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON group_expense.groups;
DROP POLICY IF EXISTS "Members can read their groups" ON group_expense.groups;
DROP POLICY IF EXISTS "Owner can update group" ON group_expense.groups;
DROP POLICY IF EXISTS "Members can leave or owner can remove" ON group_expense.group_members;
DROP POLICY IF EXISTS "Owner/admin can add members" ON group_expense.group_members;
DROP POLICY IF EXISTS "Members can see group members" ON group_expense.group_members;
DROP POLICY IF EXISTS "Owner/admin can update members" ON group_expense.group_members;
DROP POLICY IF EXISTS "Owner can insert group settings" ON group_expense.group_settings;
DROP POLICY IF EXISTS "Members can read group settings" ON group_expense.group_settings;
DROP POLICY IF EXISTS "Owner/admin can update group settings" ON group_expense.group_settings;
DROP POLICY IF EXISTS "Creator can delete own expenses" ON group_expense.expenses;
DROP POLICY IF EXISTS "Authenticated users can create expenses" ON group_expense.expenses;
DROP POLICY IF EXISTS "Users can read own and group expenses" ON group_expense.expenses;
DROP POLICY IF EXISTS "Creator can update own expenses" ON group_expense.expenses;
DROP POLICY IF EXISTS "Expense creator can delete splits" ON group_expense.expense_splits;
DROP POLICY IF EXISTS "Expense creator can manage splits" ON group_expense.expense_splits;
DROP POLICY IF EXISTS "Users can read splits for visible expenses" ON group_expense.expense_splits;
DROP POLICY IF EXISTS "Expense creator can update splits" ON group_expense.expense_splits;
DROP POLICY IF EXISTS "Group members can create settlements" ON group_expense.settlements;
DROP POLICY IF EXISTS "Group members can read settlements" ON group_expense.settlements;
DROP POLICY IF EXISTS "Group members can read snapshots" ON group_expense.monthly_debt_snapshots;

-- Explicit outer-table qualification; membership lookup cannot recurse through RLS.
CREATE POLICY groups_select_policy ON group_expense.groups
    FOR SELECT TO authenticated USING (private.is_group_member(groups.id));
CREATE POLICY groups_update_policy ON group_expense.groups
    FOR UPDATE TO authenticated USING (private.is_group_member(groups.id, ARRAY['owner']));
CREATE POLICY groups_delete_policy ON group_expense.groups
    FOR DELETE TO authenticated USING (private.is_group_member(groups.id, ARRAY['owner']));
CREATE POLICY groups_insert_policy ON group_expense.groups
    FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Membership mutations only via create_group/join_group/leave_group, never self-promotion.
CREATE POLICY group_members_select_policy ON group_expense.group_members
    FOR SELECT TO authenticated USING (private.is_group_member(group_members.group_id));
REVOKE INSERT, UPDATE, DELETE ON group_expense.group_members FROM PUBLIC, anon, authenticated;

CREATE POLICY group_settings_select_policy ON group_expense.group_settings
    FOR SELECT TO authenticated USING (private.is_group_member(group_settings.group_id));
CREATE POLICY group_settings_update_policy ON group_expense.group_settings
    FOR UPDATE TO authenticated
    USING (private.is_group_member(group_settings.group_id, ARRAY['owner', 'admin']))
    WITH CHECK (private.is_group_member(group_settings.group_id, ARRAY['owner', 'admin']));
CREATE POLICY group_settings_insert_policy ON group_expense.group_settings
    FOR INSERT TO authenticated WITH CHECK (private.is_group_member(group_settings.group_id, ARRAY['owner']));

CREATE POLICY expenses_select_policy ON group_expense.expenses
    FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_group_member(expenses.group_id));
-- Group writes must pass the atomic RPC validation; a personal row cannot be moved into a group.
CREATE POLICY expenses_insert_policy ON group_expense.expenses
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND group_id IS NULL);
CREATE POLICY expenses_update_policy ON group_expense.expenses
    FOR UPDATE TO authenticated USING (user_id = auth.uid() AND group_id IS NULL)
    WITH CHECK (user_id = auth.uid() AND group_id IS NULL);
CREATE POLICY expenses_delete_policy ON group_expense.expenses
    FOR DELETE TO authenticated USING (
        (group_id IS NULL AND user_id = auth.uid())
        OR (private.is_group_member(expenses.group_id)
            AND (user_id = auth.uid() OR private.is_group_member(expenses.group_id, ARRAY['owner', 'admin'])))
    );

CREATE POLICY expense_splits_select_policy ON group_expense.expense_splits
    FOR SELECT TO authenticated USING (
        user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM group_expense.expenses e
            WHERE e.id = expense_splits.expense_id AND private.is_group_member(e.group_id)
        )
    );
REVOKE INSERT, UPDATE, DELETE ON group_expense.expense_splits FROM PUBLIC, anon, authenticated;

CREATE POLICY settlements_select_policy ON group_expense.settlements
    FOR SELECT TO authenticated USING (private.is_group_member(settlements.group_id));
REVOKE INSERT, UPDATE, DELETE ON group_expense.settlements FROM PUBLIC, anon, authenticated;

ALTER TABLE group_expense.monthly_debt_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY monthly_debt_snapshots_select_policy ON group_expense.monthly_debt_snapshots
    FOR SELECT TO authenticated USING (private.is_group_member(monthly_debt_snapshots.group_id));


CREATE OR REPLACE FUNCTION group_expense.join_group(p_invitation_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_group_id    uuid;
    v_max_members integer;
    v_cur_members integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT id, max_members
    INTO   v_group_id, v_max_members
    FROM   group_expense.groups
    WHERE  invitation_code = p_invitation_code
      AND  is_active = true
    FOR UPDATE;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or inactive invitation code';
    END IF;

    IF EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = v_group_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You are already a member of this group';
    END IF;

    SELECT COUNT(*)
    INTO   v_cur_members
    FROM   group_expense.group_members
    WHERE  group_id = v_group_id AND is_active = true;

    IF v_cur_members >= v_max_members THEN
        RAISE EXCEPTION 'Group has reached its maximum member limit of %', v_max_members;
    END IF;

    INSERT INTO group_expense.group_members (group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'member');

    RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.leave_group(p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_caller_role   text;
    v_next_owner_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    PERFORM private.lock_group_ledger(p_group_id);
    SELECT role INTO v_caller_role
    FROM   group_expense.group_members
    WHERE  group_id = p_group_id AND user_id = auth.uid() AND is_active = true;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'You are not an active member of this group';
    END IF;

    IF v_caller_role = 'owner' THEN
        SELECT user_id INTO v_next_owner_id
        FROM   group_expense.group_members
        WHERE  group_id  = p_group_id
          AND  user_id  <> auth.uid()
          AND  is_active = true
        ORDER  BY joined_at ASC
        LIMIT  1;

        IF v_next_owner_id IS NOT NULL THEN
            UPDATE group_expense.group_members
            SET    role = 'owner'
            WHERE  group_id = p_group_id AND user_id = v_next_owner_id;
        ELSE
            UPDATE group_expense.groups
            SET    is_active = false, updated_at = now()
            WHERE  id = p_group_id;
        END IF;
    END IF;

    UPDATE group_expense.group_members
    SET    is_active = false
    WHERE  group_id = p_group_id AND user_id = auth.uid();

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.add_group_expense(
    p_group_id     uuid,
    p_title        text,
    p_amount       numeric,
    p_category     text,
    p_icon         text    DEFAULT NULL,
    p_date         date    DEFAULT CURRENT_DATE,
    p_currency     text    DEFAULT 'TWD',
    p_split_method text    DEFAULT 'equal',
    p_paid_by      uuid    DEFAULT NULL,
    p_notes        text    DEFAULT NULL,
    p_splits       jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_expense_id uuid;
    v_paid_by uuid;
    v_member_cnt integer;
    v_cents numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    PERFORM private.lock_group_ledger(p_group_id);
    v_paid_by := COALESCE(p_paid_by, auth.uid());
    PERFORM private.validate_group_expense(p_group_id, p_amount, v_paid_by, p_splits);
    IF (p_splits IS NULL OR jsonb_array_length(p_splits) = 0)
       AND p_split_method IS DISTINCT FROM 'equal' THEN
        RAISE EXCEPTION 'Explicit splits are required for a non-equal split method';
    END IF;

    INSERT INTO group_expense.expenses (
        user_id, title, amount, category, icon, date,
        group_id, currency, split_method, paid_by, notes
    )
    VALUES (
        auth.uid(), p_title, p_amount, p_category, p_icon, p_date,
        p_group_id, p_currency, p_split_method, v_paid_by, p_notes
    )
    RETURNING id INTO v_expense_id;

    IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
        INSERT INTO group_expense.expense_splits (expense_id, user_id, amount, percentage, shares)
        SELECT v_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric,
               (s->>'percentage')::numeric, (s->>'shares')::integer
        FROM jsonb_array_elements(p_splits) s;
    ELSE
        SELECT COUNT(*) INTO v_member_cnt
        FROM   group_expense.group_members
        WHERE  group_id = p_group_id AND is_active = true;

        v_cents := round(p_amount * 100);
        INSERT INTO group_expense.expense_splits (expense_id, user_id, amount, percentage, shares)
        SELECT v_expense_id, gm.user_id,
               (floor(v_cents / v_member_cnt)
                + CASE WHEN row_number() OVER (ORDER BY gm.joined_at, gm.user_id) <= mod(v_cents, v_member_cnt)
                       THEN 1 ELSE 0 END) / 100,
               round(100.0 / v_member_cnt, 4), 1
        FROM group_expense.group_members gm
        WHERE gm.group_id = p_group_id AND gm.is_active = true;
    END IF;

    RETURN v_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.get_group_balances(p_group_id uuid)
RETURNS TABLE(user_id uuid, net_balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
BEGIN
    PERFORM private.assert_group_access(p_group_id);
    RETURN QUERY
    WITH members AS (
        SELECT gm.user_id
        FROM   group_expense.group_members gm
        WHERE  gm.group_id = p_group_id
          AND  gm.is_active = true
    ),
    paid AS (
        SELECT e.paid_by AS user_id,
               COALESCE(SUM(e.amount), 0) AS total_paid
        FROM   group_expense.expenses e
        WHERE  e.group_id = p_group_id
        GROUP  BY e.paid_by
    ),
    owed AS (
        SELECT es.user_id,
               COALESCE(SUM(es.amount), 0) AS total_owed
        FROM   group_expense.expense_splits es
        JOIN   group_expense.expenses e ON e.id = es.expense_id
        WHERE  e.group_id = p_group_id
        GROUP  BY es.user_id
    ),
    settlement_changes AS (
        SELECT s.paid_by AS user_id,
               COALESCE(SUM(s.amount), 0) AS balance_change
        FROM   group_expense.settlements s
        WHERE  s.group_id = p_group_id
        GROUP  BY s.paid_by

        UNION ALL

        SELECT s.paid_to AS user_id,
               -COALESCE(SUM(s.amount), 0) AS balance_change
        FROM   group_expense.settlements s
        WHERE  s.group_id = p_group_id
        GROUP  BY s.paid_to
    ),
    settled_net AS (
        SELECT sc.user_id, SUM(sc.balance_change) AS net_settled
        FROM   settlement_changes sc
        GROUP  BY sc.user_id
    )
    SELECT
        m.user_id,
        ROUND(
            COALESCE(p.total_paid, 0)
            - COALESCE(o.total_owed, 0)
            + COALESCE(sn.net_settled, 0),
            2
        ) AS net_balance
    FROM       members m
    LEFT JOIN  paid p ON p.user_id = m.user_id
    LEFT JOIN  owed o ON o.user_id = m.user_id
    LEFT JOIN  settled_net sn ON sn.user_id = m.user_id
    ORDER BY   2 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.get_simplified_debts(p_group_id uuid)
RETURNS TABLE(from_user uuid, to_user uuid, amount numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_balances      numeric[];
    v_user_ids      uuid[];
    v_ci            integer;
    v_di            integer;
    v_credit        numeric;
    v_debt          numeric;
    v_transfer      numeric;
    i               integer;
BEGIN
    PERFORM private.assert_group_access(p_group_id);
    SELECT
        array_agg(gb.user_id ORDER BY gb.net_balance DESC),
        array_agg(gb.net_balance ORDER BY gb.net_balance DESC)
    INTO v_user_ids, v_balances
    FROM group_expense.get_group_balances(p_group_id) gb;

    IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
        RETURN;
    END IF;

    FOR i IN 1 .. array_length(v_balances, 1) LOOP
        v_balances[i] := ROUND(v_balances[i], 0);
    END LOOP;

    LOOP
        v_ci := NULL;
        v_di := NULL;

        FOR i IN 1 .. array_length(v_user_ids, 1) LOOP
            IF v_balances[i] >= 1 THEN
                IF v_ci IS NULL OR v_balances[i] > v_balances[v_ci] THEN
                    v_ci := i;
                END IF;
            END IF;

            IF v_balances[i] <= -1 THEN
                IF v_di IS NULL OR v_balances[i] < v_balances[v_di] THEN
                    v_di := i;
                END IF;
            END IF;
        END LOOP;

        EXIT WHEN v_ci IS NULL OR v_di IS NULL;

        v_credit := v_balances[v_ci];
        v_debt := -v_balances[v_di];
        v_transfer := LEAST(v_credit, v_debt);

        EXIT WHEN v_transfer < 1;

        from_user := v_user_ids[v_di];
        to_user := v_user_ids[v_ci];
        amount := v_transfer;
        RETURN NEXT;

        v_balances[v_ci] := v_balances[v_ci] - v_transfer;
        v_balances[v_di] := v_balances[v_di] + v_transfer;
    END LOOP;

    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.settle_debt(
    p_group_id uuid,
    p_paid_to  uuid,
    p_amount   numeric,
    p_notes    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_settlement_id uuid;
    v_debtor_owes numeric;
    v_creditor_due numeric;
    v_max numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be greater than zero';
    END IF;
    PERFORM private.lock_group_ledger(p_group_id);

    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = p_group_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Caller is not an active member of the group';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = p_group_id AND user_id = p_paid_to AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Recipient is not an active member of the group';
    END IF;

    SELECT GREATEST(0, -gb.net_balance) INTO v_debtor_owes
    FROM group_expense.get_group_balances(p_group_id) gb
    WHERE gb.user_id = auth.uid();

    SELECT GREATEST(0, gb.net_balance) INTO v_creditor_due
    FROM group_expense.get_group_balances(p_group_id) gb
    WHERE gb.user_id = p_paid_to;

    v_max := LEAST(COALESCE(v_debtor_owes, 0), COALESCE(v_creditor_due, 0));
    IF p_amount > v_max + 0.5 THEN
        RAISE EXCEPTION 'Settlement amount (%) exceeds outstanding debt (%)', p_amount, v_max;
    END IF;

    INSERT INTO group_expense.settlements (group_id, paid_by, paid_to, amount, notes, year_month)
    VALUES (
        p_group_id, auth.uid(), p_paid_to, p_amount, p_notes,
        to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM')
    )
    RETURNING id INTO v_settlement_id;

    SELECT GREATEST(0, -gb.net_balance) INTO v_debtor_owes
    FROM group_expense.get_group_balances(p_group_id) gb
    WHERE gb.user_id = auth.uid();

    IF COALESCE(v_debtor_owes, 0) < 0.5 THEN
        UPDATE group_expense.expense_splits es
        SET    is_settled = true
        FROM   group_expense.expenses e
        WHERE  es.expense_id = e.id
          AND  e.group_id = p_group_id
          AND  es.is_settled = false
          AND  (es.user_id = auth.uid() OR es.user_id = e.paid_by);

        UPDATE group_expense.expenses e
        SET    is_settled = true,
               updated_at = now()
        WHERE  e.group_id = p_group_id
          AND  e.is_settled = false
          AND  NOT EXISTS (
              SELECT 1 FROM group_expense.expense_splits es
              WHERE es.expense_id = e.id AND es.is_settled = false
          );
    END IF;

    RETURN v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.get_monthly_snapshots(p_group_id uuid)
RETURNS TABLE(
    id uuid,
    year_month text,
    snapshot_data jsonb,
    total_unsettled numeric,
    status text,
    created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
BEGIN
    PERFORM private.assert_group_access(p_group_id);
    RETURN QUERY
    SELECT
        mds.id,
        mds.year_month,
        mds.snapshot_data,
        mds.total_unsettled,
        mds.status,
        mds.created_at
    FROM group_expense.monthly_debt_snapshots mds
    WHERE mds.group_id = p_group_id
    ORDER BY mds.year_month DESC;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.get_monthly_balances(p_group_id uuid, p_year_month text)
RETURNS TABLE(user_id uuid, net_balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_start_date date;
    v_end_date date;
BEGIN
    PERFORM private.assert_group_access(p_group_id);
    v_start_date := (p_year_month || '-01')::date;
    v_end_date := (v_start_date + interval '1 month')::date;

    RETURN QUERY
    WITH expense_debits AS (
        SELECT
            es.user_id AS uid,
            -SUM(es.amount) AS balance_change
        FROM group_expense.expense_splits es
        JOIN group_expense.expenses e ON e.id = es.expense_id
        WHERE e.group_id = p_group_id
          AND e.date >= v_start_date
          AND e.date < v_end_date
        GROUP BY es.user_id
    ),
    expense_credits AS (
        SELECT
            e.paid_by AS uid,
            SUM(e.amount) AS balance_change
        FROM group_expense.expenses e
        WHERE e.group_id = p_group_id
          AND e.date >= v_start_date
          AND e.date < v_end_date
          AND e.paid_by IS NOT NULL
        GROUP BY e.paid_by
    ),
    settlement_credits AS (
        SELECT
            s.paid_by AS uid,
            SUM(s.amount) AS balance_change
        FROM group_expense.settlements s
        WHERE s.group_id = p_group_id
          AND s.year_month = p_year_month
        GROUP BY s.paid_by
    ),
    settlement_debits AS (
        SELECT
            s.paid_to AS uid,
            -SUM(s.amount) AS balance_change
        FROM group_expense.settlements s
        WHERE s.group_id = p_group_id
          AND s.year_month = p_year_month
        GROUP BY s.paid_to
    ),
    all_changes AS (
        SELECT * FROM expense_debits
        UNION ALL SELECT * FROM expense_credits
        UNION ALL SELECT * FROM settlement_credits
        UNION ALL SELECT * FROM settlement_debits
    )
    SELECT ac.uid, COALESCE(SUM(ac.balance_change), 0)::numeric
    FROM all_changes ac
    GROUP BY ac.uid
    HAVING ABS(SUM(ac.balance_change)) >= 0.5;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.get_monthly_simplified_debts(p_group_id uuid, p_year_month text)
RETURNS TABLE(from_user uuid, to_user uuid, amount numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_balances      record;
    v_debtors       numeric[];
    v_debtor_ids    uuid[];
    v_creditors     numeric[];
    v_creditor_ids  uuid[];
    v_i             integer;
    v_j             integer;
    v_payment       numeric;
BEGIN
    PERFORM private.assert_group_access(p_group_id);
    v_debtors := ARRAY[]::numeric[];
    v_debtor_ids := ARRAY[]::uuid[];
    v_creditors := ARRAY[]::numeric[];
    v_creditor_ids := ARRAY[]::uuid[];

    FOR v_balances IN
        SELECT mb.user_id, mb.net_balance
        FROM group_expense.get_monthly_balances(p_group_id, p_year_month) mb
    LOOP
        IF v_balances.net_balance <= -0.5 THEN
            v_debtors := array_append(v_debtors, ROUND(ABS(v_balances.net_balance), 0));
            v_debtor_ids := array_append(v_debtor_ids, v_balances.user_id);
        ELSIF v_balances.net_balance >= 0.5 THEN
            v_creditors := array_append(v_creditors, ROUND(v_balances.net_balance, 0));
            v_creditor_ids := array_append(v_creditor_ids, v_balances.user_id);
        END IF;
    END LOOP;

    v_i := 1;
    v_j := 1;
    WHILE v_i <= array_length(v_debtors, 1) AND v_j <= array_length(v_creditors, 1) LOOP
        v_payment := LEAST(v_debtors[v_i], v_creditors[v_j]);

        IF v_payment >= 1 THEN
            from_user := v_debtor_ids[v_i];
            to_user := v_creditor_ids[v_j];
            amount := v_payment;
            RETURN NEXT;
        END IF;

        v_debtors[v_i] := v_debtors[v_i] - v_payment;
        v_creditors[v_j] := v_creditors[v_j] - v_payment;

        IF v_debtors[v_i] < 1 THEN v_i := v_i + 1; END IF;
        IF v_creditors[v_j] < 1 THEN v_j := v_j + 1; END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.get_expense_months(p_group_id uuid)
RETURNS TABLE(year_month text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
BEGIN
    PERFORM private.assert_group_access(p_group_id);
    RETURN QUERY
    SELECT months.year_month
    FROM (
        SELECT DISTINCT to_char(e.date, 'YYYY-MM')::text AS year_month
        FROM group_expense.expenses e
        WHERE e.group_id = p_group_id
    ) months
    ORDER BY months.year_month DESC;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.settle_monthly_debt(
    p_group_id uuid,
    p_paid_to uuid,
    p_amount numeric,
    p_notes text DEFAULT NULL,
    p_year_month text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_settlement_id uuid;
    v_year_month text;
    v_start_date date;
    v_end_date date;
    v_debtor_owes numeric;
    v_creditor_due numeric;
    v_max numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be greater than zero';
    END IF;
    PERFORM private.lock_group_ledger(p_group_id);

    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = p_group_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Caller is not an active member of the group';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = p_group_id AND user_id = p_paid_to AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Recipient is not an active member of the group';
    END IF;

    v_year_month := COALESCE(p_year_month, to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM'));
    v_start_date := (v_year_month || '-01')::date;
    v_end_date := (v_start_date + interval '1 month')::date;

    -- 上限 = min(付款人該月淨欠額, 收款人該月淨應收額)；容差 0.5 吸收整數化捨入。
    SELECT GREATEST(0, -mb.net_balance) INTO v_debtor_owes
    FROM group_expense.get_monthly_balances(p_group_id, v_year_month) mb
    WHERE mb.user_id = auth.uid();

    SELECT GREATEST(0, mb.net_balance) INTO v_creditor_due
    FROM group_expense.get_monthly_balances(p_group_id, v_year_month) mb
    WHERE mb.user_id = p_paid_to;

    v_max := LEAST(COALESCE(v_debtor_owes, 0), COALESCE(v_creditor_due, 0));
    IF p_amount > v_max + 0.5 THEN
        RAISE EXCEPTION 'Settlement amount (%) exceeds outstanding debt (%)', p_amount, v_max;
    END IF;

    INSERT INTO group_expense.settlements (group_id, paid_by, paid_to, amount, notes, year_month)
    VALUES (p_group_id, auth.uid(), p_paid_to, p_amount, p_notes, v_year_month)
    RETURNING id INTO v_settlement_id;

    -- 付款人該月淨額歸零 → 其該月 splits 視為已清償；自付 split 本質已清償。
    -- 全部 splits 清償的費用同步標記 is_settled，讓單筆結清路徑不會再重複抵銷。
    SELECT GREATEST(0, -mb.net_balance) INTO v_debtor_owes
    FROM group_expense.get_monthly_balances(p_group_id, v_year_month) mb
    WHERE mb.user_id = auth.uid();

    IF COALESCE(v_debtor_owes, 0) < 0.5 THEN
        UPDATE group_expense.expense_splits es
        SET    is_settled = true
        FROM   group_expense.expenses e
        WHERE  es.expense_id = e.id
          AND  e.group_id = p_group_id
          AND  e.date >= v_start_date
          AND  e.date < v_end_date
          AND  es.is_settled = false
          AND  (es.user_id = auth.uid() OR es.user_id = e.paid_by);

        UPDATE group_expense.expenses e
        SET    is_settled = true,
               updated_at = now()
        WHERE  e.group_id = p_group_id
          AND  e.date >= v_start_date
          AND  e.date < v_end_date
          AND  e.is_settled = false
          AND  NOT EXISTS (
              SELECT 1 FROM group_expense.expense_splits es
              WHERE es.expense_id = e.id AND es.is_settled = false
          );
    END IF;

    RETURN v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.update_settlement(
    p_settlement_id uuid,
    p_amount numeric,
    p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_settlement group_expense.settlements%ROWTYPE;
    v_group_id uuid;
    v_debtor_owes numeric;
    v_creditor_due numeric;
    v_max numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be greater than zero';
    END IF;

    SELECT group_id INTO v_group_id FROM group_expense.settlements
    WHERE id = p_settlement_id AND paid_by = auth.uid();
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Settlement not found or not editable by caller';
    END IF;
    PERFORM private.lock_group_ledger(v_group_id);

    SELECT * INTO v_settlement
    FROM group_expense.settlements
    WHERE id = p_settlement_id
      AND paid_by = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found or not editable by caller';
    END IF;

    -- 目前月淨額已把舊金額計為抵銷，上限 = 目前未清償 + 舊金額。
    IF v_settlement.year_month IS NOT NULL THEN
        SELECT GREATEST(0, -mb.net_balance) INTO v_debtor_owes
        FROM group_expense.get_monthly_balances(v_settlement.group_id, v_settlement.year_month) mb
        WHERE mb.user_id = v_settlement.paid_by;

        SELECT GREATEST(0, mb.net_balance) INTO v_creditor_due
        FROM group_expense.get_monthly_balances(v_settlement.group_id, v_settlement.year_month) mb
        WHERE mb.user_id = v_settlement.paid_to;

        v_max := LEAST(COALESCE(v_debtor_owes, 0), COALESCE(v_creditor_due, 0)) + v_settlement.amount;
        IF p_amount > v_max + 0.5 THEN
            RAISE EXCEPTION 'Settlement amount (%) exceeds outstanding debt (%)', p_amount, v_max;
        END IF;
    END IF;

    UPDATE group_expense.settlements
    SET amount = p_amount,
        notes = p_notes
    WHERE id = p_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.delete_settlement(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_group_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT group_id INTO v_group_id FROM group_expense.settlements
    WHERE id = p_settlement_id AND paid_by = auth.uid();
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Settlement not found or not deletable by caller';
    END IF;
    PERFORM private.lock_group_ledger(v_group_id);

    DELETE FROM group_expense.settlements
    WHERE id = p_settlement_id
      AND paid_by = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found or not deletable by caller';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.update_group_expense(
    p_expense_id uuid,
    p_updates    jsonb,
    p_splits     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_expense group_expense.expenses%ROWTYPE;
    v_group_id uuid;
    v_amount numeric;
    v_paid_by uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT group_id INTO v_group_id FROM group_expense.expenses WHERE id = p_expense_id;
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Group expense not found';
    END IF;
    PERFORM private.lock_group_ledger(v_group_id);
    SELECT * INTO v_expense
    FROM group_expense.expenses
    WHERE id = p_expense_id AND group_id = v_group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found';
    END IF;

    IF v_expense.group_id IS NULL THEN
        RAISE EXCEPTION 'Cannot update a personal expense via update_group_expense';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = v_expense.group_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'You are not an active member of this group';
    END IF;

    IF v_expense.is_settled = true THEN
        RAISE EXCEPTION 'Cannot edit a settled expense';
    END IF;

    IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
        RAISE EXCEPTION 'p_splits must be a non-empty JSON array';
    END IF;

    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
        RAISE EXCEPTION 'p_updates must be a JSON object';
    END IF;
    v_amount := CASE WHEN (p_updates -> 'amount') IS NOT NULL
                     THEN (p_updates->>'amount')::numeric ELSE v_expense.amount END;
    v_paid_by := CASE WHEN (p_updates -> 'paid_by') IS NOT NULL
                      THEN (p_updates->>'paid_by')::uuid ELSE v_expense.paid_by END;
    PERFORM private.validate_group_expense(v_expense.group_id, v_amount, v_paid_by, p_splits);

    UPDATE group_expense.expenses SET
        amount       = v_amount,
        category     = CASE WHEN (p_updates -> 'category') IS NOT NULL
                            THEN (p_updates->>'category')::text     ELSE category END,
        title        = CASE WHEN (p_updates -> 'title') IS NOT NULL
                            THEN (p_updates->>'title')::text
                            WHEN (p_updates -> 'description') IS NOT NULL
                            THEN (p_updates->>'description')::text   ELSE title END,
        date         = CASE WHEN (p_updates -> 'date') IS NOT NULL
                            THEN (p_updates->>'date')::date          ELSE date END,
        paid_by      = CASE WHEN (p_updates -> 'paid_by') IS NOT NULL
                            THEN (p_updates->>'paid_by')::uuid       ELSE paid_by END,
        notes        = CASE WHEN (p_updates -> 'notes') IS NOT NULL
                            THEN (p_updates->>'notes')::text         ELSE notes END,
        currency     = CASE WHEN (p_updates -> 'currency') IS NOT NULL
                            THEN (p_updates->>'currency')::text      ELSE currency END,
        split_method = CASE WHEN (p_updates -> 'split_method') IS NOT NULL
                            THEN (p_updates->>'split_method')::text  ELSE split_method END,
        updated_at   = now()
    WHERE id = p_expense_id;

    DELETE FROM group_expense.expense_splits
    WHERE  expense_id = p_expense_id;

    INSERT INTO group_expense.expense_splits (expense_id, user_id, amount, percentage, shares)
    SELECT p_expense_id, (s->>'user_id')::uuid, (s->>'amount')::numeric,
           (s->>'percentage')::numeric, (s->>'shares')::integer
    FROM jsonb_array_elements(p_splits) s;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.settle_expense(
    p_expense_id uuid,
    p_notes      text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_expense           group_expense.expenses%ROWTYPE;
    v_group_id          uuid;
    v_settlement_count  integer := 0;
    v_year_month        text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT group_id INTO v_group_id FROM group_expense.expenses WHERE id = p_expense_id;
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Group expense not found';
    END IF;
    PERFORM private.lock_group_ledger(v_group_id);
    SELECT * INTO v_expense
    FROM group_expense.expenses
    WHERE id = p_expense_id AND group_id = v_group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found';
    END IF;

    IF v_expense.group_id IS NULL THEN
        RAISE EXCEPTION 'Cannot settle a personal expense';
    END IF;

    IF v_expense.paid_by IS NULL THEN
        RAISE EXCEPTION 'Expense has no payer';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = v_expense.group_id
          AND user_id  = auth.uid()
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'You are not an active member of this group';
    END IF;

    IF v_expense.is_settled = true THEN
        RETURN 0;
    END IF;

    v_year_month := to_char(v_expense.date, 'YYYY-MM');

    -- 逐位欠款人：抵銷金額 = min(split 金額, 該欠款人費用當月淨欠額)。
    -- 淨欠額已扣除既有 settlements（含面板結清），故不會雙重抵銷；
    -- 淨欠額歸零時只標記 is_settled、不再插列。
    --
    -- 保持集合式單一 statement（v3-06 通知聚合前提）：notify_settlement_received 是
    -- AFTER STATEMENT trigger + transition table，需在同一 statement 看到全部新列
    -- 才能依 paid_to 聚合推播。勿改為迴圈寫法。
    INSERT INTO group_expense.settlements (
        group_id, paid_by, paid_to, amount, notes, year_month, expense_id
    )
    SELECT
        v_expense.group_id,
        es.user_id,
        v_expense.paid_by,
        LEAST(es.amount, GREATEST(0, -COALESCE(mb.net_balance, 0))),
        COALESCE(p_notes, 'Settled expense: ' || v_expense.title),
        v_year_month,
        p_expense_id
    FROM   group_expense.expense_splits es
    LEFT JOIN group_expense.get_monthly_balances(v_expense.group_id, v_year_month) mb
           ON mb.user_id = es.user_id
    WHERE  es.expense_id = p_expense_id
      AND  es.is_settled = false
      AND  es.user_id   <> v_expense.paid_by
      AND  es.amount    > 0
      AND  LEAST(es.amount, GREATEST(0, -COALESCE(mb.net_balance, 0))) > 0;

    GET DIAGNOSTICS v_settlement_count = ROW_COUNT;

    UPDATE group_expense.expense_splits
    SET    is_settled = true
    WHERE  expense_id = p_expense_id;

    UPDATE group_expense.expenses
    SET    is_settled = true,
           updated_at = now()
    WHERE  id = p_expense_id;

    RETURN v_settlement_count;
END;
$$;

-- Explicitly remove inherited PUBLIC execution; granting service_role alone is not restrictive.
REVOKE ALL ON FUNCTION group_expense.get_send_push_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION group_expense.create_monthly_snapshot(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION group_expense.process_recurring_expenses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION group_expense.get_send_push_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION group_expense.create_monthly_snapshot(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION group_expense.process_recurring_expenses() TO service_role;

REVOKE EXECUTE ON FUNCTION group_expense.get_group_balances(uuid),
    group_expense.get_simplified_debts(uuid), group_expense.get_monthly_snapshots(uuid),
    group_expense.get_monthly_balances(uuid, text), group_expense.get_monthly_simplified_debts(uuid, text),
    group_expense.get_expense_months(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION group_expense.get_group_balances(uuid),
    group_expense.get_simplified_debts(uuid), group_expense.get_monthly_snapshots(uuid),
    group_expense.get_monthly_balances(uuid, text), group_expense.get_monthly_simplified_debts(uuid, text),
    group_expense.get_expense_months(uuid) TO authenticated, service_role;

COMMIT;
