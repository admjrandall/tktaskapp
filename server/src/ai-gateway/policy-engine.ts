// AI gateway policy engine — concrete implementation.
// ISO 42001:2023 alignment: per-tenant budget, rate limiting, PII screening, model allowlist, audit logging.

import type { AuthenticatedContext } from '../auth/oidc.js'
import { db } from '../db/index.js'
import { auditEvents } from '../db/schema/audit-events.js'

export interface AiGatewayRequest {
  context: AuthenticatedContext
  model: string
  promptTokenEstimate: number
  systemPrompt?: string
  userMessage: string
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

// ── Model allowlist ────────────────────────────────────────────────────────────
const _ALLOWED_MODELS = new Set([
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
])

// ── Per-user rate limiting (in-memory sliding window) ─────────────────────────
// Phase 9+: migrate to Redis for multi-instance deployments.
const _RATE_LIMIT_RPM = 20
const _rateWindows = new Map<string, number[]>()

function _isRateLimited(userId: string): boolean {
  const now = Date.now()
  const windowMs = 60_000
  const timestamps = _rateWindows.get(userId) ?? []
  const recent = timestamps.filter((t) => now - t < windowMs)
  if (recent.length >= _RATE_LIMIT_RPM) return true
  recent.push(now)
  _rateWindows.set(userId, recent)
  return false
}

// ── Per-tenant budget (in-memory; Phase 9+: DB-backed) ─────────────────────────
const _DEFAULT_MONTHLY_TOKEN_BUDGET = 1_000_000
const _monthlyUsage = new Map<string, number>()

function _isOverBudget(orgId: string, promptTokenEstimate: number): boolean {
  const key = `${orgId}:${new Date().toISOString().slice(0, 7)}`
  const used = _monthlyUsage.get(key) ?? 0
  if (used + promptTokenEstimate > _DEFAULT_MONTHLY_TOKEN_BUDGET) return true
  _monthlyUsage.set(key, used + promptTokenEstimate)
  return false
}

// ── Main evaluation function ───────────────────────────────────────────────────

export async function evaluateAiGatewayRequest(
  request: AiGatewayRequest,
): Promise<AiGatewayDecision> {
  const { context, model, promptTokenEstimate, userMessage } = request

  // 1. Model allowlist
  if (!_ALLOWED_MODELS.has(model)) {
    await _auditLog(context, model, 'failure', 'model_not_allowed')
    return { allowed: false, reason: `Model '${model}' is not on the approved allowlist` }
  }

  // 2. Per-user rate limit
  if (_isRateLimited(context.userId)) {
    await _auditLog(context, model, 'failure', 'rate_limited')
    return { allowed: false, reason: 'Rate limit exceeded — maximum 20 requests per minute' }
  }

  // 3. Per-tenant budget
  if (_isOverBudget(context.orgId, promptTokenEstimate)) {
    await _auditLog(context, model, 'failure', 'budget_exceeded')
    return { allowed: false, reason: 'Monthly AI token budget exceeded for this organisation' }
  }

  // 4. PII screening
  const { clean, detected } = _screenPii(userMessage)
  if (detected.length > 0) {
    await _auditLog(context, model, 'failure', `pii_detected:${detected.join(',')}`)
    // Return sanitised message — don't block the request, but scrub the PII
    await _auditLog(context, model, 'success', 'pii_scrubbed')
    return { allowed: true, sanitisedMessage: clean }
  }

  // 5. Audit log — approved call
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
    await db.insert(auditEvents).values({
      orgId: context.orgId,
      userId: context.userId,
      action: 'ai.call',
      resource: model,
      outcome,
      metadata: { reason },
    })
  } catch {
    // Fire-and-forget — never let audit failure block the request
  }
}
