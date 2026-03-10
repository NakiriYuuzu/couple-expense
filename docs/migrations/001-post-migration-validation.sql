-- =============================================================================
-- Post-Migration Validation for 001-couple-to-family
-- =============================================================================
-- Run these checks AFTER executing the migration to verify success.
-- Compare row counts with pre-migration values to ensure no data loss.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Check 1: Verify new tables exist
-- Expected: 2 rows (families, family_settings)
-- ---------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('families', 'family_settings')
ORDER BY table_name;

-- ---------------------------------------------------------------------------
-- Check 2: Verify old table names are gone
-- Expected: 0 rows
-- ---------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('couples', 'couple_settings');

-- ---------------------------------------------------------------------------
-- Check 3: Verify family_id columns exist
-- Expected: 2-3 rows (user_profiles, family_settings, optionally budget_alerts)
-- ---------------------------------------------------------------------------
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'family_id'
ORDER BY table_name;

-- ---------------------------------------------------------------------------
-- Check 4: Verify couple_id columns are gone
-- Expected: 0 rows
-- ---------------------------------------------------------------------------
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'couple_id';

-- ---------------------------------------------------------------------------
-- Check 5: Verify new RPC functions exist
-- Expected: 2 rows (create_family, join_family)
-- ---------------------------------------------------------------------------
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_family', 'join_family')
ORDER BY routine_name;

-- ---------------------------------------------------------------------------
-- Check 6: Verify old RPC functions are gone
-- Expected: 0 rows
-- ---------------------------------------------------------------------------
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_couple', 'join_couple');

-- ---------------------------------------------------------------------------
-- Check 7: Verify row counts match pre-migration values
-- IMPORTANT: Compare these with pre-migration Check 7 results
-- Expected: Same counts as before migration
-- ---------------------------------------------------------------------------
SELECT 'families' AS table_name, count(*) AS row_count FROM public.families
UNION ALL
SELECT 'family_settings', count(*) FROM public.family_settings
UNION ALL
SELECT 'user_profiles', count(*) FROM public.user_profiles
UNION ALL
SELECT 'user_profiles_with_family', count(*) FROM public.user_profiles WHERE family_id IS NOT NULL
UNION ALL
SELECT 'expenses', count(*) FROM public.expenses;

-- ---------------------------------------------------------------------------
-- Check 8: Verify referential integrity after migration
-- Expected: 0 rows (no orphaned references)
-- ---------------------------------------------------------------------------
-- user_profiles referencing non-existent families
SELECT up.id AS user_profile_id, up.family_id
FROM public.user_profiles up
LEFT JOIN public.families f ON f.id = up.family_id
WHERE up.family_id IS NOT NULL AND f.id IS NULL;

-- family_settings referencing non-existent families
SELECT fs.id AS settings_id, fs.family_id
FROM public.family_settings fs
LEFT JOIN public.families f ON f.id = fs.family_id
WHERE f.id IS NULL;

-- ---------------------------------------------------------------------------
-- Check 9: Verify renamed constraints exist
-- Expected: Each should return 1 row
-- ---------------------------------------------------------------------------
SELECT conname FROM pg_constraint WHERE conname = 'families_pkey';
SELECT conname FROM pg_constraint WHERE conname = 'family_settings_pkey';
SELECT conname FROM pg_constraint WHERE conname = 'family_settings_family_id_fkey';
SELECT conname FROM pg_constraint WHERE conname = 'user_profiles_family_id_fkey';

-- ---------------------------------------------------------------------------
-- Check 10: Verify notification columns were cleaned up
-- Expected: 0 rows
-- ---------------------------------------------------------------------------
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'user_settings' AND column_name IN ('fcm_token', 'email_notifications', 'push_notifications'))
    OR
    (table_name = 'family_settings' AND column_name = 'notifications')
  );

-- ---------------------------------------------------------------------------
-- Check 11: Smoke test - try a basic query the frontend would make
-- Expected: Should not error (returns whatever data exists)
-- ---------------------------------------------------------------------------
SELECT id, name, invitation_code FROM public.families LIMIT 1;
SELECT id, family_id, monthly_budget FROM public.family_settings LIMIT 1;
SELECT id, family_id, role FROM public.user_profiles WHERE family_id IS NOT NULL LIMIT 1;

-- ---------------------------------------------------------------------------
-- Check 12: Verify function permissions
-- Expected: 2 rows showing authenticated role has EXECUTE
-- ---------------------------------------------------------------------------
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('create_family', 'join_family')
  AND grantee = 'authenticated';
