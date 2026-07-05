-- Migration: v3-03 update_group_expense RPC（原子更新群組費用 + 重建 splits）
-- Schema: group_expense
-- Date: 2026-07-04
-- Phase: React 19 重寫 Phase 1（資料庫結構收斂・additive-only）
--
-- 鐵律：production 仍跑 Vue 版並共用同一個 Supabase 專案。
--       本檔僅「新增」一支 RPC（CREATE OR REPLACE 新函式），不動既有 add_group_expense
--       與任何表結構，重跑安全。
--
-- 用途：群組費用「編輯」的原子操作，補齊 add_group_expense（新增）的對稱面。
--       單一 transaction 內：UPDATE expense（白名單欄位）→ DELETE 舊 splits →
--       INSERT 新 splits → 整數分守恆斷言（比照 P1-A add_group_expense 的斷言寫法）。
--
-- 安全：SECURITY DEFINER + SET search_path；呼叫者必須是該 expense 所屬群組的 active
--       member（比照 add_group_expense 的 membership 檢查）。
--
-- 參數：
--   p_expense_id uuid   目標費用
--   p_updates    jsonb  欲更新的欄位（白名單，見下）；只認得的 key 生效，其餘忽略。
--                       白名單 → expenses 實體欄位對映：
--                         amount        → amount        (numeric)
--                         category      → category      (text)
--                         title         → title         (text)   ← DB 欄位為 title
--                         description   → title         (text)   ← React 前端語意別名，映射到 title
--                         date          → date          (date)
--                         paid_by       → paid_by       (uuid)
--                         notes         → notes         (text，可設為 null)
--                         currency      → currency      (text)
--                         split_method  → split_method  (text)
--                       採 `(p_updates -> 'key') IS NOT NULL` 判斷「key 是否存在」再決定
--                       是否覆寫（placeholder-safe，等價於 jsonb `?` 運算子）；
--                       故可將 nullable 欄位（notes/paid_by）明確設為 null（傳 JSON null）。
--   p_splits     jsonb  新的 splits 陣列 [{user_id, amount, percentage?, shares?}, ...]
--                       必填且非空；守恆斷言以此對「更新後的 amount」做整數分比對。
--
-- 設計取捨（見 Report）：
--   - 僅支援 group 費用（group_id NOT NULL）；個人費用無 splits，走一般 UPDATE。
--   - 若 expense 已 is_settled 則拒絕編輯（改寫 splits 會與已產生的 settlements 脫鉤）。
--   - p_splits 必填非空：本 RPC 語意為「原子重建」，metadata-only 更新亦須帶入現行 splits。

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
    v_expense    group_expense.expenses%ROWTYPE;
    v_amount     numeric;
    v_split_sum  numeric;
    v_split      jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 讀取目標費用並取 FOR UPDATE 列鎖（鎖序：expense 列先行）。
    -- 本函式端：鎖住此 expense 列，確保「讀 is_settled → 重建 splits」期間狀態不被他人變更。
    -- ⚠ 完整的雙向併發保護需「兩檔一併套用」：production Vue 版仍在呼叫的 settle_expense
    --   原始定義（migrations/add_settle_expense.sql）初始讀取為無鎖 SELECT，且鎖序相反
    --   （splits→expense：先 UPDATE expense_splits 再 UPDATE expenses）。僅本函式加鎖只閉合單邊；
    --   另一邊的 TOCTOU 窗口與相反鎖序死鎖風險（40P01），須由 migrations/v3-04-hardening.sql §④
    --   （將 settle_expense 初始讀取同樣改為 FOR UPDATE、統一為 expense→splits 鎖序）一併消除。
    --   兩檔關聯詳見 v3-04 §④。
    SELECT * INTO v_expense
    FROM   group_expense.expenses
    WHERE  id = p_expense_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found';
    END IF;

    IF v_expense.group_id IS NULL THEN
        RAISE EXCEPTION 'Cannot update a personal expense via update_group_expense';
    END IF;

    -- membership 檢查（比照 add_group_expense）
    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = v_expense.group_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'You are not an active member of this group';
    END IF;

    -- 已結算的費用不可編輯（避免與既有 settlements 脫鉤）
    IF v_expense.is_settled = true THEN
        RAISE EXCEPTION 'Cannot edit a settled expense';
    END IF;

    -- p_splits 必填非空
    IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
        RAISE EXCEPTION 'p_splits must be a non-empty JSON array';
    END IF;

    -- 更新後的有效 amount（守恆斷言與 UPDATE 皆以此為準）
    -- 注意：傳入 JSON null（{"amount":null}）時 (p_updates -> 'amount') IS NOT NULL 為 true，
    --       但 (p_updates->>'amount')::numeric 會得到 SQL NULL，須顯式擋下（見下方斷言），
    --       否則 round(NULL) 讓守恆斷言以 NULL 比對而被繞過。
    v_amount := CASE WHEN (p_updates -> 'amount') IS NOT NULL
                     THEN (p_updates->>'amount')::numeric
                     ELSE v_expense.amount END;

    -- amount 不可為 null（擋下 JSON null 繞過守恆斷言）
    IF v_amount IS NULL THEN
        RAISE EXCEPTION 'amount cannot be null';
    END IF;

    -- 逐元素驗證 split amount 非 null（SUM 會忽略 NULL：若不前置檢查，個別 null / 缺 key 的
    -- amount 會被 SUM 靜默跳過而仍可能通過守恆斷言。此檢查讓斷言不再依賴 expense_splits.amount
    -- NOT NULL 當 backstop——null 在此即攔下，而非等 INSERT 時才炸）。
    FOR v_split IN SELECT jsonb_array_elements(p_splits) LOOP
        IF (v_split -> 'amount') IS NULL OR jsonb_typeof(v_split -> 'amount') = 'null' THEN
            RAISE EXCEPTION 'split amount cannot be null';
        END IF;
    END LOOP;

    -- 整數分守恆斷言（比照 P1-A add_group_expense：round(x*100) 做整數分比對）
    SELECT COALESCE(SUM((elem->>'amount')::numeric), 0) INTO v_split_sum
    FROM   jsonb_array_elements(p_splits) AS elem;

    IF round(v_split_sum * 100) <> round(v_amount * 100) THEN
        RAISE EXCEPTION 'Split amounts (%) do not sum to expense amount (%)', v_split_sum, v_amount;
    END IF;

    -- UPDATE expense：僅白名單欄位；`(p_updates -> key) IS NOT NULL` 決定是否覆寫
    -- （未帶 key 保留原值；帶 key 且值為 JSON null → 覆寫成 SQL NULL）
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

    -- 重建 splits：先刪後插（單一 transaction，守恆已在上方保證）
    DELETE FROM group_expense.expense_splits
    WHERE  expense_id = p_expense_id;

    -- 先驗證 p_splits 的 user_id 唯一性：已 DELETE 全部舊列，重建應為「純 INSERT」，
    -- 任何 (expense_id, user_id) 衝突只可能來自「輸入端重複 user_id」，此時應炸而非靜默合併。
    -- （若走 ON CONFLICT DO UPDATE，重複 user_id 會被最後一筆覆寫、金額被吞掉且仍通過守恆斷言）
    --
    -- 逐元素先驗 user_id：非 null 且可 cast 成 uuid。null / 缺 key → 明確報錯（不讓 ::uuid 拋
    -- 通用 cast 錯誤）；非 uuid 文字則由下方 PERFORM 的 ::uuid cast 自然 RAISE。
    FOR v_split IN SELECT jsonb_array_elements(p_splits) LOOP
        IF (v_split -> 'user_id') IS NULL OR jsonb_typeof(v_split -> 'user_id') = 'null' THEN
            RAISE EXCEPTION 'user_id cannot be null in splits';
        END IF;
        PERFORM (v_split->>'user_id')::uuid;
    END LOOP;

    -- 唯一性以 ::uuid 為比較單位（大小寫變體 / 格式差異的同一 UUID 不再漏檢；先前以 text
    -- ->>'user_id' 比較會把同一 UUID 的不同表示視為相異而漏掉重複——uuid 型別會正規化為小寫）。
    IF (
        SELECT COUNT(*) FROM jsonb_array_elements(p_splits) AS elem
    ) <> (
        SELECT COUNT(DISTINCT (elem->>'user_id')::uuid) FROM jsonb_array_elements(p_splits) AS elem
    ) THEN
        RAISE EXCEPTION 'duplicate user_id in splits';
    END IF;

    -- 純 INSERT（不帶 ON CONFLICT）：已先 DELETE 全部舊列且 user_id 已驗證唯一，
    -- 任何 UNIQUE(expense_id, user_id) 衝突都是輸入錯誤，應由資料庫 RAISE 而非吞掉。
    -- NOTE（cutover 前另行評估）：既有 group_expense.add_group_expense 的 explicit-splits 分支
    --   仍用相同的 ON CONFLICT (expense_id, user_id) DO UPDATE 模式，同樣會靜默合併重複 user_id。
    --   該修正不在本檔 additive 範圍內；建議 cutover 前一併評估修正（可列入 v3-99 註解清單）。
    FOR v_split IN SELECT jsonb_array_elements(p_splits) LOOP
        INSERT INTO group_expense.expense_splits (
            expense_id, user_id, amount, percentage, shares
        )
        VALUES (
            p_expense_id,
            (v_split->>'user_id')::uuid,
            (v_split->>'amount')::numeric,
            (v_split->>'percentage')::numeric,
            (v_split->>'shares')::integer
        );
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION group_expense.update_group_expense(uuid, jsonb, jsonb) TO authenticated;


-- == 驗證 SQL ================================================================
-- (a) 函式存在 + proconfig 含 search_path（mutable search_path 驗證）
-- SELECT proname, prosecdef, proconfig
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'group_expense' AND p.proname = 'update_group_expense';
--   -- 期望：prosecdef = true（SECURITY DEFINER）、proconfig 含 search_path=group_expense

-- (b) EXECUTE 授權給 authenticated
-- SELECT grantee, privilege_type
-- FROM   information_schema.role_routine_grants
-- WHERE  routine_schema = 'group_expense' AND routine_name = 'update_group_expense';

-- (c) 守恆斷言測試——以「不守恆」splits 呼叫應 RAISE EXCEPTION（守恆斷言生效）。
--     須帶真實 expense_id / group 成員 user_id；故以註解形式提供避免誤跑。
--     amount=100，但 splits 合計 90 → 應 RAISE 'Split amounts (90) do not sum to expense amount (100)'
-- SELECT group_expense.update_group_expense(
--     '<GROUP_EXPENSE_ID>'::uuid,
--     '{"amount":100}'::jsonb,
--     '[{"user_id":"<MEMBER_A>","amount":50},{"user_id":"<MEMBER_B>","amount":40}]'::jsonb
-- );
--
--     對照組（守恆成立，應成功）：splits 合計 100 = amount 100
-- SELECT group_expense.update_group_expense(
--     '<GROUP_EXPENSE_ID>'::uuid,
--     '{"amount":100}'::jsonb,
--     '[{"user_id":"<MEMBER_A>","amount":50},{"user_id":"<MEMBER_B>","amount":50}]'::jsonb
-- );

-- (d) 重複 user_id 防呆——p_splits 帶重複 user_id 應 RAISE 'duplicate user_id in splits'
--     （不再靜默合併）。下例 amount=100、同一 MEMBER_A 兩筆各 50（合計守恆但 user_id 重複），
--     應在唯一性驗證處 RAISE 'duplicate user_id in splits'。以註解形式提供避免誤跑。
-- SELECT group_expense.update_group_expense(
--     '<GROUP_EXPENSE_ID>'::uuid,
--     '{"amount":100}'::jsonb,
--     '[{"user_id":"<MEMBER_A>","amount":50},{"user_id":"<MEMBER_A>","amount":50}]'::jsonb
-- );
