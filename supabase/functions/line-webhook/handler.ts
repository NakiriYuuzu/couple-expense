// LINE webhook 核心邏輯：不依賴 Deno 或遠端套件，方便在 Vitest 直接測試。
import {
    addExpenseMessage,
    categories,
    debtsText,
    draftMessage,
    expenseUrl,
    formatAmount,
    ledgerLabel,
    ledgerMessage,
    parseExpense,
    parsePostback,
    recentMessage,
    RECENT_PAGE_SIZE,
    summaryMessage,
    taipeiMonth,
    textCard,
    webPages,
    webUrl,
    type Category,
    type CategoryTotal,
    type Debt,
    type Draft,
    type ExpenseItem,
    type Ledger,
    type LineMessage,
    type SplitMode
} from './bookkeeping.ts'

/** 圖文選單按鈕送出的文字；手動輸入同樣有效。 */
export const menuCommands = {
    add: '記一筆',
    ledger: '帳本',
    recent: '最近紀錄',
    summary: '本月統計',
    debts: '誰欠誰',
    help: '說明'
} as const

export type { LineMessage }

export type LineEvent = {
    type: string
    webhookEventId: string
    replyToken?: string
    source?: { type: string; userId?: string }
    message?: { type: string; text?: string }
    link?: { result: string; nonce?: string }
    postback?: { data: string; params?: { date?: string } }
}

export type ConfirmResult = 'confirmed' | 'already_confirmed' | 'not_found' | 'cancelled' | 'expired' | 'failed'

export type LinkResult = 'linked' | 'invalid_nonce' | 'line_already_bound' | 'user_already_bound'

export interface WebhookStore {
    /** 登記事件；回傳 false 代表同一事件已處理過（LINE 重送）。 */
    claimEvent(event: { id: string; type: string; lineUserId: string | null }): Promise<boolean>
    finishEvent(id: string, error: string | null): Promise<void>
    findUserId(lineUserId: string): Promise<string | null>
    setFollowing(lineUserId: string, following: boolean): Promise<void>
    /** 消耗 nonce 並建立對照；nonce 只能用一次。 */
    completeLink(lineUserId: string, nonce: string): Promise<LinkResult>
    /** 回傳 false 代表原本就沒有綁定。 */
    unlink(lineUserId: string): Promise<boolean>
    // 以下皆以 lineUserId 限定擁有者；入帳在 DB 內以綁定的使用者身分執行。
    listLedgers(lineUserId: string): Promise<Ledger[]>
    /** groupId null = 個人帳；回傳 false 代表不是該群組的有效成員。 */
    setLedger(lineUserId: string, groupId: string | null): Promise<boolean>
    createDraft(lineUserId: string, title: string, amount: number): Promise<string | null>
    getDraft(lineUserId: string, draftId: string): Promise<Draft | null>
    setDraftCategory(lineUserId: string, draftId: string, category: Category): Promise<boolean>
    /** 記一筆卡片上選的分類，套用到 10 分鐘內的下一筆草稿 */
    setPendingCategory(lineUserId: string, category: Category): Promise<boolean>
    setDraftLedger(lineUserId: string, draftId: string, groupId: string | null): Promise<boolean>
    setDraftPayer(lineUserId: string, draftId: string, userId: string): Promise<boolean>
    setDraftParticipants(lineUserId: string, draftId: string, mode: SplitMode, userId: string | null): Promise<boolean>
    /** date 為 YYYY-MM-DD */
    setDraftDate(lineUserId: string, draftId: string, date: string): Promise<boolean>
    cancelDraft(lineUserId: string, draftId: string): Promise<boolean>
    confirmDraft(lineUserId: string, draftId: string): Promise<ConfirmResult>
    /** 目前帳本名稱；null = 個人帳（含已失去成員資格的群組） */
    currentLedgerName(lineUserId: string): Promise<string | null>
    recentExpenses(lineUserId: string, offset: number, limit: number): Promise<ExpenseItem[]>
    monthSummary(lineUserId: string): Promise<CategoryTotal[]>
    ledgerDebts(lineUserId: string): Promise<Debt[]>
}

export interface LineApi {
    reply(replyToken: string, messages: LineMessage[]): Promise<void>
    issueLinkToken(lineUserId: string): Promise<string>
}

export const messages = {
    welcome: '歡迎使用記帳 Bot！請輸入「綁定」連結你的記帳帳號。',
    welcomeBack: '歡迎回來！',
    notBound: '你還沒有綁定記帳帳號，請輸入「綁定」開始。',
    bindPrompt: '請在 10 分鐘內點下方按鈕，登入記帳帳號完成綁定。',
    bindButton: '登入並綁定',
    alreadyBound: '你已經綁定記帳帳號。要改綁其他帳號，請先輸入「解除綁定」。',
    linked: '綁定成功！',
    linkFailed: '綁定失敗或已逾時，請重新輸入「綁定」。',
    lineAlreadyBound: '這個 LINE 已綁定其他記帳帳號，請先輸入「解除綁定」。',
    userAlreadyBound: '這個記帳帳號已綁定其他 LINE，請先在該 LINE 輸入「解除綁定」。',
    unlinked: '已解除綁定。',
    help: [
        '記帳：按「記一筆」選帳本與分類，或直接輸入「品項 金額」，例如「午餐 120」',
        '草稿：可改帳本、分類、日期；群組可選付款人與分攤方式，確認後才入帳',
        '帳本：切換個人或群組帳本',
        '最近紀錄／本月統計／誰欠誰：查詢目前帳本',
        '解除綁定：解除 LINE 與記帳帳號的連結',
        '',
        '也可以直接使用下方的選單。'
    ].join('\n'),
    textOnly: '目前只支援文字訊息。輸入「說明」查看用法。',
    ledgerNotMember: '你已不是這個群組的成員，請輸入「帳本」重新選擇。',
    draftNotEditable: '這筆草稿已入帳、取消或過期，無法修改。',
    draftUpdateFailed: '無法修改：草稿已失效，或對象已不是群組成員。',
    splitFailed: '無法修改分攤：至少要留一位參與者，或草稿已失效。',
    cancelled: '已取消這筆草稿。',
    alreadyConfirmed: '這筆已經入帳了。',
    draftNotFound: '找不到這筆草稿。',
    draftCancelled: '這筆草稿已取消。',
    draftExpired: '草稿已過期，請重新輸入。',
    confirmFailed: '入帳失敗：可能已不是該群組成員，請輸入「帳本」重新選擇後再記一次。'
}

const confirmResultMessages: Record<Exclude<ConfirmResult, 'confirmed'>, string> = {
    already_confirmed: messages.alreadyConfirmed,
    not_found: messages.draftNotFound,
    cancelled: messages.draftCancelled,
    expired: messages.draftExpired,
    failed: messages.confirmFailed
}

const linkResultMessages: Record<LinkResult, string> = {
    linked: messages.linked,
    invalid_nonce: messages.linkFailed,
    line_already_bound: messages.lineAlreadyBound,
    user_already_bound: messages.userAlreadyBound
}

export function bindButtonMessage(linkPageUrl: string, linkToken: string): LineMessage {
    // openExternalBrowser=1：Google 不允許在 LINE 內建瀏覽器登入，改開外部瀏覽器。
    const uri = `${linkPageUrl}?linkToken=${encodeURIComponent(linkToken)}&openExternalBrowser=1`
    return {
        type: 'template',
        altText: messages.bindPrompt,
        template: {
            type: 'buttons',
            text: messages.bindPrompt,
            actions: [{ type: 'uri', label: messages.bindButton, uri }]
        }
    }
}

const encoder = new TextEncoder()

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
    try {
        return Uint8Array.from(atob(value), char => char.charCodeAt(0))
    } catch {
        return null
    }
}

/** 以 channel secret 對「原始」request body 驗 HMAC-SHA256；不可先 parse 再序列化。 */
export async function verifySignature(
    channelSecret: string,
    body: Uint8Array<ArrayBuffer>,
    signature: string | null
): Promise<boolean> {
    if (!signature) return false
    const expected = decodeBase64(signature)
    if (!expected) return false
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(channelSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    )
    return crypto.subtle.verify('HMAC', key, expected, body)
}

function parseEvents(body: Uint8Array<ArrayBuffer>): LineEvent[] | null {
    try {
        const payload = JSON.parse(new TextDecoder().decode(body))
        if (!Array.isArray(payload?.events)) return null
        return payload.events.filter((event: Partial<LineEvent>) =>
            typeof event?.webhookEventId === 'string' && typeof event?.type === 'string'
        )
    } catch {
        return null
    }
}

export function createWebhookHandler(deps: {
    channelSecret: string
    store: WebhookStore
    line: LineApi
    /** 綁定網頁，例如 https://<user>.github.io/couple-expense/line-link */
    linkPageUrl: string
    /** 網頁版根網址，例如 https://<user>.github.io/couple-expense/ */
    webAppUrl: string
    logError?: (message: string) => void
    now?: () => Date
}) {
    const { channelSecret, store, line, linkPageUrl, webAppUrl, logError = () => {}, now = () => new Date() } = deps
    const homeUrl = webUrl(webAppUrl, webPages.home)

    async function reply(event: LineEvent, message: string | LineMessage) {
        if (!event.replyToken) return
        await line.reply(event.replyToken, [typeof message === 'string' ? { type: 'text', text: message } : message])
    }

    /** 已綁定使用者的文字回覆一律附上開啟網頁版的按鈕。 */
    async function replyCard(event: LineEvent, text: string, url = homeUrl, label?: string) {
        await reply(event, textCard(text, url, label))
    }

    async function handleUnboundText(event: LineEvent, lineUserId: string, text: string | null) {
        if (text !== '綁定') {
            await reply(event, messages.notBound)
            return
        }
        const linkToken = await line.issueLinkToken(lineUserId)
        await reply(event, bindButtonMessage(linkPageUrl, linkToken))
    }

    async function replyDraft(event: LineEvent, lineUserId: string, draftId: string | null) {
        const [draft, ledgers] = await Promise.all([
            draftId ? store.getDraft(lineUserId, draftId) : null,
            store.listLedgers(lineUserId)
        ])
        if (!draft) {
            await replyCard(event, messages.draftNotFound)
            return
        }
        await reply(event, draftMessage(draft, ledgers, webAppUrl))
    }

    /** 修改草稿成功就回新的草稿卡片，失敗回說明。 */
    async function updateDraft(event: LineEvent, lineUserId: string, draftId: string, ok: boolean, failure: string) {
        if (!ok) {
            await replyCard(event, failure)
            return
        }
        await replyDraft(event, lineUserId, draftId)
    }

    async function replyRecent(event: LineEvent, lineUserId: string, offset: number) {
        const [ledgerName, items] = await Promise.all([
            store.currentLedgerName(lineUserId),
            store.recentExpenses(lineUserId, offset, RECENT_PAGE_SIZE + 1)
        ])
        await reply(event, recentMessage(ledgerName, items, offset, webAppUrl))
    }

    async function handleBoundText(event: LineEvent, lineUserId: string, text: string | null) {
        if (text === null) {
            await replyCard(event, messages.textOnly)
        } else if (text === '綁定') {
            await replyCard(event, messages.alreadyBound)
        } else if (text === '解除綁定') {
            await store.unlink(lineUserId)
            await reply(event, messages.unlinked)
        } else if (text === menuCommands.ledger) {
            await reply(event, ledgerMessage(await store.listLedgers(lineUserId), webAppUrl))
        } else if (text === menuCommands.add) {
            await reply(event, addExpenseMessage(await store.listLedgers(lineUserId), webAppUrl))
        } else if (text === menuCommands.recent) {
            await replyRecent(event, lineUserId, 0)
        } else if (text === menuCommands.summary) {
            const [ledgerName, totals] = await Promise.all([
                store.currentLedgerName(lineUserId),
                store.monthSummary(lineUserId)
            ])
            await reply(event, summaryMessage(ledgerName, taipeiMonth(now()), totals, webAppUrl))
        } else if (text === menuCommands.debts) {
            const [ledgerName, debts] = await Promise.all([
                store.currentLedgerName(lineUserId),
                store.ledgerDebts(lineUserId)
            ])
            await replyCard(event, debtsText(ledgerName, debts), homeUrl, '在網頁版結清')
        } else if (text === menuCommands.help) {
            await replyCard(event, messages.help)
        } else {
            const expense = parseExpense(text)
            if (!expense) {
                await replyCard(event, messages.help)
                return
            }
            await replyDraft(event, lineUserId, await store.createDraft(lineUserId, expense.title, expense.amount))
        }
    }

    async function handlePostback(event: LineEvent, lineUserId: string) {
        const postback = parsePostback(event.postback?.data ?? '')
        if (!postback) return
        switch (postback.action) {
            case 'recent':
                await replyRecent(event, lineUserId, postback.offset)
                return
            case 'ledger': {
                if (!await store.setLedger(lineUserId, postback.groupId)) {
                    await replyCard(event, messages.ledgerNotMember)
                    return
                }
                const ledgers = await store.listLedgers(lineUserId)
                if (postback.view === 'add') {
                    await reply(event, addExpenseMessage(ledgers, webAppUrl))
                    return
                }
                const name = ledgers.find(ledger => ledger.groupId === postback.groupId)?.name ?? null
                await replyCard(event, `之後會記到「${ledgerLabel(name)}」帳本。`)
                return
            }
            case 'pickcat':
                // 按鈕同時打開鍵盤，使用者接著輸入「品項 金額」。
                await store.setPendingCategory(lineUserId, postback.category)
                await replyCard(
                    event,
                    `分類：${categories[postback.category]}。請輸入「品項 金額」，例如「午餐 120」。`,
                    homeUrl,
                    '在網頁版記帳'
                )
                return
            case 'category':
                await updateDraft(event, lineUserId, postback.draftId,
                    await store.setDraftCategory(lineUserId, postback.draftId, postback.category), messages.draftNotEditable)
                return
            case 'dledger':
                await updateDraft(event, lineUserId, postback.draftId,
                    await store.setDraftLedger(lineUserId, postback.draftId, postback.groupId), messages.draftUpdateFailed)
                return
            case 'payer':
                await updateDraft(event, lineUserId, postback.draftId,
                    await store.setDraftPayer(lineUserId, postback.draftId, postback.userId), messages.draftUpdateFailed)
                return
            case 'split':
                await updateDraft(event, lineUserId, postback.draftId,
                    await store.setDraftParticipants(lineUserId, postback.draftId, postback.mode, postback.userId), messages.splitFailed)
                return
            case 'date': {
                const date = event.postback?.params?.date ?? ''
                const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && await store.setDraftDate(lineUserId, postback.draftId, date)
                await updateDraft(event, lineUserId, postback.draftId, ok, messages.draftUpdateFailed)
                return
            }
            case 'cancel':
                await replyCard(event, await store.cancelDraft(lineUserId, postback.draftId)
                    ? messages.cancelled
                    : messages.draftNotEditable)
                return
            case 'confirm': {
                const result = await store.confirmDraft(lineUserId, postback.draftId)
                if (result !== 'confirmed') {
                    await replyCard(event, confirmResultMessages[result])
                    return
                }
                const draft = await store.getDraft(lineUserId, postback.draftId)
                if (!draft?.expenseId) {
                    await replyCard(event, messages.alreadyConfirmed)
                    return
                }
                await replyCard(
                    event,
                    `已入帳：${draft.title} ${formatAmount(draft.amount)}（${ledgerLabel(draft.ledgerName)}）`,
                    expenseUrl(webAppUrl, draft.expenseId),
                    '在網頁版查看這筆'
                )
                return
            }
        }
    }

    async function handleEvent(event: LineEvent, lineUserId: string) {
        switch (event.type) {
            case 'follow': {
                await store.setFollowing(lineUserId, true)
                const userId = await store.findUserId(lineUserId)
                await reply(event, userId ? messages.welcomeBack : messages.welcome)
                return
            }
            case 'unfollow':
                // 被封鎖後無法回覆，只記錄狀態，之後不再主動推送。
                await store.setFollowing(lineUserId, false)
                return
            case 'message': {
                const userId = await store.findUserId(lineUserId)
                const text = event.message?.type === 'text' ? event.message.text?.trim() ?? '' : null
                if (!userId) {
                    await handleUnboundText(event, lineUserId, text)
                    return
                }
                await handleBoundText(event, lineUserId, text)
                return
            }
            case 'postback': {
                if (!await store.findUserId(lineUserId)) {
                    await reply(event, messages.notBound)
                    return
                }
                await handlePostback(event, lineUserId)
                return
            }
            case 'accountLink': {
                const nonce = event.link?.nonce
                if (event.link?.result !== 'ok' || !nonce) {
                    await reply(event, messages.linkFailed)
                    return
                }
                await reply(event, linkResultMessages[await store.completeLink(lineUserId, nonce)])
                return
            }
            default:
                return
        }
    }

    return async (request: Request): Promise<Response> => {
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

        const body = new Uint8Array(await request.arrayBuffer())
        if (!await verifySignature(channelSecret, body, request.headers.get('x-line-signature'))) {
            return new Response('Unauthorized', { status: 401 })
        }

        const events = parseEvents(body)
        if (!events) return new Response('Bad Request', { status: 400 })

        for (const event of events) {
            // 只服務 1:1 私聊；群組、聊天室事件一律忽略。
            const lineUserId = event.source?.type === 'user' ? event.source.userId ?? null : null
            // 登記失敗（例如 DB 無法連線）直接丟出 → 500，讓 LINE 重送。
            const isNew = await store.claimEvent({ id: event.webhookEventId, type: event.type, lineUserId })
            if (!isNew) continue

            let error: string | null = null
            if (lineUserId) {
                try {
                    await handleEvent(event, lineUserId)
                } catch (err) {
                    error = err instanceof Error ? err.message : 'Unknown error'
                    logError(`LINE event ${event.webhookEventId} failed: ${error}`)
                }
            }
            await store.finishEvent(event.webhookEventId, error)
        }

        return new Response('OK', { status: 200 })
    }
}
