import type { Database, SplitMethod } from '@/shared/lib/database.types'

// Re-export SplitMethod from canonical source
export type { SplitMethod }

// Row type aliases
export type ExpenseSplitRow = Database['group_expense']['Tables']['expense_splits']['Row']

// Participant in a split (used in UI for configuring splits)
export interface SplitParticipant {
    userId: string
    displayName: string | null
    avatarUrl: string | null
    amount: number
    percentage?: number
    shares?: number
    isIncluded: boolean
}

// Split configuration for creating a new group expense
export interface SplitConfig {
    method: SplitMethod
    participants: SplitParticipant[]
    totalAmount: number
}

// Split summary for display
export interface SplitSummary {
    expenseId: string
    method: SplitMethod
    paidBy: {
        userId: string
        displayName: string | null
    }
    splits: Array<{
        userId: string
        displayName: string | null
        amount: number
        isSettled: boolean
    }>
}
