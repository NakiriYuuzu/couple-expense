-- Migration: v3-04 hardening（search_path 收斂 + REVOKE 遺留 public 函式 + recurring RLS 現況報告）
-- Schema: group_expense / public
-- Date: 2026-07-04
-- Phase: React 19 重寫 Phase 1（資料庫收斂・hardening；本檔非純 additive）
--
-- ⚠ 誠實定性：本檔與其他 v3-* 不同——它做的是「收緊 / hardening」，不是純新增（additive）。
--       它是整個 Phase 1 **唯一可能影響線上（Vue 版）行為** 的檔案，因此不可一次整檔盲跑，
--       必須逐段閘門式（gated）套用：每段先跑檔尾對應驗證 SQL 確認現況與回歸風險，確認安全後
--       才執行下一段。
--       ① 為既有函式補 SET search_path（僅設定屬性，不改函式邏輯；但仍可能改變函式體內未限定
--          物件的解析結果，故列為需驗證段）
--       ② REVOKE 遺留 public 函式對 anon/authenticated 的 EXECUTE（不 DROP）
--       ③ recurring_expenses RLS：本檔只做「現況報告 + 建議」，**不** 實際 ENABLE RLS / CREATE POLICY
--          （在此表冒然啟用 RLS 可能使 cron 週期費用產生「靜默停擺」，見 §③ 大字警語）
--       ④ settle_expense 併發加固 + 通知聚合前提：CREATE OR REPLACE 為初始 expense 讀取補
--          FOR UPDATE，統一鎖序（expense→splits）以對齊 v3-03 update_group_expense，閉合雙向
--          TOCTOU + 消死鎖；並將 settlements 的產生從逐列 INSERT 改為單一 INSERT ... SELECT
--          （語意等價，見 §④ 內文），使 v3-06 的 AFTER STATEMENT trigger 能在單一 statement
--          內取得完整 transition table（原逐列 INSERT 每列各自一個 statement，STATEMENT-level
--          trigger 聚合形同虛設）
--       ①② 以 DO block / 動態 SQL 條件式執行，重跑安全（idempotent）；③ 為純註解 / 報告；
--       ④ 以 CREATE OR REPLACE 覆寫既有函式，天然可重跑（idempotent）。
--
-- 依據：docs/post-audit-backend-todos.md「get_advisors 揭露的既有問題」清單。

-- ============================================================================
-- ① mutable search_path → 補 SET search_path
-- ----------------------------------------------------------------------------
-- 對象（以 post-audit-backend-todos.md 清單為準）：
--   process_recurring_expenses、update_updated_at_column、get_monthly_snapshots、
--   settle_monthly_debt、get_expense_months、create_monthly_snapshot
--
-- 作法：用 pg_get_function_identity_arguments 取每支函式的實際簽章（避免猜參數型別、
--       並涵蓋 overload），逐支 `ALTER FUNCTION ... SET search_path = group_expense, public`。
--       只設定屬性、不改函式體，對既有行為無破壞。查無該函式則略過（idempotent）。
--
-- search_path 值取 `group_expense, public`（superset）：既有已收斂函式（settle_expense、
-- get_simplified_debts）用單一 'group_expense' 即可運作，代表這些函式的表引用皆為
-- fully-qualified；此處採 group_expense+public 的較寬集合，確保就算函式體有未限定的
-- public 物件引用也不致失效，同時仍關閉 mutable search_path advisory。
-- （需 live DB 驗證：實際函式體是否有依賴 auth 等其他 schema 的未限定引用。）
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.proname,
               pg_get_function_identity_arguments(p.oid) AS args
        FROM   pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'group_expense'
          AND  p.proname IN (
                'process_recurring_expenses',
                'update_updated_at_column',
                'get_monthly_snapshots',
                'settle_monthly_debt',
                'get_expense_months',
                'create_monthly_snapshot'
          )
    LOOP
        EXECUTE format(
            'ALTER FUNCTION group_expense.%I(%s) SET search_path = group_expense, public',
            r.proname, r.args
        );
        RAISE NOTICE 'search_path pinned: group_expense.%(%)', r.proname, r.args;
    END LOOP;
END $$;

-- ============================================================================
-- ② REVOKE EXECUTE ON public.create_couple / public.join_couple FROM anon, authenticated
-- ----------------------------------------------------------------------------
-- ⚠ 前置確認（套用前必做）：這是 couple→family 遷移殘留的 public schema SECURITY DEFINER
--   函式，匿名可經 /rest/v1/rpc/* 呼叫。REVOKE 前須先確認「30 天內無呼叫記錄」——
--   查 Supabase Logs / pg_stat_statements / API logs 中 create_couple、join_couple 的
--   呼叫次數為 0，再套用本段。若有呼叫代表仍有客戶端在用，須先停用該路徑。
--
-- 作法：不 DROP（破壞性，留待 Phase 10 cutover 清理）——僅 REVOKE EXECUTE。
--       動態抓實際簽章，查無則略過（idempotent；REVOKE 重跑無害）。
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.proname,
               pg_get_function_identity_arguments(p.oid) AS args
        FROM   pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public'
          AND  p.proname IN ('create_couple', 'join_couple')
    LOOP
        -- 含 PUBLIC：函式建立時的預設 =X（PUBLIC EXECUTE）會讓 anon/authenticated 經
        -- PUBLIC 繼承執行——只 REVOKE FROM anon, authenticated 不足（2026-07-05 live 套用
        -- 後由 get_advisors 證實，據此補上 PUBLIC）。
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
            r.proname, r.args
        );
        RAISE NOTICE 'revoked EXECUTE: public.%(%) FROM PUBLIC, anon, authenticated', r.proname, r.args;
    END LOOP;
END $$;

-- ============================================================================
-- ③ recurring_expenses RLS：現況報告 + 建議（REPORT-ONLY，本段不執行任何 DDL）
-- ----------------------------------------------------------------------------
-- 背景：schema.sql 註明 recurring_expenses 的 RLS policy「live 在 server 端、repo 內不明」，
--       且 recurring.ts fetchAll 為 bare `.select('*')` 完全依賴 RLS 分列。屬評估報告 P2。
--
-- 為何降級為 report-only（不再由本檔自動 ENABLE RLS / CREATE POLICY）：
--       process_recurring_expenses() 由 cron（service_role，auth.uid() 為 NULL）呼叫產生週期費用。
--       若在此表冒然啟用 RLS 並掛上 own-rows（user_id = auth.uid()）policy，一旦「owner bypass RLS」
--       前提不成立，該函式的 SELECT/INSERT 會被 policy（user_id = NULL）全數擋下 → 週期費用產生會
--       「靜默停擺」（無錯誤、無資料）。此風險不該由一支批次 migration 盲目承擔，故本段只輸出
--       現況檢查 SQL 與建議 policy，交由人工於 live DB 逐項確認後再「手動」啟用。
--
-- ****************************************************************************
-- ⚠⚠⚠  啟用 RLS 前的硬前提（務必逐項在 live DB 確認，否則週期費用會靜默停擺）  ⚠⚠⚠
--   process_recurring_expenses() 為 SECURITY DEFINER，且被 cron 以 auth.uid() = NULL 執行。
--   它「不被 RLS 擋」只在下列「owner bypass RLS」前提 **全部成立** 時才成立：
--     1. recurring_expenses 的表 owner 未設 FORCE ROW LEVEL SECURITY（relforcerowsecurity = false）
--        ——否則連 owner 也要套 policy，SECURITY DEFINER 也救不了。
--     2. 表 owner 與 process_recurring_expenses() 的 definer（函式 owner）對齊，
--        使函式以「表 owner 身分」存取時能 bypass RLS。
--   兩者任一不成立就 **絕不可** 在此表 ENABLE RLS，否則 cron 產生週期費用會在無錯誤下停擺。
-- ****************************************************************************
--
-- 建議 policy（★全註解，本檔不執行；經上述前提確認後由人工套用★）
--   語意需涵蓋「群組共享」：自己的列，或自己仍是該 recurring 所屬群組 active 成員的列。
--   （group_members 欄位以 schema.sql 為準：group_id / user_id / is_active）
-- -- ALTER TABLE group_expense.recurring_expenses ENABLE ROW LEVEL SECURITY;
-- --
-- -- CREATE POLICY recurring_expenses_select ON group_expense.recurring_expenses
-- --     FOR SELECT USING (
-- --         user_id = auth.uid()
-- --         OR EXISTS (
-- --             SELECT 1 FROM group_expense.group_members gm
-- --             WHERE gm.group_id = recurring_expenses.group_id
-- --               AND gm.user_id = auth.uid()
-- --               AND gm.is_active
-- --         )
-- --     );
-- --   INSERT / UPDATE / DELETE 建議仍收斂為「僅本人」（避免他人改寫共享 recurring）：
-- --     WITH CHECK / USING (user_id = auth.uid())
-- --   若產品決策要允許群組成員共同維護，再把寫入 policy 放寬為與上方 SELECT 相同的群組條件。
--
-- 套用前現況檢查（★全註解；先於 SQL Editor 逐段跑、人工判讀後再決定是否手動啟用★；
--   另同時參考檔尾 (d)/(e)：policy 清單 + relrowsecurity 是否啟用）：
--
-- (③-i) 是否已有任何 policy（有 → 代表 server 端已治理，勿再自行加）
-- SELECT policyname, cmd, qual, with_check
-- FROM   pg_policies
-- WHERE  schemaname = 'group_expense' AND tablename = 'recurring_expenses'
-- ORDER  BY policyname;
--
-- (③-ii) RLS 啟用狀態 + FORCE 狀態 + 表 owner
--        （relforcerowsecurity 必須為 false，才符合 owner bypass RLS 前提 1）
-- SELECT c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS table_owner
-- FROM   pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE  n.nspname = 'group_expense' AND c.relname = 'recurring_expenses';
--
-- (③-iii) process_recurring_expenses 的 owner 與 SECURITY DEFINER 屬性
--         （prosecdef 應為 true；proowner 應與上方 table_owner 對齊，才成立 owner bypass RLS 前提 2）
-- SELECT p.proname, p.prosecdef, pg_get_userbyid(p.proowner) AS function_owner
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'group_expense' AND p.proname = 'process_recurring_expenses';


-- ============================================================================
-- ④ settle_expense 併發加固 + 通知聚合前提（初始 expense 讀取補 FOR UPDATE，統一鎖序；
--    settlements 產生方式改為集合式 INSERT，供 v3-06 STATEMENT trigger 聚合）
-- ----------------------------------------------------------------------------
-- 背景①（鎖序 / 死鎖）：v3-03 的 update_group_expense 對 expense 列先取 FOR UPDATE（鎖序
--       expense→splits），但 production Vue 版仍在呼叫的 settle_expense
--       （migrations/add_settle_expense.sql）其初始 expense 讀取是一般 SELECT（無列鎖），
--       且鎖序相反（splits→expense：先 UPDATE expense_splits 再 UPDATE expenses）。兩者
--       併發時：
--         • settle_expense 的無鎖初始讀 → 「讀 is_settled → 建 settlements」之間留下單向 TOCTOU 窗口；
--         • 兩函式相反鎖序 → 交錯執行有死鎖（40P01）風險。
--
-- 目的①：把 settle_expense 的初始 expense 讀取改為 FOR UPDATE，使其鎖序與 update_group_expense
--       對齊為「expense 列先行」，一舉：
--         (1) 閉合雙向 TOCTOU（settle 端在讀 is_settled 前即持有 expense 列鎖）；
--         (2) 消除相反鎖序造成的死鎖（兩函式皆 expense→splits）。
--
-- 背景②（v3-06 通知聚合前提，Phase 6 review 發現）：group_expense.notify_settlement_received()
--       （見 migrations/v3-06-notification-triggers.sql）是 AFTER STATEMENT trigger +
--       transition table，設計上假設「這次操作產生的所有 settlements 列」在單一 statement
--       內可見，才能依 paid_to 聚合成一則推播。但原本的實作是 FOR v_split IN ... LOOP
--       INSERT ... 逐列 INSERT——每一列各自是一個獨立 statement，AFTER STATEMENT trigger
--       因此逐列各觸發一次、transition table 恆為 1 列，GROUP BY paid_to 沒有實際聚合效果：
--       一筆支出多位債務人結清給同一位付款人時，該付款人會收到 N 則推播（N = 債務人數），
--       而非聚合後的 1 則。
--
-- 目的②：把 settlements 的產生方式從「FOR v_split IN ... LOOP 逐列 INSERT」改為單一
--       INSERT ... SELECT（集合式，一個 statement 內插入本次操作的所有列），使 v3-06 的
--       AFTER STATEMENT trigger 能在單一 statement 內取得完整 transition table，讓「依
--       paid_to 聚合」實際生效。
--
-- 對 Vue 版行為影響評估：函式體大致沿用 add_settle_expense.sql 現行定義，差異有二：
--       (1) 初始讀取多一個 FOR UPDATE；
--       (2) settlements 的產生方式從逐列 INSERT 改為單一 INSERT ... SELECT。
--       兩者皆為語意保留的改寫：(1) 僅在「同一 expense 正被另一交易鎖住」時多一段鎖等待；
--       (2) 的 SELECT 篩選條件（expense_id = p_expense_id / is_settled = false /
--       user_id <> paid_by / amount > 0）、每列產生的 settlements 欄位值
--       （group_id/paid_by/paid_to/amount/notes/year_month）、以及計數方式
--       （GET DIAGNOSTICS ... ROW_COUNT，等價於原本逐列遞增的計數器）均與原本逐列版本
--       完全一致——只改「怎麼送出 INSERT」，不改「送出什麼」。回傳值、settlements 產生規則、
--       is_settled 標記、already-settled → RETURN 0 的 idempotent 行為全數保留，對線上零
--       語意回歸。
--
-- 屬性：完整保留來源檔屬性——SECURITY DEFINER、SET search_path TO 'group_expense'、
--       GRANT EXECUTE ... TO authenticated（來源檔 add_settle_expense.sql 已具 SET search_path，
--       故無需補；沿用其單一 'group_expense' schema 設定，不改為 §① 的 superset）。
--       CREATE OR REPLACE 天然可重跑（idempotent）。
--
-- ⚠ 套用閘門（與 §① 同級）：本段以 CREATE OR REPLACE 覆寫線上正在服務的 settle_expense。
--   套用前務必先以 pg_get_functiondef 匯出 live DB 現行 settle_expense 定義，與本段（及來源
--   add_settle_expense.sql）逐行比對，確認「除下列兩處外零差異」：初始讀取多一行 FOR UPDATE；
--   settlements 產生方式從逐列 INSERT 改為單一 INSERT ... SELECT（等價性論證見上方「對 Vue
--   版行為影響評估」）——若 live 版已有本檔未涵蓋的後續修改，須先合入再套用，避免以舊定義
--   覆蓋線上。比對 SQL 見檔尾 (f)；套用後屬性 / GRANT 驗證見 (g)。
-- ⚠ 順序依賴：本段必須在 add_settle_expense.sql 之後套用，且此後不得重放 add_settle_expense.sql
--   （重放會以無鎖 + 逐列版本覆蓋本加固，重新打開 TOCTOU、40P01 死鎖窗口，以及 v3-06 通知
--   聚合失效的問題）。
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

    -- Idempotent: already settled → no-op
    IF v_expense.is_settled = true THEN
        RETURN 0;
    END IF;

    v_year_month := to_char(v_expense.date, 'YYYY-MM');

    -- 集合式單一 statement（v3-06 通知聚合前提，見 §④ 檔頭「背景②/目的②」）：v3-06 的
    -- notify_settlement_received 是 AFTER STATEMENT trigger + transition table，要在同一個
    -- statement 內看到本次操作產生的全部 settlements 列，才能依 paid_to 聚合成一則推播。
    -- 若改回逐列 INSERT（每列各自一個 statement），STATEMENT-level trigger 會逐列各觸發
    -- 一次，聚合形同虛設——勿還原為迴圈寫法。
    INSERT INTO group_expense.settlements (
        group_id, paid_by, paid_to, amount, notes, year_month
    )
    SELECT
        v_expense.group_id,
        es.user_id,
        v_expense.paid_by,
        es.amount,
        COALESCE(p_notes, 'Settled expense: ' || v_expense.title),
        v_year_month
    FROM   group_expense.expense_splits es
    WHERE  es.expense_id = p_expense_id
      AND  es.is_settled = false
      AND  es.user_id   <> v_expense.paid_by
      AND  es.amount    > 0;

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

GRANT EXECUTE ON FUNCTION group_expense.settle_expense(uuid, text) TO authenticated;


-- == 驗證 SQL ================================================================
-- (a0) ① 套用「前」——先以 pg_get_functiondef 匯出這 6 支函式的完整定義，
--      **逐支** 確認函式體內所有物件引用皆 fully-qualified（schema.物件）或落在
--      group_expense / public，再執行 §① 的 ALTER ... SET search_path。
--      特別關注 Vue 線上仍在呼叫的 get_monthly_snapshots / get_expense_months /
--      settle_monthly_debt：收斂 search_path 後，任何未限定（unqualified）且不落在
--      group_expense / public 的引用會解析失敗 → 這幾支是唯一可能直接回歸線上的路徑。
-- SELECT p.proname, pg_get_functiondef(p.oid) AS definition
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'group_expense'
--   AND  p.proname IN ('process_recurring_expenses','update_updated_at_column',
--                      'get_monthly_snapshots','settle_monthly_debt',
--                      'get_expense_months','create_monthly_snapshot')
-- ORDER  BY p.proname;
--   -- 判讀：逐支檢查 definition，確認無「裸物件名」依賴呼叫時的 search_path；
--   --       特別確認未依賴 auth 等其他 schema 的未限定引用（否則需先 fully-qualify 再套 §①）。

-- (a) ① 目標函式 proconfig 皆含 search_path（mutable 清單應清空）
-- SELECT p.proname, p.proconfig
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'group_expense'
--   AND  p.proname IN ('process_recurring_expenses','update_updated_at_column',
--                      'get_monthly_snapshots','settle_monthly_debt',
--                      'get_expense_months','create_monthly_snapshot')
-- ORDER  BY p.proname;
--   -- 期望：每列 proconfig 含 'search_path=group_expense, public'（不得為 NULL）

-- (b) ② public.create_couple / join_couple 已無 anon/authenticated EXECUTE
-- SELECT r.routine_name, g.grantee, g.privilege_type
-- FROM   information_schema.routine_privileges g
-- JOIN   information_schema.routines r
--        ON r.specific_name = g.specific_name AND r.specific_schema = g.specific_schema
-- WHERE  r.routine_schema = 'public'
--   AND  r.routine_name IN ('create_couple','join_couple')
--   AND  g.grantee IN ('anon','authenticated');
--   -- 期望：0 筆（anon/authenticated 已無 EXECUTE）

-- (c) ② 套用「前」先確認 30 天內無呼叫（需 pg_stat_statements 擴充）
-- SELECT query, calls
-- FROM   pg_stat_statements
-- WHERE  query ILIKE '%create_couple%' OR query ILIKE '%join_couple%';
--   -- 期望：無列，或 calls 為 0；若有近期呼叫，先停用客戶端路徑再 REVOKE

-- (d) ③ recurring_expenses 現況 policy（人工判讀是否限 user_id = auth.uid()）
-- SELECT policyname, cmd, qual, with_check
-- FROM   pg_policies
-- WHERE  schemaname = 'group_expense' AND tablename = 'recurring_expenses'
-- ORDER  BY policyname;

-- (e) ③ recurring_expenses RLS 是否啟用
-- SELECT relrowsecurity FROM pg_class
-- WHERE  oid = 'group_expense.recurring_expenses'::regclass;

-- (f) ④ 套用「前」——匯出 live DB 現行 settle_expense 定義，與 add_settle_expense.sql / 本檔 §④
--     逐行比對，確認「除下列兩處外零差異」再套用（避免以舊定義覆蓋線上）。
-- SELECT pg_get_functiondef(p.oid) AS definition
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'group_expense' AND p.proname = 'settle_expense';
--   -- 判讀：與本檔 §④ 對照，預期差異僅兩處：(1) WHERE id = p_expense_id 之後多出一行
--   --       FOR UPDATE；(2) settlements 的產生從 FOR v_split IN ... LOOP INSERT 改為單一
--   --       INSERT ... SELECT + GET DIAGNOSTICS 計數（等價性論證見 §④ 內文）。其餘
--   --       （membership 檢查、idempotent 判斷、後續兩個 UPDATE、回傳值）應逐字相同。

-- (g) ④ 套用「後」——settle_expense 仍為 SECURITY DEFINER + search_path 已設 + 已 GRANT authenticated
-- SELECT p.proname, p.prosecdef, p.proconfig
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'group_expense' AND p.proname = 'settle_expense';
--   -- 期望：prosecdef = true、proconfig 含 search_path=group_expense
-- SELECT grantee, privilege_type
-- FROM   information_schema.role_routine_grants
-- WHERE  routine_schema = 'group_expense' AND routine_name = 'settle_expense';
--   -- 期望：authenticated 具 EXECUTE
