import type { Database, Json } from '@/shared/lib/database.types'

// Row type aliases for convenience
export type FamilyRow = Database['public']['Tables']['families']['Row']
export type FamilySettingsRow = Database['public']['Tables']['family_settings']['Row']
export type UserProfileRow = Database['public']['Tables']['user_profiles']['Row']

// Per-category budget amounts
export interface CategoryBudgets {
    food: number
    transport: number
    shopping: number
    home: number
    pet: number
    other: number
}

// Supported currencies (matches DB constraint)
export type Currency = 'TWD' | 'USD' | 'EUR' | 'JPY' | 'CNY'

// Family settings update payload
export interface FamilySettingsUpdate {
    monthly_budget?: number
    budget_start_day?: number
    category_budgets?: CategoryBudgets
    currency?: Currency
    custom_categories?: Json[]
}
