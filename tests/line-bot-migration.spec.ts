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
    migrations = await Promise.all(['line-bot-01-webhook.sql', 'line-bot-02-link.sql', 'line-bot-03-drafts.sql', 'line-bot-04-queries.sql', 'line-bot-05-notifications.sql', 'line-bot-06-draft-options.sql'].map(name =>
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

describe('line-bot menu queries (acting as the bound user)', () => {
    const dave = '00000000-0000-0000-0000-000000000011'
    const erin = '00000000-0000-0000-0000-000000000012'
    const frank = '00000000-0000-0000-0000-000000000013'
    const trip = '20000000-0000-0000-0000-000000000011'

    async function rows(query: string, params: unknown[] = []) {
        return (await admin.query(query, params)).rows
    }

    beforeAll(async () => {
        await admin.query(`
            INSERT INTO auth.users VALUES ('${dave}'), ('${erin}'), ('${frank}');
            INSERT INTO group_expense.user_profiles (id, email, display_name) VALUES
                ('${dave}', 'dave@example.com', 'Dave'),
                ('${erin}', 'erin@example.com', NULL),
                ('${frank}', 'frank@example.com', 'Frank');
            INSERT INTO group_expense.groups (id, name, created_by) VALUES ('${trip}', '旅行', '${dave}');
            INSERT INTO group_expense.group_members (group_id, user_id, joined_at) VALUES
                ('${trip}', '${dave}', '2024-01-01'), ('${trip}', '${erin}', '2024-01-02');
            INSERT INTO line_bot.identities (line_user_id, user_id) VALUES
                ('U-dave', '${dave}'), ('U-erin', '${erin}'), ('U-frank', '${frank}');
        `)
        await admin.query(`
            WITH d AS (SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date AS this_month),
            inserted AS (
                INSERT INTO group_expense.expenses (id, user_id, group_id, title, amount, category, date, currency, paid_by, created_at)
                SELECT v.id::uuid, v.owner::uuid, v.grp::uuid, v.title, v.amount, v.category,
                       CASE WHEN v.last_month THEN (d.this_month - interval '1 month')::date ELSE d.this_month + 1 END,
                       v.currency, v.owner::uuid, now() - v.age * interval '1 minute'
                FROM d, (VALUES
                    ('40000000-0000-0000-0000-000000000001', '${dave}', '${trip}', '住宿', 300, 'home', false, 'TWD', 3),
                    ('40000000-0000-0000-0000-000000000002', '${erin}', '${trip}', '高鐵', 100, 'transport', true, 'TWD', 2),
                    ('40000000-0000-0000-0000-000000000003', '${erin}', '${trip}', '晚餐', 80, 'food', false, 'TWD', 1),
                    ('40000000-0000-0000-0000-000000000004', '${dave}', NULL, '早餐', 50, 'food', false, 'TWD', 0),
                    ('40000000-0000-0000-0000-000000000005', '${dave}', NULL, 'App Store', 10, 'other', false, 'USD', 0),
                    ('40000000-0000-0000-0000-000000000006', '${frank}', NULL, '秘密', 999, 'other', false, 'TWD', 0)
                ) AS v(id, owner, grp, title, amount, category, last_month, currency, age)
                RETURNING id
            )
            INSERT INTO group_expense.expense_splits (expense_id, user_id, amount) VALUES
                ('40000000-0000-0000-0000-000000000001', '${dave}', 150), ('40000000-0000-0000-0000-000000000001', '${erin}', 150),
                ('40000000-0000-0000-0000-000000000002', '${dave}', 50), ('40000000-0000-0000-0000-000000000002', '${erin}', 50),
                ('40000000-0000-0000-0000-000000000003', '${dave}', 40), ('40000000-0000-0000-0000-000000000003', '${erin}', 40)
        `)
    })

    async function expectRoleRestored() {
        expect((await rows("SELECT current_user AS u, current_setting('request.jwt.claims', true) AS c"))[0])
            .toEqual({ u: 'postgres', c: '' })
    }

    it('reports the personal ledger by default and a group after switching', async () => {
        expect(await rows('SELECT group_id, name FROM line_bot.current_ledger($1)', ['U-dave'])).toEqual([{ group_id: null, name: null }])
        await admin.query('SELECT line_bot.set_ledger($1, $2)', ['U-erin', trip])
        expect(await rows('SELECT group_id, name FROM line_bot.current_ledger($1)', ['U-erin'])).toEqual([{ group_id: trip, name: '旅行' }])
        expect(await rows('SELECT * FROM line_bot.current_ledger($1)', ['U-unknown'])).toEqual([])
    })

    it('lists personal expenses plus the user share of group expenses, like the web app', async () => {
        const result = await rows('SELECT title, amount, total_amount, group_name, paid_by_me FROM line_bot.recent_expenses($1, 0, 10)', ['U-dave'])
        expect(result.map(r => [r.title, r.amount, r.total_amount, r.group_name, r.paid_by_me]).sort()).toEqual([
            ['App Store', '10', '10', null, true],
            ['住宿', '150', '300', '旅行', true],
            ['早餐', '50', '50', null, true],
            ['晚餐', '40', '80', '旅行', false],
            ['高鐵', '50', '100', '旅行', false]
        ])
        expect(await rows('SELECT title FROM line_bot.recent_expenses($1, 0, 10)', ['U-frank'])).toEqual([{ title: '秘密' }])
        await expectRoleRestored()
    })

    it('lists group expenses with payer names and pages them', async () => {
        const all = await rows('SELECT title, amount, payer_name, paid_by_me, expense_date FROM line_bot.recent_expenses($1, 0, 10)', ['U-erin'])
        expect(all.map(r => [r.title, r.payer_name, r.paid_by_me])).toEqual([
            ['晚餐', 'erin', true],
            ['住宿', 'Dave', false],
            ['高鐵', 'erin', true]
        ])
        expect(await rows('SELECT title FROM line_bot.recent_expenses($1, 0, 2)', ['U-erin'])).toHaveLength(2)
        expect(await rows('SELECT title FROM line_bot.recent_expenses($1, 2, 2)', ['U-erin'])).toEqual([{ title: '高鐵' }])
        await expectRoleRestored()
    })

    it('summarises this month and last month in TWD only', async () => {
        // 個人帳本：早餐 50 ＋ 群組分攤（住宿 150、晚餐 40、上月高鐵 50）；USD 不計
        expect(await rows('SELECT * FROM line_bot.month_summary($1)', ['U-dave'])).toEqual([
            { category: 'home', this_month: '150', last_month: '0' },
            { category: 'food', this_month: '90', last_month: '0' },
            { category: 'transport', this_month: '0', last_month: '50' }
        ])
        expect(await rows('SELECT * FROM line_bot.month_summary($1)', ['U-erin'])).toEqual([
            { category: 'home', this_month: '300', last_month: '0' },
            { category: 'food', this_month: '80', last_month: '0' },
            { category: 'transport', this_month: '0', last_month: '100' }
        ])
        await expectRoleRestored()
    })

    it('shows group debts from the viewpoint of the user', async () => {
        // Dave 付 300、分攤 150+50+40=240 → +60；Erin 付 180、分攤 240 → -60
        expect(await rows('SELECT * FROM line_bot.ledger_debts($1)', ['U-erin'])).toEqual([
            { from_name: 'erin', to_name: 'Dave', amount: '60', from_me: true, to_me: false }
        ])
        expect(await rows('SELECT * FROM line_bot.ledger_debts($1)', ['U-dave'])).toEqual([])
        await expectRoleRestored()
    })

    it('ignores a stale ledger the user no longer belongs to', async () => {
        await admin.query('UPDATE line_bot.identities SET ledger_group_id = $1 WHERE line_user_id = $2', [trip, 'U-frank'])
        expect(await rows('SELECT group_id FROM line_bot.current_ledger($1)', ['U-frank'])).toEqual([{ group_id: null }])
        expect(await rows('SELECT title FROM line_bot.recent_expenses($1, 0, 10)', ['U-frank'])).toEqual([{ title: '秘密' }])
        expect(await rows('SELECT * FROM line_bot.ledger_debts($1)', ['U-frank'])).toEqual([])
    })

    it.each(['anon', 'authenticated'])('denies %s the query functions', async role => {
        for (const query of [
            "SELECT * FROM line_bot.recent_expenses('U-dave', 0, 10)",
            "SELECT * FROM line_bot.month_summary('U-dave')",
            "SELECT * FROM line_bot.ledger_debts('U-dave')"
        ]) {
            await admin.query('BEGIN')
            try {
                await admin.query(`SET LOCAL ROLE ${role}`)
                await expect(admin.query(query)).rejects.toThrow(/permission denied/)
            } finally {
                await admin.query('ROLLBACK')
            }
        }
    })
})

describe('line-bot group expense notifications', () => {
    const creator = '00000000-0000-0000-0000-000000000021'
    const partner = '00000000-0000-0000-0000-000000000022'
    const blocked = '00000000-0000-0000-0000-000000000023'
    const optedOut = '00000000-0000-0000-0000-000000000024'
    const unbound = '00000000-0000-0000-0000-000000000025'
    const former = '00000000-0000-0000-0000-000000000026'
    const home = '20000000-0000-0000-0000-000000000021'

    async function rows(query: string, params: unknown[] = []) {
        return (await admin.query(query, params)).rows
    }

    /** 以 creator 身分經 add_group_expense 新增（與 App／Bot 相同路徑），整個交易提交後才觸發通知。 */
    async function addGroupExpense(client: Client, title: string, amount: number) {
        await client.query('BEGIN')
        await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: creator, role: 'authenticated' })])
        await client.query('SET LOCAL ROLE authenticated')
        const { rows: [row] } = await client.query(
            `SELECT group_expense.add_group_expense($1, $2, $3, 'food', 'restaurant', CURRENT_DATE, 'TWD', 'equal', $4, NULL, $5) AS id`,
            [home, title, amount, creator, JSON.stringify([
                { user_id: creator, amount: amount / 2 },
                { user_id: partner, amount: amount / 2 }
            ])]
        )
        return row.id as string
    }

    beforeAll(async () => {
        await admin.query(`
            INSERT INTO auth.users VALUES ('${creator}'), ('${partner}'), ('${blocked}'), ('${optedOut}'), ('${unbound}'), ('${former}');
            INSERT INTO group_expense.user_profiles (id, email, display_name) VALUES ('${creator}', 'kuri@example.com', 'Kuri');
            INSERT INTO group_expense.groups (id, name, created_by) VALUES ('${home}', '我們的家庭', '${creator}');
            INSERT INTO group_expense.group_members (group_id, user_id, is_active) VALUES
                ('${home}', '${creator}', true), ('${home}', '${partner}', true), ('${home}', '${blocked}', true),
                ('${home}', '${optedOut}', true), ('${home}', '${unbound}', true), ('${home}', '${former}', false);
            INSERT INTO line_bot.identities (line_user_id, user_id, is_following) VALUES
                ('U-creator', '${creator}', true), ('U-partner', '${partner}', true), ('U-blocked', '${blocked}', false),
                ('U-opted-out', '${optedOut}', true), ('U-former', '${former}', true);
            INSERT INTO group_expense.user_settings (user_id, notification_prefs) VALUES
                ('${optedOut}', '{"split_assigned": false}'), ('${partner}', '{"split_assigned": true}');
        `)
    })

    it('notifies only other active, bound, following members who did not opt out, after commit', async () => {
        const client = database.getPgClient('postgres', '127.0.0.1')
        await client.connect()
        try {
            const expenseId = await addGroupExpense(client, '全聯', 300)
            await client.query('RESET ROLE')
            // deferred trigger：提交前還沒有通知
            expect((await client.query('SELECT count(*)::int AS n FROM line_bot.notification_outbox WHERE expense_id = $1', [expenseId])).rows[0].n).toBe(0)
            await client.query('COMMIT')
            expect(await rows('SELECT line_user_id, status FROM line_bot.notification_outbox WHERE expense_id = $1', [expenseId]))
                .toEqual([{ line_user_id: 'U-partner', status: 'pending' }])
        } finally {
            await client.end()
        }
    })

    it('does not notify for personal expenses or rolled back inserts', async () => {
        const before = (await rows('SELECT count(*)::int AS n FROM line_bot.notification_outbox'))[0].n
        await admin.query(`INSERT INTO group_expense.expenses (user_id, title, amount, category) VALUES ('${creator}', '個人', 10, 'other')`)
        const client = database.getPgClient('postgres', '127.0.0.1')
        await client.connect()
        try {
            await addGroupExpense(client, '反悔', 100)
            await client.query('ROLLBACK')
        } finally {
            await client.end()
        }
        expect((await rows('SELECT count(*)::int AS n FROM line_bot.notification_outbox'))[0].n).toBe(before)
    })

    it('claims with the message details and the recipient share, never twice', async () => {
        const [first] = await rows(`SELECT * FROM line_bot.claim_notifications(10) WHERE line_user_id = 'U-partner'`)
        expect(first).toMatchObject({
            group_name: '我們的家庭', creator_name: 'Kuri', title: '全聯', amount: '300', currency: 'TWD',
            category: 'food', my_share: '150', recipient_active: true, attempts: 1
        })
        expect(await rows('SELECT * FROM line_bot.claim_notifications(10)')).toEqual([])

        await admin.query("SELECT line_bot.finish_notification($1, 'sent', NULL)", [first.id])
        expect((await rows('SELECT status, sent_at IS NOT NULL AS sent FROM line_bot.notification_outbox WHERE id = $1', [first.id]))[0])
            .toEqual({ status: 'sent', sent: true })
        // 已完成的不能再被改狀態
        await admin.query("SELECT line_bot.finish_notification($1, 'retry', 'late')", [first.id])
        expect((await rows('SELECT status FROM line_bot.notification_outbox WHERE id = $1', [first.id]))[0].status).toBe('sent')
    })

    it('retries up to five attempts and reclaims interrupted sends', async () => {
        const client = database.getPgClient('postgres', '127.0.0.1')
        await client.connect()
        try {
            await addGroupExpense(client, '水電', 1000)
            await client.query('COMMIT')
        } finally {
            await client.end()
        }
        for (let attempt = 1; attempt <= 5; attempt++) {
            const [claimed] = await rows('SELECT id, attempts FROM line_bot.claim_notifications(10)')
            expect(claimed.attempts).toBe(attempt)
            if (attempt === 3) {
                // 模擬函式在送出途中中斷：5 分鐘後可再次取出
                await admin.query("UPDATE line_bot.notification_outbox SET claimed_at = now() - interval '6 minutes' WHERE id = $1", [claimed.id])
                continue
            }
            await admin.query("SELECT line_bot.finish_notification($1, 'retry', 'HTTP 500')", [claimed.id])
        }
        expect(await rows('SELECT * FROM line_bot.claim_notifications(10)')).toEqual([])
        expect(await rows("SELECT status, attempts, last_error FROM line_bot.notification_outbox WHERE status = 'failed'"))
            .toEqual([{ status: 'failed', attempts: 5, last_error: 'HTTP 500' }])
    })

    it('reports deleted expenses and recipients who left so they can be skipped', async () => {
        const client = database.getPgClient('postgres', '127.0.0.1')
        await client.connect()
        let deleted: string
        try {
            deleted = await addGroupExpense(client, '刪掉', 20)
            await client.query('COMMIT')
            await addGroupExpense(client, '離開', 40)
            await client.query('COMMIT')
        } finally {
            await client.end()
        }
        await admin.query('DELETE FROM group_expense.expenses WHERE id = $1', [deleted])
        await admin.query('UPDATE group_expense.group_members SET is_active = false WHERE group_id = $1 AND user_id = $2', [home, partner])
        try {
            const claimed = await rows('SELECT title, recipient_active FROM line_bot.claim_notifications(10) ORDER BY title NULLS FIRST')
            expect(claimed).toEqual([{ title: null, recipient_active: false }, { title: '離開', recipient_active: false }])
        } finally {
            await admin.query('UPDATE group_expense.group_members SET is_active = true WHERE group_id = $1 AND user_id = $2', [home, partner])
        }
    })

    it.each(['anon', 'authenticated'])('denies %s the notification functions', async role => {
        for (const query of ['SELECT * FROM line_bot.claim_notifications(1)', 'SELECT line_bot.request_notify_drain()']) {
            await admin.query('BEGIN')
            try {
                await admin.query(`SET LOCAL ROLE ${role}`)
                await expect(admin.query(query)).rejects.toThrow(/permission denied/)
            } finally {
                await admin.query('ROLLBACK')
            }
        }
    })
})

describe('line-bot draft options', () => {
    // 沿用前面的 shared 群組：user(U1)、alice(U-alice)、carol 為有效成員，bob 已退出。
    const carol = '00000000-0000-0000-0000-000000000004'
    const shared = '20000000-0000-0000-0000-000000000001'
    const others = '20000000-0000-0000-0000-000000000002'

    async function one(query: string, params: unknown[] = []) {
        return (await admin.query(query, params)).rows[0]
    }
    const createDraft = async (title: string, amount: number) =>
        (await one('SELECT line_bot.create_draft($1, $2, $3) AS id', ['U1', title, amount])).id as string
    const draft = (id: string) => one('SELECT * FROM line_bot.get_draft($1, $2)', ['U1', id])
    const call = async (fn: string, args: unknown[]) =>
        (await one(`SELECT line_bot.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) AS r`, args)).r

    it('applies a category picked on the add card to the next draft only, within 10 minutes', async () => {
        await admin.query('SELECT line_bot.set_ledger($1, NULL)', ['U1'])
        expect(await call('set_pending_category', ['U1', 'food'])).toBe(true)
        expect((await draft(await createDraft('午餐', 120))).category).toBe('food')
        expect((await draft(await createDraft('雜支', 10))).category).toBe('other')

        await call('set_pending_category', ['U1', 'pet'])
        await admin.query("UPDATE line_bot.identities SET pending_category_at = now() - interval '11 minutes' WHERE line_user_id = 'U1'")
        expect((await draft(await createDraft('過期', 10))).category).toBe('other')
        await expect(call('set_pending_category', ['U1', 'bogus'])).rejects.toThrow(/check/)
    })

    it('switches a draft between ledgers and resets the split', async () => {
        const id = await createDraft('換帳本', 90)
        expect(await call('set_draft_ledger', ['U1', id, others])).toBe(false)
        expect(await call('set_draft_ledger', ['U1', id, shared])).toBe(true)
        const grouped = await draft(id)
        expect(grouped.ledger_name).toBe('我們家')
        expect(grouped.members.map((m: { userId: string; isPayer: boolean; isParticipant: boolean; isMe: boolean }) =>
            [m.userId, m.isMe, m.isPayer, m.isParticipant])).toEqual([
            [user, true, true, true], [alice, false, false, true], [carol, false, false, true]
        ])
        expect(await call('set_draft_ledger', ['U1', id, null])).toBe(true)
        expect(await draft(id)).toMatchObject({ ledger_name: null, group_id: null, members: [] })
    })

    it('records "I paid, the other person bears it all"', async () => {
        await admin.query('SELECT line_bot.set_ledger($1, $2)', ['U1', shared])
        const id = await createDraft('代墊', 200)
        expect(await call('set_draft_participants', ['U1', id, 'only', alice])).toBe(true)
        expect(await call('confirm_draft', ['U1', id])).toBe('confirmed')
        const { expense_id: expenseId } = await draft(id)
        expect(await one('SELECT paid_by, user_id FROM group_expense.expenses WHERE id = $1', [expenseId]))
            .toEqual({ paid_by: user, user_id: user })
        expect((await admin.query('SELECT user_id, amount::text FROM group_expense.expense_splits WHERE expense_id = $1', [expenseId])).rows)
            .toEqual([{ user_id: alice, amount: '200.00' }])
    })

    it('records another payer and a chosen set of participants', async () => {
        const id = await createDraft('晚餐', 100)
        expect(await call('set_draft_payer', ['U1', id, alice])).toBe(true)
        expect(await call('set_draft_participants', ['U1', id, 'toggle', carol])).toBe(true)
        expect(await call('set_draft_date', ['U1', id, '2026-01-15'])).toBe(true)
        expect(await call('confirm_draft', ['U1', id])).toBe('confirmed')
        const { expense_id: expenseId } = await draft(id)
        expect(await one('SELECT paid_by, date::text FROM group_expense.expenses WHERE id = $1', [expenseId]))
            .toEqual({ paid_by: alice, date: '2026-01-15' })
        expect((await admin.query('SELECT user_id, amount::text FROM group_expense.expense_splits WHERE expense_id = $1 ORDER BY user_id', [expenseId])).rows)
            .toEqual([{ user_id: user, amount: '50.00' }, { user_id: alice, amount: '50.00' }])
    })

    it('rejects invalid split changes', async () => {
        const id = await createDraft('檢查', 30)
        expect(await call('set_draft_payer', ['U1', id, bob])).toBe(false)
        expect(await call('set_draft_participants', ['U1', id, 'only', bob])).toBe(false)
        expect(await call('set_draft_participants', ['U1', id, 'only', user])).toBe(true)
        // 不能移除最後一位參與者
        expect(await call('set_draft_participants', ['U1', id, 'toggle', user])).toBe(false)
        expect(await call('set_draft_participants', ['U1', id, 'all', null])).toBe(true)
        expect((await draft(id)).members.every((m: { isParticipant: boolean }) => m.isParticipant)).toBe(true)
        expect(await call('set_draft_date', ['U1', id, '2015-01-01'])).toBe(false)
        // 別人的草稿不能改
        expect(await call('set_draft_payer', ['U-alice', id, alice])).toBe(false)
        expect(await call('set_draft_ledger', ['U-alice', id, null])).toBe(false)

        const personal = await createDraft('個人', 10)
        await admin.query('SELECT line_bot.set_draft_ledger($1, $2, NULL)', ['U1', personal])
        expect(await call('set_draft_payer', ['U1', personal, alice])).toBe(false)
    })

    it('fails instead of silently changing shares when a participant left', async () => {
        const id = await createDraft('離開', 60)
        await admin.query('UPDATE group_expense.group_members SET is_active = false WHERE group_id = $1 AND user_id = $2', [shared, carol])
        try {
            expect(await call('confirm_draft', ['U1', id])).toBe('failed')
            expect((await draft(id)).status).toBe('pending')
        } finally {
            await admin.query('UPDATE group_expense.group_members SET is_active = true WHERE group_id = $1 AND user_id = $2', [shared, carol])
        }
    })

    it.each(['anon', 'authenticated'])('denies %s the draft option functions', async role => {
        for (const query of [
            "SELECT line_bot.set_pending_category('U1', 'food')",
            "SELECT line_bot.set_draft_participants('U1', gen_random_uuid(), 'all', NULL)"
        ]) {
            await admin.query('BEGIN')
            try {
                await admin.query(`SET LOCAL ROLE ${role}`)
                await expect(admin.query(query)).rejects.toThrow(/permission denied/)
            } finally {
                await admin.query('ROLLBACK')
            }
        }
    })
})
