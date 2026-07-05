# Database Diagram

This ERD covers the current `group_expense` application tables used by the React 19 rewrite. It is checked against `schema.sql` and the v3 migrations:

- `migrations/v3-01-user-devices.sql`
- `migrations/v3-02-monthly-reports.sql`
- `migrations/v3-03-update-group-expense-rpc.sql`
- `migrations/v3-04-hardening.sql`
- `migrations/v3-05-notification-prefs.sql`
- `migrations/v3-06-notification-triggers.sql`
- `migrations/v3-07-monthly-report-cron.sql`

## ERD

```mermaid
erDiagram
    auth_users ||--o{ groups : creates
    auth_users ||--o{ group_members : joins
    groups ||--o{ group_members : has
    groups ||--|| group_settings : configures
    auth_users ||--o{ expenses : records
    groups ||--o{ expenses : contains
    auth_users ||--o{ expenses : pays
    expenses ||--o{ expense_splits : splits
    auth_users ||--o{ expense_splits : owes
    groups ||--o{ settlements : contains
    auth_users ||--o{ settlements : paid_by
    auth_users ||--o{ settlements : paid_to
    auth_users ||--|| user_profiles : owns
    auth_users ||--|| user_settings : owns
    auth_users ||--o{ recurring_expenses : owns
    groups ||--o{ recurring_expenses : contains
    groups ||--o{ monthly_debt_snapshots : snapshots
    auth_users ||--o{ user_devices : registers
    auth_users ||--o{ monthly_reports : receives

    auth_users {
        uuid id PK
    }

    groups {
        uuid id PK
        text name
        text description
        text invitation_code UK
        integer max_members
        uuid created_by FK
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    group_members {
        uuid id PK
        uuid group_id FK
        uuid user_id FK
        text role
        boolean is_active
        timestamptz joined_at
        timestamptz created_at
    }

    group_settings {
        uuid id PK
        uuid group_id FK,UK
        numeric monthly_budget
        integer budget_start_day
        jsonb category_budgets
        text currency
        text default_split_method
        boolean simplify_debts
        timestamptz created_at
        timestamptz updated_at
    }

    expenses {
        uuid id PK
        uuid user_id FK
        uuid group_id FK
        text title
        numeric amount
        text category
        text icon
        date date
        text currency
        text split_method
        uuid paid_by FK
        text notes
        boolean is_settled
        timestamptz created_at
        timestamptz updated_at
    }

    expense_splits {
        uuid id PK
        uuid expense_id FK
        uuid user_id FK
        numeric amount
        numeric percentage
        integer shares
        boolean is_settled
        timestamptz created_at
    }

    settlements {
        uuid id PK
        uuid group_id FK
        uuid paid_by FK
        uuid paid_to FK
        numeric amount
        text notes
        text year_month
        timestamptz settled_at
        timestamptz created_at
    }

    user_profiles {
        uuid id PK,FK
        text email
        text display_name
        text avatar_url
        numeric personal_monthly_budget
        timestamptz created_at
        timestamptz updated_at
    }

    user_settings {
        uuid id PK
        uuid user_id FK,UK
        text language
        text theme
        boolean show_in_statistics
        jsonb notification_prefs
        timestamptz created_at
        timestamptz updated_at
    }

    recurring_expenses {
        uuid id PK
        uuid user_id FK
        uuid group_id FK
        text title
        numeric amount
        text category
        integer recurrence_day
        date next_due_date
        boolean is_active
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    monthly_debt_snapshots {
        uuid id PK
        uuid group_id FK
        text year_month
        jsonb snapshot_data
        numeric total_unsettled
        text status
        timestamptz created_at
    }

    user_devices {
        uuid id PK
        uuid user_id FK
        text fcm_token UK
        text platform
        text user_agent
        timestamptz last_seen_at
        timestamptz created_at
    }

    monthly_reports {
        uuid id PK
        uuid user_id FK
        text year_month
        jsonb data
        timestamptz read_at
        timestamptz notified_at
        timestamptz created_at
    }
```

## Consistency Checklist

| Table | Source migration / snapshot | Checked columns |
|---|---|---|
| `groups` | `schema.sql`, v2 schema baseline | `id`, `name`, `description`, `invitation_code`, `max_members`, `created_by`, `is_active`, `created_at`, `updated_at` |
| `group_members` | `schema.sql`, v2 schema baseline | `id`, `group_id`, `user_id`, `role`, `is_active`, `joined_at`, `created_at` |
| `group_settings` | `schema.sql`, v2 schema baseline | `id`, `group_id`, `monthly_budget`, `budget_start_day`, `category_budgets`, `currency`, `default_split_method`, `simplify_debts`, `created_at`, `updated_at` |
| `expenses` | `schema.sql`, v2 schema baseline, `migrations/v3-03-update-group-expense-rpc.sql` | `id`, `user_id`, `group_id`, `title`, `amount`, `category`, `icon`, `date`, `currency`, `split_method`, `paid_by`, `notes`, `is_settled`, `created_at`, `updated_at` |
| `expense_splits` | `schema.sql`, v2 schema baseline, `migrations/v3-06-notification-triggers.sql` | `id`, `expense_id`, `user_id`, `amount`, `percentage`, `shares`, `is_settled`, `created_at` |
| `settlements` | `schema.sql`, v2 schema baseline, `migrations/v3-04-hardening.sql`, `migrations/v3-06-notification-triggers.sql` | `id`, `group_id`, `paid_by`, `paid_to`, `amount`, `notes`, `year_month`, `settled_at`, `created_at` |
| `user_profiles` | `schema.sql`, `migrations/add_personal_budget.sql` | `id`, `email`, `display_name`, `avatar_url`, `personal_monthly_budget`, `created_at`, `updated_at` |
| `user_settings` | `schema.sql`, `migrations/v3-05-notification-prefs.sql` | `id`, `user_id`, `language`, `theme`, `show_in_statistics`, `notification_prefs`, `created_at`, `updated_at` |
| `recurring_expenses` | `schema.sql`, `src/shared/lib/database.types.ts`, v3-04 report-only RLS note | `id`, `user_id`, `group_id`, `title`, `amount`, `category`, `recurrence_day`, `next_due_date`, `is_active`, `notes`, `created_at`, `updated_at` |
| `monthly_debt_snapshots` | `schema.sql`, v2 schema baseline, `src/shared/lib/database.types.ts` | `id`, `group_id`, `year_month`, `snapshot_data`, `total_unsettled`, `status`, `created_at` |
| `user_devices` | `migrations/v3-01-user-devices.sql` | `id`, `user_id`, `fcm_token`, `platform`, `user_agent`, `last_seen_at`, `created_at` |
| `monthly_reports` | `migrations/v3-02-monthly-reports.sql`, `migrations/v3-07-monthly-report-cron.sql` | `id`, `user_id`, `year_month`, `data`, `read_at`, `notified_at`, `created_at` |

All application tables referenced by the React app, generated database types, or current RPC contracts are represented above. `monthly_debt_snapshots` is separate from v3 `monthly_reports`, but it is still used by the settlement snapshot RPCs and React settlement query path.
