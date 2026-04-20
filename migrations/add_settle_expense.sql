-- Migration: settle_expense RPC for single-expense settlement
-- Schema: group_expense
-- Date: 2026-04-20
--
-- Adds an RPC that allows any active group member to settle one specific
-- expense in a single action. The function:
--   1. Validates that the expense belongs to a group and that the caller is
--      an active member of that group.
--   2. Creates a `settlements` row for every non-payer split (debtor → payer)
--      with amount = split.amount and year_month = to_char(expense.date, 'YYYY-MM').
--   3. Marks all related expense_splits as is_settled = true.
--   4. Marks the expense itself as is_settled = true.
--
-- Returns the number of settlement rows that were created. Returns 0 when the
-- expense is already settled (idempotent).

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
    v_settlement_count  integer := 0;
    v_split             record;
    v_year_month        text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_expense
    FROM group_expense.expenses
    WHERE id = p_expense_id;

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

    -- Idempotent: already settled → no-op
    IF v_expense.is_settled = true THEN
        RETURN 0;
    END IF;

    v_year_month := to_char(v_expense.date, 'YYYY-MM');

    FOR v_split IN
        SELECT es.user_id, es.amount
        FROM   group_expense.expense_splits es
        WHERE  es.expense_id = p_expense_id
          AND  es.is_settled = false
          AND  es.user_id   <> v_expense.paid_by
          AND  es.amount    > 0
    LOOP
        INSERT INTO group_expense.settlements (
            group_id, paid_by, paid_to, amount, notes, year_month
        ) VALUES (
            v_expense.group_id,
            v_split.user_id,
            v_expense.paid_by,
            v_split.amount,
            COALESCE(p_notes, 'Settled expense: ' || v_expense.title),
            v_year_month
        );

        v_settlement_count := v_settlement_count + 1;
    END LOOP;

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

GRANT EXECUTE ON FUNCTION group_expense.settle_expense(uuid, text) TO authenticated;
