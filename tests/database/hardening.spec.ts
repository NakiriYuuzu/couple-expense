// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addExpense, alice, asUser, bob, group, otherGroup, outsider, seed, startDatabase } from './fixture'

let db: Awaited<ReturnType<typeof startDatabase>>
beforeAll(async () => { db = await startDatabase() }, 60_000)
afterAll(async () => { await db?.close() }, 30_000)
beforeEach(async () => { await seed(db.admin) })

const readers = [
    ['get_group_balances', ''],
    ['get_simplified_debts', ''],
    ['get_monthly_snapshots', ''],
    ['get_monthly_balances', ", '2026-09'"],
    ['get_monthly_simplified_debts', ", '2026-09'"],
    ['get_expense_months', '']
]

describe('PostgreSQL authorization (real roles, policies and routines)', () => {
    it.each(readers)('rejects a non-member in %s', async (name, extra) => {
        await asUser(db.admin, outsider)
        await expect(db.admin.query(`SELECT * FROM group_expense.${name}($1${extra})`, [group]))
            .rejects.toThrow(/member|authorized|permission/i)
    })

    it('allows active members and internal service callers to read balances', async () => {
        await asUser(db.admin, alice)
        expect((await db.admin.query('SELECT * FROM group_expense.get_group_balances($1)', [group])).rows).toHaveLength(2)
        await asUser(db.admin, null, 'service_role')
        expect((await db.admin.query('SELECT * FROM group_expense.get_group_balances($1)', [group])).rows).toHaveLength(2)
    })

    it('reads the member roster without recursive RLS and only exposes the current group', async () => {
        await asUser(db.admin, bob)
        const groups = await db.admin.query('SELECT id FROM group_expense.groups')
        expect(groups.rows).toEqual([{ id: group }])
        const members = await db.admin.query('SELECT user_id FROM group_expense.group_members ORDER BY user_id')
        expect(members.rows).toEqual([{ user_id: alice }, { user_id: bob }])
        const settings = await db.admin.query('SELECT group_id FROM group_expense.group_settings')
        expect(settings.rows).toEqual([{ group_id: group }])
    })

    it('does not let a member promote themselves or join a group by direct table writes', async () => {
        await asUser(db.admin, bob)
        await expect(db.admin.query("UPDATE group_expense.group_members SET role='owner' WHERE user_id=$1", [bob]))
            .rejects.toThrow(/permission|policy/i)
        await expect(db.admin.query('INSERT INTO group_expense.group_members(group_id,user_id) VALUES ($1,$2)', [otherGroup, bob]))
            .rejects.toThrow(/permission|policy/i)
    })

    it('does not expose the Vault helper or internal batch routines to application roles', async () => {
        for (const role of ['anon', 'authenticated']) {
            const result = await db.admin.query(`SELECT proname, has_function_privilege($1, p.oid, 'EXECUTE') AS allowed
                FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='group_expense'
                  AND proname IN ('get_send_push_secret','process_recurring_expenses','create_monthly_snapshot')`, [role])
            expect(result.rows).toHaveLength(3)
            expect(result.rows.every(row => row.allowed === false)).toBe(true)
        }
        await asUser(db.admin, alice)
        await expect(db.admin.query("SELECT group_expense.get_send_push_secret('test-placeholder')"))
            .rejects.toThrow(/permission/i)
    })
})

describe('PostgreSQL split conservation', () => {
    it('rejects duplicate users before persisting an expense', async () => {
        await asUser(db.admin, alice)
        await expect(addExpense(db.admin, [{ user_id: bob, amount: 50 }, { user_id: bob, amount: 50 }]))
            .rejects.toThrow(/duplicate/i)
        await db.admin.query('RESET ROLE')
        expect((await db.admin.query('SELECT count(*)::int AS count FROM group_expense.expenses')).rows[0].count).toBe(0)
    })

    it.each([
        [[{ user_id: bob, amount: -100 }], -100],
        [[{ user_id: outsider, amount: 100 }], 100],
        [[{ user_id: bob, amount: null }], 100]
    ])('rejects invalid amounts or non-member participants (%j)', async (splits, amount) => {
        await asUser(db.admin, alice)
        await expect(addExpense(db.admin, splits, amount as number)).rejects.toThrow()
    })

    it('distributes remainder cents in automatic equal splitting', async () => {
        await db.admin.query('INSERT INTO group_expense.group_members(group_id,user_id) VALUES ($1,$2)', [group, outsider])
        await asUser(db.admin, alice)
        const id = await addExpense(db.admin)
        await db.admin.query('RESET ROLE')
        const result = await db.admin.query('SELECT amount FROM group_expense.expense_splits WHERE expense_id=$1 ORDER BY amount', [id])
        expect(result.rows.map(row => Number(row.amount))).toEqual([33.33, 33.33, 33.34])
    })
})

describe('PostgreSQL settlement concurrency', () => {
    it('serializes simultaneous monthly payments before checking the outstanding balance', async () => {
        await asUser(db.admin, alice)
        await addExpense(db.admin, [{ user_id: bob, amount: 100 }])
        await db.admin.query('RESET ROLE')
        // Hold inserts so both requests reach a real database lock. Without the group lock,
        // both validate the same 100 balance before either insert commits.
        await db.admin.query(`CREATE FUNCTION private.test_hold_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN PERFORM pg_advisory_xact_lock(987654321); RETURN NEW; END $$;
            CREATE TRIGGER test_hold_settlement BEFORE INSERT ON group_expense.settlements
            FOR EACH ROW EXECUTE FUNCTION private.test_hold_settlement();
            SELECT pg_advisory_lock(987654321);`)
        const first = await db.connect()
        const second = await db.connect()
        await first.query("SET application_name='ledger-test-first'")
        await second.query("SET application_name='ledger-test-second'")
        await asUser(first, bob)
        await asUser(second, bob)
        const query = 'SELECT group_expense.settle_monthly_debt($1,$2,100,NULL,\'2026-09\')'
        const results = Promise.allSettled([first.query(query, [group, alice]), second.query(query, [group, alice])])
        try {
            await expect.poll(async () => {
                const state = await db.admin.query(`SELECT count(*)::int AS count FROM pg_stat_activity
                    WHERE application_name IN ('ledger-test-first','ledger-test-second') AND wait_event_type='Lock'`)
                return state.rows[0].count
            }, { timeout: 3000, interval: 10 }).toBe(2)
        } finally {
            await db.admin.query('SELECT pg_advisory_unlock(987654321)')
        }
        const outcomes = await results
        await db.admin.query('DROP TRIGGER test_hold_settlement ON group_expense.settlements; DROP FUNCTION private.test_hold_settlement()')
        expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
        expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
        const total = await db.admin.query('SELECT sum(amount)::text AS amount FROM group_expense.settlements')
        expect(Number(total.rows[0].amount)).toBe(100)
    })
})
