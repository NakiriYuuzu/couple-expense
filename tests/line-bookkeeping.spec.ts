// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
    draftMessage,
    encodePostback,
    formatAmount,
    ledgerMessage,
    parseExpense,
    parsePostback,
    type Draft,
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
        { action: 'ledger', groupId: null }
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
        'action=ledger&group=everyone'
    ])('rejects %j', data => {
        expect(parsePostback(data)).toBeNull()
    })
})

describe('messages', () => {
    const draft: Draft = {
        id: '30000000-0000-0000-0000-000000000001',
        title: '午餐',
        amount: '1200.50',
        category: 'food',
        expenseDate: '2026-09-29',
        status: 'pending',
        ledgerName: '我們家',
        isExpired: false
    }

    it('formats amounts', () => {
        expect(formatAmount('120.00')).toBe('120 元')
        expect(formatAmount('1200.50')).toBe('1,200.5 元')
    })

    it('renders a pending draft with confirm/cancel buttons and category quick replies', () => {
        const json = JSON.stringify(draftMessage(draft))
        expect(json).toContain('我們家')
        expect(json).toContain('餐飲')
        expect(json).toContain('1,200.5 元')
        expect(json).toContain(encodePostback({ action: 'confirm', draftId: draft.id }))
        expect(json).toContain(encodePostback({ action: 'category', draftId: draft.id, category: 'pet' }))
    })

    it.each<Partial<Draft>>([{ status: 'confirmed' }, { status: 'cancelled' }, { isExpired: true }])(
        'hides actions on a draft that is no longer editable (%j)', change => {
            const message = draftMessage({ ...draft, ...change })
            expect(message.quickReply).toBeUndefined()
            expect(JSON.stringify(message)).not.toContain('action=')
        })

    it('limits the ledger menu to 13 quick replies', () => {
        const ledgers = Array.from({ length: 20 }, (_, i) => ({
            groupId: `20000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
            name: `群組${i}`,
            isCurrent: i === 3
        }))
        const message = ledgerMessage(ledgers) as { text: string; quickReply: { items: unknown[] } }
        expect(message.quickReply.items).toHaveLength(13)
        expect(message.text).toContain('群組3')
    })
})
