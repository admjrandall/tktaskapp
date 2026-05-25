import { createHash } from 'node:crypto'
import type { Context, Next } from 'hono'
import { validateEntraIdToken } from './oidc.js'
import { getAuthStateStore } from './state-store.js'
import { db } from '../db/index.js'
import { tenantUsers } from '../db/schema/users.js'
import { eq, and, isNull } from 'drizzle-orm'

export async function authMiddleware(c: Context, next: Next): Promise<Response | undefined> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)

  // ── Revocation check — must run before JWT validation ────────────────────────
  // An explicitly revoked token must be rejected even if the JWT signature is valid.
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('base64url')
  try {
    const store = await getAuthStateStore()
    const revoked = await store.isAccessTokenRevoked(tokenHash)
    if (revoked) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  } catch {
    // Revocation store unavailable — deny in production; warn and continue in dev.
    if (process.env['NODE_ENV'] === 'production') {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }

  try {
    const claims = await validateEntraIdToken(token)

    // Bootstrap exception: tenant context is derived from this identity mapping,
    // so the query is constrained by Entra tenant + external subject before
    // request-scoped RLS variables can be set.
    const users = await db
      .select()
      .from(tenantUsers)
      .where(
        and(
          eq(tenantUsers.externalId, claims.externalId),
          eq(tenantUsers.entraTenantId, claims.tenantId),
          isNull(tenantUsers.deletedAt),
        ),
      )
      .limit(1)

    const user = users[0]
    if (!user) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    c.set('userId', user.id)
    c.set('tenantId', user.orgId)
    c.set('role', user.role)
    c.set('externalId', claims.externalId)
    c.set('email', claims.email)
    // Expose token hash so step-up middleware can revoke it on challenge failure
    c.set('tokenHash', tokenHash)

    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
