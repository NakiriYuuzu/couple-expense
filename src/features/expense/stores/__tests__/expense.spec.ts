import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useExpenseStore, type Expense } from '../expense'
import { useGroupStore } from '@/features/group/stores/group'

const { single, insertSelect, insert, upsert, from } = vi.hoisted(() => ({
    single: vi.fn(),
    insertSelect: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    from: vi.fn()
}))

// Mock supabase — no real network calls
vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })
        },
        from
    }
}))

vi.mock('pinia-plugin-persistedstate', () => ({
    default: () => ({})
}))

function makeExpense(overrides: Partial<Expense> = {}): Expense {
    return {
        id: crypto.randomUUID(),
        user_id: 'user-1',
        group_id: null,
        title: 'Test expense',
        amount: 100,
        category: 'food',
        icon: null,
        date: '2026-03-09',
        currency: 'TWD',
        split_method: null,
        paid_by: null,
        notes: null,
        is_settled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides
    }
}

describe('useExpenseStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())

        single.mockReset()
        insertSelect.mockReset()
        insert.mockReset()
        upsert.mockReset()
        from.mockReset()

        insertSelect.mockReturnValue({
            single
        })

        insert.mockReturnValue({
            select: insertSelect
        })

        from.mockImplementation((table: string) => {
            if (table === 'expenses') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    in: vi.fn().mockReturnThis(),
                    is: vi.fn().mockReturnThis(),
                    or: vi.fn().mockReturnThis(),
                    order: vi.fn().mockReturnThis(),
                    insert,
                    update: vi.fn().mockReturnThis(),
                    delete: vi.fn().mockReturnThis(),
                    single
                }
            }

            if (table === 'user_profiles') {
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    in: vi.fn().mockReturnThis(),
                    single
                }
            }

            if (table === 'expense_splits') {
                return {
                    upsert
                }
            }

            return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                in: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                insert,
                update: vi.fn().mockReturnThis(),
                delete: vi.fn().mockReturnThis(),
                single
            }
        })
    })

    // ─── personalExpenses ──────────────────────────────────────────────────────

    describe('personalExpenses', () => {
        it('includes only expenses with group_id === null belonging to current user', () => {
            const store = useExpenseStore()
            store.currentUserId = 'user-1'
            store.expenses = [
                makeExpense({ group_id: null, user_id: 'user-1' }),
                makeExpense({ group_id: 'g1', user_id: 'user-1' }),
                makeExpense({ group_id: null, user_id: 'user-2' })
            ]
            expect(store.personalExpenses).toHaveLength(1)
            expect(store.personalExpenses[0]!.group_id).toBeNull()
            expect(store.personalExpenses[0]!.user_id).toBe('user-1')
        })

        it('returns empty array when no personal expenses exist', () => {
            const store = useExpenseStore()
            store.currentUserId = 'user-1'
            store.expenses = [makeExpense({ group_id: 'g1' })]
            expect(store.personalExpenses).toHaveLength(0)
        })

        it('returns empty array when currentUserId is null', () => {
            const store = useExpenseStore()
            store.currentUserId = null
            store.expenses = [makeExpense({ group_id: null, user_id: 'user-1' })]
            expect(store.personalExpenses).toHaveLength(0)
        })
    })

    // ─── groupExpenses ─────────────────────────────────────────────────────────

    describe('groupExpenses', () => {
        it('returns expenses that belong to the active group', () => {
            const pinia = createPinia()
            setActivePinia(pinia)

            const groupStore = useGroupStore()
            groupStore.setActiveGroup('g1')

            const store = useExpenseStore()
            store.expenses = [
                makeExpense({ group_id: 'g1' }),
                makeExpense({ group_id: 'g2' }),
                makeExpense({ group_id: null })
            ]
            expect(store.groupExpenses).toHaveLength(1)
            expect(store.groupExpenses[0]!.group_id).toBe('g1')
        })

        it('returns empty array when no group is active', () => {
            const store = useExpenseStore()
            store.expenses = [makeExpense({ group_id: 'g1' })]
            expect(store.groupExpenses).toHaveLength(0)
        })

        it('returns empty array when active group has no matching expenses', () => {
            const pinia = createPinia()
            setActivePinia(pinia)

            const groupStore = useGroupStore()
            groupStore.setActiveGroup('g-no-expenses')

            const store = useExpenseStore()
            store.expenses = [makeExpense({ group_id: 'g1' })]
            expect(store.groupExpenses).toHaveLength(0)
        })
    })

    // ─── calculateStatsForExpenses ─────────────────────────────────────────────

    describe('calculateStatsForExpenses via stats computed', () => {
        it('sums today expenses correctly', () => {
            const store = useExpenseStore()
            const today = new Date().toISOString().split('T')[0]!
            store.expenses = [
                makeExpense({ amount: 150, date: today }),
                makeExpense({ amount: 50, date: today })
            ]
            expect(store.stats.today).toBe(200)
        })

        it('returns 0 for today when no expenses are today', () => {
            const store = useExpenseStore()
            store.expenses = [makeExpense({ date: '2020-01-01', amount: 100 })]
            expect(store.stats.today).toBe(0)
        })

        it('correctly sums monthly expenses across categories', () => {
            const store = useExpenseStore()
            const now = new Date()
            const thisMonth = now.toISOString().split('T')[0]!

            store.expenses = [
                makeExpense({ category: 'food', amount: 300, date: thisMonth }),
                makeExpense({ category: 'transport', amount: 100, date: thisMonth }),
                makeExpense({ category: 'food', amount: 200, date: '2020-01-01' })  // old – excluded from month
            ]
            expect(store.stats.month).toBe(400)
            expect(store.stats.byCategory.food).toBe(300)
            expect(store.stats.byCategory.transport).toBe(100)
        })

        it('calculates week stats only including expenses from this week', () => {
            const store = useExpenseStore()
            const now = new Date()
            // Use today's date string — always within the current week
            const todayStr = now.toISOString().split('T')[0]!

            store.expenses = [
                makeExpense({ amount: 500, date: todayStr }),
                makeExpense({ amount: 999, date: '2020-01-01' })
            ]
            expect(store.stats.week).toBe(500)
        })

        it('returns zero for all categories when expenses list is empty', () => {
            const store = useExpenseStore()
            store.expenses = []
            expect(store.stats.today).toBe(0)
            expect(store.stats.week).toBe(0)
            expect(store.stats.month).toBe(0)
            expect(store.stats.byCategory.food).toBe(0)
        })
    })

    // ─── expensesByDate ────────────────────────────────────────────────────────

    describe('expensesByDate', () => {
        it('groups expenses correctly by date key', () => {
            const store = useExpenseStore()
            store.expenses = [
                makeExpense({ date: '2026-03-01', amount: 100 }),
                makeExpense({ date: '2026-03-01', amount: 200 }),
                makeExpense({ date: '2026-03-02', amount: 50 })
            ]
            expect(Object.keys(store.expensesByDate)).toHaveLength(2)
            expect(store.expensesByDate['2026-03-01']).toHaveLength(2)
            expect(store.expensesByDate['2026-03-02']).toHaveLength(1)
        })
    })

    // ─── daily totals ──────────────────────────────────────────────────────────

    describe('dailyTotals', () => {
        it('sums amounts per date', () => {
            const store = useExpenseStore()
            store.expenses = [
                makeExpense({ date: '2026-03-01', amount: 100 }),
                makeExpense({ date: '2026-03-01', amount: 200 }),
                makeExpense({ date: '2026-03-02', amount: 50 })
            ]
            expect(store.dailyTotals['2026-03-01']).toBe(300)
            expect(store.dailyTotals['2026-03-02']).toBe(50)
        })
    })

    // ─── getExpensesByDateRange ────────────────────────────────────────────────

    describe('getExpensesByDateRange', () => {
        it('returns only expenses within the given date range', () => {
            const store = useExpenseStore()
            store.expenses = [
                makeExpense({ date: '2026-01-01' }),
                makeExpense({ date: '2026-02-15' }),
                makeExpense({ date: '2026-03-31' })
            ]
            const result = store.getExpensesByDateRange('2026-02-01', '2026-03-01')
            expect(result).toHaveLength(1)
            expect(result[0]!.date).toBe('2026-02-15')
        })

        it('returns empty array when no expenses are in range', () => {
            const store = useExpenseStore()
            store.expenses = [makeExpense({ date: '2026-01-01' })]
            expect(store.getExpensesByDateRange('2026-06-01', '2026-06-30')).toHaveLength(0)
        })
    })

    describe('addExpense', () => {
        it('persists group splits when creating a group expense', async () => {
            const createdExpense = {
                id: 'expense-1',
                user_id: 'user-1',
                group_id: 'group-1',
                title: 'Dinner',
                amount: 300,
                category: 'food',
                icon: 'restaurant',
                date: '2026-03-10',
                currency: 'TWD',
                split_method: 'percentage',
                paid_by: 'user-2',
                notes: null,
                is_settled: false,
                created_at: '2026-03-10T00:00:00Z',
                updated_at: '2026-03-10T00:00:00Z'
            }

            single
                .mockResolvedValueOnce({ data: createdExpense, error: null })
                .mockResolvedValueOnce({
                    data: {
                        id: 'user-1',
                        display_name: 'Alice',
                        avatar_url: null
                    },
                    error: null
                })

            upsert.mockResolvedValue({ error: null })

            const store = useExpenseStore()

            await store.addExpense({
                title: 'Dinner',
                amount: 300,
                category: 'food',
                icon: 'restaurant',
                date: '2026-03-10',
                group_id: 'group-1',
                split_method: 'percentage',
                paid_by: 'user-2',
                splits: [
                    {
                        userId: 'user-1',
                        amount: 120,
                        percentage: 40
                    },
                    {
                        userId: 'user-2',
                        amount: 180,
                        percentage: 60
                    }
                ]
            })

            expect(upsert).toHaveBeenCalledWith([
                {
                    expense_id: 'expense-1',
                    user_id: 'user-1',
                    amount: 120,
                    percentage: 40,
                    shares: null,
                    is_settled: false
                },
                {
                    expense_id: 'expense-1',
                    user_id: 'user-2',
                    amount: 180,
                    percentage: 60,
                    shares: null,
                    is_settled: false
                }
            ], { onConflict: 'expense_id,user_id' })
        })
    })

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
})
