import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
        <a href={to} {...props}>
            {children}
        </a>
    )
}))

import { BottomNavigation } from '../BottomNavigation'

describe('BottomNavigation', () => {
    it('places the add expense action in the center of bottom navigation', () => {
        const onAddExpenseClick = vi.fn()

        render(<BottomNavigation activeTab="expenses" hidden={false} onAddExpenseClick={onAddExpenseClick} />)

        const navigation = screen.getByRole('navigation')
        const controls = Array.from(navigation.querySelectorAll('a, button'))

        expect(controls.map((control) => control.getAttribute('aria-label'))).toEqual([
            'dashboard',
            'expenses',
            'add-expense',
            'overview',
            'settings'
        ])

        fireEvent.click(screen.getByRole('button', { name: 'add-expense' }))

        expect(onAddExpenseClick).toHaveBeenCalledTimes(1)
    })
})
