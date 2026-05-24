import type { Context, Next } from 'hono'
import { validateEntraIdToken } from './oidc.js'
import { db } from '../db/index.js'
import { tenantUsers } from '../db/schema/users.js'
import { eq, and, isNull } from 'drizzle-orm'

export async function authMiddleware(c: Context, next: Next): Promise<Response | undefined> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)
  try {
    const claims = await validateEntraIdToken(token)

    // Look up the internal user record to get role
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

    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
