import { Hono } from 'hono'
import {
  notificationsService,
  type CreateNotificationInput,
  type UpdateNotificationInput,
} from '../../services/notifications.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import {
  CreateNotificationSchema,
  UpdateNotificationSchema,
  safeParseV,
} from '../../schemas/index.js'
import { describeRoute } from 'hono-openapi'
import { resolver } from '../../schemas/index.js'

export const notificationsRouter = new Hono<HonoEnv>()

notificationsRouter.get(
  '/',
  describeRoute({
    tags: ['Notifications'],
    summary: 'List notifications',
    responses: { 200: { description: 'Paginated notification list' } },
  }),
  opaMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const { page, pageSize, read } = c.req.query()
      return c.json(
        await notificationsService.list(tenantId, {
          userId,
          ...(read !== undefined ? { read: read === 'true' } : {}),
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
        requestId: 'notif-list',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

notificationsRouter.post(
  '/',
  describeRoute({
    tags: ['Notifications'],
    summary: 'Create notification',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(CreateNotificationSchema) } },
    },
    responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' } },
  }),
  opaMiddleware('create'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(CreateNotificationSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      return c.json(
        await notificationsService.create(
          tenantId,
          userId,
          parsed.data as unknown as CreateNotificationInput,
        ),
        201,
      )
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'notif-create',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

notificationsRouter.get(
  '/:id',
  describeRoute({
    tags: ['Notifications'],
    summary: 'Get notification by ID',
    responses: { 200: { description: 'Success' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('read', 'notifications', async (_c, tenantId, resourceId) => {
    const row = await notificationsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const row = await notificationsService.getById(tenantId, c.req.param('id'))
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'notif-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

notificationsRouter.patch(
  '/:id',
  describeRoute({
    tags: ['Notifications'],
    summary: 'Update notification',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(UpdateNotificationSchema) } },
    },
    responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('update', 'notifications', async (_c, tenantId, resourceId) => {
    const row = await notificationsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const parsed = safeParseV(UpdateNotificationSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const row = await notificationsService.update(
        tenantId,
        userId,
        c.req.param('id'),
        parsed.data as unknown as UpdateNotificationInput,
      )
      return row ? c.json(row, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'notif-update',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

notificationsRouter.delete(
  '/:id',
  describeRoute({
    tags: ['Notifications'],
    summary: 'Delete notification',
    responses: { 204: { description: 'Deleted' }, 404: { description: 'Not found' } },
  }),
  resourcePolicyMiddleware('delete', 'notifications', async (_c, tenantId, resourceId) => {
    const row = await notificationsService.getById(tenantId, resourceId)
    return row?.tenantId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const ok = await notificationsService.delete(tenantId, userId, c.req.param('id'))
      return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'notif-delete',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
