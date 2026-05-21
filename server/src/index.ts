// OTel MUST be initialised before any other imports that create spans or metrics.
import { OtelServiceImpl } from './observability/otel.js'

const otelImpl = new OtelServiceImpl()
otelImpl.init({
  serviceName: 'tktaskapp-server',
  serviceVersion: process.env['npm_package_version'] ?? '0.1.0',
  environment:
    (process.env['NODE_ENV'] as 'development' | 'staging' | 'production') ?? 'development',
  exporterEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318',
  debugMode: process.env['NODE_ENV'] !== 'production',
})

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { corsHeaders, corsPreflight } from './middleware/cors.js'
import { authMiddleware } from './auth/middleware.js'
import { otelMiddleware } from './observability/middleware.js'
import { handleHealthz, handleReadyz } from './api/routes/health.js'
import { clientsRouter } from './api/routes/clients.js'
import { departmentsRouter } from './api/routes/departments.js'
import { projectsRouter } from './api/routes/projects.js'
import { tasksRouter } from './api/routes/tasks.js'
import { peopleRouter } from './api/routes/people.js'
import { tagsRouter } from './api/routes/tags.js'
import { communicationsRouter } from './api/routes/communications.js'
import { timeEntriesRouter } from './api/routes/time-entries.js'
import { notificationsRouter } from './api/routes/notifications.js'
import { filesRouter } from './api/routes/files.js'
import { documentsRouter } from './api/routes/documents.js'
import { standaloneNotesRouter } from './api/routes/standalone-notes.js'
import { conversationsRouter } from './api/routes/conversations.js'
import { auditRouter } from './api/routes/audit.js'
import { adminRouter } from './api/routes/admin.js'
import { closeDb } from './db/index.js'
import { startDestructionScheduler, stopDestructionScheduler } from './kms/destruction-scheduler.js'
import { otel } from './observability/otel.js'
import { incrementActiveConnections, decrementActiveConnections } from './observability/metrics.js'

const app = new Hono()

// ── CORS ──────────────────────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin')
  if (c.req.method === 'OPTIONS') {
    if (origin) {
      const headers = corsPreflight(origin)
      return new Response(null, { status: 204, headers })
    }
    return new Response(null, { status: 204 })
  }
  if (origin) {
    const headers = corsHeaders(origin)
    for (const [k, v] of Object.entries(headers)) {
      c.header(k, v)
    }
  }
  await next()
})

// ── Connection tracking ───────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  incrementActiveConnections()
  try {
    await next()
  } finally {
    decrementActiveConnections()
  }
})

// ── OTel request spans ────────────────────────────────────────────────────────

app.use('*', otelMiddleware)

// ── Public health routes (no auth) ────────────────────────────────────────────

app.get('/healthz', (c) => {
  handleHealthz({
    json: (status, body) => {
      c.status(status as never)
      Object.assign(c, { _body: body })
    },
  })
  return c.json({ status: 'ok' }, 200)
})

app.get('/readyz', async (c) => {
  let status = 200
  let body = {}
  await handleReadyz({
    json: (s, b) => {
      status = s
      body = b as object
    },
  })
  return c.json(body, status as never)
})

// ── Auth middleware (all /api/v1 routes) ─────────────────────────────────────

app.use('/api/v1/*', authMiddleware)

// ── CRM routes ────────────────────────────────────────────────────────────────

app.route('/api/v1/clients', clientsRouter)
app.route('/api/v1/departments', departmentsRouter)
app.route('/api/v1/projects', projectsRouter)
app.route('/api/v1/tasks', tasksRouter)
app.route('/api/v1/people', peopleRouter)
app.route('/api/v1/tags', tagsRouter)
app.route('/api/v1/communications', communicationsRouter)
app.route('/api/v1/time-entries', timeEntriesRouter)
app.route('/api/v1/notifications', notificationsRouter)
app.route('/api/v1/files', filesRouter)
app.route('/api/v1/documents', documentsRouter)
app.route('/api/v1/standalone-notes', standaloneNotesRouter)
app.route('/api/v1/conversations', conversationsRouter)
app.route('/api/v1/audit', auditRouter)
app.route('/api/v1/admin', adminRouter)

// ── Global error handler ──────────────────────────────────────────────────────

app.onError((err, c) => {
  const tenantId = (c.get('tenantId') as string | undefined) ?? 'unknown'
  otel.log({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'tktaskapp-server',
    tenantId,
    requestId: c.req.header('X-Request-ID') ?? 'unknown',
    message: 'Unhandled error',
    extra: { error: err.message },
  })
  return c.json({ error: 'Internal server error' }, 500)
})

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = Number(process.env['PORT'] ?? 3000)

const destructionTimer = startDestructionScheduler()

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  otel.log({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'tktaskapp-server',
    tenantId: 'system',
    requestId: 'startup',
    message: `Server listening on port ${info.port}`,
  })
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  otel.log({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'tktaskapp-server',
    tenantId: 'system',
    requestId: 'shutdown',
    message: 'SIGTERM received — shutting down',
  })
  stopDestructionScheduler(destructionTimer)
  await closeDb()
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown()
})
process.on('SIGINT', () => {
  void shutdown()
})
