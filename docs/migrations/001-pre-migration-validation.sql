-- =============================================================================
-- Pre-Migration Validation for 001-couple-to-family
-- =============================================================================
-- Run these checks BEFORE executing the migration.
-- All queries should return expected results (documented inline).
-- If any check fails, DO NOT proceed with the migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Check 1: Verify source tables exist
-- Expected: 2 rows (couples, couple_settings)
-- ---------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('couples', 'couple_settings')
ORDER BY table_name;

-- ---------------------------------------------------------------------------
-- Check 2: Verify target table names are NOT already taken
-- Expected: 0 rows
-- ---------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('families', 'family_settings');

-- ---------------------------------------------------------------------------
-- Check 3: Verify couple_id columns exist where expected
-- Expected: 2-3 rows (user_profiles, couple_settings, optionally budget_alerts)
-- ---------------------------------------------------------------------------
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'couple_id'
ORDER BY table_name;

-- ---------------------------------------------------------------------------
-- Check 4: Verify family_id columns do NOT exist yet
-- Expected: 0 rows
-- ---------------------------------------------------------------------------
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'family_id';

-- ---------------------------------------------------------------------------
-- Check 5: Verify old RPC functions exist
-- Expected: 2 rows (create_couple, join_couple)
-- ---------------------------------------------------------------------------
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_couple', 'join_couple')
ORDER BY routine_name;

-- ---------------------------------------------------------------------------
-- Check 6: Verify new RPC function names are NOT taken
-- Expected: 0 rows
-- ---------------------------------------------------------------------------
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_family', 'join_family');

-- ---------------------------------------------------------------------------
-- Check 7: Record row counts for post-migration comparison
-- Expected: Note these numbers and compare after migration
-- ---------------------------------------------------------------------------
SELECT 'couples' AS table_name, count(*) AS row_count FROM public.couples
UNION ALL
SELECT 'couple_settings', count(*) FROM public.couple_settings
UNION ALL
SELECT 'user_profiles', count(*) FROM public.user_profiles
UNION ALL
SELECT 'user_profiles_with_couple', count(*) FROM public.user_profiles WHERE couple_id IS NOT NULL
UNION ALL
SELECT 'expenses', count(*) FROM public.expenses;

-- ---------------------------------------------------------------------------
-- Check 8: Verify referential integrity before migration
-- Expected: 0 rows (no orphaned references)
-- ---------------------------------------------------------------------------
-- user_profiles referencing non-existent couples
SELECT up.id AS user_profile_id, up.couple_id
FROM public.user_profiles up
LEFT JOIN public.couples c ON c.id = up.couple_id
WHERE up.couple_id IS NOT NULL AND c.id IS NULL;

-- couple_settings referencing non-existent couples
SELECT cs.id AS settings_id, cs.couple_id
FROM public.couple_settings cs
LEFT JOIN public.couples c ON c.id = cs.couple_id
WHERE c.id IS NULL;

-- ---------------------------------------------------------------------------
-- Check 9: Verify constraints we plan to rename exist
-- Expected: Each should return 1 row
-- ---------------------------------------------------------------------------
SELECT conname FROM pg_constraint WHERE conname = 'couples_pkey';
SELECT conname FROM pg_constraint WHERE conname = 'couple_settings_pkey';
SELECT conname FROM pg_constraint WHERE conname = 'couple_settings_couple_id_fkey';
SELECT conname FROM pg_constraint WHERE conname = 'user_profiles_couple_id_fkey';

-- =============================================================================
-- DEPENDENCY AUDIT: RLS Policies, Triggers, Functions
-- =============================================================================
-- These checks do NOT block migration but MUST be reviewed manually.
-- Record the output and verify that all dependencies will still work
-- after table/column renames and notification column drops.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Audit A: List all RLS policies on tables affected by this migration
-- Action: Review each policy's qual/with_check for references to
--         couple_id, couples, couple_settings, or notification columns.
--         ALTER TABLE RENAME auto-propagates to policies, but verify.
-- ---------------------------------------------------------------------------
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN (
    'couples', 'couple_settings',
    'user_profiles', 'user_settings',
    'budget_alerts', 'expenses'
)
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- Audit B: List all triggers on affected tables
-- Action: Review each trigger's function for references to old names
--         or notification columns. Triggers are NOT auto-updated by RENAME.
-- ---------------------------------------------------------------------------
SELECT
    event_object_table AS table_name,
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN (
    'couples', 'couple_settings',
    'user_profiles', 'user_settings',
    'budget_alerts', 'expenses'
)
ORDER BY event_object_table, trigger_name;

-- ---------------------------------------------------------------------------
-- Audit C: List all functions that reference old domain names
-- Action: Any function body containing 'couple', 'fcm_token',
--         'push_notifications', or 'email_notifications' may need updating.
--         create_couple / join_couple are handled by migration Step 4.
-- ---------------------------------------------------------------------------
SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    pg_get_functiondef(p.oid) ILIKE '%couple%'
    OR pg_get_functiondef(p.oid) ILIKE '%fcm_token%'
    OR pg_get_functiondef(p.oid) ILIKE '%push_notifications%'
    OR pg_get_functiondef(p.oid) ILIKE '%email_notifications%'
  )
ORDER BY p.proname;

-- ---------------------------------------------------------------------------
-- Audit D: List all views that reference affected tables
-- Action: Views are NOT auto-updated by ALTER TABLE RENAME.
--         Any views found here must be manually recreated.
-- ---------------------------------------------------------------------------
SELECT
    v.table_name AS view_name,
    v.view_definition
FROM information_schema.views v
WHERE v.table_schema = 'public'
  AND (
    v.view_definition ILIKE '%couples%'
    OR v.view_definition ILIKE '%couple_settings%'
    OR v.view_definition ILIKE '%couple_id%'
    OR v.view_definition ILIKE '%fcm_token%'
  );

-- ---------------------------------------------------------------------------
-- Audit E: Check Supabase realtime publication for affected tables
-- Action: If tables are in the realtime publication, the rename will
--         change the channel name clients subscribe to.
-- ---------------------------------------------------------------------------
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN (
    'couples', 'couple_settings',
    'user_profiles', 'user_settings',
    'budget_alerts'
)
ORDER BY tablename;
