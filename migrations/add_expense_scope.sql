-- Migration: Add scope column to expenses table
-- Description: Adds a scope column to differentiate between personal and family expenses
-- Created: 2025-12-01

BEGIN;

-- 1. Add scope column with default 'personal'
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS scope text DEFAULT 'personal';

-- 2. Migrate existing data: Set all existing expenses to 'family'
-- (These were previously shared with couple members)
UPDATE public.expenses SET scope = 'family' WHERE scope = 'personal';

-- 3. Add NOT NULL constraint and CHECK constraint
ALTER TABLE public.expenses
ALTER COLUMN scope SET NOT NULL;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_scope_check CHECK (scope IN ('personal', 'family'));

-- 4. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_expenses_scope ON public.expenses(scope);
CREATE INDEX IF NOT EXISTS idx_expenses_user_scope ON public.expenses(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_expenses_user_scope_date ON public.expenses(user_id, scope, date DESC);

COMMIT;
