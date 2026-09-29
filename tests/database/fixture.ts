import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

export const alice = '00000000-0000-0000-0000-000000000001'
export const bob = '00000000-0000-0000-0000-000000000002'
export const outsider = '00000000-0000-0000-0000-000000000003'
export const group = '10000000-0000-0000-0000-000000000001'
export const otherGroup = '10000000-0000-0000-0000-000000000002'

export async function startDatabase() {
    const directory = await mkdtemp(join(tmpdir(), 'couple-expense-test-'))
    const socket = createServer()
    await new Promise<void>((resolve, reject) => {
        socket.once('error', reject)
        socket.listen(0, '127.0.0.1', resolve)
    })
    const address = socket.address()
    if (!address || typeof address === 'string') throw new Error('No test database port')
    await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
    const database = new EmbeddedPostgres({
        databaseDir: join(directory, 'data'),
        port: address.port,
        user: 'postgres',
        password: randomUUID(),
        authMethod: 'scram-sha-256',
        persistent: false,
        createPostgresUser: false,
        postgresFlags: ['-h', '127.0.0.1', '-k', directory],
        onLog: () => {},
        onError: () => {}
    })
    const clients: Client[] = []
    async function connect() {
        const client = database.getPgClient('postgres', '127.0.0.1')
        await client.connect()
        clients.push(client)
        return client
    }
    async function close() {
        await Promise.all(clients.map(client => client.end()))
        await database.stop()
        await rm(directory, { recursive: true, force: true })
    }
    try {
        await database.initialise()
        await database.start()
        const admin = await connect()
        await admin.query(`
            CREATE ROLE anon NOLOGIN;
            CREATE ROLE authenticated NOLOGIN;
            CREATE ROLE service_role NOLOGIN BYPASSRLS;
            CREATE SCHEMA auth;
            CREATE TABLE auth.users (id uuid PRIMARY KEY);
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
                SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
            $$;
            CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
                SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
            $$;
            GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
        `)
        const snapshot = await readFile(new URL('../../schema.sql', import.meta.url), 'utf8')
        const cronStart = snapshot.indexOf('-- Cron\n')
        const grantsStart = snapshot.indexOf('-- Grants\n')
        if (cronStart < 0 || grantsStart < cronStart) throw new Error('Snapshot section markers changed')
        // Platform HTTP/cron are excluded, not ledger/RLS/routine bodies. No external services are contacted.
        const localSchema = (snapshot.slice(0, cronStart) + snapshot.slice(grantsStart))
            .replace(/^CREATE EXTENSION IF NOT EXISTS (pg_net|pg_cron);$/gm, '')
        const policyStart = localSchema.indexOf('-- RLS policies\n')
        if (policyStart < 0) throw new Error('Snapshot RLS section marker changed')
        // Simulate legacy broad grants before, not after, the hardening revokes.
        await admin.query(localSchema.slice(0, policyStart))
        await admin.query(`
            GRANT USAGE ON SCHEMA group_expense TO anon, authenticated, service_role;
            GRANT ALL ON ALL TABLES IN SCHEMA group_expense TO authenticated, service_role;
        `)
        await admin.query(localSchema.slice(policyStart))
        return { admin, connect, close }
    } catch (error) {
        await close()
        throw error
    }
}

export async function asUser(client: Client, userId: string | null, role = 'authenticated') {
    await client.query('RESET ROLE')
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userId, role })])
    if (!['authenticated', 'anon', 'service_role'].includes(role)) throw new Error('Invalid test role')
    await client.query(`SET ROLE ${role}`)
}

export async function seed(client: Client) {
    await client.query('RESET ROLE')
    await client.query("SELECT set_config('request.jwt.claims', '{}', false)")
    await client.query('TRUNCATE auth.users, group_expense.groups CASCADE')
    await client.query('INSERT INTO auth.users(id) VALUES ($1),($2),($3)', [alice, bob, outsider])
    await client.query(`
        INSERT INTO group_expense.groups(id,name,created_by) VALUES ($1,'Household',$3),($2,'Other',$4);
    `, [group, otherGroup, alice, outsider])
    await client.query('INSERT INTO group_expense.group_settings(group_id) VALUES ($1),($2)', [group, otherGroup])
    await client.query(`INSERT INTO group_expense.group_members(group_id,user_id,role) VALUES
        ($1,$3,'owner'),($1,$4,'member'),($2,$5,'owner')`, [group, otherGroup, alice, bob, outsider])
}

export async function addExpense(client: Client, splits: unknown = null, amount = 100) {
    const result = await client.query(`SELECT group_expense.add_group_expense(
        p_group_id => $1, p_title => 'Dinner', p_amount => $2, p_category => 'food',
        p_date => '2026-09-28', p_paid_by => $3, p_splits => $4::jsonb
    ) AS id`, [group, amount, alice, splits === null ? null : JSON.stringify(splits)])
    return result.rows[0].id as string
}
