-- Migration: Round TWD debt balances and settlement suggestions to whole dollars
-- Schema: group_expense
-- Date: 2026-03-11
--
-- This migration updates three RPC functions to output integer amounts for TWD:
-- 1. get_simplified_debts — rounds transfer suggestions to whole dollars
-- 2. get_monthly_simplified_debts — rounds monthly transfer suggestions to whole dollars
-- 3. get_monthly_balances — filters out balances that round to zero

-- =============================================================================
-- 1. get_simplified_debts: integer TWD transfer suggestions
-- =============================================================================
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
$$;

-- =============================================================================
-- 2. get_monthly_simplified_debts: integer TWD monthly transfer suggestions
-- =============================================================================
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

-- =============================================================================
-- 3. get_monthly_balances: filter out balances that round to zero
-- =============================================================================
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
