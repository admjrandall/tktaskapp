// RLS regression tests — verify tenant_users and user_kms_keys are policy-protected.
// These tests exercise the SQL migration in server/drizzle/0001_rls_policies.sql.
//
// Skipped unless POSTGRES_TEST_URL is set — requires a real PostgreSQL instance
// with migrations applied. Run in CI with the db service container.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const DB_URL = process.env['POSTGRES_TEST_URL']

describe.skipIf(!DB_URL)('RLS policy coverage — tenant_users / user_kms_keys', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any

  beforeAll(async () => {
    const { default: pg } = (await import('pg')) as { default: typeof import('pg') }
    client = new pg.Client({ connectionString: DB_URL })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  it('tenant_users has rowsecurity=true and forcerls=true', async () => {
    const result = await client.query(
      `SELECT rowsecurity, forcerls FROM pg_tables
       WHERE schemaname = 'public' AND tablename = 'tenant_users'`,
    )
    expect(result.rows[0]?.rowsecurity).toBe(true)
    expect(result.rows[0]?.forcerls).toBe(true)
  })

  it('user_kms_keys has rowsecurity=true and forcerls=true', async () => {
    const result = await client.query(
      `SELECT rowsecurity, forcerls FROM pg_tables
       WHERE schemaname = 'public' AND tablename = 'user_kms_keys'`,
    )
    expect(result.rows[0]?.rowsecurity).toBe(true)
    expect(result.rows[0]?.forcerls).toBe(true)
  })

  it('querying tenant_users without app.org_id returns zero rows (not an error)', async () => {
    // Reset session to clear any previously set tenant
    await client.query('RESET app.org_id')
    const result = await client.query('SELECT count(*) FROM tenant_users')
    expect(Number(result.rows[0]?.count)).toBe(0)
  })

  it('querying tenant_users with a non-matching org_id returns zero rows', async () => {
    await client.query("SET app.org_id = '00000000-0000-0000-0000-000000000000'")
    const result = await client.query('SELECT count(*) FROM tenant_users')
    expect(Number(result.rows[0]?.count)).toBe(0)
  })

  it('idx_tenant_users_org_id index exists', async () => {
    const result = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'tenant_users' AND indexname = 'idx_tenant_users_org_id'`,
    )
    expect(result.rows.length).toBe(1)
  })

  it('idx_user_kms_keys_org_id index exists', async () => {
    const result = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'user_kms_keys' AND indexname = 'idx_user_kms_keys_org_id'`,
    )
    expect(result.rows.length).toBe(1)
  })

  it('CRM entity tables (clients, tasks) also have forcerls=true', async () => {
    const result = await client.query(
      `SELECT tablename, rowsecurity, forcerls FROM pg_tables
       WHERE schemaname = 'public' AND tablename IN ('clients', 'tasks', 'projects', 'people')
       ORDER BY tablename`,
    )
    for (const row of result.rows) {
      expect(row.rowsecurity).toBe(true)
      expect(row.forcerls).toBe(true)
    }
  })
})
