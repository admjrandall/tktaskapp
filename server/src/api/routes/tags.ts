import { Hono } from 'hono'
import { z } from 'zod'
import { tagsService, type UpdateTagInput } from '../../services/tags.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  color: z.string().optional(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const tagsRouter = new Hono<HonoEnv>()

tagsRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
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
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
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

tagsRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await tagsService.getById(tenantId, c.req.param('id')!)
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
})

tagsRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const row = await tagsService.update(
      tenantId,
      userId,
      c.req.param('id')!,
      parsed.data as UpdateTagInput,
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
})

tagsRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await tagsService.delete(tenantId, userId, c.req.param('id')!)
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
})
