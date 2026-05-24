// Lockdown enforcement middleware (Phase 4, C.7).
// Reads the org's lockdown_level from org_settings, sets it on context,
// adds X-Lockdown-Level response header.  Routes and the AI gateway read
// c.get('lockdownLevel') for enforcement decisions.

import type { MiddlewareHandler } from 'hono'
import { sql } from 'drizzle-orm'
import { withTenant } from '../services/base.js'
import type { HonoEnv } from '../hono-types.js'

// ── In-process cache — 30s TTL (avoids per-request DB round-trips) ────────────
const _cache = new Map<string, { level: string; exp: number }>()

async function _getLockdownLevel(tenantId: string): Promise<string> {
  const cached = _cache.get(tenantId)
  if (cached && cached.exp > Date.now()) return cached.level

  try {
    const result = await withTenant(tenantId, async (tx) =>
      tx.execute(
        sql`SELECT lockdown_level FROM org_settings WHERE org_id = ${tenantId}::uuid LIMIT 1`,
      ),
    )
    const row = result.rows[0]
    const level = typeof row?.['lockdown_level'] === 'string' ? row['lockdown_level'] : 'off'
    _cache.set(tenantId, { level, exp: Date.now() + 30_000 })
    return level
  } catch {
    return 'off'
  }
}

/**
 * Invalidate the cached lockdown level for a tenant.
 * Call this after PATCH /api/v1/admin/org-settings.
 */
export function invalidateLockdownCache(tenantId: string): void {
  _cache.delete(tenantId)
}

/**
 * Fetches the org lockdown level and sets c.get('lockdownLevel').
 * Adds X-Lockdown-Level response header.
 * Must run after authMiddleware (needs tenantId on context).
 */
export function lockdownMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const tenantId = c.get('tenantId') as string | undefined
    if (!tenantId) {
      c.set('lockdownLevel', 'off')
      c.header('X-Lockdown-Level', 'off')
      await next()
      return
    }

    const level = await _getLockdownLevel(tenantId)
    c.set('lockdownLevel', level)
    c.header('X-Lockdown-Level', level)

    // strong / strict: refuse audit writes that are missing prev_hash
    // (checked here via Content-Type sniff — body consumption is route responsibility)
    if ((level === 'strong' || level === 'strict') && c.req.path === '/api/v1/audit') {
      const ct = c.req.header('Content-Type') ?? ''
      if (c.req.method === 'POST' && ct.includes('application/json')) {
        // Clone the request to peek at the body without consuming it
        const clone = c.req.raw.clone()
        try {
          const body = (await clone.json()) as Record<string, unknown>
          if (!body['prevHash']) {
            return c.json(
              {
                error: 'Audit events require prev_hash in strong lockdown mode',
                code: 'CHAIN_REQUIRED',
              },
              422,
            )
          }
        } catch {
          // Malformed JSON — let the route handle it
        }
      }
    }

    await next()
  }
}
