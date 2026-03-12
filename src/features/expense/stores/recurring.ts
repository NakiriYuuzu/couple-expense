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
                .update({ ...payload, updated_at: new Date().toISOString() })
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
        return update(id, { is_active: !item.is_active })
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
