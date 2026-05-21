import { Hono } from 'hono'
import { z } from 'zod'
import {
  timeEntriesService,
  type UpdateTimeEntryInput,
} from '../../services/time-entries.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  userId: z.string(),
  description: z.string().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().optional(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const timeEntriesRouter = new Hono<HonoEnv>()

timeEntriesRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, taskId, userId } = c.req.query()
    return c.json(
      await timeEntriesService.list(tenantId, {
        ...(taskId !== undefined ? { taskId } : {}),
        ...(userId !== undefined ? { userId } : {}),
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
      requestId: 'te-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

timeEntriesRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const data = {
      ...parsed.data,
      startedAt: new Date(parsed.data.startedAt),
      endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : undefined,
    }
    return c.json(await timeEntriesService.create(tenantId, userId, data), 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'te-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

timeEntriesRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await timeEntriesService.getById(tenantId, c.req.param('id')!)
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'te-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

timeEntriesRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const changes = {
      ...parsed.data,
      ...(parsed.data.startedAt ? { startedAt: new Date(parsed.data.startedAt) } : {}),
      ...(parsed.data.endedAt ? { endedAt: new Date(parsed.data.endedAt) } : {}),
    }
    const row = await timeEntriesService.update(
      tenantId,
      userId,
      c.req.param('id')!,
      changes as UpdateTimeEntryInput,
    )
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'te-update',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

timeEntriesRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await timeEntriesService.delete(tenantId, userId, c.req.param('id')!)
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'te-delete',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
