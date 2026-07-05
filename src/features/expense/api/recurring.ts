import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { taipeiDateString } from '@/shared/lib/datetime'
import { useSessionStore } from '@/shared/stores/session'
import type {
    RecurringExpense,
    CreateRecurringExpenseData,
    UpdateRecurringExpenseData,
    CategoryId
} from '@/entities/expense/types'

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
    'food', 'pet', 'shopping', 'transport', 'home', 'other'
])

function toValidCategory(value: unknown): CategoryId {
    if (typeof value === 'string' && VALID_CATEGORIES.has(value)) {
        return value as CategoryId
    }
    return 'other'
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

// 依 recurrence_day 推算下次到期日（Taipei 日曆基準，含當日、月底截斷）。
// 對照 Vue recurring.ts:30-51，改以 datetime.taipeiDateString 取「今天」，避免裝置時區飄日。
function computeNextDueDate(day: number): string {
    const [year, month, today] = taipeiDateString().split('-').map(Number)

    const daysInThisMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
    const clampedDay = Math.min(day, daysInThisMonth)
    if (clampedDay >= today!) {
        return `${year}-${pad2(month!)}-${pad2(clampedDay)}`
    }

    const nextMonth = month! === 12 ? 1 : month! + 1
    const nextYear = month! === 12 ? year! + 1 : year!
    const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
    const clampedNextDay = Math.min(day, daysInNextMonth)
    return `${nextYear}-${pad2(nextMonth)}-${pad2(clampedNextDay)}`
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

export async function fetchRecurringExpenses(): Promise<RecurringExpense[]> {
    const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => toRecurringExpense(row as Record<string, unknown>))
}

// 訂閱（週期性費用）清單。key = ['recurring']。
export function useRecurringExpenses() {
    return useQuery({
        queryKey: queryKeys.recurring(),
        queryFn: fetchRecurringExpenses
    })
}

// CRUD 錯誤處理統一為 throw（修 Vue recurring.ts 三種並存模式：fetchAll 設 error state、
// create 回傳 null、update/remove 回傳 boolean）。全部改由 mutation reject 上拋，由呼叫端 UI 處理。
export function useCreateRecurringExpense() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (payload: CreateRecurringExpenseData): Promise<RecurringExpense> => {
            const { data: userData, error: userError } = await supabase.auth.getUser()
            if (userError) throw userError
            const user = userData.user
            if (!user) throw new Error('Not authenticated')

            const insertData = {
                user_id: user.id,
                group_id: payload.group_id ?? useSessionStore.getState().activeGroupId ?? null,
                title: payload.title,
                amount: payload.amount,
                category: payload.category,
                recurrence_day: payload.recurrence_day,
                next_due_date: payload.next_due_date,
                notes: payload.notes ?? null
            }

            const { data, error } = await supabase
                .from('recurring_expenses')
                .insert(insertData)
                .select()
                .single()

            if (error) throw error
            return toRecurringExpense(data as Record<string, unknown>)
        },
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: queryKeys.recurring() })
        }
    })
}

export function useUpdateRecurringExpense() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: {
            id: string
            payload: UpdateRecurringExpenseData
        }): Promise<RecurringExpense> => {
            const { data, error } = await supabase
                .from('recurring_expenses')
                .update({ ...input.payload })
                .eq('id', input.id)
                .select()
                .single()

            if (error) throw error
            return toRecurringExpense(data as Record<string, unknown>)
        },
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: queryKeys.recurring() })
        }
    })
}

export function useDeleteRecurringExpense() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: queryKeys.recurring() })
        }
    })
}

// 啟用/停用。重新啟用（false → true）時把 next_due_date 對齊下一個 recurrence_day，
// 避免後端 producer 回補過期週期（對照 Vue recurring.ts:170-184 toggleActive）。
export function useToggleRecurringExpense() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (item: RecurringExpense): Promise<RecurringExpense> => {
            const nextActive = !item.is_active
            const payload: UpdateRecurringExpenseData = { is_active: nextActive }
            if (nextActive) {
                payload.next_due_date = computeNextDueDate(item.recurrence_day)
            }

            const { data, error } = await supabase
                .from('recurring_expenses')
                .update({ ...payload })
                .eq('id', item.id)
                .select()
                .single()

            if (error) throw error
            return toRecurringExpense(data as Record<string, unknown>)
        },
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: queryKeys.recurring() })
        }
    })
}
