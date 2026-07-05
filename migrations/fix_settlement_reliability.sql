-- fix_settlement_reliability.sql
-- 修正單筆結清與債務計算不可靠的四個根因：
--   1) settle_monthly_debt / settle_debt / update_settlement 缺少未清償上限驗證，
--      超額結清會把淨額推成反向債務。
--   2) 面板結清（settle_debt / settle_monthly_debt）不標記 expense_splits.is_settled，
--      之後對同筆費用按「單筆結清」時 settle_expense 會再插一次抵銷 → 雙重結清、餘額反轉。
--   3) settle_debt 的 year_month 以伺服器 UTC 月份 tag，跨月結清讓原月份永遠顯示未結清、
--      當月冒出幽靈反向債務；改以 Asia/Taipei 月份（對齊前端 currentYearMonth()）。
--   4) 已結清群組費用可被刪除，但其抵銷 settlements 無法連動移除，刪除後餘額反轉；
--      加 BEFORE DELETE 守衛禁止。
--
-- 已知限制（offset 模型固有）：部分結清後若再編輯費用把金額調低於已結清額，
-- 該月淨額仍可能出現反向；本次修正保證「結清操作本身」不會製造反向。

-- ─── 0. 保險機制：settlements.expense_id 關聯 + 同費用同付款人唯一索引 ───
-- 2026-06 實際事故：單筆結清後 is_settled 被其他路徑重置（疑 undo 復原），使用者再按一次
-- 單筆結清 → 同一費用插入兩筆抵銷（房租 10,000 × 2）→ 月淨額反轉。
-- 唯一索引在 DB 層硬性保證：不論任何前端/旗標狀態，同一費用對同一付款人只能有一筆結清。
ALTER TABLE group_expense.settlements
    ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES group_expense.expenses(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_settlements_expense_paid_by
    ON group_expense.settlements (expense_id, paid_by)
    WHERE expense_id IS NOT NULL;

-- ─── 1. settle_monthly_debt：上限驗證 + 歸零後標記 splits/expenses + Taipei 預設月份 ───
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

    -- 付款人該月淨額歸零 → 其該月 splits 視為已清償；自付 split（user = paid_by）本質已清償。
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

-- ─── 2. settle_debt：上限驗證 + 歸零後標記 + Taipei 月份 ───
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

-- ─── 3. settle_expense：逐位欠款人以該月淨欠額 clamp，防止與面板結清雙重抵銷 ───
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
    v_year_month        text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_expense
    FROM group_expense.expenses
    WHERE id = p_expense_id
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
    -- 才能依 paid_to 聚合推播。勿改為迴圈寫法。clamp 以 LEFT JOIN 取各欠款人月淨額
    -- （settlement 只影響 paid_by/paid_to 兩人的淨額，欠款人彼此互不影響，
    -- 與逐筆重算等價）。
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

-- ─── 4. update_settlement：編輯金額同樣受未清償上限約束 ───
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

-- ─── 5. get_group_balances：改回純抵銷模型（2026-07-05 線上稽核發現的漂移）───
-- 線上舊版是「旗標＋抵銷」混合模型：paid/owed 只算 is_settled=false 的費用，
-- 又同時計入全部 settlements → 單筆結清的費用被雙重計算，整體餘額灌水/反轉
-- （rouyuuzu 群組實測偏差 +3,197）。改回與 get_monthly_balances 一致的純抵銷模型
-- （即 schema.sql 的版本：費用/分帳全計、settlements 作抵銷、is_settled 僅供顯示）。
-- 定義同 schema.sql get_group_balances，此處不重複；套用時以 schema.sql 版本為準。

-- ─── 6. 禁止刪除已結清的群組費用 ───
CREATE OR REPLACE FUNCTION group_expense.prevent_settled_expense_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.group_id IS NOT NULL AND OLD.is_settled = true THEN
        RAISE EXCEPTION 'Cannot delete a settled group expense';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_settled_expense_delete ON group_expense.expenses;
CREATE TRIGGER trg_prevent_settled_expense_delete
    BEFORE DELETE ON group_expense.expenses
    FOR EACH ROW EXECUTE FUNCTION group_expense.prevent_settled_expense_delete();
