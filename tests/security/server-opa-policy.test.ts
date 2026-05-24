import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluatePolicy, resourcePolicyMiddleware } from '../../server/src/middleware/opa.js'

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

describe('resource policy middleware', () => {
  function context(
    overrides: {
      role?: string
      tenantId?: string
      userId?: string
      id?: string
    } = {},
  ) {
    return {
      get(key: string) {
        const values: Record<string, string | undefined> = {
          role: overrides.role ?? 'viewer',
          tenantId: overrides.tenantId ?? 'tenant-a',
          userId: overrides.userId ?? 'user-a',
        }
        return values[key]
      },
      req: {
        method: 'GET',
        path: '/clients/client-a',
        param(name: string) {
          return name === 'id' ? (overrides.id ?? 'client-a') : undefined
        },
      },
      json(body: unknown, status: number) {
        return { body, status }
      },
    }
  }

  it('returns 404 before authorization when a by-id resource does not exist', async () => {
    vi.stubEnv('OPA_URL', '')
    const middleware = resourcePolicyMiddleware('read', 'clients', async () => null)
    const next = vi.fn()

    const result = await middleware(context() as never, next)

    expect(result).toEqual({ body: { error: 'Not found' }, status: 404 })
    expect(next).not.toHaveBeenCalled()
  })

  it('denies cross-tenant by-id resource access even for admins', async () => {
    vi.stubEnv('OPA_URL', '')
    const middleware = resourcePolicyMiddleware('read', 'clients', async () => 'tenant-b')
    const next = vi.fn()

    const result = await middleware(context({ role: 'admin' }) as never, next)

    expect(result).toEqual({ body: { error: 'Forbidden' }, status: 403 })
    expect(next).not.toHaveBeenCalled()
  })

  it('allows same-tenant viewer reads through to the route handler', async () => {
    vi.stubEnv('OPA_URL', '')
    const middleware = resourcePolicyMiddleware('read', 'clients', async () => 'tenant-a')
    const next = vi.fn()

    const result = await middleware(context({ role: 'viewer' }) as never, next)

    expect(result).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })
})
