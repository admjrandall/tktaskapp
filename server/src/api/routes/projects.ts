import { Hono } from 'hono'
import { z } from 'zod'
import { projectsService } from '../../services/projects.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  stage: z.enum(['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  description: z.string().optional(),
  clientId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const projectsRouter = new Hono()

projectsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, search, clientId, stage, priority } = c.req.query()
    return c.json(
      await projectsService.list(tenantId, {
        search,
        clientId,
        stage,
        priority,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
      200,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'proj-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

projectsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    return c.json(await projectsService.create(tenantId, userId, parsed.data), 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'proj-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

projectsRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await projectsService.getById(tenantId, c.req.param('id'))
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'proj-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

projectsRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const row = await projectsService.update(tenantId, userId, c.req.param('id'), parsed.data)
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'proj-update',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

projectsRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await projectsService.delete(tenantId, userId, c.req.param('id'))
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'proj-delete',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
