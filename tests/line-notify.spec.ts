// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { groupExpenseMessage, type GroupExpenseNotice } from '../supabase/functions/line-webhook/bookkeeping'
import {
    classifyPush,
    createNotifyHandler,
    type NotifyStore,
    type PendingNotification,
    type PushMessage
} from '../supabase/functions/line-notify/handler'

const secret = 'test-only-notify-secret'
const webAppUrl = 'https://example.invalid/couple-expense/'
const notice: GroupExpenseNotice = {
    expenseId: '40000000-0000-0000-0000-000000000001',
    groupName: '我們的家庭',
    creatorName: 'Kuri',
    title: '全聯',
    amount: '300',
    currency: 'TWD',
    category: 'food',
    expenseDate: '2026-09-29',
    myShare: '150'
}

function pending(id: string, overrides: Partial<PendingNotification> = {}): PendingNotification {
    return { id, lineUserId: `U-${id}`, notice, recipientActive: true, ...overrides }
}

let queue: PendingNotification[]
let store: NotifyStore
let push: ReturnType<typeof vi.fn<PushMessage>>
let handler: (request: Request) => Promise<Response>

function request(authorization: string | null = `Bearer ${secret}`, method = 'POST') {
    return new Request('https://example.invalid/line-notify', {
        method,
        headers: authorization ? { Authorization: authorization } : {}
    })
}

beforeEach(() => {
    queue = []
    store = {
        claim: vi.fn(async (limit: number) => queue.splice(0, limit)),
        finish: vi.fn(async () => {})
    }
    push = vi.fn<PushMessage>(async () => ({ status: 200, body: '{}' }))
    handler = createNotifyHandler({ secret, store, push, webAppUrl })
})

describe('line-notify', () => {
    it.each([null, 'Bearer wrong', `Bearer ${secret}x`])('rejects an unauthorized caller (%s) before claiming', async authorization => {
        expect((await handler(request(authorization))).status).toBe(401)
        expect(store.claim).not.toHaveBeenCalled()
    })

    it('pushes the group expense card with the outbox id as retry key', async () => {
        queue = [pending('a')]
        const response = await handler(request())
        expect(await response.json()).toEqual({ sent: 1, skipped: 0, failed: 0, retry: 0 })
        expect(push).toHaveBeenCalledExactlyOnceWith('U-a', [groupExpenseMessage(notice, webAppUrl)], 'a')
        expect(store.finish).toHaveBeenCalledExactlyOnceWith('a', 'sent', null)
    })

    it('skips deleted expenses and recipients who left without pushing', async () => {
        queue = [pending('deleted', { notice: null }), pending('left', { recipientActive: false })]
        expect(await (await handler(request())).json()).toEqual({ sent: 0, skipped: 2, failed: 0, retry: 0 })
        expect(push).not.toHaveBeenCalled()
        expect(store.finish).toHaveBeenCalledWith('deleted', 'skipped', 'expense deleted')
        expect(store.finish).toHaveBeenCalledWith('left', 'skipped', 'recipient left group')
    })

    it('retries on rate limits, server errors and network errors, and fails on other client errors', async () => {
        queue = [pending('limited'), pending('server'), pending('network'), pending('bad')]
        push
            .mockResolvedValueOnce({ status: 429, body: 'slow down' })
            .mockResolvedValueOnce({ status: 500, body: 'oops' })
            .mockRejectedValueOnce(new Error('fetch failed'))
            .mockResolvedValueOnce({ status: 400, body: 'invalid' })
        expect(await (await handler(request())).json()).toEqual({ sent: 0, skipped: 0, failed: 1, retry: 3 })
        expect(store.finish).toHaveBeenCalledWith('limited', 'retry', 'HTTP 429: slow down')
        expect(store.finish).toHaveBeenCalledWith('network', 'retry', 'fetch failed')
        expect(store.finish).toHaveBeenCalledWith('bad', 'failed', 'HTTP 400: invalid')
    })

    it('drains several batches but stops at the limit', async () => {
        queue = Array.from({ length: 150 }, (_, i) => pending(String(i)))
        expect(await (await handler(request())).json()).toEqual({ sent: 100, skipped: 0, failed: 0, retry: 0 })
        expect(queue).toHaveLength(50)
    })

    it('treats an already accepted retry key as sent', () => {
        expect(classifyPush(409)).toBe('sent')
        expect(classifyPush(403)).toBe('failed')
    })
})

describe('group expense message', () => {
    it('shows the share and links to the web expense page in the external browser', () => {
        const message = groupExpenseMessage(notice, 'https://example.invalid/couple-expense')
        const json = JSON.stringify(message)
        expect(message.altText).toBe('Kuri 在「我們的家庭」記了一筆：全聯 300 元')
        expect(json).toContain('150 元')
        expect(json).toContain('餐飲')
        expect(json).toContain('"uri":"https://example.invalid/couple-expense/expenses/40000000-0000-0000-0000-000000000001?openExternalBrowser=1"')
    })

    it('says when the recipient has no share', () => {
        expect(JSON.stringify(groupExpenseMessage({ ...notice, myShare: null, creatorName: null }, webAppUrl)))
            .toContain('不需分攤')
    })
})
