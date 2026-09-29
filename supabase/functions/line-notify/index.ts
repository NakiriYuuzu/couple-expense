// 部署：supabase functions deploy line-notify --no-verify-jwt
// 由資料庫（pg_net）呼叫，以 LINE_NOTIFY_SECRET 驗證；同一密鑰存在 Vault 的 line_notify_secret。
import postgres from 'npm:postgres@3.4.9'
import { createNotifyHandler, type NotifyStore } from './handler.ts'

const secret = Deno.env.get('LINE_NOTIFY_SECRET')
const channelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
const webAppUrl = Deno.env.get('WEB_APP_URL')
const databaseUrl = Deno.env.get('SUPABASE_DB_URL')

const missing = !secret || !channelAccessToken || !webAppUrl || !databaseUrl

const sql = missing ? null : postgres(databaseUrl, { prepare: false, max: 1 })

const store: NotifyStore = {
    async claim(limit) {
        const rows = await sql!`SELECT * FROM line_bot.claim_notifications(${limit})`
        return rows.map(row => ({
            id: row.id,
            lineUserId: row.line_user_id,
            recipientActive: row.recipient_active,
            notice: row.title === null ? null : {
                expenseId: row.expense_id,
                groupName: row.group_name,
                creatorName: row.creator_name,
                title: row.title,
                amount: row.amount,
                currency: row.currency,
                category: row.category,
                expenseDate: row.expense_date,
                myShare: row.my_share
            }
        }))
    },
    async finish(id, result, error) {
        await sql!`SELECT line_bot.finish_notification(${id}::uuid, ${result}, ${error})`
    }
}

async function push(to: string, messages: unknown[], retryKey: string) {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${channelAccessToken}`,
            'X-Line-Retry-Key': retryKey
        },
        body: JSON.stringify({ to, messages })
    })
    return { status: response.status, body: await response.text() }
}

const handler = missing
    ? null
    : createNotifyHandler({ secret: secret!, store, push, webAppUrl: webAppUrl!, logError: console.error })

Deno.serve(request => {
    if (!handler) {
        console.error('line-notify: missing LINE_NOTIFY_SECRET, LINE_CHANNEL_ACCESS_TOKEN, WEB_APP_URL or SUPABASE_DB_URL')
        return new Response('Server misconfigured', { status: 500 })
    }
    return handler(request)
})
