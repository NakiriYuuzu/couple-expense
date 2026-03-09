import type { Database } from '@/shared/lib/database.types'

// Row type aliases
export type ExpenseSplitRow = Database['public']['Tables']['expense_splits']['Row']

// Split method type
export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'shares'

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
