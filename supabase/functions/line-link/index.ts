// 部署：supabase functions deploy line-link --no-verify-jwt
// 登入身分改由函式內向 Supabase Auth 驗證（相容新版 JWT signing keys）。
import postgres from 'npm:postgres@3.4.9'
import { createNonce, hashNonce } from '../_shared/nonce.ts'
import { createLinkHandler, type LinkStore } from './handler.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const databaseUrl = Deno.env.get('SUPABASE_DB_URL')

const missing = !supabaseUrl || !anonKey || !databaseUrl

const sql = missing ? null : postgres(databaseUrl, { prepare: false, max: 1 })

async function getUserId(accessToken: string): Promise<string | null> {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey!, Authorization: `Bearer ${accessToken}` }
    })
    if (!response.ok) return null
    const user = await response.json() as { id?: unknown }
    return typeof user.id === 'string' ? user.id : null
}

const store: LinkStore = {
    async isUserBound(userId) {
        const rows = await sql!`SELECT 1 FROM line_bot.identities WHERE user_id = ${userId}`
        return rows.length > 0
    },
    async saveNonce(userId, nonce) {
        await sql!`
            INSERT INTO line_bot.link_nonces (nonce_hash, user_id, expires_at)
            VALUES (${await hashNonce(nonce)}, ${userId}, now() + interval '10 minutes')
        `
    }
}

const handler = missing ? null : createLinkHandler({ getUserId, store, createNonce })

Deno.serve(request => {
    if (!handler) {
        console.error('line-link: missing SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_DB_URL')
        return new Response('Server misconfigured', { status: 500 })
    }
    return handler(request)
})
