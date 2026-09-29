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

export function formatAmount(amount: string | number, currency = 'TWD'): string {
    const number = Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })
    return currency === 'TWD' ? `${number} 元` : `${number} ${currency}`
}

export interface ExpenseItem {
    title: string
    amount: string
    currency: string
    category: string
    expenseDate: string
    /** 付款人顯示名稱；個人帳不顯示 */
    payerName: string | null
    paidByMe: boolean
}

export interface CategoryTotal {
    category: string
    thisMonth: string
    lastMonth: string
}

export interface Debt {
    fromName: string | null
    toName: string | null
    amount: string
    fromMe: boolean
    toMe: boolean
}

export const RECENT_PAGE_SIZE = 10
/** postback 翻頁上限，避免被當成大量查詢的入口 */
const MAX_RECENT_OFFSET = 500

// ── Postback ────────────────────────────────────────────────────────────

export type Postback =
    | { action: 'confirm' | 'cancel'; draftId: string }
    | { action: 'category'; draftId: string; category: Category }
    | { action: 'ledger'; groupId: string | null }
    | { action: 'recent'; offset: number }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodePostback(postback: Postback): string {
    const params = new URLSearchParams({ action: postback.action })
    if ('draftId' in postback) params.set('draft', postback.draftId)
    if (postback.action === 'category') params.set('category', postback.category)
    if (postback.action === 'ledger') params.set('group', postback.groupId ?? 'personal')
    if (postback.action === 'recent') params.set('offset', String(postback.offset))
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
    if (action === 'recent') {
        const raw = params.get('offset') ?? ''
        const offset = Number(raw)
        return /^\d{1,3}$/.test(raw) && offset <= MAX_RECENT_OFFSET ? { action, offset } : null
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

// ── 圖文選單：最近紀錄、本月統計、誰欠誰 ─────────────────────────────────

const categoryColors: Record<Category, string> = {
    food: '#F59E0B',
    pet: '#EC4899',
    shopping: '#8B5CF6',
    transport: '#3B82F6',
    home: '#10B981',
    other: '#6B7280'
}

function categoryName(category: string): string {
    return categories[category as Category] ?? category
}

function header(title: string, ledgerName: string | null) {
    return {
        type: 'box',
        layout: 'vertical',
        contents: [
            { type: 'text', text: title, weight: 'bold', size: 'lg' },
            { type: 'text', text: `帳本：${ledgerLabel(ledgerName)}`, size: 'xs', color: '#888888' }
        ]
    }
}

/** 最近紀錄；items 可多傳一筆，用來判斷是否還有下一頁。 */
export function recentMessage(ledgerName: string | null, items: ExpenseItem[], offset: number): LineMessage {
    if (items.length === 0) {
        return { type: 'text', text: offset === 0 ? `「${ledgerLabel(ledgerName)}」帳本還沒有紀錄。` : '沒有更多紀錄了。' }
    }
    const page = items.slice(0, RECENT_PAGE_SIZE)
    const hasMore = items.length > RECENT_PAGE_SIZE
    const rows = page.flatMap((item, index) => {
        const details = [item.expenseDate.slice(5), categoryName(item.category)]
        if (ledgerName !== null) details.push(item.paidByMe ? '你付' : `${item.payerName ?? '成員'}付`)
        const row = {
            type: 'box',
            layout: 'horizontal',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 3,
                    contents: [
                        { type: 'text', text: item.title, size: 'sm', weight: 'bold', wrap: true },
                        { type: 'text', text: details.join('・'), size: 'xxs', color: '#888888' }
                    ]
                },
                { type: 'text', text: formatAmount(item.amount, item.currency), size: 'sm', align: 'end', gravity: 'center', flex: 2 }
            ]
        }
        return index === 0 ? [row] : [{ type: 'separator' }, row]
    })
    const bubble: LineMessage = {
        type: 'bubble',
        header: header(offset === 0 ? '最近紀錄' : `最近紀錄（第 ${offset + 1} 筆起）`, ledgerName),
        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: rows }
    }
    if (hasMore) {
        bubble.footer = {
            type: 'box',
            layout: 'vertical',
            contents: [{
                type: 'button',
                style: 'secondary',
                action: postbackAction('更多紀錄', { action: 'recent', offset: offset + RECENT_PAGE_SIZE })
            }]
        }
    }
    return { type: 'flex', altText: `最近紀錄（${ledgerLabel(ledgerName)}）`, contents: bubble }
}

function changeText(thisMonth: number, lastMonth: number): string {
    if (lastMonth === 0) return `上月 ${formatAmount(lastMonth)}`
    const percent = Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
    return `上月 ${formatAmount(lastMonth)}（${percent >= 0 ? '+' : ''}${percent}%）`
}

/** 本月統計：總額、與上月比較、各分類長條（以 Flex box 寬度畫，不需產圖）。 */
export function summaryMessage(ledgerName: string | null, month: string, totals: CategoryTotal[]): LineMessage {
    const rows = totals
        .map(total => ({ ...total, value: Number(total.thisMonth) }))
        .filter(total => total.value > 0)
    const thisMonth = rows.reduce((sum, row) => sum + row.value, 0)
    const lastMonth = totals.reduce((sum, row) => sum + Number(row.lastMonth), 0)
    const max = Math.max(...rows.map(row => row.value), 1)

    const bars = rows.map(row => ({
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        contents: [
            {
                type: 'box',
                layout: 'horizontal',
                contents: [
                    { type: 'text', text: categoryName(row.category), size: 'sm' },
                    { type: 'text', text: formatAmount(row.value), size: 'sm', align: 'end' }
                ]
            },
            {
                type: 'box',
                layout: 'vertical',
                height: '8px',
                cornerRadius: '4px',
                backgroundColor: '#EEEEEE',
                contents: [{
                    type: 'box',
                    layout: 'vertical',
                    height: '8px',
                    cornerRadius: '4px',
                    width: `${Math.max(Math.round((row.value / max) * 100), 2)}%`,
                    backgroundColor: categoryColors[row.category as Category] ?? categoryColors.other,
                    contents: []
                }]
            }
        ]
    }))

    return {
        type: 'flex',
        altText: `${month} 支出 ${formatAmount(thisMonth)}（${ledgerLabel(ledgerName)}）`,
        contents: {
            type: 'bubble',
            header: header(`${month} 支出`, ledgerName),
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'lg',
                contents: [
                    { type: 'text', text: formatAmount(thisMonth), weight: 'bold', size: 'xxl' },
                    { type: 'text', text: changeText(thisMonth, lastMonth), size: 'xs', color: '#888888' },
                    { type: 'separator' },
                    ...(bars.length > 0 ? bars : [{ type: 'text', text: '本月還沒有紀錄。', size: 'sm', color: '#888888' }]),
                    { type: 'text', text: '只計入台幣支出。', size: 'xxs', color: '#AAAAAA' }
                ]
            }
        }
    }
}

export function debtsText(ledgerName: string | null, debts: Debt[]): string {
    if (ledgerName === null) return '個人帳沒有分帳欠款。請輸入「帳本」切換到群組後再查詢。'
    if (debts.length === 0) return `「${ledgerName}」目前沒有欠款。`
    const name = (me: boolean, value: string | null) => me ? '你' : value ?? '成員'
    const lines = debts.map(debt =>
        `・${name(debt.fromMe, debt.fromName)} → ${name(debt.toMe, debt.toName)}：${formatAmount(debt.amount)}`)
    return [`「${ledgerName}」目前欠款：`, ...lines, '', '結清請到 App 操作。'].join('\n')
}

/** 台北時間的 YYYY-MM */
export function taipeiMonth(now: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' })
        .formatToParts(now)
    const part = (type: string) => parts.find(p => p.type === type)?.value
    return `${part('year')}-${part('month')}`
}

// ── 群組新增費用通知 ─────────────────────────────────────────────────────

export interface GroupExpenseNotice {
    expenseId: string
    groupName: string
    creatorName: string | null
    title: string
    amount: string
    currency: string
    category: string
    expenseDate: string
    /** 收件人的分攤金額；null = 不需分攤 */
    myShare: string | null
}

/** 網頁版費用明細；openExternalBrowser=1 讓 LINE 用手機瀏覽器開啟（沿用已登入的網頁 session）。 */
export function expenseUrl(webAppUrl: string, expenseId: string): string {
    const base = webAppUrl.endsWith('/') ? webAppUrl : `${webAppUrl}/`
    return `${base}expenses/${encodeURIComponent(expenseId)}?openExternalBrowser=1`
}

export function groupExpenseMessage(notice: GroupExpenseNotice, webAppUrl: string): LineMessage {
    const creator = notice.creatorName ?? '成員'
    const amount = formatAmount(notice.amount, notice.currency)
    return {
        type: 'flex',
        altText: `${creator} 在「${notice.groupName}」記了一筆：${notice.title} ${amount}`,
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: `「${notice.groupName}」新增一筆`, size: 'xs', color: '#888888', wrap: true }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    { type: 'text', text: notice.title, weight: 'bold', size: 'lg', wrap: true },
                    { type: 'text', text: amount, weight: 'bold', size: 'xxl' },
                    row('記帳人', creator),
                    row('你分攤', notice.myShare === null ? '不需分攤' : formatAmount(notice.myShare, notice.currency)),
                    row('分類', categoryName(notice.category)),
                    row('日期', notice.expenseDate)
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    style: 'primary',
                    action: { type: 'uri', label: '在網頁版查看', uri: expenseUrl(webAppUrl, notice.expenseId) }
                }]
            }
        }
    }
}
