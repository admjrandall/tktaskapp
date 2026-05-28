import { Hono } from 'hono'
import { documentsService, type UpdateDocumentInput } from '../../services/documents.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateDocumentSchema, UpdateDocumentSchema, safeParseV } from '../../schemas/index.js'
import { describeRoute } from 'hono-openapi'
import { resolver } from '../../schemas/index.js'

export const documentsRouter = new Hono<HonoEnv>()

documentsRouter.get(
  '/',
  describeRoute({
    tags: ['Documents'],
    summary: 'List documents',
    responses: { 200: { description: 'Paginated document list' } },
  }),
  opaMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const { page, pageSize, search, linkedStore, linkedId } = c.req.query()
      return c.json(
        await documentsService.list(tenantId, {
          ...(search !== undefined ? { search } : {}),
          ...(linkedStore !== undefined ? { linkedStore } : {}),
          ...(linkedId !== undefined ? { linkedId } : {}),
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
        requestId: 'docs-list',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

documentsRouter.post(
  '/',
  describeRoute({
    tags: ['Documents'],
    summary: 'Create document',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(CreateDocumentSchema) } },
    },
    responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' } },
  }),
  opaMiddleware('create'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(CreateDocumentSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
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
  },
)

documentsRouter.get(
  '/:id',
  describeRoute({
    tags: ['Documents'],
    summary: 'Get document by ID',
    responses: { 200: { description: 'Success' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('read', 'documents', async (_c, tenantId, resourceId) => {
    const row = await documentsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
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
  },
)

documentsRouter.patch(
  '/:id',
  describeRoute({
    tags: ['Documents'],
    summary: 'Update document',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(UpdateDocumentSchema) } },
    },
    responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('update', 'documents', async (_c, tenantId, resourceId) => {
    const row = await documentsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateDocumentSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await documentsService.update(
        tenantId,
        userId,
        c.req.param('id'),
        parsed.data as unknown as UpdateDocumentInput,
      )
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
  },
)

documentsRouter.delete(
  '/:id',
  describeRoute({
    tags: ['Documents'],
    summary: 'Delete document',
    responses: { 204: { description: 'Deleted' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('delete', 'documents', async (_c, tenantId, resourceId) => {
    const row = await documentsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
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
  },
)
