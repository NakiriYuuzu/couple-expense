import { describe, it, expect, beforeAll } from 'vitest'
import i18next, { i18nReady, AVAILABLE_LOCALES, resources } from '../index'

describe('i18n init', () => {
    beforeAll(async () => {
        await i18nReady
    })

    it('exposes both zh-TW and en locales', () => {
        expect(AVAILABLE_LOCALES).toEqual(['zh-TW', 'en'])
        expect(resources['zh-TW'].translation).toBeTruthy()
        expect(resources.en.translation).toBeTruthy()
    })

    it('initializes with zh-TW as the default language', () => {
        expect(i18next.isInitialized).toBe(true)
        expect(i18next.language).toBe('zh-TW')
    })

    it('resolves sample keys in zh-TW', async () => {
        await i18next.changeLanguage('zh-TW')
        expect(i18next.t('common.confirm')).toBe('確認')
        expect(i18next.t('expense.categories.food')).toBe('餐飲')
        expect(i18next.t('split.methods.equal')).toBe('均分')
    })

    it('resolves the same keys in en after changeLanguage', async () => {
        await i18next.changeLanguage('en')
        expect(i18next.t('common.confirm')).toBe('Confirm')
        expect(i18next.t('expense.categories.food')).toBe('Food & Dining')
        await i18next.changeLanguage('zh-TW')
    })

    it('interpolates single-brace placeholders (Vue-style {name})', async () => {
        await i18next.changeLanguage('zh-TW')
        expect(i18next.t('expense.fromGroup', { name: '家庭' })).toBe('來自 家庭')
    })

    it('covers all six category keys used by Vue useCategories', () => {
        const ids = ['food', 'pet', 'shopping', 'transport', 'home', 'other']
        for (const id of ids) {
            expect(i18next.t(`expense.categories.${id}`)).not.toBe(`expense.categories.${id}`)
        }
    })
})
