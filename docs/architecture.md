# Architecture

This document describes the React 19 rewrite as implemented in the current worktree.

## Layers

```text
src/routes/         TanStack Router file routes; thin shells and lazy page loading
src/pages/          Route-level UI composition and workflow orchestration
src/features/       Domain features; API hooks, mutations, feature components, feature helpers
src/shared/lib/     Cross-feature contracts: Supabase client, query keys, datetime, money, theme
src/shared/stores/  Zustand stores for local session/UI state
src/components/ui/  shadcn/ui-style primitives
```

Routes are intentionally thin. Pages compose feature hooks and shared app shell components. Feature API hooks own Supabase reads/writes and TanStack Query cache policy. Shared modules are the only place for cross-feature primitives such as query key factories, time formatting, money formatting, and the Supabase client.

## Data Flow

The app reads and mutates server data through TanStack Query hooks in `src/features/*/api`.

1. React page/component calls a feature hook.
2. The hook uses `queryKeys` from `src/shared/lib/queryKeys.ts`.
3. The hook reads via `supabase` from `src/shared/lib/supabase.ts` or calls an RPC.
4. Supabase enforces RLS on the `group_expense` schema.
5. Mutations invalidate scoped query keys instead of manually editing global server state.

Zustand is reserved for client-only state: auth/session snapshots, selected active group, UI state, and account switching. Server records belong in TanStack Query.

## Query Policy

`src/shared/lib/queryKeys.ts` is the sole query key factory. Keys include the data scope:

- group data includes `groupId`
- user data includes `userId`
- personal expenses use the `'personal'` segment through `queryKeys.expenses(null)`

`src/shared/lib/queryClient.ts` defines staleTime tiers:

- `long`: 10 minutes for low-change profile/settings data
- `medium`: 5 minutes for group metadata
- `standard`: 60 seconds for reports and normal list data
- `short`: 15 seconds for settlement/debt data

## Database Boundary

The active app schema is `group_expense`. The current v3 target snapshot is documented in `schema.sql`, with v3 migrations in `migrations/v3-01-user-devices.sql` through `migrations/v3-07-monthly-report-cron.sql`.

Important RPC boundaries:

- `add_group_expense`: atomically creates a group expense and its splits.
- `update_group_expense`: atomically updates a group expense and rebuilds splits.
- `settle_expense`: settles one expense and creates settlement rows.
- `settle_debt` / `settle_monthly_debt`: records settlement payments.

## Notification Subsystem

The notification pipeline has three layers.

### 1. Database Triggers

`migrations/v3-06-notification-triggers.sql` creates statement-level triggers:

- `trg_notify_split_assigned` on `group_expense.expense_splits`
- `trg_notify_settlement_received` on `group_expense.settlements`

The trigger functions aggregate candidate recipients and call `send-push` with `pg_net`. Failures only raise warnings and do not roll back the expense or settlement transaction.

### 2. Edge Function `send-push`

`supabase/functions/send-push/index.ts` receives:

```json
{
  "userIds": ["<user uuid>"],
  "event": "split_assigned",
  "title": "新的分帳",
  "body": "訊息內容",
  "data": { "url": "expenses/<expense-id>" }
}
```

Supported events are `split_assigned`, `settlement_received`, and `monthly_report`.

`send-push` filters recipients by `user_settings.notification_prefs`, loads all registered `user_devices`, sends FCM HTTP v1 data-only messages, and deletes devices that FCM reports as `UNREGISTERED` or `NOT_FOUND`.

### 3. Service Worker

`src/sw.ts` handles Firebase background messages. The contract is data-only:

- no FCM `notification` field
- `data.title` and `data.body` become the visible notification
- `data.url` is an app-relative deep link resolved against `self.registration.scope`

Deep link examples:

- `expenses/<expense-id>` opens the expense detail route
- `overview` opens the overview route
- `reports/<ym>` opens a monthly report, such as `reports/2026-06`

## Monthly Report Pipeline

Monthly reports use a separate scheduled pipeline:

1. `migrations/v3-07-monthly-report-cron.sql` schedules `monthly-report` monthly through `pg_cron`.
2. The cron job calls `supabase/functions/monthly-report/index.ts` through `pg_net`.
3. The Edge Function aggregates the target Taipei calendar month from `expenses.date` and `expense_splits`.
4. It upserts one row per user into `group_expense.monthly_reports`.
5. It calls `send-push` with event `monthly_report` for rows whose `notified_at` is still null.
6. The React app reads `monthly_reports` for Dashboard, Settings history, and `src/pages/reports/MonthlyReportPage.tsx`.

The monthly report data shape is defined by `src/features/report/types.ts` and validated in `src/features/report/api/useMonthlyReport.ts`.
