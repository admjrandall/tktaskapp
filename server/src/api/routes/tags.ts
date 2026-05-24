import { Hono } from 'hono'
import { tagsService, type UpdateTagInput } from '../../services/tags.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateTagSchema, UpdateTagSchema, safeParseV } from '../../schemas/index.js'

export const tagsRouter = new Hono<HonoEnv>()

tagsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
  try {
    const { page, pageSize, search } = c.req.query()
    return c.json(
      await tagsService.list(tenantId, {
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
      requestId: 'tags-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

tagsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(CreateTagSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    return c.json(await tagsService.create(tenantId, userId, parsed.data), 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'tags-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

tagsRouter.get(
  '/:id',
  resourcePolicyMiddleware('read', 'tags', async (_c, tenantId, resourceId) => {
    const row = await tagsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await tagsService.getById(tenantId, c.req.param('id'))
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'tags-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

tagsRouter.patch(
  '/:id',
  resourcePolicyMiddleware('update', 'tags', async (_c, tenantId, resourceId) => {
    const row = await tagsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateTagSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await tagsService.update(
        tenantId,
        userId,
        c.req.param('id'),
        parsed.data as unknown as UpdateTagInput,
      )
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'tags-update',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

tagsRouter.delete(
  '/:id',
  resourcePolicyMiddleware('delete', 'tags', async (_c, tenantId, resourceId) => {
    const row = await tagsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await tagsService.delete(tenantId, userId, c.req.param('id'))
      return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'tags-delete',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
