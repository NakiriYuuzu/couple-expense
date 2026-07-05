import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database, 'group_expense'>(supabaseUrl, supabaseAnonKey, {
    db: {
        schema: 'group_expense'
    },
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
})

// 注意：auth 操作的唯一進入點是 @/features/auth/actions.ts——本檔只提供 client。
