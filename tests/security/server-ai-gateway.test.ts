import { afterEach, describe, expect, it, vi } from 'vitest'

const { writeAuditEvent, withTenant, tenantAllowlistRows } = vi.hoisted(() => ({
  writeAuditEvent: vi.fn(async () => 'audit-1'),
  tenantAllowlistRows: [] as Array<{ provider: string; model_id: string }>,
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      execute: async () => ({ rows: tenantAllowlistRows }),
    }),
  ),
}))

vi.mock('../../server/src/services/base.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/src/services/base.js')>()),
  writeAuditEvent,
  withTenant,
}))

vi.mock('ioredis', () => ({
  default: class RedisMock {
    private counts = new Map<string, number>()
    async get(): Promise<string | null> {
      return null
    }
    async set(): Promise<string> {
      return 'OK'
    }
    async incrby(key: string, n: number): Promise<number> {
      const next = (this.counts.get(key) ?? 0) + n
      this.counts.set(key, next)
      return next
    }
    async expire(): Promise<number> {
      return 1
    }
  },
}))

const { evaluateAiGatewayRequest } = await import('../../server/src/ai-gateway/policy-engine.js')

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  tenantAllowlistRows.length = 0
})

describe('server AI gateway policy', () => {
  const context = {
    userId: '22222222-2222-2222-2222-222222222222',
    orgId: '11111111-1111-1111-1111-111111111111',
    externalId: 'entra-user',
    email: 'user@example.test',
    role: 'admin' as const,
  }

  it('blocks sensitive data when policy mode is block', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('AI_GATEWAY_REDIS_URL', '')
    vi.stubEnv('AI_SENSITIVE_DATA_MODE', 'block')

    const decision = await evaluateAiGatewayRequest({
      context,
      model: 'gpt-4o',
      promptTokenEstimate: 10,
      userMessage: 'Contact jane@example.com about this account',
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('Sensitive data detected')
  })

  it('denies production calls when durable gateway state is absent', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AI_GATEWAY_REDIS_URL', '')

    const decision = await evaluateAiGatewayRequest({
      context,
      model: 'gpt-4o',
      promptTokenEstimate: 10,
      userMessage: 'Summarize this account',
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('durable Redis-backed')
  })

  it('requires an exact tenant provider and model allowlist match in lockdown', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('AI_GATEWAY_REDIS_URL', '')
    tenantAllowlistRows.push({ provider: 'openai', model_id: 'gpt-4o-mini' })

    const decision = await evaluateAiGatewayRequest({
      context,
      provider: 'openai',
      model: 'gpt-4o',
      promptTokenEstimate: 10,
      userMessage: 'Summarize this account',
      lockdownLevel: 'strong',
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('not approved for this tenant')
  })

  it('allows an exact tenant provider and model allowlist match in lockdown', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('AI_GATEWAY_REDIS_URL', '')
    tenantAllowlistRows.push({ provider: 'openai', model_id: 'gpt-4o' })

    const decision = await evaluateAiGatewayRequest({
      context,
      provider: 'openai',
      model: 'gpt-4o',
      promptTokenEstimate: 10,
      userMessage: 'Summarize this account',
      lockdownLevel: 'strong',
    })

    expect(decision.allowed).toBe(true)
  })
})
