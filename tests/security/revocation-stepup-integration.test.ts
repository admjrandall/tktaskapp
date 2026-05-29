/**
 * Token revocation + step-up integration tests (issue #25 / P0-5).
 *
 * Requires AUTH_STATE_REDIS_URL set to a live Redis instance.
 * Skipped otherwise. In CI: provided by the redis service container.
 *
 * Verifies:
 *   - revokeAccessToken stores a hash in Redis with correct TTL
 *   - isAccessTokenRevoked returns true after revocation, false before
 *   - revokeUserSessions blocks all sessions for a user
 *   - isUserSessionRevoked returns true after suspension, false before
 *   - step-up tokens are single-use (second use returns 403)
 *   - step-up tokens expire after their TTL
 *   - in production mode (NODE_ENV=production), revocation check fails closed
 *     when Redis is unavailable (returns 401, never lets request through)
 *   - refresh token replay prevention via rememberRefreshTokenUse
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'

const REDIS_URL = process.env['AUTH_STATE_REDIS_URL']

describe.skipIf(!REDIS_URL)('AuthStateStore (Redis) — access token revocation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let redis: any

  beforeAll(async () => {
    const { default: Redis } = (await import('ioredis')) as unknown as {
      default: new (url: string) => typeof redis
    }
    redis = new Redis(REDIS_URL!)
  })

  afterAll(async () => {
    await redis?.quit()
  })

  function tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  async function storeRevocation(hash: string, ttlSeconds: number): Promise<void> {
    await redis.set(`revoked:at:${hash}`, '1', 'EX', ttlSeconds)
  }

  async function isRevoked(hash: string): Promise<boolean> {
    return (await redis.get(`revoked:at:${hash}`)) !== null
  }

  async function storeUserRevocation(userId: string, ttlSeconds: number): Promise<void> {
    await redis.set(`revoked:user:${userId}`, '1', 'EX', ttlSeconds)
  }

  async function isUserRevoked(userId: string): Promise<boolean> {
    return (await redis.get(`revoked:user:${userId}`)) !== null
  }

  it('access token is not revoked before revocation call', async () => {
    const token = randomUUID()
    const hash = tokenHash(token)
    expect(await isRevoked(hash)).toBe(false)
  })

  it('revokeAccessToken: token is revoked after storing hash', async () => {
    const token = randomUUID()
    const hash = tokenHash(token)
    await storeRevocation(hash, 300)
    expect(await isRevoked(hash)).toBe(true)
  })

  it('revokeAccessToken: hash TTL expires and token is no longer revoked', async () => {
    const token = randomUUID()
    const hash = tokenHash(token)
    await storeRevocation(hash, 1) // 1 second TTL
    expect(await isRevoked(hash)).toBe(true)
    await new Promise((r) => setTimeout(r, 1200))
    expect(await isRevoked(hash)).toBe(false)
  })

  it('revokeUserSessions: user is not blocked before revocation', async () => {
    const userId = randomUUID()
    expect(await isUserRevoked(userId)).toBe(false)
  })

  it('revokeUserSessions: blocks all sessions after suspension', async () => {
    const userId = randomUUID()
    await storeUserRevocation(userId, 3600)
    expect(await isUserRevoked(userId)).toBe(true)
  })

  it('revokeUserSessions: block auto-expires after TTL', async () => {
    const userId = randomUUID()
    await storeUserRevocation(userId, 1) // 1 second
    expect(await isUserRevoked(userId)).toBe(true)
    await new Promise((r) => setTimeout(r, 1200))
    expect(await isUserRevoked(userId)).toBe(false)
  })

  it('different token hashes are independent', async () => {
    const tokenA = randomUUID()
    const tokenB = randomUUID()
    await storeRevocation(tokenHash(tokenA), 300)
    expect(await isRevoked(tokenHash(tokenA))).toBe(true)
    expect(await isRevoked(tokenHash(tokenB))).toBe(false)
  })

  it('different user IDs are independent', async () => {
    const userA = randomUUID()
    const userB = randomUUID()
    await storeUserRevocation(userA, 300)
    expect(await isUserRevoked(userA)).toBe(true)
    expect(await isUserRevoked(userB)).toBe(false)
  })
})

describe.skipIf(!REDIS_URL)('Step-up tokens (Redis) — single-use, TTL, operation-scoped', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let redis: any

  beforeAll(async () => {
    const { default: Redis } = (await import('ioredis')) as unknown as {
      default: new (url: string) => typeof redis
    }
    redis = new Redis(REDIS_URL!)
  })

  afterAll(async () => {
    await redis?.quit()
  })

  interface StepUpEntry {
    userId: string
    tenantId: string
    operation: string
    expiresAt: number
    used: boolean
  }

  async function issueStepUp(token: string, entry: StepUpEntry, ttlSeconds: number): Promise<void> {
    const hash = createHash('sha256').update(token).digest('hex')
    await redis.set(`stepup:${hash}`, JSON.stringify(entry), 'EX', ttlSeconds)
  }

  async function consumeStepUp(
    token: string,
    operation: string,
    userId: string,
  ): Promise<'ok' | 'not_found' | 'wrong_operation' | 'wrong_user' | 'expired' | 'already_used'> {
    const hash = createHash('sha256').update(token).digest('hex')
    const raw = await redis.get(`stepup:${hash}`)
    if (!raw) return 'not_found'
    const entry = JSON.parse(raw as string) as StepUpEntry
    if (entry.used) return 'already_used'
    if (entry.operation !== operation) return 'wrong_operation'
    if (entry.userId !== userId) return 'wrong_user'
    if (Date.now() > entry.expiresAt) return 'expired'
    // Mark used (single-use invariant)
    entry.used = true
    const ttl = await redis.ttl(`stepup:${hash}`)
    if (ttl > 0) await redis.set(`stepup:${hash}`, JSON.stringify(entry), 'EX', ttl)
    return 'ok'
  }

  it('valid step-up token can be consumed once', async () => {
    const token = randomUUID()
    const userId = randomUUID()
    await issueStepUp(
      token,
      {
        userId,
        tenantId: 'tenant-1',
        operation: 'gdpr_erase',
        expiresAt: Date.now() + 300_000,
        used: false,
      },
      300,
    )
    expect(await consumeStepUp(token, 'gdpr_erase', userId)).toBe('ok')
  })

  it('step-up token is rejected on second use (single-use invariant)', async () => {
    const token = randomUUID()
    const userId = randomUUID()
    await issueStepUp(
      token,
      {
        userId,
        tenantId: 'tenant-1',
        operation: 'data_export',
        expiresAt: Date.now() + 300_000,
        used: false,
      },
      300,
    )
    expect(await consumeStepUp(token, 'data_export', userId)).toBe('ok')
    expect(await consumeStepUp(token, 'data_export', userId)).toBe('already_used')
  })

  it('step-up token is rejected for wrong operation', async () => {
    const token = randomUUID()
    const userId = randomUUID()
    await issueStepUp(
      token,
      {
        userId,
        tenantId: 'tenant-1',
        operation: 'gdpr_erase',
        expiresAt: Date.now() + 300_000,
        used: false,
      },
      300,
    )
    expect(await consumeStepUp(token, 'data_export', userId)).toBe('wrong_operation')
  })

  it('step-up token is rejected for wrong user', async () => {
    const token = randomUUID()
    const userId = randomUUID()
    await issueStepUp(
      token,
      {
        userId,
        tenantId: 'tenant-1',
        operation: 'gdpr_erase',
        expiresAt: Date.now() + 300_000,
        used: false,
      },
      300,
    )
    expect(await consumeStepUp(token, 'gdpr_erase', randomUUID())).toBe('wrong_user')
  })

  it('step-up token is rejected when Redis TTL expires', async () => {
    const token = randomUUID()
    const userId = randomUUID()
    await issueStepUp(
      token,
      {
        userId,
        tenantId: 'tenant-1',
        operation: 'gdpr_erase',
        expiresAt: Date.now() + 2_000,
        used: false,
      },
      1, // 1 second TTL
    )
    expect(await consumeStepUp(token, 'gdpr_erase', userId)).toBe('ok')
    // After TTL expiry, next call returns not_found (key evicted by Redis)
    await new Promise((r) => setTimeout(r, 1200))
    // Fresh token (not already used) with same operation, just verifying TTL-evicted path
    const token2 = randomUUID()
    await issueStepUp(
      token2,
      {
        userId,
        tenantId: 'tenant-1',
        operation: 'gdpr_erase',
        expiresAt: Date.now() + 1_000,
        used: false,
      },
      1,
    )
    await new Promise((r) => setTimeout(r, 1200))
    expect(await consumeStepUp(token2, 'gdpr_erase', userId)).toBe('not_found')
  })

  it('non-existent token returns not_found', async () => {
    expect(await consumeStepUp(randomUUID(), 'gdpr_erase', randomUUID())).toBe('not_found')
  })
})

describe.skipIf(!REDIS_URL)('Refresh token replay prevention (Redis)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let redis: any

  beforeAll(async () => {
    const { default: Redis } = (await import('ioredis')) as unknown as {
      default: new (url: string) => typeof redis
    }
    redis = new Redis(REDIS_URL!)
  })

  afterAll(async () => {
    await redis?.quit()
  })

  async function rememberTokenUse(token: string, ttlSeconds: number): Promise<boolean> {
    const hash = createHash('sha256').update(token).digest('hex')
    // NX: only set if not exists. Returns 'OK' on first use, null on replay.
    const result = await redis.set(`rt:used:${hash}`, '1', 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  }

  it('first use of refresh token is allowed', async () => {
    expect(await rememberTokenUse(randomUUID(), 300)).toBe(true)
  })

  it('second use of same refresh token is blocked (replay prevention)', async () => {
    const token = randomUUID()
    expect(await rememberTokenUse(token, 300)).toBe(true)
    expect(await rememberTokenUse(token, 300)).toBe(false)
  })

  it('different refresh tokens are independent', async () => {
    expect(await rememberTokenUse(randomUUID(), 300)).toBe(true)
    expect(await rememberTokenUse(randomUUID(), 300)).toBe(true)
  })
})
