import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/react-router'
import { goBack } from '../navigation'

function fakeRouter(entries: string[]) {
    const history = createMemoryHistory({ initialEntries: [entries[0]] })
    for (const entry of entries.slice(1)) history.push(entry)
    return { history, navigate: vi.fn() }
}

describe('goBack', () => {
    it('goes back when the page was reached inside the app', () => {
        const router = fakeRouter(['/expenses', '/expenses/1'])
        goBack(router)
        expect(router.history.location.pathname).toBe('/expenses')
        expect(router.navigate).not.toHaveBeenCalled()
    })

    it('falls back to the home page when opened directly from a link', () => {
        const router = fakeRouter(['/expenses/1'])
        goBack(router)
        expect(router.navigate).toHaveBeenCalledExactlyOnceWith({ to: '/dashboard', replace: true })
    })
})
