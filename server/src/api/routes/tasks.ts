import { Hono } from 'hono'
import { tasksService, type UpdateTaskInput } from '../../services/tasks.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateTaskSchema, UpdateTaskSchema, safeParseV } from '../../schemas/index.js'

export const tasksRouter = new Hono<HonoEnv>()

tasksRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
  try {
    const q = c.req.query()
    return c.json(
      await tasksService.list(tenantId, {
        ...(q['search'] !== undefined ? { search: q['search'] } : {}),
        ...(q['projectId'] !== undefined ? { projectId: q['projectId'] } : {}),
        ...(q['status'] !== undefined ? { status: q['status'] } : {}),
        ...(q['priority'] !== undefined ? { priority: q['priority'] } : {}),
        ...(q['assigneeId'] !== undefined ? { assigneeId: q['assigneeId'] } : {}),
        overdue: q['overdue'] === 'true',
        dueToday: q['dueToday'] === 'true',
        ...(q['page'] !== undefined ? { page: Number(q['page']) } : {}),
        ...(q['pageSize'] !== undefined ? { pageSize: Number(q['pageSize']) } : {}),
      }),
      200,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'tasks-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

tasksRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(CreateTaskSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    return c.json(await tasksService.create(tenantId, userId, parsed.data), 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'tasks-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

tasksRouter.get(
  '/:id',
  resourcePolicyMiddleware('read', 'tasks', async (_c, tenantId, resourceId) => {
    const row = await tasksService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await tasksService.getById(tenantId, c.req.param('id'))
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'tasks-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

tasksRouter.patch(
  '/:id',
  resourcePolicyMiddleware('update', 'tasks', async (_c, tenantId, resourceId) => {
    const row = await tasksService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateTaskSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await tasksService.update(
        tenantId,
        userId,
        c.req.param('id'),
        parsed.data as unknown as UpdateTaskInput,
      )
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'tasks-update',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

tasksRouter.delete(
  '/:id',
  resourcePolicyMiddleware('delete', 'tasks', async (_c, tenantId, resourceId) => {
    const row = await tasksService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await tasksService.delete(tenantId, userId, c.req.param('id'))
      return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'tasks-delete',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
