-- LINE Bot 測試用：正式環境 group_expense 中 Bot 會碰到的物件子集。
-- 欄位、RLS policy、get_my_group_ids 與 add_group_expense 取自正式環境 metadata（2026-09-29）。
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

GRANT USAGE ON SCHEMA group_expense TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA group_expense TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA group_expense TO authenticated;
