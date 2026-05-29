import { Hono } from 'hono'
import {
  projectsService,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '../../services/projects.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreateProjectSchema, UpdateProjectSchema, safeParseV } from '../../schemas/index.js'
import { describeRoute } from 'hono-openapi'
import { resolver } from '../../schemas/index.js'

export const projectsRouter = new Hono<HonoEnv>()

projectsRouter.get(
  '/',
  describeRoute({
    tags: ['Projects'],
    summary: 'List projects',
    responses: { 200: { description: 'Paginated project list' } },
  }),
  opaMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const { page, pageSize, search, clientId, stage, priority, cursor } = c.req.query()
      const shared = {
        ...(search !== undefined ? { search } : {}),
        ...(clientId !== undefined ? { clientId } : {}),
        ...(stage !== undefined ? { stage } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(pageSize !== undefined ? { pageSize: Number(pageSize) } : {}),
      }
      if (cursor !== undefined) {
        return c.json(await projectsService.listCursor(tenantId, { ...shared, cursor }), 200)
      }
      return c.json(
        await projectsService.list(tenantId, {
          ...shared,
          ...(page !== undefined ? { page: Number(page) } : {}),
        }),
        200,
      )
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'proj-list',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

projectsRouter.post(
  '/',
  describeRoute({
    tags: ['Projects'],
    summary: 'Create project',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(CreateProjectSchema) } },
    },
    responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' } },
  }),
  opaMiddleware('create'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(CreateProjectSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      return c.json(
        await projectsService.create(
          tenantId,
          userId,
          parsed.data as unknown as CreateProjectInput,
        ),
        201,
      )
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'proj-create',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

projectsRouter.get(
  '/:id',
  describeRoute({
    tags: ['Projects'],
    summary: 'Get project by ID',
    responses: { 200: { description: 'Success' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('read', 'projects', async (_c, tenantId, resourceId) => {
    const row = await projectsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await projectsService.getById(tenantId, c.req.param('id'))
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'proj-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

projectsRouter.patch(
  '/:id',
  describeRoute({
    tags: ['Projects'],
    summary: 'Update project',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(UpdateProjectSchema) } },
    },
    responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('update', 'projects', async (_c, tenantId, resourceId) => {
    const row = await projectsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateProjectSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await projectsService.update(
        tenantId,
        userId,
        c.req.param('id'),
        parsed.data as unknown as UpdateProjectInput,
      )
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'proj-update',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

projectsRouter.delete(
  '/:id',
  describeRoute({
    tags: ['Projects'],
    summary: 'Delete project',
    responses: { 204: { description: 'Deleted' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('delete', 'projects', async (_c, tenantId, resourceId) => {
    const row = await projectsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await projectsService.delete(tenantId, userId, c.req.param('id'))
      return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'proj-delete',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
