-- =============================================================================
-- Rollback for Migration 001: Revert family domain back to couple
-- =============================================================================
-- Use this ONLY if migration 001 needs to be reverted.
-- This restores the original table/column/function names.
--
-- WARNING: The 4 notification columns dropped by the forward migration
-- (fcm_token, email_notifications, push_notifications, notifications)
-- are NOT restored by this rollback. That data loss is permanent and
-- intentional — notification code was removed in Phase 1.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1: Recreate old RPC functions (drop new ones)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_family(text);
DROP FUNCTION IF EXISTS public.join_family(text);

-- create_couple: Creates a new couple and sets the caller as owner
CREATE OR REPLACE FUNCTION public.create_couple(couple_name text DEFAULT '我們的家庭')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_couple_id uuid;
    new_invitation_code text;
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = current_user_id AND couple_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'User is already in a couple';
    END IF;

    new_invitation_code := upper(substr(md5(random()::text), 1, 6));

    INSERT INTO couples (name, invitation_code)
    VALUES (couple_name, new_invitation_code)
    RETURNING id INTO new_couple_id;

    INSERT INTO couple_settings (couple_id)
    VALUES (new_couple_id);

    UPDATE user_profiles
    SET couple_id = new_couple_id,
        role = 'owner',
        updated_at = now()
    WHERE id = current_user_id;

    RETURN new_couple_id;
END;
$$;

-- join_couple: Joins an existing couple via invitation code
CREATE OR REPLACE FUNCTION public.join_couple(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_couple_id uuid;
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = current_user_id AND couple_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'User is already in a couple';
    END IF;

    SELECT id INTO target_couple_id
    FROM couples
    WHERE couples.invitation_code = join_couple.invitation_code
      AND is_active = true;

    IF target_couple_id IS NULL THEN
        RETURN false;
    END IF;

    UPDATE user_profiles
    SET couple_id = target_couple_id,
        role = 'member',
        updated_at = now()
    WHERE id = current_user_id;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_couple(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_couple(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Step 2: Rename constraints back
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_profiles
    RENAME CONSTRAINT user_profiles_family_id_fkey TO user_profiles_couple_id_fkey;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'budget_alerts_family_id_fkey'
    ) THEN
        ALTER TABLE public.budget_alerts
            RENAME CONSTRAINT budget_alerts_family_id_fkey TO budget_alerts_couple_id_fkey;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'family_settings_family_id_key'
    ) THEN
        ALTER TABLE public.family_settings
            RENAME CONSTRAINT family_settings_family_id_key TO couple_settings_couple_id_key;
    END IF;
END $$;

ALTER TABLE public.family_settings
    RENAME CONSTRAINT family_settings_family_id_fkey TO couple_settings_couple_id_fkey;

ALTER TABLE public.family_settings
    RENAME CONSTRAINT family_settings_pkey TO couple_settings_pkey;

ALTER TABLE public.families
    RENAME CONSTRAINT families_pkey TO couples_pkey;

-- ---------------------------------------------------------------------------
-- Step 3: Rename columns back
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_profiles RENAME COLUMN family_id TO couple_id;
ALTER TABLE public.family_settings RENAME COLUMN family_id TO couple_id;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'budget_alerts'
          AND column_name = 'family_id'
    ) THEN
        ALTER TABLE public.budget_alerts RENAME COLUMN family_id TO couple_id;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 4: Rename tables back
-- ---------------------------------------------------------------------------

ALTER TABLE public.family_settings RENAME TO couple_settings;
ALTER TABLE public.families RENAME TO couples;

-- ---------------------------------------------------------------------------
-- NOTE: Dropped notification columns are NOT restored by this rollback.
-- If you need them back, add them manually:
--   ALTER TABLE user_settings ADD COLUMN fcm_token text;
--   ALTER TABLE user_settings ADD COLUMN email_notifications boolean DEFAULT true;
--   ALTER TABLE user_settings ADD COLUMN push_notifications boolean DEFAULT true;
--   ALTER TABLE couple_settings ADD COLUMN notifications jsonb DEFAULT '...';
-- ---------------------------------------------------------------------------

COMMIT;
