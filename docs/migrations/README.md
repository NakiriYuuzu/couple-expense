# Database Migrations

> Last updated: 2026-03-09 (Phase 5 hardening pass)

## Migration 001: couple → family domain rename

### Artifact Index

| File | Type | Purpose |
|------|------|---------|
| `001-couple-to-family.sql` | **Executable** | Forward migration — run in Supabase SQL Editor or psql |
| `001-couple-to-family-rollback.sql` | **Executable** | Rollback migration — reverts renames (but NOT dropped columns) |
| `001-pre-migration-validation.sql` | **Executable** | Pre-flight checks + dependency audit — run before migration |
| `001-post-migration-validation.sql` | **Executable** | Post-flight checks — run after migration to verify success |
| `CUTOVER-RUNBOOK.md` | **Guidance** | Step-by-step operational runbook for staging and production cutover |
| `README.md` | **Guidance** | This file — artifact index and context |

> **Executable** = intended to be pasted into SQL Editor and run.
> **Guidance** = documentation only, not meant to be executed.

### What this migration does

1. **Renames** tables (`couples` → `families`, `couple_settings` → `family_settings`), columns (`couple_id` → `family_id`), constraints, and RPC functions (`create_couple` → `create_family`, `join_couple` → `join_family`).
2. **Drops 4 notification columns** (`user_settings.fcm_token`, `user_settings.email_notifications`, `user_settings.push_notifications`, `family_settings.notifications`). These columns are unused — Firebase/notification code was fully removed in Phase 1.

### What this migration does NOT do

- Delete any user data (expenses, profiles, families)
- Change primary key values or relationships
- Modify the `budget_alerts` table structure (see below)

### budget_alerts table status

The `budget_alerts` table is **intentionally kept**. It is NOT a notification residue — it is a domain alert model used for in-app budget warnings (e.g., "you've exceeded 80% of your monthly budget"). It has no dependency on Firebase or push notifications.

The migration renames `budget_alerts.couple_id` → `budget_alerts.family_id` (conditional — only if the table exists). No columns are dropped from this table.

### Companion docs (in `docs/plans/`)

These are **design-time reference documents** created during planning. They describe the overall refactor strategy across all phases (0–7), not just the database migration. They may contain simplified SQL outlines that differ from the final executable SQL in this directory.

| File | Status |
|------|--------|
| `2026-03-08-family-expense-refactor-design.md` | Reference — overall architecture and design decisions |
| `2026-03-08-family-expense-refactor-plan.md` | Reference — phase-by-phase implementation plan |

### Execution order

See `CUTOVER-RUNBOOK.md` for the full operational procedure. In brief:

1. Run `001-pre-migration-validation.sql` — all checks must pass, audit results reviewed
2. Run `001-couple-to-family.sql` — single transaction, auto-rollback on error
3. Run `001-post-migration-validation.sql` — all checks must pass
4. Deploy updated frontend
