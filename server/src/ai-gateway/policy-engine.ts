// AI gateway policy engine — concrete implementation.
// ISO 42001:2023 alignment: per-tenant budget, rate limiting, PII screening, model allowlist, audit logging.

import type { AuthenticatedContext } from '../auth/oidc.js'
import { writeAuditEvent } from '../services/base.js'

export interface AiGatewayRequest {
  context: AuthenticatedContext
  provider?: string
  model: string
  promptTokenEstimate: number
  systemPrompt?: string
  userMessage: string
  lockdownLevel?: string // injected by lockdownMiddleware via c.get('lockdownLevel')
}

export interface AiGatewayDecision {
  allowed: boolean
  reason?: string
  sanitisedMessage?: string
}

// ── PII screening patterns ─────────────────────────────────────────────────────
const _PII_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { name: 'credit-card', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'uk-ni', pattern: /\b[A-Z]{2}\d{6}[A-D ]\b/g },
]

function _screenPii(message: string): { clean: string; detected: string[] } {
  let clean = message
  const detected: string[] = []
  for (const { name, pattern } of _PII_PATTERNS) {
    if (pattern.test(clean)) {
      detected.push(name)
      pattern.lastIndex = 0
      clean = clean.replace(pattern, `[REDACTED-${name.toUpperCase()}]`)
    }
    pattern.lastIndex = 0
  }
  return { clean, detected }
}

// ── Lockdown enforcement helpers ──────────────────────────────────────────────
import { withTenant } from '../services/base.js'
import { sql } from 'drizzle-orm'

// Check if the requested provider/model pair is in the tenant's AI allowlist.
// A missing or empty allowlist means DENY ALL in production and lockdown modes.
async function _isTenantAllowedModel(
  orgId: string,
  provider: string,
  model: string,
): Promise<boolean> {
  try {
    const result = await withTenant(orgId, async (tx) =>
      tx.execute(sql`
        SELECT provider, model_id
        FROM ai_endpoint_allowlist
        WHERE org_id = ${orgId}
          AND provider = ${provider}
          AND model_id = ${model}
        LIMIT 1
      `),
    )
    const entries = result.rows as Array<{
      provider?: unknown
      model_id?: unknown
      modelId?: unknown
    }>
    return entries.some((entry) => {
      const entryProvider = typeof entry.provider === 'string' ? entry.provider : ''
      const entryModel =
        typeof entry.model_id === 'string'
          ? entry.model_id
          : typeof entry.modelId === 'string'
            ? entry.modelId
            : ''
      return entryProvider === provider && entryModel === model
    })
  } catch {
    return false
  }
}

type SensitiveDataMode = 'block' | 'redact' | 'allow-with-approval'

function _sensitiveDataMode(): SensitiveDataMode {
  const mode = process.env['AI_SENSITIVE_DATA_MODE']
  if (mode === 'redact' || mode === 'allow-with-approval' || mode === 'block') return mode
  return process.env['NODE_ENV'] === 'production' ? 'block' : 'redact'
}

// ── Model allowlist ────────────────────────────────────────────────────────────
const _APPROVED_MODEL_CATALOG = new Map<string, string>([
  ['claude-opus-4-7', 'anthropic'],
  ['claude-sonnet-4-6', 'anthropic'],
  ['claude-haiku-4-5-20251001', 'anthropic'],
  ['gpt-4o', 'openai'],
  ['gpt-4o-mini', 'openai'],
  ['gemini-1.5-pro', 'google'],
  ['gemini-1.5-flash', 'google'],
])

// ── Per-user rate limiting ────────────────────────────────────────────────────
// Uses Redis if AI_GATEWAY_REDIS_URL is set; otherwise falls back to in-memory
// sliding window (acceptable for single-instance dev deployments, resets on restart).
const _RATE_LIMIT_RPM = 20
const _rateWindows = new Map<string, number[]>()

type RedisClient = {
  get: (k: string) => Promise<string | null>
  set: (k: string, v: string, ...args: unknown[]) => Promise<unknown>
  incrby: (k: string, n: number) => Promise<number>
  expire: (k: string, s: number) => Promise<unknown>
}
let _redis: RedisClient | null = null

async function _getRedis(): Promise<RedisClient | null> {
  const url = process.env['AI_GATEWAY_REDIS_URL']
  if (!url) return null
  if (_redis) return _redis
  try {
    const { default: Redis } = (await import('ioredis')) as unknown as {
      default: new (url: string) => RedisClient
    }
    _redis = new Redis(url)
    return _redis
  } catch {
    return null
  }
}

function _requiresDurableGatewayState(): boolean {
  return process.env['NODE_ENV'] === 'production'
}

function _requiresTenantModelAllowlist(lockdownLevel?: string): boolean {
  return (
    process.env['NODE_ENV'] === 'production' ||
    lockdownLevel === 'strong' ||
    lockdownLevel === 'strict'
  )
}

async function _isRateLimited(userId: string, redis: RedisClient | null): Promise<boolean> {
  if (redis) {
    const key = `ratelimit:${userId}:${Math.floor(Date.now() / 60_000)}`
    const current = await redis.incrby(key, 1)
    await redis.expire(key, 60)
    return current > _RATE_LIMIT_RPM
  }
  // In-memory fallback
  const now = Date.now()
  const windowMs = 60_000
  const timestamps = _rateWindows.get(userId) ?? []
  const recent = timestamps.filter((t) => now - t < windowMs)
  if (recent.length >= _RATE_LIMIT_RPM) return true
  recent.push(now)
  _rateWindows.set(userId, recent)
  return false
}

// ── Per-tenant budget ─────────────────────────────────────────────────────────
// In-memory resets on pod restart — use Redis for multi-instance deployments.
const _MONTHLY_BUDGET = Number(process.env['AI_GATEWAY_MONTHLY_BUDGET_TOKENS'] ?? 1_000_000)
const _monthlyUsage = new Map<string, number>()

async function _isOverBudget(
  orgId: string,
  promptTokenEstimate: number,
  redis: RedisClient | null,
): Promise<boolean> {
  const key = `budget:${orgId}:${new Date().toISOString().slice(0, 7)}`
  if (redis) {
    const current = await redis.incrby(key, promptTokenEstimate)
    if (current === promptTokenEstimate) {
      // First increment this month — set TTL to 35 days
      await redis.expire(key, 35 * 24 * 60 * 60)
    }
    return current > _MONTHLY_BUDGET
  }
  // In-memory fallback
  const used = _monthlyUsage.get(key) ?? 0
  if (used + promptTokenEstimate > _MONTHLY_BUDGET) return true
  _monthlyUsage.set(key, used + promptTokenEstimate)
  return false
}

// ── Main evaluation function ───────────────────────────────────────────────────

export async function evaluateAiGatewayRequest(
  request: AiGatewayRequest,
): Promise<AiGatewayDecision> {
  const { context, model, promptTokenEstimate, userMessage, lockdownLevel } = request
  const provider = request.provider ?? _APPROVED_MODEL_CATALOG.get(model) ?? model

  // 1. Global approved model catalog. Tenant policy narrows this further below.
  if (!_APPROVED_MODEL_CATALOG.has(model)) {
    await _auditLog(context, model, 'failure', 'model_not_allowed')
    return { allowed: false, reason: `Model '${model}' is not in the approved model catalog` }
  }

  const redis = await _getRedis()
  if (redis === null && _requiresDurableGatewayState()) {
    await _auditLog(context, model, 'failure', 'durable_gateway_state_required')
    return {
      allowed: false,
      reason: 'AI gateway requires durable Redis-backed rate and budget state in production',
    }
  }

  // 2. Tenant model allowlist. Production and strong/strict lockdown both deny by
  // default unless the exact provider + model pair is approved for the tenant.
  if (_requiresTenantModelAllowlist(lockdownLevel)) {
    const tenantAllowed = await _isTenantAllowedModel(context.orgId, provider, model)
    if (!tenantAllowed) {
      await _auditLog(context, model, 'failure', `tenant_model_not_allowed:${provider}:${model}`)
      return {
        allowed: false,
        reason: `Model '${provider}:${model}' is not approved for this tenant`,
      }
    }
  }

  // 3. Per-user rate limit
  if (await _isRateLimited(context.userId, redis)) {
    await _auditLog(context, model, 'failure', 'rate_limited')
    return { allowed: false, reason: 'Rate limit exceeded — maximum 20 requests per minute' }
  }

  // 4. Per-tenant budget
  if (await _isOverBudget(context.orgId, promptTokenEstimate, redis)) {
    await _auditLog(context, model, 'failure', 'budget_exceeded')
    return { allowed: false, reason: 'Monthly AI token budget exceeded for this organisation' }
  }

  // 5. PII screening
  const { clean, detected } = _screenPii(userMessage)
  if (detected.length > 0) {
    const mode = _sensitiveDataMode()
    await _auditLog(context, model, 'failure', `sensitive_data_detected:${detected.join(',')}`)
    if (mode === 'block') {
      return { allowed: false, reason: 'Sensitive data detected; external AI call blocked' }
    }
    if (mode === 'allow-with-approval') {
      return { allowed: false, reason: 'Sensitive data requires explicit approval before AI use' }
    }
    await _auditLog(context, model, 'success', 'sensitive_data_redacted')
    return { allowed: true, sanitisedMessage: clean }
  }

  // 6. Audit log — approved call
  await _auditLog(context, model, 'success', 'approved')
  return { allowed: true, sanitisedMessage: userMessage }
}

async function _auditLog(
  context: AuthenticatedContext,
  model: string,
  outcome: string,
  reason: string,
): Promise<void> {
  try {
    await writeAuditEvent({
      tenantId: context.orgId,
      userId: context.userId,
      eventType: 'ai.call',
      resourceType: model,
      details: {
        outcome,
        reason,
      },
    })
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        message: 'AI gateway audit log failed',
        error: String(err),
      }) + '\n',
    )
    if (process.env['NODE_ENV'] === 'production') throw err
  }
}
