import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
})

// Auth helper functions
export const auth = {
    signUp: async (email: string, password: string, metadata?: Record<string, any>) => {
        return supabase.auth.signUp({
            email,
            password,
            options: {
                data: metadata
            }
        })
    },

    signIn: async (email: string, password: string) => {
        return supabase.auth.signInWithPassword({
            email,
            password
        })
    },

    signInWithGoogle: async () => {
        const baseUrl = import.meta.env.VITE_APP_ROUTER_BASE || '/'
        const origin = window.location.origin

        // 構建正確的重定向 URL
        let redirectUrl: string
        if (baseUrl === '/') {
            redirectUrl = `${ origin }/`
        } else {
            // 確保 baseUrl 以 / 開頭和結尾
            const normalizedBase = baseUrl.startsWith('/') ? baseUrl : `/${ baseUrl }`
            const finalBase = normalizedBase.endsWith('/') ? normalizedBase : `${ normalizedBase }/`
            redirectUrl = `${ origin }${ finalBase }`
        }

        console.log('OAuth Redirect Debug:', {
            baseUrl,
            origin,
            redirectUrl,
            env: import.meta.env.VITE_APP_ROUTER_BASE
        })

        return supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        })
    },

    signOut: async () => {
        return supabase.auth.signOut()
    },

    getCurrentUser: () => {
        return supabase.auth.getUser()
    },

    getCurrentSession: () => {
        return supabase.auth.getSession()
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
        return supabase.auth.onAuthStateChange(callback)
    }
}
