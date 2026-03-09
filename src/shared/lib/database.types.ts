export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Expense scope type for personal/family classification
export type ExpenseScope = 'personal' | 'family'

export interface Database {
  public: {
    Tables: {
      expenses: {
        Row: {
          id: string
          user_id: string
          title: string
          amount: number
          category: 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
          icon: string
          date: string
          scope: ExpenseScope
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          amount: number
          category: 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
          icon: string
          date: string
          scope?: ExpenseScope
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          amount?: number
          category?: 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
          icon?: string
          date?: string
          scope?: ExpenseScope
          created_at?: string
          updated_at?: string
        }
      }
      families: {
        Row: {
          id: string
          name: string
          invitation_code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string
          invitation_code?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          invitation_code?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          family_id: string | null
          display_name: string | null
          avatar_url: string | null
          role: 'owner' | 'member'
          personal_monthly_budget: number | null
          joined_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          family_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          role?: 'owner' | 'member'
          personal_monthly_budget?: number | null
          joined_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          role?: 'owner' | 'member'
          personal_monthly_budget?: number | null
          joined_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      family_settings: {
        Row: {
          id: string
          family_id: string
          monthly_budget: number
          budget_start_day: number
          category_budgets: Json
          currency: 'TWD' | 'USD' | 'EUR' | 'JPY' | 'CNY'
          custom_categories: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          monthly_budget?: number
          budget_start_day?: number
          category_budgets?: Json
          currency?: 'TWD' | 'USD' | 'EUR' | 'JPY' | 'CNY'
          custom_categories?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          monthly_budget?: number
          budget_start_day?: number
          category_budgets?: Json
          currency?: 'TWD' | 'USD' | 'EUR' | 'JPY' | 'CNY'
          custom_categories?: Json
          created_at?: string
          updated_at?: string
        }
      }
      budget_alerts: {
        Row: {
          id: string
          family_id: string
          category: string | null
          alert_type: 'warning' | 'exceeded' | 'monthly_summary'
          threshold_percentage: number | null
          current_amount: number
          budget_amount: number
          period_start: string | null
          period_end: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          category?: string | null
          alert_type: 'warning' | 'exceeded' | 'monthly_summary'
          threshold_percentage?: number | null
          current_amount: number
          budget_amount: number
          period_start?: string | null
          period_end?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          category?: string | null
          alert_type?: 'warning' | 'exceeded' | 'monthly_summary'
          threshold_percentage?: number | null
          current_amount?: number
          budget_amount?: number
          period_start?: string | null
          period_end?: string | null
          is_read?: boolean
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_family: {
        Args: {
          family_name?: string
        }
        Returns: string
      }
      join_family: {
        Args: {
          invitation_code: string
        }
        Returns: boolean
      }
    }
    Enums: {
      expense_category: 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
    }
  }
}

// Type alias for convenience
export type ExpenseRow = Database['public']['Tables']['expenses']['Row']
export type ExpenseInsert = Database['public']['Tables']['expenses']['Insert']
export type ExpenseUpdate = Database['public']['Tables']['expenses']['Update']
