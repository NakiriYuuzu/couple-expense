import type { Database, SplitMethod } from '@/shared/lib/database.types'

// Re-export SplitMethod from canonical source
export type { SplitMethod }

// Row type aliases
export type GroupRow = Database['public']['Tables']['groups']['Row']
export type GroupMemberRow = Database['public']['Tables']['group_members']['Row']
export type GroupSettingsRow = Database['public']['Tables']['group_settings']['Row']

// Group member role
export type GroupMemberRole = 'owner' | 'admin' | 'member'

// Per-category budget amounts
export interface CategoryBudgets {
    food: number
    transport: number
    shopping: number
    home: number
    pet: number
    other: number
}

// Supported currencies
export type Currency = 'TWD' | 'USD' | 'EUR' | 'JPY' | 'CNY'

// Group settings update payload
export interface GroupSettingsUpdate {
    monthly_budget?: number
    budget_start_day?: number
    category_budgets?: CategoryBudgets
    currency?: Currency
    default_split_method?: SplitMethod
    simplify_debts?: boolean
}

// Group with its members and settings for display
export interface GroupWithDetails {
    group: GroupRow
    members: GroupMemberRow[]
    settings: GroupSettingsRow | null
    memberCount: number
}
