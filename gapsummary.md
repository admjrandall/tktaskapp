Complete App — Gap Inventory
Here's every item found across the codebase, sorted by category:

GROUP A — Missing files (completely absent, not stubs)
config/vite/base.config.ts — shared Vite base options referenced by all app configs
.github/CODEOWNERS — code ownership for security reviews
.github/PULL_REQUEST_TEMPLATE.md — PR submission checklist
.github/ISSUE_TEMPLATE/bug_report.md — structured bug reports
.github/ISSUE_TEMPLATE/feature_request.md — structured feature requests
packages/adapter-kms/README.md — GDPR crypto-shredding mechanism docs
packages/adapter-mobile-native/README.md — Capacitor / iOS ATS / Android NSC / MASVS docs
tests/security/bola-idor.test.ts — BOLA/IDOR stub tests (referenced in 0007-identity-and-authz.md but never created)
infra/k8s/network-policy.yaml — deny-all K8s network policy with port-3000/KMS/IdP/OTel exceptions
perf:analyse script in apps/offline-web/package.json (vite-bundle-visualizer)
GROUP B — Incomplete wiring (files exist, logic not connected)
packages/core/src/schemas/import.schema.ts — exists but not wired into the JSON import flow; malformed imports are not validated before dbCreate calls
packages/core/src/schemas/ai-tool.schema.ts — exists but pre-mutation validation not confirmed wired into routeToolCall in ai-tools.ts
apps/offline-web/index.html — <meta name="version" content="{{APP_VERSION}}"> template placeholder may not be in the HTML template; vite.config.ts replaces it but the template tag must also exist
scripts/assert-bundle-size.mjs — offline-internal-ai budget not tested; current built sizes not documented in the header comment block
GROUP C — Stub tests (.todo — require full implementation)
tests/security/gdpr-erasure.test.ts — 8 tests: key destruction → data unreadable, backup copy unreadable, DSAR evidence auditability
tests/security/ai-prompt-injection.test.ts — 29 tests: task name, doc content, client notes injection vectors
tests/accessibility/keyboard-navigation.test.ts — 40+ tests
tests/accessibility/modal-focus-trap.test.ts — 30+ tests
tests/accessibility/screen-reader-labels.test.ts — 50+ tests
tests/adapters/kms-contract.ts — all tests .todo: key issuance, wrapping, destruction, DSAR workflow
.github/workflows/accessibility.yml — currently echoes "stub" instead of running real axe-core against dist/offline/index.html
GROUP D — Server stubs (interface-only, require backend implementation)
server/src/db/schema/users.ts — TODO: replace TypeScript interfaces with actual Drizzle pgTable() definitions (tenant_users, user_roles, user_kms_keys)
server/src/db/schema/audit-events.ts — TODO: Drizzle pgTable, index design, retention policy
server/src/db/schema/kms-keys.ts — TODO: Drizzle pgTable, index design, append-only trigger, destruction scheduler
server/src/db/index.ts — TODO: real drizzle() instance, connection string, migrate.ts, seed.ts, health check
server/src/auth/oidc.ts — OIDC/PKCE implementation (Section 11.1); requires identity provider selection
server/src/authorization/policy-engine.ts — OPA or Cedar policy engine (Section 11.2)
server/src/kms/key-service.ts — AWS KMS / Azure Key Vault / GCP KMS (Section 11.3); provider not chosen
server/src/observability/otel.ts — OpenTelemetry SDK wiring: traces, metrics, structured logs with trace_id/span_id correlation (Section 11.4)
server/src/ai-gateway/policy-engine.ts — AI gateway policy: rate limiting, prompt screening, cost enforcement (Section 11.5)
server/src/api/routes/health.ts — /readyz returns hardcoded "connected"; needs real DB + KMS health probes
GROUP E — Adapter stubs (require significant external dependencies)
packages/adapter-rxdb/src/index.ts — full RxDB replication sync adapter implementation
packages/adapter-dataverse/src/index.ts — Power Platform / Dataverse sync adapter
packages/adapter-mobile-native/src/ — Capacitor native vault, biometric unlock, iOS/Android bridge
apps/pwa-sync/src/entry.ts — currently imports NullAdapter; needs RxDB adapter and service worker wiring
apps/dataverse/src/entry.ts — stub imports DATAVERSE_PROFILE; needs Dataverse adapter wired
apps/enterprise-web/src/entry.ts — stub; needs all 7 server-side dependencies satisfied
apps/mobile/src/entry.ts — stub; needs Capacitor installed and native adapter wired
GROUP F — 2026 best practice gaps (discovered from web research)
TypeScript Project References — packages don't use tsc --build project references; build isolation relies only on Turborepo task ordering; adding composite: true + references[] to each package's tsconfig would give true type-boundary enforcement per 2026 TS best practices
OWASP 2025 A03 — Software Supply Chain — pnpm audit is in CI, but no license compatibility check is automated (Semgrep catches code vulnerabilities, not license conflicts)
OWASP 2025 A10 — Mishandling Exceptional Conditions — no global error boundary / unhandled-rejection handler wired into the offline app; errors in view renders or IndexedDB ops may silently fail
GDPR transparency (EDPB 2026 focus: Articles 12–14) — no in-app privacy notice or data processing transparency UI; the EDPB's 2026 coordinated enforcement action targets exactly this gap
WCAG 2.2 minimum touch target sizes — axe-core 4.5+ includes touch-target size rules; current CI stub won't catch these violations in mobile/tablet viewports
Drizzle ORM Row-Level Security — server schema design doesn't include PostgreSQL RLS policies; 2026 multi-tenant Drizzle best practice is to enforce tenant isolation at the DB level, not just application level
Vitest configuration audit — test runner is assumed to be Vitest (per filerevamp.md) but no vitest.config.ts or vitest.workspace.ts found at repo root; tests may not be discoverable across packages
