import { createHash } from 'node:crypto'

interface AuthStateRedisClient {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ...args: unknown[]) => Promise<unknown>
  del: (key: string) => Promise<unknown>
}

export interface PkceStateRecord {
  codeVerifier: string
  redirectTo: string
  expiresAt: number
}

export interface AuthStateStore {
  savePkceState(state: string, record: PkceStateRecord, ttlSeconds: number): Promise<void>
  consumePkceState(state: string): Promise<PkceStateRecord | null>
  rememberRefreshTokenUse(token: string, ttlSeconds: number): Promise<boolean>
  revokeRefreshToken(token: string, ttlSeconds: number): Promise<void>
}

const _memoryPkce = new Map<string, PkceStateRecord>()
const _memoryRefresh = new Map<string, number>()
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
}

export async function getAuthStateStore(): Promise<AuthStateStore> {
  const redis = await _getRedis()
  if (redis) return new RedisAuthStateStore(redis)
  if (_requiresDurableAuthState()) {
    throw new Error('AUTH_STATE_REDIS_URL is required for production auth state')
  }
  return new MemoryAuthStateStore()
}
