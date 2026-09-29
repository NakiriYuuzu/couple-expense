// 送出 line_bot.notification_outbox 中待送的群組通知。不依賴 Deno 或遠端套件，方便在 Vitest 直接測試。
import { groupExpenseMessage, type GroupExpenseNotice, type LineMessage } from '../line-webhook/bookkeeping.ts'

export interface PendingNotification {
    id: string
    lineUserId: string
    /** 費用已被刪除時為 null */
    notice: GroupExpenseNotice | null
    /** 收件人是否仍是該群組的有效成員 */
    recipientActive: boolean
}

export type FinishResult = 'sent' | 'skipped' | 'failed' | 'retry'

export interface NotifyStore {
    claim(limit: number): Promise<PendingNotification[]>
    finish(id: string, result: FinishResult, error: string | null): Promise<void>
}

/** LINE push；retryKey 讓 LINE 在重送時去重。回傳 HTTP 狀態與內容。 */
export type PushMessage = (to: string, messages: LineMessage[], retryKey: string) => Promise<{ status: number; body: string }>

const BATCH_SIZE = 20
const MAX_BATCHES = 5

export function classifyPush(status: number): FinishResult {
    if (status >= 200 && status < 300) return 'sent'
    // 同一 retry key 已被接受過（先前逾時但其實送出了）
    if (status === 409) return 'sent'
    if (status === 429 || status >= 500) return 'retry'
    return 'failed'
}

export function createNotifyHandler(deps: {
    secret: string
    store: NotifyStore
    push: PushMessage
    webAppUrl: string
    logError?: (message: string) => void
}) {
    const { secret, store, push, webAppUrl, logError = () => {} } = deps

    async function deliver(notification: PendingNotification): Promise<FinishResult> {
        if (!notification.notice || !notification.recipientActive) {
            await store.finish(notification.id, 'skipped', notification.notice ? 'recipient left group' : 'expense deleted')
            return 'skipped'
        }
        let result: FinishResult
        let error: string | null = null
        try {
            const response = await push(
                notification.lineUserId,
                [groupExpenseMessage(notification.notice, webAppUrl)],
                notification.id
            )
            result = classifyPush(response.status)
            if (result !== 'sent') error = `HTTP ${response.status}: ${response.body.slice(0, 200)}`
        } catch (err) {
            result = 'retry'
            error = err instanceof Error ? err.message : 'Unknown error'
        }
        if (error) logError(`notification ${notification.id}: ${error}`)
        await store.finish(notification.id, result, error)
        return result
    }

    return async (request: Request): Promise<Response> => {
        if (request.headers.get('Authorization') !== `Bearer ${secret}`) {
            return new Response('Unauthorized', { status: 401 })
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

        const counts: Record<FinishResult, number> = { sent: 0, skipped: 0, failed: 0, retry: 0 }
        for (let batch = 0; batch < MAX_BATCHES; batch++) {
            const pending = await store.claim(BATCH_SIZE)
            for (const notification of pending) counts[await deliver(notification)]++
            if (pending.length < BATCH_SIZE) break
        }
        return Response.json(counts)
    }
}
