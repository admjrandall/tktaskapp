import { Hono } from 'hono'
import {
  communicationsService,
  type CreateCommunicationInput,
  type UpdateCommunicationInput,
} from '../../services/communications.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import {
  CreateCommunicationSchema,
  UpdateCommunicationSchema,
  safeParseV,
} from '../../schemas/index.js'

export const communicationsRouter = new Hono<HonoEnv>()

communicationsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
  try {
    const { page, pageSize, relatedStore, relatedId, clientId } = c.req.query()
    return c.json(
      await communicationsService.list(tenantId, {
        ...(relatedStore !== undefined ? { relatedStore } : {}),
        ...(relatedId !== undefined ? { relatedId } : {}),
        ...(clientId !== undefined ? { clientId } : {}),
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
      requestId: 'comm-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

communicationsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(CreateCommunicationSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    return c.json(
      await communicationsService.create(tenantId, userId, {
        ...parsed.data,
        occurredAt: new Date(parsed.data.occurredAt),
      } as unknown as CreateCommunicationInput),
      201,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'comm-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

communicationsRouter.get(
  '/:id',
  resourcePolicyMiddleware('read', 'communications', async (_c, tenantId, resourceId) => {
    const row = await communicationsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await communicationsService.getById(tenantId, c.req.param('id'))
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'comm-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

communicationsRouter.patch(
  '/:id',
  resourcePolicyMiddleware('update', 'communications', async (_c, tenantId, resourceId) => {
    const row = await communicationsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateCommunicationSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const changes = {
        ...parsed.data,
        ...(parsed.data.occurredAt ? { occurredAt: new Date(parsed.data.occurredAt) } : {}),
      }
      const row = await communicationsService.update(
        tenantId,
        userId,
        c.req.param('id'),
        changes as unknown as UpdateCommunicationInput,
      )
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'comm-update',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

communicationsRouter.delete(
  '/:id',
  resourcePolicyMiddleware('delete', 'communications', async (_c, tenantId, resourceId) => {
    const row = await communicationsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await communicationsService.delete(tenantId, userId, c.req.param('id'))
      return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'comm-delete',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
