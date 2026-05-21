# Executive Report

Assessment date: 2026-05-21

## Overall Rating

Task App CRM is best described as a strong offline-first encrypted CRM prototype with serious security architecture work already present, plus an enterprise server path that is not production-ready yet.

The offline single-file build is the strongest release candidate. It builds successfully, regenerates CSP hashes, and passes the forbidden cloud endpoint assertion. The server-backed enterprise implementation is materially blocked by dependency/workspace, typecheck, lint, audit, and container-build issues.

Readiness scores:

| Domain              | Rating | Summary                                                                                                                                            |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline web product | 7/10   | Functional build with solid local encryption and CSP posture; bundle budget and accessibility evidence still need work.                            |
| Enterprise server   | 3/10   | Architecture exists, but typecheck fails, server is outside pnpm workspace, Docker build path appears invalid, and auth/KMS pieces need hardening. |
| Security            | 6/10   | Strong browser crypto/XSS controls; one high dependency advisory and several auth/tenant risks remain.                                             |
| Privacy/GDPR        | 5/10   | Offline privacy story is credible; enterprise erasure is partially implemented but not enough for production evidence.                             |
| AI governance       | 6/10   | Good human approval and prompt-injection design; formal ISO 42001 management evidence remains mostly partial or missing.                           |
| Accessibility       | 4/10   | Static/unit checks exist, but WCAG 2.2 AA cannot be claimed until browser E2E tests are active and color contrast/focus traps are verified.        |
| DevOps/release      | 4/10   | CI/security workflows exist, but current local gates fail and the release bundle-size gate is red.                                                 |

## Board-Level Findings

1. The enterprise server cannot be considered production-ready while `pnpm run typecheck`, `pnpm run lint`, and `pnpm audit` fail.

2. The root workspace excludes `server`, while root scripts and Docker assume it is part of the monorepo. Evidence: `pnpm-workspace.yaml` only includes `packages/*` and `apps/*`; root `typecheck` includes `server/src/**/*.ts`; Docker runs `pnpm turbo run build:server`, but no such task exists.

3. A high-severity npm advisory affects `drizzle-orm <0.45.2` via GHSA-gpj5-g38j-94v9. The root currently pins `drizzle-orm ^0.43.1`; server declares `^0.44`. Upgrade to `>=0.45.2` and rerun tests.

4. Offline data protection is a strong asset: PBKDF2-HMAC-SHA-256 at 600,000 iterations, AES-256-GCM, non-extractable WebCrypto keys, encrypted IndexedDB, Trusted Types, DOMPurify, and CSP hash generation are all present.

5. The current enterprise authentication middleware defaults unknown users to `viewer` and does not bind the user lookup to tenant/org. This is a meaningful BOLA/tenant isolation risk for server deployments.

6. AI governance is unusually thoughtful for this stage: mutating AI actions require human approval, tool arguments are schema-validated, and CRM data is treated as adversarial context. The weak spot is evidence: model evaluation, incident response, nonconformity handling, and management sign-off are not complete.

7. Accessibility maturity is not yet enough for legal/commercial claims. The repo has many `it.todo` accessibility tests and CI disables color contrast checks on the pre-auth axe scan.

## Go/No-Go

| Release target                    | Decision       | Conditions                                                                                                                         |
| --------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Offline single-user HTML artifact | Conditional go | Fix or explicitly waive bundle budget; run browser accessibility smoke tests; document browser support and backup recovery limits. |
| PWA sync                          | No-go          | Sync adapter and deployment evidence are not production complete.                                                                  |
| Mobile                            | No-go          | Capacitor/native storage/security tests are mostly stubbed or hardware-dependent.                                                  |
| Enterprise server/API             | No-go          | Must fix workspace/dependency/build/typecheck/lint/audit/auth issues first.                                                        |
| AI cloud/enterprise profile       | No-go          | Needs DPIA/DPA, AI incident process, model monitoring, prompt-injection active tests, and tenant controls.                         |

## 30-Day Priorities

1. Fix monorepo/server integration: add `server` to `pnpm-workspace.yaml`, add real package manifests for packages/apps or adjust Docker copy, define server build scripts, install `esbuild` and `ioredis` where used.
2. Upgrade `drizzle-orm` to `>=0.45.2` and rerun `pnpm audit`.
3. Make `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build:offline`, bundle assertions, and audit green locally and in CI.
4. Harden enterprise auth: no implicit viewer for unprovisioned users, tenant/org lookup binding, account status checks, and role claim reconciliation.
5. Activate Playwright accessibility tests and remove/justify disabled color contrast coverage.
6. Create formal compliance evidence: risk register, incident response, AI model cards, data inventory, retention schedule, and audit evidence map.
