# Risk Register

Assessment date: 2026-05-21

Scoring:

- Impact: 1 low to 5 critical
- Likelihood: 1 rare to 5 frequent
- Score: impact x likelihood

| ID    | Risk                                                                          | Domain           | Impact | Likelihood | Score | Priority | Evidence                                | Treatment                                                                                              |
| ----- | ----------------------------------------------------------------------------- | ---------------- | -----: | ---------: | ----: | -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| R-001 | Server excluded from pnpm workspace, causing broken dependency/build behavior | Engineering      |      5 |          5 |    25 | P0       | `pnpm-workspace.yaml`, typecheck output | Add `server` to workspace; fix package scripts and Docker build.                                       |
| R-002 | High Drizzle ORM advisory remains unresolved                                  | Security         |      5 |          4 |    20 | P0       | `pnpm audit` GHSA-gpj5-g38j-94v9        | Upgrade to `drizzle-orm >=0.45.2`; rerun audit/tests.                                                  |
| R-003 | Enterprise typecheck fails across server routes/services                      | Engineering      |      5 |          5 |    25 | P0       | `pnpm run typecheck`                    | Fix dependencies, optional props, Drizzle transaction types.                                           |
| R-004 | Docker image likely cannot build from current Dockerfile                      | DevOps           |      5 |          4 |    20 | P0       | `Dockerfile`, `turbo.json`              | Replace invalid `build:server` task and package-copy assumptions.                                      |
| R-005 | Unprovisioned Entra users may become viewers                                  | Security         |      5 |          3 |    15 | P0       | `server/src/auth/middleware.ts`         | Require active user row bound to tenant/org; deny unknown users.                                       |
| R-006 | Tenant/org RLS context mismatch across tables                                 | Security/Privacy |      5 |          3 |    15 | P0       | `withTenant`, old/new schema variables  | Standardize tenant context and add Postgres RLS integration tests.                                     |
| R-007 | Lint gate fails by configuration                                              | Engineering      |      3 |          5 |    15 | P1       | `eslint.config.mjs`, root script        | Split root/server lint configs or remove ignored glob.                                                 |
| R-008 | Offline browser-AI bundle exceeds size budget                                 | Performance      |      2 |          5 |    10 | P2       | `assert-bundle-size` output             | Analyze and reduce bundle or approve updated budget.                                                   |
| R-009 | Accessibility evidence is mostly incomplete for authenticated app             | Compliance       |      4 |          4 |    16 | P1       | 100 todo tests, CI disabled contrast    | Activate Playwright/axe tests and fix focus/contrast gaps.                                             |
| R-010 | AI governance policy exists but management-system evidence is incomplete      | Compliance/AI    |      4 |          4 |    16 | P1       | ISO 42001 evidence map                  | Add AI risk register, roles, incident response, model cards, audit cycle.                              |
| R-011 | Cloud AI path could transmit personal data without complete DPA/DPIA controls | Privacy/AI       |      5 |          2 |    10 | P1       | AI governance cloud profile notes       | Keep cloud disabled until DPA, consent, redaction, and tenant policy are complete.                     |
| R-012 | KMS erasure workflow is partial                                               | Privacy/GDPR     |      5 |          3 |    15 | P1       | `admin.ts`, `kms/*`                     | Implement full DSAR runbook, key destruction receipt, legal hold, user suspension, and audit evidence. |
| R-013 | CI has duplicate/overlapping workflows and nonblocking gates                  | DevOps           |      3 |          4 |    12 | P2       | `.github/workflows/*`                   | Consolidate CI and make release-critical gates blocking.                                               |
| R-014 | Docker Compose uses `latest` images and dev defaults                          | DevOps/Security  |      3 |          4 |    12 | P2       | `docker-compose.yml`                    | Pin images by version/digest; remove `changeme`; separate dev/prod compose.                            |
| R-015 | No SBOM/provenance/signing evidence for release artifact                      | Supply chain     |      4 |          3 |    12 | P2       | Release workflow                        | Add CycloneDX/SPDX SBOM, SLSA provenance, artifact signature.                                          |
| R-016 | OTel/SIEM observability is partly design-level                                | Operations       |      3 |          4 |    12 | P2       | ADR 0008                                | Prove dashboards, alerts, SIEM forwarding, and redaction tests.                                        |
| R-017 | Server readiness probe depends on KMS and env names are inconsistent          | Operations       |      3 |          3 |     9 | P3       | `health.ts`, KMS services               | Standardize env vars and define dependency readiness semantics.                                        |
| R-018 | Mobile/native profile lacks device security evidence                          | Mobile           |      4 |          3 |    12 | P2       | mobile adapter todo tests               | Complete Capacitor storage, biometrics, MITM, and release IPA/APK checks.                              |

## P0 Exit Criteria

All P0 items must be closed before enterprise production use:

1. `pnpm run typecheck` passes.
2. `pnpm run lint` passes.
3. `pnpm audit --audit-level moderate` passes.
4. Docker server image builds from a clean checkout.
5. Server auth denies unknown/unprovisioned users.
6. Tenant isolation integration tests pass against PostgreSQL RLS.

## Suggested 90-Day Roadmap

### Days 1-15

- Fix workspace/dependency/Docker/typecheck/lint failures.
- Upgrade Drizzle and rerun audit.
- Establish clean CI status.

### Days 16-45

- Harden auth and tenant isolation.
- Add Postgres, OPA, and server integration tests.
- Activate Playwright accessibility suite.
- Close bundle budget gap or approve a new budget.

### Days 46-90

- Complete GDPR/DSAR/KMS evidence.
- Add SBOM/provenance/signing.
- Build ISO 42001/NIST AI RMF evidence pack.
- Run a production readiness review with incident, restore, and accessibility drills.
