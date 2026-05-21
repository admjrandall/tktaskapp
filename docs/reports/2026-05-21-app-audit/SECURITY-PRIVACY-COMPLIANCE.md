# Security, Privacy, and Compliance Report

Assessment date: 2026-05-21

## Benchmarks

This assessment uses the following 2026-relevant baselines:

- OWASP Top 10:2025
- OWASP ASVS 5.0.0
- NIST CSF 2.0
- CSA Cloud Controls Matrix v4.1, released 2026-01-27
- SOC 2-style trust service evidence expectations
- GDPR privacy-by-design, erasure, and DSAR evidence expectations

## Security Summary

The offline application has above-average security controls for a local-first CRM. The enterprise server has strong design intent but is not yet security-reviewable as a production service because typecheck, dependency audit, and container build assumptions are red.

## Positive Controls

| Area                   | Evidence                                                             | Notes                                                                     |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Local encryption       | `packages/core/src/security/crypto.ts`                               | PBKDF2-HMAC-SHA-256, AES-256-GCM, non-extractable keys.                   |
| Vault storage          | `packages/core/src/security/vault.ts`                                | Encrypted vault in IndexedDB, password verification token, KDF migration. |
| XSS mitigation         | `sanitize.ts`, `trusted-types.ts`, CSP generation                    | DOMPurify allowlist, Trusted Types policies, generated script hashes.     |
| Offline egress control | Vite aliases and `assert-offline-bundle.mjs`                         | Built artifact has no cloud AI provider strings.                          |
| Tenant DB design       | `server/drizzle/0002_crm_entities.sql`                               | RLS enabled and forced for CRM tables.                                    |
| Authorization design   | `server/src/middleware/opa.ts`                                       | OPA REST/WASM fallback, deny on evaluation errors.                        |
| CORS                   | `server/src/middleware/cors.ts`                                      | Allowlist only, no wildcard support, credentials disabled.                |
| Audit                  | `packages/core/src/security/audit.ts`, `server/src/services/base.ts` | Client encrypted audit log and server audit events.                       |
| Supply chain workflows | GitHub Actions                                                       | CodeQL, dependency review, pnpm audit, gitleaks, Semgrep workflows exist. |

## Critical and High Risks

### SEC-01: High dependency advisory in Drizzle ORM

Severity: High

`pnpm audit --audit-level moderate` reports:

- Package: `drizzle-orm`
- Advisory: GHSA-gpj5-g38j-94v9
- Issue: SQL injection via improperly escaped SQL identifiers
- Vulnerable: `<0.45.2`
- Patched: `>=0.45.2`

Current manifests show root `drizzle-orm ^0.43.1` and server `^0.44`.

Remediation:

- Upgrade all Drizzle references to `>=0.45.2`.
- Regenerate lockfile.
- Rerun typecheck, tests, migrations, and audit.
- Review any use of dynamic identifiers or raw SQL.

### SEC-02: Enterprise auth allows unprovisioned users as viewers

Severity: High

In `server/src/auth/middleware.ts`, the user lookup matches only `externalId`, and if no user is found the middleware uses:

- `role = user?.role ?? 'viewer'`
- `userId = user?.id ?? claims.externalId`
- `tenantId = claims.tenantId`

Risk:

- An authenticated Entra user not provisioned in `tenant_users` can become a viewer.
- Lookup is not constrained by org/tenant.
- Internal tenant identity is not clearly mapped from Entra tenant ID to `tenant_users.org_id`.

Remediation:

- Require a matching active `tenant_users` row.
- Query by both `externalId` and mapped internal `orgId`.
- Return 403 for unprovisioned users.
- Add account status/suspension checks.
- Add integration tests for cross-tenant and unprovisioned-user denial.

### SEC-03: Server RLS context mismatch risk

Severity: High

`withTenant()` sets `app.tenant_id`, and CRM tables use `tenant_id`. Older tables such as `tenant_users`, `audit_events`, and `kms_key_lifecycle` use `org_id` and comments reference `app.org_id`. `writeAuditEvent()` writes outside `withTenant()`.

Risk:

- RLS behavior may differ across old and new schema groups.
- Audit/user/KMS tables may not receive the same tenant isolation guarantees.

Remediation:

- Standardize tenant session variables.
- Add database integration tests proving RLS denies cross-tenant reads/writes for every table.
- Ensure audit writes happen in a known tenant context or use explicit service-role design.

### SEC-04: Docker and CI gates are not trustworthy until local gates are green

Severity: High

Typecheck, lint, audit, and bundle-size gates fail locally. Security workflows exist but cannot provide assurance if base gates are red.

Remediation:

- Make all root gates green.
- Add a container build gate.
- Add migration/integration tests against ephemeral PostgreSQL.

## OWASP Top 10:2025 Mapping

| OWASP category                         | Current posture                                               | Gap                                                                                   |
| -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A01 Broken Access Control              | OPA and RLS are designed; offline app has no roles by design. | Server auth fallback and tenant mapping need hardening.                               |
| A02 Security Misconfiguration          | CSP, CORS, distroless intent, k8s security contexts exist.    | Docker/K8s placeholders, `latest` images, broad IdP egress, failing lint/typecheck.   |
| A03 Software Supply Chain Failures     | Renovate, dependency review, CodeQL, audit workflow exist.    | Active high advisory in Drizzle.                                                      |
| A04 Cryptographic Failures             | Strong local crypto; KMS design.                              | Enterprise KMS erasure flow is partial; key deletion env names inconsistent.          |
| A05 Injection                          | Zod validation and Drizzle ORM intended.                      | Drizzle advisory; raw SQL/session variables need DB integration tests.                |
| A06 Insecure Design                    | ADRs and threat models exist.                                 | Formal abuse-case review and server auth decisions need completion.                   |
| A07 Authentication Failures            | OIDC/JWKS validation present.                                 | PKCE sync helper has placeholder behavior; refresh rotation/revocation not persisted. |
| A08 Software/Data Integrity Failures   | CSP hashes and SHA256 artifact hash.                          | No signed releases/SBOM/provenance yet.                                               |
| A09 Logging/Alerting Failures          | OTel/audit designs.                                           | No proven SIEM export, alert thresholds, or redaction tests.                          |
| A10 Mishandling Exceptional Conditions | Server returns generic 500s.                                  | Some logs include raw error strings; need PII-safe logging rule.                      |

## Privacy and Compliance

### Offline profile

Strengths:

- No backend required.
- No telemetry/analytics/crash reporting observed in the default offline build.
- Encrypted browser storage and encrypted export support.
- User can delete local data.

Gaps:

- Need a concise user-facing privacy notice in the artifact.
- Need backup/restore recovery instructions and data-loss warnings.
- Need browser support and secure-device assumptions documented.
- Need retention/data classification matrix for CRM data types.

### Enterprise profile

Strengths:

- GDPR crypto-shredding design exists.
- Legal hold and KMS lifecycle services are started.
- Audit event model exists.

Gaps:

- Per-user KMS architecture is not proven end-to-end.
- DSAR erasure workflow in `admin.ts` schedules KMS destruction but does not clearly suspend user/login, delete or anonymize relational personal data, notify processors, or produce a signed destruction receipt.
- Data Processing Agreements, subprocessors, data residency, retention schedule, breach response, and RoPA are not present.

## Recommended Compliance Artifacts

Create these before enterprise customer use:

- Data inventory and data classification matrix
- Record of processing activities
- Retention and deletion schedule
- DSAR runbook and evidence template
- Security incident response plan
- Vendor/subprocessor list and DPA tracker
- Access review procedure
- Change management procedure
- Backup/restore drill evidence
- Threat model and abuse-case register
- SBOM and release provenance
