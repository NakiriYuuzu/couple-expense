// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Execute the actual Deno entrypoint without importing the remote SDK or starting a server.
const source = readFileSync(new URL('../supabase/functions/process-recurring/index.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const serviceKey = 'test-only-service-key'
const rpc = vi.fn()
const createClient = vi.fn(() => ({ rpc }))
let handler: (request: Request) => Promise<Response>

beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: 2, error: null })
    createClient.mockClear()
    const environment: Record<string, string> = {
        SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: serviceKey
    }
    runInNewContext(compiled, {
        exports: {},
        require: (name: string) => {
            if (name !== 'https://esm.sh/@supabase/supabase-js@2') throw new Error(`Unexpected import: ${name}`)
            return { createClient }
        },
        Response,
        console: { error: vi.fn() },
        Deno: {
            env: { get: (name: string) => environment[name] },
            serve: (callback: typeof handler) => { handler = callback }
        }
    })
})

describe('process-recurring internal authorization', () => {
    it.each([undefined, 'Bearer ordinary-user-jwt', 'Bearer test-only-service-key-extra'])('rejects an unauthorized caller (%s) before creating the privileged client', async (authorization) => {
        const response = await handler(new Request('https://example.invalid', {
            method: 'POST',
            headers: authorization ? { Authorization: authorization } : {}
        }))
        expect(response.status).toBe(401)
        expect(createClient).not.toHaveBeenCalled()
        expect(rpc).not.toHaveBeenCalled()
    })

    it('allows the exact internal service credential', async () => {
        const response = await handler(new Request('https://example.invalid', {
            method: 'POST',
            headers: { Authorization: `Bearer ${serviceKey}` }
        }))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ processed: 2 })
        expect(rpc).toHaveBeenCalledExactlyOnceWith('process_recurring_expenses')
    })
})
