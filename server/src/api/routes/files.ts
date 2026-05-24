import { Hono } from 'hono'
import { filesService, type UpdateFileInput } from '../../services/files.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateFileSchema, UpdateFileSchema, safeParseV } from '../../schemas/index.js'

export const filesRouter = new Hono<HonoEnv>()

filesRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
  try {
    const { page, pageSize, relatedStore, relatedId } = c.req.query()
    return c.json(
      await filesService.list(tenantId, {
        ...(relatedStore !== undefined ? { relatedStore } : {}),
        ...(relatedId !== undefined ? { relatedId } : {}),
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
      requestId: 'files-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

filesRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(CreateFileSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    return c.json(await filesService.create(tenantId, userId, parsed.data), 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'files-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

filesRouter.get(
  '/:id',
  resourcePolicyMiddleware('read', 'files', async (_c, tenantId, resourceId) => {
    const row = await filesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await filesService.getById(tenantId, c.req.param('id'))
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'files-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

filesRouter.patch(
  '/:id',
  resourcePolicyMiddleware('update', 'files', async (_c, tenantId, resourceId) => {
    const row = await filesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateFileSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await filesService.update(
        tenantId,
        userId,
        c.req.param('id'),
        parsed.data as unknown as UpdateFileInput,
      )
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'files-update',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

filesRouter.delete(
  '/:id',
  resourcePolicyMiddleware('delete', 'files', async (_c, tenantId, resourceId) => {
    const row = await filesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await filesService.delete(tenantId, userId, c.req.param('id'))
      return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'files-delete',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
