# Task App CRM — Final Production Readiness Remediation Report

**Date:** 2026-05-23  
**Second-pass review:** 2026-05-24  
**Owner:** Codex  
**Source task:** `PRODUCTION-READINESS-REMEDIATION-TASK.md`  
**Implementation commit:** included in `chore: remediate production readiness gaps`

## Summary

This remediation pass converted the repo from partially documented controls to stronger enforceable gates in the highest-risk areas: auth fail-closed behavior, PKCE/refresh-token state, route-level resource authorization, Trusted Types sink enforcement, offline password screening, AI gateway durable controls, audit-chain population, append-only audit/KMS database triggers, production config validation, deployment hardening, and release gate coverage.

This report is intentionally evidence-oriented. It distinguishes controls that are fully enforced from controls where the code now has a safer foundation but still needs follow-up before a security reviewer should treat the area as complete.

## Key changes

- Release gates: root lint now includes `server/**`; `lint:server` is explicit; `server/dist/**` is ignored as generated output; production audit is clean.
- Auth: unknown/suspended/wrong-tenant Entra users now receive `403`; auth maps Entra `tid + oid` to internal `tenant_users.org_id`; PKCE state is single-use with 10-minute TTL; production auth state requires Redis; refresh token replay/revocation is tracked by SHA-256 token hash.
- Authorization: OPA fallback and Rego deny cross-tenant resources before role grants. By-id entity routes now use `resourcePolicyMiddleware()`, resolve resource ownership before handler execution, return `404` for missing resources, and deny cross-tenant access even for admins. Entity services are tenant-scoped through `withTenant()` and tenant filters.
- Trusted Types/XSS: removed the global `innerHTML`/`outerHTML` monkey patch and the globally accessible `nexus-crm-raw` policy; CSP now allows `nexus-crm-static-template`; DOM sinks must use explicit audited helpers.
- Offline crypto UX: new vault passwords require 15+ Unicode characters and pass a bundled offline common-password/application-password screen.
- AI gateway: production calls require durable Redis-backed rate/budget state; sensitive-data handling is explicit and blocks by default in production; gateway audit failures fail closed in production.
- Audit/compliance: server audit writer now computes tenant chain position, `prevHash`, and `signedDigest` using canonical JSON; tamper verification tests cover modified events; migration `0006_audit_append_only.sql` blocks `UPDATE`/`DELETE` against `audit_events` and `kms_key_lifecycle`.
- GDPR erasure: legal-hold checks and KMS lifecycle writes now run inside tenant context; DSAR soft-delete only touches records directly attributable to the erased user, not unrelated tenant/client data.
- Deployment: compose removed default credentials and floating observability images; Kubernetes namespace now has Restricted Pod Security Admission labels; NetworkPolicy no longer ships `0.0.0.0/0` HTTPS egress.

## Control status by phase

| Phase                     | Status                           | Evidence                                                                                                                                                                                  | Notes                                                                                                                                                                                           |
| ------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Release gates          | Closed                           | `pnpm run lint`, `pnpm run lint:server`, `pnpm audit --prod`; `package.json`, `eslint.config.mjs`                                                                                         | Lint has warnings but 0 errors. Server TS is now linted explicitly.                                                                                                                             |
| 2. Auth and identity      | Closed                           | `server/src/auth/middleware.ts`, `server/src/auth/routes.ts`, `server/src/auth/state-store.ts`, `tests/security/server-auth*.test.ts`                                                     | Production Redis-backed auth state is required. PKCE state is single-use and expired states are rejected. DB-backed PKCE tables remain migration groundwork.                                    |
| 3. Authorization/RLS/BOLA | Closed for implemented entities  | `server/policies/crm.rego`, `server/src/middleware/opa.ts`, resource-aware by-id routes, tenant-scoped services, `tests/security/server-opa-policy.test.ts`                               | Route-level ownership resolution covers implemented by-id CRM/admin/AI-attribute routes. List/create/sync routes remain tenant-scoped through authenticated tenant context and service filters. |
| 4. Trusted Types/CSP/XSS  | Closed for global bypass removal | `packages/core/src/security/trusted-types.ts`, `packages/core/src/render-utils.ts`, CSP templates, lint sink rules                                                                        | The global setter patch and `nexus-crm-raw` were removed. Large template rendering still relies on audited static helpers plus escaped/sanitized inputs.                                        |
| 5. Offline auth/crypto UX | Closed for new password creation | `packages/core/src/security/master-password-policy.ts`, `tests/security/master-password-policy.test.ts`                                                                                   | Existing vault unlock remains backward compatible.                                                                                                                                              |
| 6. AI gateway safety      | Mostly closed                    | `server/src/ai-gateway/policy-engine.ts`, `tests/security/server-ai-gateway.test.ts`, offline bundle assertion                                                                            | Production durable state and sensitive-data mode are enforced. Tenant allowlist is provider/model-prefix based and should be revisited for richer per-model policy.                             |
| 7. Audit/compliance       | Closed for implemented controls  | `server/src/services/base.ts`, `server/drizzle/0006_audit_append_only.sql`, `tests/security/server-audit-chain.test.ts`, `tests/security/server-audit-migration.test.ts`, compliance docs | New server audit writes include chain fields; DB triggers enforce append-only audit and KMS lifecycle rows.                                                                                     |
| 8. Deployment hardening   | Mostly closed                    | `docker-compose.yml`, `infra/k8s/namespace.yaml`, `infra/k8s/network-policy.yaml`, `server/src/config/production.ts`                                                                      | Compose intentionally requires local secrets. NetworkPolicy uses documentation CIDR placeholder, requiring environment overlay before production apply.                                         |
| 9. Accessibility/UX       | Regression-covered               | `tests/accessibility/*`, `pnpm run test`                                                                                                                                                  | Existing automated accessibility regression tests ran in the full suite. No browser axe/manual artifact was generated in this pass.                                                             |

## Verification

Commands run from `D:\techkeycrmapp`:

| Command                                  | Result                                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`                     | Passed                                                                                                                                                           |
| `pnpm run lint`                          | Passed with existing warnings, 0 errors                                                                                                                          |
| `pnpm run test`                          | Passed: 209 passed, 3 skipped, 100 todo                                                                                                                          |
| `pnpm run build:offline`                 | Passed; regenerated CSP and `dist/offline/index.sha256`                                                                                                          |
| `node scripts/assert-bundle-size.mjs`    | Passed; offline-browser-ai raw 475,641 bytes / gzip 127,815 bytes                                                                                                |
| `node scripts/assert-offline-bundle.mjs` | Passed; no forbidden provider strings in offline bundle                                                                                                          |
| `pnpm audit --prod`                      | Passed; no known vulnerabilities                                                                                                                                 |
| `pnpm run lint:server`                   | Passed                                                                                                                                                           |
| `pnpm --dir server run typecheck`        | Passed                                                                                                                                                           |
| `pnpm --dir server run test`             | Passed after escalated rerun; no server-local test files, `--passWithNoTests` exited 0                                                                           |
| `pnpm --dir server run build`            | Passed after escalated run; produced `server/dist/server.js`                                                                                                     |
| `docker compose config`                  | Intentionally fails without `.env.local` / `POSTGRES_PASSWORD`; this proves default credential removal. A structural render still requires a local `.env.local`. |

Dependency versions verified:

- Root dev-only `drizzle-orm`: `0.43.1`.
- Server production `drizzle-orm`: `0.45.2`.
- Server OpenTelemetry production packages: `@opentelemetry/sdk-node 0.218.0`, `@opentelemetry/auto-instrumentations-node 0.76.0`, `@opentelemetry/exporter-trace-otlp-http 0.218.0`.

## Standards decisions

- NIST-style memorized-secret handling: increased new-vault minimum to 15 characters, avoided composition rules, allowed Unicode, and added local denylist screening.
- Trusted Types: kept `require-trusted-types-for 'script'`, removed the pass-through global setter patch, and made trust level explicit in helper names.
- OAuth/PKCE: S256 PKCE remains the only supported method; production state must be durable because Kubernetes uses multiple replicas.
- AI gateway: production default for detected sensitive data is block, not redact-and-send.

## Remaining risks

- Server-local Vitest has no `server/tests` files yet; security regression tests currently live under root `tests/security`.
- `pnpm run lint` still emits warning-level findings, mostly non-null assertions in UI code. The release gate passes because warnings are not errors.
- `docker compose config` cannot fully render on this workstation without the intentionally required `.env.local`; this is expected after removing insecure defaults.
- Accessibility regression tests run in Vitest, but this pass did not produce a browser axe/manual keyboard artifact.
