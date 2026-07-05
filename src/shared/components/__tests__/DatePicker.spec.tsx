import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import i18next, { i18nReady } from '@/shared/i18n'
import { DatePicker } from '../DatePicker'

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
})

describe('DatePicker', () => {
    it('renders the placeholder and formatted selected value', () => {
        const { rerender } = render(
            <DatePicker value="" onChange={vi.fn()} placeholder="選擇日期" aria-label="日期" />
        )

        expect(screen.getByRole('button', { name: '日期' })).toBeTruthy()
        expect(screen.getByText('選擇日期')).toBeTruthy()

        rerender(
            <DatePicker value="2026-01-15" onChange={vi.fn()} placeholder="選擇日期" aria-label="日期" />
        )

        expect(screen.getByRole('button', { name: '日期' })).toBeTruthy()
        expect(screen.getByText('2026/01/15')).toBeTruthy()
    })

    it('opens the calendar, selects a local calendar day, and closes the popover', async () => {
        const onChange = vi.fn()
        render(
            <DatePicker
                value="2026-01-15"
                onChange={onChange}
                placeholder="選擇日期"
                aria-label="日期"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: '日期' }))

        const calendar = await screen.findByRole('grid')
        fireEvent.click(within(calendar).getByRole('button', { name: /2026年1月1日/ }))

        expect(onChange).toHaveBeenCalledWith('2026-01-01')
        await waitFor(() => expect(screen.queryByRole('grid')).toBeNull())
    })
})
