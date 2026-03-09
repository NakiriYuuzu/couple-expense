# Family Expense Refactor - Implementation Plan

> **Date**: 2026-03-08
> **Companion**: [Design Document](./2026-03-08-family-expense-refactor-design.md)
> **Strategy**: Incremental phases, each independently committable and reviewable

---

## Phase Overview

| Phase | Name | Risk | Reversibility | Estimated Files |
|-------|------|------|---------------|-----------------|
| **0** | Pre-flight checks | None | N/A | 0 |
| **1** | Remove notification system | Low | Git revert | ~10 files |
| **2** | Remove legacy code | None | Git revert | ~4 files |
| **3** | Domain rename (couple → family) | Medium | Git revert | ~15 files |
| **4** | Directory restructure | Medium | Git revert | ~40 files (moves) |
| **5** | Database migration | Critical | Transaction rollback | SQL only |
| **6** | Type safety & cleanup | Low | Git revert | ~10 files |
| **7** | PWA & build verification | Low | N/A | ~3 files |

**Total estimated commits**: 7-10 (one per phase, some phases may split)

---

## Phase 0: Pre-flight Checks

**Goal**: Ensure the codebase builds and we have a clean baseline.

### Tasks
- [ ] `bun install` - Verify dependencies resolve
- [ ] `bun run build` - Verify production build succeeds
- [ ] `git status` - Confirm clean working tree
- [ ] Take stock of any existing `.env` configuration
- [ ] Document current Supabase schema snapshot (already in schema.sql)

### Acceptance Criteria
- Build succeeds
- No uncommitted changes

---

## Phase 1: Remove Notification System

**Goal**: Cleanly remove Firebase/FCM and all notification-related code.
**Risk**: Low - notification is isolated and no other feature depends on it.

### Step 1.1: Delete notification files
```
DELETE: src/lib/firebase.ts
DELETE: src/lib/fcm.ts
DELETE: src/composables/useFirebaseMessaging.ts
DELETE: src/stores/notification.ts
DELETE: src/components/NotificationSettings.vue
DELETE: public/firebase-messaging-sw.js
```

### Step 1.2: Clean notification imports and references

**`src/main.ts`**:
- Remove `useNotificationStore` import
- Remove `initializeNotifications()` function
- Remove DOMContentLoaded event listener

**`src/stores/index.ts`**:
- Remove `export { useNotificationStore, type NotificationHistory } from './notification'`

**`src/stores/expense.ts`**:
- Remove `triggerExpenseNotifications()` method entirely
- Remove notification store import
- Remove notification calls in `addExpense()`

**`src/views/Settings.vue`**:
- Remove notification settings section (drawer, button, toggle)
- Remove NotificationSettings import

### Step 1.3: Remove Firebase dependency
```bash
bun remove firebase
```

### Step 1.4: Clean environment variables

**`env.d.ts`**: Remove Firebase env var types
**`.env.sample`**: Remove Firebase env vars (if present)

### Step 1.5: Clean i18n keys
- Remove notification-related keys from `zh-TW.ts` and `en.ts`

### Step 1.6: Verify
```bash
bun run build
```

### Commit
```
refactor: remove notification system (Firebase/FCM)
```

---

## Phase 2: Remove Legacy Code

**Goal**: Clean up dead code and deprecated files.

### Step 2.1: Delete legacy views
```
DELETE: src/views/Home.vue
DELETE: src/views/Search.vue
```

### Step 2.2: Remove legacy route redirects

**`src/routers/routes/index.ts`**:
- Remove `home` route (redirect to Dashboard)
- Remove `search` route (redirect to Expenses)

### Step 2.3: Clean any remaining references
- Grep for `Home.vue`, `Search.vue` across codebase
- Remove any dead imports

### Step 2.4: Verify
```bash
bun run build
```

### Commit
```
chore: remove legacy Home and Search views
```

---

## Phase 3: Domain Rename (couple → family)

**Goal**: Rename all "couple" references to "family" across the entire frontend.
**Risk**: Medium - wide-reaching text changes; TypeScript will catch broken imports.

### Step 3.1: Rename store file and internals

**Rename file**: `src/stores/couple.ts` → `src/stores/family.ts`

**Inside `family.ts`**:
- `useCoupleStore` → `useFamilyStore`
- `couple` state → `family`
- `coupleSettings` → `familySettings`
- `partnerProfile` → `memberProfiles` (prepare for >2 members)
- `isInCouple` → `isInFamily`
- `isOwner` → `isOwner` (no change)
- `hasPartner` → `hasMembers`
- `fetchCouple()` → `fetchFamily()`
- `createCouple()` → `createFamily()`
- `joinCoupleWithCode()` → `joinFamilyWithCode()`
- `leaveCouple()` → `leaveFamily()`
- `updateCoupleSettings()` → `updateFamilySettings()`
- `fetchCoupleSettings()` → `fetchFamilySettings()`
- `fetchPartnerProfile()` → `fetchMemberProfiles()`

**Note**: Supabase table queries stay as `couples`/`couple_settings` until Phase 5 DB migration.
Use a mapping layer or comments to indicate pending DB rename.

### Step 3.2: Update store barrel export

**`src/stores/index.ts`**:
- Replace couple store export with family store

### Step 3.3: Rename view file

**Rename**: `src/views/CoupleSettings.vue` → `src/views/FamilySettings.vue`

### Step 3.4: Rename component file

**Rename**: `src/components/CoupleManagement.vue` → `src/components/FamilyManagement.vue`

### Step 3.5: Update route definitions

**`src/routers/routes/index.ts`**:
- `coupleSettings` → `familySettings`
- Path: `/couple-settings` → `/family`
- Name: `CoupleSettings` → `FamilySettings`
- Title: `情侶設定` → `家庭設定`
- Component import: `FamilySettings.vue`

### Step 3.6: Update all consuming files

Files that import/reference couple store or components:
- `src/App.vue` - `useCoupleStore()` → `useFamilyStore()`
- `src/views/Dashboard.vue` - All couple references
- `src/views/Expenses.vue` - Couple references in scope logic
- `src/views/Statistics.vue` - Couple references
- `src/views/Settings.vue` - Couple settings navigation
- `src/views/FamilySettings.vue` - Component import
- `src/components/AddExpenseDrawer.vue` - isInCouple check
- `src/components/BottomNavigation.vue` - (verify)
- `src/components/CalendarView.vue` - (verify)
- `src/components/ChartView.vue` - (verify)
- `src/components/FamilyManagement.vue` - Internal couple references
- `src/stores/expense.ts` - Couple store dependency

### Step 3.7: Update i18n translations

**`src/i18n/locales/zh-TW.ts`**: All "情侶" → "家庭", "伴侶" → "成員"
**`src/i18n/locales/en.ts`**: All "couple" → "family", "partner" → "member"

### Step 3.8: Update database types

**`src/lib/database.types.ts`**:
- Update type names to use family terminology
- Keep actual table/column names matching DB until Phase 5

### Step 3.9: Update PWA manifest

**`vite.config.ts`**:
- App description: "紀錄情侶的共同開支" → "紀錄家庭的共同開支"

### Step 3.10: Verify
```bash
# Ensure no "couple" references remain (except DB queries pending Phase 5)
grep -ri "couple" src/ --include="*.ts" --include="*.vue" | grep -v "node_modules" | grep -v ".supabase"
bun run build
```

### Commit
```
refactor: rename domain from couple to family
```

---

## Phase 4: Directory Restructure (Feature-Sliced)

**Goal**: Reorganize files into the target architecture.
**Risk**: Medium - many file moves; all import paths change.
**Strategy**: Move files in batches, fix imports after each batch.

### Step 4.1: Create target directory structure
```bash
mkdir -p src/app/router src/app/styles
mkdir -p src/pages/{dashboard,expenses,statistics,settings,family,startup}
mkdir -p src/features/{auth/stores,expense/{components,composables,stores},family/{components,stores},statistics/components}
mkdir -p src/entities/{expense,family,user}
mkdir -p src/shared/{components,composables,lib,stores,i18n/locales,utils}
```

### Step 4.2: Move shared layer (lowest risk)
```
src/components/ui/          → src/shared/components/ui/
src/components/TopBar.vue   → src/shared/components/TopBar.vue
src/components/BottomNavigation.vue → src/shared/components/BottomNavigation.vue
src/components/ThemeToggle.vue → src/shared/components/ThemeToggle.vue
src/components/FloatingActionButton.vue → src/shared/components/FloatingActionButton.vue
src/lib/supabase.ts         → src/shared/lib/supabase.ts
src/lib/database.types.ts   → src/shared/lib/database.types.ts
src/lib/utils.ts            → src/shared/lib/utils.ts
src/composables/usePullToRefresh.ts → src/shared/composables/usePullToRefresh.ts
src/utils/                  → src/shared/utils/
src/i18n/                   → src/shared/i18n/
src/stores/theme.ts         → src/shared/stores/theme.ts
src/stores/locale.ts        → src/shared/stores/locale.ts
```

### Step 4.3: Move entities layer
```
# Create entity type files (extract from database.types.ts and stores)
# src/entities/expense/types.ts
# src/entities/family/types.ts
# src/entities/user/types.ts
```

### Step 4.4: Move feature modules
```
# Auth feature
src/stores/auth.ts          → src/features/auth/stores/auth.ts
src/stores/accountManager.ts → src/features/auth/stores/accountManager.ts

# Expense feature
src/components/AddExpenseDrawer.vue → src/features/expense/components/AddExpenseDrawer.vue
src/components/ExpenseGroup.vue     → src/features/expense/components/ExpenseGroup.vue
src/components/ExpenseItem.vue      → src/features/expense/components/ExpenseItem.vue
src/components/SpendingItem.vue     → src/features/expense/components/SpendingItem.vue
src/composables/useCategories.ts    → src/features/expense/composables/useCategories.ts
src/stores/expense.ts               → src/features/expense/stores/expense.ts

# Family feature
src/components/FamilyManagement.vue → src/features/family/components/FamilyManagement.vue
src/stores/family.ts                → src/features/family/stores/family.ts

# Statistics feature
src/components/CalendarView.vue     → src/features/statistics/components/CalendarView.vue
src/components/ChartView.vue        → src/features/statistics/components/ChartView.vue
```

### Step 4.5: Move pages
```
src/views/Dashboard.vue     → src/pages/dashboard/DashboardPage.vue
src/views/Expenses.vue      → src/pages/expenses/ExpensesPage.vue
src/views/Statistics.vue    → src/pages/statistics/StatisticsPage.vue
src/views/Settings.vue      → src/pages/settings/SettingsPage.vue
src/views/FamilySettings.vue → src/pages/family/FamilySettingsPage.vue
src/views/Startup.vue       → src/pages/startup/StartupPage.vue
```

### Step 4.6: Move app shell
```
src/App.vue                 → src/app/App.vue
src/main.ts                 → src/app/main.ts
src/routers/                → src/app/router/
src/assets/css/style.css    → src/app/styles/main.css
```

### Step 4.7: Update Pinia barrel export
```
src/stores/index.ts → src/shared/stores/index.ts
# Re-export all stores from their new locations
```

### Step 4.8: Update all import paths
- Update `@/` alias base if needed (should still point to `src/`)
- Fix all broken imports (TypeScript compiler will flag these)
- Update `components.json` paths for shadcn

### Step 4.9: Update Vite config
- Entry point: `src/app/main.ts`
- CSS import path in main.ts

### Step 4.10: Verify
```bash
bun run build
```

### Commit
```
refactor: restructure to feature-sliced directory layout
```

---

## Phase 5: Database Migration

**Goal**: Rename DB tables and columns from couple → family.
**Risk**: Critical - affects production data.
**Strategy**: Single transaction, tested on staging first.

### Step 5.1: Migration SQL (already written)

The complete migration SQL and supporting artifacts are in `docs/migrations/`:

| File | Purpose |
|------|---------|
| `001-couple-to-family.sql` | Forward migration (executable) |
| `001-couple-to-family-rollback.sql` | Rollback migration (executable) |
| `001-pre-migration-validation.sql` | Pre-flight checks + dependency audit (executable) |
| `001-post-migration-validation.sql` | Post-flight checks (executable) |
| `CUTOVER-RUNBOOK.md` | Operational runbook (guidance) |
| `README.md` | Artifact index and context (guidance) |

The migration runs as a single transaction and:
1. Renames tables, columns, constraints (couple → family)
2. Recreates RPC functions (`create_family`, `join_family`)
3. Drops 4 deprecated notification columns (irreversible, intentional)
4. Grants execute permissions on new functions

See `docs/migrations/CUTOVER-RUNBOOK.md` for the full staging and production procedure.

### Step 5.2: Update frontend Supabase queries
After DB migration, update all `supabase.from()` calls:
- `'couples'` → `'families'`
- `'couple_settings'` → `'family_settings'`
- `.eq('couple_id', ...)` → `.eq('family_id', ...)`
- `.rpc('create_couple', ...)` → `.rpc('create_family', ...)`
- `.rpc('join_couple', ...)` → `.rpc('join_family', ...)`

### Step 5.3: Update database.types.ts
Regenerate types or manually update table/column names.

### Step 5.4: Test migration on staging
1. Clone production DB to staging
2. Run migration SQL
3. Deploy frontend pointing to staging
4. Verify all flows work

### Step 5.5: Execute production migration
1. Enter maintenance mode (optional)
2. Run migration SQL in single transaction
3. Deploy frontend
4. Verify

### Commit (frontend changes only)
```
feat: update Supabase queries for family schema
```

---

## Phase 6: Type Safety & Cleanup

**Goal**: Strengthen TypeScript types and clean up tech debt.

### Step 6.1: Extract entity types
Create clean type definitions in `src/entities/`:
```typescript
// entities/expense/types.ts
export type CategoryId = 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
export type ExpenseScope = 'personal' | 'family'

export interface Expense {
    id: string
    user_id: string
    title: string
    amount: number
    category: CategoryId
    icon: string
    date: string
    scope: ExpenseScope
    created_at: string
    updated_at: string
    user?: ExpenseUser
}

export interface ExpenseUser {
    id: string
    display_name: string | null
    avatar_url: string | null
}
```

### Step 6.2: Replace `any` types
- `App.vue handleExpenseAdded(expense: any)` → proper type
- Store action parameters → typed interfaces
- Supabase query results → proper generics

### Step 6.3: Remove unused exports and dead code
- Grep for unused functions
- Remove dead computed properties

### Step 6.4: Verify
```bash
bun run build  # Should have zero TS errors
```

### Commit
```
refactor: strengthen type safety and clean up tech debt
```

---

## Phase 7: PWA & Build Verification

**Goal**: Ensure PWA still works after all changes.

### Step 7.1: Update PWA manifest
- App name: "家庭記帳" (or keep "記帳App")
- Description: Update to family-centered wording
- Verify icons still resolve

### Step 7.2: Remove Firebase service worker registration
- Ensure `firebase-messaging-sw.js` was deleted in Phase 1
- Verify no stale SW references in vite.config.ts

### Step 7.3: Test PWA
- Build production: `bun run build`
- Preview: `bun run preview`
- Verify install prompt works
- Verify offline caching works

### Step 7.4: Update project metadata
- `package.json`: name `couple-expense` → `family-expense`
- `CLAUDE.md`: Update documentation
- `schema.sql`: Update with new schema

### Commit
```
chore: update PWA manifest and project metadata for family rebrand
```

---

## Migration Strategy: One-Shot Cutover

### Pre-Migration Checklist
- [ ] All Phase 1-4 completed and merged
- [ ] Phase 5 migration SQL tested on staging
- [ ] Staging fully verified with new frontend + new schema
- [ ] Rollback plan documented

### Cutover Steps
1. **T-1h**: Final staging verification
2. **T-0**: Begin maintenance window
3. **T+1m**: Run Phase 5 migration SQL on production
4. **T+3m**: Deploy new frontend to production
5. **T+5m**: Smoke test all critical flows
6. **T+10m**: End maintenance window
7. **T+1h**: Monitor for errors

### Rollback Plan
- **Frontend**: Revert to previous deployment
- **Database**: Run rollback SQL (renames back to couple domain)
- **Limitation**: The 4 notification columns dropped by the forward migration are NOT restored by rollback (intentional — notification code was removed in Phase 1)

---

## File Change Summary

### Files to DELETE (8)
```
src/lib/firebase.ts
src/lib/fcm.ts
src/composables/useFirebaseMessaging.ts
src/stores/notification.ts
src/components/NotificationSettings.vue
public/firebase-messaging-sw.js
src/views/Home.vue
src/views/Search.vue
```

### Files to RENAME (5)
```
src/stores/couple.ts          → src/features/family/stores/family.ts
src/views/CoupleSettings.vue  → src/pages/family/FamilySettingsPage.vue
src/components/CoupleManagement.vue → src/features/family/components/FamilyManagement.vue
src/views/Dashboard.vue       → src/pages/dashboard/DashboardPage.vue
(... all views → pages/)
```

### Files to MOVE (~35)
All files move into the new feature-sliced structure per Phase 4.

### Files to CREATE (~5)
```
src/entities/expense/types.ts
src/entities/family/types.ts
src/entities/user/types.ts
docs/migrations/001-couple-to-family.sql
```

### Files to HEAVILY MODIFY (~10)
```
src/app/main.ts (was src/main.ts)
src/app/App.vue (was src/App.vue)
src/app/router/routes.ts (was src/routers/routes/index.ts)
src/features/family/stores/family.ts (was src/stores/couple.ts)
src/features/expense/stores/expense.ts (was src/stores/expense.ts)
src/shared/stores/index.ts (was src/stores/index.ts)
src/shared/lib/database.types.ts
src/shared/i18n/locales/zh-TW.ts
src/shared/i18n/locales/en.ts
vite.config.ts
package.json
```

---

## Dependency on Execution Order

```
Phase 0 (pre-flight)
  ↓
Phase 1 (remove notifications) ← safest first, reduces noise
  ↓
Phase 2 (remove legacy) ← further cleanup
  ↓
Phase 3 (domain rename) ← requires clean codebase
  ↓
Phase 4 (directory restructure) ← largest change, needs stable domain names
  ↓
Phase 5 (DB migration) ← requires frontend ready for new schema
  ↓
Phase 6 (type safety) ← polish after structure is final
  ↓
Phase 7 (PWA & verification) ← final validation
```

Each phase MUST pass `bun run build` before proceeding to the next.
