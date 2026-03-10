# Migration 001: Couple-to-Family Cutover Runbook

## Overview

This runbook documents the one-shot cutover from the `couple` domain to the `family` domain in the database.

**What the migration does:**
1. **Renames** tables, columns, constraints, and RPC functions (couple → family)
2. **Drops 4 notification columns** that were deprecated when Firebase was removed in Phase 1

> **Important:** This is NOT a pure metadata rename. The notification column drops are **destructive and irreversible** — data in those columns will be lost permanently. This is intentional, as the notification system was fully removed in Phase 1 and the columns are no longer referenced by any code.

## Files

| File | Purpose |
|------|---------|
| `001-couple-to-family.sql` | Forward migration (run on staging, then production) |
| `001-couple-to-family-rollback.sql` | Rollback migration (reverts everything) |
| `001-pre-migration-validation.sql` | Pre-flight checks (run before migration) |
| `001-post-migration-validation.sql` | Post-flight checks (run after migration) |

## Prerequisites

- [ ] Phases 1-4 of the family-expense-refactor are completed and merged
- [ ] Frontend code already updated with new Supabase query names (families, family_settings, family_id, create_family, join_family)
- [ ] Frontend build passes (`bun run build`)
- [ ] Database backup taken
- [ ] Access to Supabase SQL Editor or `psql` with admin privileges
- [ ] Staging environment available for dry-run

---

## Staging Dry-Run

### Step 1: Prepare Staging Database

```bash
# Option A: Use Supabase branching (if available)
# Option B: Clone production schema to a staging project
```

### Step 2: Run Pre-Migration Validation

1. Open Supabase SQL Editor on staging
2. Paste and run `001-pre-migration-validation.sql`
3. Verify each check matches expected output (documented inline)
4. **Record the row counts from Check 7** — you'll compare these after migration

### Step 3: Run Forward Migration

1. Paste and run `001-couple-to-family.sql`
2. The entire script runs in a single `BEGIN/COMMIT` transaction
3. If any error occurs, the transaction automatically rolls back — no partial state

### Step 4: Run Post-Migration Validation

1. Paste and run `001-post-migration-validation.sql`
2. Verify all checks pass
3. **Compare row counts (Check 7) with pre-migration values** — they must match exactly

### Step 5: Deploy Frontend to Staging

1. Deploy the frontend build that uses new query names
2. Test all critical flows:
   - [ ] Login / session persistence
   - [ ] Create a new family
   - [ ] Join family with invitation code
   - [ ] Add expense (personal scope)
   - [ ] Add expense (family scope)
   - [ ] View expenses list
   - [ ] View statistics
   - [ ] Update family settings (budget, currency)
   - [ ] Leave family
   - [ ] Update personal budget

### Step 6: Test Rollback on Staging

1. Run `001-couple-to-family-rollback.sql`
2. Verify old frontend (or direct queries) still work
3. Re-run forward migration if staging is to be kept in new state

---

## Production Cutover

### Timeline

| Time | Action |
|------|--------|
| T-1h | Final staging verification complete |
| T-15m | Take production database backup |
| T-5m | (Optional) Enable maintenance mode |
| T-0 | Run pre-migration validation |
| T+1m | Run forward migration SQL |
| T+3m | Run post-migration validation |
| T+5m | Deploy new frontend to production |
| T+8m | Smoke test all critical flows |
| T+10m | Disable maintenance mode |
| T+1h | Monitor error logs |
| T+24h | Confirm stable — migration complete |

### Step-by-Step

#### 1. Backup (T-15m)

```sql
-- In Supabase: Settings > Database > Backups > Create backup
-- Or via pg_dump:
pg_dump -Fc --no-owner $DATABASE_URL > backup-pre-migration-001.dump
```

#### 2. Pre-Migration Checks (T-0)

Run `001-pre-migration-validation.sql`. All checks must pass.

#### 3. Execute Migration (T+1m)

Run `001-couple-to-family.sql` in a single execution.

**If it fails**: The transaction rolls back automatically. Investigate the error, fix it, and retry.

#### 4. Verify (T+3m)

Run `001-post-migration-validation.sql`. All checks must pass.

#### 5. Deploy Frontend (T+5m)

Deploy the frontend version that uses new Supabase query names.

#### 6. Smoke Test (T+8m)

Test the critical flows listed in the staging section above.

---

## Rollback Plan

### When to Rollback

- Post-migration validation fails
- Frontend cannot connect to renamed tables
- Critical user-facing errors in production

### How to Rollback

1. **Revert frontend** to previous deployment (the old frontend still queries old names)
2. Run `001-couple-to-family-rollback.sql` on production
3. Verify old table/column names are restored
4. Investigate root cause before retrying

### Rollback Limitations

- The `notifications` column dropped from `family_settings` (was `couple_settings`) is **NOT** restored by rollback. This is intentional — notification code was removed in Phase 1.
- The `fcm_token`, `email_notifications`, and `push_notifications` columns dropped from `user_settings` are **NOT** restored. Same reason.

---

## Data Mapping Reference

| Old Name | New Name | Type |
|----------|----------|------|
| `couples` | `families` | Table |
| `couple_settings` | `family_settings` | Table |
| `user_profiles.couple_id` | `user_profiles.family_id` | Column |
| `couple_settings.couple_id` | `family_settings.family_id` | Column |
| `budget_alerts.couple_id` | `budget_alerts.family_id` | Column |
| `create_couple(couple_name)` | `create_family(family_name)` | RPC Function |
| `join_couple(invitation_code)` | `join_family(invitation_code)` | RPC Function |
| `couples_pkey` | `families_pkey` | Constraint |
| `couple_settings_pkey` | `family_settings_pkey` | Constraint |
| `couple_settings_couple_id_fkey` | `family_settings_family_id_fkey` | Constraint |
| `user_profiles_couple_id_fkey` | `user_profiles_family_id_fkey` | Constraint |

### Columns Dropped (irreversible — not restored by rollback)

| Table | Column | Reason |
|-------|--------|--------|
| `user_settings` | `fcm_token` | Firebase removed in Phase 1 — column unused |
| `user_settings` | `email_notifications` | Firebase removed in Phase 1 — column unused |
| `user_settings` | `push_notifications` | Firebase removed in Phase 1 — column unused |
| `family_settings` | `notifications` | Firebase removed in Phase 1 — column unused |

### budget_alerts table (kept — NOT notification residue)

The `budget_alerts` table is **intentionally preserved**. It is a domain alert model for in-app budget threshold warnings, with no dependency on Firebase or push notifications. The migration only renames `budget_alerts.couple_id` → `budget_alerts.family_id`.

## RLS / Trigger / Function Dependency Audit

> **This checklist is mandatory before production cutover.** Run the Audit queries in `001-pre-migration-validation.sql` (Audits A–E) and work through each item below.

### What auto-propagates (safe)

- `ALTER TABLE ... RENAME` automatically updates RLS policy `qual` / `with_check` expressions that reference renamed tables or columns.
- Foreign key constraints are updated by the explicit `RENAME CONSTRAINT` steps in the migration.

### What does NOT auto-propagate (manual review required)

| Dependency type | Risk | Action |
|-----------------|------|--------|
| **Triggers** on affected tables | Trigger function bodies are NOT updated by RENAME. | Run Audit B. If any trigger references `couple_id`, `couples`, or notification columns, the trigger function must be recreated. |
| **Functions** beyond `create_couple`/`join_couple` | Only the two known RPCs are handled by the migration. Other functions referencing old names will break silently. | Run Audit C. Recreate or patch any additional functions found. |
| **Views** referencing old table/column names | Views are NOT updated by RENAME — they will error at query time. | Run Audit D. Recreate any views found. |
| **Supabase Realtime subscriptions** | If `couples` or `couple_settings` are in the realtime publication, clients subscribing to old channel names will stop receiving events. | Run Audit E. Update frontend subscription channel names if needed. |
| **Supabase Edge Functions / webhooks** | Any edge function or webhook that references old table names will fail. | Grep edge function source for `couples`, `couple_id`, notification column names. |
| **RLS policies referencing RPC functions** | Unlikely but possible. `ALTER TABLE RENAME` does not touch function name references inside policy expressions. | Run Audit A. Inspect `qual` and `with_check` for function calls. |

### Post-migration verification

After running the forward migration, verify dependencies are healthy:

```sql
-- 1. Confirm RLS policies are still active on renamed tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('families', 'family_settings', 'user_profiles', 'budget_alerts')
ORDER BY tablename, policyname;

-- 2. Confirm no triggers reference old names
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('families', 'family_settings', 'user_profiles', 'user_settings', 'budget_alerts');

-- 3. Confirm no functions still reference old names
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND pg_get_functiondef(p.oid) ILIKE '%couple%';
```

### Checklist (fill in during staging dry-run)

- [ ] Audit A (RLS policies) reviewed — no manual fixes needed / fixes applied
- [ ] Audit B (Triggers) reviewed — no triggers reference old names / triggers recreated
- [ ] Audit C (Functions) reviewed — only `create_couple`/`join_couple` found (handled by migration)
- [ ] Audit D (Views) reviewed — no views reference old names / views recreated
- [ ] Audit E (Realtime) reviewed — tables not in realtime publication / subscriptions updated
- [ ] Edge functions / webhooks checked — no references to old names
- [ ] Post-migration verification queries run and results are clean
