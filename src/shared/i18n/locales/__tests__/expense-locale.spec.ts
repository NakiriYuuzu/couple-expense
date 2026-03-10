import { describe, expect, it } from 'vitest'
import en from '../en'
import zhTW from '../zh-TW'

describe('expense locale messages', () => {
    it('defines recent quick copy label in supported locales', () => {
        expect(zhTW.expense.recentQuickCopy).toBeTypeOf('string')
        expect(zhTW.expense.recentQuickCopy.length).toBeGreaterThan(0)

        expect(en.expense.recentQuickCopy).toBeTypeOf('string')
        expect(en.expense.recentQuickCopy.length).toBeGreaterThan(0)
    })

    it('defines split method descriptions in supported locales', () => {
        expect(zhTW.split.equalDesc).toBeTypeOf('string')
        expect(zhTW.split.exactDesc).toBeTypeOf('string')
        expect(zhTW.split.percentageDesc).toBeTypeOf('string')
        expect(zhTW.split.sharesDesc).toBeTypeOf('string')

        expect(en.split.equalDesc).toBeTypeOf('string')
        expect(en.split.exactDesc).toBeTypeOf('string')
        expect(en.split.percentageDesc).toBeTypeOf('string')
        expect(en.split.sharesDesc).toBeTypeOf('string')
    })
})
