# Task App CRM — 2026 Production Readiness Remediation Task

**Created:** 2026-05-23  
**Owner:** Codex  
**Purpose:** Fix all production-readiness, security, compliance, and best-practice gaps identified in the Codex review performed on 2026-05-23.  
**Scope:** Offline web, enterprise server, AI gateway, authz/authn, CI gates, deployment manifests, and verification evidence.

---

## Operating Standard

Implement this task to 2026 production standards without shortcuts. Do not keep placeholder controls, dev-only fallbacks, or comments that claim compliance where the runtime behavior does not enforce it.

Use current primary references before changing each security-sensitive area:

- NIST SP 800-63-4 for digital identity and memorized-secret handling.
- OWASP ASVS 5.0 for application security verification.
- OWASP Cheat Sheet Series for password storage, cryptographic storage, key management, authentication, authorization, and XSS prevention.
- MDN and W3C Trusted Types / CSP documentation for DOM sink enforcement.
- RFC 9700 and RFC 7636 for OAuth 2.0 Security BCP and PKCE.
- OWASP Top 10 for LLM Applications 2025 for AI gateway and agent-tooling controls.
- WCAG 2.2 AA for accessibility.
- Kubernetes Pod Security Standards, Restricted profile, for deployment hardening.

If a current source conflicts with this document, follow the current source and document the decision in the final remediation report.

---

## Current Review Baseline

Known local verification from the review:

```powershell
pnpm run typecheck        # passed
pnpm run test             # passed: 189 passed, 3 skipped, 100 todo
pnpm run build:offline    # passed
pnpm run lint             # failed: apps/mobile/public/sw.js not in TS project
pnpm audit --prod         # failed: 4 high, 1 moderate vulnerabilities
```

The app is not production-ready until every gate in the final checklist passes and every finding below is fixed or explicitly removed from production scope.

---

## Non-Negotiable Rules

1. Fail closed for authentication, authorization, AI policy, and compliance controls.
2. Do not weaken encryption, CSP, Trusted Types, RLS, or audit controls to make tests pass.
3. Do not add cloud/server dependencies to `packages/core` or any offline bundle.
4. Do not edit `taskapp.html`; it is legacy reference only.
5. Preserve `security/trusted-types.ts` as the first side-effect import in bootstrap.
6. All user-controlled text rendered into HTML must be escaped or sanitized at the boundary.
7. Any high-risk action must have tests proving the negative case, not only the happy path.
8. If two fix attempts fail for the same issue, stop and write a concise blocker note before proceeding further.

---

## Phase 1 — Release Gate Integrity

### Goal

Make the repository's automated gates trustworthy. Production readiness is impossible while lint excludes security-critical code or audit is red.

### Work

1. Fix the root ESLint failure for `apps/mobile/public/sw.js`.
   - Either add an appropriate JS lint config override or exclude generated/static service worker files intentionally.
   - Do not hide TypeScript source files behind broad ignores.

2. Add a server lint gate.
   - Current root config ignores `server/**`.
   - Add a server-specific ESLint configuration or extend the root command to lint server TypeScript with its own `tsconfig`.
   - Security-sensitive folders must be linted: `server/src/auth`, `server/src/middleware`, `server/src/api`, `server/src/services`, `server/src/kms`, `server/src/ai-gateway`.

3. Fix production dependency vulnerabilities.
   - Upgrade `drizzle-orm` to a patched version `>=0.45.2`.
   - Upgrade OpenTelemetry packages to patched versions that remove the Prometheus malformed-request crash advisory.
   - Regenerate lockfile with `pnpm install` only after approval if network access is required.
   - Re-run `pnpm audit --prod` until it is clean.

4. Add CI-equivalent script coverage if missing.
   - Ensure root scripts or documented commands cover: typecheck, lint, tests, production audit, offline build, offline bundle assertions.

### Acceptance Criteria

- `pnpm run lint` passes.
- Server TypeScript is linted by an explicit command.
- `pnpm audit --prod` reports zero high or critical vulnerabilities.
- Root and server dependency versions are documented in the final report.

---

## Phase 2 — Authentication and Identity Hardening

### Goal

Make enterprise auth fail closed and align OIDC/PKCE behavior with RFC 9700 and RFC 7636.

### Findings to Fix

- `server/src/auth/middleware.ts` grants default `viewer` access when no active tenant user exists.
- Tenant lookup does not require both external user ID and tenant/org match.
- `OidcServiceImpl.buildAuthorizationUrl()` uses a broken synchronous PKCE helper.
- PKCE state is stored in memory, but Kubernetes is configured for multiple replicas.
- Refresh token rotation is delegated to Entra but no application-side replay/revocation state exists.

### Work

1. Fail closed for unknown users.
   - In `authMiddleware`, require an active `tenant_users` row.
   - Match on both `externalId` and the internal org/tenant mapping.
   - Return `403` for authenticated but unprovisioned users.
   - Do not fall back to `claims.externalId` as internal `userId`.

2. Introduce a tenant mapping boundary.
   - Do not use Entra `tid` directly as an internal `orgId` unless schema explicitly stores that mapping.
   - Add or use an organization mapping table if needed.
   - Ensure RLS context uses the internal org id expected by the database.

3. Remove or fix broken synchronous PKCE.
   - Make `buildAuthorizationUrl()` async, use `generatePkceAsync()`, and compute `BASE64URL(SHA256(ASCII(code_verifier)))`.
   - Add unit tests with RFC 7636 known-formula examples or deterministic test vectors.

4. Replace in-memory PKCE state.
   - Use Redis or a database-backed TTL store for PKCE state and code verifier.
   - State records must be single-use and expire after 10 minutes or less.
   - Add tests for expired state, reused state, and callback on a different process abstraction.

5. Add app-side refresh token replay tracking where feasible.
   - Store a hashed refresh-token identifier or session id.
   - Mark used/revoked tokens.
   - Logout must invalidate the server-side session record, not only clear the cookie.

6. Cookie hardening.
   - Production cookies must be `HttpOnly`, `Secure`, `SameSite=Strict`, path-scoped, and have explicit max age.
   - Add tests that production cookie flags are present.

### Acceptance Criteria

- Unknown active Entra user with no tenant record receives `403`, not viewer access.
- Suspended/deleted user receives `403`.
- PKCE challenge matches RFC 7636 S256.
- PKCE callback state is single-use and shared-store backed.
- Auth tests cover success, unknown user, suspended user, wrong tenant, expired state, reused state.

---

## Phase 3 — Authorization, RLS, and BOLA/IDOR Controls

### Goal

Make authorization resource-aware, prove cross-tenant denial, and ensure database RLS is enforced consistently.

### Findings to Fix

- `opaMiddleware()` evaluates only role/action/tenant, not resource tenant.
- Rego defines cross-tenant denial but does not connect it to `allow`.
- Some services and KMS paths query `db` directly instead of `withTenant()`.
- Tests currently focus mostly on offline in-memory behavior, not server BOLA/IDOR.

### Work

1. Redesign policy input.
   - Include `userId`, `role`, `tenantId`, action, resource type, resource id, resource tenant id, and route metadata.
   - Require route middleware to resolve resource ownership before allowing update/delete/read-by-id.

2. Fix Rego policy.
   - Cross-tenant deny must block `allow`.
   - Admin/owner permissions must still be tenant-scoped unless explicitly system-level.
   - Add OPA policy tests if OPA tooling is available; otherwise add TypeScript tests for equivalent policy behavior.

3. Align TypeScript fallback with Rego.
   - No fallback should be broader than the Rego policy.
   - Unknown actions remain denied.
   - Admin-only actions remain denied to editor/viewer.

4. Enforce tenant context everywhere.
   - Audit all `server/src/services`, `server/src/kms`, and `server/src/api/routes`.
   - Direct `db` calls that touch tenant data must use `withTenant()` or an equivalent explicit tenant context.
   - KMS lifecycle, legal holds, erasure workflow, audit queries, and sync documents need tenant-scoped access.

5. Add integration-style tests.
   - Cross-tenant read-by-id returns 404 or 403.
   - Cross-tenant update/delete cannot affect rows.
   - Viewer cannot create/update/delete.
   - Editor cannot delete or access admin endpoints.
   - Client-supplied `tenantId`, `orgId`, `role`, `createdAt`, `updatedAt` are ignored or rejected.

### Acceptance Criteria

- Authorization tests cover horizontal and vertical privilege escalation.
- RLS policies exist for every tenant-scoped table and are exercised in tests or migration verification.
- Every route has an explicit policy action.
- No server tenant data access bypasses tenant context without a documented exception.

---

## Phase 4 — Trusted Types, CSP, and DOM XSS Remediation

### Goal

Make Trusted Types an actual enforcement control instead of a compatibility shim.

### Findings to Fix

- `nexus-crm-raw` is a pass-through policy.
- The global `innerHTML`/`outerHTML` setter patch converts every string into TrustedHTML.
- `patchInnerHTML()` is a no-op marker.
- Lint allows broad template insertion in views and AI rendering files.

### Work

1. Remove the global raw setter patch.
   - Do not auto-convert every string assignment to TrustedHTML.
   - Keep a narrow helper for audited static templates only.

2. Replace `patchInnerHTML()` with explicit safe APIs.
   - Provide separate helpers for:
     - escaped text interpolation,
     - sanitized rich text,
     - audited static templates.
   - The helper names must make trust level obvious.

3. Audit all DOM sinks.
   - Review `innerHTML`, `insertAdjacentHTML`, contenteditable saves, AI chat rendering, documents preview, record modal incremental append, project canvas, workspace rendering.
   - Stored rich text must go through DOMPurify or equivalent strict allowlist.
   - Plain record fields must go through `escH()`.

4. Tighten lint.
   - Ban raw `innerHTML`, `outerHTML`, and `insertAdjacentHTML` except approved helper wrappers.
   - Ban use of the raw Trusted Types policy outside the render helper module.

5. Add tests.
   - Inject malicious payloads into client name, task title, document content, AI response text, file URL, and imported JSON.
   - Assert payloads render inertly and do not create executable attributes or scriptable URLs.

6. CSP review.
   - Keep `default-src 'none'`.
   - Avoid broad `style-src 'unsafe-inline'` only if feasible after UI refactor; if not feasible, document why and ensure script sinks are locked down.
   - Ensure `trusted-types` lists only required policy names.

### Acceptance Criteria

- Trusted Types still enabled in CSP.
- Raw string assignment to `innerHTML` fails in supported browsers unless routed through an approved helper.
- XSS regression tests pass for stored, reflected, imported, and AI-generated content.
- No pass-through Trusted Types policy is globally accessible.

---

## Phase 5 — Offline Auth and Cryptographic UX Hardening

### Goal

Preserve the strong offline vault model while improving memorized-secret and session behavior to 2026 expectations.

### Findings to Fix

- First-run master password minimum is 8 characters.
- No breach/common-password screening or strength feedback.
- Session key persistence deserves a stricter threat-model review.

### Work

1. Update master password policy.
   - Set minimum length according to current NIST SP 800-63-4 guidance.
   - Do not add arbitrary composition rules.
   - Permit Unicode without reducing entropy.
   - Add maximum length high enough to prevent DoS without blocking passphrases.

2. Add local blocklist screening.
   - Include a small bundled common-password denylist suitable for offline use.
   - Do not call a network breach API in offline builds.
   - Error messaging should be specific enough to help, not leak sensitive details.

3. Add strength feedback.
   - Prefer an offline estimator if already available or lightweight enough.
   - Do not add heavy dependencies to the offline bundle without bundle-budget review.

4. Review lockout behavior.
   - Current exponential delay caps at 30 seconds.
   - Align with offline usability and brute-force resistance without creating easy permanent lockout abuse.

5. Session key behavior.
   - Document why non-extractable CryptoKey in IndexedDB plus sessionStorage sentinel is acceptable for reload survival.
   - Add tests for close/reopen sentinel clearing and explicit logout clearing.

### Acceptance Criteria

- First-run weak/common passwords are rejected.
- Strong passphrases are accepted.
- Existing vault unlock remains backward compatible.
- Tests cover password creation, unlock, lockout delay, logout, and session reload behavior.

---

## Phase 6 — AI Gateway and Agent Safety

### Goal

Bring AI controls in line with OWASP LLM Top 10 2025, especially prompt injection, sensitive information disclosure, excessive agency, model allowlist, and unbounded consumption.

### Findings to Fix

- AI gateway uses static model allowlist.
- Redis is optional and silently falls back to in-memory rate/budget controls.
- PII screening is regex-only and allows scrubbed data through by default.
- Audit failure is fire-and-forget.
- Offline agent tools rely on prompt instruction plus human approval but need stronger policy boundaries.

### Work

1. Production mode must require durable controls.
   - In `NODE_ENV=production`, fail startup or deny AI calls if Redis/durable budget storage is not configured.
   - No in-memory rate or budget fallback in production.

2. Tenant model allowlist.
   - Replace or supplement static allowlist with tenant-scoped allowlist.
   - Strong/strict lockdown must deny all models unless explicitly allowlisted.
   - Validate provider and model separately.

3. Improve sensitive-data policy.
   - Define policy modes: block, redact, allow-with-approval.
   - Default production behavior should block or require approval for sensitive data to external/cloud models.
   - Log only metadata about detected categories, never raw PII.

4. Add prompt-injection and tool-safety tests.
   - User record attempts to override system prompt.
   - AI response attempts unauthorized destructive tool.
   - Tool call attempts unsupported fields or mass assignment.
   - Excessive action loops are bounded.

5. Strengthen audit semantics.
   - AI call approval/rejection should write durable audit events.
   - If audit storage is unavailable in production, fail closed for regulated actions.

6. Offline AI boundary.
   - Browser-ai profile must not include cloud or Ollama code.
   - Internal-ai profile must only connect to configured LAN/private origins.
   - Add bundle assertions for forbidden provider strings and network origins.

### Acceptance Criteria

- AI gateway denies calls when durable rate/budget storage is absent in production.
- Tenant allowlist behavior is tested.
- Sensitive-data handling mode is explicit and tested.
- Prompt injection cannot trigger write/destructive tools without validation and approval.
- Bundle assertions prove offline profile remains browser-only.

---

## Phase 7 — Audit, GDPR, and Compliance Evidence

### Goal

Make compliance evidence real, durable, and testable.

### Findings to Fix

- Server audit chain fields are nullable and not populated by `writeAuditEvent()`.
- Audit append-only behavior is partly comments/grants, not fully enforced in code tests.
- GDPR erasure tests are mostly mock/offline and need server workflow coverage.

### Work

1. Implement audit hash chain writer.
   - Compute `prevHash`, `signedDigest`, and tenant-local chain position.
   - Use a stable canonical JSON representation.
   - Make tampering detectable.
   - Plan a migration/backfill for existing nullable rows.

2. Enforce append-only audit behavior.
   - DB grants and triggers should prevent update/delete.
   - Add tests or migration checks proving update/delete fails for app role.

3. GDPR erasure workflow.
   - Ensure legal hold check is tenant-scoped.
   - Ensure erasure touches all relevant tenant-scoped tables.
   - Ensure KMS destruction schedule is auditable.
   - Ensure DSAR evidence contains no raw personal data.

4. Data retention.
   - Implement retention policy behavior or clearly mark it non-production if not done.
   - Archive rather than delete where compliance requires retention.

5. Evidence map.
   - Update compliance docs with exact code paths, tests, and command outputs.

### Acceptance Criteria

- New audit events include hash-chain fields.
- Tamper verification test detects modified/deleted/reordered audit event.
- Erasure workflow tests cover legal hold, scheduled destruction, audit receipt, and tenant isolation.
- Compliance docs link to tests and implementation files.

---

## Phase 8 — Deployment Hardening

### Goal

Make deployment manifests safe for production use, not just illustrative examples.

### Findings to Fix

- `docker-compose.yml` defaults Postgres password to `changeme`.
- Observability containers use `latest`.
- Kubernetes NetworkPolicy allows broad outbound HTTPS for IdP.
- Deployment lacks some operational production controls.

### Work

1. Docker Compose.
   - Remove insecure default password.
   - Require `.env.local` or fail fast.
   - Pin images by version, not `latest`.
   - Mark compose as dev-only if not intended for production.

2. Kubernetes manifests.
   - Keep Restricted-profile controls: non-root, dropped caps, no privilege escalation, read-only root FS, seccomp.
   - Add namespace Pod Security Admission labels if missing.
   - Replace placeholder CIDRs with documented environment-specific values or make manifest templated.
   - Avoid `0.0.0.0/0` egress in production examples unless paired with FQDN-aware policy documentation.

3. Runtime config validation.
   - Server should validate required env vars on startup in production.
   - Missing `DATABASE_URL`, `ENTRA_CLIENT_ID`, OIDC redirect URI, Redis for AI gateway, KMS config, and allowed origins should fail startup where applicable.

4. Observability.
   - Ensure no PII in logs.
   - Confirm health and readiness probes reflect actual dependencies.

### Acceptance Criteria

- No production manifest contains default credentials.
- No production manifest uses floating `latest` tags.
- Production startup fails on missing required security config.
- NetworkPolicy is either environment-specific or clearly templated with no unsafe default.

---

## Phase 9 — Accessibility and UX Verification

### Goal

Ensure security changes do not regress accessibility or core offline usability.

### Work

1. Run existing accessibility tests.
   - Keyboard navigation.
   - Modal focus trap.
   - Screen reader labels.

2. Add or update axe/WCAG 2.2 AA audit.
   - Run against built offline app.
   - Record violations as artifacts.
   - Decide whether any violation is release-blocking.

3. Verify auth UX.
   - Password creation feedback is accessible.
   - MFA step is keyboard and screen-reader usable.
   - Error messages are announced.

4. Verify core workflows after Trusted Types refactor.
   - Create/edit/delete client, project, task, person.
   - Document editor save/preview.
   - AI chat read-only and write-action approval flows.
   - Import/export vault.

### Acceptance Criteria

- Existing accessibility tests pass.
- Manual keyboard-only smoke test is documented.
- XSS fixes do not break document editing or normal record rendering.

---

## Final Verification Checklist

Run from `D:\techkeycrmapp`:

```powershell
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build:offline
node scripts/assert-bundle-size.mjs
node scripts/assert-offline-bundle.mjs
pnpm audit --prod
```

Also run server-specific gates:

```powershell
pnpm --dir server run typecheck
pnpm --dir server run test
pnpm --dir server run build
```

If Docker/Kubernetes changes are included, run or document:

```powershell
docker compose config
docker compose build server
```

For any command that cannot be run locally, record the reason and the exact environment needed.

---

## Final Deliverables

1. Code changes fixing all phases above.
2. Tests for every security-sensitive negative case.
3. Updated docs:
   - `AGENTS.md` if repo instructions change.
   - `TECHNICAL-REFERENCE.md` for architecture/security changes.
   - `Coremdfiles/SECURITY.md` or root `SECURITY.md` for operational controls.
   - Compliance evidence maps for GDPR, AI governance, and audit chain changes.
4. A final remediation report containing:
   - Summary of changes.
   - Before/after risk posture.
   - Command outputs.
   - Remaining risks, if any.
   - Any standards decisions made from current primary sources.

---

## Definition of Done

This task is complete only when:

- All P0 and P1 findings are fixed, not deferred.
- All automated gates pass.
- Production dependency audit has no high or critical vulnerabilities.
- Auth unknown/suspended users fail closed.
- Authorization is resource-aware and tenant-scoped.
- Trusted Types no longer relies on a global pass-through policy.
- Offline password creation meets current NIST-style expectations.
- AI gateway production mode requires durable controls.
- Deployment manifests contain no unsafe production defaults.
- The final report gives enough evidence for a security reviewer to reproduce the result.
