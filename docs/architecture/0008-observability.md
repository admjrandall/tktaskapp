# ADR 0008 — Observability: OpenTelemetry Signals, SLOs, and SIEM

**Status:** Accepted (design); Pending (implementation — Phase 9)  
**Date:** 2026-05-19  
**Authors:** Task App CRM team  
**Supersedes:** —  
**Related:** ADR 0006 (GDPR crypto-shredding), ADR 0007 (identity and authz), Phase 9 (server implementation)

---

## Context

The offline profile requires no observability — it is single-user, operates on the device, and has no API surface. The enterprise profile adds multi-tenant server-side processing where observability is non-negotiable:

- **SOC 2 Availability** evidence requires continuous, automated proof that SLOs are met.
- **SOC 2 Security** evidence requires tamper-evident audit logs and alert history for auth anomalies.
- **GDPR Article 5(1)(f)** (integrity and confidentiality) requires detecting and responding to security incidents in a demonstrable timeframe.
- Retrofitting observability onto a running production system is expensive and always leaves gaps in the evidence trail.

OpenTelemetry (OTel) is the 2026 industry standard for distributed observability. All major backends — Datadog, Grafana, Honeycomb, Dynatrace, Splunk, Azure Monitor — accept OTel natively via OTLP. Instrumenting from the first line of server code, rather than after the first customer is onboarded, ensures a complete and continuous evidence trail.

---

## Decision

Instrument the enterprise server (`server/`) with OpenTelemetry SDK from the first line of server code. Three signal types — **traces, metrics, and logs** — are mandatory. No signal may be added post-facto when a SOC 2 auditor requests it; the architecture must emit all three from day one.

OTel SDK initialization belongs in `server/src/observability/`. No OTel SDK code enters `packages/core/` or the offline bundle — the offline profile has no network and no telemetry surface.

---

## Module layout

```
server/src/observability/
    otel.ts          ← OTel SDK init; NodeSDK configuration; OTLP exporter setup; vendor-neutral
    middleware.ts    ← request tracing middleware; root span per request; required attribute injection
    metrics.ts       ← RED metrics per service; P50/P95/P99 histograms; alert thresholds
    slo.ts           ← SLO definitions; burn-rate alerting; error budget tracking
```

---

## 1. Traces

### Scope

Every API request receives a root span. Child spans are created for:

| Operation                    | Span name pattern                                               |
| ---------------------------- | --------------------------------------------------------------- |
| Incoming HTTP request        | `HTTP {method} {route}`                                         |
| Database query               | `db.query {table}`                                              |
| KMS operation                | `kms.{operation}` (wrap, unwrap, issueKey, scheduleDestruction) |
| Auth / OIDC token validation | `auth.validateToken`                                            |
| OPA / Cedar policy decision  | `authz.policyDecision`                                          |
| AI gateway call              | `ai-gateway.{provider}.{model}`                                 |
| SIEM log export              | `audit.siemExport`                                              |

### Required span attributes

Every span, at every level, must carry these attributes:

| Attribute                | Type   | Source                                     | Notes                                                          |
| ------------------------ | ------ | ------------------------------------------ | -------------------------------------------------------------- |
| `tenant_id`              | string | OIDC token claim `tid`                     | Pseudonymised tenant identifier; never the display name        |
| `user_id`                | string | OIDC token claim `sub`                     | Pseudonymised subject; never email or name                     |
| `request_id`             | string | `X-Request-ID` header or generated UUID v7 | Correlates logs, traces, and audit events for the same request |
| `trace_id`               | string | OTel W3C TraceContext                      | Injected automatically by SDK; also written to every log line  |
| `span_id`                | string | OTel                                       | Injected automatically by SDK                                  |
| `service.name`           | string | OTel resource attribute                    | Set in `otel.ts` per service                                   |
| `service.version`        | string | OTel resource attribute                    | Set from `package.json` version at build time                  |
| `deployment.environment` | string | env var `DEPLOY_ENV`                       | `production`, `staging`, `development`                         |

### PII prohibition

The following must **never** appear in span attributes, span events, or log fields:

- Email addresses
- Display names (user or tenant)
- Record content (task descriptions, client notes, document body)
- Encryption key material or key IDs that could link to specific individuals
- IP addresses that could be linked to a specific identified natural person without aggregation

Tenant and user identifiers in telemetry are pseudonyms (`sub`, `tid`). Mapping tables between pseudonyms and real identities are stored separately, in the DSAR system only.

### Trace propagation

All services propagate context using **W3C TraceContext** (`traceparent` / `tracestate` headers). B3 propagation is not used. Incoming requests without a `traceparent` header receive a new root span — not an error.

### KMS trace hygiene

KMS spans must not record:

- Raw or wrapped key material
- `destroyAt` timestamps with user-linkable context
- Any information that could associate a KEK ID with a real identity in the trace store

KMS spans record: operation type, success/failure, and duration.

---

## 2. Metrics — RED model

Each service exposes three metric families (Rate, Errors, Duration) per operation:

### Rate

```
# requests per second (counter)
http_requests_total{service, route, method, status_class}
kms_operations_total{service, operation, status}
db_queries_total{service, table, operation}
auth_token_validations_total{service, result}   # result: success | expired | invalid | revoked
authz_decisions_total{service, action, decision} # decision: allow | deny
ai_gateway_requests_total{service, provider, model, outcome}
```

### Errors

```
# error rate (derived from http_requests_total where status_class = "5xx")
# also dedicated error counters for domain events:
gdpr_erasure_errors_total{service, step}        # step: schedule | execute | verify
kms_unwrap_rejected_total{service, reason}      # reason: key_destroyed | key_not_found | auth_failed
auth_anomaly_total{service, type}               # type: brute_force | replay | token_theft_suspected
```

### Duration

```
# histogram with P50 / P95 / P99 (buckets: 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s)
http_request_duration_seconds{service, route, method, status_class}
db_query_duration_seconds{service, table, operation}
kms_operation_duration_seconds{service, operation}
auth_token_validation_duration_seconds{service}
authz_policy_evaluation_duration_seconds{service, engine}
ai_gateway_latency_seconds{service, provider, model}
```

### Alert thresholds

| Metric                                         | Warning     | Critical                            |
| ---------------------------------------------- | ----------- | ----------------------------------- |
| `http_request_duration_seconds` P99            | > 400 ms    | > 500 ms                            |
| Error rate (5xx)                               | > 0.05%     | > 0.1%                              |
| `auth_anomaly_total` (any type)                | > 0         | > 5 in 5 min                        |
| `kms_unwrap_rejected_total`                    | —           | > 0 (unexpected after GDPR erasure) |
| `authz_decisions_total{decision="deny"}` spike | 2× baseline | 5× baseline                         |

Alerts route to **SLO burn-rate alerting** (not only threshold crossings). A sustained 2% error rate for 1 hour burns the weekly error budget faster than any single spike.

---

## 3. SLO Definitions

| SLO                                                           | Target                              | Measurement window | Alert: burn rate                 |
| ------------------------------------------------------------- | ----------------------------------- | ------------------ | -------------------------------- |
| **API availability** — `GET /healthz` returns 200             | ≥ 99.9% of minutes in 30-day window | 30 days rolling    | 5% budget burnt in 1 h → page    |
| **API latency** — P99 < 500 ms                                | ≥ 99.5% of requests                 | 30 days rolling    | 10% budget burnt in 6 h → page   |
| **Error rate** — 5xx responses                                | < 0.1% of requests                  | 30 days rolling    | 5% budget burnt in 1 h → page    |
| **KMS availability** — issueKey / wrapKey / unwrapKey succeed | ≥ 99.95% of calls                   | 30 days rolling    | 2% budget burnt in 30 min → page |
| **Auth pipeline** — token validation completes in < 200 ms    | ≥ 99.9% of validations              | 30 days rolling    | 5% budget burnt in 2 h → page    |

Error budgets are tracked automatically. When a budget drops below 10% remaining, non-critical feature deployments are paused until the window resets.

### SOC 2 evidence export

SLO compliance reports are exported monthly as structured JSON and archived in the DSAR / evidence store. Each report contains:

- window (start, end)
- SLO name, target, measured value
- total_requests, error_count, budget_remaining
- incidents (list of `{ started_at, resolved_at, impact, root_cause_category }`)

---

## 4. Structured Logs

All log output is structured JSON. `console.log` is prohibited in `server/`. A lint rule enforces this.

### Mandatory log fields

Every log line must contain all of the following fields:

| Field        | Type         | Notes                                                 |
| ------------ | ------------ | ----------------------------------------------------- |
| `timestamp`  | ISO 8601 UTC | Millisecond precision: `2026-05-19T14:32:01.123Z`     |
| `level`      | string       | `debug` \| `info` \| `warn` \| `error` \| `fatal`     |
| `service`    | string       | Matches `service.name` OTel resource attribute        |
| `trace_id`   | string       | From active OTel span; `"none"` if no active span     |
| `span_id`    | string       | From active OTel span; `"none"` if no active span     |
| `tenant_id`  | string       | From request context; `"system"` for background jobs  |
| `user_id`    | string       | From OIDC token `sub`; `"system"` for background jobs |
| `request_id` | string       | Correlates across services                            |
| `message`    | string       | Human-readable description of the event               |

### Optional contextual fields

Additional fields may be added per log line, but must comply with PII rules:

```json
{
  "timestamp": "2026-05-19T14:32:01.123Z",
  "level": "info",
  "service": "api",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "tenant_id": "tid-abc123",
  "user_id": "sub-def456",
  "request_id": "req-01j2xmv8h0000000a3b4c5d6e",
  "message": "KMS key scheduled for destruction",
  "operation": "scheduleKeyDestruction",
  "destroy_at": "2026-06-18T00:00:00.000Z",
  "duration_ms": 42
}
```

### PII prohibition (logs)

The following must never appear in any log field:

- Email addresses, display names, phone numbers
- Document content, task descriptions, client notes
- File names that could identify individuals
- Encryption key material, wrapped key bytes, DEK contents
- Raw HTTP request/response bodies (only sanitized metadata)

The lint rule `no-pii-in-logs` (custom Semgrep rule in `semgrep/rules/no-pii-logs.yaml`) enforces this at CI time.

---

## 5. SIEM Integration

All structured logs and security-relevant audit events are exported to the customer's SIEM. The integration is configured per-tenant.

### Export path

```
OTel Collector
    │
    ├── OTLP/gRPC → Backend (Grafana / Datadog / Honeycomb / etc.)
    │
    └── Log pipeline → SIEM adapter
            ├── Splunk HEC (HTTP Event Collector)
            ├── Microsoft Sentinel (Azure Monitor Logs API)
            ├── AWS Security Hub / CloudWatch Logs
            └── Generic syslog-over-TLS (RFC 5424)
```

### SIEM-mandatory event types

The following audit events must be forwarded to SIEM within 60 seconds of occurrence, regardless of tenant SIEM configuration:

| Event                                  | Severity | Description                                                               |
| -------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `auth.brute_force_detected`            | HIGH     | > 5 failed auth attempts in 60 s for the same userId                      |
| `auth.token_replay_detected`           | CRITICAL | Same `jti` seen more than once                                            |
| `authz.cross_tenant_attempt`           | CRITICAL | Request attempted to access resource outside its `tid`                    |
| `kms.key_destruction_scheduled`        | HIGH     | Scheduled GDPR erasure; `destroyAt` recorded                              |
| `kms.key_destruction_executed`         | HIGH     | KEK destroyed; signed receipt attached                                    |
| `kms.unwrap_rejected_post_destruction` | HIGH     | Attempt to decrypt after erasure — may indicate data exfiltration attempt |
| `admin.role_assigned`                  | HIGH     | Admin or elevated role granted to a principal                             |
| `admin.step_up_required`               | MEDIUM   | Sensitive operation triggered step-up auth                                |
| `audit.log_export`                     | MEDIUM   | Audit export performed; requestor recorded                                |

### Alert routing

Security-severity SIEM events trigger PagerDuty / Opsgenie alerts routed to the on-call security engineer, not the general engineering on-call. The two on-call rotations are independent.

---

## 6. Local development and testing

The `docker-compose.yml` (Phase 14) includes an OTel Collector and Jaeger for local trace visualization:

```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    ports:
      - '4317:4317' # OTLP gRPC
      - '4318:4318' # OTLP HTTP
    volumes:
      - ./infra/otel-collector-config.yaml:/etc/otelcol-contrib/config.yaml

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - '16686:16686' # Jaeger UI
```

Developers see full distributed traces locally without connecting to production infrastructure.

---

## 7. Implementation file responsibilities

| File                                     | Responsibility                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/src/observability/otel.ts`       | `NodeSDK` initialization; OTLP gRPC/HTTP exporter; resource attributes (`service.name`, `service.version`, `deployment.environment`); trace/metric/log provider registration; graceful shutdown              |
| `server/src/observability/middleware.ts` | Express/Hono middleware; root span per request; inject `tenant_id`, `user_id`, `request_id`, `trace_id` into span attributes and `AsyncLocalStorage` context; propagate `traceparent` to child service calls |
| `server/src/observability/metrics.ts`    | `MeterProvider` setup; define all RED metric instruments (counters, histograms); export `recordRequest`, `recordKmsOperation`, `recordAuthDecision`, `recordAuthzDecision` helpers                           |
| `server/src/observability/slo.ts`        | SLO definitions as typed objects; `evaluateSlo(name, window)` returns `{ compliant, measured, target, budgetRemaining }`; monthly report generator                                                           |

---

## Implementation status

- [x] Design documented (this ADR)
- [ ] `server/src/observability/otel.ts` — Phase 9
- [ ] `server/src/observability/middleware.ts` — Phase 9
- [ ] `server/src/observability/metrics.ts` — Phase 9
- [ ] `server/src/observability/slo.ts` — Phase 9
- [ ] SIEM adapter configuration — Phase 9
- [ ] OTel Collector docker-compose integration — Phase 14
- [ ] Semgrep `no-pii-in-logs` rule — Phase 9
- [ ] SLO monthly report generator — Phase 9
- [ ] Dashboard provisioning (Grafana / Datadog) — Phase 9
