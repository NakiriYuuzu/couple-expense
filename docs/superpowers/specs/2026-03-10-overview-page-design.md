# Overview Page Design Spec

## Overview

Replace the existing **Balances** tab (4th position in bottom nav) with a new **"Overview" (總覽)** page that merges statistics and debt management into a single swipeable interface. The standalone Statistics page is deprecated.

## Navigation

- **Tab label**: 總覽
- **Tab icon**: PieChart (lucide)
- **Position**: 4th tab in BottomNavigation (replaces Balances/Wallet)

## Page Structure

Two horizontally swipeable panels with clickable text labels and dot indicators at the top:

```
┌──────────────────────────────┐
│          總覽 (TopBar)        │
├──────────────────────────────┤
│     [統計]  ●──○  [債務]      │
│                              │
│   ◀ [Panel Content] ▶        │
└──────────────────────────────┘
```

- Swipe is supplementary; tapping labels is the primary navigation
- `prefers-reduced-motion` must be respected for all transitions
- Personal mode: Statistics panel works normally, Debt panel shows placeholder

## Panel 1: Statistics

Vertical scroll layout, all sections controlled by a shared month/year toggle and period selector.

### Sections (top to bottom)

1. **Summary Cards** (2-column grid)
   - Monthly total expense
   - Today's expense / daily average

2. **Period Controls**
   - Month/Year toggle buttons
   - Period selector: `[◀] 2026年3月 [▶]`

3. **Area Chart**
   - Stacked area chart showing spending distribution by category
   - Uses @unovis/vue (existing)
   - Adapts to month (weekly x-axis) or year (monthly x-axis) view

4. **Calendar View**
   - Existing CalendarView component (Reka UI CalendarRoot)
   - Click date to open daily expense detail dialog

5. **Category Breakdown Table**
   - Per-category: color indicator, amount, count, percentage, progress bar
   - Sorted by amount descending

### Removed from existing Statistics page
- Personal/Group scope toggle (auto-follows `activeGroupId`)
- Chart view tab switching (only area chart remains)
- Horizontal bar chart (spending ranking)
- Daily trend chart
- Member spending ratio section (group mode)

## Panel 2: Debts

### Month Selector

Horizontal scrollable month pills at the top:
- Current month: primary filled color (purple)
- Historical months: glass outlined style
- Auto-scroll to current month on load

### Monthly Debt Cards

Each month renders as a collapsible glass card:

**Collapsed state (summary):**
```
┌──────────────────────────┐
│ 3月 (進行中)              │
│ 未結清 NT$2,400           │
│ 3 筆待結算                │
│              ▼ 展開詳情   │
└──────────────────────────┘
```

**Three status indicators:**
- 🟣 進行中 (current month, real-time calculation)
- 🟢 已結清 (all debts settled)
- 🟡 部分未結清 / ⚠ 未結清 (has outstanding debts)

**Expanded state (full details):**
1. Simplified debt cards (existing DebtSummaryCard)
   - Shows who owes whom and how much
   - Current user's debts highlighted in brand color
   - Settle button available (including for historical months)
2. Net balance list
   - Per-member: avatar, name, balance amount with color coding
3. Settlement history for that month
   - Date, from→to, amount, status

### Expand/Collapse Animation
- 200ms ease-out transition
- Respect `prefers-reduced-motion`

### Personal Mode
- Shows placeholder: "請選擇群組以查看債務"

## Backend: Monthly Debt Snapshots

### New Table

```sql
CREATE TABLE group_expense.monthly_debt_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES group_expense.groups(id),
    year_month text NOT NULL,               -- '2026-01' format
    snapshot_data jsonb NOT NULL,
    total_unsettled numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'unsettled', -- 'settled' | 'partial' | 'unsettled'
    created_at timestamp DEFAULT now(),
    UNIQUE(group_id, year_month)
);
```

### snapshot_data Structure

```json
{
    "netBalances": [
        { "userId": "uuid", "netBalance": 800 }
    ],
    "simplifiedDebts": [
        { "fromUser": "uuid", "toUser": "uuid", "amount": 800 }
    ],
    "expenseCount": 15,
    "totalExpense": 5200
}
```

### pg_cron Job

Runs on the 1st of each month at 00:00 UTC:
- Iterates all active groups
- Calculates net balances and simplified debts for the previous month's expenses
- Writes snapshot to `monthly_debt_snapshots`
- Sets status based on whether all debts are zero

### Settlement Logic

- Historical months: settle via existing `settle_debt` RPC, with additional `year_month` field on settlements table
- After settlement: update snapshot's `status` and `total_unsettled`
- Current month: uses existing real-time calculation (no snapshot yet)

### Settlements Table Update

Add `year_month` column to existing `settlements` table:

```sql
ALTER TABLE group_expense.settlements
    ADD COLUMN year_month text;
```

## Files to Modify

### Remove / Deprecate
- `src/pages/statistics/StatisticsPage.vue` - remove page
- Route entry for `/statistics` - remove

### Modify
- `src/shared/components/BottomNavigation.vue` - change 4th tab label/icon
- `src/app/router/routes/index.ts` - update route, remove statistics route
- `src/shared/i18n/locales/zh-TW.ts` - add new i18n keys
- `src/shared/i18n/locales/en.ts` - add new i18n keys
- `src/features/settlement/stores/settlement.ts` - add snapshot fetching
- `src/entities/settlement/types.ts` - add snapshot types
- `schema.sql` - add new table and cron function

### Create
- `src/pages/overview/OverviewPage.vue` - new page shell with swipe
- `src/features/statistics/components/StatisticsPanel.vue` - refactored statistics
- `src/features/settlement/components/DebtPanel.vue` - debt management panel
- `src/features/settlement/components/MonthPills.vue` - month selector
- `src/features/settlement/components/MonthlyDebtCard.vue` - collapsible month card

## UX Guidelines

- Minimum 44x44px touch targets on all interactive elements
- `cursor-pointer` on all clickable elements
- Smooth transitions 150-300ms
- `prefers-reduced-motion` respected throughout
- Glass cards: `bg-white/85` or higher in light mode for readability
- Text contrast minimum 4.5:1 ratio
- No emojis as UI icons (use Lucide SVG)
- `pb-28` on page for floating nav spacing

## Design Tokens (existing)

- Glass: `blur-xl`, `bg-background/85`, `border-glass-border`
- Primary: `oklch(0.637 0.153 278)` / dark: `oklch(0.737 0.145 278)`
- Radius: `rounded-2xl` for cards
- Font: Inter
- Animations: `fade-up`, `scale-in` (existing keyframes)
