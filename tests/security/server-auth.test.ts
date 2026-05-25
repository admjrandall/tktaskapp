import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPkceChallengeForVerifier } from '../../server/src/auth/oidc-service.js'
import { issueStepUpToken, validateStepUpToken } from '../../server/src/auth/step-up.js'

// vi.mock factories are hoisted to the top of the file by vitest — all variables
// referenced inside them must be declared with vi.hoisted() so they're initialized
// before the hoisted factory runs.
const { validateEntraIdToken, limit, where, from, select, mockStore } = vi.hoisted(() => {
  const limit = vi.fn()
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  const validateEntraIdToken = vi.fn()
  const mockStore = {
    isAccessTokenRevoked: vi.fn().mockResolvedValue(false),
    revokeAccessToken: vi.fn().mockResolvedValue(undefined),
    savePkceState: vi.fn(),
    consumePkceState: vi.fn(),
    rememberRefreshTokenUse: vi.fn(),
    revokeRefreshToken: vi.fn(),
  }
  return { validateEntraIdToken, limit, where, from, select, mockStore }
})

vi.mock('../../server/src/auth/oidc.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/src/auth/oidc.js')>()),
  validateEntraIdToken,
}))

vi.mock('../../server/src/db/index.js', () => ({
  db: { select },
}))

vi.mock('../../server/src/auth/state-store.js', () => ({
  getAuthStateStore: vi.fn().mockResolvedValue(mockStore),
  hashAccessToken: vi.fn((t: string) => `hash:${t}`),
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
  mockStore.isAccessTokenRevoked.mockResolvedValue(false)
})

describe('server PKCE', () => {
  it('derives the RFC 7636 S256 challenge for a known verifier', async () => {
    await expect(
      createPkceChallengeForVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('step-up authentication (RFC 9470)', () => {
  it('issueStepUpToken returns a non-empty string', async () => {
    const token = await issueStepUpToken('user-1', 'tenant-1', 'gdpr_erase')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('validateStepUpToken returns true for a freshly issued token', async () => {
    const token = await issueStepUpToken('user-2', 'tenant-1', 'data_export')
    const valid = await validateStepUpToken(token, 'user-2', 'data_export')
    expect(valid).toBe(true)
  })

  it('validateStepUpToken returns false for wrong userId', async () => {
    const token = await issueStepUpToken('user-3', 'tenant-1', 'org_settings_change')
    const valid = await validateStepUpToken(token, 'wrong-user', 'org_settings_change')
    expect(valid).toBe(false)
  })

  it('validateStepUpToken returns false for wrong operation', async () => {
    const token = await issueStepUpToken('user-4', 'tenant-1', 'kms_key_manage')
    const valid = await validateStepUpToken(token, 'user-4', 'ai_provider_configure')
    expect(valid).toBe(false)
  })

  it('validateStepUpToken returns false for a token that was never issued', async () => {
    const valid = await validateStepUpToken('bogus-token', 'user-1', 'gdpr_erase')
    expect(valid).toBe(false)
  })

  it('issueStepUpToken produces unique tokens on repeated calls', async () => {
    const t1 = await issueStepUpToken('user-5', 'tenant-1', 'admin_user_change')
    const t2 = await issueStepUpToken('user-5', 'tenant-1', 'admin_user_change')
    expect(t1).not.toBe(t2)
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

  it('denies a revoked access token before JWT validation', async () => {
    mockStore.isAccessTokenRevoked.mockResolvedValue(true)
    const { c, response } = makeContext()
    const next = vi.fn()

    const result = await authMiddleware(c as never, next)

    // Revoked tokens return 401 Unauthorized per RFC 6750 §3.1
    expect(result).toEqual({ body: { error: 'Unauthorized' }, status: 401 })
    expect(next).not.toHaveBeenCalled()
    // validateEntraIdToken must NOT be called after a revocation hit
    expect(validateEntraIdToken).not.toHaveBeenCalled()
  })
})
