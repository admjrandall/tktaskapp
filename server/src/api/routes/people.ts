import { Hono } from 'hono'
import { peopleService, type UpdatePersonInput } from '../../services/people.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { CreatePersonSchema, UpdatePersonSchema, safeParseV } from '../../schemas/index.js'
import { describeRoute } from 'hono-openapi'
import { resolver } from '../../schemas/index.js'

export const peopleRouter = new Hono<HonoEnv>()

peopleRouter.get(
  '/',
  describeRoute({
    tags: ['People'],
    summary: 'List people',
    responses: { 200: { description: 'Paginated people list' } },
  }),
  opaMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const { page, pageSize, search, clientId, departmentId } = c.req.query()
      return c.json(
        await peopleService.list(tenantId, {
          ...(search !== undefined ? { search } : {}),
          ...(clientId !== undefined ? { clientId } : {}),
          ...(departmentId !== undefined ? { departmentId } : {}),
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
        requestId: 'people-list',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

peopleRouter.post(
  '/',
  describeRoute({
    tags: ['People'],
    summary: 'Create person',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(CreatePersonSchema) } },
    },
    responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' } },
  }),
  opaMiddleware('create'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(CreatePersonSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      return c.json(await peopleService.create(tenantId, userId, parsed.data), 201)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'people-create',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

peopleRouter.get(
  '/:id',
  describeRoute({
    tags: ['People'],
    summary: 'Get person by ID',
    responses: { 200: { description: 'Success' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('read', 'people', async (_c, tenantId, resourceId) => {
    const row = await peopleService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await peopleService.getById(tenantId, c.req.param('id'))
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'people-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

peopleRouter.patch(
  '/:id',
  describeRoute({
    tags: ['People'],
    summary: 'Update person',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(UpdatePersonSchema) } },
    },
    responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('update', 'people', async (_c, tenantId, resourceId) => {
    const row = await peopleService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdatePersonSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await peopleService.update(
        tenantId,
        userId,
        c.req.param('id'),
        parsed.data as unknown as UpdatePersonInput,
      )
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'people-update',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

peopleRouter.delete(
  '/:id',
  describeRoute({
    tags: ['People'],
    summary: 'Delete person',
    responses: { 204: { description: 'Deleted' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('delete', 'people', async (_c, tenantId, resourceId) => {
    const row = await peopleService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await peopleService.delete(tenantId, userId, c.req.param('id'))
      return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'people-delete',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
