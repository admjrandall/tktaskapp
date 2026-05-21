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
//   - @opentelemetry/sdk-node for NodeSDK init
//   - @opentelemetry/exporter-trace-otlp-grpc for trace export
//   - @opentelemetry/exporter-metrics-otlp-grpc for metric export
//   - pino or winston with OTel log bridge (@opentelemetry/winston-transport)
//   - server/src/observability/middleware.ts
//       root span per request; inject tenant_id, user_id, request_id as span attributes
//   - server/src/observability/metrics.ts
//       RED metrics: http_requests_total, http_request_duration_seconds (histogram)
//   - server/src/observability/slo.ts
//       SLO burn-rate alerting rules (Prometheus recording rules or Grafana alert definitions)
