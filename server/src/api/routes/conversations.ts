import { Hono } from 'hono'
import {
  conversationsService,
  type UpdateConversationInput,
} from '../../services/conversations.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import {
  CreateConversationSchema,
  UpdateConversationSchema,
  ConversationMessageSchema,
  safeParseV,
} from '../../schemas/index.js'

export const conversationsRouter = new Hono<HonoEnv>()

conversationsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const { page, pageSize } = c.req.query()
    return c.json(
      await conversationsService.list(tenantId, {
        userId,
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
      requestId: 'conv-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

conversationsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(CreateConversationSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    return c.json(
      await conversationsService.create(tenantId, userId, {
        ...parsed.data,
        userId: parsed.data.userId ?? userId,
      }),
      201,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'conv-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

conversationsRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
  try {
    const row = await conversationsService.getById(tenantId, c.req.param('id'))
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'conv-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

conversationsRouter.get('/:id/messages', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId')
  try {
    const row = await conversationsService.getById(tenantId, c.req.param('id'))
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ messages: row.messages }, 200)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'conv-messages',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

conversationsRouter.post('/:id/messages', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(ConversationMessageSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    const row = await conversationsService.appendMessage(
      tenantId,
      userId,
      c.req.param('id'),
      parsed.data,
    )
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'conv-append',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

conversationsRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const parsed = safeParseV(UpdateConversationSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    const row = await conversationsService.update(
      tenantId,
      userId,
      c.req.param('id'),
      parsed.data as unknown as UpdateConversationInput,
    )
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'conv-update',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

conversationsRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')
  try {
    const ok = await conversationsService.delete(tenantId, userId, c.req.param('id'))
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'conv-delete',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
