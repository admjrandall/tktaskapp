import { createHash } from 'node:crypto'
import { db } from '../db/index.js'
import { revokedAccessTokens } from '../db/schema/revoked-tokens.js'
import { lt } from 'drizzle-orm'

interface AuthStateRedisClient {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ...args: unknown[]) => Promise<unknown>
  del: (key: string) => Promise<unknown>
}

export interface PkceStateRecord {
  codeVerifier: string
  redirectTo: string
  expiresAt: number
  /** RFC 9700 §2.3.1 — nonce bound to this PKCE flow to prevent ID token replay. */
  nonce: string
}

export interface AuthStateStore {
  savePkceState(state: string, record: PkceStateRecord, ttlSeconds: number): Promise<void>
  consumePkceState(state: string): Promise<PkceStateRecord | null>
  rememberRefreshTokenUse(token: string, ttlSeconds: number): Promise<boolean>
  revokeRefreshToken(token: string, ttlSeconds: number): Promise<void>
  /** Add an access token hash to the revocation blocklist. TTL = remaining token lifetime. */
  revokeAccessToken(
    tokenHash: string,
    ttlSeconds: number,
    userId?: string,
    reason?: string,
  ): Promise<void>
  /** Returns true if the access token hash is on the revocation blocklist. */
  isAccessTokenRevoked(tokenHash: string): Promise<boolean>
}

const _memoryPkce = new Map<string, PkceStateRecord>()
const _memoryRefresh = new Map<string, number>()
const _memoryRevoked = new Map<string, number>()
let _redis: AuthStateRedisClient | null = null

function _redisUrl(): string {
  return process.env['AUTH_STATE_REDIS_URL'] ?? process.env['AI_GATEWAY_REDIS_URL'] ?? ''
}

function _requiresDurableAuthState(): boolean {
  return process.env['NODE_ENV'] === 'production'
}

async function _getRedis(): Promise<AuthStateRedisClient | null> {
  const url = _redisUrl()
  if (!url) return null
  if (_redis) return _redis
  try {
    const { default: Redis } = (await import('ioredis')) as unknown as {
      default: new (url: string) => AuthStateRedisClient
    }
    _redis = new Redis(url)
    return _redis
  } catch {
    return null
  }
}

function _hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url')
}

function _cleanExpiredMemory(): void {
  const now = Date.now()
  for (const [key, record] of _memoryPkce) {
    if (record.expiresAt <= now) _memoryPkce.delete(key)
  }
  for (const [key, expiresAt] of _memoryRefresh) {
    if (expiresAt <= now) _memoryRefresh.delete(key)
  }
  for (const [key, expiresAt] of _memoryRevoked) {
    if (expiresAt <= now) _memoryRevoked.delete(key)
  }
}

class RedisAuthStateStore implements AuthStateStore {
  constructor(private readonly redis: AuthStateRedisClient) {}

  async savePkceState(state: string, record: PkceStateRecord, ttlSeconds: number): Promise<void> {
    await this.redis.set(`pkce:${state}`, JSON.stringify(record), 'EX', ttlSeconds, 'NX')
  }

  async consumePkceState(state: string): Promise<PkceStateRecord | null> {
    const key = `pkce:${state}`
    const raw = await this.redis.get(key)
    if (!raw) return null
    await this.redis.del(key)
    const record = JSON.parse(raw) as PkceStateRecord
    if (record.expiresAt <= Date.now()) return null
    return record
  }

  async rememberRefreshTokenUse(token: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(
      `refresh-used:${_hashToken(token)}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    )
    return result === 'OK'
  }

  async revokeRefreshToken(token: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`refresh-used:${_hashToken(token)}`, 'revoked', 'EX', ttlSeconds)
  }

  async revokeAccessToken(
    tokenHash: string,
    ttlSeconds: number,
    userId?: string,
    reason = 'logout',
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
    // Write to Redis for fast hot-path checks
    await this.redis.set(`revoked-access:${tokenHash}`, '1', 'EX', ttlSeconds)
    // Write to DB for durable audit trail (best-effort; Redis is authoritative for checks)
    try {
      await db
        .insert(revokedAccessTokens)
        .values({
          tokenHash,
          expiresAt,
          reason,
          ...(userId ? { userId } : {}),
        })
        .onConflictDoNothing()
    } catch {
      // DB write failure does not block revocation — Redis entry is sufficient
    }
  }

  async isAccessTokenRevoked(tokenHash: string): Promise<boolean> {
    const val = await this.redis.get(`revoked-access:${tokenHash}`)
    return val !== null
  }
}

class MemoryAuthStateStore implements AuthStateStore {
  savePkceState(state: string, record: PkceStateRecord): Promise<void> {
    _cleanExpiredMemory()
    _memoryPkce.set(state, record)
    return Promise.resolve()
  }

  consumePkceState(state: string): Promise<PkceStateRecord | null> {
    _cleanExpiredMemory()
    const record = _memoryPkce.get(state) ?? null
    _memoryPkce.delete(state)
    if (!record || record.expiresAt <= Date.now()) return Promise.resolve(null)
    return Promise.resolve(record)
  }

  rememberRefreshTokenUse(token: string, ttlSeconds: number): Promise<boolean> {
    _cleanExpiredMemory()
    const key = _hashToken(token)
    if (_memoryRefresh.has(key)) return Promise.resolve(false)
    _memoryRefresh.set(key, Date.now() + ttlSeconds * 1000)
    return Promise.resolve(true)
  }

  revokeRefreshToken(token: string, ttlSeconds: number): Promise<void> {
    _memoryRefresh.set(_hashToken(token), Date.now() + ttlSeconds * 1000)
    return Promise.resolve()
  }

  async revokeAccessToken(
    tokenHash: string,
    ttlSeconds: number,
    userId?: string,
    reason = 'logout',
  ): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000
    _memoryRevoked.set(tokenHash, expiresAt)
    // Best-effort DB audit trail even in memory mode
    try {
      await db
        .insert(revokedAccessTokens)
        .values({
          tokenHash,
          expiresAt: new Date(expiresAt),
          reason,
          ...(userId ? { userId } : {}),
        })
        .onConflictDoNothing()
    } catch {
      // DB unavailable in test environments — in-memory is sufficient
    }
  }

  isAccessTokenRevoked(tokenHash: string): Promise<boolean> {
    _cleanExpiredMemory()
    return Promise.resolve(_memoryRevoked.has(tokenHash))
  }
}

export async function getAuthStateStore(): Promise<AuthStateStore> {
  const redis = await _getRedis()
  if (redis) return new RedisAuthStateStore(redis)
  if (_requiresDurableAuthState()) {
    throw new Error('AUTH_STATE_REDIS_URL is required for production auth state')
  }
  return new MemoryAuthStateStore()
}

/**
 * Delete expired rows from revoked_access_tokens.
 * Call periodically (e.g. at server startup and on a slow background interval).
 * Safe to call concurrently — DELETE WHERE is idempotent.
 */
export async function pruneExpiredRevocations(): Promise<void> {
  try {
    await db.delete(revokedAccessTokens).where(lt(revokedAccessTokens.expiresAt, new Date()))
  } catch {
    // Non-fatal — pruning is a maintenance operation, not a correctness gate
  }
}

/** Hash a raw access token for storage/lookup. Returns base64url-encoded SHA-256. */
export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url')
}
