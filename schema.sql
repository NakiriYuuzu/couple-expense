-- 此為 v3 目標現況快照，套用順序見 migrations/。
-- Context snapshot only; do not apply this file directly to production.
--
-- Baseline:
--   docs/migrations/001-couple-to-family.sql
--   migrations/v2-schema-migration.sql
--   migrations/add_personal_budget.sql
--   migrations/add_settle_expense.sql
--   migrations/round_twd_debts_to_integer.sql
--
-- v3 target additions / hardening:
--   migrations/v3-01-user-devices.sql
--   migrations/v3-02-monthly-reports.sql
--   migrations/v3-03-update-group-expense-rpc.sql
--   migrations/v3-04-hardening.sql
--   migrations/v3-05-notification-prefs.sql
--   migrations/v3-06-notification-triggers.sql
--   migrations/v3-07-monthly-report-cron.sql
--
-- Schema: group_expense

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS group_expense;

-- ============================================================================
-- Tables
-- ============================================================================

CREATE TABLE group_expense.groups (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    invitation_code text UNIQUE,
    max_members integer DEFAULT 10 CHECK (max_members >= 2 AND max_members <= 10),
    created_by uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT groups_pkey PRIMARY KEY (id),
    CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

CREATE TABLE group_expense.group_members (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    is_active boolean DEFAULT true,
    joined_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT group_members_pkey PRIMARY KEY (id),
    CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_expense.groups(id) ON DELETE CASCADE,
    CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id)
);

CREATE TABLE group_expense.group_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL UNIQUE,
    monthly_budget numeric DEFAULT 0,
    budget_start_day integer DEFAULT 1 CHECK (budget_start_day >= 1 AND budget_start_day <= 28),
    category_budgets jsonb DEFAULT '{}'::jsonb,
    currency text DEFAULT 'TWD' CHECK (currency IN ('TWD', 'USD', 'EUR', 'JPY', 'CNY')),
    default_split_method text DEFAULT 'equal' CHECK (default_split_method IN ('equal', 'exact', 'percentage', 'shares')),
    simplify_debts boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT group_settings_pkey PRIMARY KEY (id),
    CONSTRAINT group_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_expense.groups(id) ON DELETE CASCADE
);

CREATE TABLE group_expense.expenses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    group_id uuid,
    title text NOT NULL,
    amount numeric NOT NULL,
    category text NOT NULL,
    icon text,
    date date NOT NULL DEFAULT CURRENT_DATE,
    currency text DEFAULT 'TWD' CHECK (currency IN ('TWD', 'USD', 'EUR', 'JPY', 'CNY')),
    split_method text CHECK (split_method IN ('equal', 'exact', 'percentage', 'shares')),
    paid_by uuid,
    notes text,
    is_settled boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT expenses_pkey PRIMARY KEY (id),
    CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT expenses_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_expense.groups(id) ON DELETE SET NULL,
    CONSTRAINT expenses_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES auth.users(id)
);

COMMENT ON COLUMN group_expense.expenses.date
    IS '使用者於 Asia/Taipei 時區選定的純日曆日；月報與 UI 分桶皆以 Taipei 日曆月/日解讀。';
COMMENT ON COLUMN group_expense.expenses.category
    IS '目前 DB 層仍為 free-form text；前端以 CategoryType 收斂並對未知值 fallback。';

CREATE TABLE group_expense.expense_splits (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    expense_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    percentage numeric,
    shares integer,
    is_settled boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT expense_splits_pkey PRIMARY KEY (id),
    CONSTRAINT expense_splits_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES group_expense.expenses(id) ON DELETE CASCADE,
    CONSTRAINT expense_splits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT expense_splits_expense_id_user_id_key UNIQUE (expense_id, user_id)
);

CREATE TABLE group_expense.settlements (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    paid_by uuid NOT NULL,
    paid_to uuid NOT NULL,
    amount numeric NOT NULL CHECK (amount > 0),
    notes text,
    year_month text,
    -- 單筆結清（settle_expense）來源費用；面板結清為 NULL。
    -- Source: migrations/fix_settlement_reliability.sql.
    expense_id uuid,
    settled_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT settlements_pkey PRIMARY KEY (id),
    CONSTRAINT settlements_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_expense.groups(id) ON DELETE CASCADE,
    CONSTRAINT settlements_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES auth.users(id),
    CONSTRAINT settlements_paid_to_fkey FOREIGN KEY (paid_to) REFERENCES auth.users(id),
    CONSTRAINT settlements_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES group_expense.expenses(id)
);

-- 保險機制：同一費用對同一付款人只能有一筆結清（防 is_settled 被任何路徑重置後重複結清）。
CREATE UNIQUE INDEX uq_settlements_expense_paid_by
    ON group_expense.settlements (expense_id, paid_by)
    WHERE expense_id IS NOT NULL;

CREATE TABLE group_expense.user_profiles (
    id uuid NOT NULL,
    email text,
    display_name text,
    avatar_url text,
    personal_monthly_budget numeric CHECK (personal_monthly_budget IS NULL OR personal_monthly_budget >= 0),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TABLE group_expense.user_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    language text DEFAULT 'zh-TW' CHECK (language IN ('zh-TW', 'en')),
    theme text DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    show_in_statistics boolean DEFAULT true,
    notification_prefs jsonb NOT NULL DEFAULT '{"split_assigned":true,"settlement_received":true,"monthly_report":true}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT user_settings_pkey PRIMARY KEY (id),
    CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

COMMENT ON COLUMN group_expense.user_settings.notification_prefs
    IS 'v3-05: 推播事件開關 {split_assigned, settlement_received, monthly_report}；預設全開。';

CREATE TABLE group_expense.recurring_expenses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    group_id uuid,
    title text NOT NULL,
    amount numeric NOT NULL,
    category text NOT NULL,
    recurrence_day integer NOT NULL CHECK (recurrence_day >= 1 AND recurrence_day <= 31),
    next_due_date date NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT recurring_expenses_pkey PRIMARY KEY (id),
    CONSTRAINT recurring_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT recurring_expenses_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_expense.groups(id) ON DELETE SET NULL
);

CREATE TABLE group_expense.monthly_debt_snapshots (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    year_month text NOT NULL,
    snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    total_unsettled numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'unsettled' CHECK (status IN ('settled', 'partial', 'unsettled')),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT monthly_debt_snapshots_pkey PRIMARY KEY (id),
    CONSTRAINT monthly_debt_snapshots_group_id_year_month_key UNIQUE (group_id, year_month),
    CONSTRAINT monthly_debt_snapshots_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_expense.groups(id) ON DELETE CASCADE
);

CREATE TABLE group_expense.user_devices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    fcm_token text NOT NULL,
    platform text NOT NULL,
    user_agent text,
    last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT user_devices_pkey PRIMARY KEY (id),
    CONSTRAINT user_devices_fcm_token_key UNIQUE (fcm_token),
    CONSTRAINT user_devices_platform_check CHECK (platform IN ('web', 'android-pwa', 'ios-pwa')),
    CONSTRAINT user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

COMMENT ON TABLE group_expense.user_devices
    IS 'v3-01: FCM 推播裝置註冊表；一人多裝置；UNREGISTERED 即刪，last_seen_at 逾 90 天由月報 cron 清。';

CREATE TABLE group_expense.monthly_reports (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    year_month text NOT NULL,
    data jsonb NOT NULL,
    read_at timestamptz,
    notified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT monthly_reports_pkey PRIMARY KEY (id),
    CONSTRAINT monthly_reports_user_year_month_key UNIQUE (user_id, year_month),
    CONSTRAINT monthly_reports_year_month_check CHECK (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT monthly_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

COMMENT ON TABLE group_expense.monthly_reports
    IS 'v3-02: 月報快取；service_role 產生 data，authenticated 只讀自己並可更新 read_at。';
COMMENT ON COLUMN group_expense.monthly_reports.data
    IS 'React 19 MonthlyReportData: {yearMonth, personal, group, mom, generatedAt}.';
COMMENT ON COLUMN group_expense.monthly_reports.notified_at
    IS '推播去重欄位；月報重跑時非 NULL 者不再推播。';

-- Legacy archive tables remain until post-cutover cleanup.
CREATE TABLE group_expense.legacy_transactions (
    id uuid NOT NULL PRIMARY KEY,
    amount double precision NOT NULL,
    status boolean NOT NULL,
    note varchar,
    user_id uuid NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE group_expense.legacy_users (
    id uuid NOT NULL PRIMARY KEY,
    name varchar NOT NULL,
    password varchar,
    created_at timestamptz NOT NULL,
    role text NOT NULL
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX idx_group_members_group_id ON group_expense.group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_expense.group_members(user_id);

CREATE INDEX idx_expenses_group_id ON group_expense.expenses(group_id);
CREATE INDEX idx_expenses_group_id_date ON group_expense.expenses(group_id, date DESC);
CREATE INDEX idx_expenses_paid_by ON group_expense.expenses(paid_by);

CREATE INDEX idx_expense_splits_expense_id ON group_expense.expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user_id ON group_expense.expense_splits(user_id);

CREATE INDEX idx_settlements_group_id ON group_expense.settlements(group_id);
CREATE INDEX idx_settlements_paid_by ON group_expense.settlements(paid_by);
CREATE INDEX idx_settlements_paid_to ON group_expense.settlements(paid_to);

CREATE INDEX idx_user_devices_user_id ON group_expense.user_devices(user_id);
CREATE INDEX idx_user_devices_last_seen_at ON group_expense.user_devices(last_seen_at);

CREATE INDEX idx_monthly_reports_user_id ON group_expense.monthly_reports(user_id);

-- v3-04 hardening revokes legacy public RPCs from app roles when present:
--   REVOKE EXECUTE ON FUNCTION public.create_couple(...) FROM anon, authenticated;
--   REVOKE EXECUTE ON FUNCTION public.join_couple(...) FROM anon, authenticated;

-- ============================================================================
-- RLS policies
-- ============================================================================

ALTER TABLE group_expense.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.group_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense.monthly_reports ENABLE ROW LEVEL SECURITY;

-- groups: active members can select; owners can update/delete; creator can insert.
CREATE POLICY groups_select_policy ON group_expense.groups
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = id AND gm.user_id = auth.uid() AND gm.is_active = true
        )
    );
CREATE POLICY groups_update_policy ON group_expense.groups
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = id AND gm.user_id = auth.uid() AND gm.role = 'owner' AND gm.is_active = true
        )
    );
CREATE POLICY groups_delete_policy ON group_expense.groups
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = id AND gm.user_id = auth.uid() AND gm.role = 'owner' AND gm.is_active = true
        )
    );
CREATE POLICY groups_insert_policy ON group_expense.groups
    FOR INSERT WITH CHECK (created_by = auth.uid());

-- group_members: members can read group roster; users/admins manage allowed rows.
CREATE POLICY group_members_select_policy ON group_expense.group_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.is_active = true
        )
    );
CREATE POLICY group_members_insert_policy ON group_expense.group_members
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
        )
    );
CREATE POLICY group_members_update_policy ON group_expense.group_members
    FOR UPDATE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
        )
    );
CREATE POLICY group_members_delete_policy ON group_expense.group_members
    FOR DELETE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
        )
    );

-- group_settings: active members can read; owner/admin can update; owner can insert.
CREATE POLICY group_settings_select_policy ON group_expense.group_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.is_active = true
        )
    );
CREATE POLICY group_settings_update_policy ON group_expense.group_settings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
        )
    );
CREATE POLICY group_settings_insert_policy ON group_expense.group_settings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role = 'owner' AND gm.is_active = true
        )
    );

-- expenses: own personal expenses and active-member group expenses.
CREATE POLICY expenses_select_policy ON group_expense.expenses
    FOR SELECT USING (
        user_id = auth.uid()
        OR (
            group_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM group_expense.group_members gm
                WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.is_active = true
            )
        )
    );
CREATE POLICY expenses_insert_policy ON group_expense.expenses
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY expenses_update_policy ON group_expense.expenses
    FOR UPDATE USING (
        user_id = auth.uid()
        OR (
            group_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM group_expense.group_members gm
                WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
            )
        )
    );
CREATE POLICY expenses_delete_policy ON group_expense.expenses
    FOR DELETE USING (
        user_id = auth.uid()
        OR (
            group_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM group_expense.group_members gm
                WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
            )
        )
    );

-- expense_splits: group members can read; expense owner or owner/admin can write.
CREATE POLICY expense_splits_select_policy ON group_expense.expense_splits
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM group_expense.expenses e
            JOIN group_expense.group_members gm ON gm.group_id = e.group_id
            WHERE e.id = expense_id AND gm.user_id = auth.uid() AND gm.is_active = true
        )
        OR user_id = auth.uid()
    );
CREATE POLICY expense_splits_insert_policy ON group_expense.expense_splits
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_expense.expenses e
            WHERE e.id = expense_id AND e.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM group_expense.expenses e
            JOIN group_expense.group_members gm ON gm.group_id = e.group_id
            WHERE e.id = expense_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
        )
    );
CREATE POLICY expense_splits_update_policy ON group_expense.expense_splits
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM group_expense.expenses e
            WHERE e.id = expense_id AND e.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM group_expense.expenses e
            JOIN group_expense.group_members gm ON gm.group_id = e.group_id
            WHERE e.id = expense_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
        )
    );
CREATE POLICY expense_splits_delete_policy ON group_expense.expense_splits
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM group_expense.expenses e
            WHERE e.id = expense_id AND e.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM group_expense.expenses e
            JOIN group_expense.group_members gm ON gm.group_id = e.group_id
            WHERE e.id = expense_id AND gm.user_id = auth.uid() AND gm.role IN ('owner', 'admin') AND gm.is_active = true
        )
    );

-- settlements: active group members can read; payer can insert. No update/delete policies.
CREATE POLICY settlements_select_policy ON group_expense.settlements
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.is_active = true
        )
    );
CREATE POLICY settlements_insert_policy ON group_expense.settlements
    FOR INSERT WITH CHECK (
        paid_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.is_active = true
        )
    );

-- user_devices: authenticated users can manage own device rows.
CREATE POLICY user_devices_select_own ON group_expense.user_devices
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_devices_insert_own ON group_expense.user_devices
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_devices_update_own ON group_expense.user_devices
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_devices_delete_own ON group_expense.user_devices
    FOR DELETE USING (user_id = auth.uid());

-- monthly_reports: authenticated users can read own reports and update read_at only.
CREATE POLICY monthly_reports_select_own ON group_expense.monthly_reports
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY monthly_reports_update_read_at_own ON group_expense.monthly_reports
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- recurring_expenses RLS is intentionally not asserted by v3.
-- v3-04 is report-only for this table: enabling RLS blindly can stop
-- process_recurring_expenses() if SECURITY DEFINER owner bypass assumptions fail.

-- user_profiles / user_settings are pre-v3 baseline tables. Their CREATE TABLE
-- definitions above are 「既有定義原文轉錄」 from the v2 schema snapshot plus
-- v3-05 notification_prefs. No v3 migration rebuilds RLS for these two tables,
-- and the repo v2 schema snapshot contains no RLS DDL for them, so this v3
-- snapshot does not add new ENABLE RLS / CREATE POLICY statements here.

-- ============================================================================
-- Functions
-- ============================================================================

-- Source: migrations/v2-schema-migration.sql, adapted from public.* to the
-- v3 group_expense schema used by this snapshot.
CREATE OR REPLACE FUNCTION private.generate_invitation_code()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT upper(
        substring(
            replace(replace(encode(gen_random_bytes(6), 'base64'), '+', ''), '/', ''),
            1, 8
        )
    )
$$;

CREATE OR REPLACE FUNCTION group_expense.create_group(
    p_name        text,
    p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_group_id      uuid;
    v_invite_code   text;
    v_attempt       integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    LOOP
        v_invite_code := private.generate_invitation_code();
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM group_expense.groups WHERE invitation_code = v_invite_code
        );
        v_attempt := v_attempt + 1;
        IF v_attempt >= 5 THEN
            RAISE EXCEPTION 'Could not generate a unique invitation code; please retry';
        END IF;
    END LOOP;

    INSERT INTO group_expense.groups (name, description, invitation_code, created_by)
    VALUES (p_name, p_description, v_invite_code, auth.uid())
    RETURNING id INTO v_group_id;

    INSERT INTO group_expense.group_settings (group_id)
    VALUES (v_group_id);

    INSERT INTO group_expense.group_members (group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'owner');

    RETURN v_group_id;
END;
$$;

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
      AND  is_active = true;

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

-- Source: migrations/v2-schema-migration.sql plus the production conservation
-- guard documented in docs/archive/post-audit-backend-todos.md.
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
    v_paid_by    uuid;
    v_split      jsonb;
    v_split_user uuid;
    v_split_amt  numeric;
    v_split_sum  numeric;
    v_member_cnt integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM group_expense.group_members
        WHERE group_id = p_group_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'You are not an active member of this group';
    END IF;

    IF p_splits IS NOT NULL AND jsonb_typeof(p_splits) <> 'array' THEN
        RAISE EXCEPTION 'p_splits must be a JSON array';
    END IF;

    IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
        SELECT COALESCE(SUM((elem->>'amount')::numeric), 0) INTO v_split_sum
        FROM jsonb_array_elements(p_splits) AS elem;

        IF round(v_split_sum * 100) <> round(p_amount * 100) THEN
            RAISE EXCEPTION 'Split amounts (%) do not sum to expense amount (%)', v_split_sum, p_amount;
        END IF;
    END IF;

    v_paid_by := COALESCE(p_paid_by, auth.uid());

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
        FOR v_split IN SELECT jsonb_array_elements(p_splits) LOOP
            v_split_user := (v_split->>'user_id')::uuid;
            v_split_amt  := (v_split->>'amount')::numeric;

            INSERT INTO group_expense.expense_splits (
                expense_id, user_id, amount, percentage, shares
            )
            VALUES (
                v_expense_id,
                v_split_user,
                v_split_amt,
                (v_split->>'percentage')::numeric,
                (v_split->>'shares')::integer
            )
            ON CONFLICT (expense_id, user_id) DO UPDATE
                SET amount     = EXCLUDED.amount,
                    percentage = EXCLUDED.percentage,
                    shares     = EXCLUDED.shares;
        END LOOP;
    ELSE
        SELECT COUNT(*) INTO v_member_cnt
        FROM   group_expense.group_members
        WHERE  group_id = p_group_id AND is_active = true;

        INSERT INTO group_expense.expense_splits (expense_id, user_id, amount, percentage, shares)
        SELECT
            v_expense_id,
            gm.user_id,
            ROUND(p_amount / NULLIF(v_member_cnt, 0), 2),
            ROUND(100.0 / NULLIF(v_member_cnt, 0), 4),
            1
        FROM group_expense.group_members gm
        WHERE gm.group_id = p_group_id
          AND gm.is_active = true
        ON CONFLICT (expense_id, user_id) DO NOTHING;
    END IF;

    RETURN v_expense_id;
END;
$$;

-- Source: migrations/v2-schema-migration.sql, with settlement signs aligned to
-- migrations/round_twd_debts_to_integer.sql monthly balance semantics.
CREATE OR REPLACE FUNCTION group_expense.get_group_balances(p_group_id uuid)
RETURNS TABLE(user_id uuid, net_balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
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
$$;

-- Source: migrations/round_twd_debts_to_integer.sql.
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

-- Source: migrations/fix_settlement_reliability.sql（上限驗證 + 歸零標記 + Taipei 月份）.
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

-- Source: /Users/yuuzu/HanaokaYuuzu/Coding/Node/couple-expense/schema.sql
-- function contract and current frontend callers in src/features/settlement/api/.
CREATE OR REPLACE FUNCTION group_expense.get_monthly_snapshots(p_group_id uuid)
RETURNS TABLE(
    id uuid,
    year_month text,
    snapshot_data jsonb,
    total_unsettled numeric,
    status text,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
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
$$;

-- Source: migrations/round_twd_debts_to_integer.sql.
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

-- Source: migrations/round_twd_debts_to_integer.sql.
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

-- Source: /Users/yuuzu/HanaokaYuuzu/Coding/Node/couple-expense/schema.sql
-- function contract and current frontend callers in src/features/settlement/api/.
CREATE OR REPLACE FUNCTION group_expense.create_monthly_snapshot(
    p_group_id uuid,
    p_year_month text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_snapshot_id uuid;
    v_start_date date;
    v_end_date date;
    v_expense_count integer;
    v_total_expense numeric;
    v_total_unsettled numeric;
    v_snapshot_data jsonb;
    v_status text;
BEGIN
    v_start_date := (p_year_month || '-01')::date;
    v_end_date := (v_start_date + interval '1 month')::date;

    SELECT COUNT(*), COALESCE(SUM(e.amount), 0)
    INTO   v_expense_count, v_total_expense
    FROM   group_expense.expenses e
    WHERE  e.group_id = p_group_id
      AND  e.date >= v_start_date
      AND  e.date < v_end_date;

    SELECT COALESCE(SUM(d.amount), 0)
    INTO   v_total_unsettled
    FROM   group_expense.get_monthly_simplified_debts(p_group_id, p_year_month) d;

    v_snapshot_data := jsonb_build_object(
        'netBalances',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('userId', mb.user_id, 'netBalance', mb.net_balance)
                ORDER BY mb.net_balance DESC
            )
            FROM group_expense.get_monthly_balances(p_group_id, p_year_month) mb
        ), '[]'::jsonb),
        'simplifiedDebts',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('fromUser', md.from_user, 'toUser', md.to_user, 'amount', md.amount)
                ORDER BY md.amount DESC
            )
            FROM group_expense.get_monthly_simplified_debts(p_group_id, p_year_month) md
        ), '[]'::jsonb),
        'expenseCount', v_expense_count,
        'totalExpense', v_total_expense
    );

    v_status := CASE
        WHEN v_total_unsettled = 0 THEN 'settled'
        WHEN v_total_unsettled < v_total_expense * 0.5 THEN 'partial'
        ELSE 'unsettled'
    END;

    INSERT INTO group_expense.monthly_debt_snapshots (
        group_id, year_month, snapshot_data, total_unsettled, status
    )
    VALUES (
        p_group_id, p_year_month, v_snapshot_data, v_total_unsettled, v_status
    )
    ON CONFLICT (group_id, year_month) DO UPDATE
        SET snapshot_data = EXCLUDED.snapshot_data,
            total_unsettled = EXCLUDED.total_unsettled,
            status = EXCLUDED.status,
            created_at = timezone('utc', now())
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$;

-- Source: /Users/yuuzu/HanaokaYuuzu/Coding/Node/couple-expense/schema.sql
-- function contract and current frontend callers in src/features/settlement/api/.
CREATE OR REPLACE FUNCTION group_expense.get_expense_months(p_group_id uuid)
RETURNS TABLE(year_month text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
BEGIN
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

-- Source: /Users/yuuzu/HanaokaYuuzu/Coding/Node/couple-expense/schema.sql
-- function contract and current frontend callers in src/features/settlement/api/.
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

-- Source: /Users/yuuzu/HanaokaYuuzu/Coding/Node/couple-expense/schema.sql
-- function contract and current frontend callers in src/features/settlement/api/.
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

-- Source: /Users/yuuzu/HanaokaYuuzu/Coding/Node/couple-expense/schema.sql
-- function contract and current frontend callers in src/features/settlement/api/.
CREATE OR REPLACE FUNCTION group_expense.delete_settlement(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM group_expense.settlements
    WHERE id = p_settlement_id
      AND paid_by = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found or not deletable by caller';
    END IF;
END;
$$;

-- Source: /Users/yuuzu/HanaokaYuuzu/Coding/Node/couple-expense/src/shared/lib/database.types.ts
-- RPC contract and docs/archive/post-audit-backend-todos.md behavior notes.
CREATE OR REPLACE FUNCTION group_expense.process_recurring_expenses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
DECLARE
    v_rec group_expense.recurring_expenses%ROWTYPE;
    v_expense_id uuid;
    v_member_cnt integer;
    v_processed integer := 0;
BEGIN
    FOR v_rec IN
        SELECT *
        FROM group_expense.recurring_expenses
        WHERE is_active = true
          AND next_due_date <= CURRENT_DATE
        FOR UPDATE
    LOOP
        v_expense_id := NULL;

        IF v_rec.group_id IS NULL THEN
            INSERT INTO group_expense.expenses (
                user_id, group_id, title, amount, category, date, paid_by, notes
            )
            VALUES (
                v_rec.user_id, NULL, v_rec.title, v_rec.amount, v_rec.category,
                v_rec.next_due_date, v_rec.user_id, v_rec.notes
            )
            RETURNING id INTO v_expense_id;
        ELSE
            SELECT COUNT(*) INTO v_member_cnt
            FROM group_expense.group_members
            WHERE group_id = v_rec.group_id
              AND is_active = true;

            IF v_member_cnt > 0 THEN
                INSERT INTO group_expense.expenses (
                    user_id, group_id, title, amount, category, date,
                    currency, split_method, paid_by, notes
                )
                VALUES (
                    v_rec.user_id, v_rec.group_id, v_rec.title, v_rec.amount, v_rec.category,
                    v_rec.next_due_date, 'TWD', 'equal', v_rec.user_id, v_rec.notes
                )
                RETURNING id INTO v_expense_id;

                INSERT INTO group_expense.expense_splits (expense_id, user_id, amount, percentage, shares)
                SELECT
                    v_expense_id,
                    gm.user_id,
                    ROUND(v_rec.amount / NULLIF(v_member_cnt, 0), 2),
                    ROUND(100.0 / NULLIF(v_member_cnt, 0), 4),
                    1
                FROM group_expense.group_members gm
                WHERE gm.group_id = v_rec.group_id
                  AND gm.is_active = true;
            END IF;
        END IF;

        UPDATE group_expense.recurring_expenses
        SET next_due_date = (v_rec.next_due_date + interval '1 month')::date,
            updated_at = timezone('utc', now())
        WHERE id = v_rec.id;

        IF v_expense_id IS NOT NULL THEN
            v_processed := v_processed + 1;
        END IF;
    END LOOP;

    RETURN v_processed;
END;
$$;

CREATE OR REPLACE FUNCTION group_expense.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'group_expense'
AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;

-- Source: migrations/v3-03-update-group-expense-rpc.sql.
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

    v_amount := CASE WHEN (p_updates -> 'amount') IS NOT NULL
                     THEN (p_updates->>'amount')::numeric
                     ELSE v_expense.amount END;

    IF v_amount IS NULL THEN
        RAISE EXCEPTION 'amount cannot be null';
    END IF;

    FOR v_split IN SELECT jsonb_array_elements(p_splits) LOOP
        IF (v_split -> 'amount') IS NULL OR jsonb_typeof(v_split -> 'amount') = 'null' THEN
            RAISE EXCEPTION 'split amount cannot be null';
        END IF;
    END LOOP;

    SELECT COALESCE(SUM((elem->>'amount')::numeric), 0) INTO v_split_sum
    FROM   jsonb_array_elements(p_splits) AS elem;

    IF round(v_split_sum * 100) <> round(v_amount * 100) THEN
        RAISE EXCEPTION 'Split amounts (%) do not sum to expense amount (%)', v_split_sum, v_amount;
    END IF;

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

    FOR v_split IN SELECT jsonb_array_elements(p_splits) LOOP
        IF (v_split -> 'user_id') IS NULL OR jsonb_typeof(v_split -> 'user_id') = 'null' THEN
            RAISE EXCEPTION 'user_id cannot be null in splits';
        END IF;
        PERFORM (v_split->>'user_id')::uuid;
    END LOOP;

    IF (
        SELECT COUNT(*) FROM jsonb_array_elements(p_splits) AS elem
    ) <> (
        SELECT COUNT(DISTINCT (elem->>'user_id')::uuid) FROM jsonb_array_elements(p_splits) AS elem
    ) THEN
        RAISE EXCEPTION 'duplicate user_id in splits';
    END IF;

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

-- Source: migrations/v3-04-hardening.sql.
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

-- Source: migrations/v3-06-notification-triggers.sql.

CREATE OR REPLACE FUNCTION group_expense.get_send_push_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_value text;
BEGIN
    SELECT decrypted_secret INTO v_value
    FROM vault.decrypted_secrets
    WHERE name = p_name
    LIMIT 1;

    RETURN v_value;  -- NULL 表示尚未於 Vault 建立此密鑰；呼叫端需自行判斷是否略過
EXCEPTION WHEN OTHERS THEN
    -- Vault 未啟用 / decrypted_secrets 不可讀等情況：視為未設定，不阻斷呼叫端交易。
    RAISE WARNING 'get_send_push_secret(%): %', p_name, SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION group_expense.get_send_push_secret(text)
    IS '讀取 send-push 呼叫設定（send_push_url / send_push_shared_secret / send_push_service_key）於 Supabase Vault；查無或 Vault 不可用時回傳 NULL 並僅 WARNING，不拋例外。替代方案見檔尾 GUC 備註。';

CREATE OR REPLACE FUNCTION group_expense.notify_split_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_url         text := group_expense.get_send_push_secret('send_push_url');
    v_secret      text := group_expense.get_send_push_secret('send_push_shared_secret');
    v_service_key text := group_expense.get_send_push_secret('send_push_service_key');
    v_row         record;
BEGIN
    IF coalesce(v_url, '') = '' OR coalesce(v_service_key, '') = '' THEN
        RAISE WARNING 'notify_split_assigned: send_push_url 或 send_push_service_key 未設定，略過本次推播';
        RETURN NULL;
    END IF;

    -- 聚合鍵：(recipient, expense)。單一 add_group_expense 呼叫僅對一筆支出產生 splits，
    -- 故常態下等同「依收件人聚合」；多留 expense 維度是為了防禦未來可能出現的批次匯入
    -- （單一 statement 內對多筆支出同時 INSERT splits）情境，避免把不同支出的訊息混在一起。
    FOR v_row IN
        SELECT
            ns.user_id     AS recipient_id,
            e.id           AS expense_id,
            e.title        AS expense_title,
            count(*)       AS split_count,
            sum(ns.amount) AS total_amount
        FROM new_splits ns
        JOIN group_expense.expenses e ON e.id = ns.expense_id
        WHERE e.group_id IS NOT NULL                -- 僅群組支出才有「被分帳」語意
          AND ns.user_id IS DISTINCT FROM e.paid_by  -- 排除付款人自己
        GROUP BY ns.user_id, e.id, e.title
    LOOP
        BEGIN
            PERFORM net.http_post(
                url     := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key,
                    'x-webhook-secret', v_secret
                ),
                body    := jsonb_build_object(
                    'userIds', jsonb_build_array(v_row.recipient_id),
                    'event', 'split_assigned',
                    'title', '新的分帳',
                    'body', format('「%s」有新的分帳給你，金額 %s', v_row.expense_title, round(v_row.total_amount)),
                    'data', jsonb_build_object(
                        'expenseId', v_row.expense_id::text,
                        'splitCount', v_row.split_count::text,
                        'url', 'expenses/' || v_row.expense_id::text
                    )
                )
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'notify_split_assigned: http_post failed for user %, expense %: %',
                v_row.recipient_id, v_row.expense_id, SQLERRM;
        END;
    END LOOP;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_split_assigned: unexpected error: %', SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION group_expense.notify_split_assigned()
    IS 'STATEMENT-level AFTER INSERT ON expense_splits：以 transition table 依 (recipient, expense) 聚合，逐收件人呼叫 send-push（event=split_assigned），排除付款人自己；僅群組支出（group_id NOT NULL）觸發。任何失敗只 WARNING，不影響原交易。';

CREATE OR REPLACE FUNCTION group_expense.notify_settlement_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_url         text := group_expense.get_send_push_secret('send_push_url');
    v_secret      text := group_expense.get_send_push_secret('send_push_shared_secret');
    v_service_key text := group_expense.get_send_push_secret('send_push_service_key');
    v_row         record;
BEGIN
    IF coalesce(v_url, '') = '' OR coalesce(v_service_key, '') = '' THEN
        RAISE WARNING 'notify_settlement_received: send_push_url 或 send_push_service_key 未設定，略過本次推播';
        RETURN NULL;
    END IF;

    -- 聚合鍵：paid_to（收款人）。group_expense.settle_expense() 會在單一 statement 內
    -- 對同一位收款人一次 INSERT 多筆 settlements（一筆支出多位債務人分別結清給同一位
    -- 付款人），故以此聚合，避免對同一人狂發多則推播。
    FOR v_row IN
        SELECT
            ns.paid_to     AS recipient_id,
            count(*)       AS settlement_count,
            sum(ns.amount) AS total_amount
        FROM new_settlements ns
        GROUP BY ns.paid_to
    LOOP
        BEGIN
            PERFORM net.http_post(
                url     := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key,
                    'x-webhook-secret', v_secret
                ),
                body    := jsonb_build_object(
                    'userIds', jsonb_build_array(v_row.recipient_id),
                    'event', 'settlement_received',
                    'title', '收到結算',
                    'body', CASE WHEN v_row.settlement_count = 1
                                 THEN format('你收到一筆結算，金額 %s', round(v_row.total_amount))
                                 ELSE format('你收到 %s 筆結算，共 %s', v_row.settlement_count, round(v_row.total_amount))
                            END,
                    'data', jsonb_build_object(
                        'settlementCount', v_row.settlement_count::text,
                        'url', 'overview'
                    )
                )
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'notify_settlement_received: http_post failed for user %: %',
                v_row.recipient_id, SQLERRM;
        END;
    END LOOP;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_settlement_received: unexpected error: %', SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION group_expense.notify_settlement_received()
    IS 'STATEMENT-level AFTER INSERT ON settlements：以 transition table 依 paid_to 聚合（settle_expense 一次可能對同一收款人產生多筆列），逐收件人呼叫 send-push（event=settlement_received）。任何失敗只 WARNING，不影響原交易。';

-- Source: migrations/fix_settlement_reliability.sql.
-- 已結清群組費用的抵銷 settlements 無法連動移除，刪除會造成餘額反轉，直接禁止。
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

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER trg_prevent_settled_expense_delete
    BEFORE DELETE ON group_expense.expenses
    FOR EACH ROW
    EXECUTE FUNCTION group_expense.prevent_settled_expense_delete();

CREATE TRIGGER update_fe_expenses_updated_at
    BEFORE UPDATE ON group_expense.expenses
    FOR EACH ROW
    EXECUTE FUNCTION group_expense.update_updated_at_column();

CREATE TRIGGER update_fe_group_settings_updated_at
    BEFORE UPDATE ON group_expense.group_settings
    FOR EACH ROW
    EXECUTE FUNCTION group_expense.update_updated_at_column();

CREATE TRIGGER update_fe_groups_updated_at
    BEFORE UPDATE ON group_expense.groups
    FOR EACH ROW
    EXECUTE FUNCTION group_expense.update_updated_at_column();

CREATE TRIGGER update_fe_user_profiles_updated_at
    BEFORE UPDATE ON group_expense.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION group_expense.update_updated_at_column();

CREATE TRIGGER update_fe_user_settings_updated_at
    BEFORE UPDATE ON group_expense.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION group_expense.update_updated_at_column();

CREATE TRIGGER update_fe_recurring_expenses_updated_at
    BEFORE UPDATE ON group_expense.recurring_expenses
    FOR EACH ROW
    EXECUTE FUNCTION group_expense.update_updated_at_column();

CREATE TRIGGER trg_notify_split_assigned
    AFTER INSERT ON group_expense.expense_splits
    REFERENCING NEW TABLE AS new_splits
    FOR EACH STATEMENT
    EXECUTE FUNCTION group_expense.notify_split_assigned();

CREATE TRIGGER trg_notify_settlement_received
    AFTER INSERT ON group_expense.settlements
    REFERENCING NEW TABLE AS new_settlements
    FOR EACH STATEMENT
    EXECUTE FUNCTION group_expense.notify_settlement_received();

-- ============================================================================
-- Cron
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-report') THEN
        PERFORM cron.unschedule('monthly-report');
    END IF;
END;
$$;

SELECT cron.schedule(
    'monthly-report',
    '0 1 1 * *',
    $monthly_report_job$
    DO $$
    DECLARE
        v_url         text := group_expense.get_send_push_secret('monthly_report_url');
        v_service_key text := group_expense.get_send_push_secret('send_push_service_key');
    BEGIN
        IF coalesce(v_url, '') = '' OR coalesce(v_service_key, '') = '' THEN
            RAISE WARNING 'monthly-report cron: monthly_report_url 或 send_push_service_key 未設定，略過本次呼叫';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := '{}'::jsonb
        );
    END;
    $$
    $monthly_report_job$
);

-- ============================================================================
-- Grants
-- ============================================================================

GRANT USAGE ON SCHEMA group_expense TO authenticated, service_role;

REVOKE ALL ON group_expense.user_devices FROM anon;
REVOKE ALL ON group_expense.user_devices FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON group_expense.user_devices TO authenticated;
GRANT ALL ON group_expense.user_devices TO service_role;

REVOKE ALL ON group_expense.monthly_reports FROM anon;
REVOKE ALL ON group_expense.monthly_reports FROM authenticated;
GRANT SELECT ON group_expense.monthly_reports TO authenticated;
GRANT UPDATE (read_at) ON group_expense.monthly_reports TO authenticated;
GRANT ALL ON group_expense.monthly_reports TO service_role;

GRANT EXECUTE ON FUNCTION group_expense.create_group(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.join_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.leave_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.add_group_expense(uuid, text, numeric, text, text, date, text, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.get_group_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.get_simplified_debts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.settle_debt(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.get_monthly_snapshots(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.get_monthly_balances(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.get_monthly_simplified_debts(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.get_expense_months(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.settle_monthly_debt(uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.update_settlement(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.delete_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.settle_expense(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.update_group_expense(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION group_expense.create_monthly_snapshot(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION group_expense.process_recurring_expenses() TO service_role;
