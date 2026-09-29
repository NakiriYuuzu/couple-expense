// 綁定網頁呼叫：確認 Supabase 登入身分 → 產生一次性 nonce → 回傳 LINE 官方綁定網址。
// 不依賴 Deno 或遠端套件，方便在 Vitest 直接測試。

export interface LinkStore {
    isUserBound(userId: string): Promise<boolean>
    /** 保存 nonce（實作只存雜湊），10 分鐘內有效。 */
    saveNonce(userId: string, nonce: string): Promise<void>
}

export type LinkErrorCode = 'unauthorized' | 'invalid_link_token' | 'already_bound'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

function error(code: LinkErrorCode, status: number) {
    return json({ error: code }, status)
}

export function createLinkHandler(deps: {
    /** 以 Supabase 驗證 access token；無效回傳 null。 */
    getUserId: (accessToken: string) => Promise<string | null>
    store: LinkStore
    createNonce: () => string
}) {
    const { getUserId, store, createNonce } = deps

    return async (request: Request): Promise<Response> => {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
        if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

        const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
        const userId = token ? await getUserId(token) : null
        if (!userId) return error('unauthorized', 401)

        const body = await request.json().catch(() => null) as { linkToken?: unknown } | null
        const linkToken = body?.linkToken
        if (typeof linkToken !== 'string' || linkToken.length === 0 || linkToken.length > 512) {
            return error('invalid_link_token', 400)
        }

        if (await store.isUserBound(userId)) return error('already_bound', 409)

        const nonce = createNonce()
        await store.saveNonce(userId, nonce)

        const redirectUrl = 'https://access.line.me/dialog/bot/accountLink'
            + `?linkToken=${encodeURIComponent(linkToken)}&nonce=${encodeURIComponent(nonce)}`
        return json({ redirectUrl }, 200)
    }
}
