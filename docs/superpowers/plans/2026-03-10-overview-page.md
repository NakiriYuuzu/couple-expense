# Overview Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Balances tab with a new "Overview" (總覽) page that merges statistics and monthly debt management into a swipeable two-panel interface.

**Architecture:** The page uses two horizontally swipeable panels (Statistics + Debts) with clickable tab labels and dot indicators. Statistics panel reuses/refactors existing CalendarView and ChartView area chart. Debt panel introduces monthly snapshots with pg_cron, collapsible month cards, and per-month settlement. All existing settlement components (DebtSummaryCard, SettlementDrawer, SettlementHistory) are reused inside the debt panel.

**Tech Stack:** Vue 3 + Composition API, Pinia, Supabase (PostgreSQL + pg_cron), @unovis/vue (area chart), Reka UI (calendar), Tailwind CSS v4, Lucide icons, vue-i18n

**Spec:** `docs/superpowers/specs/2026-03-10-overview-page-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/pages/overview/OverviewPage.vue` | Page shell: TopBar + swipeable panel container + tab indicators |
| `src/features/statistics/components/StatisticsPanel.vue` | Left panel: summary cards + period controls + area chart + calendar + category breakdown |
| `src/features/settlement/components/DebtPanel.vue` | Right panel: month pills + monthly debt cards list + personal-mode placeholder |
| `src/features/settlement/components/MonthPills.vue` | Horizontal scrollable month pill selector |
| `src/features/settlement/components/MonthlyDebtCard.vue` | Collapsible card: month summary → expanded details (debts + balances + history) |
| `src/features/settlement/composables/useMonthlySnapshots.ts` | Composable: fetch snapshots, compute current month real-time, manage month selection |

### Modified Files

| File | Changes |
|------|---------|
| `src/entities/settlement/types.ts` | Add `MonthlyDebtSnapshot`, `MonthlyDebtSummary` types |
| `src/features/settlement/stores/settlement.ts` | Add `fetchMonthlySnapshots()`, `fetchCurrentMonthDebts()`, `settleMonthlyDebt()` actions |
| `src/shared/components/BottomNavigation.vue` | Change 4th tab: Wallet→PieChart icon, 'balances'→'overview' |
| `src/app/router/routes/index.ts` | Replace `balances` route with `overview`, remove `statistics` route |
| `src/app/App.vue` | Update pageIndexMap, routesWithBottomNav, activeTab, handleNavigation for 'overview' |
| `src/shared/i18n/locales/zh-TW.ts` | Add `overview.*` keys |
| `src/shared/i18n/locales/en.ts` | Add `overview.*` keys |
| `schema.sql` | Add `monthly_debt_snapshots` table, `year_month` column on settlements |

### Deprecated (not deleted yet)

| File | Reason |
|------|--------|
| `src/pages/balances/BalancesPage.vue` | Replaced by OverviewPage |
| `src/pages/statistics/StatisticsPage.vue` | Merged into StatisticsPanel |

---

## Chunk 1: Types & i18n

### Task 1.1: Add Settlement Types

**Files:**
- Modify: `src/entities/settlement/types.ts`

- [ ] **Step 1: Add MonthlyDebtSnapshot and MonthlyDebtSummary types**

Add after the existing `SettlementHistoryItem` interface (line 45):

```typescript
// Monthly debt snapshot from pg_cron or real-time calculation
export interface MonthlyDebtSnapshot {
    id: string | null          // null for current month (real-time)
    groupId: string
    yearMonth: string          // '2026-01' format
    netBalances: NetBalance[]
    simplifiedDebts: SimplifiedDebt[]
    expenseCount: number
    totalExpense: number
    totalUnsettled: number
    status: 'in_progress' | 'settled' | 'partial' | 'unsettled'
}

// Summary for collapsed month card
export interface MonthlyDebtSummary {
    yearMonth: string
    totalUnsettled: number
    debtCount: number
    status: 'in_progress' | 'settled' | 'partial' | 'unsettled'
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx vue-tsc -b --noEmit 2>&1 | head -20`
Expected: No new errors related to settlement types

- [ ] **Step 3: Commit**

```bash
git add src/entities/settlement/types.ts
git commit -m "feat(types): add MonthlyDebtSnapshot and MonthlyDebtSummary types"
```

### Task 1.2: Add i18n Keys

**Files:**
- Modify: `src/shared/i18n/locales/zh-TW.ts`
- Modify: `src/shared/i18n/locales/en.ts`

- [ ] **Step 1: Add overview keys to zh-TW.ts**

Add after the `settlement` section (after line 352), before `search`:

```typescript
    // 總覽頁面
    overview: {
        title: '總覽',
        statistics: '統計',
        debts: '債務',
        // Statistics panel
        monthlyTotal: '月總消費',
        todayExpense: '今日消費',
        dailyAverage: '平均每日',
        byMonth: '按月',
        byYear: '按年',
        areaChartTitle: '支出分佈',
        categoryBreakdown: '類別明細',
        // Debt panel
        inProgress: '進行中',
        settled: '已結清',
        partiallyUnsettled: '部分未結清',
        unsettled: '未結清',
        totalUnsettled: '未結清',
        pendingSettlement: '{count} 筆待結算',
        expandDetails: '展開詳情',
        collapseDetails: '收起詳情',
        selectGroupForDebts: '請選擇群組以查看債務',
        noSnapshotsYet: '尚無歷史結算記錄',
        currentMonth: '本月'
    },
```

- [ ] **Step 2: Add overview keys to en.ts**

Add matching keys in the same position in en.ts:

```typescript
    overview: {
        title: 'Overview',
        statistics: 'Statistics',
        debts: 'Debts',
        monthlyTotal: 'Monthly Total',
        todayExpense: "Today's Expense",
        dailyAverage: 'Daily Average',
        byMonth: 'Monthly',
        byYear: 'Yearly',
        areaChartTitle: 'Spending Distribution',
        categoryBreakdown: 'Category Breakdown',
        inProgress: 'In Progress',
        settled: 'Settled',
        partiallyUnsettled: 'Partially Unsettled',
        unsettled: 'Unsettled',
        totalUnsettled: 'Unsettled',
        pendingSettlement: '{count} pending',
        expandDetails: 'Expand Details',
        collapseDetails: 'Collapse Details',
        selectGroupForDebts: 'Select a group to view debts',
        noSnapshotsYet: 'No settlement history yet',
        currentMonth: 'Current Month'
    },
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/i18n/locales/zh-TW.ts src/shared/i18n/locales/en.ts
git commit -m "feat(i18n): add overview page translation keys"
```

---

## Chunk 2: Database Migration

### Task 2.1: Apply Supabase Migration

**Files:**
- Modify: `schema.sql` (documentation only)

- [ ] **Step 1: Create migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `add_monthly_debt_snapshots` and the following SQL:

```sql
-- Add year_month column to settlements for monthly tracking
ALTER TABLE group_expense.settlements
    ADD COLUMN IF NOT EXISTS year_month text;

-- Backfill year_month for existing settlements
UPDATE group_expense.settlements
SET year_month = to_char(settled_at, 'YYYY-MM')
WHERE year_month IS NULL;

-- Monthly debt snapshots table
CREATE TABLE IF NOT EXISTS group_expense.monthly_debt_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES group_expense.groups(id) ON DELETE CASCADE,
    year_month text NOT NULL,
    snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    total_unsettled numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'unsettled'
        CHECK (status IN ('settled', 'partial', 'unsettled')),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE(group_id, year_month)
);

-- Enable RLS
ALTER TABLE group_expense.monthly_debt_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policy: group members can read snapshots
CREATE POLICY "Group members can read snapshots"
    ON group_expense.monthly_debt_snapshots
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM group_expense.group_members gm
            WHERE gm.group_id = monthly_debt_snapshots.group_id
            AND gm.user_id = auth.uid()
            AND gm.is_active = true
        )
    );

-- RPC: Get monthly debt snapshots for a group
CREATE OR REPLACE FUNCTION group_expense.get_monthly_snapshots(p_group_id uuid)
RETURNS TABLE(
    id uuid,
    year_month text,
    snapshot_data jsonb,
    total_unsettled numeric,
    status text,
    created_at timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT id, year_month, snapshot_data, total_unsettled, status, created_at
    FROM group_expense.monthly_debt_snapshots
    WHERE group_id = p_group_id
    ORDER BY year_month DESC;
$$;

-- RPC: Get balances for a specific month (for current month real-time calc)
CREATE OR REPLACE FUNCTION group_expense.get_monthly_balances(
    p_group_id uuid,
    p_year_month text
)
RETURNS TABLE(user_id uuid, net_balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
    v_start_date date;
    v_end_date date;
BEGIN
    v_start_date := (p_year_month || '-01')::date;
    v_end_date := (v_start_date + interval '1 month')::date;

    RETURN QUERY
    WITH expense_debits AS (
        SELECT
            es.user_id AS uid,
            -SUM(es.amount) AS balance_change
        FROM group_expense.expense_splits es
        JOIN group_expense.expenses e ON e.id = es.expense_id
        WHERE e.group_id = p_group_id
          AND e.date >= v_start_date
          AND e.date < v_end_date
        GROUP BY es.user_id
    ),
    expense_credits AS (
        SELECT
            e.paid_by AS uid,
            SUM(e.amount) AS balance_change
        FROM group_expense.expenses e
        WHERE e.group_id = p_group_id
          AND e.date >= v_start_date
          AND e.date < v_end_date
          AND e.paid_by IS NOT NULL
        GROUP BY e.paid_by
    ),
    settlement_credits AS (
        SELECT
            s.paid_by AS uid,
            SUM(s.amount) AS balance_change
        FROM group_expense.settlements s
        WHERE s.group_id = p_group_id
          AND s.year_month = p_year_month
        GROUP BY s.paid_by
    ),
    settlement_debits AS (
        SELECT
            s.paid_to AS uid,
            -SUM(s.amount) AS balance_change
        FROM group_expense.settlements s
        WHERE s.group_id = p_group_id
          AND s.year_month = p_year_month
        GROUP BY s.paid_to
    ),
    all_changes AS (
        SELECT * FROM expense_debits
        UNION ALL SELECT * FROM expense_credits
        UNION ALL SELECT * FROM settlement_credits
        UNION ALL SELECT * FROM settlement_debits
    )
    SELECT ac.uid, COALESCE(SUM(ac.balance_change), 0)::numeric
    FROM all_changes ac
    GROUP BY ac.uid
    HAVING ABS(SUM(ac.balance_change)) > 0.01;
END;
$$;

-- RPC: Get simplified debts for a specific month
CREATE OR REPLACE FUNCTION group_expense.get_monthly_simplified_debts(
    p_group_id uuid,
    p_year_month text
)
RETURNS TABLE(from_user uuid, to_user uuid, amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
    v_balances record;
    v_debtors numeric[];
    v_debtor_ids uuid[];
    v_creditors numeric[];
    v_creditor_ids uuid[];
    v_i integer;
    v_j integer;
    v_payment numeric;
BEGIN
    -- Collect positive (creditors) and negative (debtors) balances
    v_debtors := ARRAY[]::numeric[];
    v_debtor_ids := ARRAY[]::uuid[];
    v_creditors := ARRAY[]::numeric[];
    v_creditor_ids := ARRAY[]::uuid[];

    FOR v_balances IN
        SELECT mb.user_id, mb.net_balance
        FROM group_expense.get_monthly_balances(p_group_id, p_year_month) mb
    LOOP
        IF v_balances.net_balance < -0.01 THEN
            v_debtors := array_append(v_debtors, ABS(v_balances.net_balance));
            v_debtor_ids := array_append(v_debtor_ids, v_balances.user_id);
        ELSIF v_balances.net_balance > 0.01 THEN
            v_creditors := array_append(v_creditors, v_balances.net_balance);
            v_creditor_ids := array_append(v_creditor_ids, v_balances.user_id);
        END IF;
    END LOOP;

    -- Greedy algorithm to minimize transactions
    v_i := 1;
    v_j := 1;
    WHILE v_i <= array_length(v_debtors, 1) AND v_j <= array_length(v_creditors, 1) LOOP
        v_payment := LEAST(v_debtors[v_i], v_creditors[v_j]);
        IF v_payment > 0.01 THEN
            from_user := v_debtor_ids[v_i];
            to_user := v_creditor_ids[v_j];
            amount := ROUND(v_payment, 2);
            RETURN NEXT;
        END IF;
        v_debtors[v_i] := v_debtors[v_i] - v_payment;
        v_creditors[v_j] := v_creditors[v_j] - v_payment;
        IF v_debtors[v_i] < 0.01 THEN v_i := v_i + 1; END IF;
        IF v_creditors[v_j] < 0.01 THEN v_j := v_j + 1; END IF;
    END LOOP;
END;
$$;

-- RPC: Create monthly snapshot (called by pg_cron)
CREATE OR REPLACE FUNCTION group_expense.create_monthly_snapshot(
    p_group_id uuid,
    p_year_month text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_snapshot_id uuid;
    v_net_balances jsonb;
    v_simplified_debts jsonb;
    v_expense_count integer;
    v_total_expense numeric;
    v_total_unsettled numeric;
    v_status text;
    v_start_date date;
    v_end_date date;
BEGIN
    v_start_date := (p_year_month || '-01')::date;
    v_end_date := (v_start_date + interval '1 month')::date;

    -- Get expense stats for the month
    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_expense_count, v_total_expense
    FROM group_expense.expenses
    WHERE group_id = p_group_id
      AND date >= v_start_date
      AND date < v_end_date;

    -- Get net balances as JSON
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', mb.user_id,
        'netBalance', mb.net_balance
    )), '[]'::jsonb)
    INTO v_net_balances
    FROM group_expense.get_monthly_balances(p_group_id, p_year_month) mb;

    -- Get simplified debts as JSON
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fromUser', sd.from_user,
        'toUser', sd.to_user,
        'amount', sd.amount
    )), '[]'::jsonb)
    INTO v_simplified_debts
    FROM group_expense.get_monthly_simplified_debts(p_group_id, p_year_month) sd;

    -- Calculate total unsettled
    SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
    INTO v_total_unsettled
    FROM jsonb_array_elements(v_simplified_debts) elem;

    -- Determine status
    IF v_total_unsettled < 0.01 THEN
        v_status := 'settled';
    ELSIF v_total_unsettled < v_total_expense * 0.5 THEN
        v_status := 'partial';
    ELSE
        v_status := 'unsettled';
    END IF;

    -- Upsert snapshot
    INSERT INTO group_expense.monthly_debt_snapshots (
        group_id, year_month,
        snapshot_data, total_unsettled, status
    ) VALUES (
        p_group_id, p_year_month,
        jsonb_build_object(
            'netBalances', v_net_balances,
            'simplifiedDebts', v_simplified_debts,
            'expenseCount', v_expense_count,
            'totalExpense', v_total_expense
        ),
        v_total_unsettled, v_status
    )
    ON CONFLICT (group_id, year_month)
    DO UPDATE SET
        snapshot_data = EXCLUDED.snapshot_data,
        total_unsettled = EXCLUDED.total_unsettled,
        status = EXCLUDED.status
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$;

-- pg_cron job: Run on 1st of each month at 00:00 UTC
-- Creates snapshots for the previous month for all active groups
-- NOTE: pg_cron must be enabled via Supabase dashboard > Database > Extensions
--
-- SELECT cron.schedule(
--     'monthly-debt-snapshots',
--     '0 0 1 * *',
--     $$
--     SELECT group_expense.create_monthly_snapshot(g.id, to_char(now() - interval '1 month', 'YYYY-MM'))
--     FROM group_expense.groups g
--     WHERE g.is_active = true;
--     $$
-- );

-- RPC: Settle debt for a specific month
CREATE OR REPLACE FUNCTION group_expense.settle_monthly_debt(
    p_group_id uuid,
    p_paid_to uuid,
    p_amount numeric,
    p_notes text DEFAULT NULL,
    p_year_month text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_settlement_id uuid;
    v_year_month text;
BEGIN
    v_year_month := COALESCE(p_year_month, to_char(now(), 'YYYY-MM'));

    INSERT INTO group_expense.settlements (
        group_id, paid_by, paid_to, amount, notes, year_month
    ) VALUES (
        p_group_id, auth.uid(), p_paid_to, p_amount, p_notes, v_year_month
    )
    RETURNING id INTO v_settlement_id;

    -- If settling a historical month, refresh its snapshot
    IF p_year_month IS NOT NULL AND p_year_month != to_char(now(), 'YYYY-MM') THEN
        PERFORM group_expense.create_monthly_snapshot(p_group_id, p_year_month);
    END IF;

    RETURN v_settlement_id;
END;
$$;
```

- [ ] **Step 2: Update schema.sql documentation**

Add the new table and RPC signatures to the schema.sql file for reference.

- [ ] **Step 3: Verify migration applied**

Use `mcp__supabase__list_tables` to confirm `monthly_debt_snapshots` exists.

- [ ] **Step 4: Commit**

```bash
git add schema.sql
git commit -m "feat(db): add monthly_debt_snapshots table and monthly RPC functions"
```

---

## Chunk 3: Settlement Store Extension

### Task 3.1: Add Monthly Snapshot Actions

**Files:**
- Modify: `src/features/settlement/stores/settlement.ts`

- [ ] **Step 1: Add imports for new types**

At line 5, add the new types to the import:

```typescript
import type {
    NetBalance,
    SimplifiedDebt,
    SettlementHistoryItem,
    MonthlyDebtSnapshot,
    MonthlyDebtSummary
} from '@/entities/settlement/types'
```

- [ ] **Step 2: Add monthly snapshot state**

After `error` ref (line 16), add:

```typescript
    const monthlySnapshots = ref<MonthlyDebtSnapshot[]>([])
    const currentMonthSnapshot = ref<MonthlyDebtSnapshot | null>(null)
```

- [ ] **Step 3: Add fetchMonthlySnapshots action**

After `clearSettlementData` (line 220), add:

```typescript
    // Action: fetch all monthly snapshots for a group
    const fetchMonthlySnapshots = async (groupId: string): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { data, error: rpcError } = await supabase
                .rpc('get_monthly_snapshots', { p_group_id: groupId })

            if (rpcError) throw rpcError

            const rows = (data ?? []) as Array<{
                id: string
                year_month: string
                snapshot_data: {
                    netBalances: Array<{ userId: string; netBalance: number }>
                    simplifiedDebts: Array<{ fromUser: string; toUser: string; amount: number }>
                    expenseCount: number
                    totalExpense: number
                }
                total_unsettled: number
                status: string
            }>

            // Collect all user IDs from all snapshots
            const allUserIds = new Set<string>()
            for (const row of rows) {
                for (const nb of row.snapshot_data.netBalances) {
                    allUserIds.add(nb.userId)
                }
                for (const sd of row.snapshot_data.simplifiedDebts) {
                    allUserIds.add(sd.fromUser)
                    allUserIds.add(sd.toUser)
                }
            }

            const profilesMap = await fetchUserProfilesMap([...allUserIds])

            monthlySnapshots.value = rows.map(row => ({
                id: row.id,
                groupId,
                yearMonth: row.year_month,
                netBalances: row.snapshot_data.netBalances.map(nb => ({
                    userId: nb.userId,
                    displayName: profilesMap.get(nb.userId)?.display_name ?? null,
                    avatarUrl: profilesMap.get(nb.userId)?.avatar_url ?? null,
                    netBalance: nb.netBalance
                })),
                simplifiedDebts: row.snapshot_data.simplifiedDebts.map(sd => ({
                    fromUser: {
                        userId: sd.fromUser,
                        displayName: profilesMap.get(sd.fromUser)?.display_name ?? null,
                        avatarUrl: profilesMap.get(sd.fromUser)?.avatar_url ?? null
                    },
                    toUser: {
                        userId: sd.toUser,
                        displayName: profilesMap.get(sd.toUser)?.display_name ?? null,
                        avatarUrl: profilesMap.get(sd.toUser)?.avatar_url ?? null
                    },
                    amount: sd.amount
                })),
                expenseCount: row.snapshot_data.expenseCount,
                totalExpense: row.snapshot_data.totalExpense,
                totalUnsettled: row.total_unsettled,
                status: row.status as MonthlyDebtSnapshot['status']
            }))
        } catch (err) {
            console.error('獲取月結快照失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取月結快照失敗'
        } finally {
            loadingCount.value--
        }
    }
```

- [ ] **Step 4: Add fetchCurrentMonthDebts action**

```typescript
    // Action: fetch current month debts (real-time calculation)
    const fetchCurrentMonthDebts = async (groupId: string): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const currentYearMonth = new Date().toISOString().slice(0, 7)

            // Fetch monthly balances and simplified debts in parallel
            const [balancesResult, debtsResult] = await Promise.all([
                supabase.rpc('get_monthly_balances', {
                    p_group_id: groupId,
                    p_year_month: currentYearMonth
                }),
                supabase.rpc('get_monthly_simplified_debts', {
                    p_group_id: groupId,
                    p_year_month: currentYearMonth
                })
            ])

            if (balancesResult.error) throw balancesResult.error
            if (debtsResult.error) throw debtsResult.error

            const balanceRows = (balancesResult.data ?? []) as Array<{ user_id: string; net_balance: number }>
            const debtRows = (debtsResult.data ?? []) as Array<{ from_user: string; to_user: string; amount: number }>

            const allUserIds = [
                ...new Set([
                    ...balanceRows.map(r => r.user_id),
                    ...debtRows.flatMap(r => [r.from_user, r.to_user])
                ])
            ]
            const profilesMap = await fetchUserProfilesMap(allUserIds)

            // Get expense stats for current month
            const startDate = `${currentYearMonth}-01`
            const nextMonth = new Date(new Date(startDate).getTime())
            nextMonth.setMonth(nextMonth.getMonth() + 1)
            const endDate = nextMonth.toISOString().slice(0, 10)

            const { data: expenseData } = await supabase
                .from('expenses')
                .select('amount')
                .eq('group_id', groupId)
                .gte('date', startDate)
                .lt('date', endDate)

            const expenses = (expenseData ?? []) as Array<{ amount: number }>
            const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0)
            const totalUnsettled = debtRows.reduce((sum, d) => sum + d.amount, 0)

            currentMonthSnapshot.value = {
                id: null,
                groupId,
                yearMonth: currentYearMonth,
                netBalances: balanceRows.map(r => ({
                    userId: r.user_id,
                    displayName: profilesMap.get(r.user_id)?.display_name ?? null,
                    avatarUrl: profilesMap.get(r.user_id)?.avatar_url ?? null,
                    netBalance: r.net_balance
                })),
                simplifiedDebts: debtRows.map(r => ({
                    fromUser: {
                        userId: r.from_user,
                        displayName: profilesMap.get(r.from_user)?.display_name ?? null,
                        avatarUrl: profilesMap.get(r.from_user)?.avatar_url ?? null
                    },
                    toUser: {
                        userId: r.to_user,
                        displayName: profilesMap.get(r.to_user)?.display_name ?? null,
                        avatarUrl: profilesMap.get(r.to_user)?.avatar_url ?? null
                    },
                    amount: r.amount
                })),
                expenseCount: expenses.length,
                totalExpense,
                totalUnsettled,
                status: 'in_progress'
            }
        } catch (err) {
            console.error('獲取當月債務失敗:', err)
            error.value = err instanceof Error ? err.message : '獲取當月債務失敗'
        } finally {
            loadingCount.value--
        }
    }
```

- [ ] **Step 5: Add settleMonthlyDebt action**

```typescript
    // Action: settle debt for a specific month
    const settleMonthlyDebt = async (
        groupId: string,
        paidTo: string,
        amount: number,
        yearMonth: string,
        notes?: string
    ): Promise<void> => {
        try {
            loadingCount.value++
            error.value = null

            const { error: rpcError } = await supabase
                .rpc('settle_monthly_debt', {
                    p_group_id: groupId,
                    p_paid_to: paidTo,
                    p_amount: amount,
                    p_notes: notes ?? null,
                    p_year_month: yearMonth
                })

            if (rpcError) throw rpcError

            // Refresh: if current month, refresh real-time; otherwise refresh snapshots
            const currentYearMonth = new Date().toISOString().slice(0, 7)
            if (yearMonth === currentYearMonth) {
                await fetchCurrentMonthDebts(groupId)
            } else {
                await fetchMonthlySnapshots(groupId)
            }
        } catch (err) {
            console.error('月結結算失敗:', err)
            error.value = err instanceof Error ? err.message : '月結結算失敗'
            throw err
        } finally {
            loadingCount.value--
        }
    }
```

- [ ] **Step 6: Update clearSettlementData**

Add snapshot clearing to the existing `clearSettlementData`:

```typescript
    const clearSettlementData = (): void => {
        netBalances.value = []
        simplifiedDebts.value = []
        settlements.value = []
        monthlySnapshots.value = []
        currentMonthSnapshot.value = null
        error.value = null
    }
```

- [ ] **Step 7: Update return object**

Add new state and actions to the return object:

```typescript
    return {
        // State
        netBalances,
        simplifiedDebts,
        settlements,
        monthlySnapshots,
        currentMonthSnapshot,
        loading,
        error,

        // Computed
        hasOutstandingDebts,
        totalGroupDebt,

        // Actions
        fetchNetBalances,
        fetchSimplifiedDebts,
        fetchSettlementHistory,
        getSettlementHistory,
        createSettlement,
        clearSettlementData,
        fetchMonthlySnapshots,
        fetchCurrentMonthDebts,
        settleMonthlyDebt
    }
```

- [ ] **Step 8: Verify typecheck passes**

Run: `bunx vue-tsc -b --noEmit 2>&1 | head -20`

- [ ] **Step 9: Commit**

```bash
git add src/features/settlement/stores/settlement.ts
git commit -m "feat(store): add monthly snapshot actions to settlement store"
```

---

## Chunk 4: Navigation & Routing

### Task 4.1: Update Router

**Files:**
- Modify: `src/app/router/routes/index.ts`

- [ ] **Step 1: Replace balances route with overview, remove statistics**

Replace lines 36-47 (balances and statistics routes) with:

```typescript
    overview: {
        name: 'Overview',
        path: '/overview',
        meta: { title: '總覽', roles: [], requiresAuth: true },
        component: () => import('@/pages/overview/OverviewPage.vue')
    } satisfies RouteRecordRaw,
```

Remove the `statistics` route entirely.

- [ ] **Step 2: Commit**

```bash
git add src/app/router/routes/index.ts
git commit -m "refactor(router): replace balances/statistics routes with overview"
```

### Task 4.2: Update BottomNavigation

**Files:**
- Modify: `src/shared/components/BottomNavigation.vue`

- [ ] **Step 1: Change icon import**

Replace `Wallet` import with `PieChart`:

```typescript
import {
    LayoutDashboard,
    Receipt,
    PieChart,
    Settings,
    Plus
} from 'lucide-vue-next'
```

- [ ] **Step 2: Update 4th button template**

Replace the Balances button (lines 45-56) with:

```vue
            <!-- Overview -->
            <button
                class="nav-item press-feedback hover-transition"
                @click="handleNavigation('overview')"
            >
                <PieChart
                    :class="['h-5 w-5 transition-colors duration-150', activeTab === 'overview' ? 'text-brand-primary' : 'text-muted-foreground']"
                />
                <span
                    :class="['nav-dot transition-all duration-200', activeTab === 'overview' ? 'opacity-100 scale-100' : 'opacity-0 scale-0']"
                />
            </button>
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/BottomNavigation.vue
git commit -m "refactor(nav): change 4th tab from Balances to Overview"
```

### Task 4.3: Update App.vue

**Files:**
- Modify: `src/app/App.vue`

- [ ] **Step 1: Update pageIndexMap**

Replace `'/balances': 3` with `'/overview': 3`:

```typescript
const pageIndexMap: Record<string, number> = {
    '/': 0,
    '/dashboard': 1,
    '/expenses': 2,
    '/overview': 3,
    '/settings': 4
}
```

- [ ] **Step 2: Update routesWithBottomNav**

Replace `'/balances'` with `'/overview'`:

```typescript
const routesWithBottomNav = ['/dashboard', '/expenses', '/overview', '/settings']
```

- [ ] **Step 3: Update activeTab computed**

Replace the `'/balances'` case:

```typescript
const activeTab = computed(() => {
    switch (route.path) {
        case '/dashboard':
            return 'dashboard'
        case '/expenses':
            return 'expenses'
        case '/overview':
            return 'overview'
        case '/settings':
            return 'settings'
        default:
            return 'dashboard'
    }
})
```

- [ ] **Step 4: Update handleNavigation**

Replace the `'balances'` case:

```typescript
const handleNavigation = (tab: string) => {
    switch (tab) {
        case 'dashboard':
            router.push({ name: routes.dashboard.name })
            break
        case 'expenses':
            router.push({ name: routes.expenses.name })
            break
        case 'overview':
            router.push({ name: routes.overview.name })
            break
        case 'settings':
            router.push({ name: routes.settings.name })
            break
        default:
            console.log('Unknown tab:', tab)
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/App.vue
git commit -m "refactor(app): wire overview route into App.vue navigation"
```

---

## Chunk 5: Overview Page Shell

### Task 5.1: Create OverviewPage with Swipeable Panels

**Files:**
- Create: `src/pages/overview/OverviewPage.vue`

- [ ] **Step 1: Create the page component**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TopBar from '@/shared/components/TopBar.vue'
import StatisticsPanel from '@/features/statistics/components/StatisticsPanel.vue'
import DebtPanel from '@/features/settlement/components/DebtPanel.vue'

const { t } = useI18n()

const activePanel = ref<'statistics' | 'debts'>('statistics')

const panelContainerRef = ref<HTMLElement | null>(null)

// Touch/swipe handling
const touchStartX = ref(0)
const touchDeltaX = ref(0)
const isSwiping = ref(false)
const SWIPE_THRESHOLD = 50

const prefersReducedMotion = computed(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

const handleTouchStart = (e: TouchEvent) => {
    touchStartX.value = e.touches[0].clientX
    touchDeltaX.value = 0
    isSwiping.value = true
}

const handleTouchMove = (e: TouchEvent) => {
    if (!isSwiping.value) return
    touchDeltaX.value = e.touches[0].clientX - touchStartX.value
}

const handleTouchEnd = () => {
    if (!isSwiping.value) return
    isSwiping.value = false

    if (Math.abs(touchDeltaX.value) > SWIPE_THRESHOLD) {
        if (touchDeltaX.value < 0 && activePanel.value === 'statistics') {
            activePanel.value = 'debts'
        } else if (touchDeltaX.value > 0 && activePanel.value === 'debts') {
            activePanel.value = 'statistics'
        }
    }
    touchDeltaX.value = 0
}

const switchPanel = (panel: 'statistics' | 'debts') => {
    activePanel.value = panel
}
</script>

<template>
    <div class="min-h-screen pb-28">
        <TopBar :title="t('overview.title')" />

        <!-- Panel Indicator -->
        <div class="flex items-center justify-center gap-4 py-3 px-4">
            <button
                class="text-sm font-medium transition-colors duration-150 cursor-pointer"
                :class="activePanel === 'statistics'
                    ? 'text-brand-primary'
                    : 'text-muted-foreground'"
                @click="switchPanel('statistics')"
            >
                {{ t('overview.statistics') }}
            </button>

            <div class="flex items-center gap-1.5">
                <span
                    class="block w-2 h-2 rounded-full transition-all duration-200"
                    :class="activePanel === 'statistics'
                        ? 'bg-brand-primary scale-100'
                        : 'bg-muted-foreground/30 scale-75'"
                />
                <span
                    class="block w-2 h-2 rounded-full transition-all duration-200"
                    :class="activePanel === 'debts'
                        ? 'bg-brand-primary scale-100'
                        : 'bg-muted-foreground/30 scale-75'"
                />
            </div>

            <button
                class="text-sm font-medium transition-colors duration-150 cursor-pointer"
                :class="activePanel === 'debts'
                    ? 'text-brand-primary'
                    : 'text-muted-foreground'"
                @click="switchPanel('debts')"
            >
                {{ t('overview.debts') }}
            </button>
        </div>

        <!-- Swipeable Panel Container -->
        <div
            ref="panelContainerRef"
            class="overflow-hidden"
            @touchstart.passive="handleTouchStart"
            @touchmove.passive="handleTouchMove"
            @touchend="handleTouchEnd"
        >
            <div
                class="flex w-[200%]"
                :class="prefersReducedMotion ? '' : 'transition-transform duration-300 ease-out'"
                :style="{
                    transform: `translateX(${activePanel === 'statistics' ? '0%' : '-50%'})`
                }"
            >
                <div class="w-1/2 min-h-0">
                    <StatisticsPanel />
                </div>
                <div class="w-1/2 min-h-0">
                    <DebtPanel />
                </div>
            </div>
        </div>
    </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/overview/OverviewPage.vue
git commit -m "feat(overview): create OverviewPage with swipeable panel shell"
```

---

## Chunk 6: Statistics Panel

### Task 6.1: Create StatisticsPanel Component

**Files:**
- Create: `src/features/statistics/components/StatisticsPanel.vue`

This component combines summary cards + period controls + area chart + calendar + category breakdown. It reuses logic from the existing `ChartView.vue` (area chart, period selection, category stats) and `CalendarView.vue`.

- [ ] **Step 1: Create the component**

The StatisticsPanel should:
- Import and use `CalendarView` directly (pass `scope` based on group context)
- Extract the area chart logic from `ChartView.vue` (lines ~405-600 for area chart data computation, and template lines ~30-90 for the area chart rendering)
- Include period controls (month/year toggle + period selector) from ChartView
- Include summary cards (monthly total, today/daily average)
- Include category breakdown table from ChartView (lines ~240-310)
- **NOT** include: horizontal bar chart, daily trend chart, member spending ratio, settlement info

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useExpenseStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import CalendarView from '@/features/statistics/components/CalendarView.vue'
import { VisXYContainer, VisArea, VisAxis, VisLine, VisCrosshair } from '@unovis/vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { Expense } from '@/entities/expense/types'

const { t } = useI18n()
const expenseStore = useExpenseStore()
const groupStore = useGroupStore()

const isPersonalMode = computed(() => !groupStore.activeGroupId)
const scope = computed(() => isPersonalMode.value ? 'personal' : 'group')

// Time range controls
const timeRange = ref<'month' | 'year'>('month')
const currentPeriod = ref(new Date())

const currentPeriodLabel = computed(() => {
    const d = currentPeriod.value
    if (timeRange.value === 'month') {
        return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
    }
    return `${d.getFullYear()} 年`
})

const navigatePeriod = (direction: -1 | 1) => {
    const d = new Date(currentPeriod.value)
    if (timeRange.value === 'month') {
        d.setMonth(d.getMonth() + direction)
    } else {
        d.setFullYear(d.getFullYear() + direction)
    }
    currentPeriod.value = d
}

// Scoped expenses
const scopedExpenses = computed(() => {
    if (isPersonalMode.value) {
        return expenseStore.personalExpenses
    }
    return expenseStore.groupExpenses
})

// Period-filtered expenses
const periodExpenses = computed(() => {
    const d = currentPeriod.value
    return scopedExpenses.value.filter((e: Expense) => {
        const expDate = new Date(e.date)
        if (timeRange.value === 'month') {
            return expDate.getFullYear() === d.getFullYear()
                && expDate.getMonth() === d.getMonth()
        }
        return expDate.getFullYear() === d.getFullYear()
    })
})

// Summary stats
const totalAmount = computed(() =>
    periodExpenses.value.reduce((sum: number, e: Expense) => sum + e.amount, 0)
)

const todayTotal = computed(() => {
    const today = new Date().toISOString().slice(0, 10)
    return scopedExpenses.value
        .filter((e: Expense) => e.date === today)
        .reduce((sum: number, e: Expense) => sum + e.amount, 0)
})

const dailyAverage = computed(() => {
    const d = currentPeriod.value
    const daysInPeriod = timeRange.value === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        : 365
    return totalAmount.value / Math.max(daysInPeriod, 1)
})

// Category stats
const categoryStats = computed(() => {
    const stats: Record<string, { total: number; count: number }> = {}
    for (const e of periodExpenses.value) {
        if (!stats[e.category]) {
            stats[e.category] = { total: 0, count: 0 }
        }
        stats[e.category].total += e.amount
        stats[e.category].count++
    }
    return Object.entries(stats)
        .map(([category, data]) => ({
            category,
            ...data,
            percentage: totalAmount.value > 0
                ? (data.total / totalAmount.value * 100)
                : 0
        }))
        .sort((a, b) => b.total - a.total)
})

// Area chart data
const CATEGORY_COLORS = [
    'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
    'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'
]

const areaChartData = computed(() => {
    const categories = categoryStats.value.map(c => c.category)
    const d = currentPeriod.value

    if (timeRange.value === 'month') {
        // Group by week
        const weeks: Record<number, Record<string, number>> = {}
        for (const e of periodExpenses.value) {
            const expDate = new Date(e.date)
            const weekNum = Math.ceil(expDate.getDate() / 7)
            if (!weeks[weekNum]) weeks[weekNum] = {}
            weeks[weekNum][e.category] = (weeks[weekNum][e.category] ?? 0) + e.amount
        }

        const totalWeeks = Math.ceil(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() / 7)
        return Array.from({ length: totalWeeks }, (_, i) => {
            const weekData: Record<string, number> = { x: i + 1 }
            for (const cat of categories) {
                weekData[cat] = weeks[i + 1]?.[cat] ?? 0
            }
            return weekData
        })
    } else {
        // Group by month
        const months: Record<number, Record<string, number>> = {}
        for (const e of periodExpenses.value) {
            const expDate = new Date(e.date)
            const month = expDate.getMonth()
            if (!months[month]) months[month] = {}
            months[month][e.category] = (months[month][e.category] ?? 0) + e.amount
        }

        return Array.from({ length: 12 }, (_, i) => {
            const monthData: Record<string, number> = { x: i + 1 }
            for (const cat of categories) {
                monthData[cat] = months[i]?.[cat] ?? 0
            }
            return monthData
        })
    }
})

const areaCategories = computed(() => categoryStats.value.map(c => c.category))

const formatCurrency = (val: number) => {
    return `NT$ ${Math.round(val).toLocaleString()}`
}
</script>

<template>
    <div class="px-4 space-y-4">
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 gap-3">
            <div class="glass rounded-2xl p-4">
                <p class="text-xs text-muted-foreground">{{ t('overview.monthlyTotal') }}</p>
                <p class="text-xl font-bold mt-1">{{ formatCurrency(totalAmount) }}</p>
            </div>
            <div class="glass rounded-2xl p-4">
                <p class="text-xs text-muted-foreground">
                    {{ timeRange === 'month' ? t('overview.todayExpense') : t('overview.dailyAverage') }}
                </p>
                <p class="text-xl font-bold mt-1">
                    {{ formatCurrency(timeRange === 'month' ? todayTotal : dailyAverage) }}
                </p>
            </div>
        </div>

        <!-- Period Controls -->
        <div class="flex items-center justify-between">
            <div class="flex gap-1">
                <button
                    class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer"
                    :class="timeRange === 'month'
                        ? 'bg-brand-primary text-white'
                        : 'glass text-muted-foreground'"
                    @click="timeRange = 'month'"
                >
                    {{ t('overview.byMonth') }}
                </button>
                <button
                    class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer"
                    :class="timeRange === 'year'
                        ? 'bg-brand-primary text-white'
                        : 'glass text-muted-foreground'"
                    @click="timeRange = 'year'"
                >
                    {{ t('overview.byYear') }}
                </button>
            </div>

            <div class="flex items-center gap-2">
                <button
                    class="p-1.5 rounded-full glass cursor-pointer press-feedback"
                    @click="navigatePeriod(-1)"
                >
                    <ChevronLeft class="h-4 w-4" />
                </button>
                <span class="text-sm font-medium min-w-[100px] text-center">
                    {{ currentPeriodLabel }}
                </span>
                <button
                    class="p-1.5 rounded-full glass cursor-pointer press-feedback"
                    @click="navigatePeriod(1)"
                >
                    <ChevronRight class="h-4 w-4" />
                </button>
            </div>
        </div>

        <!-- Area Chart -->
        <div
            v-if="areaChartData.length > 0 && areaCategories.length > 0"
            class="glass rounded-2xl p-4"
        >
            <h3 class="text-sm font-medium mb-3">{{ t('overview.areaChartTitle') }}</h3>
            <div class="h-48">
                <VisXYContainer :data="areaChartData">
                    <VisArea
                        v-for="(cat, index) in areaCategories"
                        :key="cat"
                        :x="(d: Record<string, number>) => d.x"
                        :y="(d: Record<string, number>) => d[cat] ?? 0"
                        :color="CATEGORY_COLORS[index % CATEGORY_COLORS.length]"
                        :opacity="0.6"
                        :curve-type="'basis'"
                    />
                    <VisLine
                        v-for="(cat, index) in areaCategories"
                        :key="`line-${cat}`"
                        :x="(d: Record<string, number>) => d.x"
                        :y="(d: Record<string, number>) => d[cat] ?? 0"
                        :color="CATEGORY_COLORS[index % CATEGORY_COLORS.length]"
                        :width="1.5"
                        :curve-type="'basis'"
                    />
                    <VisAxis type="x" :num-ticks="areaChartData.length" />
                    <VisAxis type="y" />
                </VisXYContainer>
            </div>
        </div>

        <!-- Calendar View -->
        <CalendarView :scope="scope" />

        <!-- Category Breakdown -->
        <div
            v-if="categoryStats.length > 0"
            class="glass rounded-2xl p-4"
        >
            <h3 class="text-sm font-medium mb-3">{{ t('overview.categoryBreakdown') }}</h3>
            <div class="space-y-3">
                <div
                    v-for="stat in categoryStats"
                    :key="stat.category"
                    class="flex items-center gap-3"
                >
                    <div
                        class="w-3 h-3 rounded-full shrink-0"
                        :style="{ backgroundColor: `var(--category-${stat.category})` }"
                    />
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm">
                                {{ t(`expense.categories.${stat.category}`, stat.category) }}
                            </span>
                            <span class="text-sm font-medium">
                                {{ formatCurrency(stat.total) }}
                            </span>
                        </div>
                        <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                                class="h-full rounded-full transition-all duration-300"
                                :style="{
                                    width: `${stat.percentage}%`,
                                    backgroundColor: `var(--category-${stat.category})`
                                }"
                            />
                        </div>
                        <div class="flex items-center justify-between mt-0.5">
                            <span class="text-xs text-muted-foreground">
                                {{ stat.count }} {{ t('stats.count') }}
                            </span>
                            <span class="text-xs text-muted-foreground">
                                {{ stat.percentage.toFixed(1) }}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `bunx vue-tsc -b --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/features/statistics/components/StatisticsPanel.vue
git commit -m "feat(statistics): create StatisticsPanel component for overview page"
```

---

## Chunk 7: Debt Panel Components

### Task 7.1: Create MonthPills Component

**Files:**
- Create: `src/features/settlement/components/MonthPills.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
    months: string[]          // ['2026-01', '2026-02', '2026-03']
    modelValue: string        // selected month '2026-03'
    currentMonth: string      // '2026-03' (real-time month)
}

const props = defineProps<Props>()
const emit = defineEmits<{
    'update:modelValue': [month: string]
}>()

const { t } = useI18n()
const scrollContainerRef = ref<HTMLElement | null>(null)

const formatMonth = (yearMonth: string): string => {
    const [year, month] = yearMonth.split('-')
    const monthNum = parseInt(month, 10)
    if (yearMonth === props.currentMonth) {
        return t('overview.currentMonth')
    }
    return `${monthNum}月`
}

const formatYear = (yearMonth: string): string => {
    return yearMonth.split('-')[0]
}

// Group months by year for display
const needsYearLabel = (yearMonth: string, index: number): boolean => {
    if (index === 0) return true
    const prevYear = props.months[index - 1]?.split('-')[0]
    return yearMonth.split('-')[0] !== prevYear
}

const selectMonth = (month: string) => {
    emit('update:modelValue', month)
}

// Auto-scroll to selected month
const scrollToSelected = async () => {
    await nextTick()
    const container = scrollContainerRef.value
    if (!container) return
    const selected = container.querySelector('[data-selected="true"]') as HTMLElement
    if (selected) {
        selected.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
}

onMounted(scrollToSelected)
watch(() => props.modelValue, scrollToSelected)
</script>

<template>
    <div
        ref="scrollContainerRef"
        class="flex items-center gap-2 overflow-x-auto px-4 py-2 scrollbar-hide"
    >
        <template v-for="(month, index) in months" :key="month">
            <!-- Year divider -->
            <span
                v-if="needsYearLabel(month, index)"
                class="text-xs text-muted-foreground font-medium shrink-0 pr-1"
            >
                {{ formatYear(month) }}
            </span>

            <button
                class="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer press-feedback"
                :class="modelValue === month
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'glass text-muted-foreground hover:text-foreground'"
                :data-selected="modelValue === month"
                @click="selectMonth(month)"
            >
                {{ formatMonth(month) }}
            </button>
        </template>
    </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/settlement/components/MonthPills.vue
git commit -m "feat(debt): create MonthPills horizontal scrollable selector"
```

### Task 7.2: Create MonthlyDebtCard Component

**Files:**
- Create: `src/features/settlement/components/MonthlyDebtCard.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronUp, CircleDot, CheckCircle2, AlertCircle } from 'lucide-vue-next'
import DebtSummaryCard from '@/features/settlement/components/DebtSummaryCard.vue'
import SettlementHistory from '@/features/settlement/components/SettlementHistory.vue'
import type { MonthlyDebtSnapshot } from '@/entities/settlement/types'

interface Props {
    snapshot: MonthlyDebtSnapshot
    currentUserId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
    settle: [snapshot: MonthlyDebtSnapshot, debt: { fromUser: { userId: string }; toUser: { userId: string }; amount: number }]
}>()

const { t } = useI18n()
const isExpanded = ref(false)

const toggleExpand = () => {
    isExpanded.value = !isExpanded.value
}

const monthLabel = computed(() => {
    const [year, month] = props.snapshot.yearMonth.split('-')
    return `${year} 年 ${parseInt(month, 10)} 月`
})

const statusConfig = computed(() => {
    switch (props.snapshot.status) {
        case 'in_progress':
            return {
                icon: CircleDot,
                label: t('overview.inProgress'),
                class: 'text-brand-primary',
                dotClass: 'bg-brand-primary'
            }
        case 'settled':
            return {
                icon: CheckCircle2,
                label: t('overview.settled'),
                class: 'text-green-600 dark:text-green-400',
                dotClass: 'bg-green-500'
            }
        case 'partial':
            return {
                icon: AlertCircle,
                label: t('overview.partiallyUnsettled'),
                class: 'text-amber-600 dark:text-amber-400',
                dotClass: 'bg-amber-500'
            }
        default:
            return {
                icon: AlertCircle,
                label: t('overview.unsettled'),
                class: 'text-red-600 dark:text-red-400',
                dotClass: 'bg-red-500'
            }
    }
})

const formatCurrency = (val: number) => `NT$ ${Math.round(val).toLocaleString()}`

const handleSettle = (debt: { fromUser: { userId: string }; toUser: { userId: string }; amount: number }) => {
    emit('settle', props.snapshot, debt)
}
</script>

<template>
    <div class="glass rounded-2xl overflow-hidden">
        <!-- Collapsed Summary -->
        <button
            class="w-full p-4 flex items-center justify-between cursor-pointer press-feedback"
            @click="toggleExpand"
        >
            <div class="flex items-center gap-3">
                <div
                    class="w-2 h-2 rounded-full shrink-0"
                    :class="statusConfig.dotClass"
                />
                <div class="text-left">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium">{{ monthLabel }}</span>
                        <span
                            class="text-xs px-1.5 py-0.5 rounded-full"
                            :class="statusConfig.class"
                        >
                            {{ statusConfig.label }}
                        </span>
                    </div>
                    <p class="text-xs text-muted-foreground mt-0.5">
                        <template v-if="snapshot.totalUnsettled > 0">
                            {{ t('overview.totalUnsettled') }} {{ formatCurrency(snapshot.totalUnsettled) }}
                            · {{ t('overview.pendingSettlement', { count: snapshot.simplifiedDebts.length }) }}
                        </template>
                        <template v-else>
                            {{ t('balance.allSettledDesc') }}
                        </template>
                    </p>
                </div>
            </div>
            <component
                :is="isExpanded ? ChevronUp : ChevronDown"
                class="h-4 w-4 text-muted-foreground shrink-0"
            />
        </button>

        <!-- Expanded Details -->
        <Transition name="expand">
            <div v-if="isExpanded" class="border-t border-glass-border">
                <!-- Simplified Debts -->
                <div
                    v-if="snapshot.simplifiedDebts.length > 0"
                    class="p-4 space-y-3"
                >
                    <DebtSummaryCard
                        v-for="(debt, index) in snapshot.simplifiedDebts"
                        :key="index"
                        :from-user="debt.fromUser"
                        :to-user="debt.toUser"
                        :amount="debt.amount"
                        :is-current-user="
                            debt.fromUser.userId === currentUserId
                            || debt.toUser.userId === currentUserId
                        "
                        @settle="handleSettle(debt)"
                    />
                </div>

                <!-- Net Balances -->
                <div
                    v-if="snapshot.netBalances.length > 0"
                    class="px-4 pb-4"
                >
                    <h4 class="text-xs font-medium text-muted-foreground mb-2">
                        {{ t('balance.netBalances') }}
                    </h4>
                    <div class="space-y-2">
                        <div
                            v-for="balance in snapshot.netBalances"
                            :key="balance.userId"
                            class="flex items-center justify-between py-1.5"
                        >
                            <span class="text-sm">
                                {{ balance.displayName ?? t('common.unknown') }}
                                <span
                                    v-if="balance.userId === currentUserId"
                                    class="text-xs text-muted-foreground"
                                >
                                    ({{ t('common.me') }})
                                </span>
                            </span>
                            <span
                                class="text-sm font-medium"
                                :class="{
                                    'text-green-600 dark:text-green-400': balance.netBalance > 0.01,
                                    'text-red-600 dark:text-red-400': balance.netBalance < -0.01,
                                    'text-muted-foreground': Math.abs(balance.netBalance) <= 0.01
                                }"
                            >
                                {{ balance.netBalance > 0 ? '+' : '' }}{{ formatCurrency(balance.netBalance) }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Settlement History for this month -->
                <div class="px-4 pb-4">
                    <SettlementHistory
                        v-if="snapshot.groupId"
                        :group-id="snapshot.groupId"
                    />
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
    transition: all 0.2s ease-out;
    overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
    opacity: 0;
    max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
    opacity: 1;
    max-height: 2000px;
}

@media (prefers-reduced-motion: reduce) {
    .expand-enter-active,
    .expand-leave-active {
        transition: none;
    }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/settlement/components/MonthlyDebtCard.vue
git commit -m "feat(debt): create MonthlyDebtCard collapsible component"
```

### Task 7.3: Create useMonthlySnapshots Composable

**Files:**
- Create: `src/features/settlement/composables/useMonthlySnapshots.ts`

- [ ] **Step 1: Create the composable**

```typescript
import { ref, computed, watch } from 'vue'
import { useSettlementStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import type { MonthlyDebtSnapshot } from '@/entities/settlement/types'

export function useMonthlySnapshots() {
    const settlementStore = useSettlementStore()
    const groupStore = useGroupStore()

    const selectedMonth = ref(getCurrentYearMonth())
    const isLoading = ref(false)

    // All months: current month + historical snapshots
    const allMonths = computed<string[]>(() => {
        const current = getCurrentYearMonth()
        const snapshotMonths = settlementStore.monthlySnapshots.map(s => s.yearMonth)
        const allSet = new Set([current, ...snapshotMonths])
        return [...allSet].sort().reverse() // newest first
    })

    // The snapshot for the selected month
    const selectedSnapshot = computed<MonthlyDebtSnapshot | null>(() => {
        const current = getCurrentYearMonth()
        if (selectedMonth.value === current) {
            return settlementStore.currentMonthSnapshot
        }
        return settlementStore.monthlySnapshots.find(
            s => s.yearMonth === selectedMonth.value
        ) ?? null
    })

    // Load data when group changes
    const loadData = async () => {
        const groupId = groupStore.activeGroupId
        if (!groupId) return

        isLoading.value = true
        try {
            await Promise.all([
                settlementStore.fetchMonthlySnapshots(groupId),
                settlementStore.fetchCurrentMonthDebts(groupId)
            ])
            // Default to current month
            selectedMonth.value = getCurrentYearMonth()
        } finally {
            isLoading.value = false
        }
    }

    const refreshCurrentMonth = async () => {
        const groupId = groupStore.activeGroupId
        if (!groupId) return
        await settlementStore.fetchCurrentMonthDebts(groupId)
    }

    // Watch for group changes
    watch(
        () => groupStore.activeGroupId,
        (newId) => {
            if (newId) {
                loadData()
            } else {
                settlementStore.clearSettlementData()
            }
        },
        { immediate: true }
    )

    return {
        selectedMonth,
        allMonths,
        selectedSnapshot,
        isLoading,
        loadData,
        refreshCurrentMonth
    }
}

function getCurrentYearMonth(): string {
    return new Date().toISOString().slice(0, 7)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/settlement/composables/useMonthlySnapshots.ts
git commit -m "feat(debt): create useMonthlySnapshots composable"
```

### Task 7.4: Create DebtPanel Component

**Files:**
- Create: `src/features/settlement/components/DebtPanel.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Wallet } from 'lucide-vue-next'
import { useGroupStore } from '@/features/group/stores/group'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useSettlementStore } from '@/shared/stores'
import MonthPills from '@/features/settlement/components/MonthPills.vue'
import MonthlyDebtCard from '@/features/settlement/components/MonthlyDebtCard.vue'
import SettlementDrawer from '@/features/settlement/components/SettlementDrawer.vue'
import { useMonthlySnapshots } from '@/features/settlement/composables/useMonthlySnapshots'
import type { MonthlyDebtSnapshot } from '@/entities/settlement/types'

const { t } = useI18n()
const groupStore = useGroupStore()
const authStore = useAuthStore()
const settlementStore = useSettlementStore()

const isPersonalMode = computed(() => !groupStore.activeGroupId)
const currentUserId = computed(() => authStore.user?.id ?? '')
const currentYearMonth = computed(() => new Date().toISOString().slice(0, 7))

const {
    selectedMonth,
    allMonths,
    selectedSnapshot,
    isLoading
} = useMonthlySnapshots()

// Settlement drawer state
const isSettleDrawerOpen = ref(false)
const settleTargetUser = ref<{ userId: string; displayName: string | null; avatarUrl: string | null } | null>(null)
const settleSuggestedAmount = ref(0)
const settleYearMonth = ref('')

const handleSettle = (
    snapshot: MonthlyDebtSnapshot,
    debt: { fromUser: { userId: string }; toUser: { userId: string }; amount: number }
) => {
    const isFromCurrentUser = debt.fromUser.userId === currentUserId.value
    settleTargetUser.value = isFromCurrentUser
        ? { userId: debt.toUser.userId, displayName: (debt.toUser as any).displayName, avatarUrl: (debt.toUser as any).avatarUrl }
        : { userId: debt.fromUser.userId, displayName: (debt.fromUser as any).displayName, avatarUrl: (debt.fromUser as any).avatarUrl }
    settleSuggestedAmount.value = debt.amount
    settleYearMonth.value = snapshot.yearMonth
    isSettleDrawerOpen.value = true
}

const handleSettled = async () => {
    isSettleDrawerOpen.value = false
    const groupId = groupStore.activeGroupId
    if (!groupId) return

    // Refresh data
    await Promise.all([
        settlementStore.fetchMonthlySnapshots(groupId),
        settlementStore.fetchCurrentMonthDebts(groupId)
    ])
}
</script>

<template>
    <div class="px-4">
        <!-- Personal Mode Placeholder -->
        <div
            v-if="isPersonalMode"
            class="flex flex-col items-center justify-center py-20 text-center"
        >
            <div class="w-16 h-16 rounded-full glass-elevated flex items-center justify-center mb-4">
                <Wallet class="h-8 w-8 text-muted-foreground" />
            </div>
            <p class="text-muted-foreground text-sm">
                {{ t('overview.selectGroupForDebts') }}
            </p>
        </div>

        <!-- Group Mode -->
        <template v-else>
            <!-- Month Pills -->
            <MonthPills
                v-if="allMonths.length > 0"
                v-model="selectedMonth"
                :months="allMonths"
                :current-month="currentYearMonth"
            />

            <!-- Loading State -->
            <div v-if="isLoading" class="space-y-3 mt-4">
                <div class="glass rounded-2xl p-4 animate-pulse">
                    <div class="h-4 bg-muted rounded w-1/3 mb-2" />
                    <div class="h-3 bg-muted rounded w-1/2" />
                </div>
                <div class="glass rounded-2xl p-4 animate-pulse">
                    <div class="h-4 bg-muted rounded w-1/4 mb-2" />
                    <div class="h-3 bg-muted rounded w-2/5" />
                </div>
            </div>

            <!-- Selected Month Card -->
            <div v-else-if="selectedSnapshot" class="mt-4">
                <MonthlyDebtCard
                    :snapshot="selectedSnapshot"
                    :current-user-id="currentUserId"
                    @settle="handleSettle"
                />
            </div>

            <!-- No Data -->
            <div
                v-else-if="!isLoading"
                class="flex flex-col items-center justify-center py-16 text-center"
            >
                <p class="text-muted-foreground text-sm">
                    {{ t('overview.noSnapshotsYet') }}
                </p>
            </div>
        </template>

        <!-- Settlement Drawer -->
        <SettlementDrawer
            v-if="settleTargetUser && groupStore.activeGroupId"
            v-model:open="isSettleDrawerOpen"
            :group-id="groupStore.activeGroupId"
            :to-user="settleTargetUser"
            :suggested-amount="settleSuggestedAmount"
            @settled="handleSettled"
        />
    </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/settlement/components/DebtPanel.vue
git commit -m "feat(debt): create DebtPanel component with monthly navigation"
```

---

## Chunk 8: Integration & Verification

### Task 8.1: Verify Build

- [ ] **Step 1: Run typecheck**

Run: `bunx vue-tsc -b --noEmit 2>&1 | head -40`

Fix any type errors that arise from the new components.

- [ ] **Step 2: Run dev server**

Run: `bun run dev`

Verify the app starts without errors and the Overview page loads.

- [ ] **Step 3: Manual smoke test checklist**

1. Bottom nav shows PieChart icon, navigates to `/overview`
2. Panel indicator shows "統計" and "債務" labels with dots
3. Clicking labels switches panels
4. Swiping left/right switches panels
5. Statistics panel: summary cards show, area chart renders, calendar works
6. Debt panel (personal mode): shows placeholder
7. Debt panel (group mode): month pills appear, current month shows "進行中"
8. Expanding a month card shows debt details
9. Settle button opens SettlementDrawer

### Task 8.2: Update Database Types

- [ ] **Step 1: Regenerate Supabase types**

Use `mcp__supabase__generate_typescript_types` and update `src/shared/lib/database.types.ts`.

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/database.types.ts
git commit -m "chore(types): regenerate Supabase database types"
```

### Task 8.3: Enable pg_cron

- [ ] **Step 1: Apply pg_cron schedule via Supabase MCP**

Use `mcp__supabase__execute_sql` to run:

```sql
SELECT cron.schedule(
    'monthly-debt-snapshots',
    '0 0 1 * *',
    $$
    SELECT group_expense.create_monthly_snapshot(g.id, to_char(now() - interval '1 month', 'YYYY-MM'))
    FROM group_expense.groups g
    WHERE g.is_active = true;
    $$
);
```

- [ ] **Step 2: Verify cron job is registered**

Run: `SELECT * FROM cron.job WHERE jobname = 'monthly-debt-snapshots';`

### Task 8.4: Final Commit

- [ ] **Step 1: Stage and commit all remaining changes**

```bash
git add -A
git commit -m "feat(overview): complete Overview page with statistics and monthly debts"
```

---

## Post-Implementation Notes

### Files NOT deleted (kept for reference/rollback)
- `src/pages/balances/BalancesPage.vue` — can be removed after QA
- `src/pages/statistics/StatisticsPage.vue` — can be removed after QA

### Future Improvements
- Generate initial snapshots for past months (backfill script)
- Add pull-to-refresh on both panels
- Add skeleton loading states for area chart
- Consider caching snapshot data in Pinia persisted state
