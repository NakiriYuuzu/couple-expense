// @vitest-environment node
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    bindButtonMessage,
    createWebhookHandler,
    messages,
    type LineApi,
    type LineMessage,
    type WebhookStore
} from '../supabase/functions/line-webhook/handler'
import {
    draftMessage,
    encodePostback,
    ledgerMessage,
    type Draft
} from '../supabase/functions/line-webhook/bookkeeping'

const secret = 'test-only-channel-secret'
const linkPageUrl = 'https://example.invalid/couple-expense/line-link'
const boundLineUser = 'U-bound'
const unboundLineUser = 'U-unbound'
const groupId = '20000000-0000-0000-0000-000000000001'
const draft: Draft = {
    id: '30000000-0000-0000-0000-000000000001',
    title: '午餐',
    amount: '120.00',
    category: 'other',
    expenseDate: '2026-09-29',
    status: 'pending',
    ledgerName: null,
    isExpired: false
}

function postbackEvent(id: string, userId: string, data: string) {
    return { type: 'postback', webhookEventId: id, replyToken: `reply-${id}`, source: { type: 'user', userId }, postback: { data } }
}

function sign(body: string, key = secret) {
    return createHmac('sha256', key).update(body).digest('base64')
}

function request(body: string, signature: string | null = sign(body), method = 'POST') {
    return new Request('https://example.invalid/line-webhook', {
        method,
        headers: signature === null ? {} : { 'x-line-signature': signature },
        body: method === 'POST' ? body : undefined
    })
}

function textEvent(id: string, userId: string, text: string) {
    return {
        type: 'message',
        webhookEventId: id,
        replyToken: `reply-${id}`,
        source: { type: 'user', userId },
        message: { type: 'text', text }
    }
}

function accountLinkEvent(id: string, userId: string, link: { result: string; nonce?: string }) {
    return { type: 'accountLink', webhookEventId: id, replyToken: `reply-${id}`, source: { type: 'user', userId }, link }
}

function payload(...events: unknown[]) {
    return JSON.stringify({ destination: 'bot', events })
}

let claimed: Set<string>
let finished: Map<string, string | null>
let following: Map<string, boolean>
let store: WebhookStore
let line: LineApi
/** 每次回覆的第一則訊息：純文字訊息轉成字串，其餘保留原物件。 */
const replyText = vi.fn<(replyToken: string, message: string | LineMessage) => void>()
let handler: (request: Request) => Promise<Response>

beforeEach(() => {
    claimed = new Set()
    finished = new Map()
    following = new Map()
    store = {
        claimEvent: vi.fn(async ({ id }) => {
            if (claimed.has(id)) return false
            claimed.add(id)
            return true
        }),
        finishEvent: vi.fn(async (id, error) => { finished.set(id, error) }),
        findUserId: vi.fn(async lineUserId => lineUserId === boundLineUser ? 'user-uuid' : null),
        setFollowing: vi.fn(async (lineUserId, value) => { following.set(lineUserId, value) }),
        completeLink: vi.fn(async () => 'linked' as const),
        unlink: vi.fn(async () => true),
        listLedgers: vi.fn(async () => [{ groupId: groupId, name: '我們家', isCurrent: false }]),
        setLedger: vi.fn(async () => true),
        createDraft: vi.fn(async () => draft.id),
        getDraft: vi.fn(async (_, id) => id === draft.id ? draft : null),
        setDraftCategory: vi.fn(async () => true),
        cancelDraft: vi.fn(async () => true),
        confirmDraft: vi.fn(async () => 'confirmed' as const)
    }
    replyText.mockReset()
    line = {
        reply: vi.fn(async (replyToken, [message]) => {
            replyText(replyToken, message.type === 'text' && !message.quickReply ? message.text as string : message)
        }),
        issueLinkToken: vi.fn(async () => 'link-token/1')
    }
    handler = createWebhookHandler({ channelSecret: secret, store, line, linkPageUrl })
})

describe('line-webhook signature', () => {
    it.each([
        ['missing', null],
        ['wrong secret', sign(payload(textEvent('e1', unboundLineUser, 'hi')), 'other-secret')],
        ['not base64', '%%%']
    ])('rejects a %s signature before touching the store', async (_, signature) => {
        const response = await handler(request(payload(textEvent('e1', unboundLineUser, 'hi')), signature))
        expect(response.status).toBe(401)
        expect(store.claimEvent).not.toHaveBeenCalled()
        expect(line.reply).not.toHaveBeenCalled()
    })

    it('rejects a body modified after signing', async () => {
        const body = payload(textEvent('e1', unboundLineUser, 'hi'))
        const response = await handler(request(body.replace('hi', 'yo'), sign(body)))
        expect(response.status).toBe(401)
    })

    it('rejects non-POST requests', async () => {
        const response = await handler(request('', null, 'GET'))
        expect(response.status).toBe(405)
    })

    it('accepts the empty verification request from the LINE console', async () => {
        const response = await handler(request(payload()))
        expect(response.status).toBe(200)
        expect(store.claimEvent).not.toHaveBeenCalled()
    })

    it('rejects a signed body without an events array', async () => {
        const response = await handler(request('{"destination":"bot"}'))
        expect(response.status).toBe(400)
    })
})

describe('line-webhook events', () => {
    it('processes a redelivered event only once', async () => {
        const body = payload(textEvent('e1', unboundLineUser, 'hi'))
        expect((await handler(request(body))).status).toBe(200)
        expect((await handler(request(body))).status).toBe(200)
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', messages.notBound)
        expect(finished.get('e1')).toBeNull()
    })

    it('answers unknown text with help and non-text messages with a hint', async () => {
        await handler(request(payload(
            textEvent('e1', boundLineUser, '你好'),
            { ...textEvent('e2', boundLineUser, ''), message: { type: 'sticker' } }
        )))
        expect(replyText).toHaveBeenNthCalledWith(1, 'reply-e1', messages.help)
        expect(replyText).toHaveBeenNthCalledWith(2, 'reply-e2', messages.textOnly)
        expect(store.createDraft).not.toHaveBeenCalled()
    })

    it('tracks follow and unfollow', async () => {
        await handler(request(payload(
            { type: 'follow', webhookEventId: 'e1', replyToken: 'reply-e1', source: { type: 'user', userId: unboundLineUser } },
            { type: 'unfollow', webhookEventId: 'e2', source: { type: 'user', userId: boundLineUser } }
        )))
        expect(following.get(unboundLineUser)).toBe(true)
        expect(following.get(boundLineUser)).toBe(false)
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', messages.welcome)
    })

    it('ignores group and room events but still records them', async () => {
        await handler(request(payload(
            { ...textEvent('e1', boundLineUser, '綁定'), source: { type: 'group', groupId: 'G1', userId: boundLineUser } }
        )))
        expect(store.findUserId).not.toHaveBeenCalled()
        expect(line.issueLinkToken).not.toHaveBeenCalled()
        expect(line.reply).not.toHaveBeenCalled()
        expect(finished.get('e1')).toBeNull()
    })

    it('records a failed reply without failing the webhook', async () => {
        vi.mocked(line.reply).mockRejectedValueOnce(new Error('LINE message failed: HTTP 400'))
        const response = await handler(request(payload(textEvent('e1', unboundLineUser, 'hi'))))
        expect(response.status).toBe(200)
        expect(finished.get('e1')).toBe('LINE message failed: HTTP 400')
    })

    it('throws (runtime answers 500) when the event cannot be recorded so LINE can redeliver', async () => {
        vi.mocked(store.claimEvent).mockRejectedValueOnce(new Error('db down'))
        await expect(handler(request(payload(textEvent('e1', unboundLineUser, 'hi'))))).rejects.toThrow('db down')
        expect(line.reply).not.toHaveBeenCalled()
    })
})

describe('line-webhook binding', () => {
    it('sends unbound users a link button that opens the external browser', async () => {
        await handler(request(payload(textEvent('e1', unboundLineUser, ' 綁定 '))))
        expect(line.issueLinkToken).toHaveBeenCalledExactlyOnceWith(unboundLineUser)
        const message = bindButtonMessage(linkPageUrl, 'link-token/1')
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', message)
        expect(JSON.stringify(message)).toContain(`${linkPageUrl}?linkToken=link-token%2F1&openExternalBrowser=1`)
    })

    it('does not issue a new link token for bound users', async () => {
        await handler(request(payload(textEvent('e1', boundLineUser, '綁定'))))
        expect(line.issueLinkToken).not.toHaveBeenCalled()
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', messages.alreadyBound)
    })

    it('unlinks bound users only', async () => {
        await handler(request(payload(
            textEvent('e1', boundLineUser, '解除綁定'),
            textEvent('e2', unboundLineUser, '解除綁定')
        )))
        expect(store.unlink).toHaveBeenCalledExactlyOnceWith(boundLineUser)
        expect(replyText).toHaveBeenNthCalledWith(1, 'reply-e1', messages.unlinked)
        expect(replyText).toHaveBeenNthCalledWith(2, 'reply-e2', messages.notBound)
    })

    it.each([
        ['linked', messages.linked],
        ['invalid_nonce', messages.linkFailed],
        ['line_already_bound', messages.lineAlreadyBound],
        ['user_already_bound', messages.userAlreadyBound]
    ] as const)('completes an accountLink event: %s', async (result, text) => {
        vi.mocked(store.completeLink).mockResolvedValueOnce(result)
        await handler(request(payload(accountLinkEvent('e1', unboundLineUser, { result: 'ok', nonce: 'n-1' }))))
        expect(store.completeLink).toHaveBeenCalledExactlyOnceWith(unboundLineUser, 'n-1')
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', text)
    })

    it('does not consume a nonce when LINE reports a failed link', async () => {
        await handler(request(payload(accountLinkEvent('e1', unboundLineUser, { result: 'failed', nonce: 'n-1' }))))
        expect(store.completeLink).not.toHaveBeenCalled()
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', messages.linkFailed)
    })
})

describe('line-webhook bookkeeping', () => {
    const confirmData = encodePostback({ action: 'confirm', draftId: draft.id })

    it('turns "午餐 120" into a draft card', async () => {
        await handler(request(payload(textEvent('e1', boundLineUser, '午餐 120'))))
        expect(store.createDraft).toHaveBeenCalledExactlyOnceWith(boundLineUser, '午餐', 120)
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', draftMessage(draft))
    })

    it('shows the ledger menu', async () => {
        await handler(request(payload(textEvent('e1', boundLineUser, '帳本'))))
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', ledgerMessage(await store.listLedgers(boundLineUser)))
    })

    it('switches ledgers and reports membership failures', async () => {
        await handler(request(payload(
            postbackEvent('e1', boundLineUser, encodePostback({ action: 'ledger', groupId })),
            postbackEvent('e2', boundLineUser, encodePostback({ action: 'ledger', groupId: null }))
        )))
        expect(store.setLedger).toHaveBeenNthCalledWith(1, boundLineUser, groupId)
        expect(store.setLedger).toHaveBeenNthCalledWith(2, boundLineUser, null)
        expect(replyText).toHaveBeenNthCalledWith(1, 'reply-e1', '之後會記到「我們家」帳本。')
        expect(replyText).toHaveBeenNthCalledWith(2, 'reply-e2', '之後會記到「個人」帳本。')

        vi.mocked(store.setLedger).mockResolvedValueOnce(false)
        await handler(request(payload(postbackEvent('e3', boundLineUser, encodePostback({ action: 'ledger', groupId })))))
        expect(replyText).toHaveBeenLastCalledWith('reply-e3', messages.ledgerNotMember)
    })

    it('changes the category and replies with the updated card', async () => {
        await handler(request(payload(postbackEvent('e1', boundLineUser,
            encodePostback({ action: 'category', draftId: draft.id, category: 'food' })))))
        expect(store.setDraftCategory).toHaveBeenCalledExactlyOnceWith(boundLineUser, draft.id, 'food')
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', draftMessage(draft))

        vi.mocked(store.setDraftCategory).mockResolvedValueOnce(false)
        await handler(request(payload(postbackEvent('e2', boundLineUser,
            encodePostback({ action: 'category', draftId: draft.id, category: 'pet' })))))
        expect(replyText).toHaveBeenLastCalledWith('reply-e2', messages.draftNotEditable)
    })

    it('confirms a draft', async () => {
        await handler(request(payload(postbackEvent('e1', boundLineUser, confirmData))))
        expect(store.confirmDraft).toHaveBeenCalledExactlyOnceWith(boundLineUser, draft.id)
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', '已入帳：午餐 120 元（個人）')
    })

    it.each([
        ['already_confirmed', messages.alreadyConfirmed],
        ['not_found', messages.draftNotFound],
        ['cancelled', messages.draftCancelled],
        ['expired', messages.draftExpired],
        ['failed', messages.confirmFailed]
    ] as const)('explains a %s confirmation', async (result, text) => {
        vi.mocked(store.confirmDraft).mockResolvedValueOnce(result)
        await handler(request(payload(postbackEvent('e1', boundLineUser, confirmData))))
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', text)
    })

    it('cancels a draft', async () => {
        await handler(request(payload(postbackEvent('e1', boundLineUser, encodePostback({ action: 'cancel', draftId: draft.id })))))
        expect(store.cancelDraft).toHaveBeenCalledExactlyOnceWith(boundLineUser, draft.id)
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', messages.cancelled)
    })

    it('rejects postbacks from unbound users and ignores malformed ones', async () => {
        await handler(request(payload(
            postbackEvent('e1', unboundLineUser, confirmData),
            postbackEvent('e2', boundLineUser, 'action=confirm&draft=not-a-uuid'),
            postbackEvent('e3', boundLineUser, 'action=category&draft=' + draft.id + '&category=bogus')
        )))
        expect(store.confirmDraft).not.toHaveBeenCalled()
        expect(store.setDraftCategory).not.toHaveBeenCalled()
        expect(replyText).toHaveBeenCalledExactlyOnceWith('reply-e1', messages.notBound)
    })
})
