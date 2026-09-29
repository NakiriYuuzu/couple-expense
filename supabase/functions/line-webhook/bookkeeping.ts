// 記帳相關的純函式：解析輸入、postback 格式、Flex 卡片。不依賴 Deno 或 DB。

export type LineMessage = Record<string, unknown>

export const categories = {
    food: '餐飲',
    pet: '寵物',
    shopping: '購物',
    transport: '交通',
    home: '居家',
    other: '其他'
} as const

export type Category = keyof typeof categories

export interface Draft {
    id: string
    title: string
    /** DB numeric 轉成的字串，例如 "120.00" */
    amount: string
    category: string
    expenseDate: string
    status: 'pending' | 'confirmed' | 'cancelled'
    /** null = 個人帳 */
    ledgerName: string | null
    isExpired: boolean
}

export interface Ledger {
    groupId: string
    name: string
    isCurrent: boolean
}

const MAX_TITLE = 50
const MAX_AMOUNT = 9_999_999_999.99
const AMOUNT = String.raw`\$?(\d+(?:\.\d{1,2})?)\s*(?:元|塊)?`
// 金額前不可緊接數字、小數點或負號，避免「120」被拆成「1」+ 20、「-5」被當成 5。
const titleThenAmount = new RegExp(String.raw`^(.+?)\s*(?<![\d.\-])${AMOUNT}$`)
const amountThenTitle = new RegExp(String.raw`^${AMOUNT}\s+(.+)$`)

/** 「午餐 120」「120 午餐」「午餐120元」「７－１１ 1,200」→ { title, amount }；無法解析回傳 null。 */
export function parseExpense(text: string): { title: string; amount: number } | null {
    const normalized = text
        .replace(/[０-９．－]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
        .replace(/[,，]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    const first = normalized.match(titleThenAmount)
    const second = first ? null : normalized.match(amountThenTitle)
    const title = (first?.[1] ?? second?.[2])?.trim()
    const amount = Number(first?.[2] ?? second?.[1])
    if (!title || title.length > MAX_TITLE) return null
    if (!(amount > 0) || amount > MAX_AMOUNT) return null
    return { title, amount }
}

export function formatAmount(amount: string | number): string {
    return `${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} 元`
}

// ── Postback ────────────────────────────────────────────────────────────

export type Postback =
    | { action: 'confirm' | 'cancel'; draftId: string }
    | { action: 'category'; draftId: string; category: Category }
    | { action: 'ledger'; groupId: string | null }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodePostback(postback: Postback): string {
    const params = new URLSearchParams({ action: postback.action })
    if ('draftId' in postback) params.set('draft', postback.draftId)
    if (postback.action === 'category') params.set('category', postback.category)
    if (postback.action === 'ledger') params.set('group', postback.groupId ?? 'personal')
    return params.toString()
}

/** 只接受格式正確的 postback；授權與擁有者檢查仍由 DB 函式負責。 */
export function parsePostback(data: string): Postback | null {
    const params = new URLSearchParams(data)
    const action = params.get('action')
    const draftId = params.get('draft') ?? ''
    if (action === 'confirm' || action === 'cancel') {
        return uuidPattern.test(draftId) ? { action, draftId } : null
    }
    if (action === 'category') {
        const category = params.get('category') ?? ''
        return uuidPattern.test(draftId) && Object.hasOwn(categories, category)
            ? { action, draftId, category: category as Category }
            : null
    }
    if (action === 'ledger') {
        const group = params.get('group') ?? ''
        if (group === 'personal') return { action, groupId: null }
        return uuidPattern.test(group) ? { action, groupId: group } : null
    }
    return null
}

// ── 訊息 ────────────────────────────────────────────────────────────────

function postbackAction(label: string, postback: Postback, displayText = label) {
    return { type: 'postback', label: label.slice(0, 20), data: encodePostback(postback), displayText }
}

function row(label: string, value: string) {
    return {
        type: 'box',
        layout: 'horizontal',
        contents: [
            { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: value, size: 'sm', flex: 5, wrap: true }
        ]
    }
}

export function ledgerLabel(ledgerName: string | null): string {
    return ledgerName ?? '個人'
}

export function draftMessage(draft: Draft): LineMessage {
    const editable = draft.status === 'pending' && !draft.isExpired
    const categoryName = categories[draft.category as Category] ?? draft.category
    const bubble: LineMessage = {
        type: 'bubble',
        body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
                { type: 'text', text: editable ? '記帳草稿' : '記帳草稿（已失效）', size: 'xs', color: '#888888' },
                { type: 'text', text: draft.title, weight: 'bold', size: 'lg', wrap: true },
                { type: 'text', text: formatAmount(draft.amount), weight: 'bold', size: 'xxl' },
                row('帳本', ledgerLabel(draft.ledgerName)),
                row('分類', categoryName),
                row('日期', draft.expenseDate)
            ]
        }
    }
    if (editable) {
        bubble.footer = {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
                { type: 'button', style: 'secondary', action: postbackAction('取消', { action: 'cancel', draftId: draft.id }) },
                { type: 'button', style: 'primary', action: postbackAction('確認入帳', { action: 'confirm', draftId: draft.id }) }
            ]
        }
    }
    const message: LineMessage = {
        type: 'flex',
        altText: `記帳草稿：${draft.title} ${formatAmount(draft.amount)}`,
        contents: bubble
    }
    if (editable) {
        message.quickReply = {
            items: (Object.keys(categories) as Category[]).map(category => ({
                type: 'action',
                action: postbackAction(
                    categories[category],
                    { action: 'category', draftId: draft.id, category },
                    `分類：${categories[category]}`
                )
            }))
        }
    }
    return message
}

/** 帳本選單；quick reply 上限 13 個，保留「個人」後最多列 12 個群組。 */
export function ledgerMessage(ledgers: Ledger[]): LineMessage {
    const current = ledgers.find(ledger => ledger.isCurrent)
    const options = [
        postbackAction('個人', { action: 'ledger', groupId: null }, '帳本：個人'),
        ...ledgers.slice(0, 12).map(ledger =>
            postbackAction(ledger.name, { action: 'ledger', groupId: ledger.groupId }, `帳本：${ledger.name}`))
    ]
    return {
        type: 'text',
        text: `目前帳本：${ledgerLabel(current?.name ?? null)}。請選擇之後要記到哪個帳本：`,
        quickReply: { items: options.map(action => ({ type: 'action', action })) }
    }
}
