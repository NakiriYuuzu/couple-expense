# Family Expense Refactor - Design Document

> **Date**: 2026-03-08
> **Status**: Draft - Pending Approval
> **Scope**: Full-system domain restructuring refactor (couple -> family)

---

## 1. Executive Summary

將現有的「情侶記帳」(couple-expense) 應用重構為「家庭記帳」(family-expense) 應用。這不是單純的文字替換，而是領域模型的結構性重構，涵蓋 schema 演進、前端架構現代化、通知功能移除，以及 UX 流程優化。

**核心原則**：
- 保留所有現有核心使用者流程（記帳、統計、設定）
- 漸進式重構，每個 phase 都能獨立 commit 和 review
- 一次性切換遷移策略（one-shot cutover）
- 不破壞現有資料

---

## 2. Current State Analysis

### 2.1 Tech Stack (Preserved)
| Layer | Technology | Status |
|-------|-----------|--------|
| Framework | Vue 3 + Composition API + TypeScript | Keep |
| Build | Vite (rolldown-vite) | Keep |
| UI | Reka UI (Radix Vue) + Tailwind CSS v4 | Keep |
| State | Pinia + pinia-plugin-persistedstate | Keep |
| Router | Vue Router 4 | Keep |
| Backend | Supabase (Auth + DB + RLS) | Keep |
| Charts | Chart.js + @unovis | Keep |
| Icons | Lucide Vue Next | Keep |
| i18n | vue-i18n | Keep |
| PWA | vite-plugin-pwa | Keep |

### 2.2 Current Directory Structure
```
src/
├── assets/css/style.css
├── components/
│   ├── ui/                     # 40+ shadcn/reka-ui components
│   ├── AddExpenseDrawer.vue
│   ├── BottomNavigation.vue
│   ├── CalendarView.vue
│   ├── ChartView.vue
│   ├── CoupleManagement.vue    # TO RENAME: FamilyManagement
│   ├── ExpenseGroup.vue
│   ├── ExpenseItem.vue
│   ├── FloatingActionButton.vue
│   ├── NotificationSettings.vue # TO REMOVE
│   ├── SpendingItem.vue
│   ├── ThemeToggle.vue
│   └── TopBar.vue
├── composables/
│   ├── useCategories.ts
│   ├── useFirebaseMessaging.ts  # TO REMOVE
│   └── usePullToRefresh.ts
├── i18n/
│   └── locales/{zh-TW,en}.ts
├── lib/
│   ├── database.types.ts
│   ├── firebase.ts              # TO REMOVE
│   ├── fcm.ts                   # TO REMOVE
│   ├── supabase.ts
│   └── utils.ts
├── routers/
│   ├── routes/index.ts
│   ├── guard.ts
│   ├── authorize.ts
│   └── index.ts
├── stores/
│   ├── index.ts
│   ├── accountManager.ts
│   ├── auth.ts
│   ├── couple.ts               # TO RENAME: family.ts
│   ├── expense.ts
│   ├── locale.ts
│   ├── notification.ts         # TO REMOVE
│   └── theme.ts
├── utils/
│   ├── extensions/datetime.ts
│   └── index.ts
├── views/
│   ├── CoupleSettings.vue      # TO RENAME: FamilySettings
│   ├── Dashboard.vue
│   ├── Expenses.vue
│   ├── Home.vue                # Legacy - TO REMOVE
│   ├── Search.vue              # Legacy - TO REMOVE
│   ├── Settings.vue
│   ├── Startup.vue
│   └── Statistics.vue
├── App.vue
└── main.ts
```

### 2.3 Current Database Schema
**Tables:**
- `couples` → TO RENAME: `families`
- `couple_settings` → TO RENAME: `family_settings`
- `user_profiles` (couple_id → family_id)
- `user_settings` (contains fcm_token, notification fields → TO CLEAN)
- `expenses` (scope: 'personal' | 'family')
- `budget_alerts` (couple_id → family_id)

**RPC Functions:**
- `create_couple()` → TO RENAME: `create_family()`
- `join_couple()` → TO RENAME: `join_family()`

### 2.4 Notification System (TO REMOVE)
**Files to delete:**
- `src/lib/firebase.ts` - Firebase config & initialization
- `src/lib/fcm.ts` - FCM singleton service
- `src/composables/useFirebaseMessaging.ts` - Firebase messaging composable
- `src/stores/notification.ts` - Notification store
- `src/components/NotificationSettings.vue` - Notification UI
- `public/firebase-messaging-sw.js` - Service worker for background notifications

**Dependencies to remove:**
- `firebase` (12.6.0) - Entire Firebase SDK

**Code references to clean:**
- `src/main.ts` - Notification initialization on DOMContentLoaded
- `src/stores/expense.ts` - `triggerExpenseNotifications()` method
- `src/stores/index.ts` - Notification store export
- `src/views/Settings.vue` - Notification settings drawer/section
- `src/App.vue` - (no direct notification import, but verify)
- `user_settings` table - `fcm_token`, `email_notifications`, `push_notifications` columns
- `couple_settings` table - `notifications` jsonb column

---

## 3. Target Architecture

### 3.1 New Directory Structure (Feature-Sliced Design)
```
src/
├── app/                          # App shell & global config
│   ├── App.vue                   # Root component
│   ├── main.ts                   # Entry point
│   ├── router/                   # Router config
│   │   ├── index.ts
│   │   ├── routes.ts
│   │   └── guard.ts
│   └── styles/
│       └── main.css              # Global CSS (Tailwind entry)
│
├── pages/                        # Route-level page components
│   ├── dashboard/
│   │   └── DashboardPage.vue
│   ├── expenses/
│   │   └── ExpensesPage.vue
│   ├── statistics/
│   │   └── StatisticsPage.vue
│   ├── settings/
│   │   └── SettingsPage.vue
│   ├── family/
│   │   └── FamilySettingsPage.vue
│   └── startup/
│       └── StartupPage.vue
│
├── features/                     # Feature modules (business logic)
│   ├── auth/
│   │   ├── stores/auth.ts
│   │   └── stores/accountManager.ts
│   ├── expense/
│   │   ├── components/
│   │   │   ├── AddExpenseDrawer.vue
│   │   │   ├── ExpenseGroup.vue
│   │   │   ├── ExpenseItem.vue
│   │   │   └── SpendingItem.vue
│   │   ├── composables/
│   │   │   └── useCategories.ts
│   │   └── stores/expense.ts
│   ├── family/                   # Renamed from couple
│   │   ├── components/
│   │   │   └── FamilyManagement.vue
│   │   └── stores/family.ts
│   └── statistics/
│       ├── components/
│       │   ├── CalendarView.vue
│       │   └── ChartView.vue
│       └── composables/          # (if needed)
│
├── entities/                     # Domain types & shared data models
│   ├── expense/
│   │   └── types.ts              # Expense, Category, ExpenseScope
│   ├── family/
│   │   └── types.ts              # Family, FamilySettings, UserProfile
│   └── user/
│       └── types.ts              # User, UserSettings
│
├── shared/                       # Shared utilities & UI
│   ├── components/
│   │   ├── ui/                   # shadcn/reka-ui (unchanged)
│   │   ├── BottomNavigation.vue
│   │   ├── TopBar.vue
│   │   ├── ThemeToggle.vue
│   │   └── FloatingActionButton.vue
│   ├── composables/
│   │   └── usePullToRefresh.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── database.types.ts
│   │   └── utils.ts
│   ├── stores/
│   │   ├── index.ts              # Pinia setup
│   │   ├── theme.ts
│   │   └── locale.ts
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/{zh-TW,en}.ts
│   └── utils/
│       ├── datetime.ts
│       └── index.ts
│
└── components.json               # shadcn config (path updates)
```

### 3.2 Key Architectural Decisions

#### Store Strategy
| Store | Scope | Location | Rationale |
|-------|-------|----------|-----------|
| auth | Global | `features/auth/stores/` | Auth state shared across all features |
| accountManager | Global | `features/auth/stores/` | Tightly coupled with auth |
| expense | Global | `features/expense/stores/` | Core business data, used by multiple pages |
| family | Global | `features/family/stores/` | Family state affects expense visibility |
| theme | Global | `shared/stores/` | App-wide concern |
| locale | Global | `shared/stores/` | App-wide concern |

**Removed:**
- `notification` store - Entire notification feature removed

**Page-local state (NOT in Pinia):**
- Filter/search state in Expenses page → local `ref()`/`reactive()`
- Calendar navigation state → local composable
- Form state → local `ref()`
- Dialog/drawer open state → local `ref()`

#### Import Path Strategy
```typescript
// Feature imports
import { useExpenseStore } from '@/features/expense/stores/expense'
import { useFamilyStore } from '@/features/family/stores/family'

// Entity imports
import type { Expense, ExpenseScope } from '@/entities/expense/types'
import type { Family, FamilySettings } from '@/entities/family/types'

// Shared imports
import { supabase } from '@/shared/lib/supabase'
import TopBar from '@/shared/components/TopBar.vue'
```

### 3.3 Domain Naming Migration

| Current (couple) | Target (family) |
|-------------------|-----------------|
| `couples` table | `families` table |
| `couple_settings` table | `family_settings` table |
| `couple_id` column | `family_id` column |
| `couple.ts` store | `family.ts` store |
| `useCoupleStore()` | `useFamilyStore()` |
| `CoupleSettings.vue` | `FamilySettingsPage.vue` |
| `CoupleManagement.vue` | `FamilyManagement.vue` |
| `createCouple()` RPC | `create_family()` RPC |
| `joinCoupleWithCode()` | `joinFamilyWithCode()` |
| `isInCouple` computed | `isInFamily` computed |
| `coupleSettings` state | `familySettings` state |
| `partnerProfile` state | `memberProfiles` state (array) |
| scope: `'family'` | scope: `'family'` (no change) |
| invitation_code | invitation_code (no change) |

**i18n keys** 中所有 "情侶" → "家庭" 替換。

### 3.4 Database Migration Plan

> **Note:** This is the design-time outline. The final executable SQL is in `docs/migrations/001-couple-to-family.sql` and may differ in detail.

The migration runs as a single transaction with these steps:

1. Rename tables: `couples` → `families`, `couple_settings` → `family_settings`
2. Rename columns: `couple_id` → `family_id` on `user_profiles`, `family_settings`, and `budget_alerts` (conditional)
3. Rename constraints and indexes for consistency
4. Recreate RPC functions: `create_couple` → `create_family`, `join_couple` → `join_family`
5. Drop deprecated notification columns: `user_settings.{fcm_token, email_notifications, push_notifications}`, `family_settings.notifications`
6. Grant execute permissions on new functions

**Migration safety notes:**
- Entire migration runs in a single `BEGIN/COMMIT` transaction — auto-rollback on any error
- Test on staging with production data clone first
- RLS policies auto-propagate for table/column renames, but triggers, views, and additional functions require manual audit (see `001-pre-migration-validation.sql` Audits A–E)
- The `scope: 'family'` value in expenses table does NOT need to change
- See `docs/migrations/CUTOVER-RUNBOOK.md` for the full operational procedure

### 3.5 New Product Areas (Routes)

| Route | Path | Component | Auth |
|-------|------|-----------|------|
| Startup | `/` | `StartupPage.vue` | No |
| Dashboard | `/dashboard` | `DashboardPage.vue` | Yes |
| Expenses | `/expenses` | `ExpensesPage.vue` | Yes |
| Statistics | `/statistics` | `StatisticsPage.vue` | Yes |
| Settings | `/settings` | `SettingsPage.vue` | Yes |
| FamilySettings | `/family` | `FamilySettingsPage.vue` | Yes |

**Removed routes:**
- `/home` → No longer needed (was redirect)
- `/search` → No longer needed (was redirect)
- `/couple-settings` → Replaced by `/family`

---

## 4. What Gets Removed

### 4.1 Notification System - Complete Removal

**Files to delete (7 files):**
```
src/lib/firebase.ts
src/lib/fcm.ts
src/composables/useFirebaseMessaging.ts
src/stores/notification.ts
src/components/NotificationSettings.vue
public/firebase-messaging-sw.js
```

**Dependencies to remove from package.json:**
```json
"firebase": "^12.6.0"
```

**Code surgery (inline references to clean):**

1. **`src/main.ts`** - Remove `initializeNotifications()`, DOMContentLoaded listener, notification store import
2. **`src/stores/index.ts`** - Remove notification store export
3. **`src/stores/expense.ts`** - Remove `triggerExpenseNotifications()` method and all notification import/calls in `addExpense()`
4. **`src/views/Settings.vue`** - Remove notification settings section/drawer
5. **`src/i18n/locales/zh-TW.ts`** and `en.ts` - Remove notification-related i18n keys

**Database cleanup (executed in migration 001):**
- `user_settings.fcm_token` → DROP (done)
- `user_settings.email_notifications` → DROP (done)
- `user_settings.push_notifications` → DROP (done)
- `family_settings.notifications` → DROP (done — column fully removed, not reset)
- `budget_alerts` table → **Kept** — this is a domain alert model for in-app budget threshold warnings, NOT a notification residue. Has no Firebase dependency.

### 4.2 Legacy Views
- `src/views/Home.vue` → Remove (Dashboard.vue is the replacement)
- `src/views/Search.vue` → Remove (Expenses.vue handles search)

### 4.3 Firebase Environment Variables
Remove from `.env.sample` and `env.d.ts`:
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_VAPID_KEY
```

---

## 5. What Gets Preserved

### 5.1 Core User Flows
1. **Authentication** - Google OAuth via Supabase (unchanged)
2. **Add Expense** - Drawer form with category, amount, date, scope
3. **View Expenses** - List with search, filter, personal/family tabs
4. **Edit/Delete Expenses** - Inline editing and bulk delete by date
5. **Statistics** - Calendar view and chart analysis
6. **Family Management** - Create/join with invitation code, budget settings
7. **Settings** - Theme, language, budget, account management
8. **PWA** - Offline capability, install prompt

### 5.2 Business Logic
- Personal vs. family expense scoping
- Budget tracking (personal, family, per-category)
- Spending ratio between family members
- Multi-account management
- Pull-to-refresh data sync

### 5.3 UX Patterns
- Bottom navigation with FAB
- Page slide transitions
- Drawer-based forms (mobile-first)
- Toast notifications (vue-sonner for UI feedback, NOT push)

---

## 6. Scope and Non-Goals

### In Scope
- Domain rename (couple → family)
- Directory restructure (feature-sliced)
- Notification system removal
- Legacy code cleanup
- Database schema migration
- i18n updates
- Type safety improvements
- Store cleanup (remove page-local state from global stores)

### NOT In Scope (Deferred)
- UI/UX comprehensive redesign (future phase)
- New features (receipts, recurring expenses, etc.)
- Backend API changes beyond schema rename
- Performance optimization
- Test coverage expansion
- Accessibility audit

---

## 7. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Database migration breaks prod data | Critical | Low | Test on staging clone; use transaction |
| Import path changes break build | High | Medium | Run `bun run build` after each phase |
| Store rename causes runtime errors | High | Medium | TypeScript will catch most; grep for string references |
| PWA service worker cache stale | Medium | High | Bump version; clear cache strategy |
| Firebase removal breaks SW registration | Medium | Medium | Remove SW before Firebase deps |
| i18n key mismatch after rename | Low | Medium | Automated grep for orphan keys |
| Lost notification capability | Low | N/A | Intentional removal per requirements |

---

## 8. Success Criteria

1. All existing user flows work identically (minus notifications)
2. `bun run build` succeeds with zero TypeScript errors
3. No references to "couple" remain in user-facing UI or code identifiers
4. Database schema uses "family" naming consistently
5. Firebase/notification code completely removed (zero runtime references)
6. Directory structure follows feature-sliced pattern
7. All stores use family-centered domain language
8. PWA still works (install, offline, update)
