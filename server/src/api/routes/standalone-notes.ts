import { Hono } from 'hono'
import {
  standaloneNotesService,
  type UpdateNoteInput,
} from '../../services/standalone-notes.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import {
  CreateStandaloneNoteSchema,
  UpdateStandaloneNoteSchema,
  safeParseV,
} from '../../schemas/index.js'

export const standaloneNotesRouter = new Hono<HonoEnv>()

standaloneNotesRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const { page, pageSize, clientId, projectId, taskId, personId } = c.req.query()
    return c.json(
      await standaloneNotesService.list(tenantId, {
        ...(clientId !== undefined ? { clientId } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        ...(taskId !== undefined ? { taskId } : {}),
        ...(personId !== undefined ? { personId } : {}),
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
      requestId: 'notes-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

standaloneNotesRouter.post('/', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = safeParseV(CreateStandaloneNoteSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    return c.json(
      await standaloneNotesService.create(tenantId, userId, { ...parsed.data, createdBy: userId }),
      201,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'notes-create',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

standaloneNotesRouter.get('/:id', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  try {
    const row = await standaloneNotesService.getById(tenantId, c.req.param('id')!)
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'notes-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

standaloneNotesRouter.patch('/:id', opaMiddleware('update'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const parsed = safeParseV(UpdateStandaloneNoteSchema, await c.req.json())
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
    const row = await standaloneNotesService.update(
      tenantId,
      userId,
      c.req.param('id')!,
      parsed.data as unknown as UpdateNoteInput,
    )
    return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'notes-update',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

standaloneNotesRouter.delete('/:id', opaMiddleware('delete'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const ok = await standaloneNotesService.delete(tenantId, userId, c.req.param('id')!)
    return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'notes-delete',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
