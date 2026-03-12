import type { SplitMethod } from '@/shared/lib/database.types'

// Category ID type (canonical definition)
export type CategoryId = 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'

// Recurring expense (subscription) entity
export interface RecurringExpense {
    id: string
    user_id: string
    group_id: string | null
    title: string
    amount: number
    category: CategoryId
    recurrence_day: number
    next_due_date: string
    is_active: boolean
    notes: string | null
    created_at: string
    updated_at: string
}

export interface CreateRecurringExpenseData {
    title: string
    amount: number
    category: CategoryId
    recurrence_day: number
    next_due_date: string
    group_id?: string | null
    notes?: string
}

export interface UpdateRecurringExpenseData {
    title?: string
    amount?: number
    category?: CategoryId
    recurrence_day?: number
    next_due_date?: string
    is_active?: boolean
    notes?: string
}

// User info attached to an expense record
export interface ExpenseUser {
    id: string
    display_name: string | null
    avatar_url: string | null
}

// Display format used by ExpenseItem / ExpenseGroup components
export interface DisplayExpense {
    id: string
    title: string
    amount: string
    numericAmount?: number
    category: string
    icon: string
    user?: ExpenseUser
    groupId?: string | null
    groupName?: string | null
    splitMethod?: SplitMethod | null
    isSettled?: boolean
}

// Shape emitted by AddExpenseDrawer's expense-added event
export interface AddExpenseEvent {
    id?: string
    title: string
    amount: string
    category: CategoryId
    icon: string
    date: string
    groupId: string | null
    paidBy?: string
    splitMethod?: SplitMethod
    splits?: Array<{
        userId: string
        amount: number
        percentage?: number
        shares?: number
    }>
}
