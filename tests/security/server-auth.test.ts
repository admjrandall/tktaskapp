import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPkceChallengeForVerifier } from '../../server/src/auth/oidc-service.js'

const validateEntraIdToken = vi.fn()
const limit = vi.fn()
const where = vi.fn(() => ({ limit }))
const from = vi.fn(() => ({ where }))
const select = vi.fn(() => ({ from }))

vi.mock('../../server/src/auth/oidc.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/src/auth/oidc.js')>()),
  validateEntraIdToken,
}))

vi.mock('../../server/src/db/index.js', () => ({
  db: { select },
}))

const { authMiddleware } = await import('../../server/src/auth/middleware.js')

function makeContext() {
  const values = new Map<string, unknown>()
  const response = vi.fn((body: unknown, status: number) => ({ body, status }))
  return {
    c: {
      req: {
        header: vi.fn((name: string) =>
          name === 'Authorization' ? 'Bearer test-token' : undefined,
        ),
      },
      json: response,
      set: vi.fn((key: string, value: unknown) => {
        values.set(key, value)
      }),
    },
    response,
    values,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  validateEntraIdToken.mockResolvedValue({
    externalId: 'entra-user-1',
    tenantId: 'entra-tenant-1',
    email: 'user@example.test',
  })
})

describe('server PKCE', () => {
  it('derives the RFC 7636 S256 challenge for a known verifier', async () => {
    await expect(
      createPkceChallengeForVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('server auth middleware', () => {
  it('denies a valid Entra token when no active tenant user exists', async () => {
    limit.mockResolvedValue([])
    const { c, response } = makeContext()
    const next = vi.fn()

    const result = await authMiddleware(c as never, next)

    expect(result).toEqual({ body: { error: 'Forbidden' }, status: 403 })
    expect(response).toHaveBeenCalledWith({ error: 'Forbidden' }, 403)
    expect(next).not.toHaveBeenCalled()
  })

  it('sets internal user context for an active tenant user', async () => {
    limit.mockResolvedValue([
      {
        id: 'internal-user-1',
        orgId: 'internal-org-1',
        role: 'admin',
      },
    ])
    const { c, values } = makeContext()
    const next = vi.fn(async () => undefined)

    await authMiddleware(c as never, next)

    expect(next).toHaveBeenCalledOnce()
    expect(values.get('userId')).toBe('internal-user-1')
    expect(values.get('tenantId')).toBe('internal-org-1')
    expect(values.get('role')).toBe('admin')
    expect(values.get('externalId')).toBe('entra-user-1')
    expect(values.get('email')).toBe('user@example.test')
  })

  it('denies a token whose Entra tenant does not match the provisioned mapping', async () => {
    limit.mockResolvedValue([])
    const { c, response } = makeContext()
    const next = vi.fn()

    const result = await authMiddleware(c as never, next)

    expect(result).toEqual({ body: { error: 'Forbidden' }, status: 403 })
    expect(response).toHaveBeenCalledWith({ error: 'Forbidden' }, 403)
    expect(next).not.toHaveBeenCalled()
  })
})
