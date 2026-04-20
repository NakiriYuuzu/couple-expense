export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'shares'
export type GroupMemberRole = 'owner' | 'admin' | 'member'
export type CategoryType = 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
export type CurrencyType = 'TWD' | 'USD' | 'EUR' | 'JPY' | 'CNY'

export interface Database {
    group_expense: {
        Tables: {
            groups: {
                Row: {
                    id: string
                    name: string
                    description: string | null
                    invitation_code: string | null
                    max_members: number
                    created_by: string
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    description?: string | null
                    invitation_code?: string | null
                    max_members?: number
                    created_by: string
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    description?: string | null
                    invitation_code?: string | null
                    max_members?: number
                    created_by?: string
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            group_members: {
                Row: {
                    id: string
                    group_id: string
                    user_id: string
                    role: GroupMemberRole
                    is_active: boolean
                    joined_at: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    group_id: string
                    user_id: string
                    role?: GroupMemberRole
                    is_active?: boolean
                    joined_at?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    group_id?: string
                    user_id?: string
                    role?: GroupMemberRole
                    is_active?: boolean
                    joined_at?: string
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'group_members_group_id_fkey'
                        columns: ['group_id']
                        isOneToOne: false
                        referencedRelation: 'groups'
                        referencedColumns: ['id']
                    }
                ]
            }
            group_settings: {
                Row: {
                    id: string
                    group_id: string
                    monthly_budget: number
                    budget_start_day: number
                    category_budgets: Json
                    currency: CurrencyType
                    default_split_method: SplitMethod
                    simplify_debts: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    group_id: string
                    monthly_budget?: number
                    budget_start_day?: number
                    category_budgets?: Json
                    currency?: CurrencyType
                    default_split_method?: SplitMethod
                    simplify_debts?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    group_id?: string
                    monthly_budget?: number
                    budget_start_day?: number
                    category_budgets?: Json
                    currency?: CurrencyType
                    default_split_method?: SplitMethod
                    simplify_debts?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'group_settings_group_id_fkey'
                        columns: ['group_id']
                        isOneToOne: true
                        referencedRelation: 'groups'
                        referencedColumns: ['id']
                    }
                ]
            }
            expenses: {
                Row: {
                    id: string
                    user_id: string
                    group_id: string | null
                    title: string
                    amount: number
                    category: CategoryType
                    icon: string | null
                    date: string
                    currency: CurrencyType
                    split_method: SplitMethod | null
                    paid_by: string | null
                    notes: string | null
                    is_settled: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    group_id?: string | null
                    title: string
                    amount: number
                    category: CategoryType
                    icon?: string | null
                    date?: string
                    currency?: CurrencyType
                    split_method?: SplitMethod | null
                    paid_by?: string | null
                    notes?: string | null
                    is_settled?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    group_id?: string | null
                    title?: string
                    amount?: number
                    category?: CategoryType
                    icon?: string | null
                    date?: string
                    currency?: CurrencyType
                    split_method?: SplitMethod | null
                    paid_by?: string | null
                    notes?: string | null
                    is_settled?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'expenses_group_id_fkey'
                        columns: ['group_id']
                        isOneToOne: false
                        referencedRelation: 'groups'
                        referencedColumns: ['id']
                    }
                ]
            }
            expense_splits: {
                Row: {
                    id: string
                    expense_id: string
                    user_id: string
                    amount: number
                    percentage: number | null
                    shares: number | null
                    is_settled: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    expense_id: string
                    user_id: string
                    amount: number
                    percentage?: number | null
                    shares?: number | null
                    is_settled?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    expense_id?: string
                    user_id?: string
                    amount?: number
                    percentage?: number | null
                    shares?: number | null
                    is_settled?: boolean
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'expense_splits_expense_id_fkey'
                        columns: ['expense_id']
                        isOneToOne: false
                        referencedRelation: 'expenses'
                        referencedColumns: ['id']
                    }
                ]
            }
            settlements: {
                Row: {
                    id: string
                    group_id: string
                    paid_by: string
                    paid_to: string
                    amount: number
                    notes: string | null
                    year_month: string | null
                    settled_at: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    group_id: string
                    paid_by: string
                    paid_to: string
                    amount: number
                    notes?: string | null
                    year_month?: string | null
                    settled_at?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    group_id?: string
                    paid_by?: string
                    paid_to?: string
                    amount?: number
                    notes?: string | null
                    year_month?: string | null
                    settled_at?: string
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'settlements_group_id_fkey'
                        columns: ['group_id']
                        isOneToOne: false
                        referencedRelation: 'groups'
                        referencedColumns: ['id']
                    }
                ]
            }
            monthly_debt_snapshots: {
                Row: {
                    id: string
                    group_id: string
                    year_month: string
                    snapshot_data: Json
                    total_unsettled: number
                    status: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    group_id: string
                    year_month: string
                    snapshot_data?: Json
                    total_unsettled?: number
                    status?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    group_id?: string
                    year_month?: string
                    snapshot_data?: Json
                    total_unsettled?: number
                    status?: string
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'monthly_debt_snapshots_group_id_fkey'
                        columns: ['group_id']
                        isOneToOne: false
                        referencedRelation: 'groups'
                        referencedColumns: ['id']
                    }
                ]
            }
            user_profiles: {
                Row: {
                    id: string
                    email: string | null
                    display_name: string | null
                    avatar_url: string | null
                    personal_monthly_budget: number | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    email?: string | null
                    display_name?: string | null
                    avatar_url?: string | null
                    personal_monthly_budget?: number | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    email?: string | null
                    display_name?: string | null
                    avatar_url?: string | null
                    personal_monthly_budget?: number | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            user_settings: {
                Row: {
                    id: string
                    user_id: string
                    language: 'zh-TW' | 'en'
                    theme: 'light' | 'dark' | 'system'
                    show_in_statistics: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    language?: 'zh-TW' | 'en'
                    theme?: 'light' | 'dark' | 'system'
                    show_in_statistics?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    language?: 'zh-TW' | 'en'
                    theme?: 'light' | 'dark' | 'system'
                    show_in_statistics?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            recurring_expenses: {
                Row: {
                    id: string
                    user_id: string
                    group_id: string | null
                    title: string
                    amount: number
                    category: CategoryType
                    recurrence_day: number
                    next_due_date: string
                    is_active: boolean
                    notes: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    group_id?: string | null
                    title: string
                    amount: number
                    category?: CategoryType
                    recurrence_day: number
                    next_due_date: string
                    is_active?: boolean
                    notes?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    group_id?: string | null
                    title?: string
                    amount?: number
                    category?: CategoryType
                    recurrence_day?: number
                    next_due_date?: string
                    is_active?: boolean
                    notes?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'recurring_expenses_group_id_fkey'
                        columns: ['group_id']
                        isOneToOne: false
                        referencedRelation: 'groups'
                        referencedColumns: ['id']
                    }
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            create_group: {
                Args: {
                    p_name: string
                    p_description?: string
                }
                Returns: string
            }
            join_group: {
                Args: {
                    p_invitation_code: string
                }
                Returns: string
            }
            leave_group: {
                Args: {
                    p_group_id: string
                }
                Returns: boolean
            }
            add_group_expense: {
                Args: {
                    p_group_id: string
                    p_title: string
                    p_amount: number
                    p_category: string
                    p_icon: string
                    p_date: string
                    p_currency?: string
                    p_split_method: string
                    p_paid_by: string
                    p_notes?: string
                    p_splits: Json
                }
                Returns: string
            }
            get_group_balances: {
                Args: {
                    p_group_id: string
                }
                Returns: { user_id: string; net_balance: number }[]
            }
            get_simplified_debts: {
                Args: {
                    p_group_id: string
                }
                Returns: { from_user: string; to_user: string; amount: number }[]
            }
            settle_debt: {
                Args: {
                    p_group_id: string
                    p_paid_to: string
                    p_amount: number
                    p_notes?: string
                }
                Returns: string
            }
            get_expense_months: {
                Args: {
                    p_group_id: string
                }
                Returns: { year_month: string }[]
            }
            get_monthly_snapshots: {
                Args: {
                    p_group_id: string
                }
                Returns: {
                    id: string
                    year_month: string
                    snapshot_data: Json
                    total_unsettled: number
                    status: string
                    created_at: string
                }[]
            }
            get_monthly_balances: {
                Args: {
                    p_group_id: string
                    p_year_month: string
                }
                Returns: { user_id: string; net_balance: number }[]
            }
            get_monthly_simplified_debts: {
                Args: {
                    p_group_id: string
                    p_year_month: string
                }
                Returns: { from_user: string; to_user: string; amount: number }[]
            }
            create_monthly_snapshot: {
                Args: {
                    p_group_id: string
                    p_year_month: string
                }
                Returns: string
            }
            settle_monthly_debt: {
                Args: {
                    p_group_id: string
                    p_paid_to: string
                    p_amount: number
                    p_notes?: string
                    p_year_month?: string
                }
                Returns: string
            }
            update_settlement: {
                Args: {
                    p_settlement_id: string
                    p_amount: number
                    p_notes?: string
                }
                Returns: undefined
            }
            delete_settlement: {
                Args: {
                    p_settlement_id: string
                }
                Returns: undefined
            }
            settle_expense: {
                Args: {
                    p_expense_id: string
                    p_notes?: string
                }
                Returns: number
            }
            process_recurring_expenses: {
                Args: Record<string, never>
                Returns: number
            }
        }
        Enums: {
            expense_category: CategoryType
            split_method: SplitMethod
            group_member_role: GroupMemberRole
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

// Group type aliases
export type GroupRow = Database['group_expense']['Tables']['groups']['Row']
export type GroupInsert = Database['group_expense']['Tables']['groups']['Insert']
export type GroupUpdate = Database['group_expense']['Tables']['groups']['Update']

// GroupMember type aliases
export type GroupMemberRow = Database['group_expense']['Tables']['group_members']['Row']
export type GroupMemberInsert = Database['group_expense']['Tables']['group_members']['Insert']
export type GroupMemberUpdate = Database['group_expense']['Tables']['group_members']['Update']

// GroupSettings type aliases
export type GroupSettingsRow = Database['group_expense']['Tables']['group_settings']['Row']
export type GroupSettingsInsert = Database['group_expense']['Tables']['group_settings']['Insert']
export type GroupSettingsUpdate = Database['group_expense']['Tables']['group_settings']['Update']

// Expense type aliases
export type ExpenseRow = Database['group_expense']['Tables']['expenses']['Row']
export type ExpenseInsert = Database['group_expense']['Tables']['expenses']['Insert']
export type ExpenseUpdate = Database['group_expense']['Tables']['expenses']['Update']

// ExpenseSplit type aliases
export type ExpenseSplitRow = Database['group_expense']['Tables']['expense_splits']['Row']
export type ExpenseSplitInsert = Database['group_expense']['Tables']['expense_splits']['Insert']
export type ExpenseSplitUpdate = Database['group_expense']['Tables']['expense_splits']['Update']

// Settlement type aliases
export type SettlementRow = Database['group_expense']['Tables']['settlements']['Row']
export type SettlementInsert = Database['group_expense']['Tables']['settlements']['Insert']
export type SettlementUpdate = Database['group_expense']['Tables']['settlements']['Update']

// UserProfile type aliases
export type UserProfileRow = Database['group_expense']['Tables']['user_profiles']['Row']
export type UserProfileInsert = Database['group_expense']['Tables']['user_profiles']['Insert']
export type UserProfileUpdate = Database['group_expense']['Tables']['user_profiles']['Update']

// UserSettings type aliases
export type UserSettingsRow = Database['group_expense']['Tables']['user_settings']['Row']
export type UserSettingsInsert = Database['group_expense']['Tables']['user_settings']['Insert']
export type UserSettingsUpdate = Database['group_expense']['Tables']['user_settings']['Update']

// RecurringExpense type aliases
export type RecurringExpenseRow = Database['group_expense']['Tables']['recurring_expenses']['Row']
export type RecurringExpenseInsert = Database['group_expense']['Tables']['recurring_expenses']['Insert']
export type RecurringExpenseUpdate = Database['group_expense']['Tables']['recurring_expenses']['Update']
