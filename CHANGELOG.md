# Changelog

All notable changes to Task App CRM are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

---

## [2026-05-29] — Enterprise-readiness roadmap + Phase 0 audit-chain tests

### Added

- **`ENTERPRISE-ROADMAP.md`**: source-audited gap analysis (frontend F1–F10,
  backend B1–B10, P0 de-risk items) with a four-phase delivery plan and
  current-source verification notes.
- **`server/src/services/base.test.ts`**: expanded edge-case coverage for the
  audit hash-chain verifier (`verifyAuditChain` — reorder tolerance, broken-link,
  skipped-event, missing-digest, non-null first prevHash) and direct tests for
  the new `computeAuditDigest` export. Complements the pre-existing
  `tests/security/server-audit-chain.test.ts` and `tests/unit/services/base.service.test.ts`
  (which already cover single-tamper detection, `withTenant`, and
  `paginationValues`).
- **`DECISIONS.md` ADR-M-015**: decision to migrate the frontend to React while
  preserving the single-file offline build.

### Changed

- **`server/src/services/base.ts`**: extracted the SHA-256 audit digest
  computation (previously duplicated between `writeAuditEvent` and
  `verifyAuditChain`) into the exported `computeAuditDigest()` helper.
  Behavior-preserving; makes the hash-chain logic unit-testable without a
  database. Verified by `pnpm typecheck` and the new test suite.

---

## [2026-05-25 patch] — Post-audit gap closure (C-3c, S-1 items 1 & 3)

### Security

- **S-1 item 3 (re-auth lockout)**: The admin re-auth modal password path now enforces the same exponential-backoff lockout as the primary login (`nexus_auth_fail_count` / `nexus_auth_locked_until`). Lockout is checked before PBKDF2 work is started. Failed attempts are audit-logged with `context: 're-auth'`. The password field is cleared on each failure. Three new exports from `auth.ts` — `getAuthLockedUntil`, `recordAuthFailure`, `resetAuthLockout` — share the policy with any future re-auth surface.
- **S-1 item 3 (passkey NotAllowedError)**: Passkey loop in re-auth modal now aborts on `NotAllowedError` (user cancelled / authenticator timeout) rather than silently falling through to remaining enrolled credentials. Structural errors that indicate the credential is not on this device still advance to the next credential.
- **S-1 item 1 (first-run passkey enrollment)**: After vault creation, `auth.ts` now presents a passkey setup card inline in the auth screen before calling `onSuccess(key)`. The `setAuthPasskeyHook` injection (wired in `bootstrap.ts`) persists the credential to `nexus_data_v1` using the freshly derived key before `state.cryptoKey` is populated — bypassing the hook-based webauthn.ts helpers that require an already-authed state.

### Added

- **C-3c**: `packages/adapter-mobile-native/src/capacitor-backup-adapter.ts` — concrete `CapacitorBackupAdapter` implementing `MobileBackupAdapter`. Export uses Web Share API Level 2 (files) as primary path (native share sheet on iOS/Android); falls back to `@capacitor/filesystem` Directory.Documents with a thrown error surfacing the save location. Import uses a hidden `<input type="file">` with `cancel` event cleanup. `dryRunImport` validates the vault JSON envelope without touching the live vault. 4 Vitest tests added for `dryRunImport`.

---

## [2026-05-25] — Full remediation plan completion (all 18 items)

### Security

- **C-1**: Added `server/drizzle/0001_rls_policies.sql` — RLS + `FORCE ROW LEVEL SECURITY` on `tenant_users` and `user_kms_keys` with tenant-isolation restrictive policies and `org_id` index coverage.
- **C-2**: Wired RFC 9470 step-up auth client — `requestStepUpToken()`, `performWithStepUp()`, and admin-console GDPR erase flow now handle the 401 challenge/retry cycle with `X-Step-Up-Token`.
- **S-1**: Passkeys (FIDO2) now offered first in re-auth modal and MFA selection per NIST SP 800-63B-4 AAL2; TOTP moved to secondary position.
- **S-2**: Added RFC 9700 nonce validation for ID tokens and `azp` audience binding in `oidc-service.ts`.
- **S-3**: Added `keyDestructionScheduledAt` / `keyDestroyedAt` fields to `gdpr_erasure_requested` audit event per EDPB Guidelines 02/2025.

### Added

- **C-3**: Concrete `CapacitorVaultAdapter` (atomic write via temp→rename, `Directory.Data`) and `CapacitorBiometricAdapter` (`capacitor-native-biometric` AES-KW wrapped key storage) — fully implements MASVS-STORAGE-1 and MASVS-CRYPTO-1 for iOS/Android.
- **M-1**: Production-grade implementations for four Phase-1 placeholder modules: `domain/index.ts` (branded ID types, value objects, domain errors, event bus), `application/index.ts` (UseCase base, pagination, command/query interfaces), `migrations/index.ts` (MigrationRunner with idempotent DDL helpers), `platform/index.ts` (capability detection, Capacitor/Dataverse/browser-offline detection).
- **M-7**: `tests/adapters/rxdb-couchdb-adapter.test.ts` — CouchDB adapter contract suite with stub (fetch + EventSource mocked) and live (COUCHDB_URL guarded) modes.
- **M-6**: `tests/unit/kms/erasure-workflow.test.ts` — full coverage for `runDataRemovalWorkflow`, `DestructionScheduler`, and `LegalHoldService`.
- **C-4**: `tests/unit/services/base.service.test.ts`, `clients.service.test.ts`, `tasks.service.test.ts`, `audit.service.test.ts` — service layer coverage; 80% branches/lines threshold added to `vitest.config.ts`.

### Fixed

- **M-2**: `ai-tools.ts` default case no longer throws; unknown tools emit an `ai.tool.unknown` audit event and return a structured error to the chat UI.
- **M-4**: Replaced `it.todo` atomic-write test with real mock-based test using module-level `vi.mock('@capacitor/filesystem')`.
- **M-5**: Removed `DataverseNotImplementedError` dead export from adapter and its test file.
- **L-2**: Fixed `DataverseAdapter.pull()` OData PK normalization no-op (`entitySet.replace('tktaskapp_', '') + 'id'`).

### Changed

- **M-3**: `.github/workflows/accessibility.yml` — replaced stub `playwright-a11y` job with real Playwright E2E run (installs Chromium, runs `tests/e2e/accessibility/`, uploads report artifact).
- **L-1**: AI system prompt examples extracted to `SYSTEM_PROMPT_EXAMPLES` named constant in `ai-tools.ts`.
- **L-3**: Migration headers updated with ordering rationale, dependency notes, and destructive-change warnings for 0002, 0005, 0006, 0007.
- **L-4**: `tests/accessibility/keyboard-navigation.test.ts` header now documents the Vitest (static HTML) vs Playwright (runtime browser) split — both suites are intentional.

---

## [2026-05-24] — Build target consolidation: three delivery types

### Changed

- Consolidated five build targets (offline-web, pwa-sync, mobile PWA, enterprise-web, dataverse) into three delivery types: **offline-web** (single HTML), **enterprise-web** (HTTPS PWA), and **dataverse** (Power Platform).
- `apps/pwa-sync/` retired and deleted — it was architecturally identical to enterprise-web with no differentiation.
- `apps/mobile/` is now Capacitor native-packaging only; all web functionality moves to `apps/enterprise-web/`.
- `apps/enterprise-web/` is now a complete buildable PWA target: `vite.config.ts`, `index.html`, `public/manifest.webmanifest`, `public/sw.js`, `public/app.css`, `src/gestures.ts`, and updated `src/entry.ts` absorbing service worker registration, keyboard avoidance, touch gestures, and logout hook.
- `apps/mobile/capacitor.config.ts` updated: `webDir` now points at `dist/enterprise` instead of `dist/mobile`.
- `build:enterprise` added to root `package.json`; `build:sync` removed; `build:mobile` is now an alias for `build:enterprise`; `build:all` updated.
- `server/src/index.ts`: added optional enterprise SPA static file serving when `ENTERPRISE_STATIC_DIR` env var is set, with correct cache headers (`immutable` for `/assets/*`, `no-store` for `index.html` and `sw.js`) and SPA navigation fallback.
- `server/.env.example`: added `ENTERPRISE_STATIC_DIR` documentation.
- Updated CLAUDE.md, AGENTS.md, TECHNICAL-REFERENCE.md, CONTRIBUTING.md, and all affected READMEs.

---

## [2026-05-24] — Multi-target documentation clarification

### Changed

- Clarified that Task App CRM is offline-first, not strictly offline-only: offline-web, PWA sync, mobile PWA, Dataverse, and enterprise/server-backed targets share one core UI with target-specific adapters.
- Updated root agent/contributor guidance and target READMEs so offline-only language applies only to the offline-web profile.
- Made Settings → Data & Privacy and About copy deployment-aware so connected targets no longer display offline-only privacy claims.
- Codified the production-readiness rule that fixable maturity gaps must be closed rather than reported as "mostly closed".
- Hardened AI gateway tenant policy to require exact provider + model approval for production and lockdown calls.
- Converted Kubernetes NetworkPolicy egress CIDRs into a fail-closed render template with required environment inputs and validation.

---

## [2026-05-22] — Phase 4: Lockdown Mode + Compliance Pack

### Added — `packages/core/src/`

**Hash-chained audit log (C.6)**

- `security/audit.ts`: extended `AuditEntry` with optional chain fields (`chainPosition`, `prevHash`, `signedDigest`); `_appendToLog()` now computes SHA-256 chain on every write using `crypto.subtle.digest`; added `verifyAuditChain()` that replays all hashes and reports the first broken position; auto-purge retention default raised to 2190 days (HIPAA 6-year minimum); added `gdpr_erasure_requested` and `compliance_pack_changed` to `AuditEventType`

**Deployment policy extensions (C.7)**

- `deployment-policy.ts`: added `PolicyLockdownLevel` type, `lockdownLevel?` and `auditRetentionDays?` to `DeploymentPolicy` interface, `getDeploymentLockdownLevel()` helper, `ENTERPRISE_DEPLOYMENT_POLICY` (standard lockdown, 2190-day retention, all AI tiers), `DATAVERSE_DEPLOYMENT_POLICY` (standard lockdown, 2190-day retention, browser+cloud)

**DLP warning component (C.7)**

- `ui/components.ts`: `renderDLPWarning(action)` modal, `bindDLPWarning(onProceed, onCancel)`, `guardedAction(lockdownLevel, action, onProceed)` one-call helper — no-ops below strong, shows confirmation modal in strong/strict

**Admin console — compliance surface (C.6, C.7)**

- `views/admin-console.ts`: added "Verify Chain" button to audit tab (calls `verifyAuditChain()`, toasts result); compliance tab now reads `tk_compliance_{hipaa,eu-ai-act,gdpr,soc2}` from localStorage and renders live toggle buttons; users tab has GDPR Article 17 erasure request form (`#admin-gdpr-user-id`, `#admin-gdpr-date`, `#admin-gdpr-request`) that writes a `gdpr_erasure_requested` audit event

### Added — `server/src/`

**Lockdown middleware (C.7)**

- `server/src/middleware/lockdown.ts` (new): reads `org_settings.lockdown_level` per tenant, 30 s in-process cache, sets `lockdownLevel` on Hono context and `X-Lockdown-Level` response header; in strong/strict mode peeks at `POST /api/v1/audit` body and rejects entries missing `prevHash` (422 `CHAIN_REQUIRED`); `invalidateLockdownCache(tenantId)` for admin PATCH flushes

**Server audit schema (C.6)**

- `server/src/db/schema/audit-events.ts`: added nullable `chain_position` (bigserial), `prev_hash` (text), `signed_digest` (text) columns — backward-compatible with pre-Phase-4 rows

**AI gateway lockdown gate (C.7)**

- `server/src/ai-gateway/policy-engine.ts`: step 0 before model allowlist checks `ai_endpoint_allowlist` table for tenant-permitted providers; strong/strict lockdown blocks any model not listed; writes `lockdown_blocked:<level>` audit event on denial

### Changed

- `server/src/hono-types.ts`: added `lockdownLevel: string` to `HonoEnv.Variables`

---

## [2026-05-22] — Phase 2 + 3: AI attributes, sync protocol, admin console

### Added — `packages/core/src/ai/`

**AI Attribute engine (C.2)**

- `ai/attributes-engine.ts` (new): compute scheduler with `requestIdleCallback` background queue, in-memory cache, SHA-256 provenance hashing for input data and prompt, HIPAA field gate (returns error state without calling AI), lockdown gate (blocks cloud tier in `strong`/`strict`), writes `ai_attribute_computed`/`ai_attribute_failed` audit events
- `ai/adaptive-engine.ts` (new): usage observation tracking (nav history, record-open history, max 50 entries each), pattern analysis after each event, `pin_view` suggestion when a view appears ≥4/10 recent navigations, full suggestion lifecycle audit trail (`adaptive_suggestion_proposed/accepted/dismissed`), `acceptSuggestion()` persists to `localStorage('tk_pinned_views')`

**AI Runtime refactor (C.5, C.6, C.7)**

- `ai/ai-runtime.ts`: added `LockdownViolationError` class; `callBackend()` now checks lockdown before dispatch (blocks cloud tier in `strong`/`strict`, writes `lockdown_violation_blocked` audit event), records `lastProvenance` slot (`provider`, `modelId`, `computedAt`, `computeDurationMs`, `confidence`) after every call, and adds `lastCommandIntent` slot to `aiRuntime`

**AI Tools extension**

- `ai/ai-tools.ts`: 8 new tools — `compute_attribute`, `refresh_attribute`, `list_attribute_defs`, `explain_attribute`, `run_command_intent`, `propose_layout_change`, `accept_adaptive_suggestion`, `dismiss_adaptive_suggestion`; lazy-loads `attributes-engine` on first AI Attribute call

**Voice input (C.9)**

- `voice-input.ts` (new): Web Speech API wrapper with fully typed custom interfaces (no `any`); all state on `voiceRuntime` object (ESM binding rule); HIPAA field skip set (`HIPAA_FIELD_IDS`); lockdown gate; `startVoiceInput(fieldId, onResult)` / `stopVoiceInput()`

### Added — `server/src/api/routes/`

**Sync protocol (C.3)**

- `sync.ts` (new): `POST /api/v1/sync/pull` (checkpoint + limit, returns `DocWithRev[]`), `POST /api/v1/sync/push` (conflict detection via `updatedAt` comparison, UPSERT, returns conflicts), `GET /api/v1/sync/stream` (SSE via `streamSSE()`, polls every 30 s); all endpoints wrapped in `withTenant()` and write `sync_pull`/`sync_push` audit events; Valibot validation via `safeParseV()`

**AI Attributes compute (C.2)**

- `ai-attributes.ts` (new): `POST /api/v1/ai/attributes/:id/compute` — HIPAA check → cache check → AI gateway call → persist to `ai_attribute_values` table → `ai_attribute_computed` audit event

**Admin console routes (C.7)**

- `admin.ts` (extended): GET/PATCH `/org-settings` (lockdown level, retention days, compliance packs), GET/POST/DELETE `/ai-allowlist`, GET/POST/DELETE `/integrations`; all routes role-guarded (admin/owner), wrapped in `withTenant()`, use Valibot `safeParseV()`, write audit events

### Added — adapters

- `packages/adapter-rxdb-couchdb/src/index.ts` (new): original CouchDB/PouchDB replication protocol preserved as `CouchDBAdapter`; document ID convention `{store}/{recordId}`
- `packages/adapter-rxdb/src/index.ts` (rewritten): Hono-native 3-endpoint protocol — POST /pull, POST /push, GET /stream (SSE); wire shape `DocWithRev { id, store, rev, data, _deleted?, updatedAt }`; conflict resolution: `customFields` union, `tags` union, newer `updatedAt` wins for all other fields; one retry for resolved conflicts without `assumedMasterState`

### Added — views

- `views/admin-console.ts` (rebuilt): Linear-quality multi-tab admin console with 7 tabs (overview, users, lockdown, ai-allowlist, audit, compliance, integrations); tab state persisted to `localStorage('tk_admin_tab')`; lockdown radio cards with EU AI Act transparency note; audit log table with CSV/JSONL export; compliance pack cards (HIPAA, EU AI Act, GDPR, SOC 2); integration manager stub; all strings through `escH()`

### Changed

- `apps/enterprise-web/src/entry.ts` (rebuilt): full bootstrap function — resolves OIDC token from `tk_access_token` HttpOnly cookie (or `VITE_AUTH_TOKEN` env in dev), server liveness check (`/healthz`), `ENTERPRISE_POLICY` (`allowedTiers: ['browser','ollama','cloud']`), `RxDBAdapter` wiring, `await init()`
- `apps/pwa-sync/src/entry.ts`: switched from CouchDB URL to Hono-native `RxDBAdapter` with `VITE_SERVER_URL` + optional `VITE_AUTH_HEADER`

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
