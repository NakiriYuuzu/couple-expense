import type { Database } from '@/shared/lib/database.types'

export type UserProfileRow = Database['public']['Tables']['user_profiles']['Row']

// User profile update payload
export interface UserProfileUpdate {
    display_name?: string
    avatar_url?: string
}

// Locale options
export type SupportedLocale = 'zh-TW' | 'en'
