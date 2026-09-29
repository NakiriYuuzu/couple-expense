// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
    addExpenseMessage,
    debtsText,
    draftMessage,
    encodePostback,
    formatAmount,
    ledgerMessage,
    splitSummary,
    textCard,
    webUrl,
    parseExpense,
    parsePostback,
    recentMessage,
    summaryMessage,
    taipeiMonth,
    type Draft,
    type DraftMember,
    type ExpenseItem,
    type Postback
} from '../supabase/functions/line-webhook/bookkeeping'

describe('parseExpense', () => {
    it.each([
        ['午餐 120', { title: '午餐', amount: 120 }],
        ['120 午餐', { title: '午餐', amount: 120 }],
        ['午餐120', { title: '午餐', amount: 120 }],
        ['午餐 120元', { title: '午餐', amount: 120 }],
        ['計程車 $85.5', { title: '計程車', amount: 85.5 }],
        ['7-11 50', { title: '7-11', amount: 50 }],
        ['iPhone15 32,900', { title: 'iPhone15', amount: 32900 }],
        ['  全聯   1，200 塊 ', { title: '全聯', amount: 1200 }],
        ['早餐 ６５', { title: '早餐', amount: 65 }],
        ['咖啡 0.5', { title: '咖啡', amount: 0.5 }]
    ])('parses %j', (text, expected) => {
        expect(parseExpense(text)).toEqual(expected)
    })

    it.each(['午餐', '120', '午餐 0', '午餐 -5', '午餐 1.234', '說明', '', `${'長'.repeat(51)} 10`, '午餐 99999999999'])(
        'rejects %j', text => {
            expect(parseExpense(text)).toBeNull()
        })
})

describe('postback', () => {
    const draftId = '30000000-0000-0000-0000-000000000001'

    it.each<Postback>([
        { action: 'confirm', draftId },
        { action: 'cancel', draftId },
        { action: 'category', draftId, category: 'food' },
        { action: 'ledger', groupId: '20000000-0000-0000-0000-000000000001' },
        { action: 'ledger', groupId: null },
        { action: 'ledger', groupId: null, view: 'add' },
        { action: 'recent', offset: 0 },
        { action: 'recent', offset: 490 },
        { action: 'date', draftId },
        { action: 'pickcat', category: 'transport' },
        { action: 'dledger', draftId, groupId: null },
        { action: 'dledger', draftId, groupId: '20000000-0000-0000-0000-000000000001' },
        { action: 'payer', draftId, userId: '00000000-0000-0000-0000-000000000002' },
        { action: 'split', draftId, mode: 'all', userId: null },
        { action: 'split', draftId, mode: 'only', userId: '00000000-0000-0000-0000-000000000002' },
        { action: 'split', draftId, mode: 'toggle', userId: '00000000-0000-0000-0000-000000000002' }
    ])('round-trips %j within the LINE 300 character limit', postback => {
        const data = encodePostback(postback)
        expect(data.length).toBeLessThanOrEqual(300)
        expect(parsePostback(data)).toEqual(postback)
    })

    it.each([
        '',
        'action=delete&draft=' + draftId,
        'action=confirm&draft=1',
        "action=confirm&draft=' OR 1=1",
        'action=category&draft=' + draftId + '&category=__proto__',
        'action=ledger&group=everyone',
        'action=recent&offset=-10',
        'action=recent&offset=1e3',
        'action=recent&offset=990',
        'action=recent',
        'action=ledger&group=personal&view=list',
        'action=pickcat&category=bogus',
        'action=dledger&draft=' + draftId + '&group=all',
        'action=payer&draft=' + draftId + '&user=me',
        'action=split&draft=' + draftId + '&mode=only',
        'action=split&draft=' + draftId + '&mode=everyone',
        'action=date&draft=x'
    ])('rejects %j', data => {
        expect(parsePostback(data)).toBeNull()
    })
})

describe('messages', () => {
    const webAppUrl = 'https://example.invalid/couple-expense/'
    const me = '00000000-0000-0000-0000-000000000001'
    const kuri = '00000000-0000-0000-0000-000000000002'
    const group = '20000000-0000-0000-0000-000000000001'
    const ledgers = [{ groupId: group, name: '我們家', isCurrent: true }]
    const members: DraftMember[] = [
        { userId: me, name: 'Yuuzu', isMe: true, isPayer: true, isParticipant: true },
        { userId: kuri, name: 'Kuri', isMe: false, isPayer: false, isParticipant: true }
    ]
    const draft: Draft = {
        id: '30000000-0000-0000-0000-000000000001',
        title: '午餐',
        amount: '1200.50',
        category: 'food',
        expenseDate: '2026-09-29',
        status: 'pending',
        ledgerName: '我們家',
        groupId: group,
        isExpired: false,
        expenseId: null,
        members
    }

    it('formats amounts', () => {
        expect(formatAmount('120.00')).toBe('120 元')
        expect(formatAmount('1200.50')).toBe('1,200.5 元')
    })

    it('builds web links that open in the external browser', () => {
        expect(webUrl('https://example.invalid/app', 'overview')).toBe('https://example.invalid/app/overview?openExternalBrowser=1')
        const card = JSON.stringify(textCard('完成', webUrl(webAppUrl, 'dashboard')))
        expect(card).toContain('"uri":"https://example.invalid/couple-expense/dashboard?openExternalBrowser=1"')
    })

    it('renders the add card with ledgers, category keyboard shortcuts and a web link', () => {
        const json = JSON.stringify(addExpenseMessage(ledgers, webAppUrl))
        expect(json).toContain(encodePostback({ action: 'ledger', groupId: null, view: 'add' }))
        expect(json).toContain(encodePostback({ action: 'ledger', groupId: group, view: 'add' }))
        expect(json).toContain(encodePostback({ action: 'pickcat', category: 'food' }))
        expect(json.match(/"inputOption":"openKeyboard"/g)).toHaveLength(7)
        expect(json).toContain('dashboard?openExternalBrowser=1')
    })

    it('renders a group draft with ledger, payer, split presets, date picker, actions and a web link', () => {
        const json = JSON.stringify(draftMessage(draft, ledgers, webAppUrl))
        expect(json).toContain('1,200.5 元')
        expect(json).toContain(encodePostback({ action: 'dledger', draftId: draft.id, groupId: null }))
        expect(json).toContain(encodePostback({ action: 'payer', draftId: draft.id, userId: kuri }))
        expect(json).toContain(encodePostback({ action: 'split', draftId: draft.id, mode: 'all', userId: null }))
        expect(json).toContain(encodePostback({ action: 'split', draftId: draft.id, mode: 'only', userId: me }))
        expect(json).toContain(encodePostback({ action: 'split', draftId: draft.id, mode: 'only', userId: kuri }))
        expect(json).toContain('"type":"datetimepicker"')
        expect(json).toContain(encodePostback({ action: 'confirm', draftId: draft.id }))
        expect(json).toContain(encodePostback({ action: 'category', draftId: draft.id, category: 'pet' }))
        expect(json).toContain('dashboard?openExternalBrowser=1')
        // 兩人群組只用三個預設，不額外列逐人勾選
        expect(json).not.toContain('"mode":"toggle"')
        expect(json).not.toContain('mode=toggle')
    })

    it('offers per-member toggles in bigger groups', () => {
        const trio = [...members, { userId: '00000000-0000-0000-0000-000000000003', name: 'Mika', isMe: false, isPayer: false, isParticipant: false }]
        const json = JSON.stringify(draftMessage({ ...draft, members: trio }, ledgers, webAppUrl))
        expect(json).toContain('mode=toggle')
        expect(json).toContain('✓ Kuri')
        expect(json).not.toContain('只算對方')
    })

    it('summarises the split like the database', () => {
        expect(splitSummary(draft)).toBe('2 人均分，每人約 600.25 元')
        expect(splitSummary({ ...draft, members: [{ ...members[0], isParticipant: false }, members[1]] }))
            .toBe('由 Kuri 全額負擔：1,200.5 元')
        expect(splitSummary({ ...draft, members: [members[0], { ...members[1], isParticipant: false }] }))
            .toBe('全部算你的：1,200.5 元')
    })

    it('renders a personal draft without payer or split options', () => {
        const json = JSON.stringify(draftMessage({ ...draft, groupId: null, ledgerName: null, members: [] }, ledgers, webAppUrl))
        expect(json).not.toContain('action=payer')
        expect(json).not.toContain('action=split')
        expect(json).toContain(encodePostback({ action: 'dledger', draftId: draft.id, groupId: group }))
    })

    it.each<Partial<Draft>>([{ status: 'cancelled' }, { isExpired: true }])(
        'hides actions on a draft that is no longer editable (%j)', change => {
            const message = draftMessage({ ...draft, ...change }, ledgers, webAppUrl)
            expect(message.quickReply).toBeUndefined()
            expect(JSON.stringify(message)).not.toContain('action=')
            expect(JSON.stringify(message)).toContain('openExternalBrowser=1')
        })

    it('links a confirmed draft to its expense page', () => {
        const json = JSON.stringify(draftMessage({ ...draft, status: 'confirmed', expenseId: 'e-1' }, ledgers, webAppUrl))
        expect(json).toContain('expenses/e-1?openExternalBrowser=1')
    })

    it('limits the ledger card to twelve choices and links to groups', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({
            groupId: `20000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
            name: `群組${i}`,
            isCurrent: i === 3
        }))
        const json = JSON.stringify(ledgerMessage(many, webAppUrl))
        expect(json.match(/action=ledger/g)).toHaveLength(12)
        expect(json).toContain('群組10')
        expect(json).not.toContain('群組11')
        expect(json).toContain('groups?openExternalBrowser=1')
    })
})

describe('menu messages', () => {
    const webAppUrl = 'https://example.invalid/couple-expense/'
    const item: ExpenseItem = {
        title: '午餐', amount: '120', currency: 'TWD', category: 'food', expenseDate: '2026-09-29', payerName: 'Kuri', paidByMe: false,
        groupName: null, totalAmount: '120'
    }

    it('formats foreign currency', () => {
        expect(formatAmount('10', 'USD')).toBe('10 USD')
    })

    it('shows the payer only for group ledgers', () => {
        expect(JSON.stringify(recentMessage('我們家', [item], 0, webAppUrl))).toContain('09-29・餐飲・Kuri付')
        expect(JSON.stringify(recentMessage(null, [item], 0, webAppUrl))).not.toContain('付')
    })

    it('shows group shares in the personal ledger with the group and total', () => {
        const share = { ...item, amount: '60', groupName: '我們家', totalAmount: '120' }
        const json = JSON.stringify(recentMessage(null, [share], 0, webAppUrl))
        expect(json).toContain('09-29・餐飲・我們家（共 120 元）')
        expect(json).toContain('"text":"60 元"')
        expect(json).toContain('含你在群組的分攤')
        expect(json).toContain('expenses?openExternalBrowser=1')
    })

    it('adds a "more" button only when there is a next page', () => {
        const eleven = Array.from({ length: 11 }, (_, i) => ({ ...item, title: `品項${i}` }))
        const more = recentMessage(null, eleven, 10, webAppUrl)
        const json = JSON.stringify(more)
        expect(json).toContain('品項9')
        expect(json).not.toContain('品項10')
        expect(json).toContain(encodePostback({ action: 'recent', offset: 20 }))
        expect(JSON.stringify(recentMessage(null, eleven.slice(0, 10), 0, webAppUrl))).not.toContain('action=recent')
    })

    it('explains empty ledgers and pages', () => {
        const listUrl = webUrl(webAppUrl, 'expenses')
        expect(recentMessage(null, [], 0, webAppUrl)).toEqual(textCard('「個人」帳本還沒有紀錄。', listUrl))
        expect(recentMessage(null, [], 10, webAppUrl)).toEqual(textCard('沒有更多紀錄了。', listUrl))
    })

    it('draws month bars relative to the largest category and compares to last month', () => {
        const json = JSON.stringify(summaryMessage('我們家', '2026-09', [
            { category: 'food', thisMonth: '300', lastMonth: '100' },
            { category: 'pet', thisMonth: '150', lastMonth: '50' },
            { category: 'home', thisMonth: '0', lastMonth: '50' }
        ], webAppUrl))
        expect(json).toContain('450 元')
        expect(json).toContain('上月 200 元（+125%）')
        expect(json).toContain('"width":"100%"')
        expect(json).toContain('"width":"50%"')
        expect(json).not.toContain('居家')
        expect(json).toContain('overview?openExternalBrowser=1')
    })

    it('handles a month without expenses', () => {
        expect(JSON.stringify(summaryMessage(null, '2026-09', [], webAppUrl))).toContain('本月還沒有紀錄。')
    })

    it('describes debts from the viewpoint of the user', () => {
        expect(debtsText(null, [])).toContain('個人帳沒有分帳欠款')
        expect(debtsText('我們家', [])).toBe('「我們家」目前沒有欠款。')
        expect(debtsText('我們家', [{ fromName: 'Kuri', toName: 'Yuuzu', amount: '60', fromMe: false, toMe: true }]))
            .toContain('・Kuri → 你：60 元')
    })

    it('uses Taipei time for the month', () => {
        expect(taipeiMonth(new Date('2026-09-30T15:59:59Z'))).toBe('2026-09')
        expect(taipeiMonth(new Date('2026-09-30T16:00:00Z'))).toBe('2026-10')
    })
})
