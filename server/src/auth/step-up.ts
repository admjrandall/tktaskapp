/**
 * Step-up authentication middleware.
 *
 * High-risk operations (GDPR erasure, admin changes, AI provider configuration,
 * data export) require the caller to prove recent re-authentication. This module
 * enforces that gate.
 *
 * Protocol (RFC 9470 — OAuth 2.0 Step Up Authentication Challenge):
 *   1. Middleware checks whether a valid step-up token exists for this user + operation.
 *   2. If not, returns HTTP 401 with WWW-Authenticate: Bearer realm="...",
 *      error="insufficient_user_authentication",
 *      error_description="Step-up authentication required",
 *      acr_values="<required_acr>",
 *      max_age=0
 *   3. Client shows the re-auth dialog (password + MFA if enrolled).
 *   4. Client calls POST /auth/step-up/start, completes a nonce-bound OIDC
 *      prompt=login flow, and receives the token by same-origin postMessage.
 *   5. Server issues a short-lived step-up token (stored in Redis/memory).
 *   6. Client retries the original request with X-Step-Up-Token header.
 *
 * Step-up tokens are single-use, 5-minute TTL, scoped to a specific operation.
 * They are never returned as cookies — always in the JSON response body.
 */

import { createHash, randomBytes } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../hono-types.js'
import { otel } from '../observability/otel.js'
import { writeAuditEvent } from '../services/base.js'

// ── Step-up operation catalogue ───────────────────────────────────────────────

export type StepUpOperation =
  | 'gdpr_erase'
  | 'ai_provider_configure'
  | 'data_export'
  | 'legal_hold_change'
  | 'kms_key_manage'
  | 'org_settings_change'
  | 'user_suspend'

const STEP_UP_TTL_SECONDS = 5 * 60 // 5 minutes — single-use
const STEP_UP_TOKEN_HEADER = 'X-Step-Up-Token'

// ── In-memory store with Redis fallback ───────────────────────────────────────

interface StepUpEntry {
  userId: string
  tenantId: string
  operation: StepUpOperation
  expiresAt: number
  used: boolean
}

const _memStore = new Map<string, StepUpEntry>()

interface RedisLike {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ...args: unknown[]) => Promise<unknown>
  del: (key: string) => Promise<unknown>
}

let _redis: RedisLike | null = null

async function _getRedis(): Promise<RedisLike | null> {
  const url = process.env['AUTH_STATE_REDIS_URL'] ?? ''
  if (!url) return null
  if (_redis) return _redis
  try {
    const { default: Redis } = (await import('ioredis')) as unknown as {
      default: new (url: string) => RedisLike
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

function _redisKey(tokenHash: string): string {
  return `step-up:${tokenHash}`
}

// ── Issue step-up token ───────────────────────────────────────────────────────

/**
 * Issue a step-up token for the given user and operation.
 * Called after successful nonce-bound OIDC re-authentication.
 * Returns the raw token (caller sends it to the client in the response body).
 */
export async function issueStepUpToken(
  userId: string,
  tenantId: string,
  operation: StepUpOperation,
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = _hashToken(token)
  const expiresAt = Date.now() + STEP_UP_TTL_SECONDS * 1000

  const entry: StepUpEntry = { userId, tenantId, operation, expiresAt, used: false }
  const redis = await _getRedis()
  if (redis) {
    await redis.set(_redisKey(tokenHash), JSON.stringify(entry), 'EX', STEP_UP_TTL_SECONDS)
  } else {
    _memStore.set(tokenHash, entry)
  }

  return token
}

// ── Consume step-up token ─────────────────────────────────────────────────────

/**
 * Consume a step-up token. Returns the entry if valid, or null if invalid/expired/used.
 * Tokens are single-use — consuming marks them as used immediately.
 */
async function _consumeStepUpToken(
  token: string,
  expectedUserId: string,
  expectedOperation: StepUpOperation,
): Promise<StepUpEntry | null> {
  const tokenHash = _hashToken(token)
  const redis = await _getRedis()

  let entry: StepUpEntry | null = null

  if (redis) {
    const raw = await redis.get(_redisKey(tokenHash))
    if (!raw) return null
    entry = JSON.parse(raw) as StepUpEntry
    await redis.del(_redisKey(tokenHash)) // single-use: delete immediately
  } else {
    entry = _memStore.get(tokenHash) ?? null
    _memStore.delete(tokenHash) // single-use
  }

  if (!entry) return null
  if (entry.used) return null
  if (entry.expiresAt < Date.now()) return null
  if (entry.userId !== expectedUserId) return null
  if (entry.operation !== expectedOperation) return null

  return entry
}

/**
 * Validate a step-up token without consuming it.
 * Returns the entry if valid, null otherwise.
 * Used for testing and health-check purposes only — do not use in production request paths
 * (use requireStepUp middleware which consumes the token atomically).
 */
export async function validateStepUpToken(
  token: string,
  userId: string,
  operation: StepUpOperation,
): Promise<boolean> {
  const tokenHash = _hashToken(token)
  const redis = await _getRedis()

  let entry: StepUpEntry | null = null
  if (redis) {
    const raw = await redis.get(_redisKey(tokenHash))
    if (!raw) return false
    entry = JSON.parse(raw) as StepUpEntry
  } else {
    entry = _memStore.get(tokenHash) ?? null
  }

  if (!entry) return false
  if (entry.expiresAt < Date.now()) return false
  if (entry.userId !== userId) return false
  if (entry.operation !== operation) return false
  return true
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Hono middleware that enforces step-up authentication for high-risk operations.
 *
 * @example
 *   adminRouter.post('/erase', requireStepUp('gdpr_erase'), handler)
 *
 * On missing or invalid step-up token, returns:
 *   HTTP 401 with WWW-Authenticate header per RFC 9470 §3.
 */
export function requireStepUp(operation: StepUpOperation): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const userId = c.get('userId')
    const tenantId = c.get('tenantId')

    if (!userId || !tenantId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const rawToken = c.req.header(STEP_UP_TOKEN_HEADER)
    if (!rawToken) {
      c.header(
        'WWW-Authenticate',
        [
          `Bearer realm="${process.env['OIDC_REDIRECT_URI'] ?? 'tktaskapp'}"`,
          `error="insufficient_user_authentication"`,
          `error_description="Step-up authentication required for ${operation}"`,
          `acr_values="phrh"`, // phishing-resistant hardware — MFA
          `max_age=0`,
        ].join(', '),
      )
      return c.json(
        {
          error: 'step_up_required',
          operation,
          description: `Re-authentication is required for ${operation}. POST /auth/step-up/start to obtain a step-up token.`,
        },
        401,
      )
    }

    const entry = await _consumeStepUpToken(rawToken, userId, operation)
    if (!entry) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'tktaskapp-server',
        tenantId,
        requestId: c.req.header('X-Request-ID') ?? 'step-up',
        message: 'Invalid or expired step-up token',
        extra: { userId, operation },
      })
      // Audit the failed attempt
      try {
        await writeAuditEvent({
          tenantId,
          userId,
          eventType: 'step_up.token_rejected',
          resourceType: 'auth',
          details: { operation, reason: 'invalid_or_expired' },
        })
      } catch {
        /* audit failure is non-fatal */
      }

      c.header(
        'WWW-Authenticate',
        [
          `Bearer realm="${process.env['OIDC_REDIRECT_URI'] ?? 'tktaskapp'}"`,
          `error="insufficient_user_authentication"`,
          `error_description="Step-up token invalid, expired, or already used"`,
          `max_age=0`,
        ].join(', '),
      )
      return c.json(
        {
          error: 'step_up_invalid',
          operation,
          description:
            'The step-up token was invalid, expired, or already used. POST /auth/step-up/start to obtain a new one.',
        },
        401,
      )
    }

    // Valid — attach metadata so downstream handlers can record it
    c.set('stepUpOperation' as keyof HonoEnv['Variables'], operation as never)

    await next()
  }
}
