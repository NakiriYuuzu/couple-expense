-- =============================================================================
-- Migration: v1 → v2 Schema Migration
-- Description: Replaces family-based model with flexible group-based model.
--              Adds expense splitting, settlement tracking, and debt simplification.
-- Created: 2026-03-09
-- =============================================================================
--
-- PHASES OVERVIEW
--   Phase 1 — Create new tables
--             groups, group_members, group_settings, expense_splits, settlements
--   Phase 2 — Add new columns to existing tables
--             expenses: group_id, currency, split_method, paid_by, notes, is_settled
--             budget_alerts: group_id
--   Phase 3 — Migrate data from v1 structures to v2 structures
--   Phase 4 — Drop deprecated columns and tables
--   Phase 5 — RPC functions (SECURITY DEFINER stored procedures)
--   Phase 6 — Row-Level Security policies for all new tables
--
-- NOTES
--   • The entire migration is wrapped in a single transaction.
--   • budget_alerts is referenced throughout; if it does not exist in your
--     schema, the relevant ALTER/UPDATE statements will simply be skipped via
--     IF EXISTS guards.
--   • The v1 families.created_by column is not present in the schema.sql
--     reference — we therefore default created_by to the owner found in
--     user_profiles during data migration.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PHASE 1: Create new tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1  groups  (replaces families)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    name            text        NOT NULL,
    description     text,
    invitation_code text        UNIQUE,
    max_members     integer     DEFAULT 10
                                CHECK (max_members >= 2 AND max_members <= 10),
    created_by      uuid        NOT NULL REFERENCES auth.users(id),
    is_active       boolean     DEFAULT true,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    CONSTRAINT groups_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE  public.groups                IS 'Top-level group entity; replaces the families table from v1.';
COMMENT ON COLUMN public.groups.invitation_code IS 'Random 8-character alphanumeric code used to invite new members.';
COMMENT ON COLUMN public.groups.created_by      IS 'The auth.users.id of the user who originally created the group.';

-- -----------------------------------------------------------------------------
-- 1.2  group_members  (junction table for group ↔ user relationship)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_members (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    group_id   uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES auth.users(id),
    role       text        DEFAULT 'member'
                           CHECK (role IN ('owner', 'admin', 'member')),
    is_active  boolean     DEFAULT true,
    joined_at  timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    CONSTRAINT group_members_pkey            PRIMARY KEY (id),
    CONSTRAINT group_members_group_user_uq   UNIQUE (group_id, user_id)
);

COMMENT ON TABLE  public.group_members       IS 'Junction table recording which users belong to which groups and their roles.';
COMMENT ON COLUMN public.group_members.role  IS 'owner = group creator; admin = elevated member; member = standard participant.';

CREATE INDEX IF NOT EXISTS idx_group_members_group_id  ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id   ON public.group_members(user_id);

-- -----------------------------------------------------------------------------
-- 1.3  group_settings  (replaces family_settings)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_settings (
    id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
    group_id              uuid        NOT NULL UNIQUE REFERENCES public.groups(id) ON DELETE CASCADE,
    monthly_budget        numeric     DEFAULT 0,
    budget_start_day      integer     DEFAULT 1
                                      CHECK (budget_start_day >= 1 AND budget_start_day <= 28),
    category_budgets      jsonb       DEFAULT '{}'::jsonb,
    currency              text        DEFAULT 'TWD'
                                      CHECK (currency IN ('TWD', 'USD', 'EUR', 'JPY', 'CNY')),
    default_split_method  text        DEFAULT 'equal'
                                      CHECK (default_split_method IN ('equal', 'exact', 'percentage', 'shares')),
    simplify_debts        boolean     DEFAULT true,
    created_at            timestamptz DEFAULT now(),
    updated_at            timestamptz DEFAULT now(),
    CONSTRAINT group_settings_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE  public.group_settings                    IS 'Per-group configuration; replaces family_settings from v1.';
COMMENT ON COLUMN public.group_settings.default_split_method IS 'Determines how new group expenses are split by default.';
COMMENT ON COLUMN public.group_settings.simplify_debts       IS 'When true, debt settlement uses the minimised-transactions algorithm.';

-- -----------------------------------------------------------------------------
-- 1.4  expense_splits  (new — records each member's share of an expense)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_splits (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    expense_id  uuid        NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES auth.users(id),
    amount      numeric     NOT NULL,               -- this user's share in currency units
    percentage  numeric,                            -- populated when split_method = 'percentage'
    shares      integer,                            -- populated when split_method = 'shares'
    is_settled  boolean     DEFAULT false,
    created_at  timestamptz DEFAULT now(),
    CONSTRAINT expense_splits_pkey             PRIMARY KEY (id),
    CONSTRAINT expense_splits_expense_user_uq  UNIQUE (expense_id, user_id)
);

COMMENT ON TABLE  public.expense_splits            IS 'Records the portion of a shared expense owed by each participant.';
COMMENT ON COLUMN public.expense_splits.amount     IS 'Absolute currency amount this user owes for the expense.';
COMMENT ON COLUMN public.expense_splits.percentage IS 'Non-null only when the parent expense uses percentage-based splitting.';
COMMENT ON COLUMN public.expense_splits.shares     IS 'Non-null only when the parent expense uses share-based splitting.';

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id ON public.expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user_id    ON public.expense_splits(user_id);

-- -----------------------------------------------------------------------------
-- 1.5  settlements  (new — records cash payments between group members)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlements (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    group_id    uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    paid_by     uuid        NOT NULL REFERENCES auth.users(id),   -- person making the payment
    paid_to     uuid        NOT NULL REFERENCES auth.users(id),   -- person receiving the payment
    amount      numeric     NOT NULL CHECK (amount > 0),
    notes       text,
    settled_at  timestamptz DEFAULT now(),
    created_at  timestamptz DEFAULT now(),
    CONSTRAINT settlements_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE  public.settlements         IS 'Records actual cash transfers between members to settle shared debts.';
COMMENT ON COLUMN public.settlements.paid_by IS 'The user who is paying off a debt (cash sender).';
COMMENT ON COLUMN public.settlements.paid_to IS 'The user who receives the cash settlement.';

CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON public.settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_paid_by  ON public.settlements(paid_by);
CREATE INDEX IF NOT EXISTS idx_settlements_paid_to  ON public.settlements(paid_to);


-- =============================================================================
-- PHASE 2: Add new columns to existing tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1  expenses — new v2 columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS group_id     uuid  REFERENCES public.groups(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS currency     text  DEFAULT 'TWD'
                                               CHECK (currency IN ('TWD', 'USD', 'EUR', 'JPY', 'CNY')),
    ADD COLUMN IF NOT EXISTS split_method text
                                               CHECK (split_method IN ('equal', 'exact', 'percentage', 'shares')),
    ADD COLUMN IF NOT EXISTS paid_by      uuid  REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS notes        text,
    ADD COLUMN IF NOT EXISTS is_settled   boolean DEFAULT false;

COMMENT ON COLUMN public.expenses.group_id     IS 'NULL = personal expense; non-NULL = expense shared within this group.';
COMMENT ON COLUMN public.expenses.paid_by      IS 'Which member physically paid for this expense (may differ from user_id).';
COMMENT ON COLUMN public.expenses.split_method IS 'How the expense amount is divided among group members.';

CREATE INDEX IF NOT EXISTS idx_expenses_group_id         ON public.expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group_id_date    ON public.expenses(group_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by          ON public.expenses(paid_by);

-- -----------------------------------------------------------------------------
-- 2.2  budget_alerts — add group_id column (kept alongside family_id until Phase 4)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'budget_alerts'
    ) THEN
        -- Add group_id if it does not yet exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'budget_alerts'
              AND column_name  = 'group_id'
        ) THEN
            ALTER TABLE public.budget_alerts
                ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;


-- =============================================================================
-- PHASE 3: Migrate existing data
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1  families → groups
--      Carry over the same UUIDs so all downstream foreign-key references in
--      user_profiles and budget_alerts remain valid during this transaction.
-- -----------------------------------------------------------------------------
INSERT INTO public.groups (
    id,
    name,
    description,
    invitation_code,
    max_members,
    created_by,
    is_active,
    created_at,
    updated_at
)
SELECT
    f.id,
    f.name,
    NULL                              AS description,
    f.invitation_code,
    10                                AS max_members,
    -- Prefer the owner of this family; fall back to the first member found.
    COALESCE(
        (
            SELECT up.id
            FROM   public.user_profiles up
            WHERE  up.family_id = f.id
              AND  up.role = 'owner'
            LIMIT  1
        ),
        (
            SELECT up.id
            FROM   public.user_profiles up
            WHERE  up.family_id = f.id
            LIMIT  1
        ),
        -- Absolute fallback: use a synthetic placeholder that will not match
        -- any real user (gen_random_uuid). This branch should never be reached
        -- in a healthy v1 database.
        '00000000-0000-0000-0000-000000000000'::uuid
    )                                 AS created_by,
    f.is_active,
    f.created_at,
    f.updated_at
FROM public.families f
-- Skip families that were already migrated (re-entrant safety).
WHERE NOT EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = f.id
);

-- -----------------------------------------------------------------------------
-- 3.2  user_profiles (family_id + role) → group_members
-- -----------------------------------------------------------------------------
INSERT INTO public.group_members (
    group_id,
    user_id,
    role,
    is_active,
    joined_at,
    created_at
)
SELECT
    up.family_id                                   AS group_id,
    up.id                                          AS user_id,
    -- v1 only had 'owner' / 'member'; map both directly — v2 adds 'admin'
    COALESCE(up.role, 'member')                    AS role,
    true                                           AS is_active,
    COALESCE(up.joined_at, up.created_at)          AS joined_at,
    up.created_at
FROM public.user_profiles up
WHERE up.family_id IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM public.groups g WHERE g.id = up.family_id
  )
-- Skip rows already present (re-entrant safety).
ON CONFLICT (group_id, user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3.3  family_settings → group_settings
-- -----------------------------------------------------------------------------
INSERT INTO public.group_settings (
    group_id,
    monthly_budget,
    budget_start_day,
    category_budgets,
    currency,
    default_split_method,
    simplify_debts,
    created_at,
    updated_at
)
SELECT
    fs.family_id               AS group_id,
    COALESCE(fs.monthly_budget, 0),
    COALESCE(fs.budget_start_day, 1),
    COALESCE(fs.category_budgets, '{}'::jsonb),
    COALESCE(fs.currency, 'TWD'),
    'equal'                    AS default_split_method,   -- sensible v2 default
    true                       AS simplify_debts,
    fs.created_at,
    fs.updated_at
FROM public.family_settings fs
WHERE EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = fs.family_id
)
-- Skip if already migrated (re-entrant safety).
ON CONFLICT (group_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3.4  expenses with scope='family' → assign group_id and paid_by
--      Personal expenses (scope='personal') keep group_id = NULL.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Only execute if the scope column still exists (pre-Phase 4)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'expenses'
          AND column_name  = 'scope'
    ) THEN
        UPDATE public.expenses e
        SET
            group_id  = up.family_id,
            paid_by   = e.user_id,       -- v1 had no paid_by; default to the creator
            currency  = 'TWD'            -- v1 had no per-expense currency
        FROM public.user_profiles up
        WHERE e.user_id   = up.id
          AND e.scope      = 'family'
          AND up.family_id IS NOT NULL
          -- Skip rows already updated (re-entrant safety)
          AND e.group_id   IS NULL;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3.5  budget_alerts.family_id → budget_alerts.group_id
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'budget_alerts'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'budget_alerts'
              AND column_name  = 'family_id'
        ) THEN
            UPDATE public.budget_alerts ba
            SET    group_id = ba.family_id
            WHERE  ba.family_id IS NOT NULL
              AND  ba.group_id  IS NULL
              AND  EXISTS (
                       SELECT 1 FROM public.groups g WHERE g.id = ba.family_id
                   );
        END IF;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3.6  Create equal expense_splits for existing family expenses
--      Each expense that now has a group_id gets one split row per active
--      group member, with amount = total_amount / member_count.
-- -----------------------------------------------------------------------------
INSERT INTO public.expense_splits (
    expense_id,
    user_id,
    amount,
    percentage,
    shares,
    is_settled
)
SELECT
    e.id                                                        AS expense_id,
    gm.user_id,
    -- Equal split: round to 2 decimal places; minor rounding errors are
    -- acceptable for seed data and can be corrected through the UI later.
    ROUND(
        e.amount / NULLIF(member_counts.cnt, 0),
        2
    )                                                           AS amount,
    ROUND(100.0 / NULLIF(member_counts.cnt, 0), 4)             AS percentage,
    1                                                           AS shares,      -- 1 share each for equal splits
    false                                                       AS is_settled
FROM public.expenses e
-- Only migrate expenses that belong to a group
JOIN public.groups g
    ON g.id = e.group_id
-- All active members of that group at migration time
JOIN public.group_members gm
    ON gm.group_id = g.id
   AND gm.is_active = true
-- Pre-computed member count per group to avoid correlated subquery per row
JOIN (
    SELECT gm2.group_id, COUNT(*) AS cnt
    FROM   public.group_members gm2
    WHERE  gm2.is_active = true
    GROUP  BY gm2.group_id
) AS member_counts
    ON member_counts.group_id = g.id
-- Skip if a split row already exists for this (expense, user) pair
WHERE NOT EXISTS (
    SELECT 1
    FROM   public.expense_splits es
    WHERE  es.expense_id = e.id
      AND  es.user_id    = gm.user_id
)
  AND e.group_id IS NOT NULL;


-- =============================================================================
-- PHASE 4: Drop deprecated columns and tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1  expenses — remove scope column
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'expenses'
          AND column_name  = 'scope'
    ) THEN
        -- Drop dependent indexes first
        DROP INDEX IF EXISTS public.idx_expenses_scope;
        DROP INDEX IF EXISTS public.idx_expenses_user_scope;
        DROP INDEX IF EXISTS public.idx_expenses_user_scope_date;

        ALTER TABLE public.expenses
            DROP CONSTRAINT IF EXISTS expenses_scope_check,
            DROP COLUMN scope;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4.2  user_profiles — remove family_id and role columns
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Drop FK constraint before dropping family_id column
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name        = 'user_profiles'
          AND constraint_name   = 'user_profiles_family_id_fkey'
    ) THEN
        ALTER TABLE public.user_profiles
            DROP CONSTRAINT user_profiles_family_id_fkey;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'user_profiles'
          AND column_name  = 'family_id'
    ) THEN
        ALTER TABLE public.user_profiles DROP COLUMN family_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'user_profiles'
          AND column_name  = 'role'
    ) THEN
        ALTER TABLE public.user_profiles
            DROP CONSTRAINT IF EXISTS user_profiles_role_check,
            DROP COLUMN role;
    END IF;

    -- joined_at was a v1 column on user_profiles; it now lives in group_members
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'user_profiles'
          AND column_name  = 'joined_at'
    ) THEN
        ALTER TABLE public.user_profiles DROP COLUMN joined_at;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4.3  budget_alerts — remove old family_id column
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'budget_alerts'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'budget_alerts'
              AND column_name  = 'family_id'
        ) THEN
            ALTER TABLE public.budget_alerts
                DROP CONSTRAINT IF EXISTS budget_alerts_family_id_fkey,
                DROP COLUMN family_id;
        END IF;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4.4  Drop old tables (order matters: child before parent)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.family_settings CASCADE;
DROP TABLE IF EXISTS public.families        CASCADE;


-- =============================================================================
-- PHASE 5: RPC Functions (SECURITY DEFINER — run as the function owner)
-- =============================================================================

-- Helper: generate a random 8-character alphanumeric invitation code.
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

-- -----------------------------------------------------------------------------
-- 5.1  create_group
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group(
    p_name        text,
    p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id      uuid;
    v_invite_code   text;
    v_attempt       integer := 0;
BEGIN
    -- Validate caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Generate a collision-free invitation code (max 5 retries)
    LOOP
        v_invite_code := private.generate_invitation_code();
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.groups WHERE invitation_code = v_invite_code
        );
        v_attempt := v_attempt + 1;
        IF v_attempt >= 5 THEN
            RAISE EXCEPTION 'Could not generate a unique invitation code; please retry';
        END IF;
    END LOOP;

    -- Create the group
    INSERT INTO public.groups (name, description, invitation_code, created_by)
    VALUES (p_name, p_description, v_invite_code, auth.uid())
    RETURNING id INTO v_group_id;

    -- Create default group settings
    INSERT INTO public.group_settings (group_id)
    VALUES (v_group_id);

    -- Add the creator as owner
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'owner');

    RETURN v_group_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5.2  join_group
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_group(p_invitation_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id    uuid;
    v_max_members integer;
    v_cur_members integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Resolve group from invitation code
    SELECT id, max_members
    INTO   v_group_id, v_max_members
    FROM   public.groups
    WHERE  invitation_code = p_invitation_code
      AND  is_active = true;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or inactive invitation code';
    END IF;

    -- Check whether the caller is already a member
    IF EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = v_group_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You are already a member of this group';
    END IF;

    -- Enforce max_members cap
    SELECT COUNT(*)
    INTO   v_cur_members
    FROM   public.group_members
    WHERE  group_id = v_group_id AND is_active = true;

    IF v_cur_members >= v_max_members THEN
        RAISE EXCEPTION 'Group has reached its maximum member limit of %', v_max_members;
    END IF;

    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'member');

    RETURN v_group_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5.3  leave_group
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_group(p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role   text;
    v_next_owner_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role INTO v_caller_role
    FROM   public.group_members
    WHERE  group_id = p_group_id AND user_id = auth.uid() AND is_active = true;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'You are not an active member of this group';
    END IF;

    IF v_caller_role = 'owner' THEN
        -- Transfer ownership to the longest-standing active member (if any)
        SELECT user_id INTO v_next_owner_id
        FROM   public.group_members
        WHERE  group_id  = p_group_id
          AND  user_id  <> auth.uid()
          AND  is_active = true
        ORDER  BY joined_at ASC
        LIMIT  1;

        IF v_next_owner_id IS NOT NULL THEN
            UPDATE public.group_members
            SET    role = 'owner'
            WHERE  group_id = p_group_id AND user_id = v_next_owner_id;
        ELSE
            -- Caller is the last member; deactivate the group
            UPDATE public.groups
            SET    is_active = false, updated_at = now()
            WHERE  id = p_group_id;
        END IF;
    END IF;

    -- Soft-remove the caller from group_members
    UPDATE public.group_members
    SET    is_active = false
    WHERE  group_id = p_group_id AND user_id = auth.uid();

    RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5.4  add_group_expense
--      p_splits: jsonb array of {user_id, amount, percentage?, shares?}
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_group_expense(
    p_group_id    uuid,
    p_title       text,
    p_amount      numeric,
    p_category    text,
    p_icon        text        DEFAULT NULL,
    p_date        date        DEFAULT CURRENT_DATE,
    p_currency    text        DEFAULT 'TWD',
    p_split_method text       DEFAULT 'equal',
    p_paid_by     uuid        DEFAULT NULL,
    p_notes       text        DEFAULT NULL,
    p_splits      jsonb       DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expense_id  uuid;
    v_paid_by     uuid;
    v_split       jsonb;
    v_split_user  uuid;
    v_split_amt   numeric;
    v_member_cnt  integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Confirm the caller is an active member of the group
    IF NOT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = p_group_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'You are not an active member of this group';
    END IF;

    v_paid_by := COALESCE(p_paid_by, auth.uid());

    -- Create the expense record
    INSERT INTO public.expenses (
        user_id, title, amount, category, icon, date,
        group_id, currency, split_method, paid_by, notes
    )
    VALUES (
        auth.uid(), p_title, p_amount, p_category, p_icon, p_date,
        p_group_id, p_currency, p_split_method, v_paid_by, p_notes
    )
    RETURNING id INTO v_expense_id;

    IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
        -- Explicit split data provided
        FOR v_split IN SELECT jsonb_array_elements(p_splits) LOOP
            v_split_user := (v_split->>'user_id')::uuid;
            v_split_amt  := (v_split->>'amount')::numeric;

            INSERT INTO public.expense_splits (
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
        -- Default: equal split across all active group members
        SELECT COUNT(*) INTO v_member_cnt
        FROM   public.group_members
        WHERE  group_id = p_group_id AND is_active = true;

        INSERT INTO public.expense_splits (expense_id, user_id, amount, percentage, shares)
        SELECT
            v_expense_id,
            gm.user_id,
            ROUND(p_amount / NULLIF(v_member_cnt, 0), 2),
            ROUND(100.0    / NULLIF(v_member_cnt, 0), 4),
            1
        FROM public.group_members gm
        WHERE gm.group_id  = p_group_id
          AND gm.is_active = true
        ON CONFLICT (expense_id, user_id) DO NOTHING;
    END IF;

    RETURN v_expense_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5.5  get_group_balances
--      Returns the net balance for each active group member.
--      Positive balance  → the member is owed money (paid more than their share)
--      Negative balance  → the member owes money (paid less than their share)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_group_balances(p_group_id uuid)
RETURNS TABLE(user_id uuid, net_balance numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    WITH members AS (
        SELECT gm.user_id
        FROM   public.group_members gm
        WHERE  gm.group_id  = p_group_id
          AND  gm.is_active = true
    ),
    -- Amount each member paid on behalf of the group
    paid AS (
        SELECT e.paid_by                AS user_id,
               COALESCE(SUM(e.amount), 0) AS total_paid
        FROM   public.expenses e
        WHERE  e.group_id = p_group_id
        GROUP  BY e.paid_by
    ),
    -- Amount each member owes according to their splits
    owed AS (
        SELECT es.user_id,
               COALESCE(SUM(es.amount), 0) AS total_owed
        FROM   public.expense_splits es
        JOIN   public.expenses       e  ON e.id = es.expense_id
        WHERE  e.group_id = p_group_id
        GROUP  BY es.user_id
    ),
    -- Net cash already transferred via settlements (positive = received, negative = sent)
    settled AS (
        SELECT s.paid_to                 AS user_id,
               COALESCE(SUM(s.amount), 0) AS received
        FROM   public.settlements s
        WHERE  s.group_id = p_group_id
        GROUP  BY s.paid_to

        UNION ALL

        SELECT s.paid_by                    AS user_id,
               -COALESCE(SUM(s.amount), 0)  AS received
        FROM   public.settlements s
        WHERE  s.group_id = p_group_id
        GROUP  BY s.paid_by
    ),
    settled_net AS (
        SELECT user_id, SUM(received) AS net_settled
        FROM   settled
        GROUP  BY user_id
    )
    SELECT
        m.user_id,
        ROUND(
            COALESCE(p.total_paid,  0)
            - COALESCE(o.total_owed, 0)
            + COALESCE(sn.net_settled, 0),
            2
        ) AS net_balance
    FROM       members    m
    LEFT JOIN  paid        p   ON p.user_id  = m.user_id
    LEFT JOIN  owed        o   ON o.user_id  = m.user_id
    LEFT JOIN  settled_net sn  ON sn.user_id = m.user_id
    ORDER BY   net_balance DESC;
$$;

-- -----------------------------------------------------------------------------
-- 5.6  get_simplified_debts
--      Greedy debt-simplification: minimises the number of transactions needed
--      to bring all balances to zero.
-- -----------------------------------------------------------------------------
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
    v_creditors     integer[];
    v_debtors       integer[];
    v_ci            integer;    -- creditor index in v_user_ids
    v_di            integer;    -- debtor  index in v_user_ids
    v_credit        numeric;
    v_debt          numeric;
    v_transfer      numeric;
    i               integer;
BEGIN
    -- Load balances into parallel arrays for in-memory manipulation
    SELECT
        array_agg(gb.user_id    ORDER BY gb.net_balance DESC),
        array_agg(gb.net_balance ORDER BY gb.net_balance DESC)
    INTO v_user_ids, v_balances
    FROM public.get_group_balances(p_group_id) gb;

    IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
        RETURN;
    END IF;

    -- Separate into creditor indices (balance > 0) and debtor indices (balance < 0)
    -- We rebuild these sets dynamically in the loop below; initialise here.
    LOOP
        -- Find the largest creditor and the largest debtor
        v_ci := NULL;
        v_di := NULL;

        FOR i IN 1 .. array_length(v_user_ids, 1) LOOP
            IF v_balances[i] > 0.005 THEN   -- treat < 0.01 as settled (rounding)
                IF v_ci IS NULL OR v_balances[i] > v_balances[v_ci] THEN
                    v_ci := i;
                END IF;
            END IF;
            IF v_balances[i] < -0.005 THEN
                IF v_di IS NULL OR v_balances[i] < v_balances[v_di] THEN
                    v_di := i;
                END IF;
            END IF;
        END LOOP;

        -- No more meaningful debts
        EXIT WHEN v_ci IS NULL OR v_di IS NULL;

        v_credit   := v_balances[v_ci];
        v_debt     := -v_balances[v_di];    -- positive value
        v_transfer := LEAST(v_credit, v_debt);

        -- Yield this simplified transfer
        from_user := v_user_ids[v_di];
        to_user   := v_user_ids[v_ci];
        amount    := ROUND(v_transfer, 2);
        RETURN NEXT;

        -- Reduce balances
        v_balances[v_ci] := v_balances[v_ci] - v_transfer;
        v_balances[v_di] := v_balances[v_di] + v_transfer;
    END LOOP;

    RETURN;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5.7  settle_debt
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_debt(
    p_group_id uuid,
    p_paid_to  uuid,
    p_amount   numeric,
    p_notes    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settlement_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be greater than zero';
    END IF;

    -- Both parties must be active members
    IF NOT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = p_group_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Caller is not an active member of the group';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = p_group_id AND user_id = p_paid_to AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Recipient is not an active member of the group';
    END IF;

    INSERT INTO public.settlements (group_id, paid_by, paid_to, amount, notes)
    VALUES (p_group_id, auth.uid(), p_paid_to, p_amount, p_notes)
    RETURNING id INTO v_settlement_id;

    RETURN v_settlement_id;
END;
$$;


-- =============================================================================
-- PHASE 6: Row-Level Security policies
-- =============================================================================

-- Helper: check whether the calling user is an active member of a given group.
-- This is inlined as a SQL expression inside policies to keep them efficient.

-- -----------------------------------------------------------------------------
-- 6.1  groups
-- -----------------------------------------------------------------------------
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Members can see their own groups
CREATE POLICY groups_select_policy ON public.groups
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = id
              AND gm.user_id  = auth.uid()
              AND gm.is_active = true
        )
    );

-- Only owners can update group metadata
CREATE POLICY groups_update_policy ON public.groups
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = id
              AND gm.user_id  = auth.uid()
              AND gm.role     = 'owner'
              AND gm.is_active = true
        )
    );

-- Only owners can delete (soft-delete via is_active preferred)
CREATE POLICY groups_delete_policy ON public.groups
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = id
              AND gm.user_id  = auth.uid()
              AND gm.role     = 'owner'
              AND gm.is_active = true
        )
    );

-- Any authenticated user can insert (create_group RPC handles this under SECURITY DEFINER)
CREATE POLICY groups_insert_policy ON public.groups
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- -----------------------------------------------------------------------------
-- 6.2  group_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Members can see all members of groups they belong to
CREATE POLICY group_members_select_policy ON public.group_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.is_active = true
        )
    );

-- Owners and admins can insert/update/delete members; users can also manage themselves (leave)
CREATE POLICY group_members_insert_policy ON public.group_members
    FOR INSERT
    WITH CHECK (
        -- The join_group RPC is SECURITY DEFINER so this covers self-join
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.role      IN ('owner', 'admin')
              AND gm.is_active = true
        )
    );

CREATE POLICY group_members_update_policy ON public.group_members
    FOR UPDATE
    USING (
        -- Users can update their own record (e.g., leave via leave_group RPC)
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.role      IN ('owner', 'admin')
              AND gm.is_active = true
        )
    );

CREATE POLICY group_members_delete_policy ON public.group_members
    FOR DELETE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.role      IN ('owner', 'admin')
              AND gm.is_active = true
        )
    );

-- -----------------------------------------------------------------------------
-- 6.3  group_settings
-- -----------------------------------------------------------------------------
ALTER TABLE public.group_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_settings_select_policy ON public.group_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.is_active = true
        )
    );

CREATE POLICY group_settings_update_policy ON public.group_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.role      IN ('owner', 'admin')
              AND gm.is_active = true
        )
    );

-- Only the create_group RPC (SECURITY DEFINER) inserts into group_settings
CREATE POLICY group_settings_insert_policy ON public.group_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.role      = 'owner'
              AND gm.is_active = true
        )
    );

-- -----------------------------------------------------------------------------
-- 6.4  expense_splits
-- -----------------------------------------------------------------------------
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- Members of the expense's group can view splits
CREATE POLICY expense_splits_select_policy ON public.expense_splits
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM   public.expenses      e
            JOIN   public.group_members gm ON gm.group_id = e.group_id
            WHERE  e.id         = expense_id
              AND  gm.user_id   = auth.uid()
              AND  gm.is_active = true
        )
        -- Also allow seeing your own personal-expense splits (group_id IS NULL)
        OR user_id = auth.uid()
    );

-- Expense creator or group owner/admin can insert splits
CREATE POLICY expense_splits_insert_policy ON public.expense_splits
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.expenses e
            WHERE e.id      = expense_id
              AND e.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM   public.expenses      e
            JOIN   public.group_members gm ON gm.group_id = e.group_id
            WHERE  e.id         = expense_id
              AND  gm.user_id   = auth.uid()
              AND  gm.role      IN ('owner', 'admin')
              AND  gm.is_active = true
        )
    );

CREATE POLICY expense_splits_update_policy ON public.expense_splits
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.expenses e
            WHERE e.id      = expense_id
              AND e.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM   public.expenses      e
            JOIN   public.group_members gm ON gm.group_id = e.group_id
            WHERE  e.id         = expense_id
              AND  gm.user_id   = auth.uid()
              AND  gm.role      IN ('owner', 'admin')
              AND  gm.is_active = true
        )
    );

CREATE POLICY expense_splits_delete_policy ON public.expense_splits
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.expenses e
            WHERE e.id      = expense_id
              AND e.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM   public.expenses      e
            JOIN   public.group_members gm ON gm.group_id = e.group_id
            WHERE  e.id         = expense_id
              AND  gm.user_id   = auth.uid()
              AND  gm.role      IN ('owner', 'admin')
              AND  gm.is_active = true
        )
    );

-- -----------------------------------------------------------------------------
-- 6.5  settlements
-- -----------------------------------------------------------------------------
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- All active group members can view settlements
CREATE POLICY settlements_select_policy ON public.settlements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.is_active = true
        )
    );

-- Any active member can create a settlement (settle_debt RPC validates amounts)
CREATE POLICY settlements_insert_policy ON public.settlements
    FOR INSERT
    WITH CHECK (
        paid_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id  = group_id
              AND gm.user_id   = auth.uid()
              AND gm.is_active = true
        )
    );

-- Settlements are immutable once created (no UPDATE / DELETE policies)

-- -----------------------------------------------------------------------------
-- 6.6  expenses — update existing RLS to reflect new group_id column
--      Drop obsolete policies (if they were scope/family_id based) and
--      replace them with group-aware ones.
-- -----------------------------------------------------------------------------

-- Drop any existing policies that may reference scope or family_id
DROP POLICY IF EXISTS expenses_select_policy ON public.expenses;
DROP POLICY IF EXISTS expenses_insert_policy ON public.expenses;
DROP POLICY IF EXISTS expenses_update_policy ON public.expenses;
DROP POLICY IF EXISTS expenses_delete_policy ON public.expenses;

-- Ensure RLS is enabled
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Users can see:
--   a) their own personal expenses (group_id IS NULL, user_id = caller)
--   b) all expenses belonging to groups they are active members of
CREATE POLICY expenses_select_policy ON public.expenses
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR (
            group_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.group_members gm
                WHERE gm.group_id  = group_id
                  AND gm.user_id   = auth.uid()
                  AND gm.is_active = true
            )
        )
    );

-- Users can only insert their own expenses
CREATE POLICY expenses_insert_policy ON public.expenses
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Owners can update their own expenses; group owners/admins can also update group expenses
CREATE POLICY expenses_update_policy ON public.expenses
    FOR UPDATE
    USING (
        user_id = auth.uid()
        OR (
            group_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.group_members gm
                WHERE gm.group_id  = group_id
                  AND gm.user_id   = auth.uid()
                  AND gm.role      IN ('owner', 'admin')
                  AND gm.is_active = true
            )
        )
    );

-- Deletion follows the same rules as update
CREATE POLICY expenses_delete_policy ON public.expenses
    FOR DELETE
    USING (
        user_id = auth.uid()
        OR (
            group_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.group_members gm
                WHERE gm.group_id  = group_id
                  AND gm.user_id   = auth.uid()
                  AND gm.role      IN ('owner', 'admin')
                  AND gm.is_active = true
            )
        )
    );

COMMIT;
