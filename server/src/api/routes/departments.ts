import { Hono } from 'hono'
import { z } from 'zod'
import {
  departmentsService,
  type UpdateDepartmentInput,
} from '../../services/departments.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const departmentsRouter = new Hono<HonoEnv>()

departmentsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, search } = c.req.query()
    return c.json(
      await departmentsService.list(tenantId, {
        ...(search !== undefined ? { search } : {}),
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
      requestId: 'dept-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

departmentsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    return c.json(await departmentsService.create(tenantId, userId, parsed.data), 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'dept-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

departmentsRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await departmentsService.getById(tenantId, c.req.param('id')!)
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'dept-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

departmentsRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const row = await departmentsService.update(
      tenantId,
      userId,
      c.req.param('id')!,
      parsed.data as UpdateDepartmentInput,
    )
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'dept-update',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

departmentsRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await departmentsService.delete(tenantId, userId, c.req.param('id')!)
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'dept-delete',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
