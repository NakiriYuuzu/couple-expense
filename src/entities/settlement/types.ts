import type { Database } from '@/shared/lib/database.types'

// Row type alias
export type SettlementRow = Database['public']['Tables']['settlements']['Row']

// Net balance for a user in a group
export interface NetBalance {
    userId: string
    displayName: string | null
    avatarUrl: string | null
    netBalance: number  // positive = owed money, negative = owes money
}

// Simplified debt (minimized transactions)
export interface SimplifiedDebt {
    fromUser: {
        userId: string
        displayName: string | null
        avatarUrl: string | null
    }
    toUser: {
        userId: string
        displayName: string | null
        avatarUrl: string | null
    }
    amount: number
}

// Settlement history item for display
export interface SettlementHistoryItem {
    id: string
    paidBy: {
        userId: string
        displayName: string | null
        avatarUrl: string | null
    }
    paidTo: {
        userId: string
        displayName: string | null
        avatarUrl: string | null
    }
    amount: number
    notes: string | null
    settledAt: string
}
