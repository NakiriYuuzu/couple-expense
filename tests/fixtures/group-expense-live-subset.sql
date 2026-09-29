-- LINE Bot 測試用：正式環境 group_expense 中 Bot 會碰到的物件子集。
-- 欄位、RLS policy、get_my_group_ids、add_group_expense、get_group_balances、get_simplified_debts
-- 取自正式環境 metadata（2026-09-29）。
-- 注意：正式版 add_group_expense 在 p_splits 為 NULL/空陣列時「不會」自動均分。

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

CREATE FUNCTION group_expense.get_my_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'group_expense'
AS $function$
    SELECT group_id
    FROM group_expense.group_members
    WHERE user_id = auth.uid() AND is_active = true;
$function$;

CREATE FUNCTION group_expense.add_group_expense(p_group_id uuid, p_title text, p_amount numeric, p_category text, p_icon text DEFAULT NULL::text, p_date date DEFAULT CURRENT_DATE, p_currency text DEFAULT 'TWD'::text, p_split_method text DEFAULT 'equal'::text, p_paid_by uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_splits jsonb DEFAULT '[]'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $function$
DECLARE
    v_user_id uuid;
    v_expense_id uuid;
    v_split jsonb;
    v_split_sum numeric;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = p_group_id AND user_id = v_user_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Not a member of this group';
    END IF;

    IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
        SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
        INTO v_split_sum
        FROM jsonb_array_elements(p_splits) AS elem;

        IF round(v_split_sum * 100) <> round(p_amount * 100) THEN
            RAISE EXCEPTION 'Split amounts (%) do not sum to expense amount (%)', v_split_sum, p_amount;
        END IF;
    END IF;

    INSERT INTO group_expense.expenses (
        user_id, group_id, title, amount, category, icon, date,
        currency, split_method, paid_by, notes
    ) VALUES (
        v_user_id, p_group_id, p_title, p_amount, p_category, p_icon, p_date,
        p_currency, p_split_method, COALESCE(p_paid_by, v_user_id), p_notes
    )
    RETURNING id INTO v_expense_id;

    FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits)
    LOOP
        INSERT INTO group_expense.expense_splits (
            expense_id, user_id, amount, percentage, shares
        ) VALUES (
            v_expense_id,
            (v_split->>'user_id')::uuid,
            (v_split->>'amount')::numeric,
            (v_split->>'percentage')::numeric,
            (v_split->>'shares')::integer
        );
    END LOOP;

    RETURN v_expense_id;
END;
$function$;

CREATE FUNCTION group_expense.get_group_balances(p_group_id uuid)
 RETURNS TABLE(user_id uuid, net_balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'group_expense'
AS $function$
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
        SELECT user_id, SUM(balance_change) AS net_settled
        FROM   settlement_changes
        GROUP  BY user_id
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
    ORDER BY   net_balance DESC;
$function$
;

CREATE FUNCTION group_expense.get_simplified_debts(p_group_id uuid)
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
    SELECT
        array_agg(gb.user_id ORDER BY gb.net_balance DESC),
        array_agg(gb.net_balance ORDER BY gb.net_balance DESC)
    INTO v_user_ids, v_balances
    FROM group_expense.get_group_balances(p_group_id) gb;

    IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
        RETURN;
    END IF;

    -- Pre-round each balance to integer before greedy pairing
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

CREATE POLICY "Authenticated users can create expenses" ON group_expense.expenses
    FOR INSERT TO authenticated
    WITH CHECK ((user_id = auth.uid()) AND ((group_id IS NULL) OR (group_id IN (SELECT group_expense.get_my_group_ids()))));
CREATE POLICY "Users can read own and group expenses" ON group_expense.expenses
    FOR SELECT TO authenticated
    USING ((user_id = auth.uid()) OR (group_id IN (SELECT group_expense.get_my_group_ids())));

ALTER TABLE group_expense.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read profiles of group members" ON group_expense.user_profiles
    FOR SELECT TO authenticated
    USING ((id = auth.uid()) OR (id IN ( SELECT gm.user_id
       FROM group_expense.group_members gm
      WHERE ((gm.group_id IN ( SELECT group_expense.get_my_group_ids() AS get_my_group_ids)) AND (gm.is_active = true)))));
CREATE POLICY "Members can see group members" ON group_expense.group_members
    FOR SELECT TO authenticated
    USING (group_id IN (SELECT group_expense.get_my_group_ids()));
CREATE POLICY "Members can read their groups" ON group_expense.groups
    FOR SELECT TO authenticated
    USING (id IN (SELECT group_expense.get_my_group_ids()));
CREATE POLICY "Group members can read settlements" ON group_expense.settlements
    FOR SELECT TO authenticated
    USING (group_id IN (SELECT group_expense.get_my_group_ids()));

GRANT USAGE ON SCHEMA group_expense TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA group_expense TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA group_expense TO authenticated;
