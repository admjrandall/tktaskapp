import type { Context, Next } from 'hono'
import { trace, SpanStatusCode } from '@opentelemetry/api'
import { otel } from './otel.js'

const _tracer = trace.getTracer('crm-server')

export async function otelMiddleware(c: Context, next: Next): Promise<void> {
  const method = c.req.method
  const route = c.req.routePath ?? c.req.path
  const tenantId = (c.get('tenantId') as string | undefined) ?? 'unauthenticated'
  const startMs = Date.now()

  await _tracer.startActiveSpan(`${method} ${route}`, async (span) => {
    span.setAttributes({
      'http.method': method,
      'http.route': route,
      'tenant.id': tenantId,
    })

    try {
      await next()
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
      span.recordException(err instanceof Error ? err : new Error(String(err)))
      throw err
    } finally {
      const status = c.res.status
      const durationMs = Date.now() - startMs
      span.setAttribute('http.status_code', status)

      if (status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR })
      }

      const traceId = span.spanContext().traceId
      c.header('X-Trace-Id', traceId)

      otel.log({
        timestamp: new Date().toISOString(),
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        service: 'tktaskapp-server',
        tenantId,
        requestId: c.req.header('X-Request-ID') ?? traceId,
        message: `${method} ${route} ${status}`,
        extra: { durationMs, status },
      })

      span.end()
    }
  })
}
