// GET /api/v1/exports/:jobId — retrieve the result of an async data export job.
// The export processor stores the formatted payload in Redis under `export:{requestId}`.
// This route retrieves and streams it back to the authenticated requester.

import { Hono } from 'hono'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { describeRoute } from 'hono-openapi'
import { getBullRedis } from '../../queues/redis.js'
import { enqueueJob } from '../../queues/index.js'
import * as v from 'valibot'
import { safeParseV } from '../../schemas/index.js'

export const exportsRouter = new Hono<HonoEnv>()

// ── POST / — enqueue a new async export ───────────────────────────────────────

const EnqueueExportSchema = v.object({
  format: v.optional(v.picklist(['csv', 'json']), 'csv'),
  resource: v.optional(
    v.picklist(['audit', 'clients', 'tasks', 'people', 'projects', 'all']),
    'all',
  ),
})

exportsRouter.post(
  '/',
  describeRoute({
    tags: ['Exports'],
    summary: 'Enqueue an async data export',
    responses: { 202: { description: 'Accepted — poll GET /exports/:jobId for result' } },
  }),
  opaMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const body: unknown = await c.req.json().catch(() => ({}))
      const parsed = safeParseV(EnqueueExportSchema, body)
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const requestId = crypto.randomUUID()
      const jobId = await enqueueJob({
        type: 'data:export',
        tenantId,
        userId,
        format: parsed.data.format,
        resource: parsed.data.resource,
        requestId,
      })
      return c.json({ jobId, requestId, status: 'queued' }, 202)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'exports-enqueue',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// ── GET /:jobId — retrieve completed export payload ───────────────────────────

exportsRouter.get(
  '/:jobId',
  describeRoute({
    tags: ['Exports'],
    summary: 'Retrieve a completed async export by job ID',
    responses: {
      200: { description: 'Export data' },
      202: { description: 'Export still in progress' },
      404: { description: 'Export not found or expired' },
    },
  }),
  opaMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const jobId = c.req.param('jobId')
    try {
      // Look up job status in BullMQ
      const { getCrmQueue } = await import('../../queues/instance.js')
      const queue = await getCrmQueue()
      const job = await queue.getJob(jobId)
      if (!job) return c.json({ error: 'Export job not found' }, 404)

      const state = await job.getState()
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        return c.json({ jobId, status: state, progress: job.progress }, 202)
      }
      if (state === 'failed') {
        return c.json({ jobId, status: 'failed', error: job.failedReason }, 500)
      }

      // Completed — retrieve from Redis
      const result = job.returnvalue as { exportKey?: string } | null
      if (!result?.exportKey) return c.json({ error: 'Export result not available' }, 404)

      const redis = await getBullRedis()
      const data = await redis.get(result.exportKey)
      if (!data) return c.json({ error: 'Export result expired' }, 404)

      const isJson = result.exportKey.endsWith('-json') || data.trimStart().startsWith('[')
      const contentType = isJson ? 'application/json' : 'text/csv'
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="export-${jobId}.${isJson ? 'json' : 'csv'}"`,
          'X-Tenant-Id': tenantId,
        },
      })
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'exports-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
