import { Hono } from 'hono'
import { clientsService, type UpdateClientInput } from '../../services/clients.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateClientSchema, UpdateClientSchema, safeParseV } from '../../schemas/index.js'

export const clientsRouter = new Hono<HonoEnv>()

clientsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, search, stage } = c.req.query()
    const result = await clientsService.list(tenantId, {
      ...(search !== undefined ? { search } : {}),
      ...(stage !== undefined ? { stage } : {}),
      ...(page !== undefined ? { page: Number(page) } : {}),
      ...(pageSize !== undefined ? { pageSize: Number(pageSize) } : {}),
    })
    return c.json(result, 200)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'clients-list',
      message: 'Error listing clients',
      extra: { error: String(err) },
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

clientsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const body = await c.req.json()
    const parsed = safeParseV(CreateClientSchema, body)
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    const client = await clientsService.create(tenantId, userId, parsed.data)
    return c.json(client, 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'clients-create',
      message: 'Error creating client',
      extra: { error: String(err) },
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

clientsRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const id = c.req.param('id')!
  try {
    const client = await clientsService.getById(tenantId, id)
    if (!client) return c.json({ error: 'Not found' }, 404)
    return c.json(client, 200)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'clients-get',
      message: 'Error getting client',
      extra: { error: String(err) },
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

clientsRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  const id = c.req.param('id')!
  try {
    const body = await c.req.json()
    const parsed = safeParseV(UpdateClientSchema, body)
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    const client = await clientsService.update(
      tenantId,
      userId,
      id,
      parsed.data as unknown as UpdateClientInput,
    )
    if (!client) return c.json({ error: 'Not found' }, 404)
    return c.json(client, 200)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'clients-update',
      message: 'Error updating client',
      extra: { error: String(err) },
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

clientsRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  const id = c.req.param('id')!
  try {
    const ok = await clientsService.delete(tenantId, userId, id)
    if (!ok) return c.json({ error: 'Not found' }, 404)
    return c.body(null, 204)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'clients-delete',
      message: 'Error deleting client',
      extra: { error: String(err) },
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
