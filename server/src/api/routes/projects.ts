import { Hono } from 'hono'
import {
  projectsService,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '../../services/projects.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateProjectSchema, UpdateProjectSchema, safeParseV } from '../../schemas/index.js'

export const projectsRouter = new Hono<HonoEnv>()

projectsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, search, clientId, stage, priority } = c.req.query()
    return c.json(
      await projectsService.list(tenantId, {
        ...(search !== undefined ? { search } : {}),
        ...(clientId !== undefined ? { clientId } : {}),
        ...(stage !== undefined ? { stage } : {}),
        ...(priority !== undefined ? { priority } : {}),
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
    const parsed = safeParseV(CreateProjectSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    return c.json(
      await projectsService.create(tenantId, userId, parsed.data as unknown as CreateProjectInput),
      201,
    )
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
    const row = await projectsService.getById(tenantId, c.req.param('id')!)
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
    const parsed = safeParseV(UpdateProjectSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    const row = await projectsService.update(
      tenantId,
      userId,
      c.req.param('id')!,
      parsed.data as unknown as UpdateProjectInput,
    )
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
    const ok = await projectsService.delete(tenantId, userId, c.req.param('id')!)
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
