import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import type { RecurringExpense, CreateRecurringExpenseData, UpdateRecurringExpenseData } from '@/entities/expense/types'
import type { CategoryId } from '@/entities/expense/types'
import { useGroupStore } from '@/features/group/stores/group'

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
    'food', 'pet', 'shopping', 'transport', 'home', 'other'
])

function toValidCategory(value: unknown): CategoryId {
    if (typeof value === 'string' && VALID_CATEGORIES.has(value)) {
        return value as CategoryId
    }
    return 'other'
}

function formatLocalDate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

// Compute the next due date from a recurrence day.
// Mirrors RecurringExpenseDrawer.computeNextDueDate: date-based comparison
// (midnight-normalized, inclusive of today) with month-end clamping, so a
// re-activated subscription gets a fresh next_due_date instead of a stale past one.
function computeNextDueDate(day: number): string {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    const todayMidnight = new Date(year, month, today.getDate())

    const daysInThisMonth = new Date(year, month + 1, 0).getDate()
    const clampedDay = Math.min(day, daysInThisMonth)
    const thisMonthDate = new Date(year, month, clampedDay)

    if (thisMonthDate >= todayMidnight) {
        return formatLocalDate(thisMonthDate)
    }

    const nextMonth = month + 1
    const nextYear = nextMonth > 11 ? year + 1 : year
    const normalizedMonth = nextMonth > 11 ? 0 : nextMonth
    const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate()
    const clampedNextDay = Math.min(day, daysInNextMonth)
    const nextMonthDate = new Date(nextYear, normalizedMonth, clampedNextDay)
    return formatLocalDate(nextMonthDate)
}

function toRecurringExpense(row: Record<string, unknown>): RecurringExpense {
    return {
        id: row.id as string,
        user_id: row.user_id as string,
        group_id: (row.group_id as string | null) ?? null,
        title: row.title as string,
        amount: Number(row.amount),
        category: toValidCategory(row.category),
        recurrence_day: Number(row.recurrence_day),
        next_due_date: row.next_due_date as string,
        is_active: Boolean(row.is_active),
        notes: (row.notes as string | null) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string
    }
}

export const useRecurringExpenseStore = defineStore('recurringExpense', () => {
    const items = ref<RecurringExpense[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    async function fetchAll() {
        loading.value = true
        error.value = null

        try {
            const { data, error: err } = await supabase
                .from('recurring_expenses')
                .select('*')
                .order('created_at', { ascending: false })

            if (err) throw err
            items.value = (data ?? []).map(toRecurringExpense)
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Unknown error'
        } finally {
            loading.value = false
        }
    }

    async function create(payload: CreateRecurringExpenseData): Promise<RecurringExpense | null> {
        error.value = null

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            const groupStore = useGroupStore()

            const insertData = {
                user_id: user.id,
                group_id: payload.group_id ?? groupStore.activeGroupId ?? null,
                title: payload.title,
                amount: payload.amount,
                category: payload.category,
                recurrence_day: payload.recurrence_day,
                next_due_date: payload.next_due_date,
                notes: payload.notes ?? null
            }

            const { data, error: err } = await supabase
                .from('recurring_expenses')
                .insert(insertData)
                .select()
                .single()

            if (err) throw err
            const created = toRecurringExpense(data as Record<string, unknown>)
            items.value.unshift(created)
            return created
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Unknown error'
            return null
        }
    }

    async function update(id: string, payload: UpdateRecurringExpenseData): Promise<boolean> {
        error.value = null

        try {
            const { data, error: err } = await supabase
                .from('recurring_expenses')
                .update({ ...payload })
                .eq('id', id)
                .select()
                .single()

            if (err) throw err
            const updated = toRecurringExpense(data as Record<string, unknown>)
            const idx = items.value.findIndex(i => i.id === id)
            if (idx !== -1) items.value[idx] = updated
            return true
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Unknown error'
            return false
        }
    }

    async function remove(id: string): Promise<boolean> {
        error.value = null

        try {
            const { error: err } = await supabase
                .from('recurring_expenses')
                .delete()
                .eq('id', id)

            if (err) throw err
            items.value = items.value.filter(i => i.id !== id)
            return true
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Unknown error'
            return false
        }
    }

    async function toggleActive(id: string): Promise<boolean> {
        const item = items.value.find(i => i.id === id)
        if (!item) return false

        const nextActive = !item.is_active
        const payload: UpdateRecurringExpenseData = { is_active: nextActive }

        // Re-activating (false → true): realign next_due_date to the upcoming
        // recurrence_day so the backend producer doesn't backfill stale periods.
        if (nextActive) {
            payload.next_due_date = computeNextDueDate(item.recurrence_day)
        }

        return update(id, payload)
    }

    return {
        items,
        loading,
        error,
        fetchAll,
        create,
        update,
        remove,
        toggleActive
    }
})
