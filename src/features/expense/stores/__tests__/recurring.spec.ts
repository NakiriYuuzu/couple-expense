import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRecurringExpenseStore } from '../recurring'
import type { RecurringExpense } from '@/entities/expense/types'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { from, single, authGetUser } = vi.hoisted(() => ({
    from: vi.fn(),
    single: vi.fn(),
    authGetUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })
}))

vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: { getUser: authGetUser },
        from
    }
}))

vi.mock('pinia-plugin-persistedstate', () => ({
    default: () => ({})
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<RecurringExpense> = {}): RecurringExpense {
    return {
        id: crypto.randomUUID(),
        user_id: 'user-1',
        group_id: null,
        title: 'Netflix',
        amount: 299,
        category: 'other',
        recurrence_day: 15,
        next_due_date: '2026-04-15',
        is_active: true,
        notes: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        ...overrides
    }
}

// Build a mock Supabase query chain for recurring_expenses table.
// `terminalResult` is the value returned by the terminal call (order / single / delete).
function makeChain(terminalResult: unknown) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    const self = () => chain

    chain['select'] = vi.fn(self)
    chain['insert'] = vi.fn(self)
    chain['update'] = vi.fn(self)
    chain['delete'] = vi.fn(self)
    chain['eq'] = vi.fn(self)
    chain['order'] = vi.fn().mockResolvedValue(terminalResult)
    chain['single'] = vi.fn().mockResolvedValue(terminalResult)

    // Make select() return a new chain that still has order/single pointing to terminal
    chain['select'] = vi.fn(() => chain)
    chain['insert'] = vi.fn(() => chain)
    chain['update'] = vi.fn(() => chain)
    chain['delete'] = vi.fn(() => ({
        eq: vi.fn().mockResolvedValue(terminalResult)
    }))
    chain['eq'] = vi.fn(() => ({
        select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(terminalResult)
        })),
        // for delete().eq()
        ...terminalResult as object
    }))

    return chain
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useRecurringExpenseStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        from.mockReset()
        single.mockReset()
        authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    })

    // ─── initial state ────────────────────────────────────────────────────────

    describe('initial state', () => {
        it('starts with empty items', () => {
            const store = useRecurringExpenseStore()
            expect(store.items).toHaveLength(0)
        })

        it('starts with loading false', () => {
            const store = useRecurringExpenseStore()
            expect(store.loading).toBe(false)
        })

        it('starts with no error', () => {
            const store = useRecurringExpenseStore()
            expect(store.error).toBeNull()
        })
    })

    // ─── fetchAll ─────────────────────────────────────────────────────────────

    describe('fetchAll', () => {
        it('populates items from server data', async () => {
            const rows = [makeRow({ id: 'r1' }), makeRow({ id: 'r2' })]
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: rows, error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(store.items).toHaveLength(2)
            expect(store.items[0]!.id).toBe('r1')
            expect(store.items[1]!.id).toBe('r2')
        })

        it('sets items to empty array when server returns null data', async () => {
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: null, error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(store.items).toHaveLength(0)
        })

        it('sets error when server returns an error', async () => {
            // The store catches Supabase error objects (non-Error instances) and
            // falls back to 'Unknown error' since they are not instanceof Error.
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(store.error).not.toBeNull()
            expect(store.items).toHaveLength(0)
        })

        it('sets loading to false after successful fetch', async () => {
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [], error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(store.loading).toBe(false)
        })

        it('sets loading to false even when fetch fails', async () => {
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(store.loading).toBe(false)
        })

        it('normalises unknown category to "other"', async () => {
            const row = { ...makeRow(), category: 'unknown_cat' }
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [row], error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(store.items[0]!.category).toBe('other')
        })
    })

    // ─── create ───────────────────────────────────────────────────────────────

    describe('create', () => {
        it('prepends created item to items list', async () => {
            const newRow = makeRow({ id: 'new-1', title: 'Spotify' })
            from.mockReturnValue({
                insert: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: newRow, error: null })
            })

            const store = useRecurringExpenseStore()
            store.items = [makeRow({ id: 'existing-1' })]

            const result = await store.create({
                title: 'Spotify',
                amount: 149,
                category: 'other',
                recurrence_day: 1,
                next_due_date: '2026-04-01'
            })

            expect(result).not.toBeNull()
            expect(result!.id).toBe('new-1')
            expect(store.items[0]!.id).toBe('new-1')
            expect(store.items).toHaveLength(2)
        })

        it('returns null and sets error when insert fails', async () => {
            from.mockReturnValue({
                insert: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } })
            })

            const store = useRecurringExpenseStore()
            const result = await store.create({
                title: 'Fail',
                amount: 100,
                category: 'food',
                recurrence_day: 5,
                next_due_date: '2026-04-05'
            })

            expect(result).toBeNull()
            expect(store.error).not.toBeNull()
        })

        it('returns null when user is not authenticated', async () => {
            authGetUser.mockResolvedValueOnce({ data: { user: null } })

            from.mockReturnValue({
                insert: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: null, error: null })
            })

            const store = useRecurringExpenseStore()
            const result = await store.create({
                title: 'Auth fail',
                amount: 100,
                category: 'food',
                recurrence_day: 1,
                next_due_date: '2026-04-01'
            })

            expect(result).toBeNull()
            expect(store.error).toBe('Not authenticated')
        })

        it('does not mutate items list when insert fails', async () => {
            from.mockReturnValue({
                insert: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } })
            })

            const store = useRecurringExpenseStore()
            store.items = [makeRow({ id: 'pre-existing' })]

            await store.create({
                title: 'Bad',
                amount: 50,
                category: 'other',
                recurrence_day: 10,
                next_due_date: '2026-04-10'
            })

            expect(store.items).toHaveLength(1)
            expect(store.items[0]!.id).toBe('pre-existing')
        })
    })

    // ─── update ───────────────────────────────────────────────────────────────

    describe('update', () => {
        it('updates the item in-place in the items list', async () => {
            const original = makeRow({ id: 'r1', title: 'Old Title', amount: 100 })
            const updated = { ...original, title: 'New Title', amount: 200 }

            from.mockReturnValue({
                update: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: updated, error: null })
            })

            const store = useRecurringExpenseStore()
            store.items = [original]

            const success = await store.update('r1', { title: 'New Title', amount: 200 })

            expect(success).toBe(true)
            expect(store.items[0]!.title).toBe('New Title')
            expect(store.items[0]!.amount).toBe(200)
        })

        it('returns false and sets error when update fails', async () => {
            from.mockReturnValue({
                update: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'update error' } })
            })

            const store = useRecurringExpenseStore()
            store.items = [makeRow({ id: 'r1' })]

            const success = await store.update('r1', { title: 'Fail' })

            expect(success).toBe(false)
            expect(store.error).not.toBeNull()
        })

        it('does not change items when id not found locally', async () => {
            const row = makeRow({ id: 'r1', title: 'Unchanged' })
            const serverRow = { ...row, id: 'r-unknown', title: 'Server' }

            from.mockReturnValue({
                update: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: serverRow, error: null })
            })

            const store = useRecurringExpenseStore()
            store.items = [row]

            await store.update('r-unknown', { title: 'Server' })

            // local item r1 remains unchanged
            expect(store.items[0]!.title).toBe('Unchanged')
        })
    })

    // ─── remove ───────────────────────────────────────────────────────────────

    describe('remove', () => {
        it('removes the item from the items list', async () => {
            from.mockReturnValue({
                delete: vi.fn().mockReturnThis(),
                eq: vi.fn().mockResolvedValue({ error: null })
            })

            const store = useRecurringExpenseStore()
            store.items = [makeRow({ id: 'r1' }), makeRow({ id: 'r2' })]

            const success = await store.remove('r1')

            expect(success).toBe(true)
            expect(store.items).toHaveLength(1)
            expect(store.items[0]!.id).toBe('r2')
        })

        it('returns false and sets error when delete fails', async () => {
            from.mockReturnValue({
                delete: vi.fn().mockReturnThis(),
                eq: vi.fn().mockResolvedValue({ error: { message: 'delete error' } })
            })

            const store = useRecurringExpenseStore()
            store.items = [makeRow({ id: 'r1' })]

            const success = await store.remove('r1')

            expect(success).toBe(false)
            expect(store.error).not.toBeNull()
            // item should remain untouched on failure
            expect(store.items).toHaveLength(1)
        })

        it('returns true and leaves other items intact', async () => {
            from.mockReturnValue({
                delete: vi.fn().mockReturnThis(),
                eq: vi.fn().mockResolvedValue({ error: null })
            })

            const store = useRecurringExpenseStore()
            const keep = makeRow({ id: 'keep' })
            store.items = [makeRow({ id: 'del' }), keep]

            await store.remove('del')

            expect(store.items).toHaveLength(1)
            expect(store.items[0]!.id).toBe('keep')
        })
    })

    // ─── toggleActive ─────────────────────────────────────────────────────────

    describe('toggleActive', () => {
        it('flips is_active from true to false', async () => {
            const item = makeRow({ id: 'r1', is_active: true })
            const toggled = { ...item, is_active: false }

            from.mockReturnValue({
                update: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: toggled, error: null })
            })

            const store = useRecurringExpenseStore()
            store.items = [item]

            const success = await store.toggleActive('r1')

            expect(success).toBe(true)
            expect(store.items[0]!.is_active).toBe(false)
        })

        it('flips is_active from false to true', async () => {
            const item = makeRow({ id: 'r1', is_active: false })
            const toggled = { ...item, is_active: true }

            from.mockReturnValue({
                update: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: toggled, error: null })
            })

            const store = useRecurringExpenseStore()
            store.items = [item]

            const success = await store.toggleActive('r1')

            expect(success).toBe(true)
            expect(store.items[0]!.is_active).toBe(true)
        })

        it('returns false when item id is not in the list', async () => {
            const store = useRecurringExpenseStore()
            store.items = [makeRow({ id: 'r1' })]

            const success = await store.toggleActive('non-existent')

            expect(success).toBe(false)
        })
    })

    // ─── next_due_date logic ──────────────────────────────────────────────────

    describe('next_due_date values', () => {
        it('stores next_due_date string as-is after fetch', async () => {
            const row = makeRow({ next_due_date: '2026-05-20' })
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [row], error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(store.items[0]!.next_due_date).toBe('2026-05-20')
        })

        it('is_active false means the subscription is paused', async () => {
            const row = makeRow({ is_active: false, next_due_date: '2026-04-01' })
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [row], error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(store.items[0]!.is_active).toBe(false)
        })

        it('recurrence_day is stored as a number', async () => {
            const row = makeRow({ recurrence_day: 28 })
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [row], error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            expect(typeof store.items[0]!.recurrence_day).toBe('number')
            expect(store.items[0]!.recurrence_day).toBe(28)
        })

        it('items with past next_due_date can be detected as overdue', async () => {
            const pastDate = '2026-01-01'
            const row = makeRow({ is_active: true, next_due_date: pastDate })
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [row], error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            const today = new Date().toISOString().split('T')[0]!
            const isOverdue = store.items[0]!.is_active &&
                store.items[0]!.next_due_date < today
            expect(isOverdue).toBe(true)
        })

        it('items with future next_due_date are not overdue', async () => {
            const futureDate = '2099-12-31'
            const row = makeRow({ is_active: true, next_due_date: futureDate })
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [row], error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            const today = new Date().toISOString().split('T')[0]!
            const isOverdue = store.items[0]!.is_active &&
                store.items[0]!.next_due_date < today
            expect(isOverdue).toBe(false)
        })

        it('inactive items are not considered overdue regardless of due date', async () => {
            const pastDate = '2026-01-01'
            const row = makeRow({ is_active: false, next_due_date: pastDate })
            from.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [row], error: null })
            })

            const store = useRecurringExpenseStore()
            await store.fetchAll()

            const today = new Date().toISOString().split('T')[0]!
            const isOverdue = store.items[0]!.is_active &&
                store.items[0]!.next_due_date < today
            expect(isOverdue).toBe(false)
        })
    })
})
