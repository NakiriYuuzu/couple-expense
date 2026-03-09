-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Updated: 2026-03-09 (V2: Multi-group + Split expenses)

CREATE TABLE public.groups (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    invitation_code text UNIQUE,
    max_members integer DEFAULT 10 CHECK (max_members >= 2 AND max_members <= 10),
    created_by uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT groups_pkey PRIMARY KEY (id),
    CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

CREATE TABLE public.group_members (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])),
    is_active boolean DEFAULT true,
    joined_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT group_members_pkey PRIMARY KEY (id),
    CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE,
    CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id)
);

CREATE TABLE public.group_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL UNIQUE,
    monthly_budget numeric DEFAULT 0,
    budget_start_day integer DEFAULT 1 CHECK (budget_start_day >= 1 AND budget_start_day <= 28),
    category_budgets jsonb DEFAULT '{}'::jsonb,
    currency text DEFAULT 'TWD'::text CHECK (currency = ANY (ARRAY['TWD'::text, 'USD'::text, 'EUR'::text, 'JPY'::text, 'CNY'::text])),
    default_split_method text DEFAULT 'equal'::text CHECK (default_split_method = ANY (ARRAY['equal'::text, 'exact'::text, 'percentage'::text, 'shares'::text])),
    simplify_debts boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT group_settings_pkey PRIMARY KEY (id),
    CONSTRAINT group_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE
);

CREATE TABLE public.expenses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    group_id uuid,
    title text NOT NULL,
    amount numeric NOT NULL,
    category text NOT NULL,
    icon text,
    date date NOT NULL DEFAULT CURRENT_DATE,
    currency text DEFAULT 'TWD'::text,
    split_method text CHECK (split_method = ANY (ARRAY['equal'::text, 'exact'::text, 'percentage'::text, 'shares'::text])),
    paid_by uuid,
    notes text,
    is_settled boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT expenses_pkey PRIMARY KEY (id),
    CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT expenses_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL,
    CONSTRAINT expenses_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES auth.users(id)
);

CREATE TABLE public.expense_splits (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    expense_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    percentage numeric,
    shares integer,
    is_settled boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT expense_splits_pkey PRIMARY KEY (id),
    CONSTRAINT expense_splits_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE,
    CONSTRAINT expense_splits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
    CONSTRAINT expense_splits_expense_id_user_id_key UNIQUE (expense_id, user_id)
);

CREATE TABLE public.settlements (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    paid_by uuid NOT NULL,
    paid_to uuid NOT NULL,
    amount numeric NOT NULL CHECK (amount > 0),
    notes text,
    settled_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT settlements_pkey PRIMARY KEY (id),
    CONSTRAINT settlements_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE,
    CONSTRAINT settlements_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES auth.users(id),
    CONSTRAINT settlements_paid_to_fkey FOREIGN KEY (paid_to) REFERENCES auth.users(id)
);

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    email text,
    display_name text,
    avatar_url text,
    personal_monthly_budget numeric,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TABLE public.user_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    language text DEFAULT 'zh-TW'::text CHECK (language = ANY (ARRAY['zh-TW'::text, 'en'::text])),
    theme text DEFAULT 'system'::text CHECK (theme = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text])),
    show_in_statistics boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT user_settings_pkey PRIMARY KEY (id),
    CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- RPC Function Signatures (reference only)
--
-- create_group(p_name text, p_description text) RETURNS uuid
--   Creates a new group, adds caller as owner, initialises group_settings.
--
-- join_group(p_invitation_code text) RETURNS uuid
--   Adds caller to the group identified by invitation_code; returns group id.
--
-- leave_group(p_group_id uuid) RETURNS boolean
--   Removes caller from the group; owner must transfer ownership first.
--
-- add_group_expense(
--   p_group_id uuid,
--   p_title text,
--   p_amount numeric,
--   p_category text,
--   p_icon text,
--   p_date date,
--   p_currency text,
--   p_split_method text,
--   p_paid_by uuid,
--   p_notes text,
--   p_splits jsonb
-- ) RETURNS uuid
--   Inserts an expense and its corresponding expense_splits rows atomically.
--
-- get_group_balances(p_group_id uuid)
--   RETURNS TABLE(user_id uuid, net_balance numeric)
--   Calculates net balance per member (positive = owed money, negative = owes money).
--
-- get_simplified_debts(p_group_id uuid)
--   RETURNS TABLE(from_user uuid, to_user uuid, amount numeric)
--   Returns the minimal set of transactions that settles all debts in the group.
--
-- settle_debt(p_group_id uuid, p_paid_to uuid, p_amount numeric, p_notes text)
--   RETURNS uuid
--   Records a settlement and marks related expense_splits as settled.
