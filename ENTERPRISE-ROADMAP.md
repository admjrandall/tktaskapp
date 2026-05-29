# Enterprise-Readiness Roadmap

**Task App CRM — monorepo**
**Created:** 2026-05-29
**Status:** Living document — track item completion against the phase tables.

This roadmap captures the gap between the current build and what 2026 enterprise
buyers expect, derived from a direct source audit of `packages/core/src/` and
`server/src/` on 2026-05-29. It is deliberately honest about what is a stub
versus a real implementation.

> **Framing.** The security and architecture foundations are strong: hash-chained
> audit (`writeAuditEvent` / `verifyAuditChain`), per-tenant Postgres RLS via
> `withTenant()`, OIDC + PKCE with RFC 9700 nonce validation, step-up auth,
> AES-256-GCM with non-extractable keys, OPA authorization, an offline-first sync
> protocol, and a clean three-target adapter boundary. The gaps are in **product
> surface** and **operational maturity**, not in the structural core. Most items
> below are additive, not rewrites — the one exception is the deliberate React
> migration (see ADR-M-015 in `DECISIONS.md`).

## Current-source verification

Best-practice claims checked 2026-05-29 against: OWASP API Security Top 10,
WCAG 2.2 (US Title II compliance date April 2026), BullMQ 5.71 / pg-boss,
and IDaaS/SCIM guidance. Stack versions read from `package.json`: Vite 8,
TypeScript 6, Vitest 4, Playwright 1.60, Storybook 10 (frontend); Node ≥22.20,
Hono 4, Drizzle 0.45, Valibot 1.4, jose 6 (server).

**Not verified:** transitive-dependency CVE status; whether the single-file
offline build currently passes (audit was source-read, not a build run).

---

## Priority 0 — De-risk (highest priority, blocks enterprise sale)

The single largest gap is **test coverage**, which outranks every feature below.
No security review or SOC 2 / ISO 27001 audit passes with an untested
`withTenant()` isolation boundary.

| ID   | Item                                                 | State at audit                                                     | Target                                          |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| P0-1 | Audit hash-chain unit tests                          | ✅ Done 2026-05-29 — `server/src/services/base.test.ts` (19 tests) | Lock in tamper/reorder/break detection          |
| P0-2 | Pagination clamp tests                               | ✅ Done 2026-05-29 (same file)                                     | Guard the resource-exhaustion limit             |
| P0-3 | `withTenant()` RLS isolation integration tests       | ❌ Not covered — needs Postgres harness                            | testcontainers-backed cross-tenant denial tests |
| P0-4 | `writeAuditEvent` persistence + chain-on-write tests | ❌ Not covered — needs Postgres harness                            | Same harness as P0-3                            |
| P0-5 | Token revocation / step-up integration tests         | ❌ Not covered                                                     | Redis + DB harness                              |
| P0-6 | Frontend render/component tests                      | ❌ Zero view render tests today                                    | Vitest + Testing Library per view               |
| P0-7 | E2E golden-path coverage                             | ⚠️ Only 4 Playwright specs (3 a11y + 1 mobile)                     | Login → CRUD → sync → logout                    |
| P0-8 | Dependency/CVE scanning in CI                        | ⚠️ Not verified present                                            | Automated SCA gate                              |

**P0-1 / P0-2 are complete.** They required a small behavior-preserving refactor:
the SHA-256 digest computation, previously duplicated between `writeAuditEvent`
and `verifyAuditChain`, was extracted into the exported `computeAuditDigest()`
helper so the hash-chain integrity logic is unit-testable without a database.

---

## Frontend

Architecture today: **vanilla TypeScript, no framework**, string-template
`innerHTML` through Trusted Types, hand-rolled pub/sub state in `state.ts`.
Per ADR-M-015 the frontend will migrate to **React**, while offline-web
continues to emit a single inlined HTML file (`vite-plugin-singlefile`).

### Critical (power-user blockers)

| ID  | Item                                                | State at audit                                                                          |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| F1  | Virtual scrolling for large lists                   | ❌ All rows rendered in one `<table>` (`views/list-grid-kanban-spatial.ts`)             |
| F2  | Bulk select + bulk actions                          | ❌ No `selectedIds`/select-all wiring                                                   |
| F3  | Inline cell edit                                    | ❌ Row click opens modal only                                                           |
| F4  | Saved views (filter/sort/column presets)            | ❌ None                                                                                 |
| F5  | Column resize / reorder / show-hide                 | ❌ Columns hardcoded per store in `colMap`                                              |
| F6  | Wire frontend to server-side sort/filter/pagination | ❌ Client-side only; `paginate()` in `application/index.ts` is dead code (zero callers) |

### High

| ID  | Item                                            | State at audit                                                                                                                                                                    |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F7  | Real charting library                           | ❌ "Charts" are hand-built CSS `div` bars (`reports.ts`, `dashboard.ts`)                                                                                                          |
| F8  | Collaboration presence + conflict-resolution UI | ❌ Sync returns `conflicts[]`; `storage/db.ts` only `console.warn`s + generic toast. `sync_conflict_resolved` audit event exists with no user flow                                |
| F9  | Internationalization (i18n)                     | ❌ Hardcoded English; no `Intl` locale formatting. Hard gate for EU/government                                                                                                    |
| F10 | WCAG 2.2 AA conformance                         | ⚠️ Real effort exists (`trapFocus()`, ARIA on palette/dialogs, axe tests) but sparse outside modals. Tables/kanban/`<div data-id>` rows are mouse-only. Title II date: April 2026 |

**Keep:** the dashboard widget canvas (drag/resize/z-order persisted) is genuinely
good; the notification center, global command-palette search, dark mode, and
focus-trapped dialogs are real and should carry over to React.

---

## Backend

All 17 routers are mounted in `server/src/index.ts` (including `ai-attributes`
at `/api/v1/ai/attributes`). Auth, OTel, RLS, and audit are real. Gaps are
operational scale-out concerns.

### Critical

| ID  | Item                            | State at audit                                                                                                               |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| B1  | HTTP-layer rate limiting        | ❌ Only the AI gateway throttles (20 rpm/user). All CRM + auth routes unthrottled. OWASP "Unrestricted Resource Consumption" |
| B2  | Durable background job queue    | ❌ Only two `setInterval` timers. Bulk import/export and `ai-attributes/:id/compute` run synchronously in-request            |
| B3  | Outbound webhook / event outbox | ❌ `admin.ts` integrations are real DB CRUD but **nothing ever dispatches**. No delivery, no outbox                          |

For B1 use Redis-backed limits (`rate-limit-redis` + atomic Lua) since the server
scales horizontally; stricter policies on auth and export routes. For B2, pg-boss
(Postgres `SKIP LOCKED`, no new infra) or BullMQ 5.71 (Redis already present) are
both defensible. B3 should hang a transactional outbox off the existing mutation
path → queue (B2) → HMAC-signed, retried delivery.

### High

| ID  | Item                                          | State at audit                                                                                                                                                            |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B4  | Full-text search                              | ❌ Single-column `ILIKE '%term%'` per service; no ranking, no index. Move to `tsvector` + GIN                                                                             |
| B5  | Multi-IdP + SCIM 2.0 provisioning             | ❌ Hardcoded to Microsoft Entra (`login.microsoftonline.com`). SCIM now as table-stakes as SSO for B2B                                                                    |
| B6  | Server-mediated WebAuthn for enterprise SSO   | ⚠️ Passkeys exist for offline-web **local vault re-auth** (CHANGELOG S-1); no server-side WebAuthn ceremony for the OIDC flow. Enforce passkey-only for owner/super-admin |
| B7  | OpenAPI response schemas + deprecation policy | ⚠️ `/openapi.json` + Swagger exist but most responses are description-only. Derive bodies from the 28 Valibot schemas                                                     |

### Medium

| ID  | Item                                                 | State at audit                                                                                                            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| B8  | Cursor pagination for high-volume endpoints          | ⚠️ Offset-based, clamped to 100 (`paginationValues`). Fine now; offset drifts at scale                                    |
| B9  | Response / query caching                             | ⚠️ Redis is auth/step-up/AI-budget only                                                                                   |
| B10 | Per-tenant operational visibility + anomaly alerting | ⚠️ OTel + metrics solid, but no per-tenant quota view or anomaly alerts. No Prometheus scrape endpoint (OTLP-export only) |

---

## Cross-cutting

- **Mobile (Capacitor):** build automation not implemented; biometric vault
  adapter present but test coverage unclear; no deep-link handling.
- **Onboarding:** enterprise flows (SSO setup, domain verification, bulk user
  import, workspace templates) likely stubs.

---

## Phased delivery plan

| Phase | Theme                             | Items                             |
| ----- | --------------------------------- | --------------------------------- |
| 0     | De-risk (now, parallel)           | P0-1..P0-8                        |
| 1     | Security & reliability hardening  | B1, B2, B8                        |
| 2     | React conversion + grid           | ADR-M-015, F1, F2, F3, F5, F6, F7 |
| 3     | Enterprise integration & identity | B3, B5, B6, B4                    |
| 4     | Polish & global                   | F9, F10, F8, B7, B10, onboarding  |

### Phase 2 migration watch-items (React + single-file offline)

- **Trusted Types:** React reconciles the DOM itself; the `patchInnerHTML()` IIFE
  and `nexus-crm` policy assumptions change. React auto-escapes (helps XSS), but
  `dangerouslySetInnerHTML` becomes the new audit boundary — route it through
  `createAuditedStaticHTML()`.
- **`escH()`** usage shrinks (JSX escapes by default) but must remain for any
  raw-HTML path.
- **CSP hash regeneration** (`generate-csp.mjs`) is still required after each
  offline build — re-verify against the React bundle and `dist/offline/index.html`.
- **Adapter boundary** (ADR-M-002) holds: the React layer must not import concrete
  adapters; injection stays via `setAdapter()`.

---

## Sources

- OWASP API Security Top 10 — https://owasp.org/API-Security/
- Node.js API security best practices 2026 — https://www.hirenodejs.com/blog/nodejs-security-best-practices-2026
- BullMQ 5 background jobs (2026) — https://dev.to/young_gao/bullmq-job-queues-background-processing-in-nodejs-done-right-5306
- pg-boss — https://github.com/timgit/pg-boss
- WCAG 2.2 enterprise 2026 — https://almcorp.com/blog/wcag-2-2-enterprise-web-accessibility-requirements-2026/
- WCAG 2.2 / EAA / ADA guide — https://www.codewithseb.com/blog/web-accessibility-2026-eaa-ada-wcag-guide
- IAM providers & SCIM 2026 — https://workos.com/blog/best-identity-access-management-providers-2026
- Passkeys for SaaS — https://www.scalekit.com/blog/passkeys-saas-guide-to-passwordless-signins
