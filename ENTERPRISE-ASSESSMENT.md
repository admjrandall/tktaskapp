# Task App CRM — Enterprise Build Assessment

> **Assessment type:** Static architecture, code, documentation, and standards-alignment review.
> Not a penetration test, certification audit, source-code exhaustive review, or legal opinion.
>
> **Assessment rule:** No unsupported certification claims. Each finding is marked
> _implemented_, _partial_, _not implemented_, or _not applicable_ based on observed branch
> evidence and current public standards.

| Field               | Value                                        |
| ------------------- | -------------------------------------------- |
| Assessment date     | 2026-05-19                                   |
| Version             | v3                                           |
| Repository / branch | `claude/generate-offline-profile-html-CRKHK` |

---

## Executive Verdict

> **No-BS verdict:** The current branch is not enterprise-production-ready and is not ready for
> SOC 2, ISO/IEC 27001 certification scope, FedRAMP, CSA STAR Level 2, or a serious zero-trust
> enterprise claim. The core is a strong offline encrypted local app. The enterprise profile is
> still architectural groundwork: sync adapters are stubs, backend services are not implemented,
> identity federation is absent, tenant isolation is absent, centralized audit is absent, GDPR
> crypto-shredding architecture is absent, and operational evidence does not exist. The correct
> path is to preserve the offline core but build a **separate enterprise service architecture**
> around it.

| Dimension                    | Current state                                                                                        | Production target                                                                                       | Readiness   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| Enterprise architecture      | Local-first monorepo with `NullAdapter` and TODO sync adapters.                                      | Backend API, identity, tenants, authorization, database, object storage, audit pipeline, observability. | Low         |
| Certification posture        | Good technical controls for local app; no organization-level control evidence.                       | SOC 2 Type I/II, ISO/IEC 27001 ISMS, ASVS evidence, WCAG evidence, privacy evidence.                    | Low         |
| Zero Trust                   | Local password/MFA and restrictive offline policy; no enterprise policy decision/enforcement points. | Continuous identity, device, data, workload, and session policy enforcement.                            | Low         |
| Security engineering         | Strong crypto, CSP, audit, sanitization; Trusted Types raw policy weakens XSS defense.               | Formal ASVS tests, threat model, SDLC, SAST/SCA/DAST, pen test, control evidence.                       | Medium-Low  |
| Enterprise audit             | Encrypted local audit log controlled by the user/device.                                             | Centralized, append-only, tamper-resistant audit pipeline with SIEM export.                             | Low         |
| GDPR compliance architecture | Single vault blob per user; no per-user key architecture; no crypto-shredding capability.            | Per-user/per-tenant encryption keys; key-destruction-as-erasure; backup propagation of erasure.         | Not started |

---

## Currently Implemented Capabilities Valuable for Enterprise Reuse

| Capability                | Observed evidence                                                                                                 | Enterprise reuse value                                                                                                         | Caveat                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline encryption model  | PBKDF2-HMAC-SHA-256 at 600,000 iterations, AES-GCM, 32-byte salt, 12-byte IV, non-extractable `CryptoKey`.        | Can be reused for encrypted exports, mobile/offline cache, client-side local vaults, and customer-controlled backup artifacts. | Do not make the offline master-password vault the enterprise system of record — it complicates search, recovery, legal hold, AI governance, and admin workflows. |
| Vault import/export       | `vault.ts` implements encrypted backup export/import, password change, KDF migration, and JSON import validation. | Good foundation for data portability and offline export controls.                                                              | Enterprise export must add approval workflow, policy enforcement, DLP, audit trail, retention, and rate limits.                                                  |
| CSP and browser hardening | `apps/offline/index.html` uses strict CSP template, Trusted Types, no-referrer, restrictive `Permissions-Policy`. | Good starting point for hosted CSP/security headers.                                                                           | Hosted enterprise must move security headers to server/CDN (not `<meta>` tags) and remove unnecessary allowances per profile.                                    |
| Sanitization              | `sanitize.ts` uses DOMPurify allowlists for rich text and link schemes.                                           | Strong start for stored XSS mitigation.                                                                                        | Must add automated XSS tests across all input/render sinks.                                                                                                      |
| Audit events              | `audit.ts` covers auth, MFA, passkeys, vault, backup, import/export, app reset, AI key, and AI query events.      | Useful event taxonomy for future central audit pipeline.                                                                       | Local user-controlled audit is not tamper-resistant enough for enterprise assurance.                                                                             |
| Adapter abstraction       | `adapter-interface.ts` defines pull/push/stream/clear.                                                            | Useful seam for enterprise sync/backends.                                                                                      | Current RxDB/Dataverse adapters are TODO stubs; no conflict handling, auth, or tenant controls exist.                                                            |

---

## Certification and Framework Applicability

| Certification / framework                  | Applies to enterprise build?                                                    | Current branch status                                                                                                                                                           | What must exist before claiming readiness                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SOC 2 Type I / Type II**                 | Yes, if delivered as hosted SaaS, managed service, or enterprise cloud service. | **Not ready.** No service organization control environment, backend, monitoring, access reviews, incident process, or vendor evidence.                                          | Define system boundary; implement security/availability/confidentiality controls; collect 3–6+ months of operating evidence for Type II; auditor readiness review. |
| **ISO/IEC 27001:2022**                     | Yes, organization-level certification; not just app code.                       | **Not ready.** Code has controls, but no ISMS evidence: risk register, scope, SoA, internal audit, management review, asset inventory, supplier management, corrective actions. | Build ISMS, define scope, risk treatment plan, Statement of Applicability, policies, internal audit, management review, certification audit.                       |
| **ISO/IEC 27701:2025**                     | Yes if processing customer PII at scale or positioning as privacy-ready.        | **Not ready.** No PIMS, processor/controller roles, DSAR workflow, retention/deletion verification, or subprocessor governance.                                                 | Create PII inventory, lawful basis/roles, retention/deletion controls, DPA/subprocessor list, privacy risk assessments, DSAR process.                              |
| **ISO/IEC 42001:2023**                     | Yes if AI is a material product function.                                       | **Not ready.** AI runtime and cloud/local AI options exist; no AI management system, risk classification, model inventory, impact assessment, or AI supplier governance.        | Create AI governance policy, model inventory, prompt/data boundary rules, AI audit trail, human approval rules, AI evaluation and monitoring.                      |
| **OWASP ASVS 5.0 Level 2**                 | Yes; should be the main technical web-app acceptance baseline.                  | **Partial.** Strong crypto, CSP, sanitization, MFA, session handling. Missing server-side authorization/API controls because no enterprise backend exists.                      | Create ASVS requirement-by-requirement matrix; implement tests; run independent verification; document exceptions.                                                 |
| **NIST SP 800-207 Zero Trust**             | Yes as architecture guidance, not a certificate.                                | **Not zero-trust enterprise.** No IdP, PDP/PEP, device posture, dynamic authorization, microsegmentation, resource-scoped policy, or continuous evaluation.                     | Build identity/device/data/workload policy enforcement; server-side authorization; session risk signals; audit and telemetry feedback loops.                       |
| **NIST SP 800-63B-4**                      | Yes for authentication design.                                                  | **Partial.** Password/TOTP/passkey ideas exist. Enterprise IdP federation and authenticator lifecycle do not.                                                                   | Integrate OIDC/SAML with enterprise MFA, session management, credential recovery, authenticator binding/removal, step-up auth, and reauthentication rules.         |
| **NIST SP 800-218 SSDF**                   | Yes for secure software development process.                                    | **Not evidenced.** Typecheck script exists, but no proof of SAST/SCA/secret scanning, code review, release signing, vulnerability disclosure, or change approvals.              | Implement CI security gates, SBOM, dependency review, signed releases, vulnerability management, and secure design reviews.                                        |
| **NIST SP 800-53 / FedRAMP Moderate/High** | Only if selling cloud service to US federal agencies.                           | **Not ready.** No cloud boundary, SSP, POA&M, continuous monitoring, 3PAO evidence, cloud service architecture, or inherited controls.                                          | Design federal cloud boundary, FedRAMP authorization strategy, control implementation statements, automated evidence, SSP, POA&M, incident/IR integrations.        |
| **FedRAMP 20x**                            | Only for cloud service pursuing federal authorization path.                     | **Not ready.** No cloud-native evidence automation, inventory, vulnerability, IAM, logging, encryption, network, or KSI pipeline.                                               | Build automated evidence collection and KSI-aligned controls early if federal is a target market.                                                                  |
| **CSA CCM / STAR**                         | Yes if enterprise cloud or SaaS.                                                | **Not ready.** No cloud shared-responsibility model or CCM domain evidence.                                                                                                     | Map CCM domains to architecture; complete CAIQ; implement STAR Level 1 self-assessment, then Level 2 if needed.                                                    |
| **WCAG 2.2 AA / VPAT**                     | Yes for enterprise and public-sector procurement.                               | **Unknown.** No accessibility audit evidence found.                                                                                                                             | Keyboard/screen-reader audit, color contrast, focus management, ARIA labels, form labels, VPAT, regression tests.                                                  |
| **PCI DSS v4.0.1**                         | Only if storing, processing, or transmitting payment card data.                 | **Not applicable** based on current scope.                                                                                                                                      | Keep cardholder data out of scope. If payments are added, isolate via PCI-compliant provider/tokenization.                                                         |
| **HIPAA / HITRUST**                        | Only if PHI is stored or processed for covered entities/business associates.    | **Not applicable** based on current scope.                                                                                                                                      | Avoid PHI unless deliberately building healthcare compliance controls.                                                                                             |
| **FIPS 140-3**                             | Only if required by federal/regulated customers for validated crypto modules.   | **Cannot claim.** WebCrypto using AES/PBKDF2 is not automatically FIPS-validated.                                                                                               | Use validated cryptographic modules/platforms and document module certificate/boundary; do not claim FIPS without validation evidence.                             |

---

## Zero Trust Assessment

| Zero Trust pillar              | Observed state                                                          | Gap                                                                                                                                                            | Implementation direction                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity**                   | Local master password, TOTP, passkey PRF logic exist.                   | No enterprise IdP, federation, lifecycle management, privileged access management, SCIM provisioning, or conditional access.                                   | Use IdP federation (OIDC with PKCE mandatory; SAML if buyer requires), SCIM for provisioning/deprovisioning, MFA enforcement, group/role claims, privileged admin workflow, reauth policies, session risk evaluation. |
| **Device**                     | No enterprise device posture controls observed.                         | No managed-device checks, MDM compliance attestation, jailbreak/root detection for mobile, or browser/device trust signals.                                    | Integrate MDM/Intune/Jamf/Android Enterprise signals, device compliance claims in access token, session risk scoring, managed app configuration.                                                                      |
| **Network / environment**      | Offline CSP restricts network. Enterprise architecture not implemented. | No API gateway, WAF, network segmentation, tenant boundary enforcement, DDoS protection, or private connectivity model.                                        | API gateway (rate limiting, auth enforcement, CORS), WAF at edge, private service endpoints, tenant-scoped network paths, zero-trust network access for admin/support.                                                |
| **Application / workload**     | Client-side controls and adapter seam exist.                            | No server-side Policy Enforcement Point (PEP) enforcing object-level authorization.                                                                            | Authorization middleware on every API route + object-level authorization in every service, backed by a centralized policy engine (OPA or Cedar). Deny by default.                                                     |
| **Data**                       | Local encryption strong; enterprise data model absent.                  | No tenant isolation, data classification, retention, legal hold, DLP, per-user key architecture, server-side KMS, GDPR crypto-shredding, or export governance. | Per-user/per-tenant encryption key architecture in KMS; data classification tagging; DB row-level security for tenant isolation; retention/legal hold automation; crypto-shredding for GDPR erasure.                  |
| **Visibility / analytics**     | Local encrypted audit log exists.                                       | No central telemetry, SIEM, anomaly detection, admin audit, support-access audit, or immutable distributed logs.                                               | Central append-only audit event store; OpenTelemetry (traces, metrics, logs) from day one; SIEM export (Splunk/Sentinel/Datadog); dashboards; alerting on SLO breaches and anomalies.                                 |
| **Automation / orchestration** | No CI/CD control evidence beyond build/typecheck scripts.               | No policy-as-code, control evidence automation, vulnerability gating, or incident automation.                                                                  | CI/CD with SAST/SCA/secret scan/SBOM/license scan; IaC scanning; automated evidence capture; incident runbooks; SLSA Level 2+ build provenance.                                                                       |

---

## Detailed Enterprise Findings

### E-01 · Critical · No enterprise backend or system of record

**Evidence/Reason:** The current sync build still uses `NullAdapter`; RxDB and Dataverse adapters are TODO stubs. There is no API, database, tenant model, server-side authorization, or central audit.

**Implementation instruction:** Design the backend boundary before writing any code: API gateway or BFF (Backend for Frontend), auth middleware, domain services, database schema with tenant isolation, object storage, audit ingestion service, notification service. Create an OpenAPI specification and a data flow diagram. Write a threat model for the enterprise deployment before implementation begins. Every client/project/task/document/file operation must go through the authenticated API — the browser must not write enterprise data directly to IndexedDB as the system of record.

**Acceptance criteria:** Every enterprise data-mutation operation goes through an authenticated, tenant-scoped API endpoint with server-side authorization enforcement and a corresponding audit event. No enterprise business logic lives only in the browser.

---

### E-02 · Critical · No SSO/OIDC/SAML/SCIM — and PKCE is mandatory _(enhanced)_

**Evidence/Reason:** The local password model is appropriate for offline vaulting but is not enterprise identity lifecycle management. Without federated identity, enterprise buyers cannot enforce their own MFA policies, provision/deprovision users automatically, or satisfy their own compliance requirements.

**Implementation instruction:**

**OIDC (implement first):**

- Use **OIDC with PKCE (Proof Key for Code Exchange) exclusively**. The implicit flow and hybrid flow are prohibited — they are deprecated by RFC 9700 (OAuth 2.0 Security Best Current Practice) and cannot be used in 2026 enterprise implementations.
- Validate: issuer, audience, `iat`/`exp`, `nonce`, `at_hash`. Use JWKS endpoint for key validation. Never trust an unvalidated JWT.
- Implement short-lived access tokens (15 minutes max) with refresh token rotation. Refresh tokens must be one-time-use (rotation invalidates the previous token).
- Implement server-side token revocation list (Redis or database-backed). Logout must invalidate the server-side session, not only clear browser state.

**DPoP (Demonstrating Proof-of-Possession — add for high-assurance enterprise):**

- For enterprise customers with high-assurance requirements, implement **DPoP (RFC 9449)** tokens. DPoP binds access tokens to a client-side key pair, making stolen bearer tokens useless without the private key. This provides protection against token theft even if the TLS channel is compromised at an intermediary.
- DPoP is increasingly required by financial services and regulated industries; design the token handling layer to support it from the start.

**SAML (add if buyer requires):**

- Implement SAML 2.0 SP-initiated SSO only if enterprise buyers explicitly require it (legacy IdP compatibility). SAML is more complex, brittle, and XML-injection-prone than OIDC; prefer OIDC where possible.

**SCIM 2.0 (required for broad enterprise rollout):**

- Implement SCIM 2.0 for automated user provisioning and deprovisioning. Map IdP groups to application roles. Deprovisioning must revoke all active sessions within a defined SLA (recommended: within 1 minute of SCIM `DELETE` or group removal).

**Step-up authentication:**

- Require re-authentication (fresh IdP session, not just a valid JWT) for high-risk operations: data export, admin setting changes, AI provider key changes, destructive operations, and legal hold placement.

**Acceptance criteria:** Disabling a user at the IdP removes all access within defined SLA. PKCE is enforced on all OIDC flows with no implicit flow path. Login events are centrally audited. Step-up auth triggers for defined high-risk operations. DPoP design is documented as a roadmap item with implementation timeline.

---

### E-03 · Critical · No server-side RBAC/ABAC — policy-as-code required _(enhanced)_

**Evidence/Reason:** Enterprise cannot trust browser-side UI hiding or local vault role assumptions. Authorization must be enforced server-side on every object and action. Hardcoding role checks into individual API route handlers is a common pattern that breaks down at enterprise scale — it creates inconsistencies, makes auditing impossible, and becomes unmanageable as the permission model grows.

**Implementation instruction:**

**Define the resource and action model first:**

| Resource      | Actions                                                            |
| ------------- | ------------------------------------------------------------------ |
| Organization  | `read`, `update`, `delete`, `manage-members`, `manage-billing`     |
| Workspace     | `create`, `read`, `update`, `delete`, `manage-members`             |
| Client        | `create`, `read`, `update`, `soft-delete`, `hard-delete`, `export` |
| Project       | `create`, `read`, `update`, `soft-delete`, `hard-delete`           |
| Task          | `create`, `read`, `update`, `assign`, `soft-delete`, `hard-delete` |
| Document      | `create`, `read`, `update`, `delete`, `export`                     |
| File          | `upload`, `read`, `delete`, `download`, `export`                   |
| Audit log     | `read`, `export`                                                   |
| AI config     | `read`, `update`, `enable`, `disable`                              |
| Admin console | `access`, `manage-roles`, `manage-sso`, `manage-scim`              |

**Use a centralized policy engine, not per-route role checks:**

- Evaluate all authorization decisions through a centralized **Policy Decision Point (PDP)**.
- **OPA (Open Policy Agent):** General-purpose, Rego-based, widely adopted, excellent for complex ABAC policies with contextual attributes. Embeds as a library or runs as a sidecar.
- **AWS Cedar:** Formally verified, strongly typed, purpose-built for application authorization. Mathematically proven to be sound and terminating — no authorization policy can accidentally grant more access than intended.
- Both are appropriate; choose based on team familiarity and deployment environment. Document the choice as an Architecture Decision Record.

**Implement deny-by-default with explicit grants:**

- API middleware enforces: authentication present → tenant membership validated → action permitted on resource.
- Object-level authorization in every service function: the service verifies the actor has permission on the specific resource being accessed, not just the resource type.
- Test every endpoint for BOLA (Broken Object Level Authorization) / IDOR (Insecure Direct Object Reference): authenticated user in tenant A must not be able to access resources belonging to tenant B or user B even by guessing IDs.

**Acceptance criteria:** All authorization decisions flow through the centralized policy engine. Automated BOLA/IDOR tests pass (return 403/404, not 200) for every endpoint. Policy-as-code is stored in version control with change review. Authorization decisions are logged with actor, resource, action, and result.

---

### E-04 · Critical · No tenant isolation

**Evidence/Reason:** No tenant-scoped backend exists. Without tenant isolation, a multi-tenant application will inevitably leak data between customers at the data layer.

**Implementation instruction:** Add `tenant_id` (or `org_id`) to every server-side table, object storage path, search index, audit record, file path, and event. Resolve the active tenant from the authenticated session server-side — never accept `tenant_id` from the browser request body or query parameter as authoritative. Apply database row-level security (RLS) constraints where the database supports it (PostgreSQL, Azure SQL) to provide a database-layer enforcement backstop. Test cross-tenant access for every endpoint and search query. Include tenant isolation in the threat model as a top-tier concern.

**Acceptance criteria:** Automated cross-tenant isolation tests prove tenant A cannot read, search, export, or receive notifications about tenant B data through any endpoint or search operation. Tenant is resolved from the server-side session, not the client request.

---

### E-05 · High · Audit log is local and user-controlled

**Evidence/Reason:** `audit.ts` provides a strong local event taxonomy, but enterprise audit must be append-only, centrally controlled, and inaccessible to ordinary users and tenant admins.

**Implementation instruction:** Create a dedicated audit ingestion service that receives events from all application services. Events must include: `actor_id`, `actor_type` (user/service/support), `tenant_id`, `resource_type`, `resource_id`, `action`, `result` (success/failure), `ip_address`, `device_fingerprint`, `session_id`, `request_id`, `timestamp` (server-side, not client), `before_state` and `after_state` where relevant. Store audit events in WORM-capable storage (write-once, read-many) or an append-only log system. Export to SIEM (Splunk, Microsoft Sentinel, Datadog, or similar). Ordinary users must not be able to purge, modify, or selectively view audit events for other users. Customer admins may view their tenant's audit events (read-only). Reuse the event taxonomy from `audit.ts` as the basis for the server-side schema.

**Acceptance criteria:** Audit events are immutable and centrally stored. Users cannot purge security-relevant audit events. Admin and support access to customer data is logged and visible to the customer's security admin. SIEM export is documented and tested.

---

### E-06 · High · No centralized monitoring, observability, or SLOs — OpenTelemetry required _(enhanced)_

**Evidence/Reason:** SOC 2 Availability and Security trust service criteria require operational monitoring evidence. No telemetry, alerting, or SLO definition was observed.

**Implementation instruction:** Implement **OpenTelemetry (OTel)** as the observability standard from day one. OpenTelemetry is the CNCF-graduated industry standard for distributed observability in 2026; every major observability vendor (Datadog, Grafana, Honeycomb, Dynatrace, New Relic, Splunk) accepts OTel natively, which avoids vendor lock-in and allows backend switching without re-instrumenting code.

**Three OTel signals to implement:**

**Traces:** Every API request creates a root span with `tenant_id`, `user_id`, `request_id`. Child spans for database queries, external calls, authorization checks, and AI calls. Trace IDs must appear in every structured log line for correlation.

**Metrics (RED model per service):**

- Rate: requests per second by endpoint and tenant
- Errors: error rate by endpoint, HTTP status code, and error type
- Duration: P50/P95/P99 latency per endpoint

Define SLOs: e.g., P99 API latency < 500 ms; error rate < 0.1%; uptime > 99.9%. Alert on SLO burn rate, not just threshold crossings.

**Logs:** Structured JSON with mandatory fields: `timestamp` (RFC 3339), `level`, `service`, `trace_id`, `span_id`, `tenant_id`, `user_id`, `request_id`, `message`. No `console.log`. Log at appropriate levels — do not log PII or secret values in any log level.

**Additional observability requirements:**

- Uptime/health checks on all services with automated alerting
- Anomaly detection on: auth failure rate, export volume spikes, admin action frequency, unusual tenant access patterns
- On-call rotation with incident management process (PagerDuty, Opsgenie, or equivalent)
- Incident postmortem process with RCA and corrective action tracking
- Status page for enterprise customers

**Acceptance criteria:** All services emit OTel traces, metrics, and structured logs. SLOs are defined and dashboards exist. Alerts fire for auth anomalies, export spikes, and SLO breaches. Incident evidence (alerts, RCA documents) is retained for SOC 2 evidence.

---

### E-07 · High · Trusted Types raw policy weakens XSS defense

**Evidence/Reason:** `trusted-types.ts` monkey-patches `innerHTML`/`outerHTML` to trust all strings through `nexus-crm-raw`. This negates the security value of Trusted Types for any string assigned to those sinks. Enterprise deployment cannot ship this design.

**Implementation instruction:** Replace the global raw auto-trust with explicit `safeHtml()` / `text()` render helpers. Use `textContent` for all user-supplied strings. Use `DOMPurify` → Trusted Types pipeline only for rich text that genuinely requires HTML. Enforce via a lint rule that blocks raw `innerHTML` assignments in new files. This is a prerequisite for any enterprise pilot — the raw policy is a class-level XSS risk that would be flagged immediately in any security review or penetration test.

**Acceptance criteria:** CI tests confirm unsafe strings throw or are escaped at every documented sink. No global raw policy. ASVS injection/sanitization controls pass automated tests.

---

### E-08 · High · No enterprise secrets management

**Evidence/Reason:** Cloud API keys are encrypted locally for the offline offline build; enterprise needs centralized secrets management with key rotation, access policy, and audit.

**Implementation instruction:** Store all server-side secrets (database credentials, API keys, signing keys, encryption keys) in a dedicated secrets management system: **HashiCorp Vault**, **Azure Key Vault**, **AWS Secrets Manager**, or equivalent. Requirements:

- Secrets are never stored in environment variables in CI logs, source code, or `docker-compose.yml` files.
- Secret access requires authenticated service identity (Kubernetes service account, cloud workload identity, OIDC identity).
- Automatic rotation for secrets that support it; manual rotation workflow with SLA for those that do not.
- Every secret access is audited (who accessed what secret, when, from which service instance).
- Tenant AI provider keys must be encrypted at rest using a KMS-managed key, isolated per tenant, and accessible only through an authorized AI gateway — never directly by the browser.

**Acceptance criteria:** No provider API key is stored in browser localStorage or the shipped artifact. All server-side secrets are managed in the secrets vault. Secret access audit log exists.

---

### E-09 · High · AI governance incomplete

**Evidence/Reason:** AI runtime supports browser, Ollama, and cloud provider calls. Enterprise deployment requires a formal AI governance layer covering policy, logging, data boundary, and risk management.

**Implementation instruction:** Build an AI gateway service as a first-class enterprise component:

- **Tenant policy engine:** Tenant admins control which AI providers and models are allowed. Admins can disable all cloud AI for their tenant. A visible data disclosure is presented and must be accepted before enabling any cloud AI provider.
- **Provider/model allowlist:** Define the approved provider list centrally. New providers require a security and DPA review before adding.
- **Data minimization:** AI prompts must be constructed with the minimum data required. Sensitive PII fields (SSN, financial data, health data if applicable) must be excluded from AI context by policy, not by developer discipline.
- **Prompt injection testing:** Automated tests for prompt injection in every context that passes user-controlled data to the AI (task names, document content, client notes, file names). AI output that contains executable content must be treated as untrusted.
- **Human approval for write actions:** AI tool calls that modify application state (create, update, delete) require explicit user confirmation at the UI layer before being applied. The confirmation step cannot be bypassed by prompt injection.
- **AI audit log:** Every AI call logs: tenant, user, model/provider, prompt hash (not content for privacy), response hash, tool calls attempted, tool calls approved, cost tokens, timestamp. Stored in the central audit system.
- **Subprocessor governance:** Each cloud AI provider is a subprocessor under GDPR. Maintain a subprocessor list, execute DPAs, and notify customers of subprocessor additions with the contractually required notice period.
- **ISO 42001:2023 alignment:** Establish an AI management system covering model inventory, risk classification, impact assessment, and monitoring. This is increasingly required by enterprise procurement.

**Acceptance criteria:** Tenant admin can disable cloud AI and verify no data leaves the boundary via audit log. All AI use is policy-bound and audited. DPAs executed with all cloud AI subprocessors. Human approval required for all AI-initiated write operations.

---

### E-10 · High · No secure file service

**Evidence/Reason:** Files are currently local records/attachments. Enterprise file handling requires server-side security controls.

**Implementation instruction:** Implement a dedicated file service with: object storage backend (Azure Blob, AWS S3, or equivalent) with tenant-scoped paths and server-managed encryption keys; malware scanning on every upload (ClamAV, Defender for Storage, or equivalent) — reject infected files before storage; file type allowlist enforced server-side (do not trust client-declared MIME type; inspect magic bytes); maximum file size limit enforced before accepting upload; `Content-Disposition: attachment` on all file downloads to prevent browser rendering of uploaded files; preview rendering in an isolated sandbox (not the main web origin) for documents that support preview; signed download URLs with short TTL (15 minutes) rather than direct storage access; DLP hooks if required by enterprise policy; file access logged in the central audit system; retention and legal hold policy with automated enforcement.

**Acceptance criteria:** EICAR test file upload blocked. Every file download logged. Signed URLs used for all download links. Content-Disposition header prevents inline browser rendering of potentially dangerous file types.

---

### E-11 · High · No SDLC/compliance evidence pipeline — SLSA Level 3 target _(enhanced)_

**Evidence/Reason:** `package.json` has typecheck/build scripts but no observed SAST/SCA/secret scanning/SBOM gates or release provenance.

**Implementation instruction:** Implement a full CI/CD security pipeline with these non-negotiable gates:

**Every PR:**

- `pnpm run typecheck` — block TypeScript errors
- `pnpm test` — block test failures
- Semgrep or equivalent SAST — block critical/high severity findings
- `pnpm audit` + Snyk or Socket SCA — block critical/high severity CVEs (with exception workflow for accepted risks)
- Gitleaks secret scanning — block any committed secrets
- License scan — block copyleft licenses incompatible with commercial distribution

**Every release build:**

- All above PR gates, plus:
- SBOM generation in CycloneDX or SPDX format (use `cyclonedx-npm` or equivalent)
- Build provenance attestation — see SLSA below

**SLSA supply-chain targets:**

- **SLSA Level 2 minimum for all release artifacts:** Build provenance generated and signed by the CI system. Use `slsa-github-generator` (GitHub Actions) or platform equivalent. Provenance is an attestation that the artifact was produced from a specific commit by a specific CI job — not by a developer's local machine.
- **SLSA Level 3 for enterprise release artifacts:** Hermetic build (no network access during build; all dependencies from lockfile). Build runs in an isolated, ephemeral environment. Provenance is signed by a short-lived CI identity (OIDC-based), not a long-lived signing key. Level 3 is achievable with GitHub Actions reusable workflows + `slsa-github-generator`.

**Sigstore/Cosign artifact signing:**

- Sign all release artifacts (HTML bundles, SBOM, container images if applicable) using **Cosign keyless signing** (Sigstore). Keyless signing uses the CI job's OIDC identity — no long-lived signing keys to manage, rotate, or leak. Every signing event is recorded in Rekor's public, append-only, transparency log.
- Publish the Cosign verification command in the release notes so users and enterprise customers can verify artifact integrity independently.

**Deployment approval gates:**

- Production deployments require: all CI gates pass + SBOM published + provenance attestation verified + release approval from designated owner. No direct-to-production pushes.

**Acceptance criteria:** Release blocked on critical SAST/SCA/secret-scan findings unless risk-accepted in writing with named approver. Every release artifact has a Cosign signature, SBOM, and SLSA provenance attestation at Level 2 or higher. Sigstore verification command is published in release notes.

---

### E-12 · Medium · Accessibility evidence missing

**Evidence/Reason:** No WCAG 2.2 AA audit evidence found. The UI uses many custom controls, modals, icon-only buttons, rich-text editors, data tables, and dynamic AI panels — all high-risk surfaces.

**Implementation instruction:** Run automated (axe-core or Lighthouse Accessibility) and manual WCAG 2.2 AA audit. Required manual tests: keyboard-only navigation for all primary enterprise workflows (create/edit/delete all record types, export data, view audit log, manage AI settings), modal focus trapping and restoration, icon button accessible names, form label associations, color contrast (4.5:1 normal text, 3:1 large text), dynamic content announcements, AI panel screen reader behavior, data table headers, editor semantics. Fix findings before any enterprise pilot. Produce a VPAT for enterprise procurement. Add accessibility regression tests to CI using axe-core in headless browser.

**Acceptance criteria:** VPAT produced and published. Primary keyboard-only enterprise workflows completable. Automated axe-core test pass for all primary views. Screen reader results documented for NVDA/JAWS (Windows) and VoiceOver (Mac).

---

### E-13 · Medium · Privacy program missing

**Evidence/Reason:** Offline privacy narrative exists in code/docs, but enterprise privacy obligations require a formal program with legal, engineering, and operational components.

**Implementation instruction:** Create a formal privacy program covering:

- **Data inventory:** Every data category, its classification (public/internal/confidential/restricted/PII), storage location, retention period, and deletion method.
- **PII classification:** Which fields are PII; which are sensitive PII (health, financial, biometric, racial origin, political opinion). Apply field-level classification tags in the data model.
- **Retention schedule:** Define retention periods for each data category; implement automated enforcement (scheduled deletion jobs, not manual processes).
- **Deletion workflow:** Hard-delete with verification for production data. Deletion must propagate to backups within the defined backup retention window. Crypto-shredding (see E-16) handles encrypted backup propagation.
- **DSAR process:** Data Subject Access Request workflow with SLA (30 days under GDPR, 45 days under CCPA). Document the process and test it.
- **Subprocessor list:** Maintain and publish a list of all subprocessors (cloud providers, AI providers, SaaS tools that process customer data). Execute DPAs with each. Notify customers of changes with the contractually required notice period.
- **DPA template:** Prepare a Data Processing Agreement template for enterprise customers.
- **Privacy notice:** Publish an accurate privacy notice matched to actual data flows.
- **Breach workflow:** Document and test the data breach notification process (72-hour GDPR notification to supervisory authority; customer notification SLA).

**Acceptance criteria:** Data inventory complete. DSAR process tested end-to-end. Subprocessor list published. DPA template available for enterprise customer review. Privacy notice accurate.

---

### E-14 · Medium · BC/DR and SLA not defined

**Evidence/Reason:** Local offline backup does not satisfy enterprise availability requirements. No RTO/RPO targets, backup strategy, restore tests, or incident communications were observed.

**Implementation instruction:** Define RTO (Recovery Time Objective) and RPO (Recovery Point Objective) targets appropriate for enterprise CRM. Implement: automated database backups with tested restore procedure; multi-zone architecture if hosted (single-zone failure should not cause full outage); point-in-time recovery for database; backup encryption and access controls; quarterly restore tests with documented results; status page for enterprise customers; incident communications playbook (who is notified, within what timeframe, with what information); SLA definition (uptime, support response times, data recovery) documented in customer agreements.

**Acceptance criteria:** RTO/RPO targets defined and documented. Quarterly restore test evidence exists. Status page operational. Downtime incident communications process tested via tabletop exercise.

---

### E-15 · Medium · No formal certification evidence repository

**Evidence/Reason:** Documentation exists in code/docs, but no structured control evidence library for auditor review was found.

**Implementation instruction:** Create an evidence repository (a structured folder in the repo or a dedicated evidence management tool) mapped to SOC 2/ISO/ASVS controls. Include: security policies (access control, change management, incident response, vulnerability management, vendor management), access review exports (quarterly), CI/CD scan outputs for each release, penetration test reports, risk register and risk acceptance records, backup restore test results, monitoring alert evidence, vendor review records, training records. Tag each evidence item with the control(s) it satisfies. Start collecting evidence from the first day of operations — retroactive evidence collection is extremely difficult.

**Acceptance criteria:** Evidence repository indexed by control framework. Auditor-ready evidence package can be assembled without manual searching. Evidence is current (within audit period).

---

### E-16 · Critical · No GDPR crypto-shredding architecture — per-user key model required _(added)_

**Evidence/Reason:** The current architecture uses a single encrypted vault blob per user session. For enterprise deployments, this creates an unresolved GDPR Article 17 (right to erasure) problem: when a user requests deletion, their data must be deleted from live storage **and** from all backups within a compliant timeframe. The European Data Protection Board (EDPB) made right-to-erasure enforcement a 2026 priority, with active audits of 764 controllers across 32 EU supervisory authorities revealing widespread non-compliance, particularly around backup propagation. Traditional hard-delete-from-backup is operationally prohibitive for encrypted backup systems. The solution is **crypto-shredding**.

**Implementation instruction:**

**What crypto-shredding means:**
Each user (and each tenant in a multi-tenant model) has their own encryption key managed in the KMS. All data for that user/tenant is encrypted with their key (or wrapped by their key). "Deleting" the user means destroying their KMS key. The encrypted data blobs remain in storage but are permanently, irreversibly unreadable — equivalent to erasure. EU DPAs accept cryptographic erasure as compliant with Article 17 when: the encryption algorithm is strong enough that decryption without the key is not reasonably possible (AES-256-GCM satisfies this), the key is provably destroyed with no copies retained, and the destruction is audited and attestable.

**Architecture requirements:**

1. **Per-user key in KMS:** Every user's data-at-rest is encrypted using a Data Encryption Key (DEK) specific to that user. The DEK is wrapped/encrypted by a Key Encryption Key (KEK) managed in the KMS (Azure Key Vault, AWS KMS, HashiCorp Vault with Transit secrets engine, or equivalent). The application never has access to the raw DEK — it requests decryption/encryption operations from the KMS.

2. **Deletion = key destruction:** When a user requests erasure (GDPR Article 17 DSAR) or is deprovisioned:
   - Schedule the KMS key for destruction (most KMS services have a mandatory minimum destruction delay, e.g., 7–30 days, to prevent accidental deletion).
   - Set a "deleted" flag on the user account immediately to prevent new login/data access.
   - The KMS destruction event is audited and logged as the erasure evidence.
   - After the destruction delay, the key is destroyed and the encrypted blobs are unreadable.

3. **Backup propagation:** Because the encrypted blobs in backups are also encrypted with the user's DEK, destroying the DEK makes all backup copies unreadable without requiring backup modification. This is the primary advantage of crypto-shredding for systems with encrypted backups. Document this mechanism clearly in the privacy program and DSAR process.

4. **Retention schedule enforcement:** User data subject to a legal hold or contractual retention obligation must have its key preservation documented as an exception to the erasure request. Legal hold must be approved by a designated authority and time-bounded.

5. **Soft delete before hard delete:** Implement a soft-delete period (e.g., 30 days) during which account recovery is possible. After the soft-delete period, trigger the KMS key destruction schedule. This aligns with both GDPR and practical operational needs.

6. **Tenant-level key hierarchy:** In a multi-tenant model, consider a three-level key hierarchy: Tenant KEK (per-tenant) → User DEK (per-user, wrapped by tenant KEK) → Record key (per-record, optional for field-level encryption). Tenant deletion destroys the tenant KEK, which makes all tenant user DEKs unrecoverable.

**Acceptance criteria:** Per-user KMS key architecture designed and documented before any enterprise data is stored. KMS key destruction is the erasure mechanism; proof of destruction is the DSAR evidence. Backup blobs remain encrypted and unreadable after key destruction. DSAR process tested end-to-end with a real erasure test in a non-production environment. Privacy program documents crypto-shredding as the erasure mechanism. EU DPA acceptance of cryptographic erasure is documented in the privacy legal analysis.

---

## Target Enterprise Architecture

**Frontend:** Keep the current TypeScript/Vite core as the enterprise web client but remove all local-only trust assumptions. The UI calls a typed, versioned API client. Enterprise data is never written directly to IndexedDB as the system of record — IndexedDB holds only session cache.

**Identity:** OIDC/SAML federation with PKCE mandatory; SCIM provisioning; MFA enforcement via enterprise IdP; session risk policy; step-up authentication for exports, admin changes, AI provider changes, destructive operations, and legal hold placement.

**API layer:** Resource-scoped authorization middleware backed by a centralized policy engine (OPA or Cedar); request schema validation on every endpoint; rate limiting (global, per-tenant, per-user, per-endpoint); CSRF strategy if cookie auth is used; strict CORS allowlist; audit hooks on every state-changing operation; OpenAPI specification; error model that does not leak tenant data or internal stack traces.

**Data layer:** Tenant-scoped relational or document database with RLS constraints; per-user KMS-managed encryption keys for crypto-shredding (GDPR erasure); object storage with tenant-scoped paths and server-managed encryption; full-text search with tenant-scoped indexes; retention/legal hold automation; tested backup/restore with point-in-time recovery.

**Observability:** OpenTelemetry (traces, metrics, structured logs) from day one in every service; SIEM export; dashboards; SLO-based alerting; incident management; admin/support access logging; evidence retention for SOC 2.

**Audit pipeline:** Append-only audit event store with WORM-capable backend; centralized ingestion from all services; tenant-scoped read access for customer security admins; SIEM export; immutable log configuration.

**AI gateway:** Tenant policy engine (enable/disable per provider/model); provider/model allowlist; data minimization (PII field exclusion); prompt injection defenses; redaction; logging (prompt hash, response hash, tool calls, cost); human approval required for write actions; DPA/subprocessor linkage; ISO 42001:2023 alignment.

---

## Enterprise Implementation Roadmap

| Phase                                         | Goal                                                        | Concrete implementation tasks                                                                                                                                                                                                                          | Exit criteria                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **0 — Decide scope**                          | Stop trying to certify the offline file as enterprise SaaS. | Choose enterprise deployment model: hosted SaaS, customer-hosted, Dataverse/Power Platform, or hybrid. Define system boundary, tenant, user, data, AI, audit, and admin boundaries. Write Architecture Decision Records.                               | Written system boundary and deployment model approved.                                                                 |
| **1 — Backend foundation**                    | Create the service control plane.                           | API gateway, OIDC login (PKCE mandatory), server sessions/token management, tenant-aware database schema with RLS, object storage, per-user KMS key architecture, audit ingestion service, OpenAPI contracts, migration strategy.                      | Authenticated CRUD endpoints with tenant-scoped tests and per-user keys in KMS.                                        |
| **2 — Authorization and identity lifecycle**  | Make access enterprise-governed.                            | OPA or Cedar policy engine, object-level authorization on every endpoint, SCIM provisioning, group mapping, BOLA/IDOR test suite, admin console, session revoke, break-glass admin, access review exports.                                             | BOLA/IDOR tests fail closed; IdP disable removes access within SLA; admin actions audited.                             |
| **3 — Security operations and observability** | Create SOC/ISO evidence-generating operations.              | OpenTelemetry instrumentation across all services, SIEM export, SAST/SCA/secret scanning in CI, SBOM generation, SLSA Level 2 provenance, Cosign/Sigstore artifact signing, vulnerability SLAs, incident process, backup/restore tests, risk register. | Evidence pack exists for security, availability, confidentiality, change management, and access control.               |
| **4 — GDPR and privacy program**              | Make data governance enterprise-compliant.                  | Crypto-shredding DSAR workflow, data inventory, PII classification, retention/legal hold automation, DSAR process tested, subprocessor list published, DPA template, privacy notice.                                                                   | DSAR erasure tested end-to-end; KMS key destruction verified; backup unreadability confirmed; privacy notice accurate. |
| **5 — AI governance**                         | Make AI enterprise-safe.                                    | AI gateway with tenant policy engine, provider/model allowlist, data minimization/redaction, prompt injection tests, human approval for write actions, AI audit log, DPA/subprocessor review, ISO 42001 alignment.                                     | Cloud AI can be disabled by tenant admin and verified; all AI use policy-bound and audited.                            |
| **6 — Certification readiness**               | Prepare formal assurance.                                   | ASVS L2 verification matrix, WCAG 2.2 audit/VPAT, SOC 2 Type I readiness assessment, ISO 27001 gap assessment, privacy/27701 if needed, CSA CAIQ if cloud, DPoP roadmap documented.                                                                    | External readiness review passes with tracked remediation backlog.                                                     |
| **7 — Type II / continuous assurance**        | Operate controls long enough to prove them.                 | Access reviews, change approvals, incident tabletop tests, vulnerability scans, backup restore tests, monitoring evidence, vendor reviews over the audit period.                                                                                       | SOC 2 Type II / ISO certification audit evidence complete.                                                             |

---

## Definition of Done

- No enterprise data-changing operation is enforced only in the browser.
- Every API endpoint validates authentication, tenant membership, resource ownership, action permission (via policy engine), and audit logging.
- OIDC with PKCE exists before any enterprise pilot; SCIM exists before broad enterprise rollout. No implicit flow anywhere.
- Per-user KMS key architecture is in place before any enterprise customer data is stored.
- GDPR crypto-shredding DSAR workflow is tested before any enterprise customer onboarding.
- Central audit log cannot be modified or purged by ordinary users or tenant admins.
- Admin and support access is time-bounded, justified, logged, and reviewable by the customer's security admin.
- Cloud AI cannot be enabled without tenant admin policy approval and a visible data disclosure.
- OpenTelemetry instrumentation exists in all services. SLOs are defined and dashboards exist.
- A Cosign-signed SBOM and SLSA Level 2+ provenance attestation are generated for every release artifact.
- WCAG 2.2 AA keyboard and screen-reader journeys pass for primary workflows.
- SOC 2 / ISO evidence exists before any customer security questionnaire claims are made.

---

## Immediate Next Actions

1. Create `ENTERPRISE_ARCHITECTURE.md` defining: system boundary, data flow diagrams, identity flows (OIDC/PKCE), tenant boundaries, per-user KMS key hierarchy, AI data flows, audit pipeline, and GDPR erasure mechanism.
2. Create an `ASVS-5.0-L2-MATRIX.md` (or spreadsheet) with requirement IDs, current status, owner, test method, and evidence location.
3. Create the backend skeleton with OIDC/PKCE authentication, tenant-aware database schema, per-user KMS key issuance, and one fully secured CRUD resource before adding more features.
4. Replace or scope the global Trusted Types raw policy before enterprise pilots — this is a blocking XSS risk.
5. Create CI gates for typecheck, test, SAST, SCA, secret scanning, SBOM, license scan, SLSA provenance, and Cosign artifact signing.
6. Start the SOC 2 / ISO evidence repository today, even before formal audit, so engineering work produces evidence by design.
7. Begin the GDPR privacy program: data inventory, PII classification, and KMS key architecture design.

---

## Source Materials Used

| Source                            | How used                                                                                         | URL                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| OWASP ASVS 5.0.0                  | Application-security verification baseline; technical acceptance criteria and test guidance.     | https://owasp.org/www-project-application-security-verification-standard/                                                           |
| NIST SP 800-207                   | Zero Trust Architecture definition and enterprise ZTA model; pillar assessment basis.            | https://csrc.nist.gov/pubs/sp/800/207/final                                                                                         |
| NIST SP 800-63B-4                 | Authentication, authenticator management, OIDC/PKCE, passkey/MFA guidance.                       | https://csrc.nist.gov/pubs/sp/800/63/b/4/final                                                                                      |
| NIST SP 800-218 SSDF              | Secure software development framework for CI/CD pipeline and SDLC.                               | https://csrc.nist.gov/pubs/sp/800/218/final                                                                                         |
| NIST SP 800-53 Rev. 5             | Security and privacy control catalog; FedRAMP and federal control mapping.                       | https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final                                                                                  |
| FedRAMP 20x                       | Automation-first cloud authorization and Key Security Indicator model.                           | https://www.fedramp.gov/20x/                                                                                                        |
| ISO/IEC 27001:2022                | Information security management system certification standard.                                   | https://www.iso.org/standard/27001                                                                                                  |
| ISO/IEC 27701:2025                | Privacy information management system standard; GDPR program alignment.                          | https://www.iso.org/standard/27701                                                                                                  |
| ISO/IEC 42001:2023                | AI management system standard; AI governance framework.                                          | https://www.iso.org/standard/42001                                                                                                  |
| SOC 2 / AICPA                     | Assurance reporting over service-organization controls.                                          | https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services                                 |
| WCAG 2.2                          | W3C web accessibility recommendation for AA conformance and VPAT evidence.                       | https://www.w3.org/TR/WCAG22/                                                                                                       |
| CSA Cloud Controls Matrix 4.1     | Cloud security control framework and STAR assessment basis.                                      | https://cloudsecurityalliance.org/research/cloud-controls-matrix                                                                    |
| RFC 9700 — OAuth 2.0 Security BCP | Security best current practice for OAuth 2.0; prohibits implicit flow; mandates PKCE.            | https://www.rfc-editor.org/rfc/rfc9700                                                                                              |
| RFC 9449 — DPoP                   | Demonstrating Proof-of-Possession for OAuth tokens; token binding for high-assurance enterprise. | https://www.rfc-editor.org/rfc/rfc9449                                                                                              |
| OPA — Open Policy Agent           | Policy-as-code authorization engine; ABAC/RBAC implementation option.                            | https://www.openpolicyagent.org/                                                                                                    |
| AWS Cedar                         | Formally verified, strongly typed policy language for application authorization.                 | https://www.cedarpolicy.com/                                                                                                        |
| OpenTelemetry                     | CNCF-graduated observability standard; traces, metrics, and logs SDK.                            | https://opentelemetry.io/                                                                                                           |
| SLSA Framework v1.2               | Supply-chain levels for software artifacts; build provenance and integrity.                      | https://slsa.dev/spec/v1.2/about                                                                                                    |
| Sigstore / Cosign                 | Keyless artifact signing using OIDC identity and Rekor transparency log.                         | https://www.sigstore.dev/                                                                                                           |
| EDPB Right to Erasure Enforcement | 2026 EDPB coordinated enforcement action on Article 17 right to erasure.                         | https://www.edpb.europa.eu/our-work-tools/our-documents/other/coordinated-enforcement-action-implementation-right-erasure_en        |
| Crypto-shredding for GDPR         | Technical pattern for key-destruction-as-erasure in encrypted systems.                           | https://oneuptime.com/blog/post/2026-02-17-how-to-set-up-crypto-shredding-for-gdpr-right-to-erasure-compliance-in-google-cloud/view |

---

## Repository Evidence Reviewed

| Evidence area            | Path                                                 | What it proves                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo / build scripts | `package.json`                                       | Defines `build:offline`, `build:sync`, `build:dataverse`, `build:all`, `typecheck`. No enterprise backend scripts.                                                     |
| Offline entry            | `apps/offline/src/entry.ts`                          | Sets `OT_ONLY_DEPLOYMENT_POLICY`, `NullAdapter`, calls `init()`. Pattern correct for offline; enterprise needs separate entry with backend adapter.                    |
| Offline CSP template     | `apps/offline/index.html`                            | Strict CSP via `<meta>` tag; enterprise must move to server-side response headers.                                                                                     |
| Deployment policy        | `packages/core/src/deployment-policy.ts`             | AI tier policy; must be extended with enterprise server-policy-driven tiers.                                                                                           |
| Sync adapter interface   | `packages/core/src/adapter-interface.ts`             | Pull/push/stream/clear interface; correct seam for enterprise adapter.                                                                                                 |
| RxDB adapter             | `packages/adapter-rxdb/src/index.ts`                 | TODO stub.                                                                                                                                                             |
| Dataverse adapter        | `packages/adapter-dataverse/src/index.ts`            | TODO stub.                                                                                                                                                             |
| Crypto                   | `packages/core/src/crypto.ts`, `constants.ts`        | AES-GCM, PBKDF2-HMAC-SHA-256, 600 k iterations, 32-byte salt, 12-byte IV, non-extractable `CryptoKey`. Strong local crypto; enterprise extends with per-user KMS keys. |
| Vault and backup         | `packages/core/src/vault.ts`                         | Encrypted vault load/save, KDF migration, backup import/export. Enterprise uses server-side storage; vault format reusable for export artifacts.                       |
| Session key              | `packages/core/src/session.ts`                       | Non-extractable `CryptoKey` in IDB with `sessionStorage` sentinel. Enterprise replaces with OIDC token session management.                                             |
| Authentication           | `packages/core/src/auth.ts`                          | Local password unlock, lockout. Enterprise replaces with OIDC; local auth used only for offline cache unlock.                                                          |
| TOTP / passkeys          | `packages/core/src/totp.ts`, `mfa.ts`, `webauthn.ts` | TOTP and passkey PRF logic; enterprise delegates MFA to IdP.                                                                                                           |
| Audit log                | `packages/core/src/audit.ts`                         | Rich local event taxonomy; reuse as basis for server-side audit event schema.                                                                                          |
| Sanitization             | `packages/core/src/sanitize.ts`                      | DOMPurify allowlist; keep for enterprise WebView and AI output rendering.                                                                                              |
| Trusted Types            | `packages/core/src/trusted-types.ts`                 | Raw policy is a blocking issue for enterprise deployment; must be replaced.                                                                                            |
| Mobile roadmap           | `MOBILE-ROADMAP.md`                                  | Enterprise mobile requires backend identity and server authorization; local vault is cache only.                                                                       |

---

## Appendix A — Enterprise Implementation Playbook

| Workstream                        | Implementation detail                                                                                                                                                                                                                               | Primary deliverables                                                                                    | Evidence to collect                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Identity federation**           | OIDC with PKCE (mandatory); issuer allowlist; JWKS validation; audience/issuer/iat/exp checks; token expiry; refresh/rotation; IdP group claim mapping; DPoP design documented. Add SAML only if buyer requires. Add SCIM for lifecycle automation. | OIDC/SAML design doc, SCIM endpoint, group-to-role mapping, login/session diagram.                      | Test login with Entra/Okta/Google; disabled user test within SLA; MFA policy screenshots; auth logs; PKCE enforcement verified.  |
| **Authorization model**           | Define resources and actions before coding. OPA or Cedar policy engine with deny-by-default. Object-level checks in every service. BOLA/IDOR test suite covering every endpoint.                                                                    | Policy definitions in version control, authorization middleware, test fixtures, resource/action matrix. | BOLA/IDOR regression tests; failed access attempts in audit logs; role review matrix; policy engine decision logs.               |
| **Tenant isolation**              | `tenant_id`/`org_id` on every table and event. Tenant resolved from authenticated session only. DB constraints/RLS if available. Cross-tenant regression test suite.                                                                                | Tenant model ADR, schema migrations, tenant resolver service, cross-tenant test suite.                  | Automated tests proving tenant A cannot access tenant B data through any endpoint or search.                                     |
| **Per-user KMS key architecture** | Each user has a DEK wrapped by a KMS-managed KEK. Application never holds raw DEK. KMS destruction = erasure. DSAR workflow uses key destruction.                                                                                                   | KMS key management design, DEK provisioning service, DSAR erasure workflow, key destruction audit log.  | DSAR erasure test (non-prod); key destruction evidence; backup unreadability verification; EU legal opinion on crypto-shredding. |
| **API security**                  | Schema validation on every request/response (Zod or equivalent). Rate limiting at API gateway (global, per-tenant, per-user). CSRF strategy or strict CORS if token auth. OpenAPI spec. Error model without internal detail leakage.                | OpenAPI spec, validators, rate-limit rules, error model.                                                | DAST report, API negative tests, rate-limit logs, CORS/CSRF test results.                                                        |
| **Data protection**               | Classify fields (PII, sensitive PII, internal, public). KMS-managed keys per user/tenant. Retention policy automation. Legal hold workflow. Purge and DSAR workflows.                                                                               | Data classification matrix, KMS key plan, retention policy, purge/DSAR workflows.                       | KMS access logs, retention tests, deletion verification, DSAR evidence, legal hold tests.                                        |
| **File handling**                 | Object storage with tenant-scoped paths. Signed download URLs (15 min TTL). Malware scanning on upload. Type/size allowlist. `Content-Disposition: attachment`. Preview in isolated sandbox. Download audit log. DLP hooks if required.             | File service, scanner integration, upload/download policy, audit events.                                | Malware test block result, file access audit, signed URL TTL verification, content-disposition header test.                      |
| **Central audit**                 | Append-only audit event store (WORM-capable). Ingest from all services. Admin/support access logged and viewable by customer security admin. SIEM export.                                                                                           | Audit event schema, ingestion service, admin audit UI, SIEM export config.                              | Immutable log configuration evidence, SIEM dashboard, sample audit trails, tampering attempt test.                               |
| **OpenTelemetry observability**   | OTel SDK in every service. Traces with `tenant_id`/`user_id`/`request_id`. RED metrics per endpoint. Structured JSON logs with trace correlation. SLO definitions and dashboards. Alerting on SLO burn rate and anomalies.                          | OTel config, dashboards, alert catalog, SLO definitions, on-call runbooks.                              | Alert evidence (screenshots/exports), SLO compliance report, incident tabletop records, restore test results.                    |
| **AI governance**                 | AI gateway with tenant policy engine. Provider/model allowlist. Data minimization (PII field exclusion). Prompt injection test suite. Human approval for write actions. AI audit log. DPA/subprocessor list. ISO 42001 alignment.                   | AI policy engine, AI audit schema, prompt injection test set, model inventory, DPAs.                    | AI disabled-by-policy proof, AI audit logs, redaction tests, vendor DPA evidence, ISO 42001 gap assessment.                      |
| **SDLC pipeline**                 | CI: typecheck, lint, unit tests, SAST, SCA, secret scan, license scan, SBOM, SLSA Level 2+ provenance, Cosign/Sigstore artifact signing, deployment approval gates.                                                                                 | CI workflow, SBOM, SLSA provenance, Cosign signatures, release artifacts, vulnerability SLA policy.     | Build logs, scan outputs, exception approvals, signed release artifacts, provenance verification commands.                       |
| **Operations**                    | Monitoring/alerting (OTel), incident management, backup/restore (RTO/RPO tested quarterly), status page, vulnerability intake process, customer communications playbook.                                                                            | Runbooks, incident policy, alert catalog, backup plan, status page.                                     | Quarterly restore test results, alert evidence, incident tabletop records, RTO/RPO verification.                                 |
| **Accessibility**                 | Keyboard/screen-reader tests in release acceptance. Automated axe-core in CI. Manual WCAG 2.2 AA audit covering all enterprise workflows. VPAT produced.                                                                                            | WCAG 2.2 test plan, VPAT, accessibility bug backlog, axe-core CI integration.                           | NVDA/JAWS/VoiceOver test results, contrast report, keyboard workflow documentation, VPAT published.                              |

---

## Appendix B — Certification Evidence Package by Target

| Target                 | Do not claim until                                                                           | Evidence package to build                                                                                                                                                                              | Practical next step                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **SOC 2 Type I**       | A defined hosted/managed service boundary with designed and operating controls.              | System description, trust services criteria mapping, risk assessment, policies, access controls, monitoring, vulnerability management, change management, vendor list, incident response.              | Start with readiness assessment after backend MVP and core controls exist.                  |
| **SOC 2 Type II**      | Controls have operated consistently over the audit period (typically 6–12 months).           | All Type I evidence plus operating evidence: access reviews, change approvals, vulnerability remediation, incident tests, backup tests, monitoring alerts, vendor reviews, OTel dashboard screenshots. | Do not begin Type II period until evidence automation (OTel, CI outputs) is in place.       |
| **ISO/IEC 27001**      | Organization has an ISMS scope and management commitment.                                    | ISMS scope, risk methodology, risk register, Statement of Applicability, policies, internal audit, management review, corrective actions.                                                              | Create ISO scope around product engineering/operations first; engage a gap assessment firm. |
| **OWASP ASVS 5.0 L2**  | Every applicable requirement has pass/fail evidence or documented risk acceptance.           | ASVS matrix, manual test evidence, automated test results, code references, remediation tickets, third-party review results.                                                                           | Use ASVS as the engineering backlog before any certification marketing.                     |
| **WCAG 2.2 AA / VPAT** | Primary user and admin workflows pass manual assistive technology testing.                   | VPAT, keyboard test results, screen-reader notes, contrast results, accessibility remediation log.                                                                                                     | Run audit after UI stabilizes; fix focus/modal/icon-label issues early.                     |
| **FedRAMP / 20x**      | Cloud-native service boundary, federal hosting strategy, and continuous evidence automation. | SSP/OSCAL, POA&M, vulnerability evidence, access controls, KSI evidence (if 20x), incident/IR, logging, encryption, inventory.                                                                         | Only pursue if federal buyers justify the cost. Design evidence automation from day one.    |
| **CSA STAR**           | Cloud implementation with documented shared responsibility model.                            | CCM/CAIQ responses, cloud architecture documentation, evidence mapped to CCM domains, third-party assessment for Level 2.                                                                              | Use CAIQ as enterprise cloud security questionnaire pre-work.                               |
| **ISO/IEC 42001**      | AI is material to the product and AI governance processes are defined and operating.         | AI policy, model inventory, risk assessments, human oversight design, monitoring, supplier controls, AI incident handling.                                                                             | Start lightweight AI governance before adding cloud AI to enterprise tier.                  |

---

## Appendix C — Enterprise Test Plan Before Pilot

| Test category        | Required tests                                                                                                                                                                                                              | Failure condition                                                                                                           | Evidence                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Auth**             | OIDC login/logout with PKCE verified; token expiry; session revoke; MFA enforcement; disabled user access; passwordless/passkey if enabled; step-up auth triggers for high-risk operations.                                 | Disabled user can still access; expired token accepted; logout not invalidating server-side session; step-up not triggered. | Automated auth tests and audit log screenshots.                                 |
| **Authorization**    | Every endpoint tested for: same-role/different-object access, cross-role, cross-tenant by ID guessing, direct object ID access without membership, export access without permission.                                        | Any BOLA/IDOR success; UI-only enforcement (client bypass works).                                                           | Endpoint test matrix, failed access attempt logs, policy engine decision audit. |
| **Tenant isolation** | Cross-tenant database query, full-text search, file access, audit event access, notification, AI call, export.                                                                                                              | Data from tenant B visible to tenant A through any vector.                                                                  | Automated isolation test suite with per-endpoint results.                       |
| **Input / XSS**      | Stored XSS in every rich-text/plain field; import payloads with script content; file names with special characters; AI output with injected markup; URL fields; backup import.                                              | Script execution or unsafe link scheme survives sanitization.                                                               | ASVS injection test results; automated test suite.                              |
| **Files**            | EICAR malware sample upload; oversized file; wrong extension/content-type mismatch; SVG/HTML file download rendered inline; path traversal in file name; double-extension attack.                                           | Unsafe file accepted, stored, or rendered as executable content.                                                            | File security test report.                                                      |
| **AI**               | Prompt injection via user-controlled fields (task name, document content, client notes); data boundary (PII field excluded); tenant policy disabled test; cloud provider key missing; write-action approval bypass attempt. | AI sends PII outside boundary; modifies records without user approval; executes despite tenant policy disable.              | AI policy test output and AI audit logs.                                        |
| **Audit**            | Create/update/delete/export/admin/support/AI actions each produce complete audit event with actor, resource, action, result, IP, session, request correlation.                                                              | Sensitive action missing audit event; event content is truncated or missing required fields; user can modify logs.          | Audit event samples per action type; immutability evidence.                     |
| **GDPR erasure**     | Trigger DSAR for a test user; verify key destruction in KMS; verify encrypted data unreadable after key destruction; verify backup unreadability; verify erasure evidence logged.                                           | Data readable after key destruction; erasure not propagated to backups; no audit evidence of destruction.                   | KMS key destruction log; unreadability verification; DSAR evidence package.     |
| **Availability**     | Backup restore to point-in-time; dependency outage simulation; API rate limiting behavior; graceful degradation when AI gateway unavailable; incident alert triggering.                                                     | Unrecoverable data loss; no alert for outage; no graceful degradation.                                                      | Restore test results, monitoring alert evidence, RTO/RPO measurement.           |
