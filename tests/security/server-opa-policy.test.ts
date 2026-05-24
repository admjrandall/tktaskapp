import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluatePolicy } from '../../server/src/middleware/opa.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('server OPA fallback policy', () => {
  it('denies cross-tenant resource access before role grants are applied', async () => {
    vi.stubEnv('OPA_URL', '')

    await expect(
      evaluatePolicy({
        role: 'admin',
        action: 'read',
        tenantId: 'tenant-a',
        resourceTenantId: 'tenant-b',
      }),
    ).resolves.toBe(false)
  })

  it('allows same-tenant viewer reads', async () => {
    vi.stubEnv('OPA_URL', '')

    await expect(
      evaluatePolicy({
        role: 'viewer',
        action: 'read',
        tenantId: 'tenant-a',
        resourceTenantId: 'tenant-a',
      }),
    ).resolves.toBe(true)
  })
})
