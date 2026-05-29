# Architecture Decision Records

**Task App CRM — monorepo**
**Last reviewed:** 2026-05-27

This document records the significant architectural decisions made during and after the monorepo migration. Each entry answers: _"Why does the code look like this?"_

For decisions specific to the legacy single-file build (`taskapp.html`) see `originalfiles/DECISIONS.md`.

---

## ADR-M-001 — Three delivery targets: offline-web, enterprise-web, Dataverse

**Status:** Active
**Date:** 2026-05-24

### Decision

The product is delivered as three distinct build targets sharing one core UI package (`packages/core/src/`):

| Target         | Entry                                      | Adapter            | Runtime                              |
| -------------- | ------------------------------------------ | ------------------ | ------------------------------------ |
| Offline-web    | `apps/offline-web/src/entry-browser-ai.ts` | `NullAdapter`      | Single HTML, `file://`, no server    |
| Enterprise-web | `apps/enterprise-web/src/entry.ts`         | `RxDBAdapter`      | HTTPS PWA, OIDC/PKCE, service worker |
| Dataverse      | `apps/dataverse/src/entry.ts`              | `DataverseAdapter` | Power Platform Code App              |

`apps/mobile/` is Capacitor native packaging only — no web entry. It uses `dist/enterprise` as its WebView source.

### Alternatives considered

- Single build with feature flags at runtime
- Five targets (the previous architecture: offline-web, pwa-sync, mobile PWA, enterprise-web, Dataverse)

### Rationale

Five targets created overlap with no differentiation between pwa-sync and enterprise-web. Consolidating to three maps cleanly to three authentication models (none / Entra ID OIDC / Power Platform) and three data persistence models (local IDB / server sync / Dataverse API). Feature flags at runtime would mix incompatible adapter code into every bundle — increasing bundle size and blurring the security boundary between offline and connected code.

---

## ADR-M-002 — Adapter injection pattern (NullAdapter / RxDBAdapter / DataverseAdapter)

**Status:** Active
**Date:** 2026-05-21

### Decision

`packages/core/src/` contains zero concrete adapter imports. Adapters are injected via `setAdapter()` in `storage/db.ts` from each target's entry file before `init()` is called.

### Rationale

This prevents cross-target contamination. If `packages/core/src/` imported `RxDBAdapter` directly, the offline-web bundle would include server sync code — violating the offline CSP and increasing bundle size. The injection boundary is enforced by the `security-review` skill check: no concrete adapter import may exist inside `packages/core/src/`.

---

## ADR-M-003 — Hono v4 for the server

**Status:** Active
**Date:** 2026-05-21

### Decision

The enterprise-web backend uses Hono v4 (`@hono/node-server` adapter).

### Alternatives considered

- Express v5
- Fastify v5
- tRPC over Hono

### Rationale

Hono provides first-class TypeScript support, a `c.get()` / `c.set()` context system that integrates cleanly with the `HonoEnv` typed middleware chain, and a minimal footprint. The `@hono/node-server` adapter bridges to Node without requiring a framework rewrite for edge deployment later. tRPC was rejected because it requires client code generation that conflicts with the Dataverse and offline-web targets which have no tRPC client.

---

## ADR-M-004 — Drizzle ORM with PostgreSQL

**Status:** Active
**Date:** 2026-05-21

### Decision

The server uses Drizzle ORM (`drizzle-orm/pg-core`) with PostgreSQL.

### Alternatives considered

- Prisma
- Raw `pg` queries
- TypeORM

### Rationale

Drizzle generates SQL that is readable and auditable — important for a codebase with PostgreSQL Row-Level Security policies that must be verifiable by a security reviewer. Prisma's schema language is a separate DSL and its migration runner does not support the `SET LOCAL` session variables required by RLS. TypeORM lacks first-class Drizzle-style type inference. Raw `pg` was rejected because it provides no schema type safety.

---

## ADR-M-005 — Valibot for server-side request validation

**Status:** Active
**Date:** 2026-05-21

### Decision

All server route request bodies are validated with Valibot schemas via `safeParseV()` from `server/src/schemas/index.ts`. Zod is not used.

### Alternatives considered

- Zod v3
- `ajv` + JSON Schema

### Rationale

Valibot's tree-shakeable design produces smaller bundle output than Zod for a server that handles many schema shapes. The `safeParseV()` helper provides a consistent interface that returns `{ success, output, issues }` — aligning with the error response format used by all routes. `ajv` + JSON Schema was rejected as too verbose for the number of entity schemas required.

---

## ADR-M-006 — pnpm workspaces monorepo

**Status:** Active
**Date:** 2026-05-21

### Decision

The repository uses pnpm workspaces with Turborepo for task orchestration.

### Rationale

pnpm's symlink-based `node_modules` prevents phantom dependency access — a package cannot import a dependency it did not declare. Turborepo caches build outputs per-package, making incremental builds fast when only one target changes. The workspace layout enforces the adapter injection boundary: `packages/core/` cannot import from `packages/adapter-*/` because those are peer packages, not dependencies.

---

## ADR-M-007 — RxDB sync protocol (Hono-native endpoints)

**Status:** Active
**Date:** 2026-05-22

### Decision

The enterprise-web sync uses a Hono-native three-endpoint protocol (`POST /pull`, `POST /push`, `GET /stream` SSE) rather than the CouchDB/PouchDB replication protocol.

### Alternatives considered

- CouchDB/PouchDB replication (retained as `adapter-rxdb-couchdb` for teams with existing CouchDB infrastructure)
- WebSocket-based sync

### Rationale

The Hono-native protocol is simpler to secure — each endpoint is individually guarded by `withTenant()`, `writeAuditEvent()`, and OPA middleware. CouchDB replication runs its own HTTP layer that bypasses these controls. The CouchDB adapter is retained for teams with existing CouchDB infrastructure. WebSockets were rejected because SSE is sufficient for server-push invalidation and the push direction is already covered by the POST endpoint.

---

## ADR-M-008 — Azure Key Vault as KMS (pluggable via getKmsService())

**Status:** Active
**Date:** 2026-05-21

### Decision

KMS uses Azure Key Vault by default. The factory `getKmsService()` reads `KMS_PROVIDER` env var, allowing future providers. Direct instantiation of `AzureKeyVaultKeyService` is forbidden outside `key-service.ts`.

### Rationale

Azure Key Vault integrates with Microsoft Entra ID (the chosen IdP) via DefaultAzureCredential — no separate credential management. The factory pattern means switching to AWS KMS requires only a new env var value, not code changes across the codebase.

---

## ADR-M-009 — Microsoft Entra ID as IdP (OIDC + PKCE)

**Status:** Active
**Date:** 2026-05-21

### Decision

The enterprise-web target authenticates via Microsoft Entra ID using OIDC + PKCE (S256 code challenge). The server never accepts Entra `tid` as the internal tenant ID — it maps Entra `oid` + `tid` to an internal `tenant_users.org_id`.

### Rationale

The primary target market for the enterprise-web target is Microsoft-ecosystem organisations. Entra ID provides FIDO2/passkey support (NIST SP 800-63B-4 AAL2 compliant), conditional access policies, and token revocation via logout endpoint — all required for the compliance posture. The `oid`+`tid` → `org_id` mapping decouples the internal tenant identity from the IdP, allowing a future migration to a different IdP without schema changes.

---

## ADR-M-010 — OPA for authorization with three-tier fallback

**Status:** Active
**Date:** 2026-05-21

### Decision

Authorization uses OPA with a three-tier evaluation order: REST sidecar → WASM → in-process TypeScript. Default is deny.

### Rationale

OPA REST sidecar allows policy updates without redeployment. WASM provides a fallback when the sidecar is unavailable (e.g. during startup). The in-process TypeScript fallback ensures the server is never open by default — it mirrors the Rego policy logic and is the last line of defense. The three tiers degrade gracefully under infrastructure failure without becoming permissive.

---

## ADR-M-011 — PostgreSQL RLS for multi-tenant isolation

**Status:** Active
**Date:** 2026-05-21

### Decision

All CRM tables use PostgreSQL Row-Level Security with `FORCE ROW LEVEL SECURITY`. Isolation is enforced by `SET LOCAL app.tenant_id` and `SET LOCAL app.org_id` inside every `withTenant()` transaction.

### Alternatives considered

- Application-level tenant filtering (WHERE tenant_id = ?)
- Separate schema per tenant
- Separate database per tenant

### Rationale

Application-level filtering relies entirely on developers never forgetting a WHERE clause — a single missed filter exposes all tenants' data. RLS is enforced by the database regardless of application code. `FORCE ROW LEVEL SECURITY` ensures the app role cannot bypass policies even if it owns the tables. Separate schema/database per tenant was rejected due to operational complexity at scale.

---

## ADR-M-012 — Hash-chained audit log

**Status:** Active
**Date:** 2026-05-22

### Decision

Audit events are hash-chained: each event stores `chainPosition`, `prevHash` (the `signedDigest` of the previous event), and its own `signedDigest` (SHA-256 of canonical JSON). `writeAuditEvent()` maintains the chain atomically.

### Rationale

GDPR Article 17 and HIPAA require demonstrating that the audit trail has not been tampered with. A hash chain provides cryptographic evidence of integrity without requiring an external notary service. The `verifyAuditChain()` function can be run at any time to confirm the chain is intact.

---

## ADR-M-013 — Capacitor for mobile (native wrapper of enterprise-web)

**Status:** Active
**Date:** 2026-05-24

### Decision

`apps/mobile/` is a Capacitor native packaging project only. It uses `dist/enterprise` as its WebView source. There is no separate mobile web entry point.

### Rationale

Maintaining a separate mobile web build would diverge from the enterprise-web feature set over time. Capacitor wrapping of the enterprise-web build gives native device APIs (biometric unlock, filesystem, share sheet) without a separate codebase. The `CapacitorVaultAdapter` and `CapacitorBiometricAdapter` provide the native storage layer that the WebView calls via the Capacitor bridge.

---

## ADR-M-014 — esbuild native binary blocked by pnpm allowBuilds (intentional)

**Status:** Active
**Date:** 2026-05-27

### Decision

`pnpm-workspace.yaml` sets `allowBuilds: esbuild: false`. This blocks esbuild's postinstall script from running during `pnpm install`, preventing the install-time download of esbuild's native Go binary. The JavaScript fallback ships with the package and remains functional.

### Rationale

Postinstall scripts are a known supply-chain attack vector. Blocking them for packages that bundle native binaries reduces the risk that a compromised esbuild release could execute arbitrary code during `pnpm install` in CI or developer environments. This is the OWASP and CIS supply-chain hardening recommendation for build tooling.

### Observed behaviour

The server build (`cd server && pnpm build`) completes correctly. The `⚡` indicator in esbuild output confirms the native binary is active in environments where it was already installed (pre-seeded CI runners, developer machines). In environments where the binary was never installed, esbuild falls back to its pure-JS implementation — builds are slower but functionally correct.

### Trade-off accepted

Build speed may be reduced in environments without a pre-seeded esbuild binary. This is accepted in exchange for blocking arbitrary postinstall code execution. The version is pinned via `pnpm.overrides: esbuild: ^0.28.0` to limit the impact of a compromised release.

### Alternatives considered

Allowing the postinstall script (`allowBuilds: esbuild: true`) would restore native-speed builds unconditionally but exposes the install pipeline to any code the esbuild postinstall script runs. Rejected for security-sensitive CI environments.

---

## ADR-M-015 — Migrate the frontend to React (single-file offline build preserved)

**Status:** Accepted (migration not yet started)
**Date:** 2026-05-29

### Decision

The shared core UI (`packages/core/src/`), currently vanilla TypeScript rendering
through string-template `innerHTML` with a hand-rolled pub/sub store (`state.ts`),
will migrate to **React**. The offline-web target continues to emit a **single
inlined HTML file** for `file://` use via `vite-plugin-singlefile`; enterprise-web
and Dataverse use normal multi-asset builds.

### Context

The most-requested enterprise grid capabilities — virtual scrolling, inline edit,
bulk selection, column state, and server-side data binding (roadmap items F1–F6) —
fight the current `innerHTML`-templating model, which handles complex incremental
DOM state the worst. See `ENTERPRISE-ROADMAP.md` Phase 2.

### Alternatives considered

- **Stay vanilla, add a headless virtual-grid + chart library** — lowest
  disruption, preserves the offline build trivially, but leaves complex grid
  state hand-built.
- **Lightweight reactive layer (Lit / Preact / Svelte)** — smaller bundle than
  React, but a smaller component/data-grid ecosystem for the enterprise grid work.
- **Hybrid: framework only for heavy views** — two rendering models to maintain.

React was chosen for the maturity of its data-grid, table, and collaboration
component ecosystem, and to standardize on one rendering model across views.

### Consequences and invariants to preserve

- **Single-file offline build is non-negotiable** — `vite-plugin-singlefile`
  must continue to produce `dist/offline/index.html`; validate on `file://`.
- **Trusted Types:** React reconciles the DOM itself, so the `patchInnerHTML()`
  IIFE and `nexus-crm` policy assumptions change. React auto-escapes (reducing
  XSS surface), but `dangerouslySetInnerHTML` becomes the new audit boundary and
  must route through `createAuditedStaticHTML()`. `escH()` is retained for any
  raw-HTML path.
- **CSP hash regeneration** (`generate-csp.mjs`) must still run after every
  offline build and be re-verified against the React bundle.
- **Adapter boundary (ADR-M-002) holds** — the React layer must not import
  concrete adapters; injection stays via `setAdapter()`.
