// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNonce, hashNonce } from '../supabase/functions/_shared/nonce'
import { createLinkHandler, type LinkStore } from '../supabase/functions/line-link/handler'

const validToken = 'valid-access-token'
const getUserId = vi.fn(async (token: string) => token === validToken ? 'user-uuid' : null)
let store: LinkStore
let handler: (request: Request) => Promise<Response>

function request(body: unknown, token: string | null = validToken, method = 'POST') {
    return new Request('https://example.invalid/line-link', {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: method === 'POST' ? JSON.stringify(body) : undefined
    })
}

beforeEach(() => {
    getUserId.mockClear()
    store = {
        isUserBound: vi.fn(async () => false),
        saveNonce: vi.fn(async () => {})
    }
    handler = createLinkHandler({ getUserId, store, createNonce: () => 'nonce+/=' })
})

describe('line-link', () => {
    it('answers CORS preflight', async () => {
        const response = await handler(request(null, null, 'OPTIONS'))
        expect(response.status).toBe(204)
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('authorization')
    })

    it.each([null, 'forged-token'])('rejects an invalid session (%s) without saving a nonce', async token => {
        const response = await handler(request({ linkToken: 'lt' }, token))
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: 'unauthorized' })
        expect(store.saveNonce).not.toHaveBeenCalled()
    })

    it.each([{}, { linkToken: '' }, { linkToken: 42 }, { linkToken: 'x'.repeat(513) }])('rejects a bad link token %#', async body => {
        const response = await handler(request(body))
        expect(response.status).toBe(400)
        expect(store.saveNonce).not.toHaveBeenCalled()
    })

    it('rejects accounts already bound to a LINE user', async () => {
        vi.mocked(store.isUserBound).mockResolvedValueOnce(true)
        const response = await handler(request({ linkToken: 'lt' }))
        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({ error: 'already_bound' })
        expect(store.saveNonce).not.toHaveBeenCalled()
    })

    it('saves the nonce for the verified user and returns the LINE account link URL', async () => {
        const response = await handler(request({ linkToken: 'lt/1' }))
        expect(response.status).toBe(200)
        expect(store.saveNonce).toHaveBeenCalledExactlyOnceWith('user-uuid', 'nonce+/=')
        expect(await response.json()).toEqual({
            redirectUrl: 'https://access.line.me/dialog/bot/accountLink?linkToken=lt%2F1&nonce=nonce%2B%2F%3D'
        })
    })
})

describe('nonce', () => {
    it('creates unique URL-safe 256-bit nonces', () => {
        const nonces = new Set(Array.from({ length: 100 }, createNonce))
        expect(nonces.size).toBe(100)
        for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
    })

    it('hashes with SHA-256 hex', async () => {
        expect(await hashNonce('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    })
})
