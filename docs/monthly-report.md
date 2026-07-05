# Monthly Report

Monthly reports summarize one Taipei calendar month per user and store the generated snapshot in `group_expense.monthly_reports`.

## Runtime Path

- Schedule: `migrations/v3-07-monthly-report-cron.sql`
- Edge Function: `supabase/functions/monthly-report/index.ts`
- Table: `group_expense.monthly_reports`
- Frontend types: `src/features/report/types.ts`
- Frontend validation: `src/features/report/api/useMonthlyReport.ts`
- UI page: `src/pages/reports/MonthlyReportPage.tsx`

Manual deployment and backfill commands are documented in [docs/fcm-setup.md](./fcm-setup.md#9-月報-cron-與月報函式monthly-report).

## Aggregation Rules

- The default target is the previous month in the Taipei calendar.
- Manual requests may pass `yearMonth` as `YYYY-MM`.
- Month bounds use `expenses.date` as a plain calendar date:
  - `date >= <YYYY-MM-01>`
  - `date < <next YYYY-MM-01>`
- Personal total counts expenses where `group_id` is null and `paid_by` is the user.
- Group total counts the user's `expense_splits.amount` for group expenses.
- Group split rows are split into `settledAmount` and `unsettledAmount` by `expense_splits.is_settled`.
- Month-over-month compares total personal plus group split amount against the previous month.

## `data` Shape

`monthly_reports.data` is a JSON object matching `MonthlyReportData`:

```json
{
  "yearMonth": "2026-06",
  "personal": {
    "total": 12345,
    "expenseCount": 31,
    "byCategory": [
      { "category": "food", "amount": 5000 }
    ]
  },
  "group": {
    "splitTotal": 6789,
    "groups": [
      {
        "groupId": "11111111-1111-4111-8111-111111111112",
        "groupName": "家庭",
        "splitAmount": 3000,
        "settledAmount": 2000,
        "unsettledAmount": 1000
      }
    ]
  },
  "mom": {
    "prevTotal": 11000,
    "delta": 1345,
    "deltaPct": 12.2
  },
  "generatedAt": "2026-07-01T01:00:00.000Z"
}
```

`byCategory.category` remains a string because legacy or future categories can exist in the database.

## Idempotency

The Edge Function upserts rows on the unique key `(user_id, year_month)` and sends only three columns:

- `user_id`
- `year_month`
- `data`

This means reruns replace the report JSON, including `generatedAt`, but preserve:

- `read_at`
- `notified_at`
- `created_at`

Notification deduplication is based on `notified_at`:

1. After upsert, the function queries rows for the target month where `notified_at IS NULL`.
2. It calls `send-push` with event `monthly_report`.
3. If the push result should be considered complete, it updates `notified_at`.
4. Later reruns skip rows that already have `notified_at`.

Known limitation: concurrent runs for the same month can send a duplicate notification because the pending query and notification update are not an atomic claim.

## Manual Backfill

Use the curl example in [docs/fcm-setup.md §9.3](./fcm-setup.md#93-手動觸發回補特定月份). Keep the same `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` requirement as `send-push`, because the Edge Function expects the Supabase platform JWT verification path to remain enabled.
