// ── HTTP rate limiting ──────────────────────────────────────────────────────────
//
// Mitigates OWASP API Security "Unrestricted Resource Consumption" (API4:2023):
// brute-force on auth, scraping, and per-tenant cost-blast. Applied as tiered
// middleware (see index.ts):
//   - coarse per-IP guard on all traffic (protects the auth DB/Redis lookups)
//   - strict per-IP guard on /auth/* (login / token brute-force)
//   - per-user guard on /api/v1/* (authenticated abuse)
//   - strict per-user guard on the audit export route
//
// Backing store mirrors the AuthStateStore convention: Redis primary (fixed-window
// counter via INCR + EXPIRE, coordinated across instances) with an in-memory
// sliding-window-log fallback. Unlike auth revocation (which fails CLOSED in
// production), rate limiting fails OPEN to the in-process limiter on a Redis
// outage — denying all traffic on a transient store blip would be a self-inflicted
// denial of service. The in-memory limiter still bounds each instance in that mode.
//
// Emits the IETF draft RateLimit-* header triplet plus Retry-After on 429.

import type { Context, MiddlewareHandler } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { HonoEnv } from '../hono-types.js'
import { otel } from '../observability/otel.js'

export interface RateLimitOptions {
  /** Stable bucket name; namespaces Redis/memory keys and identifies the limiter. */
  name: string
  /** Maximum number of requests permitted per window per identity. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
  /**
   * Resolve the identity to rate-limit on (e.g. IP or user id). Returning
   * `undefined` skips limiting for this request (treated as exempt).
   */
  keyResolver: (c: Context<HonoEnv>) => string | undefined
  /** Optional predicate to exempt a request entirely (e.g. health probes). */
  skip?: (c: Context<HonoEnv>) => boolean
}

interface RedisLikeClient {
  incr: (key: string) => Promise<number>
  pexpire: (key: string, ms: number) => Promise<unknown>
}

// ── Redis client (shared, lazy) ─────────────────────────────────────────────────

let _redis: RedisLikeClient | null = null
let _redisInitAttempted = false

function _redisUrl(): string {
  return (
    process.env['RATE_LIMIT_REDIS_URL'] ??
    process.env['AUTH_STATE_REDIS_URL'] ??
    process.env['AI_GATEWAY_REDIS_URL'] ??
    ''
  )
}

async function _getRedis(): Promise<RedisLikeClient | null> {
  if (_redis) return _redis
  if (_redisInitAttempted) return _redis
  _redisInitAttempted = true
  const url = _redisUrl()
  if (!url) return null
  try {
    const { default: Redis } = (await import('ioredis')) as unknown as {
      default: new (url: string) => RedisLikeClient
    }
    _redis = new Redis(url)
    return _redis
  } catch {
    return null
  }
}

// ── In-memory fallback (per-instance sliding-window log) ─────────────────────────

const _memoryWindows = new Map<string, number[]>()
const MEMORY_MAX_KEYS = 100_000

function _memoryHit(key: string, limit: number, windowMs: number, now: number): RateResult {
  // Opportunistic cap to bound memory under a key-cardinality flood.
  if (_memoryWindows.size > MEMORY_MAX_KEYS) {
    for (const [k, ts] of _memoryWindows) {
      if ((ts.at(-1) ?? 0) <= now - windowMs) _memoryWindows.delete(k)
      if (_memoryWindows.size <= MEMORY_MAX_KEYS) break
    }
  }
  const windowStart = now - windowMs
  const recent = (_memoryWindows.get(key) ?? []).filter((t) => t > windowStart)
  recent.push(now)
  _memoryWindows.set(key, recent)
  const count = recent.length
  const oldest = recent[0] ?? now
  return {
    count,
    limited: count > limit,
    resetMs: Math.max(0, oldest + windowMs - now),
  }
}

// ── Redis fixed-window counter ───────────────────────────────────────────────────

async function _redisHit(
  redis: RedisLikeClient,
  key: string,
  windowMs: number,
  now: number,
): Promise<RateResult> {
  const windowStart = Math.floor(now / windowMs)
  const redisKey = `${key}:${windowStart}`
  const count = await redis.incr(redisKey)
  if (count === 1) {
    // First hit in this window — set the TTL so the counter self-expires.
    await redis.pexpire(redisKey, windowMs)
  }
  const resetMs = (windowStart + 1) * windowMs - now
  return { count, limited: false, resetMs }
}

interface RateResult {
  count: number
  limited: boolean
  resetMs: number
}

// ── Client IP extraction (proxy-aware, spoofing-resistant) ───────────────────────
//
// TRUST_PROXY = number of trusted reverse proxies in front of the app (default 0).
// When > 0 and the X-Forwarded-For chain is long enough, the trustworthy client
// address is the entry `TRUST_PROXY` hops from the right (proxies append the
// address they received from, so any client-supplied left-hand values are ignored).
// When 0 or the chain is too short, the connection socket address is used.

function _trustedProxyHops(): number {
  const raw = Number(process.env['TRUST_PROXY'])
  return Number.isInteger(raw) && raw > 0 ? raw : 0
}

export function clientIp(c: Context<HonoEnv>): string {
  const hops = _trustedProxyHops()
  if (hops > 0) {
    const xff = c.req.header('x-forwarded-for')
    if (xff) {
      const parts = xff
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (parts.length >= hops) {
        const ip = parts[parts.length - hops]
        if (ip) return ip
      }
    }
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

// ── Key resolvers ────────────────────────────────────────────────────────────────

/** Rate-limit by client IP. Use on public routes (auth, coarse global guard). */
export function byIp(c: Context<HonoEnv>): string {
  return `ip:${clientIp(c)}`
}

/**
 * Read a context variable that HonoEnv declares as always-present but which is
 * genuinely unset on pre-auth code paths (e.g. the global per-IP limiter runs
 * before authMiddleware populates userId/tenantId). The annotated return type
 * keeps the nullish handling at call sites honest.
 */
function optionalVar(c: Context<HonoEnv>, key: 'userId' | 'tenantId'): string | undefined {
  return c.get(key)
}

/**
 * Rate-limit by authenticated user, scoped by tenant. Falls back to IP when no
 * user context is present (e.g. a request that has not yet passed authMiddleware).
 */
export function byUser(c: Context<HonoEnv>): string {
  const userId = optionalVar(c, 'userId')
  const tenantId = optionalVar(c, 'tenantId')
  if (userId) return `user:${tenantId ?? 'unknown'}:${userId}`
  return `ip:${clientIp(c)}`
}

// ── Middleware factory ────────────────────────────────────────────────────────────

function _enabled(): boolean {
  return process.env['RATE_LIMIT_ENABLED'] !== 'false'
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<HonoEnv> {
  const { name, limit, windowMs } = options
  return async (c, next) => {
    if (!_enabled() || options.skip?.(c)) {
      await next()
      return
    }
    const identity = options.keyResolver(c)
    if (identity === undefined) {
      await next()
      return
    }
    const key = `rl:${name}:${identity}`
    const now = Date.now()

    let result: RateResult
    const redis = await _getRedis()
    if (redis) {
      try {
        result = await _redisHit(redis, key, windowMs, now)
      } catch (err) {
        // Fail open to the in-process limiter — never hard-deny on a store blip.
        otel.log({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'tktaskapp-server',
          tenantId: optionalVar(c, 'tenantId') ?? 'unknown',
          requestId: c.req.path,
          message: 'Rate-limit Redis store unavailable — falling back to in-memory limiter',
          extra: { error: String(err), limiter: name },
        })
        result = _memoryHit(key, limit, windowMs, now)
      }
    } else {
      result = _memoryHit(key, limit, windowMs, now)
    }

    const remaining = Math.max(0, limit - result.count)
    const resetSeconds = Math.ceil(result.resetMs / 1000)
    c.header('RateLimit-Limit', String(limit))
    c.header('RateLimit-Remaining', String(remaining))
    c.header('RateLimit-Reset', String(resetSeconds))

    if (result.limited || result.count > limit) {
      c.header('Retry-After', String(resetSeconds))
      return c.json({ error: 'Too many requests' }, 429)
    }

    await next()
    return
  }
}

// ── Tier configuration (env-overridable, sensible defaults) ──────────────────────

function _num(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/** Coarse per-IP guard on all traffic. Protects the auth lookups themselves. */
export const globalRateLimit = (): MiddlewareHandler<HonoEnv> =>
  rateLimit({
    name: 'global',
    limit: _num('RATE_LIMIT_GLOBAL_MAX', 600),
    windowMs: _num('RATE_LIMIT_GLOBAL_WINDOW_MS', 60_000),
    keyResolver: byIp,
    // Health/readiness probes are hit frequently by orchestrators — never throttle them.
    skip: (c) => c.req.path === '/healthz' || c.req.path === '/readyz',
  })

/** Strict per-IP guard on the public auth/token endpoints (brute-force defence). */
export const authRateLimit = (): MiddlewareHandler<HonoEnv> =>
  rateLimit({
    name: 'auth',
    limit: _num('RATE_LIMIT_AUTH_MAX', 20),
    windowMs: _num('RATE_LIMIT_AUTH_WINDOW_MS', 5 * 60_000),
    keyResolver: byIp,
  })

/** Per-user guard on authenticated CRM traffic. */
export const apiRateLimit = (): MiddlewareHandler<HonoEnv> =>
  rateLimit({
    name: 'api',
    limit: _num('RATE_LIMIT_API_MAX', 300),
    windowMs: _num('RATE_LIMIT_API_WINDOW_MS', 60_000),
    keyResolver: byUser,
  })

/** Strict per-user guard on the expensive audit export route. */
export const exportRateLimit = (): MiddlewareHandler<HonoEnv> =>
  rateLimit({
    name: 'export',
    limit: _num('RATE_LIMIT_EXPORT_MAX', 5),
    windowMs: _num('RATE_LIMIT_EXPORT_WINDOW_MS', 60_000),
    keyResolver: byUser,
  })

/** Test-only: clear the in-memory limiter state and reset the Redis client cache. */
export function __resetRateLimitStateForTests(): void {
  _memoryWindows.clear()
  _redis = null
  _redisInitAttempted = false
}
