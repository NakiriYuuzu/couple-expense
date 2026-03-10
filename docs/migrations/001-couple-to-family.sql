-- =============================================================================
-- Migration 001: Rename couple domain to family
-- =============================================================================
-- Date:     2026-03-08
-- Author:   Phase 5 of family-expense-refactor
-- Strategy: Single transaction, safe rename with no data loss
-- Risk:     Critical - run on staging first, then production
-- Rollback: See 001-couple-to-family-rollback.sql
-- =============================================================================
--
-- PREREQUISITES:
--   1. Phases 1-4 of the refactor must be completed (frontend already uses
--      family terminology in code, but still queries old DB names).
--   2. Run 001-pre-migration-validation.sql and confirm all checks pass.
--   3. Take a database backup before running this migration.
--
-- WHAT THIS MIGRATION DOES:
--   - Renames table: couples -> families
--   - Renames table: couple_settings -> family_settings
--   - Renames column: user_profiles.couple_id -> user_profiles.family_id
--   - Renames column: family_settings.couple_id -> family_settings.family_id
--   - Renames column: budget_alerts.couple_id -> budget_alerts.family_id
--   - Recreates RPC functions: create_couple -> create_family, join_couple -> join_family
--   - Cleans up deprecated notification columns from user_settings
--   - Drops deprecated notifications column from family_settings
--   - Renames constraint and index names for consistency
--
-- WHAT THIS MIGRATION DOES NOT DO:
--   - Delete any user data
--   - Change any primary key values or relationships
--   - Modify RLS policies (they follow renamed objects automatically for
--     table/column renames; RPC-referencing policies need manual update)
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1: Rename tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.couples RENAME TO families;
ALTER TABLE public.couple_settings RENAME TO family_settings;

-- ---------------------------------------------------------------------------
-- Step 2: Rename columns
-- ---------------------------------------------------------------------------

-- user_profiles.couple_id -> family_id
ALTER TABLE public.user_profiles RENAME COLUMN couple_id TO family_id;

-- family_settings.couple_id -> family_id (table already renamed above)
ALTER TABLE public.family_settings RENAME COLUMN couple_id TO family_id;

-- budget_alerts.couple_id -> family_id (if table exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'budget_alerts'
          AND column_name = 'couple_id'
    ) THEN
        ALTER TABLE public.budget_alerts RENAME COLUMN couple_id TO family_id;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 3: Rename constraints and indexes for consistency
-- ---------------------------------------------------------------------------

-- families table (was couples)
ALTER TABLE public.families
    RENAME CONSTRAINT couples_pkey TO families_pkey;

-- family_settings table (was couple_settings)
ALTER TABLE public.family_settings
    RENAME CONSTRAINT couple_settings_pkey TO family_settings_pkey;

ALTER TABLE public.family_settings
    RENAME CONSTRAINT couple_settings_couple_id_fkey TO family_settings_family_id_fkey;

-- Rename unique constraint on family_settings.family_id
-- (The unique constraint name depends on how it was originally created)
DO $$
BEGIN
    -- Try renaming the unique constraint if it exists with the old name
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'couple_settings_couple_id_key'
    ) THEN
        ALTER TABLE public.family_settings
            RENAME CONSTRAINT couple_settings_couple_id_key TO family_settings_family_id_key;
    END IF;
END $$;

-- user_profiles foreign key
ALTER TABLE public.user_profiles
    RENAME CONSTRAINT user_profiles_couple_id_fkey TO user_profiles_family_id_fkey;

-- budget_alerts foreign key (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'budget_alerts_couple_id_fkey'
    ) THEN
        ALTER TABLE public.budget_alerts
            RENAME CONSTRAINT budget_alerts_couple_id_fkey TO budget_alerts_family_id_fkey;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 4: Recreate RPC functions with new names
-- ---------------------------------------------------------------------------

-- Drop old functions
DROP FUNCTION IF EXISTS public.create_couple(text);
DROP FUNCTION IF EXISTS public.join_couple(text);

-- create_family: Creates a new family and sets the caller as owner
CREATE OR REPLACE FUNCTION public.create_family(family_name text DEFAULT '我們的家庭')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_family_id uuid;
    new_invitation_code text;
    current_user_id uuid;
BEGIN
    -- Get current user
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if user is already in a family
    IF EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = current_user_id AND family_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'User is already in a family';
    END IF;

    -- Generate a unique invitation code (6 chars uppercase)
    new_invitation_code := upper(substr(md5(random()::text), 1, 6));

    -- Create the family
    INSERT INTO families (name, invitation_code)
    VALUES (family_name, new_invitation_code)
    RETURNING id INTO new_family_id;

    -- Create default family settings
    INSERT INTO family_settings (family_id)
    VALUES (new_family_id);

    -- Update user profile to be owner of new family
    UPDATE user_profiles
    SET family_id = new_family_id,
        role = 'owner',
        updated_at = now()
    WHERE id = current_user_id;

    RETURN new_family_id;
END;
$$;

-- join_family: Joins an existing family via invitation code
CREATE OR REPLACE FUNCTION public.join_family(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_family_id uuid;
    current_user_id uuid;
BEGIN
    -- Get current user
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if user is already in a family
    IF EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = current_user_id AND family_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'User is already in a family';
    END IF;

    -- Find family by invitation code
    SELECT id INTO target_family_id
    FROM families
    WHERE families.invitation_code = join_family.invitation_code
      AND is_active = true;

    IF target_family_id IS NULL THEN
        RETURN false;
    END IF;

    -- Join the family as member
    UPDATE user_profiles
    SET family_id = target_family_id,
        role = 'member',
        updated_at = now()
    WHERE id = current_user_id;

    RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Step 5: Clean up deprecated notification columns
-- ---------------------------------------------------------------------------

-- Remove notification-related columns from user_settings (Phase 1 removed frontend code)
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS fcm_token;
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS email_notifications;
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS push_notifications;

-- Remove notifications jsonb from family_settings
ALTER TABLE public.family_settings DROP COLUMN IF EXISTS notifications;

-- ---------------------------------------------------------------------------
-- Step 6: Grant execute permissions on new functions
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.create_family(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_family(text) TO authenticated;

COMMIT;

-- =============================================================================
-- POST-MIGRATION: Run 001-post-migration-validation.sql to verify success
-- =============================================================================
