// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const user = '00000000-0000-0000-0000-000000000001'
const alice = '00000000-0000-0000-0000-000000000002'
const bob = '00000000-0000-0000-0000-000000000003'
let directory: string
let database: EmbeddedPostgres
let admin: Client
let migrations: string[]

async function freePort() {
    const socket = createServer()
    await new Promise<void>((resolve, reject) => {
        socket.once('error', reject)
        socket.listen(0, '127.0.0.1', resolve)
    })
    const address = socket.address()
    if (!address || typeof address === 'string') throw new Error('No test database port')
    await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
    return address.port
}

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'line-bot-test-'))
    database = new EmbeddedPostgres({
        databaseDir: join(directory, 'data'),
        port: await freePort(),
        user: 'postgres',
        password: randomUUID(),
        authMethod: 'scram-sha-256',
        persistent: false,
        createPostgresUser: false,
        postgresFlags: ['-h', '127.0.0.1', '-k', directory],
        onLog: () => {},
        onError: () => {}
    })
    await database.initialise()
    await database.start()
    admin = database.getPgClient('postgres', '127.0.0.1')
    await admin.connect()
    await admin.query(`
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE SCHEMA auth;
        CREATE TABLE auth.users (id uuid PRIMARY KEY);
        INSERT INTO auth.users VALUES ('${user}'), ('${alice}'), ('${bob}');
        -- 與正式環境相同的 auth.uid()
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
            SELECT coalesce(
                nullif(current_setting('request.jwt.claim.sub', true), ''),
                (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
            )::uuid
        $$;
        GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    `)
    await admin.query(await readFile(new URL('./fixtures/group-expense-live-subset.sql', import.meta.url), 'utf8'))
    migrations = await Promise.all(['line-bot-01-webhook.sql', 'line-bot-02-link.sql', 'line-bot-03-drafts.sql'].map(name =>
        readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')))
    for (const migration of migrations) await admin.query(migration)
}, 60_000)

afterAll(async () => {
    await admin?.end()
    await database?.stop()
    if (directory) await rm(directory, { recursive: true, force: true })
})

describe('line-bot migrations', () => {
    it('can be re-run', async () => {
        for (const migration of migrations) await expect(admin.query(migration)).resolves.toBeDefined()
    })

    it('deduplicates webhook events with the same id', async () => {
        const insert = `
            INSERT INTO line_bot.webhook_events (webhook_event_id, event_type, line_user_id)
            VALUES ('evt-1', 'message', 'U1')
            ON CONFLICT (webhook_event_id) DO NOTHING RETURNING 1`
        expect((await admin.query(insert)).rowCount).toBe(1)
        expect((await admin.query(insert)).rowCount).toBe(0)
    })

    it('maps one LINE account to one existing user only', async () => {
        await admin.query(`INSERT INTO line_bot.identities (line_user_id, user_id) VALUES ('U1', '${user}')`)
        await expect(admin.query(`INSERT INTO line_bot.identities (line_user_id, user_id) VALUES ('U2', '${user}')`))
            .rejects.toThrow(/duplicate key/)
        await expect(admin.query(`INSERT INTO line_bot.identities (line_user_id, user_id) VALUES ('U3', '${randomUUID()}')`))
            .rejects.toThrow(/foreign key/)
    })

    it.each([
        ['anon', 'SELECT * FROM line_bot.identities'],
        ['authenticated', 'SELECT * FROM line_bot.identities'],
        ['anon', "SELECT line_bot.complete_link('U', 'h')"],
        ['authenticated', "SELECT line_bot.complete_link('U', 'h')"]
    ])('denies %s: %s', async (role, query) => {
        await admin.query('BEGIN')
        try {
            await admin.query(`SET LOCAL ROLE ${role}`)
            await expect(admin.query(query)).rejects.toThrow(/permission denied/)
        } finally {
            await admin.query('ROLLBACK')
        }
    })
})

describe('line_bot.complete_link', () => {
    async function saveNonce(hash: string, userId: string, expiresIn = '10 minutes') {
        await admin.query(
            `INSERT INTO line_bot.link_nonces (nonce_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)`,
            [hash, userId, expiresIn]
        )
    }

    async function completeLink(lineUserId: string, hash: string) {
        const { rows } = await admin.query('SELECT line_bot.complete_link($1, $2) AS result', [lineUserId, hash])
        return rows[0].result
    }

    async function boundUser(lineUserId: string) {
        const { rows } = await admin.query('SELECT user_id FROM line_bot.identities WHERE line_user_id = $1', [lineUserId])
        return rows[0]?.user_id ?? null
    }

    it('links once and rejects reusing the same nonce', async () => {
        await saveNonce('h-alice', alice)
        expect(await completeLink('U-alice', 'h-alice')).toBe('linked')
        expect(await boundUser('U-alice')).toBe(alice)
        expect(await completeLink('U-attacker', 'h-alice')).toBe('invalid_nonce')
        expect(await boundUser('U-attacker')).toBeNull()
    })

    it('rejects unknown and expired nonces', async () => {
        await saveNonce('h-expired', bob, '-1 second')
        expect(await completeLink('U-bob', 'h-unknown')).toBe('invalid_nonce')
        expect(await completeLink('U-bob', 'h-expired')).toBe('invalid_nonce')
        expect(await boundUser('U-bob')).toBeNull()
    })

    it('treats relinking the same pair as success', async () => {
        await saveNonce('h-alice-again', alice)
        expect(await completeLink('U-alice', 'h-alice-again')).toBe('linked')
    })

    it('never rebinds an existing LINE account or user', async () => {
        await saveNonce('h-bob-to-alice-line', bob)
        expect(await completeLink('U-alice', 'h-bob-to-alice-line')).toBe('line_already_bound')
        await saveNonce('h-alice-to-new-line', alice)
        expect(await completeLink('U-new', 'h-alice-to-new-line')).toBe('user_already_bound')
        expect(await boundUser('U-alice')).toBe(alice)
        expect(await boundUser('U-new')).toBeNull()
    })
})

describe('line-bot drafts (acting as the bound user)', () => {
    // U1 → user、U-alice → alice（前面的測試已綁定）
    const carol = '00000000-0000-0000-0000-000000000004'
    const shared = '20000000-0000-0000-0000-000000000001'
    const others = '20000000-0000-0000-0000-000000000002'
    const closed = '20000000-0000-0000-0000-000000000003'

    async function one(query: string, params: unknown[] = []) {
        const { rows } = await admin.query(query, params)
        return rows[0]
    }

    const createDraft = async (lineUserId: string, title: string, amount: number) =>
        (await one('SELECT line_bot.create_draft($1, $2, $3) AS id', [lineUserId, title, amount])).id as string
    const confirm = async (lineUserId: string, draftId: string, client = admin) =>
        (await client.query('SELECT line_bot.confirm_draft($1, $2) AS r', [lineUserId, draftId])).rows[0].r as string
    const expensesOf = async (draftId: string) => (await admin.query(
        `SELECT e.* FROM group_expense.expenses e JOIN line_bot.drafts d ON d.expense_id = e.id WHERE d.id = $1`, [draftId])).rows

    beforeAll(async () => {
        await admin.query(`
            INSERT INTO group_expense.groups (id, name, created_by, is_active) VALUES
                ('${shared}', '我們家', '${user}', true),
                ('${others}', '別人的群組', '${bob}', true),
                ('${closed}', '已關閉', '${user}', false);
            INSERT INTO group_expense.group_members (group_id, user_id, is_active, joined_at) VALUES
                ('${shared}', '${user}', true, '2024-01-01'),
                ('${shared}', '${alice}', true, '2024-01-02'),
                ('${shared}', '${carol}', true, '2024-01-03'),
                ('${shared}', '${bob}', false, '2024-01-04'),
                ('${others}', '${bob}', true, '2024-01-01'),
                ('${closed}', '${user}', true, '2024-01-01');
        `)
    })

    it('lists only active groups where the user is an active member', async () => {
        const { rows } = await admin.query('SELECT * FROM line_bot.list_ledgers($1)', ['U1'])
        expect(rows).toEqual([{ group_id: shared, name: '我們家', is_current: false }])
    })

    it('switches ledgers only to groups the user belongs to', async () => {
        expect((await one('SELECT line_bot.set_ledger($1, $2) AS ok', ['U1', others])).ok).toBe(false)
        expect((await one('SELECT line_bot.set_ledger($1, $2) AS ok', ['U1', closed])).ok).toBe(false)
        expect((await one('SELECT line_bot.set_ledger($1, $2) AS ok', ['U1', shared])).ok).toBe(true)
        expect((await one('SELECT line_bot.set_ledger($1, NULL) AS ok', ['U1'])).ok).toBe(true)
        expect((await one('SELECT ledger_group_id FROM line_bot.identities WHERE line_user_id = $1', ['U1'])).ledger_group_id).toBeNull()
    })

    it('records a personal expense once, as the user, even when confirmed twice', async () => {
        const draftId = await createDraft('U1', '午餐', 120)
        expect((await one('SELECT line_bot.set_draft_category($1, $2, $3) AS ok', ['U1', draftId, 'food'])).ok).toBe(true)
        expect(await confirm('U1', draftId)).toBe('confirmed')
        expect(await confirm('U1', draftId)).toBe('already_confirmed')

        const expenses = await expensesOf(draftId)
        expect(expenses).toHaveLength(1)
        expect(expenses[0]).toMatchObject({
            user_id: user, group_id: null, title: '午餐', amount: '120.00',
            category: 'food', icon: 'restaurant', paid_by: user, currency: 'TWD'
        })
        const today = (await one("SELECT (now() AT TIME ZONE 'Asia/Taipei')::date::text AS d")).d
        expect((await one('SELECT date::text AS d FROM group_expense.expenses WHERE id = $1', [expenses[0].id])).d).toBe(today)
        // 身分切換不會殘留到後續查詢
        expect(await one("SELECT current_user AS u, current_setting('request.jwt.claims', true) AS c")).toEqual({ u: 'postgres', c: '' })
    })

    it('inserts only one expense when two confirmations race', async () => {
        const draftId = await createDraft('U1', '晚餐', 300)
        const second = database.getPgClient('postgres', '127.0.0.1')
        await second.connect()
        try {
            const results = await Promise.all([confirm('U1', draftId), confirm('U1', draftId, second)])
            expect(results.sort()).toEqual(['already_confirmed', 'confirmed'])
            expect(await expensesOf(draftId)).toHaveLength(1)
        } finally {
            await second.end()
        }
    })

    it('splits a group expense equally among active members in cents', async () => {
        await admin.query('SELECT line_bot.set_ledger($1, $2)', ['U1', shared])
        const draftId = await createDraft('U1', '全聯', 100)
        expect((await one('SELECT ledger_name FROM line_bot.get_draft($1, $2)', ['U1', draftId])).ledger_name).toBe('我們家')
        expect(await confirm('U1', draftId)).toBe('confirmed')

        const [expense] = await expensesOf(draftId)
        expect(expense).toMatchObject({ user_id: user, group_id: shared, paid_by: user, split_method: 'equal', icon: 'package' })
        const { rows } = await admin.query(
            'SELECT user_id, amount::text FROM group_expense.expense_splits WHERE expense_id = $1 ORDER BY amount DESC, user_id', [expense.id])
        expect(rows).toEqual([
            { user_id: user, amount: '33.34' },
            { user_id: alice, amount: '33.33' },
            { user_id: carol, amount: '33.33' }
        ])
    })

    it('fails without writing when the user lost membership, and falls back to personal for new drafts', async () => {
        await admin.query('SELECT line_bot.set_ledger($1, $2)', ['U-alice', shared])
        const draftId = await createDraft('U-alice', '電影', 500)
        await admin.query('UPDATE group_expense.group_members SET is_active = false WHERE group_id = $1 AND user_id = $2', [shared, alice])
        try {
            expect(await confirm('U-alice', draftId)).toBe('failed')
            expect((await one('SELECT status, expense_id FROM line_bot.drafts WHERE id = $1', [draftId])))
                .toEqual({ status: 'pending', expense_id: null })
            expect(await one("SELECT current_user AS u, current_setting('request.jwt.claims', true) AS c")).toEqual({ u: 'postgres', c: '' })

            const personalDraft = await createDraft('U-alice', '咖啡', 80)
            expect((await one('SELECT ledger_name FROM line_bot.get_draft($1, $2)', ['U-alice', personalDraft])).ledger_name).toBeNull()
        } finally {
            await admin.query('UPDATE group_expense.group_members SET is_active = true WHERE group_id = $1 AND user_id = $2', [shared, alice])
        }
    })

    it("never exposes or confirms another user's draft", async () => {
        const draftId = await createDraft('U1', '私人', 10)
        expect((await admin.query('SELECT * FROM line_bot.get_draft($1, $2)', ['U-alice', draftId])).rows).toEqual([])
        expect((await one('SELECT line_bot.set_draft_category($1, $2, $3) AS ok', ['U-alice', draftId, 'pet'])).ok).toBe(false)
        expect((await one('SELECT line_bot.cancel_draft($1, $2) AS ok', ['U-alice', draftId])).ok).toBe(false)
        expect(await confirm('U-alice', draftId)).toBe('not_found')
        expect(await expensesOf(draftId)).toHaveLength(0)
    })

    it('does not confirm cancelled or expired drafts', async () => {
        const cancelled = await createDraft('U1', '取消', 10)
        expect((await one('SELECT line_bot.cancel_draft($1, $2) AS ok', ['U1', cancelled])).ok).toBe(true)
        expect(await confirm('U1', cancelled)).toBe('cancelled')

        const expired = await createDraft('U1', '過期', 10)
        await admin.query("UPDATE line_bot.drafts SET expires_at = now() - interval '1 second' WHERE id = $1", [expired])
        expect(await confirm('U1', expired)).toBe('expired')
        expect((await one('SELECT line_bot.set_draft_category($1, $2, $3) AS ok', ['U1', expired, 'pet'])).ok).toBe(false)
    })

    it('rejects invalid drafts at the table level', async () => {
        await expect(createDraft('U1', '負數', -1)).rejects.toThrow(/check/)
        await expect(createDraft('U1', 'x'.repeat(51), 1)).rejects.toThrow(/check/)
        const draftId = await createDraft('U1', '分類', 1)
        await expect(admin.query('SELECT line_bot.set_draft_category($1, $2, $3)', ['U1', draftId, 'bogus'])).rejects.toThrow(/check/)
    })
})
