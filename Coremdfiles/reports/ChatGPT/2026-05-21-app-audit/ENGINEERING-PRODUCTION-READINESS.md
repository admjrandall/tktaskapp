# Engineering and Production Readiness Report

Assessment date: 2026-05-21

## System Overview

Task App CRM is a TypeScript/pnpm monorepo-style project with:

- Offline browser CRM in `packages/core/src`
- Single-file Vite offline build in `apps/offline-web`
- PWA, Dataverse, mobile, and enterprise entry points
- Hono/PostgreSQL/Drizzle/OPA/OpenTelemetry enterprise server under `server`
- Docker Compose, Kubernetes manifests, GitHub Actions, CodeQL, dependency review, and security scan workflows

Current source inventory from local inspection:

- 276 tracked non-`node_modules`, non-`dist` files
- 72 TypeScript files in `packages/core/src`
- 69 TypeScript files in `server/src`
- Package folders under `packages/*` have no `package.json`
- Only `apps/offline-web` has an app-level `package.json`

## Verified Gates

| Gate                                     | Result | Notes                                                                              |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `pnpm run typecheck`                     | Failed | Server dependency resolution, strict optional props, Drizzle transaction types.    |
| `pnpm run test`                          | Passed | 12 files, 190 passed, 3 skipped, 100 todo.                                         |
| `pnpm run build:offline`                 | Passed | Built `dist/offline/index.html`, 452.28 kB raw, 121.23 kB gzip before CSP rewrite. |
| `node scripts/assert-offline-bundle.mjs` | Passed | No forbidden cloud/provider strings found in browser-AI artifact.                  |
| `node scripts/assert-bundle-size.mjs`    | Failed | 452,318 raw bytes vs 440,000 budget; 120,620 gzip bytes vs 120,000 budget.         |
| `pnpm run lint`                          | Failed | Root script includes `server`; ESLint config ignores `server/**`.                  |
| `pnpm audit --audit-level moderate`      | Failed | High advisory for `drizzle-orm <0.45.2`.                                           |

## Architecture Strengths

1. Good offline architecture separation:
   - Core business logic is centralized in `packages/core/src`.
   - Offline build profile aliases cloud providers out of the default artifact.
   - `scripts/assert-offline-bundle.mjs` verifies forbidden endpoints are absent.

2. Strong local-first security choices:
   - Browser data is encrypted with AES-256-GCM and PBKDF2-HMAC-SHA-256 at 600k iterations.
   - Large document/conversation stores are individually encrypted in IndexedDB.
   - CSP hashes are generated after build and a `.sha256` integrity file is emitted.

3. Server architecture points in the right direction:
   - OIDC, OPA, PostgreSQL RLS, OpenTelemetry, KMS, audit logs, and health probes are represented.
   - Kubernetes manifests use non-root user, read-only filesystem, dropped capabilities, and resource limits.

## Production Blockers

### PRD-01: Server is not a working workspace package

Severity: Critical

Evidence:

- `pnpm-workspace.yaml` includes only `packages/*` and `apps/*`; `server` is excluded.
- Root `tsconfig.json` includes `server/src/**/*.ts`.
- Root `package.json` runs `eslint packages apps config server`.
- Server package dependencies such as `hono` and `zod` are not resolved by root typecheck.

Impact:

- CI will fail typecheck.
- Docker build is likely broken.
- Server dependency graph is not reproducible from root install.

Recommended fix:

- Add `server` to `pnpm-workspace.yaml`.
- Add missing package manifests for actual workspace packages or remove invalid Docker copy assumptions.
- Use `pnpm --filter @tktaskapp/server run build`.
- Add `esbuild` and `ioredis` to the server dependency graph if they remain required.

### PRD-02: Dockerfile build target appears invalid

Severity: Critical

Evidence:

- Dockerfile runs `pnpm turbo run build:server`.
- `turbo.json` has no `build:server` task.
- `server/package.json` has a `build` script, not `build:server`.
- Dockerfile copies `packages/*/package.json`, but all current `packages/*` directories lack `package.json`.
- Dockerfile copies `/app/server/node_modules` into runtime, but server dependencies are not installed as a workspace package.

Impact:

- Container image likely cannot build.
- Production deployment through Docker/Kubernetes is blocked.

Recommended fix:

- Make server a workspace package and replace Docker build with `pnpm --filter @tktaskapp/server install/build` or a root Turbo task that actually exists.
- Avoid wildcard `COPY packages/*/package.json` until those package manifests exist.

### PRD-03: TypeScript strict mode is not green

Severity: Critical

Observed categories:

- Missing modules: `hono`, `zod`, `ioredis`.
- Implicit `any` callback parameters because Hono types are unresolved.
- `exactOptionalPropertyTypes` violations from passing `{ page: undefined }` etc.
- Drizzle transaction type mismatches across services.
- Count result access like `.value` on possibly undefined rows.

Recommended fix:

- Fix workspace dependency resolution first; it will remove many cascading errors.
- Construct filter objects without undefined properties.
- Standardize a Drizzle transaction type and avoid repeated unsafe casts.
- Add `noUncheckedIndexedAccess` safe handling for count rows.

### PRD-04: Lint script cannot run as configured

Severity: High

Evidence:

- `eslint.config.mjs` ignores `server/**`.
- Root script still runs `eslint packages apps config server`.
- ESLint 10 fails when a requested pattern is fully ignored.

Recommended fix:

- Either remove `server` from root lint or add a server-specific ESLint config/package script.
- Prefer `pnpm --filter` scripts once server is a workspace package.

### PRD-05: Bundle budget is failing

Severity: Medium

Evidence:

- Browser-AI build: 452,318 raw bytes, 120,620 gzip bytes.
- Budget: 440,000 raw bytes, 120,000 gzip bytes.

Recommended fix:

- Run the bundle analyzer documented in `scripts/assert-bundle-size.mjs`.
- Decide whether the new budget is intentional; if so, update the budget with a tracked approval.
- If not intentional, remove dead code, review schema/runtime imports, and keep cloud/provider aliases tight.

## Operations Readiness

| Capability        | Current state                                     | Production gap                                                                                           |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Health checks     | `/healthz` and `/readyz` exist                    | Readiness requires KMS; production env naming is inconsistent (`AZURE_KEY_VAULT_URL` vs `AZURE_KV_URL`). |
| Observability     | OTel server code and ADR exist                    | No proven deployment with dashboards, SLO alerting, SIEM export, or log redaction tests.                 |
| Container runtime | Distroless/nonroot intent                         | Docker build path likely invalid.                                                                        |
| Kubernetes        | SecurityContext, probes, resources, NetworkPolicy | Manifests contain placeholders and broad IdP egress CIDR.                                                |
| CI/CD             | Build, CI, CodeQL, security workflows             | Current gates fail; bundle size is nonblocking in CI but blocking in release.                            |
| Backups/restore   | Offline encrypted export/import exists            | No restore drill evidence or enterprise backup recovery objectives.                                      |

## Production Readiness Decision

Offline HTML: conditional pilot-ready after bundle/accessibility/documentation checks.

Enterprise server: not production-ready. Treat as an architectural scaffold until all critical blockers are closed and integration tests run against Postgres, OPA, Entra/OIDC, and KMS.
