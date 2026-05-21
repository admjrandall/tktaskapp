import { Hono } from 'hono'
import { z } from 'zod'
import {
  notificationsService,
  type UpdateNotificationInput,
} from '../../services/notifications.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  title: z.string().min(1),
  body: z.string().optional(),
  type: z.enum(['info', 'warning', 'due_soon', 'overdue', 'mention']).optional(),
  relatedStore: z.string().optional(),
  relatedId: z.string().optional(),
  read: z.boolean().optional(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const notificationsRouter = new Hono<HonoEnv>()

notificationsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const { page, pageSize, read } = c.req.query()
    return c.json(
      await notificationsService.list(tenantId, {
        userId,
        ...(read !== undefined ? { read: read === 'true' } : {}),
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
      requestId: 'notif-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

notificationsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    return c.json(await notificationsService.create(tenantId, userId, parsed.data), 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'notif-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

notificationsRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await notificationsService.getById(tenantId, c.req.param('id')!)
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'notif-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

notificationsRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const row = await notificationsService.update(
      tenantId,
      userId,
      c.req.param('id')!,
      parsed.data as UpdateNotificationInput,
    )
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'notif-update',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

notificationsRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await notificationsService.delete(tenantId, userId, c.req.param('id')!)
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'notif-delete',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
