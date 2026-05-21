import { Hono } from 'hono'
import { z } from 'zod'
import {
  communicationsService,
  type UpdateCommunicationInput,
} from '../../services/communications.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['call', 'email', 'meeting', 'note']),
  subject: z.string().min(1),
  body: z.string().optional(),
  occurredAt: z.string().datetime(),
  durationMinutes: z.number().int().optional(),
  relatedStore: z.string().optional(),
  relatedId: z.string().optional(),
  personId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  createdBy: z.string(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const communicationsRouter = new Hono<HonoEnv>()

communicationsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, relatedStore, relatedId, clientId } = c.req.query()
    return c.json(
      await communicationsService.list(tenantId, {
        ...(relatedStore !== undefined ? { relatedStore } : {}),
        ...(relatedId !== undefined ? { relatedId } : {}),
        ...(clientId !== undefined ? { clientId } : {}),
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
      requestId: 'comm-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

communicationsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    return c.json(
      await communicationsService.create(tenantId, userId, {
        ...parsed.data,
        occurredAt: new Date(parsed.data.occurredAt),
      }),
      201,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'comm-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

communicationsRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await communicationsService.getById(tenantId, c.req.param('id')!)
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'comm-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

communicationsRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const changes = {
      ...parsed.data,
      ...(parsed.data.occurredAt ? { occurredAt: new Date(parsed.data.occurredAt) } : {}),
    }
    const row = await communicationsService.update(
      tenantId,
      userId,
      c.req.param('id')!,
      changes as UpdateCommunicationInput,
    )
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'comm-update',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

communicationsRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await communicationsService.delete(tenantId, userId, c.req.param('id')!)
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'comm-delete',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
