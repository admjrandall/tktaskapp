import { Hono } from 'hono'
import { z } from 'zod'
import { documentsService } from '../../services/documents.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  body: z.string().optional(),
  linkedStore: z.string().optional(),
  linkedId: z.string().optional(),
  section: z.string().optional(),
  pinned: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const documentsRouter = new Hono()

documentsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, search, linkedStore, linkedId } = c.req.query()
    return c.json(
      await documentsService.list(tenantId, {
        search,
        linkedStore,
        linkedId,
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
      requestId: 'docs-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

documentsRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    return c.json(await documentsService.create(tenantId, userId, parsed.data), 201)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'docs-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

documentsRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await documentsService.getById(tenantId, c.req.param('id'))
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'docs-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

documentsRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const row = await documentsService.update(tenantId, userId, c.req.param('id'), parsed.data)
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'docs-update',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

documentsRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await documentsService.delete(tenantId, userId, c.req.param('id'))
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'docs-delete',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
