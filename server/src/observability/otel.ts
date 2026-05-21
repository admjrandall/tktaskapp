// OpenTelemetry instrumentation — interface stub.
// TODO: Implement when server/ is being built out.
//
// Section 11.4 — Observability: OpenTelemetry from day one
//
// OTel is the 2026 industry standard for distributed observability. Every major vendor
// (Datadog, Grafana, Honeycomb, Dynatrace, Splunk) accepts OTel natively.
// Instrument from day one — retrofitting observability onto a running system is expensive
// and produces incomplete SOC 2 Availability evidence.
//
// Required signals:
//
//   Traces — every API request; child spans for DB queries, KMS calls, auth checks,
//     AI gateway calls. Trace ID must appear in every structured log line.
//     Required span attributes: tenant_id, user_id, request_id, trace_id.
//
//   Metrics — RED model per service:
//     Rate:     requests per second (by endpoint, tenant, HTTP status code)
//     Errors:   error rate — 5xx and 4xx tracked separately
//     Duration: P50 / P95 / P99 per endpoint
//
//   Logs — structured JSON only. No console.log in server code.
//     Required fields (see StructuredLogEntry below).
//     FORBIDDEN: passwords, tokens, raw DEKs, PII (name, email, phone, address).
//
// SLOs:
//   P99 request latency < 500 ms
//   Error rate          < 0.1 %
//   Uptime              > 99.9 %
//   Alert on SLO burn rate (not only threshold crossings).
//
// Vendor-neutral deployment:
//   Emit to OTel Collector. Collector routes to Datadog / Grafana / Honeycomb /
//   Dynatrace / Splunk depending on the deployment environment.
//   See: infra/k8s/deployment.yaml for the collector sidecar (Phase 14).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type DeploymentEnvironment = 'development' | 'staging' | 'production'

export interface OtelConfig {
  readonly serviceName: string
  readonly serviceVersion: string
  readonly environment: DeploymentEnvironment
  /** OTLP exporter endpoint — e.g. 'http://otel-collector:4317' (gRPC). */
  readonly exporterEndpoint: string
  /**
   * Enable verbose debug tracing. MUST be false in production.
   * Debug mode may log span attributes that would otherwise be redacted.
   */
  readonly debugMode: boolean
}

export interface SpanAttributes {
  readonly tenantId: string
  readonly userId?: string
  readonly requestId: string
  /**
   * Truncated user-agent string for audit evidence.
   * Truncate to ≤ 200 characters to prevent log injection via crafted UA strings.
   */
  readonly userAgent?: string
}

export interface StructuredLogEntry {
  readonly timestamp: string
  readonly level: LogLevel
  readonly service: string
  /** OTel W3C trace ID — links this log line to the request trace. */
  readonly traceId: string
  readonly spanId: string
  readonly tenantId: string
  /** User identifier — omit if the user is not yet authenticated. */
  readonly userId?: string
  readonly requestId: string
  readonly message: string
  /**
   * Arbitrary key-value pairs for additional context.
   * MUST NOT contain PII, tokens, passwords, or key material.
   * Values are restricted to primitive types to prevent accidental object serialization.
   */
  readonly extra?: Readonly<Record<string, string | number | boolean>>
}

export interface OtelService {
  /**
   * Initialize the OTel SDK.
   * Call once at server startup, before any request handling.
   * Subsequent calls are no-ops.
   */
  init(config: OtelConfig): void

  /**
   * Create a root span for an incoming API request.
   * Inject the span into the async context so child spans (DB, KMS, AI) attach automatically.
   * Always end the span in a finally block.
   */
  startRequestSpan(attributes: SpanAttributes): { end: (statusCode: number) => void }

  /**
   * Emit a structured log entry.
   * Automatically injects trace_id and span_id from the active OTel context.
   * Filters out any key in `extra` whose name matches a PII or secret field list.
   */
  log(entry: Omit<StructuredLogEntry, 'traceId' | 'spanId'>): void
}

// TODO: implement OtelServiceImpl implements OtelService
//   - pino or winston with OTel log bridge (@opentelemetry/winston-transport)
//   - server/src/observability/middleware.ts — root span per request
//   - server/src/observability/metrics.ts — RED metrics histogram
//   - server/src/observability/slo.ts — SLO burn-rate alerting rules

// ── Concrete OTel SDK implementation ─────────────────────────────────────────
// SLO targets (enforced by alerting, not code):
//   P99 latency < 500ms | Error rate < 0.1% | Uptime > 99.9%

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'

const _PII_FIELDS = new Set([
  'email',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'name',
  'displayName',
  'phone',
  'address',
  'nationalInsuranceNumber',
  'ssn',
])

let _sdk: NodeSDK | null = null
let _config: OtelConfig | null = null

// Fields from extra that would leak PII or secrets are stripped before logging.
function _sanitiseExtra(
  extra: Readonly<Record<string, string | number | boolean>> | undefined,
): Readonly<Record<string, string | number | boolean>> | undefined {
  if (!extra) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(extra)) {
    if (!_PII_FIELDS.has(k)) out[k] = v
  }
  return out
}

export class OtelServiceImpl implements OtelService {
  init(config: OtelConfig): void {
    if (_sdk !== null) return // already initialised
    _config = config

    const endpoint =
      config.exporterEndpoint ||
      (process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4317')

    const traceExporter = new OTLPTraceExporter({ url: endpoint })
    const metricReader = new OTLPMetricExporter({ url: endpoint })

    _sdk = new NodeSDK({
      serviceName: config.serviceName,
      serviceVersion: config.serviceVersion,
      traceExporter,
      metricReader,
      instrumentations: [getNodeAutoInstrumentations()],
    })

    _sdk.start()

    process.on('SIGTERM', () => {
      _sdk?.shutdown().catch((err: unknown) => {
        console.error('[otel] shutdown error', err)
      })
    })
  }

  startRequestSpan(attributes: SpanAttributes): { end: (statusCode: number) => void } {
    // Phase 14+: use @opentelemetry/api trace.getTracer() for real span management.
    // For now, return a lightweight timer that logs on end.
    const startMs = Date.now()
    return {
      end: (statusCode: number) => {
        const durationMs = Date.now() - startMs
        this.log({
          timestamp: new Date().toISOString(),
          level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
          service: _config?.serviceName ?? 'tktaskapp-server',
          tenantId: attributes.tenantId,
          requestId: attributes.requestId,
          message: `request completed`,
          extra: { statusCode, durationMs },
          ...(attributes.userId !== undefined ? { userId: attributes.userId } : {}),
        })
      },
    }
  }

  log(entry: Omit<StructuredLogEntry, 'traceId' | 'spanId'>): void {
    const sanitised = _sanitiseExtra(entry.extra)
    const line: StructuredLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      service: entry.service || (_config?.serviceName ?? 'tktaskapp-server'),
      traceId: 'unknown', // Phase 14+: extract from @opentelemetry/api context
      spanId: 'unknown',
      ...(sanitised !== undefined ? { extra: sanitised } : {}),
    }
    const out = JSON.stringify(line)
    if (entry.level === 'error' || entry.level === 'warn') {
      process.stderr.write(out + '\n')
    } else {
      process.stdout.write(out + '\n')
    }
  }
}

export const otel: OtelService = new OtelServiceImpl()
