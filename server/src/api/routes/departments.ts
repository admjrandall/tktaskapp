import { Hono } from 'hono'
import {
  departmentsService,
  type UpdateDepartmentInput,
} from '../../services/departments.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateDepartmentSchema, UpdateDepartmentSchema, safeParseV } from '../../schemas/index.js'

export const departmentsRouter = new Hono<HonoEnv>()

departmentsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
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
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(CreateDepartmentSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
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

departmentsRouter.get(
  '/:id',
  resourcePolicyMiddleware('read', 'departments', async (_c, tenantId, resourceId) => {
    const row = await departmentsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await departmentsService.getById(tenantId, c.req.param('id'))
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
  },
)

departmentsRouter.patch(
  '/:id',
  resourcePolicyMiddleware('update', 'departments', async (_c, tenantId, resourceId) => {
    const row = await departmentsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateDepartmentSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await departmentsService.update(
        tenantId,
        userId,
        c.req.param('id'),
        parsed.data as unknown as UpdateDepartmentInput,
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
  },
)

departmentsRouter.delete(
  '/:id',
  resourcePolicyMiddleware('delete', 'departments', async (_c, tenantId, resourceId) => {
    const row = await departmentsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await departmentsService.delete(tenantId, userId, c.req.param('id'))
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
  },
)
