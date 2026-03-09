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
    public: {
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
            }
            settlements: {
                Row: {
                    id: string
                    group_id: string
                    paid_by: string
                    paid_to: string
                    amount: number
                    notes: string | null
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
                    settled_at?: string
                    created_at?: string
                }
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
        }
        Enums: {
            expense_category: CategoryType
            split_method: SplitMethod
            group_member_role: GroupMemberRole
        }
    }
}

// Group type aliases
export type GroupRow = Database['public']['Tables']['groups']['Row']
export type GroupInsert = Database['public']['Tables']['groups']['Insert']
export type GroupUpdate = Database['public']['Tables']['groups']['Update']

// GroupMember type aliases
export type GroupMemberRow = Database['public']['Tables']['group_members']['Row']
export type GroupMemberInsert = Database['public']['Tables']['group_members']['Insert']
export type GroupMemberUpdate = Database['public']['Tables']['group_members']['Update']

// GroupSettings type aliases
export type GroupSettingsRow = Database['public']['Tables']['group_settings']['Row']
export type GroupSettingsInsert = Database['public']['Tables']['group_settings']['Insert']
export type GroupSettingsUpdate = Database['public']['Tables']['group_settings']['Update']

// Expense type aliases
export type ExpenseRow = Database['public']['Tables']['expenses']['Row']
export type ExpenseInsert = Database['public']['Tables']['expenses']['Insert']
export type ExpenseUpdate = Database['public']['Tables']['expenses']['Update']

// ExpenseSplit type aliases
export type ExpenseSplitRow = Database['public']['Tables']['expense_splits']['Row']
export type ExpenseSplitInsert = Database['public']['Tables']['expense_splits']['Insert']
export type ExpenseSplitUpdate = Database['public']['Tables']['expense_splits']['Update']

// Settlement type aliases
export type SettlementRow = Database['public']['Tables']['settlements']['Row']
export type SettlementInsert = Database['public']['Tables']['settlements']['Insert']
export type SettlementUpdate = Database['public']['Tables']['settlements']['Update']

// UserProfile type aliases
export type UserProfileRow = Database['public']['Tables']['user_profiles']['Row']
export type UserProfileInsert = Database['public']['Tables']['user_profiles']['Insert']
export type UserProfileUpdate = Database['public']['Tables']['user_profiles']['Update']

// UserSettings type aliases
export type UserSettingsRow = Database['public']['Tables']['user_settings']['Row']
export type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert']
export type UserSettingsUpdate = Database['public']['Tables']['user_settings']['Update']
