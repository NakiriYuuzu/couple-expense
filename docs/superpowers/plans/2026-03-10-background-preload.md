# Background Preload Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate page-switching lag by preloading all expense + settlement data in the background after app startup, and remove the now-redundant infinite scroll mechanism.

**Architecture:** App.vue triggers a background preload (via `requestIdleCallback`) after auth + profile/groups init. All pages read from the Pinia store and show skeleton placeholders until preload completes. The infinite scroll composable and pagination tracking in the expense store are removed entirely.

**Tech Stack:** Vue 3 Composition API, Pinia, Supabase, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-10-background-preload-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/features/expense/stores/expense.ts` | Modify | Add `preloadStatus`, remove all pagination code |
| `src/shared/composables/useBackgroundPreload.ts` | Create | Orchestrate background data loading |
| `src/app/App.vue` | Modify | Replace `fetchRecentExpenses` with background preload |
| `src/pages/expenses/ExpensesPage.vue` | Modify | Remove infinite scroll, use preloadStatus for skeleton |
| `src/pages/dashboard/DashboardPage.vue` | Modify | Simplify pull-to-refresh |
| `src/features/statistics/components/StatisticsPanel.vue` | Modify | Remove `onMounted` fetch, watch preloadStatus |
| `src/features/expense/composables/useInfiniteExpenses.ts` | Delete | No longer needed |
| `src/features/expense/stores/__tests__/expense.spec.ts` | Modify | Update tests for new store shape |
| `src/shared/composables/__tests__/useBackgroundPreload.spec.ts` | Create | Test preload composable |

---

## Chunk 1: Expense Store Simplification

### Task 1: Add preloadStatus and remove pagination from expense store

**Files:**
- Modify: `src/features/expense/stores/expense.ts`

- [ ] **Step 1: Add preloadStatus ref and convert fullHistoryLoaded to computed**

In `src/features/expense/stores/expense.ts`, add after the `currentUserId` ref (line ~90):

```typescript
// 預載狀態
const preloadStatus = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
```

Replace `fullHistoryLoaded` ref (line ~105) with a computed:

```typescript
// 完整歷史是否已載入（向後相容）
const fullHistoryLoaded = computed(() => preloadStatus.value === 'done')
```

- [ ] **Step 2: Remove all pagination state and functions**

Remove these items from the store (lines ~92-104, ~302-472, ~549-560):

**State to remove:**
- `loadedMonths` object (lines 93-96)
- `hasMoreMonths` object (lines 97-100)
- `loadingMorePersonal` ref (line 102)
- `loadingMoreGroup` ref (line 103)

**Functions to remove:**
- `getLoadedMonthsSet` (lines 303-313)
- `getHasMore` (lines 316-323)
- `setHasMore` (lines 326-334)
- `getNextUnloadedMonth` (lines 337-357)
- `fetchExpensesForMonth` (lines 360-425)
- `fetchNextMonth` (lines 428-472)
- `fetchRecentExpenses` (lines 475-549)
- `resetPaginationState` (lines 552-560)

- [ ] **Step 3: Update fetchExpenses to set preloadStatus**

Modify `fetchExpenses` (line ~238) to update `preloadStatus`:

```typescript
const fetchExpenses = async (groupId?: string | null) => {
    try {
        loading.value = true
        error.value = null

        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) {
            throw new Error('用戶未登入')
        }

        const userId = userData.user.id
        currentUserId.value = userId

        const groupStore = useGroupStore()
        const targetGroupId = groupId !== undefined ? groupId : groupStore.activeGroupId

        let expensesData: ExpenseRow[] = []

        if (targetGroupId) {
            const { data, error: supabaseError } = await supabase
                .from('expenses')
                .select('*')
                .or(`group_id.eq.${targetGroupId},and(user_id.eq.${userId},group_id.is.null)`)
                .order('date', { ascending: false })

            if (supabaseError) {
                throw supabaseError
            }
            expensesData = data || []
        } else {
            const { data, error: supabaseError } = await supabase
                .from('expenses')
                .select('*')
                .eq('user_id', userId)
                .is('group_id', null)
                .order('date', { ascending: false })

            if (supabaseError) {
                throw supabaseError
            }
            expensesData = data || []
        }

        if (expensesData.length === 0) {
            expenses.value = []
            return
        }

        const allUserIds = [...new Set(expensesData.map(e => e.user_id))]
        const usersMap = await fetchUsersMap(allUserIds)

        expenses.value = expensesData.map(row => mapRowToExpense(row, usersMap))
    } catch (err) {
        console.error('獲取支出記錄失敗:', err)
        error.value = err instanceof Error ? err.message : '未知錯誤'
        throw err
    } finally {
        loading.value = false
    }
}
```

Key changes:
- Removed `fullHistoryLoaded.value = true` (now derived from preloadStatus)
- Added `throw err` in catch block so background preload can handle retries

- [ ] **Step 4: Update the store's return object**

Replace the return object to remove pagination exports and add `preloadStatus`:

Remove from return:
- `loadingMorePersonal`
- `loadingMoreGroup`
- `fetchExpensesForMonth`
- `fetchNextMonth`
- `fetchRecentExpenses`
- `resetPaginationState`
- `getHasMore`

Add to return:
- `preloadStatus`

The return object should include:
```typescript
return {
    // 基本狀態
    expenses,
    loading,
    error,
    lastUsedGroupId,
    currentUserId,
    preloadStatus,

    // 統計數據
    stats,
    personalStats,
    groupStats,

    // 個人/群組支出
    personalExpenses,
    groupExpenses,
    personalExpensesByDate,
    groupExpensesByDate,

    // 完整歷史標記（向後相容）
    fullHistoryLoaded,

    // 方法
    fetchExpenses,
    fetchGroupExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    deleteExpensesByDate,

    // 按日期分組
    expensesByDate,
    dailyTotals,

    // 按類別分組
    expensesByCategory,
    monthlyStats,
    yearlyStats,

    // 用戶統計
    expensesByUser,

    // 工具
    categoryLabels,
    getExpensesByDate,
    getExpensesByDateRange,
    formatAmount
}
```

- [ ] **Step 5: Run typecheck to verify store compiles**

Run: `powershell.exe -Command "bunx vue-tsc --noEmit 2>&1 | Select-String 'expense'"`
Expected: No new errors related to expense store

- [ ] **Step 6: Commit**

```bash
git add src/features/expense/stores/expense.ts
git commit -m "refactor(expense): ♻️ 移除分頁機制，加入 preloadStatus"
```

---

### Task 2: Update expense store tests

**Files:**
- Modify: `src/features/expense/stores/__tests__/expense.spec.ts`

- [ ] **Step 1: Add preloadStatus tests**

Add at the end of the describe block (before the closing `})`):

```typescript
// ─── preloadStatus ──────────────────────────────────────────────────────

describe('preloadStatus', () => {
    it('defaults to idle', () => {
        const store = useExpenseStore()
        expect(store.preloadStatus).toBe('idle')
    })

    it('fullHistoryLoaded is true when preloadStatus is done', () => {
        const store = useExpenseStore()
        store.preloadStatus = 'done'
        expect(store.fullHistoryLoaded).toBe(true)
    })

    it('fullHistoryLoaded is false when preloadStatus is not done', () => {
        const store = useExpenseStore()
        store.preloadStatus = 'loading'
        expect(store.fullHistoryLoaded).toBe(false)
    })
})
```

- [ ] **Step 2: Run tests**

Run: `powershell.exe -Command "bunx vitest run src/features/expense/stores/__tests__/expense.spec.ts"`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/features/expense/stores/__tests__/expense.spec.ts
git commit -m "test(expense): ✅ 新增 preloadStatus 測試"
```

---

## Chunk 2: Background Preload Composable + App Integration

### Task 3: Create useBackgroundPreload composable

**Files:**
- Create: `src/shared/composables/useBackgroundPreload.ts`

- [ ] **Step 1: Create the composable**

```typescript
import { useExpenseStore } from '@/shared/stores'
import { useGroupStore } from '@/features/group/stores/group'
import { useSettlementStore } from '@/features/settlement/stores/settlement'

function scheduleIdleTask(fn: () => void): void {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(fn)
    } else {
        setTimeout(fn, 50)
    }
}

export function useBackgroundPreload() {
    const expenseStore = useExpenseStore()
    const groupStore = useGroupStore()
    const settlementStore = useSettlementStore()

    const preloadExpenses = async (): Promise<void> => {
        expenseStore.preloadStatus = 'loading'
        try {
            await expenseStore.fetchExpenses()
            expenseStore.preloadStatus = 'done'
        } catch {
            // Retry once
            try {
                await expenseStore.fetchExpenses()
                expenseStore.preloadStatus = 'done'
            } catch {
                expenseStore.preloadStatus = 'error'
            }
        }
    }

    const preloadSettlement = async (): Promise<void> => {
        const groupId = groupStore.activeGroupId
        if (!groupId) return

        await Promise.all([
            settlementStore.fetchNetBalances(groupId),
            settlementStore.fetchSimplifiedDebts(groupId),
            settlementStore.fetchAvailableMonths(groupId),
            settlementStore.fetchMonthlySnapshots(groupId),
            settlementStore.fetchCurrentMonthDebts(groupId)
        ]).catch(err => {
            console.error('背景預載結算資料失敗:', err)
        })
    }

    const startPreload = (): void => {
        scheduleIdleTask(async () => {
            await preloadExpenses()
            await preloadSettlement()
        })
    }

    const refresh = async (): Promise<void> => {
        expenseStore.preloadStatus = 'loading'
        try {
            await expenseStore.fetchExpenses()
            expenseStore.preloadStatus = 'done'

            const groupId = groupStore.activeGroupId
            if (groupId) {
                await preloadSettlement()
            }
        } catch {
            expenseStore.preloadStatus = 'error'
        }
    }

    return {
        startPreload,
        refresh
    }
}
```

- [ ] **Step 2: Verify file was created**

Run: `ls src/shared/composables/useBackgroundPreload.ts`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add src/shared/composables/useBackgroundPreload.ts
git commit -m "feat(preload): 🚀 新增 useBackgroundPreload composable"
```

---

### Task 4: Update App.vue to use background preload

**Files:**
- Modify: `src/app/App.vue`

- [ ] **Step 1: Add import for useBackgroundPreload**

Add import (after the existing imports around line 12):

```typescript
import { useSettlementStore } from '@/features/settlement/stores/settlement'
import { useBackgroundPreload } from '@/shared/composables/useBackgroundPreload'
```

And initialize after existing store declarations (around line 19):

```typescript
const settlementStore = useSettlementStore()
const { startPreload, refresh } = useBackgroundPreload()
```

- [ ] **Step 2: Replace loadAllData function**

Replace the existing `loadAllData` function (lines 109-124) with:

```typescript
const loadAllData = async () => {
    if (!authStore.isLoggedIn) return

    try {
        await Promise.all([
            groupStore.fetchUserProfile(),
            groupStore.fetchUserGroups()
        ])

        // 背景預載 expenses + settlement
        startPreload()
    } catch (error) {
        console.error('載入資料失敗:', error)
    }
}
```

- [ ] **Step 3: Update the auth watcher**

Replace the auth watcher (lines 127-134) with:

```typescript
watch(() => authStore.isLoggedIn, async (isLoggedIn) => {
    if (isLoggedIn && authStore.user) {
        await loadAllData()
    } else {
        expenseStore.expenses = []
        expenseStore.preloadStatus = 'idle'
        settlementStore.clearSettlementData()
    }
}, { immediate: true })
```

- [ ] **Step 4: Replace the group switch watcher**

Replace the group switch watcher (lines 137-142) with:

```typescript
watch(() => groupStore.activeGroupId, () => {
    if (authStore.isLoggedIn) {
        startPreload()
    }
})
```

- [ ] **Step 5: Run typecheck**

Run: `powershell.exe -Command "bunx vue-tsc --noEmit 2>&1 | Select-String 'App.vue'"`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(app): 🚀 整合背景預載取代 fetchRecentExpenses"
```

---

## Chunk 3: Page Simplification

### Task 5: Simplify ExpensesPage — remove infinite scroll

**Files:**
- Modify: `src/pages/expenses/ExpensesPage.vue`

- [ ] **Step 1: Remove infinite scroll imports and state**

In `<script setup>`, remove these imports:
- `useInfiniteExpenses` (line 25)
- `Loader2` from lucide-vue-next (only if not used elsewhere — keep if used in skeleton)

Remove these lines (49-53):
```typescript
// Infinite scroll
const sentinelRef = ref<HTMLElement | null>(null)
const infiniteMode = computed<'personal' | 'group'>(() =>
    activeTab.value === 'group' ? 'group' : 'personal'
)
const { isLoadingMore, hasMore } = useInfiniteExpenses(sentinelRef, infiniteMode)
```

- [ ] **Step 2: Add preloadStatus-based loading state**

Add after the `storeToRefs` block:

```typescript
const isPreloading = computed(() => expenseStore.preloadStatus === 'loading' || expenseStore.preloadStatus === 'idle')
```

- [ ] **Step 3: Update pull-to-refresh**

Replace the `usePullToRefresh` block (lines 255-266) with:

```typescript
usePullToRefresh({
    onRefresh: async () => {
        try {
            expenseStore.preloadStatus = 'loading'
            await expenseStore.fetchExpenses()
            expenseStore.preloadStatus = 'done'
            toast.success(t('common.refreshed'))
        } catch (err) {
            console.error('刷新失敗:', err)
            expenseStore.preloadStatus = 'error'
            toast.error(t('common.refreshFailed'))
        }
    }
})
```

- [ ] **Step 4: Update template — personal tab**

Replace the personal TabsContent (lines 327-364) with:

```html
<TabsContent value="personal" class="mt-4">
    <!-- Skeleton 載入中 -->
    <div v-if="isPreloading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="glass rounded-2xl p-4 space-y-3">
            <div class="h-4 bg-muted rounded w-24 animate-pulse" />
            <div v-for="j in 2" :key="j" class="flex items-center gap-3">
                <div class="h-10 w-10 bg-muted rounded-lg animate-pulse" />
                <div class="flex-1 space-y-1.5">
                    <div class="h-3.5 bg-muted rounded w-32 animate-pulse" />
                    <div class="h-3 bg-muted rounded w-20 animate-pulse" />
                </div>
                <div class="h-4 bg-muted rounded w-16 animate-pulse" />
            </div>
        </div>
    </div>

    <!-- 支出列表 -->
    <div v-else-if="expenseGroups.length > 0" class="space-y-4">
        <ExpenseGroup
            v-for="group in expenseGroups"
            :key="group.date"
            :date="group.date"
            :expenses="group.expenses"
            :show-user="false"
            @expense-click="handleExpenseClick"
        />
    </div>

    <!-- 空狀態 -->
    <div v-else-if="!expenseStore.loading" class="text-center py-12">
        <User class="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p class="text-muted-foreground mb-4">
            {{ searchQuery || filters.categories.length > 0 ? t('search.noResultsFound') : t('expenses.noPersonalExpenses') }}
        </p>
        <Button variant="outline" class="rounded-full gap-2 press-feedback">
            <Plus class="h-4 w-4" />
            {{ t('expense.addExpense') }}
        </Button>
    </div>
</TabsContent>
```

- [ ] **Step 5: Update template — group tab**

Replace the group TabsContent (lines 367-404) with same pattern:

```html
<TabsContent value="group" class="mt-4">
    <!-- Skeleton 載入中 -->
    <div v-if="isPreloading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="glass rounded-2xl p-4 space-y-3">
            <div class="h-4 bg-muted rounded w-24 animate-pulse" />
            <div v-for="j in 2" :key="j" class="flex items-center gap-3">
                <div class="h-10 w-10 bg-muted rounded-lg animate-pulse" />
                <div class="flex-1 space-y-1.5">
                    <div class="h-3.5 bg-muted rounded w-32 animate-pulse" />
                    <div class="h-3 bg-muted rounded w-20 animate-pulse" />
                </div>
                <div class="h-4 bg-muted rounded w-16 animate-pulse" />
            </div>
        </div>
    </div>

    <!-- 支出列表 -->
    <div v-else-if="expenseGroups.length > 0" class="space-y-4">
        <ExpenseGroup
            v-for="group in expenseGroups"
            :key="group.date"
            :date="group.date"
            :expenses="group.expenses"
            :show-user="true"
            @expense-click="handleExpenseClick"
        />
    </div>

    <!-- 空狀態 -->
    <div v-else-if="!expenseStore.loading" class="text-center py-12">
        <Users class="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p class="text-muted-foreground mb-4">
            {{ searchQuery || filters.categories.length > 0 ? t('search.noResultsFound') : t('expenses.noGroupExpenses') }}
        </p>
        <Button variant="outline" class="rounded-full gap-2 press-feedback">
            <Plus class="h-4 w-4" />
            {{ t('expense.addExpense') }}
        </Button>
    </div>
</TabsContent>
```

- [ ] **Step 6: Remove unused imports**

Remove `Loader2` from lucide import if no longer referenced. Remove `useInfiniteExpenses` import.

- [ ] **Step 7: Commit**

```bash
git add src/pages/expenses/ExpensesPage.vue
git commit -m "refactor(expenses): ♻️ 移除無限滾動，改用 preloadStatus + skeleton"
```

---

### Task 6: Simplify DashboardPage

**Files:**
- Modify: `src/pages/dashboard/DashboardPage.vue`

- [ ] **Step 1: Update pull-to-refresh to use full fetchExpenses**

Replace the `usePullToRefresh` block (lines 146-163) with:

```typescript
usePullToRefresh({
    onRefresh: async () => {
        try {
            const refreshTasks: Promise<unknown>[] = [
                (async () => {
                    expenseStore.preloadStatus = 'loading'
                    await expenseStore.fetchExpenses()
                    expenseStore.preloadStatus = 'done'
                })(),
                groupStore.fetchUserProfile()
            ]
            if (activeGroupId.value) {
                refreshTasks.push(
                    settlementStore.fetchSimplifiedDebts(activeGroupId.value)
                )
            }
            await Promise.all(refreshTasks)
            toast.success(t('common.refreshed'))
        } catch (error) {
            console.error('刷新失敗:', error)
            toast.error(t('common.refreshFailed'))
        }
    }
})
```

- [ ] **Step 2: Remove redundant onMounted and watch**

Remove the `loadGroupData` function and the `onMounted` + `watch(activeGroupId)` blocks (lines 134-170). These are now handled by the background preload in App.vue.

```typescript
// DELETE these lines:
// const loadGroupData = async (groupId: string) => { ... }
// watch(activeGroupId, ...)
// onMounted(() => { ... })
```

- [ ] **Step 3: Remove onMounted import if unused**

If `onMounted` is no longer used, remove it from the vue import.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/DashboardPage.vue
git commit -m "refactor(dashboard): ♻️ 移除冗餘載入邏輯，背景預載接管"
```

---

### Task 7: Simplify StatisticsPanel

**Files:**
- Modify: `src/features/statistics/components/StatisticsPanel.vue`

- [ ] **Step 1: Remove onMounted fetch and add skeleton logic**

Replace the `onMounted` block (lines 17-21):

```typescript
// DELETE:
// onMounted(() => {
//     if (!expenseStore.fullHistoryLoaded) {
//         expenseStore.fetchExpenses()
//     }
// })
```

Remove `onMounted` from the vue import (line 2) if no longer used.

- [ ] **Step 2: Add preload status check**

Add after the store declarations:

```typescript
const isPreloading = computed(() =>
    expenseStore.preloadStatus === 'loading' || expenseStore.preloadStatus === 'idle'
)
```

Add `computed` to the vue import if not already there.

- [ ] **Step 3: Add skeleton to template**

Wrap the existing template content in a conditional. At the very top of the `<template>` content (inside the root div), add:

```html
<!-- Skeleton 載入中 -->
<template v-if="isPreloading">
    <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
            <div class="glass rounded-2xl p-4 space-y-2">
                <div class="h-3 bg-muted rounded w-16 animate-pulse" />
                <div class="h-6 bg-muted rounded w-24 animate-pulse" />
            </div>
            <div class="glass rounded-2xl p-4 space-y-2">
                <div class="h-3 bg-muted rounded w-16 animate-pulse" />
                <div class="h-6 bg-muted rounded w-24 animate-pulse" />
            </div>
        </div>
        <div class="glass rounded-2xl p-4 h-48 flex items-center justify-center">
            <div class="h-4 bg-muted rounded w-32 animate-pulse" />
        </div>
    </div>
</template>
```

Then wrap the existing content (from `<!-- Summary Cards -->` onwards) in:
```html
<template v-else>
    <!-- existing content -->
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/features/statistics/components/StatisticsPanel.vue
git commit -m "refactor(statistics): ♻️ 移除 onMounted fetch，加入 skeleton"
```

---

## Chunk 4: Cleanup + Verification

### Task 8: Delete useInfiniteExpenses.ts

**Files:**
- Delete: `src/features/expense/composables/useInfiniteExpenses.ts`

- [ ] **Step 1: Delete the file**

```bash
rm src/features/expense/composables/useInfiniteExpenses.ts
```

- [ ] **Step 2: Search for remaining references**

Run: `grep -r "useInfiniteExpenses" src/`
Expected: No results (all references already removed in Task 5)

- [ ] **Step 3: Commit**

```bash
git add -A src/features/expense/composables/useInfiniteExpenses.ts
git commit -m "chore: 🧹 刪除 useInfiniteExpenses（已被背景預載取代）"
```

---

### Task 9: Build, typecheck, and test verification

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `powershell.exe -Command "bun run typecheck"`
Expected: No new errors (pre-existing shadcn errors OK)

- [ ] **Step 2: Run all tests**

Run: `powershell.exe -Command "bun run test"`
Expected: All tests pass

- [ ] **Step 3: Run dev server and verify manually**

Run: `powershell.exe -Command "bun run dev"`
Verify:
- App starts without errors
- Dashboard loads and shows data
- Switching to expenses page shows data immediately (no lag)
- Switching to overview → statistics shows data immediately
- Switching to overview → debts shows data immediately
- Pull-to-refresh works on all pages

- [ ] **Step 4: Final commit**

If any fixes were needed, commit them:
```bash
git add -A
git commit -m "fix: 🐛 修復背景預載整合問題"
```
