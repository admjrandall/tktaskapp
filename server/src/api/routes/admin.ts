import { Hono } from 'hono'
import { usersService } from '../../services/users.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import { LegalHoldService } from '../../kms/legal-hold.js'
import { AzureKeyVaultKeyService, LegalHoldActiveError } from '../../kms/key-service.js'
import { writeAuditEvent } from '../../services/base.js'
import type { HonoEnv } from '../../hono-types.js'
import { EraseUserSchema, safeParseV } from '../../schemas/index.js'

const legalHoldService = new LegalHoldService()

export const adminRouter = new Hono<HonoEnv>()

adminRouter.get('/users', opaMiddleware('manage_users'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, status } = c.req.query()
    return c.json(
      await usersService.list(tenantId, {
        ...(status !== undefined ? { status } : {}),
        ...(page !== undefined ? { page: Number(page) } : {}),
        ...(pageSize !== undefined ? { pageSize: Number(pageSize) } : {}),
      }),
      200,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-users-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

adminRouter.get('/users/:id', opaMiddleware('manage_users'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const user = await usersService.getById(tenantId, c.req.param('id')!)
    return user ? c.json(user, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-users-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

adminRouter.post('/users/:id/suspend', opaMiddleware('suspend_user'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const requestedBy = c.get('userId') as string
  const targetId = c.req.param('id')!
  try {
    const ok = await usersService.suspend(tenantId, requestedBy, targetId)
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-suspend',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

adminRouter.post('/users/:id/erase', opaMiddleware('erase_user'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const requestedBy = c.get('userId') as string
  const targetId = c.req.param('id')!

  try {
    const parsed = safeParseV(EraseUserSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)

    const onHold = await legalHoldService.isUserOnHold(targetId)
    if (onHold) {
      return c.json(
        { error: 'Legal hold is active — erasure cannot be scheduled', code: 'LEGAL_HOLD_ACTIVE' },
        409,
      )
    }

    const vaultUrl = process.env['AZURE_KV_URL'] ?? ''
    if (vaultUrl) {
      const kmsService = new AzureKeyVaultKeyService(vaultUrl)
      await kmsService.scheduleKeyDestruction(targetId, tenantId, new Date(parsed.data.destroyAt))
    }

    const auditEventId = await writeAuditEvent({
      tenantId,
      userId: requestedBy,
      eventType: 'gdpr_erasure_requested',
      resourceType: 'users',
      resourceId: targetId,
      details: { destroyAt: parsed.data.destroyAt, reason: parsed.data.reason ?? 'DSAR' },
    })

    return c.json({ userId: targetId, destroyAt: parsed.data.destroyAt, auditEventId }, 202)
  } catch (err) {
    if (err instanceof LegalHoldActiveError) {
      return c.json({ error: 'Legal hold is active', code: 'LEGAL_HOLD_ACTIVE' }, 409)
    }
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-erase',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
