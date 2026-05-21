import type { Context, Next } from 'hono'
import { validateEntraIdToken } from './oidc.js'
import { db } from '../db/index.js'
import { tenantUsers } from '../db/schema/users.js'
import { eq, and } from 'drizzle-orm'

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
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
          eq(tenantUsers.deletedAt, null as never),
        ),
      )
      .limit(1)

    const user = users[0]
    const role = user?.role ?? 'viewer'
    const userId = user?.id ?? claims.externalId

    c.set('userId', userId)
    c.set('tenantId', claims.tenantId)
    c.set('role', role)
    c.set('externalId', claims.externalId)
    c.set('email', claims.email)

    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
