import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18next, { i18nReady } from '@/shared/i18n'
import { formatCurrency } from '@/shared/lib/money'
import { ExpenseItem } from '../ExpenseItem'

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
})

describe('ExpenseItem', () => {
    const props = {
        title: '午餐',
        amount: formatCurrency(100, 'TWD'),
        category: 'food',
        icon: 'restaurant'
    }

    it('activates a clickable row with Enter and Space without changing click behavior', () => {
        const onClick = vi.fn()
        render(<ExpenseItem {...props} onClick={onClick} />)

        const row = screen.getByRole('button', { name: /午餐/ })
        fireEvent.click(row)
        fireEvent.keyDown(row, { key: 'Enter' })
        fireEvent.keyDown(row, { key: ' ' })

        expect(onClick).toHaveBeenCalledTimes(3)
    })

    it('does not expose button semantics when it is not clickable', () => {
        render(<ExpenseItem {...props} />)

        expect(screen.queryByRole('button', { name: /午餐/ })).toBeNull()
        expect(screen.getByText('午餐').closest('[tabindex]')).toBeNull()
    })
})
