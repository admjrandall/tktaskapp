import { Hono } from 'hono'
import {
  standaloneNotesService,
  type UpdateNoteInput,
} from '../../services/standalone-notes.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import {
  CreateStandaloneNoteSchema,
  UpdateStandaloneNoteSchema,
  safeParseV,
} from '../../schemas/index.js'
import { describeRoute } from 'hono-openapi'
import { resolver } from '../../schemas/index.js'

export const standaloneNotesRouter = new Hono<HonoEnv>()

standaloneNotesRouter.get(
  '/',
  describeRoute({
    tags: ['Standalone Notes'],
    summary: 'List standalone notes',
    responses: { 200: { description: 'Paginated note list' } },
  }),
  opaMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId')
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
  },
)

standaloneNotesRouter.post(
  '/',
  describeRoute({
    tags: ['Standalone Notes'],
    summary: 'Create standalone note',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(CreateStandaloneNoteSchema) } },
    },
    responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' } },
  }),
  opaMiddleware('create'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(CreateStandaloneNoteSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      return c.json(
        await standaloneNotesService.create(tenantId, userId, {
          ...parsed.data,
          createdBy: userId,
        }),
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
  },
)

standaloneNotesRouter.get(
  '/:id',
  describeRoute({
    tags: ['Standalone Notes'],
    summary: 'Get note by ID',
    responses: { 200: { description: 'Success' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('read', 'standaloneNotes', async (_c, tenantId, resourceId) => {
    const row = await standaloneNotesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await standaloneNotesService.getById(tenantId, c.req.param('id'))
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
  },
)

standaloneNotesRouter.patch(
  '/:id',
  describeRoute({
    tags: ['Standalone Notes'],
    summary: 'Update note',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(UpdateStandaloneNoteSchema) } },
    },
    responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('update', 'standaloneNotes', async (_c, tenantId, resourceId) => {
    const row = await standaloneNotesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateStandaloneNoteSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await standaloneNotesService.update(
        tenantId,
        userId,
        c.req.param('id'),
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
  },
)

standaloneNotesRouter.delete(
  '/:id',
  describeRoute({
    tags: ['Standalone Notes'],
    summary: 'Delete note',
    responses: { 204: { description: 'Deleted' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('delete', 'standaloneNotes', async (_c, tenantId, resourceId) => {
    const row = await standaloneNotesService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await standaloneNotesService.delete(tenantId, userId, c.req.param('id'))
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
  },
)
