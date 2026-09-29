import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'

export type LineLinkError = 'already_bound' | 'unauthorized' | 'failed'

export type LineLinkResult = { redirectUrl: string } | { error: LineLinkError }

const LINE_ACCOUNT_LINK_URL = 'https://access.line.me/dialog/bot/accountLink?'

// 以目前登入的 Supabase 身分向 line-link 取得 LINE 官方綁定網址。
export async function requestLineLink(linkToken: string): Promise<LineLinkResult> {
    const { data, error } = await supabase.functions.invoke<{ redirectUrl?: string }>('line-link', {
        body: { linkToken }
    })
    if (error) {
        if (error instanceof FunctionsHttpError) {
            const body = await error.context.json().catch(() => null) as { error?: string } | null
            if (body?.error === 'already_bound' || body?.error === 'unauthorized') return { error: body.error }
        }
        return { error: 'failed' }
    }
    // 只允許導向 LINE 官方綁定頁。
    if (!data?.redirectUrl?.startsWith(LINE_ACCOUNT_LINK_URL)) return { error: 'failed' }
    return { redirectUrl: data.redirectUrl }
}
