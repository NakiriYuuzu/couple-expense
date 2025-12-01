-- Migration: Add personal monthly budget to user_profiles table
-- Description: Adds personal_monthly_budget column for individual budget tracking
-- Created: 2025-12-01

-- Add personal_monthly_budget column with default NULL (表示未設定)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS personal_monthly_budget numeric DEFAULT NULL;

-- Add CHECK constraint to ensure non-negative budget
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_personal_budget_check'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_personal_budget_check
    CHECK (personal_monthly_budget IS NULL OR personal_monthly_budget >= 0);
  END IF;
END $$;
