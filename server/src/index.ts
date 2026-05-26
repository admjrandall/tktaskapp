// OTel MUST be initialised before any other imports that create spans or metrics.
import { OtelServiceImpl } from './observability/otel.js'
import { validateProductionConfig } from './config/production.js'

validateProductionConfig()

const nodeEnv = process.env['NODE_ENV']
const deploymentEnvironment =
  nodeEnv === 'production' || nodeEnv === 'staging' || nodeEnv === 'development'
    ? nodeEnv
    : 'development'

const otelImpl = new OtelServiceImpl()
otelImpl.init({
  serviceName: 'tktaskapp-server',
  serviceVersion: process.env['npm_package_version'] ?? '0.1.0',
  environment: deploymentEnvironment,
  exporterEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318',
  debugMode: process.env['NODE_ENV'] !== 'production',
})

import { readFile } from 'fs/promises'
import { resolve as resolvePath } from 'path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { HonoEnv } from './hono-types.js'
import { corsHeaders, corsPreflight } from './middleware/cors.js'
import { securityHeaders } from './middleware/security-headers.js'
import { authMiddleware } from './auth/middleware.js'
import { authRouter } from './auth/routes.js'
import { lockdownMiddleware } from './middleware/lockdown.js'
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
import { syncRouter } from './api/routes/sync.js'
import { aiAttributesRouter } from './api/routes/ai-attributes.js'
import { closeDb } from './db/index.js'
import { startDestructionScheduler, stopDestructionScheduler } from './kms/destruction-scheduler.js'
import { pruneExpiredRevocations } from './auth/state-store.js'
import { otel } from './observability/otel.js'
import { incrementActiveConnections, decrementActiveConnections } from './observability/metrics.js'

const app = new Hono<HonoEnv>()

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

app.use('*', securityHeaders())

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

// ── BFF auth routes (public — no authMiddleware) ──────────────────────────────

app.route('/auth', authRouter)

// ── Auth middleware (all /api/v1 routes) ─────────────────────────────────────

app.use('/api/v1/*', authMiddleware)
app.use('/api/v1/*', lockdownMiddleware())

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
app.route('/api/v1/sync', syncRouter)
app.route('/api/v1/ai/attributes', aiAttributesRouter)

// ── Enterprise SPA static serving ────────────────────────────────────────────
// Enabled when ENTERPRISE_STATIC_DIR is set (production / staging only).
// In development the Vite dev server serves the frontend separately.
//
// Cache policy:
//   /assets/*               → immutable (content-hashed filenames)
//   /sw.js, /index.html     → no-store (always re-fetch)
//   Everything else         → no-cache (revalidate before use)
//
// TLS and HSTS are the responsibility of the upstream reverse proxy.

const enterpriseStaticDir = process.env['ENTERPRISE_STATIC_DIR']

if (enterpriseStaticDir) {
  // Immutable cache headers for content-hashed Vite assets
  app.use('/assets/*', async (c, next) => {
    c.header('Cache-Control', 'public, max-age=31536000, immutable')
    await next()
  })

  // Service worker must never be cached — browsers enforce this but be explicit
  app.use('/sw.js', async (c, next) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    c.header('Service-Worker-Allowed', '/')
    await next()
  })

  // HTML must not be cached so users always get the latest app shell
  app.use('/index.html', async (c, next) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    await next()
  })

  // Serve actual files from dist/enterprise/
  app.use('*', serveStatic({ root: enterpriseStaticDir }))

  // SPA fallback: any unmatched browser-navigation route → index.html
  // API, auth, and health routes that reach here are genuine 404s.
  const spaIndexPath = resolvePath(enterpriseStaticDir, 'index.html')
  app.notFound(async (c) => {
    const { path } = c.req
    if (
      path.startsWith('/api/') ||
      path.startsWith('/auth/') ||
      path === '/healthz' ||
      path === '/readyz'
    ) {
      return c.json({ error: 'Not found' }, 404)
    }
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    try {
      const html = await readFile(spaIndexPath, 'utf-8')
      return c.html(html)
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
  })
}

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

// Prune expired access-token revocations at startup, then every 6 hours
void pruneExpiredRevocations()
setInterval(() => void pruneExpiredRevocations(), 6 * 60 * 60 * 1000)

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
  await new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => {
      if (err) reject(err)
      else resolve()
    })
  })
  await closeDb()
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown()
})
process.on('SIGINT', () => {
  void shutdown()
})
