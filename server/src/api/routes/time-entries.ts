import { Hono } from 'hono'
import {
  timeEntriesService,
  type CreateTimeEntryInput,
  type UpdateTimeEntryInput,
} from '../../services/time-entries.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateTimeEntrySchema, UpdateTimeEntrySchema, safeParseV } from '../../schemas/index.js'

export const timeEntriesRouter = new Hono<HonoEnv>()

timeEntriesRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
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
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(CreateTimeEntrySchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    const data = {
      ...parsed.data,
      startedAt: new Date(parsed.data.startedAt),
      endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : undefined,
    }
    return c.json(
      await timeEntriesService.create(tenantId, userId, data as unknown as CreateTimeEntryInput),
      201,
    )
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

timeEntriesRouter.get(
  '/:id',
  resourcePolicyMiddleware('read', 'timeEntries', async (_c, tenantId, resourceId) => {
    const row = await timeEntriesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await timeEntriesService.getById(tenantId, c.req.param('id'))
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
  },
)

timeEntriesRouter.patch(
  '/:id',
  resourcePolicyMiddleware('update', 'timeEntries', async (_c, tenantId, resourceId) => {
    const row = await timeEntriesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateTimeEntrySchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const changes = {
        ...parsed.data,
        ...(parsed.data.startedAt ? { startedAt: new Date(parsed.data.startedAt) } : {}),
        ...(parsed.data.endedAt ? { endedAt: new Date(parsed.data.endedAt) } : {}),
      }
      const row = await timeEntriesService.update(
        tenantId,
        userId,
        c.req.param('id'),
        changes as unknown as UpdateTimeEntryInput,
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
  },
)

timeEntriesRouter.delete(
  '/:id',
  resourcePolicyMiddleware('delete', 'timeEntries', async (_c, tenantId, resourceId) => {
    const row = await timeEntriesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await timeEntriesService.delete(tenantId, userId, c.req.param('id'))
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
  },
)
