import type { ExpenseScope } from '@/shared/lib/database.types'

// Category ID type (canonical definition)
export type CategoryId = 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'

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
    category: string
    icon: string
    user?: ExpenseUser
}

// Shape emitted by AddExpenseDrawer's expense-added event
export interface AddExpenseEvent {
    id: number
    title: string
    amount: string
    category: string
    icon: string
    date: string
    scope: ExpenseScope
}

export type { ExpenseScope }
