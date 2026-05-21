import { Hono } from 'hono'
import { z } from 'zod'
import { tasksService } from '../../services/tasks.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  status: z.enum(['Todo', 'In Progress', 'Blocked', 'Done']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  description: z.string().optional(),
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const tasksRouter = new Hono()

tasksRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const q = c.req.query()
    return c.json(
      await tasksService.list(tenantId, {
        search: q['search'],
        projectId: q['projectId'],
        status: q['status'],
        priority: q['priority'],
        assigneeId: q['assigneeId'],
        overdue: q['overdue'] === 'true',
        dueToday: q['dueToday'] === 'true',
        page: q['page'] ? Number(q['page']) : undefined,
        pageSize: q['pageSize'] ? Number(q['pageSize']) : undefined,
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
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
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

tasksRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
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
})

tasksRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const row = await tasksService.update(tenantId, userId, c.req.param('id'), parsed.data)
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
})

tasksRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
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
})
