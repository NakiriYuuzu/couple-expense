import { describe, it, expect } from 'vitest'
import { isRedirect } from '@tanstack/react-router'
import type { RouterContext } from '@/shared/lib/routerContext'
import { requireAuth, redirectIfAuthed } from '../guard'

// 假 context：auth ready 立即解除，快照由參數決定
function makeContext(user: { id: string } | null): RouterContext {
    return {
        queryClient: {},
        auth: {
            whenReady: () => Promise.resolve(),
            getSnapshot: () => ({ status: 'ready', user, session: null })
        }
    } as unknown as RouterContext
}

async function catchRedirect(fn: () => Promise<void>): Promise<{ options: Record<string, unknown> }> {
    try {
        await fn()
    } catch (err) {
        expect(isRedirect(err)).toBe(true)
        return err as { options: Record<string, unknown> }
    }
    throw new Error('expected a redirect to be thrown')
}

describe('requireAuth（受保護頁 guard）', () => {
    it('未登入 → 導向 / 並帶原 href 作 redirect 參數', async () => {
        const err = await catchRedirect(() =>
            requireAuth({ context: makeContext(null), location: { href: '/expenses?tab=debt' } })
        )
        expect(err.options.to).toBe('/')
        expect(err.options.search).toEqual({ redirect: '/expenses?tab=debt' })
    })

    it('已登入 → 放行不重導', async () => {
        await expect(
            requireAuth({ context: makeContext({ id: 'u1' }), location: { href: '/expenses' } })
        ).resolves.toBeUndefined()
    })
})

describe('redirectIfAuthed（startup 頁 guard）', () => {
    it('未登入 → 停留在 startup', async () => {
        await expect(
            redirectIfAuthed({ context: makeContext(null), search: { redirect: '/expenses' } })
        ).resolves.toBeUndefined()
    })

    it('已登入 + 合法 redirect → SPA 導向該站內路徑', async () => {
        const err = await catchRedirect(() =>
            redirectIfAuthed({ context: makeContext({ id: 'u1' }), search: { redirect: '/overview' } })
        )
        expect(err.options.href).toBe('/overview')
        expect(err.options.reloadDocument).toBe(false)
    })

    it('已登入 + //evil.com → 拒絕，改導 /dashboard', async () => {
        const err = await catchRedirect(() =>
            redirectIfAuthed({ context: makeContext({ id: 'u1' }), search: { redirect: '//evil.com' } })
        )
        expect(err.options.to).toBe('/dashboard')
        expect(err.options.href).toBeUndefined()
    })

    it('已登入 + https://evil.com → 拒絕，改導 /dashboard', async () => {
        const err = await catchRedirect(() =>
            redirectIfAuthed({ context: makeContext({ id: 'u1' }), search: { redirect: 'https://evil.com' } })
        )
        expect(err.options.to).toBe('/dashboard')
    })

    it('已登入無 redirect → /dashboard', async () => {
        const err = await catchRedirect(() =>
            redirectIfAuthed({ context: makeContext({ id: 'u1' }), search: {} })
        )
        expect(err.options.to).toBe('/dashboard')
    })
})
