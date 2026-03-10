# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
bun run dev          # Vite dev server (HTTPS, port 5173, auto-open)
bun run build        # Production build (vite build → ./dist/{mode})
bun run typecheck    # Type-check only (vue-tsc -b)
bun run preview      # Preview production build
bun run test         # Run all tests once (vitest run, happy-dom)
bun run test:watch   # Run tests in watch mode
bun run clean        # Remove dist and node_modules
```

### Running a Single Test

```bash
bunx vitest run src/features/split/composables/__tests__/useSplitCalculation.spec.ts
```

### WSL + Windows Drive: MUST Use PowerShell (CRITICAL)

**This project lives on a Windows drive (`/mnt/e/`).**  WSL accesses Windows drives via the 9P filesystem bridge, which makes I/O-heavy operations (build, typecheck, test) extremely slow.

**MANDATORY**: All build/typecheck/test commands MUST be run through `powershell.exe -Command` to bypass the 9P penalty. This rule applies to the **main agent AND all subagents/sub-tasks**.

```bash
# CORRECT — runs natively on Windows, fast
powershell.exe -Command "bun run build"
powershell.exe -Command "bun run typecheck"
powershell.exe -Command "bun run test"
powershell.exe -Command "bunx vitest run path/to/test.spec.ts"

# WRONG — runs through WSL 9P bridge, 3-10x slower
bun run build
bun run typecheck
bun run test
```

> **Why `powershell.exe` not `powershell`?**  On WSL, the full `.exe` suffix ensures the Windows binary is invoked. Both work, but `.exe` is explicit and avoids ambiguity.

## Environment Variables

Copy `.env.sample` to `.env` and fill in:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
- `VITE_APP_ROUTER_BASE` — Base path for Vue Router (default: `/`)

## Project Architecture

### Technology Stack

- **Runtime/Package Manager**: Bun
- **Framework**: Vue 3 (Composition API + `<script setup lang="ts">`)
- **Build**: Vite 8 beta (rolldown-vite) + Tailwind CSS v4 (Vite plugin)
- **Backend**: Supabase (Auth, PostgreSQL, RPC functions)
- **UI**: shadcn-vue (Reka UI base) + Lucide icons
- **State**: Pinia + pinia-plugin-persistedstate
- **i18n**: vue-i18n (zh-TW / en, localStorage-persisted)
- **Charts**: Chart.js via vue-chartjs + @unovis
- **Forms**: vee-validate + Zod
- **PWA**: vite-plugin-pwa (workbox, auto-update)
- **Testing**: Vitest + happy-dom + @vue/test-utils

### Directory Structure (Feature-Sliced Design)

```
src/
├── app/                    # App shell
│   ├── main.ts            # Entry point (mounts Vue + router + pinia + i18n)
│   ├── App.vue            # Root component (layout, fade transitions, global drawer)
│   ├── router/            # Vue Router config
│   │   ├── routes/index.ts  # All route definitions (type-safe, lazy-loaded)
│   │   ├── guard.ts       # Auth guard (waits for auth init, redirects)
│   │   └── authorize.ts   # Role-based authorization
│   └── styles/main.css    # Global CSS (glassmorphism tokens, animations, color system)
├── entities/              # Domain types (no logic)
│   ├── expense/types.ts
│   ├── group/types.ts
│   ├── split/types.ts
│   ├── settlement/types.ts
│   └── user/types.ts
├── features/              # Business logic by domain
│   ├── auth/stores/       # auth.ts (Supabase auth), accountManager.ts
│   ├── expense/
│   │   ├── stores/expense.ts        # CRUD + computed stats
│   │   └── composables/             # useCategories, useRecentExpenses
│   ├── group/
│   │   ├── stores/group.ts          # Groups, members, settings
│   │   └── composables/useGroupContext.ts
│   ├── split/
│   │   ├── stores/split.ts
│   │   └── composables/             # useSplitCalculation, useDebtSimplification
│   ├── settlement/
│   │   ├── stores/settlement.ts
│   │   └── composables/             # useNetBalances, useMonthlySnapshots
│   └── statistics/components/       # CalendarView, ChartView, StatisticsPanel
├── pages/                 # Page-level components (one folder per route)
│   ├── dashboard/DashboardPage.vue
│   ├── expenses/ExpensesPage.vue
│   ├── expense-detail/ExpenseDetailPage.vue
│   ├── overview/OverviewPage.vue
│   ├── balances/BalancesPage.vue
│   ├── statistics/StatisticsPage.vue
│   ├── settings/SettingsPage.vue
│   ├── group-list/GroupListPage.vue
│   ├── group-create/GroupCreatePage.vue
│   ├── group/GroupSettingsPage.vue
│   └── startup/StartupPage.vue
└── shared/                # Cross-cutting concerns
    ├── components/
    │   ├── ui/            # shadcn-vue components (40+, auto-generated)
    │   ├── BottomNavigation.vue  # Floating capsule nav (auto-hide on scroll)
    │   └── TopBar.vue
    ├── composables/       # usePullToRefresh, useScrollDirection
    ├── i18n/              # vue-i18n setup + locale JSON files
    ├── lib/
    │   ├── supabase.ts    # Supabase client + auth helpers
    │   ├── database.types.ts  # Generated DB types (Row/Insert/Update per table)
    │   └── utils.ts       # cn() helper (clsx + tailwind-merge)
    ├── stores/
    │   ├── index.ts       # Creates Pinia instance, re-exports all stores
    │   ├── theme.ts
    │   └── locale.ts
    └── utils/             # Extensions (datetime helpers)
```

### Key Architecture Patterns

**Store barrel export**: All stores are re-exported from `src/shared/stores/index.ts`. Import stores from there, not directly from feature folders.

**Database types**: `src/shared/lib/database.types.ts` contains generated Supabase types. Each table has `Row`, `Insert`, and `Update` interfaces. Domain-specific type aliases (e.g. `SplitMethod`, `GroupMemberRole`) are also exported from this file.

**Personal vs Group context**: The app operates in two modes controlled by `groupStore.activeGroupId`:
- `null` = personal mode (expenses with `group_id = null`)
- UUID = group mode (shows group expenses + personal expenses)

**Auth flow**: `useAuthStore` auto-initializes on creation. Route guard in `guard.ts` polls `authStore.initialized` (up to 5s) before checking `requiresAuth` meta.

**Supabase RPC**: Group operations (create, join, leave, add expense with splits, balances, simplified debts, settle) use PostgreSQL RPC functions defined in `schema.sql`.

**Page transitions**: App.vue uses a unified fade transition (0.2s) for all page changes.

**Bottom navigation**: Floating capsule style, shown on main tabs (dashboard, expenses, overview, settings). Auto-hides on scroll down via `useScrollDirection` composable.

### Path Alias

`@/*` → `./src/*` (configured in tsconfig.json and vite.config.ts)

## UI Design System (v2 — Light Glassmorphism)

- **Font**: Inter (system-ui fallback)
- **Primary color**: Purple `oklch(0.637 0.153 278)` / dark: `oklch(0.737 0.145 278)`
- **Color system**: Purple-tinted oklch tokens (not zinc)
- **Glass utilities**: `.glass`, `.glass-heavy`, `.glass-light`, `.glass-elevated`, `.glass-nav`
- **Animations**: `fade-up`, `scale-in`, `slide-number-up/down`, `.press-feedback`, `.hover-transition`
- **Category colors**: CSS variables `--category-{name}` / `--category-{name}-bg`
- **Glass borders**: `border-glass-border` / `border-glass-border-strong`
- **Radius**: 1.25rem default (`rounded-2xl` for cards)
- **Page bottom padding**: All pages use `pb-28` for floating nav spacing

## Database

See `schema.sql` at project root for the complete schema and RPC function signatures. Key tables: `groups`, `group_members`, `group_settings`, `expenses`, `expense_splits`, `settlements`, `user_profiles`, `user_settings`.

## Code Style

- Four spaces indentation, no semicolons, no trailing commas (JS/TS)
- Vue components: `<script setup lang="ts">` always
- Tailwind CSS v4 with oklch color tokens
- All components use shadcn-vue patterns — do not create custom UI primitives
