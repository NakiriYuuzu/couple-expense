import { describe, it, expect } from 'vitest'
import { formatCurrency } from '../money'

describe('formatCurrency', () => {
    describe('TWD (default)', () => {
        it('formats as NT prefix, integer, with thousands separators', () => {
            expect(formatCurrency(1234)).toBe('NT 1,234')
            expect(formatCurrency(1234567)).toBe('NT 1,234,567')
        })

        it('defaults the currency argument to TWD', () => {
            expect(formatCurrency(1000)).toBe('NT 1,000')
        })

        it('rounds to an integer (half-expand)', () => {
            expect(formatCurrency(1233.4)).toBe('NT 1,233')
            expect(formatCurrency(1234.5)).toBe('NT 1,235')
            expect(formatCurrency(1233.6)).toBe('NT 1,234')
        })

        it('formats negatives with the sign before the NT prefix', () => {
            expect(formatCurrency(-1234)).toBe('-NT 1,234')
        })

        it('formats zero without a sign', () => {
            expect(formatCurrency(0)).toBe('NT 0')
        })
    })

    describe('negative zero / near-zero (no signed zero)', () => {
        it('formats -0 as NT 0, not -NT 0', () => {
            expect(formatCurrency(-0)).toBe('NT 0')
        })

        it('rounds a near-zero negative TWD to NT 0, not -NT 0', () => {
            expect(formatCurrency(-0.3)).toBe('NT 0')
        })

        it('rounds a sub-cent negative USD to $0.00, not -$0.00', () => {
            expect(formatCurrency(-0.004, 'USD')).toBe('$0.00')
        })

        it('does not sign a near-zero negative in signed mode', () => {
            expect(formatCurrency(-0.3, 'TWD', { signed: true })).toBe('NT 0')
            expect(formatCurrency(-0.004, 'USD', { signed: true })).toBe('$0.00')
            expect(formatCurrency(-0, 'TWD', { signed: true })).toBe('NT 0')
        })
    })

    describe('other schema currencies', () => {
        it('USD keeps two decimals', () => {
            expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50')
        })

        it('EUR keeps two decimals', () => {
            expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50')
        })

        it('JPY is zero-decimal', () => {
            expect(formatCurrency(1234.5, 'JPY')).toBe('¥1,235')
            expect(formatCurrency(1234, 'JPY')).toBe('¥1,234')
        })

        it('CNY keeps two decimals', () => {
            expect(formatCurrency(1234.5, 'CNY')).toBe('CN¥1,234.50')
        })
    })

    describe('signed mode', () => {
        it('prefixes positive amounts with +', () => {
            expect(formatCurrency(1234, 'TWD', { signed: true })).toBe('+NT 1,234')
            expect(formatCurrency(1234.5, 'USD', { signed: true })).toBe('+$1,234.50')
        })

        it('leaves the Intl-generated minus sign on negatives', () => {
            expect(formatCurrency(-1234, 'TWD', { signed: true })).toBe('-NT 1,234')
        })

        it('does not add a sign to zero', () => {
            expect(formatCurrency(0, 'TWD', { signed: true })).toBe('NT 0')
        })
    })
})
