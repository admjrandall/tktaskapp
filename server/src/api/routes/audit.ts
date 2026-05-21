import { Hono } from 'hono'
import { auditService } from '../../services/audit.service.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import { writeAuditEvent } from '../../services/base.js'
import type { HonoEnv } from '../../hono-types.js'

export const auditRouter = new Hono<HonoEnv>()

auditRouter.get('/', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const role = c.get('role') as string
  if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  try {
    const q = c.req.query()
    return c.json(
      await auditService.list(tenantId, {
        ...(q['eventType'] !== undefined ? { eventType: q['eventType'] } : {}),
        ...(q['userId'] !== undefined ? { userId: q['userId'] } : {}),
        ...(q['resourceType'] !== undefined ? { resourceType: q['resourceType'] } : {}),
        ...(q['resourceId'] !== undefined ? { resourceId: q['resourceId'] } : {}),
        ...(q['from'] !== undefined ? { from: q['from'] } : {}),
        ...(q['to'] !== undefined ? { to: q['to'] } : {}),
        ...(q['page'] !== undefined ? { page: Number(q['page']) } : {}),
        ...(q['pageSize'] !== undefined ? { pageSize: Number(q['pageSize']) } : {}),
      }),
      200,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'audit-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

auditRouter.get('/export', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  const role = c.get('role') as string
  if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  try {
    const { format = 'jsonl', from, to } = c.req.query()
    await writeAuditEvent({
      tenantId,
      userId,
      eventType: 'audit_log.exported',
      details: { format, from, to },
    })

    if (format === 'csv') {
      const csv = await auditService.exportCsv(tenantId, from, to)
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="audit-log.csv"',
        },
      })
    }
    const ndjson = await auditService.exportNdjson(tenantId, from, to)
    return new Response(ndjson, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': 'attachment; filename="audit-log.jsonl"',
      },
    })
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'audit-export',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
