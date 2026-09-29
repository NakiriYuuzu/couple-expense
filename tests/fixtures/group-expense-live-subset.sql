-- LINE Bot 測試用：正式環境 group_expense 中 Bot 會碰到的物件子集（v3-08 套用後，2026-09-29）。
-- 資料表欄位、private helper、add_group_expense、get_group_balances、get_simplified_debts、
-- get_my_group_ids、RLS policy 與 authenticated 權限皆取自正式環境 metadata。
-- 注意：正式版 add_group_expense 在 p_splits 為 NULL/空陣列時會自動均分；Bot 一律明確傳入 splits。

CREATE SCHEMA group_expense;

CREATE TABLE group_expense.groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_by uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_expense.group_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES group_expense.groups (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    role text DEFAULT 'member',
    is_active boolean DEFAULT true,
    joined_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (group_id, user_id)
);

CREATE TABLE group_expense.expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    group_id uuid REFERENCES group_expense.groups (id) ON DELETE SET NULL,
    title text NOT NULL,
    amount numeric NOT NULL,
    category text NOT NULL,
    icon text,
    date date NOT NULL DEFAULT CURRENT_DATE,
    currency text DEFAULT 'TWD',
    split_method text CHECK (split_method = ANY (ARRAY['equal', 'exact', 'percentage', 'shares'])),
    paid_by uuid,
    notes text,
    is_settled boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_expense.expense_splits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id uuid NOT NULL REFERENCES group_expense.expenses (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    percentage numeric,
    shares integer,
    is_settled boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE group_expense.user_profiles (
    id uuid PRIMARY KEY,
    email text,
    display_name text,
    avatar_url text,
    personal_monthly_budget numeric,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_expense.user_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    language text DEFAULT 'zh-TW',
    theme text DEFAULT 'system',
    show_in_statistics boolean DEFAULT true,
    notification_prefs jsonb DEFAULT '{"monthly_report": true, "split_assigned": true, "settlement_received": true}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_expense.settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES group_expense.groups (id) ON DELETE CASCADE,
    paid_by uuid NOT NULL,
    paid_to uuid NOT NULL,
    amount numeric NOT NULL,
    notes text,
    settled_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    year_month text,
    expense_id uuid REFERENCES group_expense.expenses (id)
);

CREATE SCHEMA private;

CREATE OR REPLACE FUNCTION private.assert_group_access(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.is_group_member(p_group_id uuid, p_roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM group_expense.group_members gm
        WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()
          AND gm.is_active = true
          AND (p_roles IS NULL OR gm.role = ANY(p_roles))
    );
$function$
;

CREATE OR REPLACE FUNCTION private.lock_group_ledger(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
    PERFORM private.assert_group_access(p_group_id);
    PERFORM 1 FROM group_expense.groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found';
    END IF;
    -- Membership can change while waiting for another transaction's group lock.
    PERFORM private.assert_group_access(p_group_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION private.validate_group_expense(p_group_id uuid, p_amount numeric, p_paid_by uuid, p_splits jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION group_expense.add_group_expense(p_group_id uuid, p_title text, p_amount numeric, p_category text, p_icon text DEFAULT NULL::text, p_date date DEFAULT CURRENT_DATE, p_currency text DEFAULT 'TWD'::text, p_split_method text DEFAULT 'equal'::text, p_paid_by uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_splits jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'group_expense'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION group_expense.get_group_balances(p_group_id uuid)
 RETURNS TABLE(user_id uuid, net_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'group_expense'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION group_expense.get_my_group_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'group_expense'
AS $function$
    SELECT group_id
    FROM group_expense.group_members
    WHERE user_id = auth.uid() AND is_active = true;
$function$
;

CREATE OR REPLACE FUNCTION group_expense.get_simplified_debts(p_group_id uuid)
 RETURNS TABLE(from_user uuid, to_user uuid, amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'group_expense'
AS $function$
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
$function$
;

ALTER TABLE group_expense.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY expense_splits_select_policy ON group_expense.expense_splits AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_expense.expenses e
  WHERE ((e.id = expense_splits.expense_id) AND private.is_group_member(e.group_id))))));
CREATE POLICY expenses_delete_policy ON group_expense.expenses AS PERMISSIVE FOR DELETE TO authenticated USING ((((group_id IS NULL) AND (user_id = auth.uid())) OR (private.is_group_member(group_id) AND ((user_id = auth.uid()) OR private.is_group_member(group_id, ARRAY['owner'::text, 'admin'::text])))));
CREATE POLICY expenses_insert_policy ON group_expense.expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (group_id IS NULL)));
CREATE POLICY expenses_select_policy ON group_expense.expenses AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR private.is_group_member(group_id)));
CREATE POLICY expenses_update_policy ON group_expense.expenses AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (group_id IS NULL))) WITH CHECK (((user_id = auth.uid()) AND (group_id IS NULL)));
CREATE POLICY group_members_select_policy ON group_expense.group_members AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_group_member(group_id));
CREATE POLICY groups_delete_policy ON group_expense.groups AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_group_member(id, ARRAY['owner'::text]));
CREATE POLICY groups_insert_policy ON group_expense.groups AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY groups_select_policy ON group_expense.groups AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_group_member(id));
CREATE POLICY groups_update_policy ON group_expense.groups AS PERMISSIVE FOR UPDATE TO authenticated USING (private.is_group_member(id, ARRAY['owner'::text]));
CREATE POLICY settlements_select_policy ON group_expense.settlements AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_group_member(group_id));
CREATE POLICY "Users can insert own profile" ON group_expense.user_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));
CREATE POLICY "Users can read own profile" ON group_expense.user_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((id = auth.uid()));
CREATE POLICY "Users can read profiles of group members" ON group_expense.user_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR (id IN ( SELECT gm.user_id
   FROM group_expense.group_members gm
  WHERE ((gm.group_id IN ( SELECT group_expense.get_my_group_ids() AS get_my_group_ids)) AND (gm.is_active = true))))));
CREATE POLICY "Users can update own profile" ON group_expense.user_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

GRANT USAGE ON SCHEMA group_expense TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON group_expense.expense_splits, group_expense.group_members, group_expense.settlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON group_expense.expenses, group_expense.groups, group_expense.user_profiles,
    group_expense.user_settings TO authenticated;
REVOKE ALL ON FUNCTION private.assert_group_access(uuid), private.lock_group_ledger(uuid),
    private.validate_group_expense(uuid, numeric, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_group_member(uuid, text[]), group_expense.get_my_group_ids(),
    group_expense.add_group_expense(uuid, text, numeric, text, text, date, text, text, uuid, text, jsonb),
    group_expense.get_group_balances(uuid), group_expense.get_simplified_debts(uuid) TO authenticated;
