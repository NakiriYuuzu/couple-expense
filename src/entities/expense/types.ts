import type { SplitMethod } from '@/shared/lib/database.types'

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
    numericAmount?: number
    category: string
    icon: string
    user?: ExpenseUser
    groupId?: string | null
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
