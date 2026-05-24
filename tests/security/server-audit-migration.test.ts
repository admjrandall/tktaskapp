import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('server audit append-only migrations', () => {
  it('prevents audit and KMS lifecycle rows from being updated or deleted', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'server/drizzle/0006_audit_append_only.sql'),
      'utf8',
    )

    expect(migration).toContain('BEFORE UPDATE OR DELETE ON audit_events')
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON kms_key_lifecycle')
    expect(migration).toContain("RAISE EXCEPTION 'audit_events is append-only'")
    expect(migration).toContain("RAISE EXCEPTION 'kms_key_lifecycle is append-only'")
  })
})
