# Task App CRM — Offline Build Assessment

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

> **No-BS verdict:** The offline build is the strongest and most realistic near-term production
> path. The branch has a real offline entry profile that sets OT-only deployment policy and
> NullAdapter, strong local encryption, local MFA/passkey work, CSP, DOMPurify sanitization, and
> encrypted local audit. However, it must not claim enterprise certification, SOC 2, FedRAMP,
> zero-trust enterprise, FIPS, or mobile readiness. It can claim **offline-first secure local
> design** only after fixing build separation, backup durability, XSS/Trusted Types hardening,
> release integrity, accessibility, and documented operational procedures.

| Area                   | Current state                                                                   | Production interpretation                                                                                |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Primary security model | Local encrypted vault protected by master password; no backend.                 | Good for single-user offline/local privacy. Not sufficient for multi-user enterprise authorization.      |
| Build profile          | `apps/offline/src/entry.ts` sets `OT_ONLY_DEPLOYMENT_POLICY` and `NullAdapter`. | Correct direction. Need artifact-level verification that forbidden tiers/code are absent or unreachable. |
| Crypto                 | PBKDF2 600 k + AES-GCM + random salt/IV + non-extractable key.                  | Strong local cryptographic design, but not automatically FIPS-validated.                                 |
| Audit                  | Encrypted local audit log.                                                      | Useful for user accountability but not tamper-resistant against local device owner.                      |
| Network                | Offline policy restricts AI tier; endpoint validation exists.                   | Needs hard artifact and CSP verification for no-network/no-cloud claims.                                 |
| Certification          | Aligned to technical controls, not certifiable service.                         | Use ASVS/SSDF/internal security review, not SOC 2/FedRAMP, unless a service exists.                      |

---

## Certification and Assurance Applicability

| Standard / certification       | Offline applicability                                                               | Current status                                                                                      | Required offline evidence                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OWASP ASVS 5.0 Level 2**     | Highly applicable as technical app-security verification, even for a local web app. | **Partial.** Crypto, CSP, MFA, sanitization, audit exist. Need control-by-control testing.          | ASVS matrix, XSS tests, auth/session tests, import/export tests, dependency review, documented exceptions.                                         |
| **NIST SP 800-218 SSDF**       | Applicable to development process and release assurance.                            | **Not evidenced.** Build/typecheck exists, but no observed CI security gates or release provenance. | SAST, SCA, secret scanning, SBOM, code review, signed artifacts, vulnerability disclosure, release checklist.                                      |
| **NIST SP 800-63B-4**          | Applicable to local authentication design by analogy; no central verifier.          | **Partial.** Password, TOTP, passkey PRF logic exist; password minimum is only 8 on first run.      | Set vault password guidance/minimum; compromised-password check if feasible locally; recovery-code design; reauth policy.                          |
| **NIST SP 800-207 Zero Trust** | Not a full ZTA because there is no enterprise resource access plane.                | **Partial local principles:** least network, local encryption, reauth before sensitive operations.  | Do not call offline app "zero trust." Call it "local zero-network / least privilege by design" unless enterprise controls exist.                   |
| **SOC 2**                      | Not applicable to a standalone offline file unless a service is operated around it. | **Not applicable.**                                                                                 | If offering managed updates/support/service, define the service boundary and controls.                                                             |
| **ISO/IEC 27001:2022**         | Organization-level ISMS; not a product certification.                               | **Not app-ready by code alone.**                                                                    | Can support ISO evidence through SDLC, vulnerability management, asset/release management.                                                         |
| **ISO/IEC 27701:2025**         | Applies if organization manages PII/privacy operations.                             | **Not a product-only claim.**                                                                       | Data inventory, privacy notices, DSAR procedures, retention/deletion workflows.                                                                    |
| **WCAG 2.2 AA / VPAT**         | Applicable to offline UI if used by customers or workforce.                         | **Unknown; no audit evidence found.**                                                               | Keyboard, screen reader, contrast, focus, forms, editor, modal testing; VPAT if enterprise buyers.                                                 |
| **FIPS 140-3**                 | Only if required by government/regulated deployment.                                | **Cannot claim.** WebCrypto algorithms do not prove validated cryptographic module usage.           | Use validated browser/OS/native cryptographic module and document certificate/boundary; otherwise state "uses AES-GCM/PBKDF2, not FIPS-validated." |
| **PCI DSS / HIPAA / HITRUST**  | Only if payment card data or PHI is deliberately stored.                            | **Not applicable** based on current scope.                                                          | Keep such data out of scope or build specific compliance controls.                                                                                 |

---

## Detailed Offline Findings

### O-01 · High · Build separation is not proven at artifact level

**Evidence/Reason:** Offline entry sets OT-only policy, but the shared AI runtime imports cloud providers and other tiers exist in the codebase.

**Implementation instruction:** Add CI artifact checks after every build: grep the built offline HTML for `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, cloud provider names, model download URLs, and forbidden feature strings. Prefer build-time aliases/stubs for cloud providers in the offline build — runtime policy is a secondary defense, not the primary one.

**Acceptance criteria:** Offline artifact contains no cloud endpoint code unless deliberately documented as dead code and risk-accepted. CI fails if forbidden strings are detected.

---

### O-02 · High · Trusted Types raw policy auto-trusts all template strings

**Evidence/Reason:** `trusted-types.ts` creates `nexus-crm-raw` and monkey-patches `innerHTML`/`outerHTML` to pass all strings through unchanged. This negates the security value of Trusted Types for any string that reaches those sinks.

**Implementation instruction:** Replace the global raw policy with an explicit safe template renderer. Use `textContent` for all user-supplied strings. Use a sanitized `TrustedHTML` value (via `DOMPurify` → Trusted Types pipeline) only for rich text that genuinely requires HTML. Create `ui/render/` helpers: `text()`, `attr()`, `safeHtml()`, `safeUrl()`. Lint rule: block raw `innerHTML` assignments in new files.

**Acceptance criteria:** Malicious values in client/task/document/file/import fields cannot execute. Automated XSS tests with malicious payloads in every rich-text sink pass clean.

---

### O-03 · High · Backup durability is user-dependent with no guided workflow

**Evidence/Reason:** Vault and FS file handling exist, but no forced backup health workflow was observed. Users can lose all data if browser storage is cleared without a backup.

**Implementation instruction:** Add a first-run backup wizard that requires the user to create an encrypted backup before dismissal. Add a recurring backup reminder (configurable interval), last-backup status indicator, restore-test function that performs a dry-run without overwriting the current vault, and corruption-recovery guidance in the UI and documentation.

**Acceptance criteria:** User can verify backup and perform a restore dry-run without overwriting current vault. App shows last backup timestamp on every unlock.

---

### O-04 · High · Password minimum is too low for offline vault risk

**Evidence/Reason:** `auth.ts` enforces `minlength 8` on first-run password. For an offline vault where the only defense against brute force is password strength and KDF cost, 8 characters is insufficient. NIST SP 800-63B-4 recommends at least 15 characters for memorized secrets; offline dictionary attacks are limited only by password strength and PBKDF2 cost.

**Implementation instruction:** Raise minimum guidance to 15 characters or strong passphrase equivalent. Add a local password strength meter (zxcvbn or equivalent, bundled — no network call). Display clear guidance: "This password is the only thing protecting your data. There is no recovery if forgotten." Block or strongly warn on weak passwords before vault creation.

**Acceptance criteria:** Passwords below 15 characters or with low entropy score are blocked or presented with a prominent, dismissable-only-once warning. Documentation matches behavior.

---

### O-05 · Medium · Local lockout state is integrity-unprotected

**Evidence/Reason:** `auth.ts` stores fail count and lockout timestamp in `localStorage`, which an attacker with browser profile access can silently reset by editing storage directly. This means the lockout is a UI delay, not a cryptographic guarantee.

**Implementation instruction:** Move lockout state to IndexedDB to make it marginally harder to reset without knowing the storage key structure. However, acknowledge that any attacker with local device access can clear browser storage regardless of where the state lives. The primary defense is password strength and PBKDF2 KDF cost (600 k iterations). **Document this explicitly in the security model:** "Lockout enforces a UI-layer delay. An attacker with direct device access and browser profile access can clear lockout state; the primary brute-force defense is the cost of PBKDF2 at 600,000 iterations, which makes each guess take approximately 100 ms on modern hardware." Do not overclaim tamper-resistance for the lockout counter. If future builds run as a signed packaged app (Electron, Tauri, or similar), re-evaluate with a platform-native secure counter.

**Acceptance criteria:** Lockout state is in IDB (not localStorage). Security documentation accurately describes its limitation. A note in Settings explains the session and lockout behavior.

---

### O-06 · Medium · Session key persistence policy has no user control

**Evidence/Reason:** `session.ts` stores a non-extractable `CryptoKey` in IDB with a `sessionStorage` sentinel. This is refresh-friendly but provides no user-configurable security posture.

**Implementation instruction:** Add an explicit security setting: "Require password on browser refresh / Clear key on idle after N minutes / Clear key on tab close." Provide clear defaults appropriate for the target use case (OT workstation vs. personal laptop). Enforce the selected policy in the session module. The current design is acceptable as a default but must be configurable.

**Acceptance criteria:** Security settings page explains session boundary behavior. Selected policy is enforced. Audit event is created when session key is cleared by policy.

---

### O-07 · Medium · File integrity check is skipped on `file://` protocol

**Evidence/Reason:** `SECURITY.md` states the integrity check skips on `file://` due to browser fetch restrictions, which is the primary deployment protocol for the offline build.

**Implementation instruction:** Produce a `SHA256SUMS` file and a detached signature as part of every release. Document the verification procedure for users and administrators. Optionally, display the build commit SHA and build timestamp in the app's About/Settings page so users can verify against release notes without a network check. For higher-assurance deployments, consider code-signing the artifact using a platform-specific mechanism (e.g., Authenticode on Windows).

**Acceptance criteria:** Every release has a `SHA256SUMS` file and a detached signature or equivalent. The app displays build metadata (commit SHA, build timestamp, profile) in Settings/About.

---

### O-08 · Medium · Accessibility not validated

**Evidence/Reason:** No WCAG 2.2 AA audit evidence was found. The UI uses custom controls, modals, icon-only buttons, rich-text editors, and data tables — all high-risk areas for accessibility failures.

**Implementation instruction:** Run a WCAG 2.2 AA test plan covering: keyboard-only navigation for all primary workflows (create, edit, delete, export), modal focus trapping and restoration, icon button accessible names, form label associations, color contrast (4.5:1 for normal text, 3:1 for large text), screen reader announcement of dynamic content changes, and editor semantics. Fix findings before claiming enterprise or public-sector suitability. Produce an accessibility statement documenting known limitations.

**Acceptance criteria:** Primary workflows (create client, create task, export backup, view audit log) are completable by keyboard only. Screen reader announces modal open/close and status changes. Documented accessibility statement exists.

---

### O-09 · Medium · Audit log is locally mutable — documentation must be accurate

**Evidence/Reason:** `audit.ts` stores encrypted audit in the local documents store and allows purge/export. The device owner can clear or reset it.

**Implementation instruction:** For the offline build, label the audit log in all documentation as "user-local activity history." Do not describe it as a compliance-grade tamper-proof audit log. Add an optional write-once export feature that signs the export with a timestamp and user identifier so external parties can verify export integrity. Document in the security model that the device owner controls audit data.

**Acceptance criteria:** All documentation accurately describes the audit log's limitations. Export can optionally be signed. Settings page shows audit log size and last export date.

---

### O-10 · Medium · Plain JSON export can expose sensitive data without adequate warning

**Evidence/Reason:** `vault.ts` supports `exportJSON` and `importJSON`. A plaintext JSON export of all CRM data represents a serious data spill risk if done accidentally.

**Implementation instruction:** Require re-authentication before any plaintext export. Display a prominent, explicit warning: "This will export your data as unencrypted JSON. Anyone with this file can read all your data." Default the export dialog to encrypted backup, not JSON. Watermark the exported filename with the date, time, and a warning prefix (e.g., `PLAINTEXT-EXPORT-2026-05-19.json`). Add an optional build flag to disable JSON export entirely for high-security deployments.

**Acceptance criteria:** No plaintext export without explicit re-authentication and two-step confirmation. Encrypted backup is the default export path.

---

### O-11 · Medium · No release hardening evidence

**Evidence/Reason:** `package.json` has build/typecheck scripts, but no signing, SBOM, scanning, or provenance evidence was observed.

**Implementation instruction:** Create a release pipeline that runs in sequence: typecheck → unit tests → SAST (Semgrep or equivalent) → SCA (`pnpm audit` + Snyk/Socket) → secret scan (Gitleaks) → license scan → SBOM generation (CycloneDX or SPDX) → build offline profile → generate CSP → generate `SHA256SUMS` → sign artifact → produce release notes. Store SBOM and scan outputs as release artifacts. Display build metadata (version, commit SHA, build date, profile) in the app.

**Acceptance criteria:** Every offline release has a signed `SHA256SUMS`, SBOM, dependency scan report, and release notes. CI blocks release on critical SAST/SCA findings unless risk-accepted in writing.

---

### O-12 · Medium · AI offline claim must be profile-exact

**Evidence/Reason:** The OT-only policy allows the browser tier, and documentation mentions browser built-in AI and localhost entries, but the shipped artifact does not make the profile boundary explicit to the user at runtime.

**Implementation instruction:** Define and enforce three explicit offline profiles at build time: `offline-no-ai`, `offline-browser-ai`, and `offline-internal-ai`. Each profile must have a separate Vite build config, separate CSP/connect-src, and a distinct UI label visible in Settings/About. The label must show the profile name, allowed endpoints, and whether cloud AI, public endpoints, and plaintext JSON export are enabled.

**Acceptance criteria:** Settings/About displays profile name and allowed network endpoints. A user opening the app can determine its exact AI/network posture without reading documentation.

---

### O-13 · Low · `style-src unsafe-inline` is accepted but should be tracked

**Evidence/Reason:** Offline CSP uses `unsafe-inline` for `style-src` due to inline style attributes throughout the codebase.

**Implementation instruction:** Accept `unsafe-inline` for `style-src` in the current local-app threat model where inline JavaScript is already blocked by hashes. Document this as a known accepted risk in the security model. Create a long-term roadmap item to move inline styles to CSS classes, which would allow removing `unsafe-inline` from `style-src` and further harden the CSP.

**Acceptance criteria:** Accepted risk is documented. A backlog item tracks inline style migration.

---

### O-14 · Low · Data retention and deletion policy is missing user-facing documentation

**Evidence/Reason:** Import blocks `trash`/`notifications` for GDPR/internal reasons, but no user-facing documentation explains what data is stored, where, how to delete it, or the implications of backup deletion.

**Implementation instruction:** Add a privacy/storage page (accessible from Settings) documenting: every data category stored, the exact storage location (IndexedDB database name/store name), which data is encrypted and which is not, how to delete/reset/export each category, and what happens to data when the user clears browser storage. This page should match the actual storage architecture in `constants.ts` and `db.ts`.

**Acceptance criteria:** Privacy/storage page exists, is accurate, and reflects the current storage architecture. A developer reviewing the page against `constants.ts` finds no discrepancies.

---

### O-15 · Low · `Permissions-Policy` header coverage should be explicitly audited _(added)_

**Evidence/Reason:** The offline CSP template includes a `Permissions-Policy` directive, but no evidence was found of an explicit audit of which browser features are allowed or denied. For an offline CRM that accesses the filesystem and camera (file picker) but should not access geolocation, payment APIs, USB, serial ports, or Bluetooth, an over-permissive `Permissions-Policy` could allow feature fingerprinting or unexpected capability access.

**Implementation instruction:** Audit the current `Permissions-Policy` against the OWASP Secure Headers Project recommendations and the W3C Permissions Policy specification. For the offline profile, apply a deny-by-default posture and explicitly allow only the features the app actually uses: `camera` (if file/image upload is implemented), `clipboard-read`, `clipboard-write`. Explicitly deny: `geolocation`, `payment`, `usb`, `serial`, `bluetooth`, `midi`, `magnetometer`, `gyroscope`, `accelerometer`. Document allowed features and the rationale in the security model.

**Acceptance criteria:** `Permissions-Policy` header in the built artifact is audited and documented. Only explicitly required browser features are allowed. Audit result is stored in the security model documentation.

---

## Offline Build Profiles

| Profile               | Purpose                                      | Allowed capabilities                                                                               | Must be removed / blocked                                                                                | Acceptance test                                                                                                                 |
| --------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `offline-no-ai`       | Maximum-security local vault.                | Local CRM, encrypted vault, encrypted backups, local audit, import/export.                         | All AI provider code, all `connect-src` except `self` if needed, model download logic, API key UI.       | Built artifact contains no AI cloud endpoints, no model download URLs, no network calls beyond same-origin integrity if served. |
| `offline-browser-ai`  | Local browser built-in AI only.              | Browser built-in AI where available; no user data leaves device during inference.                  | Cloud AI, Ollama/public endpoints, external model downloads unless explicitly needed by browser feature. | AI settings only show supported browser-native option; profile label visible; no cloud key UI.                                  |
| `offline-internal-ai` | Local/internal AI server for OT/private LAN. | Allow `localhost`/private/internal origins explicitly added at build time via `OT_AI_CONNECT_SRC`. | Public endpoint entry by users; cloud provider keys; arbitrary model pulls if prohibited by site policy. | Endpoint validation rejects public hosts; CSP includes only approved origins; admin docs list allowed endpoints.                |

---

## Offline Production Implementation Roadmap

| Phase                                  | Implementation steps                                                                                                                                                             | Evidence / output                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **1 — Artifact hardening**             | Split `no-ai`/`browser-ai`/`internal-ai` profiles; add build aliases/stubs; add artifact grep tests; verify CSP after build; remove unsupported UI per profile.                  | Profile-specific `dist/` outputs, CSP diff, forbidden-string scan report.                 |
| **2 — XSS hardening**                  | Remove global raw Trusted Types route; replace dangerous `innerHTML` paths; expand DOMPurify tests; test malicious import payloads, document HTML, file names, AI output.        | XSS test suite, updated renderer utilities, passing ASVS injection/sanitization evidence. |
| **3 — Backup reliability**             | Add backup wizard, restore test, backup health indicator, encrypted backup default, plaintext export warning, recovery guide.                                                    | Backup/restore test cases, user guide, restore dry-run result.                            |
| **4 — Auth policy**                    | Raise password minimum to 15 characters, add strength meter/guidance, TOTP recovery codes, configurable session key behavior, sensitive-operation reauth, lockout documentation. | Auth test results, updated security settings, security model documentation.               |
| **5 — Release process**                | CI security gates (SAST, SCA, secret scan), SBOM, dependency/license scan, signed `SHA256SUMS`, release notes, versioned build metadata visible in app.                          | Release evidence folder, signed artifacts, SBOM.                                          |
| **6 — Accessibility and privacy docs** | WCAG 2.2 AA audit and fixes; `Permissions-Policy` audit; privacy/storage/retention docs; known-limitations statement; recovery documentation.                                    | Accessibility statement, `Permissions-Policy` audit report, privacy/storage guide.        |

---

## Definition of Done

- The delivered artifact clearly identifies its profile and allowed network/AI behavior in the Settings/About page.
- Forbidden network endpoints and provider code are absent from the `no-ai` artifact or explicitly documented and verified unreachable by CI artifact scan.
- Every stored/rendered rich-text path passes through controlled sanitization; user strings are not auto-trusted through a raw Trusted Types policy.
- Users are required to complete a backup wizard on first run and can perform a restore dry-run without data loss.
- The release has signed checksums, SBOM, dependency scan, and a change log.
- Password minimum is enforced at 15 characters with a local strength meter.
- `Permissions-Policy` is audited and documented; only required browser features are permitted.
- The app does not claim SOC 2, FedRAMP, FIPS, or enterprise zero trust unless those separate conditions are met.

---

## Source Materials Used

| Source                        | How used                                                                                                                               | URL                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| OWASP ASVS 5.0.0              | Application-security verification baseline for web applications; technical acceptance criteria and security testing.                   | https://owasp.org/www-project-application-security-verification-standard/                           |
| NIST SP 800-207               | Zero Trust Architecture definition and enterprise ZTA model.                                                                           | https://csrc.nist.gov/pubs/sp/800/207/final                                                         |
| NIST SP 800-63B-4             | Authentication and authenticator management guidance, including MFA/password/passkey expectations.                                     | https://csrc.nist.gov/pubs/sp/800/63/b/4/final                                                      |
| NIST SP 800-218 SSDF          | Secure Software Development Framework for software supply-chain and vulnerability reduction practices.                                 | https://csrc.nist.gov/pubs/sp/800/218/final                                                         |
| NIST SP 800-53 Rev. 5         | Security and privacy control catalog used by FedRAMP and federal control mapping.                                                      | https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final                                                  |
| FedRAMP 20x                   | Automation-first cloud authorization direction and Key Security Indicator model.                                                       | https://www.fedramp.gov/20x/                                                                        |
| ISO/IEC 27001:2022            | Information security management system certification standard.                                                                         | https://www.iso.org/standard/27001                                                                  |
| ISO/IEC 27701:2025            | Privacy information management system standard.                                                                                        | https://www.iso.org/standard/27701                                                                  |
| ISO/IEC 42001:2023            | AI management system standard.                                                                                                         | https://www.iso.org/standard/42001                                                                  |
| SOC 2 / AICPA                 | Assurance reporting over service-organization controls for security, availability, confidentiality, processing integrity, and privacy. | https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services |
| WCAG 2.2                      | Current W3C web accessibility recommendation for AA conformance and VPAT evidence.                                                     | https://www.w3.org/TR/WCAG22/                                                                       |
| OWASP Secure Headers Project  | `Permissions-Policy` and HTTP security header recommendations.                                                                         | https://owasp.org/www-project-secure-headers/                                                       |
| W3C Permissions Policy        | Browser feature permission policy specification.                                                                                       | https://www.w3.org/TR/permissions-policy/                                                           |
| CSA Cloud Controls Matrix 4.1 | Cloud security control framework and STAR assessment basis.                                                                            | https://cloudsecurityalliance.org/research/cloud-controls-matrix                                    |

---

## Repository Evidence Reviewed

| Evidence area            | Path                                                 | What it proves                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo / build scripts | `package.json`                                       | Defines `build:offline`, `build:sync`, `build:dataverse`, `build:all`, and `typecheck`. Offline build runs Vite then `generate-csp.mjs`.                                           |
| Offline entry            | `apps/offline/src/entry.ts`                          | Sets `OT_ONLY_DEPLOYMENT_POLICY`, adds allowed CSP connect sources from `__OT_AI_CONNECT_SRC__`, sets `NullAdapter`, and calls `init()`.                                           |
| Offline CSP template     | `apps/offline/index.html`                            | CSP template uses `default-src none`, script hashes, `style unsafe-inline`, `data`/`blob` images, `worker-src blob`, Trusted Types, and restrictive referrer/permissions policies. |
| Deployment policy        | `packages/core/src/deployment-policy.ts`             | Defines AI tiers `browser`/`ollama`/`cloud`. OT-only policy allows `browser` tier only and blocks public endpoints.                                                                |
| Sync adapter interface   | `packages/core/src/adapter-interface.ts`             | Pull/push/stream/clear interface exists; default implementation returns empty results.                                                                                             |
| RxDB adapter             | `packages/adapter-rxdb/src/index.ts`                 | Adapter class exists but is TODO stub.                                                                                                                                             |
| Dataverse adapter        | `packages/adapter-dataverse/src/index.ts`            | Adapter class exists but is TODO stub.                                                                                                                                             |
| Crypto                   | `packages/core/src/crypto.ts` and `constants.ts`     | AES-GCM, PBKDF2-HMAC-SHA-256, 600,000 iterations, 32-byte salt, 12-byte IV, non-extractable `CryptoKey`.                                                                           |
| Vault and backup         | `packages/core/src/vault.ts`                         | Encrypted vault load/save, KDF migration, password change, encrypted backup import/export, JSON import validation.                                                                 |
| Session key              | `packages/core/src/session.ts`                       | Non-extractable `CryptoKey` stored in IndexedDB with `sessionStorage` sentinel; clears on explicit logout/tab-close boundary.                                                      |
| Authentication           | `packages/core/src/auth.ts`                          | Master password unlock, file vault import, lockout state in localStorage, TOTP step after password verification.                                                                   |
| TOTP / passkeys          | `packages/core/src/totp.ts`, `mfa.ts`, `webauthn.ts` | TOTP modules exist; WebAuthn PRF passkeys require secure context and are not available on `file://`.                                                                               |
| Audit log                | `packages/core/src/audit.ts`                         | Encrypted local audit log records auth, MFA, passkeys, locks, vault, backup, import/export, app reset, AI key, and AI query events.                                                |
| Sanitization             | `packages/core/src/sanitize.ts`                      | DOMPurify allowlist for stored/AI-generated rich text, links, and data URLs.                                                                                                       |
| Trusted Types            | `packages/core/src/trusted-types.ts`                 | Creates `nexus-crm` and `nexus-crm-raw` policies and monkey-patches `innerHTML`/`outerHTML` setters to pass strings through raw policy.                                            |
| Mobile roadmap           | `MOBILE-ROADMAP.md`                                  | Describes Capacitor native wrapper and mobile AI plan; notes File System Access API is not available in Capacitor WebView.                                                         |

---

## Appendix A — Offline Build Implementation Guide

Treat offline as three explicit profiles: `offline-no-ai`, `offline-browser-ai`, and `offline-internal-ai`. Do not ship one profile that can silently become another through `localStorage` or hidden runtime flags. Use build-time feature removal, not only runtime disabling.

Any cloud provider module, API key UI, public endpoint UI, and model download logic must be aliased to empty stubs in `no-ai` and `browser-ai` profiles. The Vite config already does this for cloud providers — apply the same pattern to any future provider additions.

The Settings/About page must display: exact profile name, build timestamp, commit SHA, CSP `connect-src` list, and whether cloud AI, public endpoints, and plaintext JSON export are enabled.

Each offline release artifact set must include:

```
dist/offline/index.html          — built single-file app
dist/offline/index.sha256        — SHA-256 hash of the built file
dist/offline/index.html.sig      — detached signature (GPG or Sigstore/Cosign)
dist/offline/sbom.cdx.json       — CycloneDX SBOM
dist/offline/scan-report.txt     — dependency and license scan summary
dist/offline/release-notes.md    — version, profile, changes, known issues
```

Suggested CI checks after every build:

```
pnpm run typecheck
pnpm test
pnpm audit
semgrep --config=auto packages/ apps/offline/
gitleaks detect --source .
pnpm run build:offline
node generate-csp.mjs
grep -E "api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com" dist/offline/index.html && exit 1 || true
cyclonedx-npm --output-file dist/offline/sbom.cdx.json
sha256sum dist/offline/index.html > dist/offline/index.sha256
cosign sign-blob dist/offline/index.html --output-signature dist/offline/index.html.sig
```

---

## Appendix B — Offline Remediation Checklist

| Priority | Task                         | Implementation detail                                                                                                                                   | Acceptance criteria                                                                      |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **P0**   | Artifact profile enforcement | Create per-profile Vite configs and build constants; alias cloud providers to empty modules in `no-ai`; fail CI if forbidden strings appear.            | Forbidden string scan passes; profile UI accurately reports capabilities.                |
| **P0**   | Trusted Types / XSS refactor | Replace global raw HTML setter with explicit safe renderer; use DOM APIs/`textContent` for user values; sanitize only rich HTML paths.                  | Malicious import/name/document/AI payload tests pass.                                    |
| **P0**   | Backup wizard                | First run requires user to configure encrypted backup or explicitly acknowledge risk; show last backup and restore-test button.                         | User can complete restore dry-run without overwriting current vault.                     |
| **P0**   | Password policy              | Raise minimum to 15 characters or strong passphrase guidance; add local strength meter; warn about no recovery; document lockout limitation accurately. | Weak passwords blocked or strongly warned; docs match behavior; lockout not overclaimed. |
| **P1**   | Release signing              | Generate signed `SHA256SUMS` and SBOM; show build metadata in app.                                                                                      | User/admin can verify artifact before deployment.                                        |
| **P1**   | Plaintext export governance  | Default to encrypted backup; require reauth and explicit warning for JSON; optional no-JSON build flag.                                                 | No plaintext export without explicit confirmation and reauth.                            |
| **P1**   | Offline AI proof             | Profile-specific CSP and endpoint validation; Settings shows allowed endpoints; disable UI for unavailable tiers.                                       | No cloud calls possible in `no-ai`/`browser-ai` profile.                                 |
| **P1**   | `Permissions-Policy` audit   | Audit current header against OWASP Secure Headers Project; deny all non-required features; document findings.                                           | Only required browser features are permitted; audit documented.                          |
| **P2**   | Inline style cleanup         | Move inline styles to CSS classes over time.                                                                                                            | Future CSP can remove `style-src unsafe-inline`.                                         |
| **P2**   | Accessibility                | WCAG 2.2 AA audit and fixes; produce accessibility statement.                                                                                           | Primary keyboard-only and screen-reader workflows pass.                                  |

---

## Appendix C — Offline Test Plan

| Test area                | Test cases                                                                                                                      | Expected result                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Build / profile**      | Inspect built artifact for cloud endpoints, model URLs, API key UI, forbidden tier strings per profile.                         | No forbidden content in `no-ai`; only approved strings in other profiles.            |
| **CSP**                  | Load app and attempt inline script injection, external script load, external image/link, forbidden `connect-src` endpoint.      | CSP blocks scripts/connections according to profile.                                 |
| **Vault crypto**         | Create vault, wrong password, correct password, password change, KDF migration from 310k to 600k, corrupt vault.                | Wrong password fails; corrupt vault does not overwrite data; migration succeeds.     |
| **Backup / restore**     | Encrypted backup export/import, wrong backup password, restore dry-run, old KDF backup.                                         | Correct restore works; wrong password fails; dry-run does not mutate vault.          |
| **Import validation**    | Unknown store, blocked trash/notifications import, non-array store, malicious URLs/data URLs in import payload.                 | Invalid imports rejected; dangerous URLs stripped.                                   |
| **XSS**                  | Malicious client/project/task names, document HTML, AI output, file name, URL, backup import with script payloads.              | No script execution; unsafe HTML escaped/sanitized.                                  |
| **Auth / MFA**           | Weak password (below 15 chars), wrong-attempt lockout, TOTP success/fail, passkey hidden on `file://`, sensitive export reauth. | Behaves as documented; audit events created; lockout behavior matches documentation. |
| **Audit**                | Auth, export, import, password change, AI query, app reset.                                                                     | Events recorded locally; export works; docs state local audit limitation clearly.    |
| **Storage loss**         | Clear browser site data/profile; import backup; open vault file.                                                                | User can recover only if backup exists; docs and warnings make this clear.           |
| **Accessibility**        | Keyboard-only create/edit/delete/export; modal focus; screen reader labels; color contrast check.                               | Primary workflows usable without mouse; contrast meets WCAG 2.2 AA.                  |
| **`Permissions-Policy`** | Attempt to use denied features (geolocation, payment, USB) from within the app context.                                         | Denied features are blocked by the Permissions-Policy header.                        |

---

## Appendix D — Offline Documentation Set to Create

| Document                     | Required content                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Security model**           | Threat model, in-scope/out-of-scope, encryption design, limitations, password risk, session key behavior, lockout limitation, backup risk, audit limitation, `Permissions-Policy` coverage.                                       |
| **User recovery guide**      | Forgotten password is unrecoverable, backup restore steps, corrupt vault response, browser storage clearing risk, restore dry-run procedure.                                                                                      |
| **Deployment guide**         | Which artifact to use, how to verify checksum/signature, supported browsers, profile differences (no-ai / browser-ai / internal-ai), known unsupported features (passkeys on `file://`, File System Access API Chrome/Edge only). |
| **Privacy / storage notice** | Exact data stored, exact storage locations (IndexedDB DB names and store names), what is encrypted, what is not, how to delete/reset/export, no telemetry claim if true.                                                          |
| **Release notes**            | Version, commit SHA, build profile, dependencies, security changes, known issues, migration notes.                                                                                                                                |
| **Accessibility statement**  | Tested workflows, known limitations, how to report accessibility issues, WCAG 2.2 AA conformance claim or partial claim.                                                                                                          |
