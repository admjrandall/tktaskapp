# Changelog

All notable changes to Task App CRM are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

---

## [2026-05-22] — Phase 1: UI foundation + data model

### Added — `packages/core/src/`

**Design tokens & UI primitives**

- `ui/design-tokens.ts`: `TOKENS` const, `COLOR_VAR_MAP`, `applyTokens(theme, density)` — maps to existing CSS variable names
- `ui/primitives/button.ts`, `badge.ts`, `avatar.ts`, `input.ts`, `modal.ts`, `index.ts`: typed, `escH()`-clean UI primitives
- `branding.ts`: `BRAND` const with app name, lockdown banners, AI identity strings

**Data model extensions (C.1)**

- `constants.ts`: `deals` and `pipelines` added to `STORES`; 9 new `IDB_STORES` for extension objects, AI attributes, workspace layouts, persona profiles, automation rules, agent insights; `DEAL_STAGES`, `PIPELINE_TYPES`
- `state.ts`: typed collections for all vault stores; `density`, `deals`, `pipelines`, `currentPersona`, `workspaceLayout`, `aiAttributeValues`, `adaptiveSuggestions`, `lockdownLevel` added to `AppState`

**Schema extensions**

- All 13 entity schemas (client, project, task, person, department, communication, tag, time-entry, notification, standalone-note, document, file, conversation) extended with `customFields`, `aiAttributes`, `extensionLinks`
- `audit.schema.ts`: extended with C.6 event types (AI, persona, workspace, sync, extension events) and hash-chain fields
- 7 new schemas: `deal`, `pipeline`, `custom-field`, `ai-attribute` (C.2 provenance), `extension-object`, `workspace-layout`, `persona`

**Persona system**

- `personas/index.ts`: `PERSONA_PRESETS` for all 5 presets (closer, maintainer, investigator, builder, inspector) with `sidebarOrder`, `defaultView`, `dashboardBlocks`, `lockdownDefault`

**View updates**

- `views/sidebar.ts`: `NAV_REGISTRY`, persona-adaptive nav order, persona badge in sidebar footer
- `views/topbar.ts`: lockdown banner (standard/strong/strict), persona chip, extended `VIEW_LABELS`/`VIEW_ICONS` for deals/pipelines
- `views/onboarding.ts` (new): persona selection onboarding flow with 3 persona cards
- `views/workspace-canvas.ts` (new): drag/resize spatial canvas with `localStorage` persistence
- `views/admin-console.ts` (new): lockdown level selector (C.7), compliance packs, AI gateway allowlist
- `views/settings-user.ts` (new): re-export shim forwarding all `settings.ts` exports

---

## [2026-05-21] — Server backend implementation

### Added — `server/` package

Complete Hono v4 REST API backend for the enterprise-web build profile. The offline build is unaffected — it remains a self-contained HTML file with no server dependency.

**HTTP framework**

- Hono v4 (`@hono/node-server`); entry at `server/src/index.ts`
- 15 route prefixes under `/api/v1/` covering all 13 CRM entities plus audit and admin
- Public health endpoints: `GET /healthz`, `GET /readyz`
- Global error handler returns `{ error: 'Internal server error' }` — never exposes stack traces

**Database — Drizzle ORM + PostgreSQL**

- 14 new CRM entity tables: clients, departments, projects, tasks, people, tags, communications, time_entries, notifications, files, documents, standalone_notes, conversations, legal_holds
- All tables use `text tenant_id` + PostgreSQL Row-Level Security (`app.tenant_id` session variable) for multi-tenant isolation
- `withTenant(tenantId, fn)` helper in `server/src/services/base.ts` wraps every query in a transaction that sets the RLS variable
- Migration `0002_crm_entities.sql` adds tables, RLS policies, and a KMS append-only trigger
- Dev seed: `server/src/db/seed.ts` — idempotent; creates dev-tenant-1 with sample data

**Auth — Entra ID OIDC + PKCE**

- `OidcServiceImpl` (`server/src/auth/oidc-service.ts`): S256 PKCE, token exchange, JWKS validation via `jose`, refresh token rotation, token revocation
- `authMiddleware` (`server/src/auth/middleware.ts`): validates Bearer token, looks up user in DB, sets `userId`/`tenantId`/`role` on Hono context; 401 on failure

**Authorization — OPA**

- `opaMiddleware(action)` factory in `server/src/middleware/opa.ts`
- Three-mode evaluation: REST sidecar (`OPA_URL`) → WASM (`policies/crm.wasm`) → in-process TypeScript fallback
- `server/policies/crm.rego`: admin/owner → all; editor → read/create/update; viewer → read; cross-tenant always denied

**Observability — OpenTelemetry**

- OTel SDK initialised before any other import in `server/src/index.ts`
- `OTLPTraceExporter` (HTTP) at `OTEL_EXPORTER_OTLP_ENDPOINT`
- `otelMiddleware`: root span per request with `http.*` and `tenant.id` attributes; `X-Trace-Id` response header
- RED metrics: `crm.requests.total` counter, `crm.requests.duration_ms` histogram, `crm.connections.active` gauge

**GDPR / KMS**

- `AzureKeyVaultKeyService` — per-user KEK management; schedules key destruction via `kms_key_lifecycle` (append-only)
- `LegalHoldService` — blocks GDPR erasure if active hold exists
- `runErasureWorkflow` — checks hold → schedules key destruction → soft-deletes all user data → writes audit event
- Destruction scheduler — polls every 60s; calls `beginDeleteKey()` on Azure Key Vault; inserts `DESTROYED` lifecycle event

**AI Gateway**

- `evaluateAiGatewayRequest` — model allowlist, per-user 20 RPM rate limit (Redis or in-memory), per-tenant monthly token budget (default 1M), PII scrubbing (email / CC / SSN / UK NI)
- Redis-backed rate limiting and budget tracking when `AI_GATEWAY_REDIS_URL` is set
- All policy decisions audit-logged

**Service layer**

- 15 service files under `server/src/services/`; all follow `list / getById / create / update / delete` pattern
- All mutating operations call `writeAuditEvent()` — immutable audit trail
- Soft deletes: `deletedAt` timestamp; never hard-delete CRM data

**Configuration**

- `server/.env.example` documents all required and optional environment variables
- CORS origin whitelist (`ALLOW_ORIGINS`); no wildcard origins

### Changed

- `server/src/observability/otel.ts` — switched from `@opentelemetry/exporter-trace-otlp-grpc` to `@opentelemetry/exporter-trace-otlp-http`; added `getTracer()`, `startSpan()`, `recordDbQuery()`, `recordKmsCall()` helpers
- `server/src/ai-gateway/policy-engine.ts` — rate limiting and budget tracking made async with Redis fallback to in-memory; monthly budget reads `AI_GATEWAY_MONTHLY_BUDGET_TOKENS` env var

### Unchanged

The offline frontend build (`dist/offline/index.html`) and all packages under `packages/` are unaffected by this change. The server is an additive package that does not modify any frontend code.

---

For frontend changelog (offline build hardening, storage migration, etc.) see `originalfiles/CHANGELOG.md`.
