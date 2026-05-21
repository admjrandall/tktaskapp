import { Hono } from 'hono'
import { z } from 'zod'
import { filesService, type UpdateFileInput } from '../../services/files.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'

const CreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  url: z.string().url().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().optional(),
  relatedStore: z.string().optional(),
  relatedId: z.string().optional(),
  uploadedBy: z.string().optional(),
})
const UpdateSchema = CreateSchema.partial().omit({ id: true })

export const filesRouter = new Hono<HonoEnv>()

filesRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
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
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = CreateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
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

filesRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await filesService.getById(tenantId, c.req.param('id')!)
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
})

filesRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = UpdateSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    const row = await filesService.update(
      tenantId,
      userId,
      c.req.param('id')!,
      parsed.data as UpdateFileInput,
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
})

filesRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await filesService.delete(tenantId, userId, c.req.param('id')!)
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
})
