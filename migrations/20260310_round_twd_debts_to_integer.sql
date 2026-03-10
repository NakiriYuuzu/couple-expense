CREATE OR REPLACE FUNCTION public.get_simplified_debts(p_group_id uuid)
RETURNS TABLE(from_user uuid, to_user uuid, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
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
    FROM public.get_group_balances(p_group_id) gb;

    IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
        RETURN;
    END IF;

    LOOP
        v_ci := NULL;
        v_di := NULL;

        FOR i IN 1 .. array_length(v_user_ids, 1) LOOP
            IF v_balances[i] >= 0.5 THEN
                IF v_ci IS NULL OR v_balances[i] > v_balances[v_ci] THEN
                    v_ci := i;
                END IF;
            END IF;

            IF v_balances[i] <= -0.5 THEN
                IF v_di IS NULL OR v_balances[i] < v_balances[v_di] THEN
                    v_di := i;
                END IF;
            END IF;
        END LOOP;

        EXIT WHEN v_ci IS NULL OR v_di IS NULL;

        v_credit := v_balances[v_ci];
        v_debt := -v_balances[v_di];
        v_transfer := ROUND(LEAST(v_credit, v_debt), 0);

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
