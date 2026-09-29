// 部署：supabase functions deploy line-webhook --no-verify-jwt
// LINE 不會帶 Supabase JWT；來源改由 handler 驗 x-line-signature。
import postgres from 'npm:postgres@3.4.9'
import { hashNonce } from '../_shared/nonce.ts'
import { createWebhookHandler, type LineApi, type WebhookStore } from './handler.ts'

const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET')
const channelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
const linkPageUrl = Deno.env.get('LINE_LINK_PAGE_URL')
const webAppUrl = Deno.env.get('WEB_APP_URL')
const databaseUrl = Deno.env.get('SUPABASE_DB_URL')

const missing = !channelSecret || !channelAccessToken || !linkPageUrl || !webAppUrl || !databaseUrl

// prepare:false 以相容 Supabase 連線池的 transaction mode。
const sql = missing ? null : postgres(databaseUrl, { prepare: false, max: 1 })

const store: WebhookStore = {
    async claimEvent({ id, type, lineUserId }) {
        const rows = await sql!`
            INSERT INTO line_bot.webhook_events (webhook_event_id, event_type, line_user_id)
            VALUES (${id}, ${type}, ${lineUserId})
            ON CONFLICT (webhook_event_id) DO NOTHING
            RETURNING 1
        `
        return rows.length === 1
    },
    async finishEvent(id, error) {
        await sql!`
            UPDATE line_bot.webhook_events
            SET processed_at = now(), error = ${error}
            WHERE webhook_event_id = ${id}
        `
    },
    async findUserId(lineUserId) {
        const rows = await sql!`
            SELECT user_id FROM line_bot.identities WHERE line_user_id = ${lineUserId}
        `
        return rows[0]?.user_id ?? null
    },
    async setFollowing(lineUserId, following) {
        await sql!`
            UPDATE line_bot.identities
            SET is_following = ${following}, updated_at = now()
            WHERE line_user_id = ${lineUserId}
        `
    },
    async completeLink(lineUserId, nonce) {
        const [row] = await sql!`
            SELECT line_bot.complete_link(${lineUserId}, ${await hashNonce(nonce)}) AS result
        `
        return row.result
    },
    async unlink(lineUserId) {
        const rows = await sql!`
            DELETE FROM line_bot.identities WHERE line_user_id = ${lineUserId} RETURNING 1
        `
        return rows.length === 1
    },
    async listLedgers(lineUserId) {
        const rows = await sql!`SELECT * FROM line_bot.list_ledgers(${lineUserId})`
        return rows.map(row => ({ groupId: row.group_id, name: row.name, isCurrent: row.is_current }))
    },
    async setLedger(lineUserId, groupId) {
        const [row] = await sql!`SELECT line_bot.set_ledger(${lineUserId}, ${groupId}::uuid) AS ok`
        return row.ok
    },
    async createDraft(lineUserId, title, amount) {
        const [row] = await sql!`SELECT line_bot.create_draft(${lineUserId}, ${title}, ${String(amount)}::numeric) AS id`
        return row.id
    },
    async getDraft(lineUserId, draftId) {
        const [row] = await sql!`SELECT * FROM line_bot.get_draft(${lineUserId}, ${draftId}::uuid)`
        if (!row) return null
        return {
            id: row.id,
            title: row.title,
            amount: row.amount,
            category: row.category,
            expenseDate: row.expense_date,
            status: row.status,
            ledgerName: row.ledger_name,
            groupId: row.group_id,
            isExpired: row.is_expired,
            expenseId: row.expense_id,
            members: row.members
        }
    },
    async setDraftCategory(lineUserId, draftId, category) {
        const [row] = await sql!`SELECT line_bot.set_draft_category(${lineUserId}, ${draftId}::uuid, ${category}) AS ok`
        return row.ok
    },
    async setPendingCategory(lineUserId, category) {
        const [row] = await sql!`SELECT line_bot.set_pending_category(${lineUserId}, ${category}) AS ok`
        return row.ok
    },
    async setDraftLedger(lineUserId, draftId, groupId) {
        const [row] = await sql!`SELECT line_bot.set_draft_ledger(${lineUserId}, ${draftId}::uuid, ${groupId}::uuid) AS ok`
        return row.ok
    },
    async setDraftPayer(lineUserId, draftId, userId) {
        const [row] = await sql!`SELECT line_bot.set_draft_payer(${lineUserId}, ${draftId}::uuid, ${userId}::uuid) AS ok`
        return row.ok
    },
    async setDraftParticipants(lineUserId, draftId, mode, userId) {
        const [row] = await sql!`
            SELECT line_bot.set_draft_participants(${lineUserId}, ${draftId}::uuid, ${mode}, ${userId}::uuid) AS ok
        `
        return row.ok
    },
    async setDraftDate(lineUserId, draftId, date) {
        const [row] = await sql!`SELECT line_bot.set_draft_date(${lineUserId}, ${draftId}::uuid, ${date}::date) AS ok`
        return row.ok
    },
    async cancelDraft(lineUserId, draftId) {
        const [row] = await sql!`SELECT line_bot.cancel_draft(${lineUserId}, ${draftId}::uuid) AS ok`
        return row.ok
    },
    async confirmDraft(lineUserId, draftId) {
        const [row] = await sql!`SELECT line_bot.confirm_draft(${lineUserId}, ${draftId}::uuid) AS result`
        return row.result
    },
    async currentLedgerName(lineUserId) {
        const [row] = await sql!`SELECT name FROM line_bot.current_ledger(${lineUserId})`
        return row?.name ?? null
    },
    async recentExpenses(lineUserId, offset, limit) {
        const rows = await sql!`SELECT * FROM line_bot.recent_expenses(${lineUserId}, ${offset}, ${limit})`
        return rows.map(row => ({
            title: row.title,
            amount: row.amount,
            currency: row.currency,
            category: row.category,
            expenseDate: row.expense_date,
            payerName: row.payer_name,
            paidByMe: row.paid_by_me,
            groupName: row.group_name,
            totalAmount: row.total_amount
        }))
    },
    async monthSummary(lineUserId) {
        const rows = await sql!`SELECT * FROM line_bot.month_summary(${lineUserId})`
        return rows.map(row => ({ category: row.category, thisMonth: row.this_month, lastMonth: row.last_month }))
    },
    async ledgerDebts(lineUserId) {
        const rows = await sql!`SELECT * FROM line_bot.ledger_debts(${lineUserId})`
        return rows.map(row => ({
            fromName: row.from_name,
            toName: row.to_name,
            amount: row.amount,
            fromMe: row.from_me,
            toMe: row.to_me
        }))
    }
}

async function callLine(path: string, body?: unknown) {
    const response = await fetch(`https://api.line.me/v2/bot/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${channelAccessToken}`
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`LINE ${path.split('/')[0]} failed: HTTP ${response.status}`)
    return response
}

const line: LineApi = {
    async reply(replyToken, messages) {
        await callLine('message/reply', { replyToken, messages })
    },
    async issueLinkToken(lineUserId) {
        const response = await callLine(`user/${encodeURIComponent(lineUserId)}/linkToken`)
        const { linkToken } = await response.json() as { linkToken: string }
        return linkToken
    }
}

const handler = missing
    ? null
    : createWebhookHandler({
        channelSecret: channelSecret!,
        store,
        line,
        linkPageUrl: linkPageUrl!,
        webAppUrl: webAppUrl!,
        logError: console.error
    })

Deno.serve(request => {
    if (!handler) {
        console.error('line-webhook: missing LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, LINE_LINK_PAGE_URL, WEB_APP_URL or SUPABASE_DB_URL')
        return new Response('Server misconfigured', { status: 500 })
    }
    return handler(request)
})
