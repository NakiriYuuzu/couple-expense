import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@/shared/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const { requestLineLink } = await import('../api')

function httpError(status: number, body: unknown) {
    return new FunctionsHttpError(new Response(JSON.stringify(body), { status }))
}

beforeEach(() => {
    invoke.mockReset()
})

describe('requestLineLink', () => {
    it('returns the LINE account link URL', async () => {
        const redirectUrl = 'https://access.line.me/dialog/bot/accountLink?linkToken=lt&nonce=n'
        invoke.mockResolvedValue({ data: { redirectUrl }, error: null })
        expect(await requestLineLink('lt')).toEqual({ redirectUrl })
        expect(invoke).toHaveBeenCalledWith('line-link', { body: { linkToken: 'lt' } })
    })

    it('refuses to redirect anywhere other than the LINE account link page', async () => {
        invoke.mockResolvedValue({ data: { redirectUrl: 'https://evil.example/accountLink?' }, error: null })
        expect(await requestLineLink('lt')).toEqual({ error: 'failed' })
    })

    it.each([
        [httpError(409, { error: 'already_bound' }), 'already_bound'],
        [httpError(401, { error: 'unauthorized' }), 'unauthorized'],
        [httpError(400, { error: 'invalid_link_token' }), 'failed'],
        [new FunctionsFetchError('network'), 'failed']
    ])('maps function errors %#', async (error, expected) => {
        invoke.mockResolvedValue({ data: null, error })
        expect(await requestLineLink('lt')).toEqual({ error: expected })
    })
})
