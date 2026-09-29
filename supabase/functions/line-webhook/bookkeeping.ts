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

export interface DraftMember {
    userId: string
    name: string
    isMe: boolean
    isPayer: boolean
    isParticipant: boolean
}

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
    groupId: string | null
    isExpired: boolean
    /** 已入帳的費用 ID */
    expenseId: string | null
    /** 群組草稿的有效成員（含付款人／參與者狀態）；個人草稿為空 */
    members: DraftMember[]
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
    /** 個人帳本中的群組費用：群組名稱（amount 為自己的分攤） */
    groupName: string | null
    totalAmount: string
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

export type SplitMode = 'all' | 'only' | 'toggle'

export type Postback =
    | { action: 'confirm' | 'cancel' | 'date'; draftId: string }
    | { action: 'category'; draftId: string; category: Category }
    /** view: 'add' 表示從記一筆卡片切換，切換後回到該卡片 */
    | { action: 'ledger'; groupId: string | null; view?: 'add' }
    | { action: 'recent'; offset: number }
    | { action: 'pickcat'; category: Category }
    | { action: 'dledger'; draftId: string; groupId: string | null }
    | { action: 'payer'; draftId: string; userId: string }
    | { action: 'split'; draftId: string; mode: SplitMode; userId: string | null }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodePostback(postback: Postback): string {
    const params = new URLSearchParams({ action: postback.action })
    if ('draftId' in postback) params.set('draft', postback.draftId)
    if ('category' in postback) params.set('category', postback.category)
    if ('groupId' in postback) params.set('group', postback.groupId ?? 'personal')
    if (postback.action === 'ledger' && postback.view) params.set('view', postback.view)
    if (postback.action === 'recent') params.set('offset', String(postback.offset))
    if (postback.action === 'payer') params.set('user', postback.userId)
    if (postback.action === 'split') {
        params.set('mode', postback.mode)
        if (postback.userId) params.set('user', postback.userId)
    }
    return params.toString()
}

function parseGroup(value: string | null): { ok: true; groupId: string | null } | { ok: false } {
    if (value === 'personal') return { ok: true, groupId: null }
    return value && uuidPattern.test(value) ? { ok: true, groupId: value } : { ok: false }
}

function parseCategory(value: string | null): Category | null {
    return value && Object.hasOwn(categories, value) ? value as Category : null
}

/** 只接受格式正確的 postback；授權與擁有者檢查仍由 DB 函式負責。 */
export function parsePostback(data: string): Postback | null {
    const params = new URLSearchParams(data)
    const action = params.get('action')
    const draftId = params.get('draft') ?? ''
    const validDraft = uuidPattern.test(draftId)
    const user = params.get('user') ?? ''
    const category = parseCategory(params.get('category'))
    const group = parseGroup(params.get('group'))
    if (action === 'confirm' || action === 'cancel' || action === 'date') {
        return validDraft ? { action, draftId } : null
    }
    if (action === 'category') {
        return validDraft && category ? { action, draftId, category } : null
    }
    if (action === 'pickcat') {
        return category ? { action, category } : null
    }
    if (action === 'ledger') {
        const view = params.get('view')
        if (!group.ok || (view !== null && view !== 'add')) return null
        return view === 'add' ? { action, groupId: group.groupId, view } : { action, groupId: group.groupId }
    }
    if (action === 'dledger') {
        return validDraft && group.ok ? { action, draftId, groupId: group.groupId } : null
    }
    if (action === 'payer') {
        return validDraft && uuidPattern.test(user) ? { action, draftId, userId: user } : null
    }
    if (action === 'split') {
        const mode = params.get('mode')
        if (!validDraft) return null
        if (mode === 'all') return { action, draftId, mode, userId: null }
        if ((mode === 'only' || mode === 'toggle') && uuidPattern.test(user)) return { action, draftId, mode, userId: user }
        return null
    }
    if (action === 'recent') {
        const raw = params.get('offset') ?? ''
        const offset = Number(raw)
        return /^\d{1,3}$/.test(raw) && offset <= MAX_RECENT_OFFSET ? { action, offset } : null
    }
    return null
}

// ── 網頁版連結 ──────────────────────────────────────────────────────────

/** openExternalBrowser=1 讓 LINE 用手機瀏覽器開啟，沿用已登入的網頁 session。 */
export function webUrl(webAppUrl: string, path: string): string {
    const base = webAppUrl.endsWith('/') ? webAppUrl : `${webAppUrl}/`
    return `${base}${path}?openExternalBrowser=1`
}

export const webPages = {
    home: 'dashboard',
    expenses: 'expenses',
    overview: 'overview',
    groups: 'groups'
} as const

export function expenseUrl(webAppUrl: string, expenseId: string): string {
    return webUrl(webAppUrl, `expenses/${encodeURIComponent(expenseId)}`)
}

function webButton(url: string, label = '在網頁版開啟') {
    return { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label, uri: url } }
}

/** 文字回覆＋開啟網頁版按鈕 */
export function textCard(text: string, url: string, label?: string): LineMessage {
    return {
        type: 'flex',
        altText: text.slice(0, 400),
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text, size: 'sm', wrap: true }]
            },
            footer: { type: 'box', layout: 'vertical', contents: [webButton(url, label)] }
        }
    }
}

// ── 訊息元件 ────────────────────────────────────────────────────────────

const BRAND = '#777FE6'

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

/** 可點的選項；selected 以品牌色標示。 */
function chip(label: string, selected: boolean, action: Record<string, unknown>) {
    return {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        paddingAll: '8px',
        cornerRadius: 'md',
        backgroundColor: selected ? BRAND : '#F1F2F8',
        action,
        contents: [{ type: 'text', text: label, size: 'sm', align: 'center', color: selected ? '#FFFFFF' : '#1F2340' }]
    }
}

/** 每列固定欄數；最後一列補空白，讓選項寬度一致。 */
function chipRows(chips: Record<string, unknown>[], perRow = 3) {
    const rows = []
    for (let i = 0; i < chips.length; i += perRow) {
        const slice = chips.slice(i, i + perRow)
        while (slice.length < perRow) slice.push({ type: 'box', layout: 'vertical', flex: 1, contents: [] })
        rows.push({ type: 'box', layout: 'horizontal', spacing: 'sm', contents: slice })
    }
    return { type: 'box', layout: 'vertical', spacing: 'sm', contents: rows }
}

function section(title: string, content: Record<string, unknown>) {
    return {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{ type: 'text', text: title, size: 'xs', color: '#888888' }, content]
    }
}

export function ledgerLabel(ledgerName: string | null): string {
    return ledgerName ?? '個人'
}

/** 最多列 11 個群組，加上「個人」剛好 4 列。 */
const MAX_LEDGER_CHIPS = 11

function ledgerChips(ledgers: Ledger[], selectedGroupId: string | null, toPostback: (groupId: string | null) => Postback) {
    const options = [{ groupId: null as string | null, name: '個人' }, ...ledgers.slice(0, MAX_LEDGER_CHIPS)]
    return chipRows(options.map(option => chip(
        option.name,
        option.groupId === selectedGroupId,
        postbackAction(option.name, toPostback(option.groupId), `帳本：${option.name}`)
    )))
}

// ── 記一筆卡片 ──────────────────────────────────────────────────────────

/** 點分類 → 記下預選分類並打開鍵盤，使用者直接輸入「品項 金額」。 */
function pickCategoryAction(category: Category, label: string, displayText: string) {
    return { ...postbackAction(label, { action: 'pickcat', category }, displayText), inputOption: 'openKeyboard' }
}

export function addExpenseMessage(ledgers: Ledger[], webAppUrl: string): LineMessage {
    const current = ledgers.find(ledger => ledger.isCurrent)?.groupId ?? null
    const categoryChips = (Object.keys(categories) as Category[]).map(category =>
        chip(categories[category], false, pickCategoryAction(category, categories[category], `分類：${categories[category]}`)))
    return {
        type: 'flex',
        altText: '新增記帳',
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'lg',
                contents: [
                    { type: 'text', text: '新增記帳', weight: 'bold', size: 'lg' },
                    section('帳本', ledgerChips(ledgers, current, groupId => ({ action: 'ledger', groupId, view: 'add' }))),
                    section('選分類後直接輸入「品項 金額」', chipRows(categoryChips)),
                    { type: 'text', text: '例如「午餐 120」，確認後才會入帳。', size: 'xs', color: '#888888', wrap: true }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    { type: 'button', style: 'primary', action: pickCategoryAction('other', '直接輸入', '直接輸入') },
                    webButton(webUrl(webAppUrl, webPages.home), '在網頁版記帳')
                ]
            }
        }
    }
}

// ── 草稿卡片 ────────────────────────────────────────────────────────────

function memberName(member: DraftMember): string {
    return member.isMe ? '我' : member.name
}

/** 分攤說明：與 DB 相同以「分」均分。 */
export function splitSummary(draft: Draft): string {
    const participants = draft.members.filter(member => member.isParticipant)
    if (participants.length === 0) return ''
    if (participants.length === 1) {
        const only = participants[0]
        return only.isMe ? `全部算你的：${formatAmount(draft.amount)}` : `由 ${only.name} 全額負擔：${formatAmount(draft.amount)}`
    }
    const each = Math.floor(Math.round(Number(draft.amount) * 100) / participants.length) / 100
    return `${participants.length} 人均分，每人約 ${formatAmount(each)}`
}

function splitChips(draft: Draft) {
    const { members } = draft
    const participants = members.filter(member => member.isParticipant)
    const me = members.find(member => member.isMe)
    const others = members.filter(member => !member.isMe)
    const onlyIs = (member: DraftMember | undefined) =>
        !!member && participants.length === 1 && participants[0].userId === member.userId
    const split = (label: string, selected: boolean, mode: 'all' | 'only' | 'toggle', userId: string | null) =>
        chip(label, selected, postbackAction(label, { action: 'split', draftId: draft.id, mode, userId }, `分攤：${label}`))

    const presets = [split('全員均分', participants.length === members.length, 'all', null)]
    if (me) presets.push(split('只算我', onlyIs(me), 'only', me.userId))
    // 兩人群組：三個預設即涵蓋所有組合；多人群組另外提供逐人勾選。
    if (members.length === 2 && others[0]) {
        presets.push(split('只算對方', onlyIs(others[0]), 'only', others[0].userId))
        return chipRows(presets)
    }
    const toggles = members.map(member =>
        split(`${member.isParticipant ? '✓ ' : ''}${memberName(member)}`, member.isParticipant, 'toggle', member.userId))
    return { type: 'box', layout: 'vertical', spacing: 'sm', contents: [chipRows(presets), chipRows(toggles)] }
}

function dateRow(draft: Draft) {
    return {
        type: 'box',
        layout: 'horizontal',
        contents: [
            { type: 'text', text: '日期', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: draft.expenseDate, size: 'sm', flex: 3 },
            {
                type: 'text',
                text: '改日期',
                size: 'sm',
                color: BRAND,
                align: 'end',
                flex: 2,
                action: {
                    type: 'datetimepicker',
                    label: '改日期',
                    data: encodePostback({ action: 'date', draftId: draft.id }),
                    mode: 'date',
                    initial: draft.expenseDate
                }
            }
        ]
    }
}

export function draftMessage(draft: Draft, ledgers: Ledger[], webAppUrl: string): LineMessage {
    const editable = draft.status === 'pending' && !draft.isExpired
    const isGroup = draft.groupId !== null && draft.members.length > 0
    const statusText = draft.status === 'confirmed' ? '已入帳' : editable ? '記帳草稿' : '記帳草稿（已失效）'
    const payer = draft.members.find(member => member.isPayer)

    const details: Record<string, unknown>[] = editable
        ? [
            section('帳本', ledgerChips(ledgers, draft.groupId, groupId => ({ action: 'dledger', draftId: draft.id, groupId }))),
            row('分類', categoryName(draft.category)),
            dateRow(draft)
        ]
        : [row('帳本', ledgerLabel(draft.ledgerName)), row('分類', categoryName(draft.category)), row('日期', draft.expenseDate)]
    if (isGroup && editable) {
        details.push(
            section('付款人', chipRows(draft.members.map(member => chip(
                memberName(member),
                member.isPayer,
                postbackAction(memberName(member), { action: 'payer', draftId: draft.id, userId: member.userId }, `付款人：${memberName(member)}`)
            )))),
            section('分攤給', splitChips(draft))
        )
    } else if (isGroup && payer) {
        details.push(row('付款人', memberName(payer)))
    }
    if (isGroup) details.push({ type: 'text', text: splitSummary(draft), size: 'xs', color: '#888888', wrap: true })

    const webLink = draft.expenseId
        ? webButton(expenseUrl(webAppUrl, draft.expenseId), '在網頁版查看這筆')
        : webButton(webUrl(webAppUrl, webPages.home), '在網頁版開啟')
    const footer = editable
        ? [
            {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: [
                    { type: 'button', style: 'secondary', action: postbackAction('取消', { action: 'cancel', draftId: draft.id }) },
                    { type: 'button', style: 'primary', action: postbackAction('確認入帳', { action: 'confirm', draftId: draft.id }) }
                ]
            },
            webLink
        ]
        : [webLink]

    const message: LineMessage = {
        type: 'flex',
        altText: `${statusText}：${draft.title} ${formatAmount(draft.amount)}`,
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    { type: 'text', text: statusText, size: 'xs', color: '#888888' },
                    { type: 'text', text: draft.title, weight: 'bold', size: 'lg', wrap: true },
                    { type: 'text', text: formatAmount(draft.amount), weight: 'bold', size: 'xxl' },
                    ...details
                ]
            },
            footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer }
        }
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

// ── 帳本卡片 ────────────────────────────────────────────────────────────

export function ledgerMessage(ledgers: Ledger[], webAppUrl: string): LineMessage {
    const current = ledgers.find(ledger => ledger.isCurrent) ?? null
    return {
        type: 'flex',
        altText: `目前帳本：${ledgerLabel(current?.name ?? null)}`,
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'lg',
                contents: [
                    { type: 'text', text: '切換帳本', weight: 'bold', size: 'lg' },
                    { type: 'text', text: '之後記的帳會記到選取的帳本。', size: 'xs', color: '#888888', wrap: true },
                    ledgerChips(ledgers, current?.groupId ?? null, groupId => ({ action: 'ledger', groupId }))
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [webButton(webUrl(webAppUrl, webPages.groups), '在網頁版管理群組')]
            }
        }
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
    const scope = ledgerName === null ? '個人（含你在群組的分攤）' : ledgerName
    return {
        type: 'box',
        layout: 'vertical',
        contents: [
            { type: 'text', text: title, weight: 'bold', size: 'lg' },
            { type: 'text', text: `帳本：${scope}`, size: 'xs', color: '#888888', wrap: true }
        ]
    }
}

/** 最近紀錄；items 可多傳一筆，用來判斷是否還有下一頁。 */
export function recentMessage(ledgerName: string | null, items: ExpenseItem[], offset: number, webAppUrl: string): LineMessage {
    const listUrl = webUrl(webAppUrl, webPages.expenses)
    if (items.length === 0) {
        return textCard(offset === 0 ? `「${ledgerLabel(ledgerName)}」帳本還沒有紀錄。` : '沒有更多紀錄了。', listUrl)
    }
    const page = items.slice(0, RECENT_PAGE_SIZE)
    const hasMore = items.length > RECENT_PAGE_SIZE
    const rows = page.flatMap((item, index) => {
        const details = [item.expenseDate.slice(5), categoryName(item.category)]
        if (ledgerName !== null) details.push(item.paidByMe ? '你付' : `${item.payerName ?? '成員'}付`)
        // 個人帳本中的群組費用：金額是自己的分攤，附上群組與總額
        if (ledgerName === null && item.groupName) {
            details.push(`${item.groupName}（共 ${formatAmount(item.totalAmount, item.currency)}）`)
        }
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
                        { type: 'text', text: details.join('・'), size: 'xxs', color: '#888888', wrap: true }
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
    const footer: Record<string, unknown>[] = [webButton(listUrl, '在網頁版查看全部')]
    if (hasMore) {
        footer.unshift({
            type: 'button',
            style: 'secondary',
            action: postbackAction('更多紀錄', { action: 'recent', offset: offset + RECENT_PAGE_SIZE })
        })
    }
    bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer }
    return { type: 'flex', altText: `最近紀錄（${ledgerLabel(ledgerName)}）`, contents: bubble }
}

function changeText(thisMonth: number, lastMonth: number): string {
    if (lastMonth === 0) return `上月 ${formatAmount(lastMonth)}`
    const percent = Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
    return `上月 ${formatAmount(lastMonth)}（${percent >= 0 ? '+' : ''}${percent}%）`
}

/** 本月統計：總額、與上月比較、各分類長條（以 Flex box 寬度畫，不需產圖）。 */
export function summaryMessage(ledgerName: string | null, month: string, totals: CategoryTotal[], webAppUrl: string): LineMessage {
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
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [webButton(webUrl(webAppUrl, webPages.overview), '在網頁版看統計')]
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
    return [`「${ledgerName}」目前欠款：`, ...lines, '', '結清請到網頁版操作。'].join('\n')
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
