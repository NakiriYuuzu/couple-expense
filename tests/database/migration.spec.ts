// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, bob, seed, startDatabase } from './fixture'

let db: Awaited<ReturnType<typeof startDatabase>>
let migration: string
beforeAll(async () => {
    db = await startDatabase()
    migration = await readFile(new URL('../../migrations/v3-08-ledger-hardening.sql', import.meta.url), 'utf8')
}, 60_000)
afterAll(async () => { await db?.close() }, 30_000)
beforeEach(async () => { await seed(db.admin) })

async function definitions() {
    const functions = await db.admin.query(`SELECT n.nspname, p.proname, pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('private','group_expense') ORDER BY n.nspname,p.proname`)
    const policies = await db.admin.query(`SELECT tablename,policyname,roles,cmd,qual,with_check
        FROM pg_policies WHERE schemaname='group_expense' ORDER BY tablename,policyname`)
    return { functions: functions.rows, policies: policies.rows }
}

describe('v3-08 migration deployment contract', () => {
    it('can be applied twice and matches the fresh snapshot definitions', async () => {
        const fresh = await definitions()
        await db.admin.query(migration)
        await db.admin.query(migration)
        expect(await definitions()).toEqual(fresh)
    })

    it('closes legacy PUBLIC grants and own-row membership writes', async () => {
        await db.admin.query(`
            GRANT EXECUTE ON FUNCTION group_expense.get_send_push_secret(text) TO PUBLIC;
            GRANT UPDATE ON group_expense.group_members TO authenticated;
            CREATE POLICY group_members_update_policy ON group_expense.group_members
                FOR UPDATE USING (user_id=auth.uid());
        `)
        await db.admin.query(migration)
        const permission = await db.admin.query(`SELECT has_function_privilege(
            'authenticated','group_expense.get_send_push_secret(text)','EXECUTE') AS allowed`)
        expect(permission.rows[0].allowed).toBe(false)
        await asUser(db.admin, bob)
        await expect(db.admin.query("UPDATE group_expense.group_members SET role='owner' WHERE user_id=$1", [bob]))
            .rejects.toThrow(/permission/i)
    })

    it('fails closed when an existing private helper has a different owner', async () => {
        await db.admin.query(`CREATE ROLE legacy_helper_owner NOLOGIN;
            ALTER FUNCTION private.is_group_member(uuid,text[]) OWNER TO legacy_helper_owner`)
        try {
            await expect(db.admin.query(migration).then(() => undefined)).rejects.toThrow(/owner drift/)
        } finally {
            await db.admin.query('ROLLBACK')
            await db.admin.query(`ALTER FUNCTION private.is_group_member(uuid,text[]) OWNER TO postgres;
                DROP ROLE legacy_helper_owner`)
        }
    })

    it('fails closed on an unknown live policy without deleting it', async () => {
        await db.admin.query('CREATE POLICY unexpected_external_policy ON group_expense.groups FOR SELECT USING (true)')
        try {
            await expect(db.admin.query(migration).then(() => undefined)).rejects.toThrow(/Unexpected RLS policies/)
        } finally {
            await db.admin.query('ROLLBACK')
        }
        const result = await db.admin.query("SELECT policyname FROM pg_policies WHERE policyname='unexpected_external_policy'")
        expect(result.rows).toHaveLength(1)
        await db.admin.query('DROP POLICY unexpected_external_policy ON group_expense.groups')
    })

    it('fails closed on an unexpected RPC overload', async () => {
        await db.admin.query(`CREATE FUNCTION group_expense.get_group_balances(uuid,text)
            RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$`)
        try {
            await expect(db.admin.query(migration).then(() => undefined)).rejects.toThrow(/RPC overload drift/)
        } finally {
            await db.admin.query('ROLLBACK')
            await db.admin.query('DROP FUNCTION group_expense.get_group_balances(uuid,text)')
        }
    })
})
