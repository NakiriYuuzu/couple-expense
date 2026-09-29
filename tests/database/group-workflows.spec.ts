// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addExpense, alice, asUser, bob, group, outsider, seed, startDatabase } from './fixture'

let db: Awaited<ReturnType<typeof startDatabase>>
beforeAll(async () => { db = await startDatabase() }, 60_000)
afterAll(async () => { await db?.close() }, 30_000)
beforeEach(async () => { await seed(db.admin) })

describe('group workflow compatibility after RLS hardening', () => {
    it('creates an owner and settings, joins through an invitation, and revokes access on leave', async () => {
        await asUser(db.admin, alice)
        const created = await db.admin.query("SELECT group_expense.create_group('New household') AS id")
        const id = created.rows[0].id
        const invitation = await db.admin.query('SELECT invitation_code FROM group_expense.groups WHERE id=$1', [id])
        expect(invitation.rows[0].invitation_code).toMatch(/^[A-Z0-9]+$/)
        expect((await db.admin.query('SELECT group_id FROM group_expense.group_settings WHERE group_id=$1', [id])).rowCount).toBe(1)
        expect((await db.admin.query('SELECT role FROM group_expense.group_members WHERE group_id=$1', [id])).rows).toEqual([{ role: 'owner' }])

        await asUser(db.admin, bob)
        await db.admin.query('SELECT group_expense.join_group($1)', [invitation.rows[0].invitation_code])
        expect((await db.admin.query('SELECT user_id FROM group_expense.group_members WHERE group_id=$1', [id])).rowCount).toBe(2)
        await db.admin.query('SELECT group_expense.leave_group($1)', [id])
        expect((await db.admin.query('SELECT id FROM group_expense.groups WHERE id=$1', [id])).rowCount).toBe(0)
        await expect(db.admin.query('SELECT * FROM group_expense.get_group_balances($1)', [id])).rejects.toThrow(/member/)
    })

    it('does not allow raw group writes or a forged service role claim to bypass the RPC boundary', async () => {
        await asUser(db.admin, alice)
        await expect(db.admin.query(`INSERT INTO group_expense.expenses(user_id,group_id,title,amount,category)
            VALUES ($1,$2,'Bypass',100,'food')`, [alice, group])).rejects.toThrow(/policy/)
        const id = await addExpense(db.admin, [{ user_id: bob, amount: 100 }])
        expect((await db.admin.query('UPDATE group_expense.expenses SET amount=1 WHERE id=$1 RETURNING id', [id])).rowCount).toBe(0)
        await expect(db.admin.query('UPDATE group_expense.expense_splits SET amount=1 WHERE expense_id=$1', [id])).rejects.toThrow(/permission/)
        await asUser(db.admin, outsider)
        await db.admin.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: outsider, role: 'service_role' })])
        await expect(db.admin.query('SELECT * FROM group_expense.get_group_balances($1)', [group])).rejects.toThrow(/member/)
    })

    it('rechecks recipient membership after waiting for the group lock', async () => {
        await asUser(db.admin, alice)
        await addExpense(db.admin, [{ user_id: bob, amount: 100 }])
        await db.admin.query('RESET ROLE')
        await db.admin.query('BEGIN')
        await db.admin.query('SELECT id FROM group_expense.groups WHERE id=$1 FOR UPDATE', [group])
        const payer = await db.connect()
        await payer.query("SET application_name='ledger-test-membership'")
        await asUser(payer, bob)
        const pending = Promise.allSettled([payer.query(
            "SELECT group_expense.settle_monthly_debt($1,$2,100,NULL,'2026-09')", [group, alice]
        )])
        try {
            await expect.poll(async () => {
                await db.admin.query('SELECT pg_stat_clear_snapshot()')
                const result = await db.admin.query(`SELECT count(*)::int AS count FROM pg_stat_activity
                    WHERE application_name='ledger-test-membership' AND wait_event_type='Lock'`)
                return result.rows[0].count
            }, { timeout: 3000, interval: 10 }).toBe(1)
            await db.admin.query('UPDATE group_expense.group_members SET is_active=false WHERE group_id=$1 AND user_id=$2', [group, alice])
            await db.admin.query('COMMIT')
        } finally {
            await db.admin.query('ROLLBACK')
        }
        const [result] = await pending
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected') expect(result.reason.message).toMatch(/Recipient.*active member/)
        expect((await db.admin.query('SELECT count(*)::int AS count FROM group_expense.settlements')).rows[0].count).toBe(0)
    })
})
