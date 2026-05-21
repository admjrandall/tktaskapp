# Task App CRM — File Structure and Development Best Practices

_Implementation-focused recommendations for Offline, Mobile, Dataverse, and Enterprise build profiles_

_Prepared: 2026-05-19 · Revised against enterprise production assessment_

| **Topic**              | **Recommendation**                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assessment stance      | The current monorepo direction is good, but product-profile boundaries need to become explicit and enforceable, and the enterprise path requires architectural elements that are entirely absent from the codebase today.                        |
| Primary recommendation | Keep apps thin, move durable logic into packages, create formal build profiles, add adapter and policy-engine contract tests, add security/build/GDPR gates, instrument OpenTelemetry from day one.                                              |
| Near-term priority     | Do not restructure everything at once. First clarify offline sub-profiles, add forbidden-content bundle tests, introduce schemas/migrations, and establish the GDPR crypto-shredding architecture before any enterprise customer data is stored. |

---

# 1. Executive Summary

The current Task App CRM repository has already moved in the correct direction by using a pnpm monorepo with apps and packages. The next maturity step is not simply creating more folders. It is making the repository communicate real product boundaries — **Offline**, **Mobile**, **Dataverse**, and **Enterprise** — where each build profile selects storage, identity, AI, CSP, adapter, GDPR architecture, observability, and release behaviour at build time.

The offline app entry is already the correct pattern: thin, explicit, and profile-driven. However the enterprise direction requires a fundamentally different architecture, not just more adapters and backend routes. Enterprise requires:

- A server-side system of record (not IndexedDB)
- Per-user KMS-managed encryption keys for GDPR crypto-shredding
- OIDC with PKCE as the only identity mechanism (no implicit flow)
- A centralized policy engine (OPA or Cedar) for authorization
- OpenTelemetry instrumentation from day one for SOC 2 evidence
- SLSA Level 2+ provenance and Sigstore/Cosign artifact signing
- ISO 42001:2023 AI governance before cloud AI is offered to enterprise customers

Offline and enterprise are **two distinct products** that share UI and domain code, not a spectrum. Treating them as a slider produces an architecture that serves neither well.

| **Area**        | **Current direction**                                                   | **Recommended change**                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apps            | `apps/offline`, `apps/sync`, `apps/dataverse` exist.                    | Rename/split `apps/sync`. Define three offline sub-profiles (`no-ai`, `browser-ai`, `internal-ai`). Add `apps/mobile` only when Capacitor implementation exists. |
| Core            | Core mixes domain, UI, storage, AI, auth, and utilities.                | Split into `domain`, `application`, `security`, `storage`, `platform`, `ai`, `ui`, `views`, `schemas`, and `migrations`.                                         |
| Adapters        | Interface exists; NullAdapter works; RxDB and Dataverse are TODO stubs. | Keep flat package naming (`packages/adapter-null/`, `packages/adapter-kms/`). Add contract tests. Add KMS adapter for per-user key management.                   |
| Config          | Profile behaviour lives in Vite configs and `deployment-policy.ts`.     | Create a root `config/` folder (not a separate workspace package). Import profile constants via TypeScript path alias.                                           |
| Security        | Crypto, vault, session, audit, sanitization, and Trusted Types exist.   | Keep in `security/` layer. Replace global raw Trusted Types policy with explicit render helpers.                                                                 |
| Identity        | Local password/TOTP/passkey only.                                       | Enterprise: OIDC with PKCE mandatory. No implicit flow. DPoP roadmap item for high-assurance.                                                                    |
| Authorization   | No enterprise authorization layer.                                      | OPA or Cedar policy engine. Deny-by-default. Object-level enforcement. BOLA/IDOR test suite.                                                                     |
| GDPR            | Single vault blob. No per-user key architecture.                        | Per-user DEK wrapped by KMS-managed KEK. Key destruction = GDPR Article 17 erasure.                                                                              |
| Observability   | None.                                                                   | OpenTelemetry (traces, metrics, logs) in every service from day one. SLO definitions. SIEM export.                                                               |
| Build integrity | Typecheck + build exists. No provenance.                                | SLSA Level 2 minimum, Level 3 for enterprise. Sigstore/Cosign keyless signing. SBOM every release.                                                               |
| Testing         | Typecheck and build scripts exist.                                      | Add unit, integration, security (BOLA/IDOR, XSS, GDPR erasure, AI prompt injection), accessibility, migration, adapter, and build-profile gates.                 |
| Accessibility   | Not mentioned.                                                          | WCAG 2.2 AA required for enterprise procurement. Axe-core in CI. VPAT before enterprise pilot.                                                                   |
| AI governance   | AI runtime exists; no governance.                                       | ISO 42001:2023 alignment. Model inventory. Tenant policy engine. Prompt injection tests. Human approval for write actions.                                       |

---

# 2. Current Repository State

The repository is already organized as a pnpm workspace with packages under `packages/*` and apps under `apps/*`. The workspace file uses `allowBuilds` (pnpm v11 format) to control which dependency build scripts are permitted.

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
allowBuilds:
  esbuild: false
  onnxruntime-node: false
  protobufjs: false
  sharp: false
```

## 2.1 What is already good

- The repository is no longer a single large HTML file; it is evolving into a TypeScript monorepo.
- The offline app entry is thin and explicit: it sets policy, selects the NullAdapter, then calls `init()`.
- The offline Vite config performs build-time provider disabling by aliasing unsupported providers to disabled stubs.
- The adapter interface creates a natural seam for offline, sync, mobile, Dataverse, and enterprise backends.
- Security modules (crypto, vault, session, auth, audit, MFA, WebAuthn, Trusted Types, sanitization) are separated into individual files.
- PBKDF2 at 600,000 iterations and AES-256-GCM meet the OWASP 2026 recommendation.
- The local audit log event taxonomy is rich and reusable as the basis for a server-side audit schema.

## 2.2 What is still weak

- `apps/sync` is too vague — not clearly a PWA, local sync, enterprise web build, or future RxDB build.
- RxDB and Dataverse adapters are stubs, implying capabilities that are not implemented.
- Mobile exists only in roadmap documentation; `apps/mobile/capacitor.config.ts` does not exist.
- Core still mixes domain logic, UI rendering, storage, app state, AI runtime, and security — manageable now but will break down as Enterprise and Mobile mature.
- Schema validation and migration structure are not first-class before real user data accumulates.
- The global Trusted Types raw policy weakens XSS defence — a blocking risk for enterprise deployment.
- **No GDPR crypto-shredding architecture.** A single encrypted vault blob means GDPR Article 17 (right to erasure) cannot be satisfied for enterprise. The EDPB made this an enforcement priority in 2026.
- **No observability.** No OpenTelemetry instrumentation, no SLO definitions, no SIEM export path — SOC 2 Availability evidence cannot be produced.
- **No policy-as-code.** RBAC/ABAC hardcoded into route handlers does not scale and cannot be audited.
- **No WCAG 2.2 AA evidence.** Accessibility blocks enterprise and public-sector procurement.
- **No AI governance.** ISO 42001:2023 is increasingly required by enterprise procurement for products with AI features.

---

# 3. Target Repository Structure

The target structure makes product boundaries, trust boundaries, and compliance boundaries visible. A developer opening the repo must immediately understand which code is shared, which is build-profile-specific, which is platform-specific, and which is enterprise/server-only.

```
tktaskapp/
├── turbo.json                    ← Turborepo task pipeline (build, test, typecheck, lint)
├── tsconfig.base.json            ← shared TypeScript compiler options; extended by all packages
├── eslint.config.mjs             ← ESLint v9 flat config; shared rules + per-package overrides
├── prettier.config.mjs           ← Prettier formatting rules
├── .editorconfig                 ← editor-agnostic whitespace and line-ending rules
├── .nvmrc                        ← Node.js version pin (matches CI node version)
├── renovate.json                 ← automated dependency update configuration
├── .changeset/                   ← Changesets release records (managed by pnpm changeset)
├── .husky/                       ← pre-commit, commit-msg, pre-push hooks
├── Dockerfile                    ← enterprise server container (create when server/ is created)
├── docker-compose.yml            ← local enterprise dev stack (server + postgres + otel-collector)
├── CONTRIBUTING.md               ← setup steps, commit conventions (Conventional Commits), PR process
├── SECURITY.md                   ← vulnerability disclosure process and security policy
├── LICENSE
│
├── apps/
│   ├── offline-web/             ← thin: sets offline profile + NullAdapter + init()
│   ├── enterprise-web/          ← thin: sets enterprise profile + EnterpriseApiAdapter + init()
│   ├── mobile/                  ← thin: sets mobile profile + MobileVaultAdapter + init()
│   └── dataverse/               ← thin: sets dataverse profile + DataverseAdapter + init()
│
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── domain/          ← pure types and business rules; no DOM, no IDB, no AI
│   │       ├── application/     ← use cases; no raw DOM or storage-specific logic
│   │       ├── security/        ← crypto, vault, session, auth, MFA, TOTP, WebAuthn, audit, sanitize, trusted-types
│   │       ├── storage/         ← store interfaces, migration runner, vault store, document store, backup store
│   │       ├── platform/        ← storage-adapter.ts (interface), browser-vault-storage.ts, mobile-vault-storage.ts, native-security.ts, native-backup.ts, managed-config.ts
│   │       ├── ai/              ← ai-runtime, ai-tools, ai-settings, ai-ui, deployment-policy, providers/
│   │       ├── ui/              ← reusable components, render helpers, icons, layout, modal helpers
│   │       ├── views/           ← screen-specific render+bind files
│   │       ├── schemas/         ← Valibot runtime schemas for all record types, import payloads, AI tool inputs
│   │       ├── migrations/      ← vault/data/schema migration files + migration-runner.ts
│   │       └── main.ts
│   │
│   ├── adapter-null/            ← NullAdapter (no-op; offline production)
│   ├── adapter-browser-vault/   ← BrowserVaultStorage (encrypted IDB + File System Access API)
│   ├── adapter-mobile-native/   ← MobileVaultAdapter (Capacitor native filesystem)
│   ├── adapter-rxdb/            ← RxDBAdapter (local/PWA sync — implement only if real)
│   ├── adapter-dataverse/       ← DataverseAdapter (Power Platform)
│   ├── adapter-enterprise-api/  ← EnterpriseApiAdapter (backend API with OIDC/PKCE session)
│   └── adapter-kms/             ← KMS abstraction (Azure Key Vault / AWS KMS / HashiCorp Vault); per-user key lifecycle, DSAR erasure workflow
│
├── config/                      ← root-level folder; NOT a separate pnpm workspace package
│   ├── build-profiles/
│   │   ├── offline-no-ai.profile.ts
│   │   ├── offline-browser-ai.profile.ts
│   │   ├── offline-internal-ai.profile.ts
│   │   ├── mobile-offline.profile.ts
│   │   ├── enterprise.profile.ts
│   │   └── dataverse.profile.ts
│   ├── csp/
│   └── vite/
│       └── base.config.ts
│
├── server/                      ← create only when enterprise API work begins
│   └── src/
│       ├── api/                 ← resource routes (OpenAPI-spec-first)
│       ├── auth/                ← OIDC (PKCE mandatory), SAML, SCIM, session, step-up
│       ├── authorization/       ← OPA or Cedar policy engine integration; deny-by-default PDP/PEP
│       ├── tenant/              ← tenant context resolver, tenant guard, cross-tenant isolation tests
│       ├── kms/                 ← per-user DEK lifecycle, KMS key destruction (GDPR erasure), legal hold, DSAR workflow
│       ├── audit/               ← append-only audit event ingestion, SIEM export, tamper-evident storage
│       ├── files/               ← upload scanning, type/size allowlist, signed URLs, DLP hooks, retention
│       ├── ai-gateway/          ← tenant policy engine, provider/model allowlist, data minimisation, redaction, prompt-injection defence, AI audit log
│       ├── observability/       ← OpenTelemetry SDK init, request tracing middleware, RED metrics, SLO definitions
│       └── db/
│           ├── schema/
│           └── migrations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   │   ├── xss-import.test.ts
│   │   ├── xss-document-editor.test.ts
│   │   ├── xss-ai-output.test.ts
│   │   ├── bola-idor.test.ts              ← every API endpoint; cross-tenant + cross-user object access
│   │   ├── csp-offline.test.ts
│   │   ├── permissions-policy.test.ts
│   │   ├── offline-bundle-forbidden-strings.test.ts
│   │   ├── crypto-vault-roundtrip.test.ts
│   │   ├── backup-restore-corruption.test.ts
│   │   ├── gdpr-erasure.test.ts           ← key destruction → backup unreadability → DSAR evidence
│   │   └── ai-prompt-injection.test.ts    ← every user-controlled field reaching AI context
│   ├── accessibility/
│   │   ├── keyboard-navigation.test.ts
│   │   ├── modal-focus-trap.test.ts
│   │   └── screen-reader-labels.test.ts
│   ├── migration/
│   │   ├── legacy-kdf-310k-to-600k.test.ts
│   │   └── vault-schema-migration.test.ts
│   ├── build-profiles/
│   │   ├── offline-no-ai-profile.test.ts
│   │   ├── offline-browser-ai-profile.test.ts
│   │   ├── offline-internal-ai-profile.test.ts
│   │   ├── enterprise-profile.test.ts
│   │   └── mobile-profile.test.ts
│   └── supply-chain/
│       ├── slsa-provenance-verify.test.ts ← verify SLSA attestation on built artifact
│       └── dependency-hash.test.ts        ← verify lockfile integrity
│
├── docs/
│   ├── architecture/
│   │   ├── 0001-build-profiles.md
│   │   ├── 0002-storage-model.md
│   │   ├── 0003-ai-policy.md
│   │   ├── 0004-mobile-storage.md
│   │   ├── 0005-enterprise-backend.md
│   │   ├── 0006-gdpr-crypto-shredding.md ← per-user KMS key hierarchy, DSAR workflow, EU DPA legal analysis
│   │   └── 0007-identity-and-authz.md    ← OIDC/PKCE design, OPA/Cedar policy model, BOLA/IDOR controls
│   ├── threat-models/
│   │   ├── offline-threat-model.md
│   │   ├── mobile-threat-model.md
│   │   └── enterprise-threat-model.md
│   ├── compliance/
│   │   ├── asvs-5-mapping.md
│   │   ├── masvs-mapping.md
│   │   ├── ssdf-mapping.md
│   │   ├── soc2-evidence-map.md
│   │   ├── iso27001-evidence-map.md
│   │   ├── iso27701-evidence-map.md      ← GDPR/privacy management
│   │   ├── iso42001-evidence-map.md      ← AI management
│   │   ├── gdpr-erasure-design.md        ← crypto-shredding mechanism and EU DPA legal basis
│   │   ├── ai-governance-policy.md       ← model inventory, data boundary, human approval rules
│   │   └── wcag-vpat.md                  ← WCAG 2.2 AA conformance and VPAT
│   └── runbooks/
│       ├── release-offline.md
│       ├── release-enterprise.md
│       ├── restore-vault.md
│       ├── incident-response.md
│       ├── key-rotation.md
│       └── gdpr-dsar-erasure.md          ← step-by-step DSAR erasure procedure with evidence checklist
│
└── .github/
    ├── CODEOWNERS
    ├── PULL_REQUEST_TEMPLATE.md
    ├── ISSUE_TEMPLATE/
    │   ├── bug_report.md
    │   └── feature_request.md
    └── workflows/
        ├── ci.yml
        ├── security.yml
        ├── codeql.yml            ← GitHub CodeQL analysis (scheduled + PR)
        ├── dependency-review.yml ← block PRs introducing vulnerable dependencies
        ├── accessibility.yml     ← axe-core CI on built artifact
        ├── release-offline.yml
        ├── release-mobile.yml
        └── release-enterprise.yml
```

| **Top-level area**      | **Purpose**                                                                                                | **Rule**                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/`                 | Build-profile entry points only.                                                                           | Apps select policies, adapters, and platform services, then launch shared core. No business logic.                                 |
| `packages/core/`        | Shared CRM, security, UI, and domain logic.                                                                | Must not import concrete app targets or server-only code.                                                                          |
| `packages/adapter-*/`   | Runtime-specific persistence/sync/platform adapters. Flat naming; do not nest under `packages/adapters/`.  | Each adapter implements the interface contract and passes the shared adapter contract test suite.                                  |
| `packages/adapter-kms/` | Per-user KMS key lifecycle.                                                                                | Required before any enterprise customer data is stored. Provides crypto-shredding for GDPR erasure.                                |
| `config/`               | Build profiles, CSP policies, Vite shared config.                                                          | A root folder, **not** a separate pnpm workspace package. Imported via TypeScript path alias.                                      |
| `server/`               | Enterprise backend only.                                                                                   | Do not create until enterprise API work begins. `server/src/kms/` is the GDPR erasure control plane.                               |
| `tests/`                | Cross-package test suites.                                                                                 | Security, BOLA/IDOR, GDPR erasure, AI prompt injection, accessibility, migration, supply chain, and build-profile tests live here. |
| `docs/`                 | Architecture, compliance, and operational evidence.                                                        | Architecture decisions, threat models, compliance mappings, VPAT, GDPR design, AI governance, runbooks.                            |
| `.changeset/`           | Release records for Changesets versioning tool.                                                            | Each PR with a version-worthy change includes a changeset file. Never edit manually — managed by `pnpm changeset`.                 |
| `.husky/`               | Git hook scripts for pre-commit quality gates.                                                             | Run lint-staged, commitlint, and per-changed-package tests before each commit and push.                                            |
| Root config files       | `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs`, `.editorconfig`, `.nvmrc`. | Shared tooling baseline. All packages extend `tsconfig.base.json`. Never duplicate compiler options per-package.                   |

---

# 4. Apps: Keep Entry Points Thin

Apps select a build profile, storage/sync adapter, platform services, and call the shared core `init()`. The offline build has three distinct sub-profiles that must be separate build-time artifacts, not runtime toggles.

```typescript
// apps/offline-web/src/entry-no-ai.ts
setDeploymentPolicy(OFFLINE_NO_AI_PROFILE.policy)
setAdapter(new NullAdapter())
setStorageAdapter(new BrowserVaultStorageAdapter())
init()

// apps/offline-web/src/entry-browser-ai.ts
setDeploymentPolicy(OFFLINE_BROWSER_AI_PROFILE.policy)
setAdapter(new NullAdapter())
setStorageAdapter(new BrowserVaultStorageAdapter())
init()

// apps/offline-web/src/entry-internal-ai.ts
setDeploymentPolicy(OFFLINE_INTERNAL_AI_PROFILE.policy) // OT_AI_CONNECT_SRC injected at build
setAdapter(new NullAdapter())
setStorageAdapter(new BrowserVaultStorageAdapter())
init()

// apps/mobile/src/entry.ts
setDeploymentPolicy(MOBILE_OFFLINE_PROFILE.policy)
setAdapter(new NullAdapter())
setStorageAdapter(new MobileNativeVaultAdapter()) // Capacitor native filesystem
setNativeSecurityAdapter(new NativeBiometricAdapter()) // Keychain/Keystore bound key
init()

// apps/enterprise-web/src/entry.ts
setDeploymentPolicy(ENTERPRISE_PROFILE.policy)
setAdapter(new EnterpriseApiAdapter()) // OIDC/PKCE session, tenant-scoped
setKmsAdapter(new KmsAdapter()) // per-user key management
init()
```

| **App**                     | **Should exist when**                   | **Primary adapter**                         | **Notes**                                                                                  |
| --------------------------- | --------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `offline-web` (no-ai)       | Now.                                    | NullAdapter + BrowserVaultStorage.          | Maximum-security offline; zero AI code in bundle. Separate Vite build.                     |
| `offline-web` (browser-ai)  | Now.                                    | NullAdapter + BrowserVaultStorage.          | Browser built-in AI (Gemini Nano / Phi-4-mini) only; no cloud code.                        |
| `offline-web` (internal-ai) | Now.                                    | NullAdapter + BrowserVaultStorage.          | Private/LAN AI endpoint; `OT_AI_CONNECT_SRC` injected at build; no public cloud.           |
| `enterprise-web`            | When backend API work begins.           | EnterpriseApiAdapter + KmsAdapter.          | Requires OIDC/PKCE, OPA/Cedar, per-user KMS keys, server audit, and admin controls.        |
| `mobile`                    | When Capacitor is actually implemented. | MobileNativeVaultAdapter + NativeBiometric. | Requires `capacitor.config.ts`, iOS ATS, Android NSC, native backup/export, MASVS testing. |
| `dataverse`                 | When DataverseAdapter is implemented.   | DataverseAdapter.                           | Must not claim production while adapter remains a stub.                                    |

---

# 5. Build Profiles: Make Product Behaviour Explicit

Build profiles are formal configuration objects imported by Vite configs and app entry points via TypeScript path alias from the root `config/` folder. They are **not** a separate pnpm workspace package.

```typescript
// config/build-profiles/offline-no-ai.profile.ts
export const OFFLINE_NO_AI_PROFILE = {
  id: 'offline-no-ai',
  displayName: 'Offline Web — No AI',
  allowExternalNetwork: false,
  allowCloudAI: false,
  allowOllama: false,
  allowBrowserNano: false,
  aiMode: 'none' as const,
  adapter: 'null',
  storage: 'browser-vault',
  csp: 'offline-no-ai',
  requireServer: false,
  gdprErasureModel: 'local-password-vault', // single key; erasure = vault delete
  kmsRequired: false,
  accessibilityTarget: 'wcag-2.2-aa',
} as const

// config/build-profiles/offline-browser-ai.profile.ts
export const OFFLINE_BROWSER_AI_PROFILE = {
  id: 'offline-browser-ai',
  displayName: 'Offline Web — Browser AI',
  allowExternalNetwork: false,
  allowCloudAI: false,
  allowOllama: false,
  allowBrowserNano: true,
  aiMode: 'browser' as const,
  adapter: 'null',
  storage: 'browser-vault',
  csp: 'offline-browser-ai',
  requireServer: false,
  gdprErasureModel: 'local-password-vault',
  kmsRequired: false,
  accessibilityTarget: 'wcag-2.2-aa',
} as const

// config/build-profiles/offline-internal-ai.profile.ts
export const OFFLINE_INTERNAL_AI_PROFILE = {
  id: 'offline-internal-ai',
  displayName: 'Offline Web — Internal AI',
  allowExternalNetwork: false, // only OT_AI_CONNECT_SRC origins
  allowCloudAI: false,
  allowOllama: true, // localhost/private only
  allowBrowserNano: true,
  aiMode: 'internal' as const,
  adapter: 'null',
  storage: 'browser-vault',
  csp: 'offline-internal-ai', // OT_AI_CONNECT_SRC injected at build
  requireServer: false,
  gdprErasureModel: 'local-password-vault',
  kmsRequired: false,
  accessibilityTarget: 'wcag-2.2-aa',
} as const

// config/build-profiles/enterprise.profile.ts
export const ENTERPRISE_PROFILE = {
  id: 'enterprise-web',
  displayName: 'Enterprise Web Build',
  allowExternalNetwork: true,
  allowCloudAI: 'policy-controlled' as const, // tenant admin gate; AI gateway enforces
  adapter: 'enterprise-api',
  storage: 'server-authoritative',
  csp: 'enterprise-server-header', // headers set by server/CDN; not <meta> tag
  requireServer: true,
  gdprErasureModel: 'kms-crypto-shredding', // per-user DEK; key destruction = Article 17 erasure
  kmsRequired: true,
  oidcPkceRequired: true, // PKCE mandatory; implicit flow prohibited (RFC 9700)
  authzEngine: 'opa-or-cedar', // centralized policy engine; deny-by-default
  observability: 'opentelemetry', // OTel from day one; required for SOC 2 evidence
  accessibilityTarget: 'wcag-2.2-aa',
  aiGovernance: 'iso-42001', // AI management system alignment required
} as const
```

| **Control**             | **Offline no-AI**                        | **Offline browser-AI**                                  | **Mobile offline**                                       | **Enterprise**                                                                               |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Storage source of truth | Local encrypted browser vault.           | Local encrypted browser vault.                          | Native app-controlled encrypted vault.                   | Server database/object storage.                                                              |
| Sync adapter            | NullAdapter.                             | NullAdapter.                                            | NullAdapter initially.                                   | EnterpriseApiAdapter (OIDC session).                                                         |
| Identity                | Master password + optional TOTP/passkey. | Master password + optional TOTP/passkey.                | Master password + native biometrics (Keychain/Keystore). | OIDC/PKCE + enterprise IdP MFA. PKCE mandatory. No implicit flow.                            |
| Authorization           | N/A (single user).                       | N/A (single user).                                      | N/A (single user).                                       | OPA or Cedar policy engine. Deny-by-default. Object-level enforcement.                       |
| GDPR erasure            | Vault delete = erasure (user holds key). | Vault delete = erasure.                                 | Vault delete = erasure (native storage).                 | KMS key destruction = crypto-shredding. Backup propagation via encrypted-blob unreadability. |
| AI                      | No AI; no AI code in bundle.             | Browser built-in (Nano/Phi-4-mini) only; no cloud code. | Native on-device only (after risk review).               | Policy-controlled AI gateway; tenant enable/disable; prompt injection defence.               |
| Audit                   | Encrypted local audit export.            | Encrypted local audit export.                           | Encrypted local audit + native share export.             | Append-only server-side WORM audit; SIEM export; tamper-resistant.                           |
| Observability           | N/A.                                     | N/A.                                                    | N/A.                                                     | OpenTelemetry (traces/metrics/logs); SLOs; SIEM. Required for SOC 2 Availability evidence.   |
| CSP / network           | `<meta>` CSP; no public network.         | `<meta>` CSP; no cloud AI endpoints.                    | ATS (iOS) + Android NSC; no public network.              | Server/CDN response headers; API CORS allowlist; WAF at edge.                                |

---

# 6. Core Package Layering

The core package separates pure business concepts from security, storage, platform, AI runtime, and UI rendering. The `platform/` layer is new and required for the mobile adapter pattern — it defines the interfaces that `browser-vault-storage.ts` and `mobile-vault-storage.ts` both implement, keeping the mobile and desktop paths structurally identical to the rest of core.

| **Layer**      | **Contents**                                                                                                                                                                                                                                   | **Must not contain**                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `domain/`      | Types and pure rules for clients, projects, tasks, people, documents, time entries, tags, communications.                                                                                                                                      | DOM, IndexedDB, AI providers, fetch calls, Vite globals.                          |
| `application/` | Use cases: create project, close task, import data, export data, move document, create timeline entry.                                                                                                                                         | Raw DOM manipulation or storage-specific logic.                                   |
| `security/`    | `crypto`, `vault`, `session`, `auth`, `mfa`, `totp`, `webauthn`, `audit`, `sanitize`, `trusted-types`.                                                                                                                                         | View rendering or business workflows beyond security.                             |
| `storage/`     | Store interfaces, migration runner, vault store, document store, backup store.                                                                                                                                                                 | Concrete mobile/enterprise implementation details.                                |
| `platform/`    | `storage-adapter.ts` (interface: `VaultStorage`), `browser-vault-storage.ts`, `mobile-vault-storage.ts`, `native-security.ts` (biometric unlock interface), `native-backup.ts` (export/import interface), `managed-config.ts` (MDM interface). | Business logic; must only define interfaces and their web/mobile implementations. |
| `ai/`          | AI runtime, policy checks, provider interfaces, prompt building, tool confirmation.                                                                                                                                                            | Direct cloud secrets outside secure storage abstraction.                          |
| `ui/`          | Reusable components, render helpers, icons, layout, modal helpers.                                                                                                                                                                             | Persistence or AI provider calls.                                                 |
| `views/`       | Screen-specific render and bind files.                                                                                                                                                                                                         | Security-critical logic belonging in `security/` or `application/`.               |
| `schemas/`     | **Valibot** runtime schemas for all record types, import payloads, AI tool inputs, sync payloads. (Server-side enterprise API response schemas use **Zod v4** — stays out of the offline bundle.)                                              | View-specific behaviour. TypeScript types alone are not runtime guarantees.       |
| `migrations/`  | Vault/data/schema migrations with version numbers.                                                                                                                                                                                             | Ad-hoc migration code buried in views or entry points.                            |

---

# 7. Adapters and Contract Testing

The adapter interface is one of the best existing architecture decisions. Keep the **flat package naming convention** — do not restructure `packages/adapter-null/` into `packages/adapters/null/`. The rename creates pnpm workspace overhead, requires updating every `package.json` name and import, and provides no functional benefit. New adapters follow the same flat convention.

The new `packages/adapter-kms/` is required before any enterprise customer data is stored. It provides the per-user DEK/KEK lifecycle and the DSAR erasure workflow (KMS key destruction = GDPR Article 17 erasure).

```
packages/adapter-null/          — production for offline; NullAdapter
    src/index.ts
    README.md
    adapter.test.ts

packages/adapter-browser-vault/ — production for offline web; BrowserVaultStorage
    src/index.ts
    README.md
    adapter.test.ts

packages/adapter-mobile-native/ — required before mobile production; Capacitor bridge
    src/index.ts
    README.md
    adapter.test.ts

packages/adapter-rxdb/          — only if local/PWA sync is real
    src/index.ts
    README.md
    adapter.test.ts

packages/adapter-dataverse/     — only if Power Platform target is real
    src/index.ts
    README.md
    adapter.test.ts

packages/adapter-enterprise-api/ — required for enterprise; OIDC session, tenant-scoped CRUD
    src/index.ts
    README.md
    adapter.test.ts

packages/adapter-kms/           — required before enterprise customer data is stored
    src/index.ts                 — interface: issueKey(userId), wrapKey(dek, kek), unwrapKey(), scheduleKeyDestruction(userId), getKeyStatus(userId)
    README.md                    — documents crypto-shredding mechanism and EU DPA legal basis
    adapter.test.ts              — key issuance, wrapping, destruction, DSAR workflow, post-destruction unreadability
```

| **Adapter**              | **Status target**                          | **Implementation requirements**                                                                                                              |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| NullAdapter              | Production for offline no-sync.            | No-op pull/push/stream/clear. Must never make network calls.                                                                                 |
| BrowserVaultStorage      | Production for offline web.                | Read/write encrypted vault, backup/export/import, restore dry-run, corruption handling.                                                      |
| MobileNativeVaultAdapter | Required before mobile production.         | Capacitor bridge for native filesystem vault, backup/export/import (iOS Files / Android SAF), secure/native storage, platform checks.        |
| KmsAdapter               | Required before enterprise data is stored. | Per-user DEK issuance, KMS-managed KEK wrapping/unwrapping, key destruction schedule for GDPR erasure, key status audit, legal hold support. |
| RxDBAdapter              | Only if local/PWA sync is real.            | Conflict handling, schema validation, encryption strategy, offline queue, replay tests.                                                      |
| DataverseAdapter         | Only if Power Platform target is real.     | Auth model, table mapping, permissions, schema mapping, sync conflict behaviour.                                                             |
| EnterpriseApiAdapter     | Required for enterprise.                   | OIDC/PKCE session handling, tenant-scoped CRUD, server-side authorization errors, audit-aware calls.                                         |

## 7.1 Adapter contract tests

All adapters must pass the shared contract test suite:

- Every adapter must create, read, update, delete, and list records consistently.
- Every adapter must reject invalid schema payloads (Valibot for client-side adapters; Zod v4 for server-side adapters).
- Every adapter must preserve `createdAt`/`updatedAt` and record IDs unless migration explicitly changes them.
- Sync-capable adapters must handle conflict detection and resolution deterministically.
- **Enterprise adapters must prove tenant isolation:** a tenant A user cannot read, search, or export tenant B records through any endpoint or query.
- **KmsAdapter must prove GDPR erasure:** after key destruction, all blobs encrypted with that key are unreadable. Backup copies must also be verified as unreadable.
- Mobile/native adapters must prove backup/export/import round trip on real iOS and Android devices.

---

# 8. Rendering, Trusted Types, and XSS Hardening

The current Trusted Types implementation is pragmatic but must not be the final architecture for any build profile. The global raw policy weakens XSS defence and is a blocking risk for enterprise deployment — it would be flagged immediately in any penetration test or ASVS review.

| **Phase** | **Action**                                                                                                                                                   | **Acceptance criteria**                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1         | Keep existing Trusted Types enforcement and DOMPurify allowlist.                                                                                             | No regression in current app behaviour; document editor remains sanitized.                             |
| 2         | Create explicit render helpers: `text()`, `attr()`, `safeUrl()`, `richTextHtml()`, `trustedTemplate()`. Add lint rule blocking raw `innerHTML` in new files. | New code uses helpers; lint blocks raw `innerHTML` assignments.                                        |
| 3         | Convert high-risk views first: documents, imports, AI output, settings, file records.                                                                        | XSS tests pass for malicious project names, document content, AI output, file names, and JSON imports. |
| 4         | Remove global `nexus-crm-raw` policy and global `innerHTML`/`outerHTML` patch.                                                                               | Trusted Types errors surface during development if raw strings reach dangerous sinks.                  |

```
packages/core/src/ui/render/
    escape.ts      — text() and attr() escaping
    safe-html.ts   — TrustedHTML creation after DOMPurify sanitization
    safe-url.ts    — allowed URL schemes only
    dom.ts         — safe DOM setters
    trusted-types.ts — policy registration only; no global innerHTML patch
```

---

# 9. Schemas and Migrations

Runtime schema validation must be added before real production use in any profile. TypeScript types provide no runtime guarantee — data enters the app through forms, JSON import, encrypted backups, AI tool actions, sync adapters, and enterprise API responses.

**Use Valibot** for all schemas that ship in the offline bundle (`packages/core/src/schemas/`). The offline build is a single HTML file where bundle size is a hard constraint: Valibot is ~1.4 KB; Zod standard is ~17.7 KB; Zod Mini is ~6.9 KB. Both tree-shake well, but Valibot's pipe-based API ensures you pay only for the validators you import. The API is structurally equivalent to Zod for all use cases in this codebase.

**Use Zod v4** for all schemas that live exclusively in `server/` (enterprise API request/response validation, tRPC schemas if adopted, ORM integrations). Bundle size is irrelevant server-side, and Zod v4 has broader ecosystem integration (tRPC, Drizzle, Hono, etc.) and stronger community adoption for server contexts.

Do not use Zod in any module that is imported by `packages/core/src/` — it will land in the offline bundle.

```
packages/core/src/schemas/
    client.schema.ts       — z.object({ id, name, ... })
    project.schema.ts
    task.schema.ts
    person.schema.ts
    document.schema.ts
    file.schema.ts
    audit.schema.ts
    import.schema.ts       — validates JSON import store names and record shapes
    ai-tool.schema.ts      — validates every AI tool argument before mutation
    sync-payload.schema.ts — validates remote sync payload before merge
    api-response.schema.ts — validates enterprise API response shape
```

| **Input path**          | **Validation required**                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Form submission         | Validate fields with Valibot before persisting; normalize dates/status/priority.                                        |
| JSON import             | Validate store names and full record shapes, not just array existence.                                                  |
| Encrypted backup import | Validate version, schema, migration path, and record shape after decryption.                                            |
| AI tool action          | Validate every tool argument with Valibot; require user confirmation before mutation.                                   |
| Sync adapter pull       | Validate remote payload before merge.                                                                                   |
| Enterprise API response | Validate server response shape and authorization error handling with Zod v4 (server-side only; never imported by core). |
| Mobile native bridge    | Validate all bridge inputs/outputs; never trust native bridge strings blindly.                                          |

## 9.1 Migration structure

```
packages/core/src/migrations/
    0001-initial.ts
    0002-documents-idb.ts
    0003-audit-log.ts
    0004-mfa-records.ts
    0005-schema-versioned-vault.ts
    migration-runner.ts
```

- Add `schemaVersion` to the vault payload before building the migration runner — it is a hard prerequisite.
- Run migrations during unlock after decryption but before normal rendering.
- Create migration tests with real sample vaults from old versions.
- Never overwrite a vault until a migration has produced a valid backup or rollback path.

---

# 10. Mobile / Capacitor Structure

Mobile is a native shell around the web core, not a browser-only PWA. The `platform/` layer in core defines the interfaces that the browser and mobile implementations both satisfy — this keeps the core codebase agnostic of the runtime environment.

```
apps/mobile/
    capacitor.config.ts
    package.json
    src/entry.ts
    ios/
        App/
            PrivacyInfo.xcprivacy         ← required for App Store
            Info.plist                    ← ATS: NSAllowsArbitraryLoads: false
    android/
        app/src/main/res/xml/
            network_security_config.xml   ← cleartextTrafficPermitted: false

packages/adapter-mobile-native/
    src/
        mobile-vault-adapter.ts
        mobile-backup-adapter.ts
        biometric-unlock-adapter.ts
        network-policy.ts
    src/index.ts
```

| **Mobile need**            | **Implementation recommendation**                                                                                                                                                                                                          | **Acceptance criteria**                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vault storage              | Native app-controlled filesystem (iOS `Library/Application Support/`, Android `filesDir`) via Capacitor plugin. Not WebView IndexedDB as the only durable copy.                                                                            | Vault persists after app restart and device reboot; encrypted backup/import works on real iOS and Android devices.                               |
| Backup / export            | iOS: `UIDocumentPickerViewController` / `UIActivityViewController`. Android: Storage Access Framework (`ACTION_CREATE_DOCUMENT`). Same encrypted vault format as desktop.                                                                  | User can export and import encrypted backup on real devices. Restore dry-run works and does not overwrite live vault.                            |
| Biometrics                 | iOS: `LocalAuthentication` + Keychain item with `kSecAccessControlBiometryAny`. Android: `BiometricPrompt` + Keystore key with `setInvalidatedByBiometricEnrollment(true)`. Store only wrapped key material, not the master password.      | Biometric unlock works; enrollment change invalidates stored key; fallback to master password works. No plaintext secret in preferences or logs. |
| Network lockdown (iOS)     | `NSAllowsArbitraryLoads: false` in `Info.plist`. No wildcard exception domains. Justify any `NSExceptionDomains` entries for App Store review. `WKWebView` navigation delegate allowlist.                                                  | `NSAllowsArbitraryLoads` is `false` in all production configurations. MITM proxy test shows no cleartext traffic in `offline-no-ai` profile.     |
| Network lockdown (Android) | `network_security_config.xml` with `cleartextTrafficPermitted="false"`. Capacitor WebView navigation allowlist.                                                                                                                            | MITM proxy test shows only approved endpoints in `offline-no-ai` profile.                                                                        |
| AI model supply chain      | Before any AI model is added: pin model file SHA-256 hashes in build config (CI fails on mismatch); document model provenance (training data source, license, publisher, version); prefer MDM preload over in-app download for enterprise. | Model hashes pinned in CI. Model provenance documented. Distribution strategy reviewed.                                                          |
| App store privacy          | iOS `PrivacyInfo.xcprivacy`, `Info.plist` purpose strings. Android permissions audit, Play Data Safety declaration, third-party SDK list.                                                                                                  | Store submission passes privacy review.                                                                                                          |
| Security testing           | OWASP MASVS 2.0 / MASTG test evidence on real devices.                                                                                                                                                                                     | No broad JavaScript bridge exposure; no unsafe native file operations; findings tracked to closure.                                              |

---

# 11. Enterprise Structure

Enterprise is a backend-controlled product. The shared UI/domain code is reused where possible, but identity, authorization, GDPR erasure, tenant isolation, audit, files, AI governance, and data persistence require server-side enforcement. The browser is a thin renderer — it must not be trusted to enforce authorization or data isolation.

## 11.1 Identity — OIDC with PKCE mandatory

```
server/src/auth/
    oidc.ts          ← OIDC/PKCE (RFC 9700 — no implicit flow, no hybrid flow)
    dpop.ts          ← DPoP (RFC 9449) — roadmap; token binding for high-assurance
    saml.ts          ← SAML 2.0 SP-initiated — only if buyer requires; prefer OIDC
    scim.ts          ← SCIM 2.0 provisioning/deprovisioning; maps IdP groups to roles
    session.ts       ← short-lived access tokens (15 min), refresh token rotation (one-time-use), server-side revocation list
    step-up.ts       ← re-authentication required for: data export, admin changes, AI provider changes, destructive operations, legal hold
```

**PKCE is mandatory.** The OAuth 2.0 Security Best Current Practice (RFC 9700, ratified 2025) explicitly deprecates the implicit flow and hybrid flow. Any OIDC implementation without PKCE is not acceptable for 2026 enterprise deployment.

**DPoP (RFC 9449)** binds access tokens to a client-side key pair, making stolen bearer tokens useless without the private key. Design the token handling layer to accommodate DPoP as a near-term addition for high-assurance enterprise customers.

## 11.2 Authorization — policy-as-code, deny-by-default

```
server/src/authorization/
    policy-engine.ts     ← OPA or Cedar integration (see below)
    middleware.ts        ← every route: authenticate → resolve tenant → check policy → enforce
    object-access.ts     ← object-level authorization; checked in every service function, not just route guards
    policies/            ← policy definitions in version control; reviewed and approved like code
```

**Do not hardcode RBAC into route handlers.** This pattern produces inconsistencies, makes auditing impossible, and fails at enterprise scale. Use a centralized Policy Decision Point:

- **OPA (Open Policy Agent):** General-purpose, Rego-based, widely adopted. Embeds as a library or runs as a sidecar. Best for complex ABAC policies with contextual attributes (tenant, department, resource owner, time-of-day).
- **AWS Cedar:** Formally verified, strongly typed, purpose-built for application authorization. Mathematically proven to be sound and terminating — no policy can accidentally grant more access than intended.

Both are appropriate; choose based on deployment environment. Document as an Architecture Decision Record.

**Deny-by-default:** every request requires explicit policy grant. No implicit permission inheritance. BOLA/IDOR test suite covers every endpoint for cross-tenant and cross-user object access.

## 11.3 GDPR crypto-shredding — per-user KMS key architecture

```
server/src/kms/
    key-service.ts       ← issue, wrap, unwrap, schedule-destroy, get-status
    erasure-workflow.ts  ← DSAR erasure: set deleted flag → schedule KMS key destruction → audit evidence
    legal-hold.ts        ← suspend erasure for legal hold; time-bounded; requires named approver
```

**Every enterprise user has a unique Data Encryption Key (DEK) wrapped by a KMS-managed Key Encryption Key (KEK).** The application never holds the raw DEK — it requests encryption/decryption operations from the KMS. "Deleting" a user means scheduling the KMS key for destruction. The encrypted data blobs remain in storage but are permanently unreadable — equivalent to erasure under EU DPA guidance.

This is not optional. The EDPB made Article 17 (right to erasure) a 2026 enforcement priority, with active audits across 32 EU supervisory authorities revealing widespread non-compliance, particularly in backup systems. Without per-user KMS keys, GDPR erasure is operationally impossible for a system with encrypted backups.

## 11.4 Observability — OpenTelemetry from day one

```
server/src/observability/
    otel.ts          ← OpenTelemetry SDK initialisation; vendor-neutral
    middleware.ts    ← request tracing: root span with tenant_id, user_id, request_id, trace_id
    metrics.ts       ← RED metrics per service: Rate, Errors, Duration; P50/P95/P99
    slo.ts           ← SLO definitions: P99 < 500 ms; error rate < 0.1%; uptime > 99.9%
```

**OpenTelemetry is the 2026 industry standard** for distributed observability. Every major vendor (Datadog, Grafana, Honeycomb, Dynatrace, Splunk) accepts OTel natively. Instrument from day one — retrofitting observability onto a running system is expensive and produces incomplete SOC 2 Availability evidence.

The three OTel signals required:

- **Traces:** every API request; child spans for DB queries, KMS calls, auth checks, AI gateway calls; trace IDs in every structured log line.
- **Metrics:** RED model per service; alert on SLO burn rate (not only threshold crossings).
- **Logs:** structured JSON with mandatory fields: `timestamp`, `level`, `service`, `trace_id`, `span_id`, `tenant_id`, `user_id`, `request_id`, `message`. No `console.log`. No PII in logs.

## 11.5 AI governance — ISO 42001:2023 alignment

```
server/src/ai-gateway/
    policy-engine.ts     ← tenant admin enables/disables providers; requires visible data disclosure
    provider-policy.ts   ← approved provider/model allowlist; new providers require DPA review
    data-minimisation.ts ← PII field exclusion from AI context by policy, not developer discipline
    redaction.ts         ← redact sensitive fields before prompt construction
    prompt-audit.ts      ← log prompt hash, response hash, tool calls attempted/approved, tokens, cost
    injection-defence.ts ← validate user-controlled fields before including in AI context
    human-approval.ts    ← all AI write-action tool calls require user confirmation; not bypassable
```

ISO 42001:2023 (AI management system standard) is increasingly required by enterprise procurement questionnaires. Before cloud AI is offered to enterprise customers, produce: AI governance policy, model inventory with risk classification, prompt/data boundary rules, AI audit trail, and human approval workflow. Map these to the ISO 42001 evidence requirements.

## 11.6 Enterprise capability ownership summary

| **Enterprise capability**                    | **Where it belongs**                         | **Why**                                                                                                           |
| -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| SSO / OIDC (PKCE mandatory) / SAML / SCIM    | `server/src/auth`                            | Client-side identity controls are not sufficient for enterprise.                                                  |
| RBAC / ABAC via policy engine (OPA or Cedar) | `server/src/authorization`                   | Authorization must be enforced server-side on every object and action. Deny-by-default.                           |
| Tenant isolation                             | `server/src/tenant` and DB schema            | Tenant separation is a data-layer boundary, not a UI filter. Resolved from session, not from request body.        |
| GDPR crypto-shredding                        | `server/src/kms` and `packages/adapter-kms/` | Article 17 erasure for encrypted backup systems; KMS key destruction = unreadability.                             |
| Centralized append-only audit                | `server/src/audit`                           | Local audit logs are not sufficient for SOC 2 non-repudiation.                                                    |
| File storage / scanning                      | `server/src/files`                           | Enterprise file handling requires malware scanning, signed URLs, retention, and download audit.                   |
| AI governance                                | `server/src/ai-gateway`                      | Cloud AI calls need policy, data minimisation, prompt injection defence, human approval, and ISO 42001 alignment. |
| Observability                                | `server/src/observability`                   | OpenTelemetry from day one; SOC 2 Availability evidence cannot be produced without it.                            |

---

# 12. Testing Strategy

Testing is organized by risk area. The highest-risk areas are XSS, encryption/backup, GDPR erasure, BOLA/IDOR tenant isolation, AI prompt injection, migrations, adapters, profile separation, accessibility, and supply chain integrity. Tests in the security, BOLA/IDOR, GDPR erasure, and supply chain categories **block deployment** — they are not aspirational.

```
tests/
    unit/
    integration/
    e2e/
    security/
        xss-import.test.ts
        xss-document-editor.test.ts
        xss-ai-output.test.ts
        bola-idor.test.ts                 ← every endpoint; cross-tenant + cross-user object access
        csp-offline.test.ts
        permissions-policy.test.ts        ← denied features (geolocation, USB, payment) blocked
        offline-bundle-forbidden-strings.test.ts
        crypto-vault-roundtrip.test.ts
        backup-restore-corruption.test.ts
        gdpr-erasure.test.ts              ← key destruction → encrypted data unreadable → DSAR evidence
        ai-prompt-injection.test.ts       ← every user-controlled field reaching AI context
    accessibility/
        keyboard-navigation.test.ts
        modal-focus-trap.test.ts
        screen-reader-labels.test.ts
    migration/
        legacy-kdf-310k-to-600k.test.ts
        vault-schema-migration.test.ts
    build-profiles/
        offline-no-ai-profile.test.ts
        offline-browser-ai-profile.test.ts
        offline-internal-ai-profile.test.ts
        enterprise-profile.test.ts
        mobile-profile.test.ts
    supply-chain/
        slsa-provenance-verify.test.ts    ← verify SLSA Level 2+ attestation on built artifact
        dependency-hash.test.ts           ← verify lockfile integrity; detect substitution
```

| **Test category**               | **Purpose**                                                                                                                       | **Blocks deployment**                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Unit                            | Pure function and domain/service behaviour.                                                                                       | Every PR.                                                                |
| Integration                     | Vault, storage, adapter, AI tool, import/export, Valibot schema validation behaviour.                                             | Every release candidate.                                                 |
| Security — XSS                  | Malicious payloads in every rich-text/user-input sink.                                                                            | Every offline/mobile/enterprise build.                                   |
| Security — BOLA/IDOR            | Every API endpoint tested for cross-tenant and cross-user object access.                                                          | Every enterprise build. Non-negotiable before any enterprise pilot.      |
| Security — GDPR erasure         | Key destruction produces unreadable data in live and backup storage; DSAR evidence auditable.                                     | Enterprise builds. Required before first enterprise customer onboarding. |
| Security — AI prompt injection  | User-controlled fields (task name, document, client notes) cannot inject instructions that bypass human approval or extract data. | Any build with AI enabled.                                               |
| Security — `Permissions-Policy` | Denied browser features are blocked.                                                                                              | Offline and enterprise web builds.                                       |
| Security — supply chain         | SLSA provenance attestation verifiable; lockfile integrity confirmed.                                                             | Every enterprise release.                                                |
| Accessibility                   | Keyboard navigation, focus trap, ARIA labels, contrast, screen reader. Axe-core automated in CI.                                  | Every UI release going to enterprise/public sector.                      |
| Migration                       | Old vaults and old KDF/schema versions upgrade safely.                                                                            | Any release that changes storage/schema.                                 |
| Adapter contract                | Every adapter passes the shared behavioural test suite including GDPR erasure (KMS adapter).                                      | Any adapter change.                                                      |
| Enterprise authorization        | Object-level authorization and tenant isolation pass for every endpoint.                                                          | Enterprise backend release.                                              |
| Build profiles                  | Offline artifacts do not contain forbidden code per profile; CSP verified per profile.                                            | Every build.                                                             |

---

# 13. CI/CD, Supply Chain, and Release Hygiene

All security, BOLA/IDOR, GDPR erasure, and supply chain tests are **blocking gates** — they stop the release, not generate a report. Manual review is not a substitute.

```
.github/workflows/
    ci.yml                    ← runs on every PR: typecheck, lint, unit tests, bundle gates
    security.yml              ← SAST + SCA + secret scanning on schedule and on PR
    codeql.yml                ← GitHub CodeQL static analysis (scheduled + PR)
    dependency-review.yml     ← block PRs introducing new vulnerable dependencies
    accessibility.yml         ← axe-core on built artifact; blocks UI releases with regressions
    release-offline.yml
    release-mobile.yml
    release-enterprise.yml
```

| **Pipeline step**        | **Tool / command**                                              | **Purpose**                                                                                                      |
| ------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Install                  | `pnpm install --frozen-lockfile`                                | Reproducible dependency installation; fails if lockfile out of date.                                             |
| Type check               | `pnpm run typecheck`                                            | Block TypeScript regressions.                                                                                    |
| Lint                     | `pnpm run lint`                                                 | Block dangerous patterns and style drift.                                                                        |
| Unit / integration tests | `pnpm run test`                                                 | Validate core behaviour.                                                                                         |
| SAST                     | `semgrep --config=auto`                                         | Block known vulnerability patterns; hardcoded secrets patterns; dangerous API usage.                             |
| Secret scanning          | `gitleaks detect`                                               | Block committed secrets on every push. Zero-tolerance policy.                                                    |
| SCA / dependency scan    | `pnpm audit` + Socket or Snyk                                   | Block critical/high CVEs (exception workflow for accepted risks with named approver).                            |
| License scan             | `license-checker` or `pnpm-licenses`                            | Block copyleft licenses incompatible with commercial distribution.                                               |
| SBOM generation          | `cyclonedx-npm` (CycloneDX format)                              | Produce dependency inventory for every release.                                                                  |
| Offline build            | `pnpm run build:offline`                                        | Produce final offline artifact.                                                                                  |
| Forbidden bundle strings | `pnpm run assert:offline-bundle`                                | Fail if cloud endpoints, disabled provider leakage, or disallowed feature strings appear in the artifact.        |
| CSP verification         | `node generate-csp.mjs`                                         | Regenerate CSP hashes; fail if mismatched.                                                                       |
| SLSA Level 2 provenance  | `slsa-github-generator` (reusable workflow)                     | Generate signed provenance attestation. Minimum for all releases.                                                |
| SLSA Level 3 provenance  | Hermetic build + `slsa-github-generator`                        | Required for enterprise releases. Isolated build environment; no network during build.                           |
| Artifact signing         | `cosign sign-blob --key` or keyless via OIDC identity           | Sigstore/Cosign keyless signing. No long-lived signing keys. Every signature recorded in Rekor transparency log. |
| SLSA verification        | `slsa-verifier verify-artifact`                                 | CI verifies its own provenance attestation on the built artifact before publishing.                              |
| Artifact hash            | `sha256sum dist/offline/index.html > dist/offline/index.sha256` | Publish alongside artifact so users can verify.                                                                  |
| Release notes            | Manual per release                                              | Version, commit SHA, build profile, dependencies, security changes, known issues, migration notes.               |

**Publish with every enterprise release:**

```
dist/enterprise/
    app.js                    ← versioned, hash-named
    sbom.cdx.json             ← CycloneDX SBOM
    app.js.cosign.sig         ← Cosign signature
    provenance.intoto.jsonl   ← SLSA attestation
    SHA256SUMS                ← file hashes
    release-notes.md
```

**SLSA target levels:**

- `offline-web` builds: **SLSA Level 2** — provenance signed by CI system; prevents tampering after build.
- `enterprise-web` and `mobile` builds: **SLSA Level 3** — hermetic build (no network during build; all deps from lockfile); build environment verified; provenance signed by short-lived OIDC identity.

---

# 14. Documentation Structure

Documentation is part of the product. For a security-sensitive, GDPR-governed, enterprise-targeted application, documentation must include architecture decisions, threat models, compliance mappings, GDPR erasure design, AI governance policy, and operational runbooks — all version-controlled alongside the code.

```
docs/
    architecture/
        0001-build-profiles.md
        0002-storage-model.md
        0003-ai-policy.md
        0004-mobile-storage.md
        0005-enterprise-backend.md
        0006-gdpr-crypto-shredding.md  ← per-user KMS key hierarchy, DSAR workflow, EU DPA legal basis for crypto-shredding
        0007-identity-and-authz.md     ← OIDC/PKCE design, DPoP roadmap, OPA/Cedar policy model, BOLA/IDOR controls
    threat-models/
        offline-threat-model.md
        mobile-threat-model.md
        enterprise-threat-model.md
    compliance/
        asvs-5-mapping.md
        masvs-mapping.md
        ssdf-mapping.md
        soc2-evidence-map.md
        iso27001-evidence-map.md
        iso27701-evidence-map.md      ← GDPR/privacy management programme
        iso42001-evidence-map.md      ← AI management system (required before enterprise cloud AI)
        gdpr-erasure-design.md        ← crypto-shredding mechanism, key hierarchy diagram, EU DPA legal analysis
        ai-governance-policy.md       ← model inventory, data boundary rules, human approval workflow, prompt injection defence
        wcag-vpat.md                  ← WCAG 2.2 AA conformance claim / partial claim and VPAT
    runbooks/
        release-offline.md
        release-enterprise.md
        restore-vault.md
        incident-response.md
        key-rotation.md
        gdpr-dsar-erasure.md          ← step-by-step procedure: receive DSAR → verify identity → set deleted flag → schedule KMS key destruction → audit evidence → respond
```

---

# 15. Recommended Implementation Roadmap

| **Phase**                                | **Work**                                                                                                                              | **Detailed tasks**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **Done when**                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **-1 — Monorepo tooling baseline**       | Install Turborepo, ESLint v9 flat config, Prettier, Husky, lint-staged, commitlint, Changesets, and Renovate before any feature work. | Add `turbo.json` with `build`/`typecheck`/`lint`/`test` task pipeline. Add `tsconfig.base.json` shared strictest options with `@config/*` path alias. Add `eslint.config.mjs` (flat) with `typescript-eslint strictTypeChecked` + `eslint-plugin-security` + `no-restricted-syntax` rule blocking raw `innerHTML`. Add `.husky/` hooks (pre-commit: lint-staged; commit-msg: commitlint). Add `.changeset/config.json`. Add `renovate.json`. Add `CONTRIBUTING.md` and `SECURITY.md` to repo root. | `pnpm install && pnpm turbo run typecheck lint` passes from a cold clone. Commit message is rejected if it violates Conventional Commits format.                                                       |
| **0 — Freeze naming decisions**          | Clarify product profiles.                                                                                                             | Rename `apps/sync` or split into `pwa-local-sync` and future `enterprise-web`. Define three offline sub-profiles (`no-ai`, `browser-ai`, `internal-ai`). Document profile definitions.                                                                                                                                                                                                                                                                                                             | A developer can determine which app target is offline-no-ai, offline-browser-ai, offline-internal-ai, mobile, dataverse, or enterprise without guessing.                                               |
| **1 — Build profile package**            | Create `config/build-profiles/` at repo root (not a workspace package).                                                               | Move profile constants into typed objects; wire Vite configs and entry points to those profiles. Add `aiMode`, `gdprErasureModel`, `kmsRequired`, `oidcPkceRequired` fields to enterprise profile.                                                                                                                                                                                                                                                                                                 | All six profiles (three offline, mobile, enterprise, dataverse) are centrally defined as typed objects and imported via path alias.                                                                    |
| **2 — Offline bundle gates**             | Add forbidden-content tests and `Permissions-Policy` audit.                                                                           | Search `dist/offline/index.html` for cloud endpoints, disabled provider leakage, model download URLs. Audit `Permissions-Policy` header. Add Semgrep and Gitleaks to CI.                                                                                                                                                                                                                                                                                                                           | Offline builds fail CI if disallowed strings or disallowed browser features are present.                                                                                                               |
| **3 — Core layering**                    | Move security/storage/platform/schema/migration files into dedicated folders.                                                         | Add `platform/` layer with `VaultStorage` interface and browser/mobile implementations. Add `schemas/` with Valibot schemas. Add `migrations/` with version-numbered files and `schemaVersion` in vault payload.                                                                                                                                                                                                                                                                                   | Imports remain clean; typecheck passes; no circular dependency regression.                                                                                                                             |
| **4 — Schema validation**                | Validate all data ingress paths.                                                                                                      | Add Valibot schemas in `packages/core/src/schemas/` for all record types, imports, AI tool actions, and sync payloads. Reserve Zod v4 for `server/` (enterprise API responses, tRPC). Block invalid imports at parse time.                                                                                                                                                                                                                                                                         | Malformed import/AI/sync payloads are rejected before persistence. Parse errors are surfaced to the user with clear messages. No Zod import in any module reachable from the offline bundle.           |
| **5 — Adapter contract testing**         | Formalise adapter behaviour.                                                                                                          | Create shared adapter contract test suite; apply to NullAdapter and BrowserVaultStorage. Add GDPR erasure contract test to KmsAdapter specification. Add BOLA/IDOR requirement to EnterpriseApiAdapter specification.                                                                                                                                                                                                                                                                              | Every adapter passes the same behavioural tests including erasure and isolation requirements.                                                                                                          |
| **6 — GDPR / privacy architecture**      | Establish per-user key architecture before any enterprise customer data is stored.                                                    | Design per-user DEK/KEK hierarchy; implement `packages/adapter-kms/`; implement `server/src/kms/` with erasure workflow; write `docs/architecture/0006-gdpr-crypto-shredding.md`; test DSAR erasure end-to-end in non-prod; produce EU DPA legal analysis.                                                                                                                                                                                                                                         | KMS key architecture in place; DSAR erasure tested; backup unreadability verified; EU DPA legal analysis complete.                                                                                     |
| **7 — OpenTelemetry and observability**  | Instrument all services before enterprise pilot.                                                                                      | Add `server/src/observability/`; OTel traces with `tenant_id`/`user_id`/`request_id`; RED metrics; structured JSON logs; SLO definitions; SIEM export configuration; alert routing; status page.                                                                                                                                                                                                                                                                                                   | All services emit OTel signals. SLOs defined. Dashboard exists. Alert fires for auth anomalies and SLO breaches. SOC 2 Availability evidence begins accumulating.                                      |
| **8 — Mobile implementation**            | Add real Capacitor app and native adapters.                                                                                           | Add `apps/mobile/capacitor.config.ts`; iOS ATS (`NSAllowsArbitraryLoads: false`); Android Network Security Config; `packages/adapter-mobile-native/`; native vault storage; backup/export; biometrics (Keychain/Keystore); model hash pinning for any AI model; privacy manifests; MASVS test plan.                                                                                                                                                                                                | Mobile build works on real iOS/Android test devices; ATS and Android NSC configured; backup/import round trip works; MASVS findings tracked.                                                           |
| **9 — Enterprise foundation**            | Create server only when enterprise work begins.                                                                                       | OIDC/PKCE (no implicit flow); SCIM provisioning; OPA or Cedar policy engine with deny-by-default; tenant isolation with RLS; per-user KMS integration; OpenTelemetry instrumentation; append-only audit ingestion; BOLA/IDOR test suite.                                                                                                                                                                                                                                                           | Enterprise web uses EnterpriseApiAdapter; server enforces OIDC/PKCE, policy engine authorization, tenant isolation, KMS-managed keys, and OTel-instrumented audit.                                     |
| **10 — AI governance and accessibility** | Make AI enterprise-safe; make UI accessible.                                                                                          | AI gateway with tenant policy engine, data minimisation, prompt injection tests, human approval for write actions, ISO 42001 gap assessment. WCAG 2.2 AA audit; axe-core in CI; VPAT.                                                                                                                                                                                                                                                                                                              | Cloud AI disabled-by-policy proof; all AI write actions require approval; ISO 42001 gap assessment complete. Primary keyboard/screen-reader workflows pass; VPAT produced.                             |
| **11 — API contract and database**       | Add OpenAPI spec and ORM before enterprise server routes are written.                                                                 | Write `docs/api/openapi.yaml` (OpenAPI 3.1 source of truth). Generate `server/src/api/generated/types.ts` via `openapi-typescript`. Add Drizzle ORM with `server/src/db/schema/` and `server/src/db/migrations/`. Add Row-Level Security policies to all `tenant_id` tables. Confirm no generated types or Drizzle imports reach the offline bundle.                                                                                                                                               | All server routes have a corresponding OpenAPI operation. No route is merged without an OpenAPI diff review. DB migration files are plain SQL, checked in, and applied in CI before integration tests. |
| **12 — Release management**              | Automate versioning and CHANGELOG before first public release.                                                                        | Install Changesets. Add `.changeset/config.json`. Add Changesets GitHub Action (opens Release PR automatically). Configure semantic versioning policy. Stamp offline artifact `<meta name="version">` from root `package.json` at build time.                                                                                                                                                                                                                                                      | Release PR is opened automatically on merge to main when pending changesets exist. `CHANGELOG.md` is generated, not hand-edited.                                                                       |
| **13 — Performance budgets**             | Enforce bundle size limits in CI.                                                                                                     | Add `scripts/assert-bundle-size.mjs` with gzip budgets per build profile. Wire into `ci.yml` after `build:offline`. Add Lighthouse CI for enterprise web staging. Set `offline-no-ai` raw budget at 300 kB and gzip budget at 90 kB. CI fails on over-budget artifacts.                                                                                                                                                                                                                            | `pnpm run build:offline` followed by bundle-size assertion passes on main. Any PR that balloons the offline artifact is blocked before merge.                                                          |
| **14 — Infrastructure**                  | Containerize enterprise server when server work begins.                                                                               | Write multi-stage `Dockerfile` (builder + distroless runtime). Write `docker-compose.yml` (server + postgres + otel-collector + jaeger for local dev). Add `infra/k8s/` with deployment, service, ingress, HPA, and network-policy manifests. Add health endpoints: `GET /healthz` (liveness), `GET /readyz` (readiness). Add Cosign image signing to `release-enterprise.yml`.                                                                                                                    | Enterprise server runs in container locally via `docker compose up`. Production image is non-root, read-only filesystem, signed with Cosign, and verified by admission webhook.                        |

---

# 16. Acceptance Criteria

| **Area**                    | **Acceptance criteria**                                                                                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository clarity          | Each app target has a clear name, README, build command, profile object, and supported deployment model. Three offline sub-profiles (`no-ai`, `browser-ai`, `internal-ai`) are distinct build artifacts.                                                                            |
| Offline profile             | Final artifact per sub-profile contains no forbidden code (cloud AI endpoints for `no-ai`; cloud code for `browser-ai`). Forbidden-string scan passes in CI. `Permissions-Policy` audited and documented.                                                                           |
| Security layering           | Security modules isolated under `core/src/security/`. Trusted Types global raw policy removed. Explicit render helpers used for all HTML sinks. XSS test suite passes.                                                                                                              |
| Schemas                     | Every import, AI action, and sync payload is validated with Valibot (core/offline bundle) before persistence. Enterprise API responses are validated with Zod v4 (server-side only). Invalid payloads are rejected with a typed error. No Zod import appears in the offline bundle. |
| Migrations                  | Vault `schemaVersion` field exists. Migrations are version-numbered, deterministic, and tested with sample legacy vaults. No vault overwrite without valid backup or rollback path.                                                                                                 |
| Adapters                    | Null, browser-vault, mobile-native, enterprise-api, KMS, Dataverse, and RxDB adapters each have README and contract tests before being called production-capable.                                                                                                                   |
| GDPR erasure                | Per-user KMS key architecture in place. DSAR erasure tested end-to-end in non-prod. After key destruction, encrypted data is unreadable in live and backup storage. Erasure evidence is auditable. EU DPA legal analysis complete.                                                  |
| Identity                    | OIDC with PKCE is the only authentication mechanism for enterprise. No implicit flow anywhere. Refresh token rotation is one-time-use. Server-side session revocation tested. Step-up authentication triggers for high-risk operations.                                             |
| Authorization               | OPA or Cedar policy engine enforces deny-by-default on every API endpoint. Object-level authorization tested for every resource type. BOLA/IDOR test suite passes. Cross-tenant isolation tests pass.                                                                               |
| Observability               | OpenTelemetry instrumentation in all enterprise services. Traces, metrics, and structured logs emitted. SLOs defined. SIEM export configured. Dashboard exists. SOC 2 Availability evidence accumulating.                                                                           |
| Supply chain                | Every release artifact has a Cosign signature, SBOM, and SLSA Level 2+ provenance attestation. Enterprise releases meet SLSA Level 3. Sigstore verification command published in release notes. Gitleaks and Semgrep are blocking CI gates.                                         |
| Mobile                      | Capacitor build has iOS ATS (`NSAllowsArbitraryLoads: false`), Android NSC, native vault storage, backup/export round trip, biometric unlock (Keychain/Keystore), AI model hash pinning, privacy manifests, app signing, and MASVS test evidence.                                   |
| Enterprise CI/CD            | PRs run typecheck, lint, unit tests, SAST (Semgrep), SCA (Socket/Snyk), secret scan (Gitleaks), license scan. Releases additionally run SBOM, SLSA provenance, Cosign signing, SLSA verification, forbidden-bundle scan, and deployment approval gate.                              |
| Accessibility               | WCAG 2.2 AA audit complete. Primary workflows (create record, export, view audit log, manage AI settings) pass keyboard-only and screen-reader tests. Axe-core integrated in CI. VPAT produced before enterprise pilot.                                                             |
| AI governance               | ISO 42001:2023 gap assessment complete. Model inventory documented. Tenant admin can disable cloud AI and verify via audit log. All AI write actions require explicit user approval. Prompt injection test suite passes.                                                            |
| Enterprise readiness claims | SOC 2, ISO 27001, FedRAMP, FIPS, or zero-trust claims are not made until the corresponding controls are evidenced and independently reviewed.                                                                                                                                       |
| Monorepo tooling            | `pnpm install && pnpm turbo run typecheck lint test` passes from a cold clone. Non-compliant commit messages are rejected by commitlint hook. `renovate.json` is active and producing automated dependency PRs.                                                                     |
| Root config files           | `tsconfig.base.json` is the single source of TypeScript compiler options. All packages extend it. `eslint.config.mjs` (ESLint v9 flat config) is the single lint config. `no-restricted-syntax` rule blocks raw `innerHTML` in new files.                                           |
| API contract                | `docs/api/openapi.yaml` exists and is the source of truth. `server/src/api/generated/types.ts` is generated from it. No server route is merged without a corresponding OpenAPI operation. Breaking API changes require a new version prefix.                                        |
| Database                    | Drizzle ORM schema files are in `server/src/db/schema/`. Migration files are plain SQL in `server/src/db/migrations/`. Row-Level Security policies exist on all `tenant_id` tables. Drizzle imports do not appear in the offline bundle.                                            |
| Release management          | Changesets manages all version bumps and `CHANGELOG.md`. Release PR is opened automatically. Offline artifact `<meta name="version">` matches root `package.json` version. No manual edits to `CHANGELOG.md`.                                                                       |
| Performance budgets         | `offline-no-ai` artifact is ≤ 300 kB raw / ≤ 90 kB gzip. CI fails if budget is exceeded. Lighthouse CI score ≥ 85 Performance for enterprise web staging.                                                                                                                           |
| Infrastructure              | Enterprise server runs non-root in a distroless container. Production image is signed with Cosign and verified by admission webhook. Health endpoints (`/healthz`, `/readyz`) exist. Network policy denies all traffic except approved endpoints.                                   |

---

# 17. References and Evidence Used

## Current branch evidence reviewed

- `pnpm-workspace.yaml` — workspace package layout and `allowBuilds` (pnpm v11) configuration.
- `apps/offline/src/entry.ts` — offline entry point setting OT-only policy and NullAdapter.
- `apps/offline/vite.config.ts` — offline single-file build, OT-only constant, CSP connection injection, and disabled provider aliases.
- `apps/sync/src/entry.ts` — current sync entry still using NullAdapter.
- `packages/core/src/adapter-interface.ts` — shared pull/push/stream/clear adapter interface.
- `packages/adapter-rxdb/src/index.ts` and `packages/adapter-dataverse/src/index.ts` — TODO stubs.
- `packages/core/src/trusted-types.ts` — raw Trusted Types policy and innerHTML/outerHTML patch.
- `packages/core/src/sanitize.ts` — DOMPurify allowlist and URL sanitization helpers.
- `packages/core/src/vault.ts`, `crypto.ts`, `session.ts` — vault encryption, PBKDF2/AES-GCM, and session key behaviour.
- `packages/core/src/audit.ts` — local encrypted audit log; event taxonomy reusable as server-side schema basis.

## External standards and best-practice references

| Source                               | Relevance                                                                                                                                         | URL                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| pnpm Workspaces                      | Monorepo package layout; `allowBuilds` (v11 field).                                                                                               | https://pnpm.io/workspaces                                                                                                          |
| pnpm v11 release notes               | Confirms `allowBuilds` replaces `onlyBuiltDependencies`/`neverBuiltDependencies` in v11.                                                          | https://pnpm.io/blog/releases/11.0                                                                                                  |
| Vite env and build-time constants    | Build-time constants and provider aliases for profile separation.                                                                                 | https://vite.dev/guide/env-and-mode                                                                                                 |
| Capacitor configuration              | Capacitor mobile build target and native plugin model.                                                                                            | https://capacitorjs.com/docs/config                                                                                                 |
| OWASP ASVS 5.0                       | Technical application security verification baseline; Level 2 for enterprise.                                                                     | https://owasp.org/www-project-application-security-verification-standard/                                                           |
| OWASP MASVS 2.0                      | Mobile application security verification baseline.                                                                                                | https://mas.owasp.org/                                                                                                              |
| NIST SP 800-218 SSDF                 | Secure software development framework; CI/CD and release hygiene.                                                                                 | https://csrc.nist.gov/pubs/sp/800/218/final                                                                                         |
| NIST SP 800-63B-4                    | Authentication; PKCE guidance; passkey/biometric expectations.                                                                                    | https://csrc.nist.gov/pubs/sp/800/63/b/4/final                                                                                      |
| NIST SP 800-207                      | Zero Trust Architecture; enterprise policy enforcement points.                                                                                    | https://csrc.nist.gov/pubs/sp/800/207/final                                                                                         |
| RFC 9700 — OAuth 2.0 Security BCP    | Mandates PKCE; prohibits implicit and hybrid flows for all new implementations.                                                                   | https://www.rfc-editor.org/rfc/rfc9700                                                                                              |
| RFC 9449 — DPoP                      | Demonstrating Proof-of-Possession; token binding for high-assurance enterprise.                                                                   | https://www.rfc-editor.org/rfc/rfc9449                                                                                              |
| GitHub Actions security hardening    | CI/CD supply-chain security.                                                                                                                      | https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions                |
| SLSA supply-chain specification v1.2 | Build provenance levels; Level 2 minimum / Level 3 for enterprise.                                                                                | https://slsa.dev/spec/v1.2/                                                                                                         |
| Sigstore / Cosign                    | Keyless artifact signing; Rekor transparency log.                                                                                                 | https://www.sigstore.dev/                                                                                                           |
| OPA — Open Policy Agent              | Policy-as-code authorization engine (ABAC/RBAC).                                                                                                  | https://www.openpolicyagent.org/                                                                                                    |
| AWS Cedar                            | Formally verified policy language for application authorization.                                                                                  | https://www.cedarpolicy.com/                                                                                                        |
| OpenTelemetry                        | CNCF-graduated observability standard; traces, metrics, logs.                                                                                     | https://opentelemetry.io/                                                                                                           |
| ISO/IEC 27001:2022                   | Information security management system.                                                                                                           | https://www.iso.org/standard/27001                                                                                                  |
| ISO/IEC 27701:2025                   | Privacy information management; GDPR programme alignment.                                                                                         | https://www.iso.org/standard/27701                                                                                                  |
| ISO/IEC 42001:2023                   | AI management system; required for enterprise cloud AI.                                                                                           | https://www.iso.org/standard/42001                                                                                                  |
| WCAG 2.2                             | Web accessibility; AA conformance for enterprise procurement.                                                                                     | https://www.w3.org/TR/WCAG22/                                                                                                       |
| EDPB Article 17 enforcement          | 2026 EDPB coordinated enforcement action on right to erasure.                                                                                     | https://www.edpb.europa.eu/our-work-tools/our-documents/other/coordinated-enforcement-action-implementation-right-erasure_en        |
| Crypto-shredding for GDPR            | Key-destruction-as-erasure technical pattern; EU DPA acceptance basis.                                                                            | https://oneuptime.com/blog/post/2026-02-17-how-to-set-up-crypto-shredding-for-gdpr-right-to-erasure-compliance-in-google-cloud/view |
| OWASP Secure Headers Project         | `Permissions-Policy` and HTTP security header recommendations.                                                                                    | https://owasp.org/www-project-secure-headers/                                                                                       |
| Apple App Transport Security         | iOS ATS configuration; `NSAllowsArbitraryLoads: false` requirement.                                                                               | https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity                          |
| Android Network Security Config      | Android platform-level network restriction.                                                                                                       | https://developer.android.com/privacy-and-security/network-security-config                                                          |
| Turborepo                            | Monorepo build orchestration; task pipelines, local and remote caching.                                                                           | https://turbo.build/repo/docs                                                                                                       |
| ESLint v9 flat config                | Flat config system replaces `.eslintrc`; `typescript-eslint` strictTypeChecked for type-aware rules.                                              | https://eslint.org/docs/latest/use/configure/configuration-files                                                                    |
| Conventional Commits                 | Commit message convention; basis for automated CHANGELOG and semantic versioning.                                                                 | https://www.conventionalcommits.org/                                                                                                |
| Changesets                           | Versioning and CHANGELOG management for pnpm monorepos.                                                                                           | https://github.com/changesets/changesets                                                                                            |
| Renovate                             | Automated dependency update bot; security alert auto-merge, grouped updates.                                                                      | https://docs.renovatebot.com/                                                                                                       |
| Drizzle ORM                          | TypeScript-first ORM; SQL migration files; no query engine sidecar; compatible with PostgreSQL RLS.                                               | https://orm.drizzle.team/                                                                                                           |
| openapi-typescript                   | Generate TypeScript types from OpenAPI 3.1 spec; zero runtime; compile-time only.                                                                 | https://openapi-ts.dev/                                                                                                             |
| Google distroless images             | Minimal container runtime images; no shell; significantly reduced attack surface.                                                                 | https://github.com/GoogleContainerTools/distroless                                                                                  |
| Lighthouse CI                        | Automated Lighthouse performance/accessibility/best-practices scoring in CI.                                                                      | https://github.com/GoogleChrome/lighthouse-ci                                                                                       |
| Valibot                              | ~1.4 kB runtime schema validation library; pipe-based API; structurally equivalent to Zod for this codebase's use cases; safe for offline bundle. | https://valibot.dev/                                                                                                                |
| Zod v4                               | Runtime schema validation for server-side only (`server/`); broad ecosystem integration (tRPC, Drizzle, Hono); never import in offline bundle.    | https://zod.dev/                                                                                                                    |
| GitHub dependency-review-action      | Block PRs that introduce dependencies with known CVEs; integrates with GitHub Advisory Database.                                                  | https://github.com/actions/dependency-review-action                                                                                 |
| GitHub CodeQL                        | Semantic code analysis for security vulnerabilities; runs on schedule and on every PR.                                                            | https://codeql.github.com/                                                                                                          |

---

# 18. Monorepo Build Orchestration (Turborepo)

Turborepo is the 2026 standard for TypeScript monorepo build orchestration. It provides task pipelines, intelligent local caching, and optional remote caching — ensuring that `pnpm run build:offline` only rebuilds what changed, not the entire workspace. It has no runtime presence in any shipped artifact.

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "vite.config.ts", "tsconfig.json"],
      "outputs": ["dist/**"]
    },
    "build:offline": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "vite.config.ts", "tsconfig.json"],
      "outputs": ["../../dist/offline/**"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tests/**"]
    },
    "test:watch": {
      "cache": false,
      "persistent": true
    }
  }
}
```

| **Task**        | **Depends on**        | **Inputs cached**                           | **Outputs cached**      |
| --------------- | --------------------- | ------------------------------------------- | ----------------------- |
| `build`         | upstream `^build`     | `src/**`, `vite.config.ts`, `tsconfig.json` | `dist/**`               |
| `build:offline` | upstream `^build`     | `src/**`, `vite.config.ts`, `tsconfig.json` | `dist/offline/**`       |
| `typecheck`     | upstream `^typecheck` | `src/**`, `tsconfig.json`                   | None (type errors only) |
| `lint`          | nothing               | `src/**`, `eslint.config.mjs`               | None                    |
| `test`          | upstream `^build`     | `src/**`, `tests/**`                        | Test results            |

**Remote cache**: Connect to Vercel Remote Cache or a self-hosted Turborepo Remote Cache instance for CI speed gains. Add `TURBO_TOKEN` and `TURBO_TEAM` to CI secrets. Remote caching is especially valuable for the offline build — the Vite bundle step is skipped entirely on cache hit when no inputs changed.

**Why not Nx?** Both Nx and Turborepo are valid. Turborepo is the lower-ceremony option — one `turbo.json`, no additional plugins, no project graph config. Choose Nx if the monorepo grows to 20+ packages and the project graph visualization and Nx generators become valuable.

---

# 19. Root-level Configuration Files

A consistent set of root-level config files ensures code quality and developer experience uniformly across all packages and apps. These files must exist before any feature work begins.

**TypeScript base config** — every package `tsconfig.json` extends this:

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "paths": {
      "@config/*": ["./config/*"]
    }
  }
}
```

**Key options:**

- `exactOptionalPropertyTypes` — prevents assigning `undefined` to an optional field; catches bugs in record updates.
- `noUncheckedIndexedAccess` — array and record lookups return `T | undefined`, forcing null checks.
- `verbatimModuleSyntax` — enforces `import type` for type-only imports; required for correct Vite tree-shaking.
- `"@config/*"` path alias — allows `import { OFFLINE_BROWSER_AI_PROFILE } from '@config/build-profiles/offline-browser-ai.profile'` from any package without relative path climbing.

**ESLint v9 flat config** — critical rule highlights:

```javascript
// eslint.config.mjs
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import security from 'eslint-plugin-security'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Use safe render helpers instead of raw innerHTML.',
        },
      ],
    },
  },
)
```

The `no-restricted-syntax` rule blocking raw `innerHTML` enforces the Trusted Types migration path from Section 8 at the lint level — developers see the error in their editor before CI does.

**Renovate config** — automated dependency updates with security-first settings:

```json
// renovate.json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "timezone": "UTC",
  "schedule": ["every weekend"],
  "lockFileMaintenance": { "enabled": true },
  "packageRules": [
    { "matchDepTypes": ["devDependencies"], "automerge": true },
    { "matchPackageNames": ["vite", "typescript", "pnpm"], "groupName": "build-tooling" },
    { "matchPackageNames": ["@capacitor/*"], "groupName": "capacitor" }
  ],
  "vulnerabilityAlerts": { "enabled": true, "automerge": false }
}
```

Vulnerability alerts are not auto-merged — they require human review. Non-security dev dependency updates are auto-merged after CI passes to reduce manual review burden.

| **Config file**       | **Purpose**                                   | **Do not**                                                                                                 |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `tsconfig.base.json`  | Single shared TypeScript options baseline.    | Duplicate compiler options per package. Each package `tsconfig.json` should only extend and add `include`. |
| `eslint.config.mjs`   | Single lint config for all packages.          | Use package-level `.eslintrc` files — they make rule inconsistencies invisible.                            |
| `prettier.config.mjs` | Single formatting standard.                   | Add Prettier config to individual packages.                                                                |
| `.editorconfig`       | Editor-agnostic line endings and indentation. | Rely on editor defaults — they vary per developer.                                                         |
| `.nvmrc`              | Node.js version pin.                          | Specify Node version only in CI — it will drift from local.                                                |
| `renovate.json`       | Automated dependency PRs.                     | Use Dependabot only — it cannot group updates or auto-merge dev deps as flexibly.                          |

---

# 20. Developer Experience and Local Setup

A reproducible local setup reduces onboarding friction and eliminates "works on my machine" failures. Every contributor — including future enterprise security reviewers — must be able to reach a running build from a cold clone in under five minutes.

**Prerequisites:**

```
Node.js  — pinned in .nvmrc; use nvm or mise/asdf to switch versions automatically
pnpm     — v11+; install via corepack: corepack enable && corepack use pnpm@11
Git      — 2.44+
```

**First-time setup:**

```bash
git clone https://github.com/your-org/tktaskapp
cd tktaskapp
corepack enable
corepack use pnpm@11
pnpm install
pnpm turbo run build:offline
open dist/offline/index.html   # Chrome or Edge
```

**Pre-commit hooks (Husky + lint-staged):**

```
.husky/
    commit-msg    ← validate commit message format (commitlint + Conventional Commits)
    pre-commit    ← run lint-staged on staged files (eslint --fix, prettier --write)
    pre-push      ← run typecheck and tests for changed packages (turbo run test --filter=[HEAD^1])
```

```json
// package.json (root) — lint-staged config
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yaml,yml}": ["prettier --write"]
  }
}
```

The `pre-push` hook uses `--filter=[HEAD^1]` to run only the tests for packages touched since the last commit. This keeps the hook fast without skipping real coverage.

**Commit message convention (Conventional Commits):**

```
<type>(<scope>): <description>

feat(auth): add TOTP step-up for high-risk operations
fix(vault): handle corruption in legacy 310k KDF import
chore(deps): update vite to 6.2.1
docs(adr): add 0006-gdpr-crypto-shredding architecture decision
test(security): add BOLA/IDOR suite for project endpoints
perf(crypto): switch base64 to Uint8Array.prototype.toBase64()
```

Valid types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`

Changesets use this convention to determine whether a commit warrants a version bump. A PR without a changeset file and without a `chore`/`ci`/`docs`/`test` prefix in its commit messages will be flagged by the Changesets bot.

**Dev Container (`.devcontainer/devcontainer.json`):**

A Dev Container definition ensures all contributors — including those joining later without context — use the same Node version, pnpm version, and OS-level security tooling (Semgrep, Gitleaks, cosign, trivy). Enterprise contributors additionally get the PostgreSQL service and OpenTelemetry collector in the container composition. The container is the single source of truth for CI reproducibility.

---

# 21. API Design and Contract (Enterprise)

The enterprise server API is **spec-first**: the OpenAPI 3.1 document is the source of truth, and all TypeScript request/response types are generated from it. No route is added without a corresponding OpenAPI operation. No operation is changed without a corresponding diff in `openapi.yaml`.

```
docs/api/
    openapi.yaml             ← OpenAPI 3.1 source of truth (hand-authored; spec-first)
    CHANGELOG.md             ← API version history

server/src/api/
    generated/
        types.ts             ← generated from openapi.yaml via openapi-typescript (zero runtime)
        validators.ts        ← generated Zod v4 validators via openapi-zod-client (server-side only)
    routes/
        clients.ts
        projects.ts
        tasks.ts
        documents.ts
        audit.ts
        admin/
            users.ts
            tenant.ts
            ai-policy.ts
```

**Toolchain:**

- `openapi-typescript` — generates `types.ts` from `openapi.yaml`. Zero runtime cost. Compile-time only.
- `openapi-zod-client` — generates Zod v4 validators for server-side request validation. Lives in `server/` exclusively; never imported by `packages/core/`.
- Live API docs served at `/api/docs` in non-production environments via the framework's built-in OpenAPI UI.

**API versioning policy:**

- Version prefix in all paths: `/api/v1/...`
- Breaking changes require a new version prefix; non-breaking additions are additive within the current version.
- Deprecated endpoints are served for two major versions minimum before removal.
- `Sunset` and `Deprecation` response headers included on deprecated routes.
- API changelog is maintained in `docs/api/CHANGELOG.md` independently of the application `CHANGELOG.md`.

**Why spec-first?** Generated types eliminate the class of bugs where the TypeScript interface drifts from the actual wire format. It also makes breaking changes visible in PR diffs — a changed `openapi.yaml` is an explicit, reviewable contract change, not a silent property rename in a types file.

---

# 22. Database and ORM (Enterprise)

The enterprise server uses a relational database. **Drizzle ORM** is the recommended choice for new TypeScript server projects in 2026: it is typesafe, generates SQL migration files (not ORM-code-first), has no magic, and does not add a query engine sidecar process to the deployment.

**Why Drizzle over Prisma:**

- Drizzle generates plain SQL migration files — auditable, reviewable by a DBA, and applicable by standard tooling.
- No separate query engine process — just SQL over a standard `pg` driver. Simpler container deployment.
- Queries are typed at the call site; no extra client regeneration step in CI.
- Smaller runtime footprint; no C++ binding dependencies.
- Compatible with serverless and edge runtimes.

```
server/src/db/
    schema/
        users.ts             ← tenant_users, user_roles, user_kms_keys
        clients.ts
        projects.ts
        tasks.ts
        documents.ts
        audit-events.ts      ← append-only; INSERT only; no UPDATE/DELETE
        kms-keys.ts          ← key_id, user_id, status, created_at, scheduled_destroy_at
    migrations/
        0001_initial.sql
        0002_add_kms_keys.sql
        0003_audit_events.sql
    index.ts                 ← drizzle() instance, connection pool, exported schema
```

**Row-Level Security (RLS):** All tables with `tenant_id` have PostgreSQL RLS policies enforced at the database layer. The application sets `app.current_tenant_id` as a session parameter on every connection before queries execute. This provides defence-in-depth independent of application authorization — a bug in the OPA/Cedar policy layer cannot expose cross-tenant data because the database rejects the query before it returns rows.

```sql
-- Example RLS policy on the clients table
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_tenant_isolation ON clients
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Migration practices:**

- Migration files are plain SQL, checked into `server/src/db/migrations/`, and applied in CI via `drizzle-kit migrate` before integration tests.
- Every migration has a rollback comment block documenting the inverse operation.
- Destructive migrations (`DROP COLUMN`, `DROP TABLE`) require a separate PR reviewed by a senior engineer.
- Production migrations require a named approver in the deployment pipeline before the release job proceeds.

---

# 23. Release Management and Versioning

**Changesets** (`@changesets/cli`) is the release management tool for 2026 monorepos. Each PR that warrants a version bump includes a changeset file — a small Markdown file in `.changeset/` created by running `pnpm changeset` — that describes the change type (`major`, `minor`, or `patch`) and a human-readable summary. On merge to main, the Changesets GitHub Action aggregates pending changesets and opens a Release PR.

```
.changeset/
    README.md           ← instructions for contributors; generated by Changesets on init
    config.json         ← baseBranch, linked packages, access level, changelog format
```

```json
// .changeset/config.json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

**Workflow:**

1. Developer runs `pnpm changeset`, selects affected packages and bump type, writes a human-readable description.
2. The generated `.changeset/<id>.md` file is committed with the PR.
3. The Changesets bot comments on the PR summarising what will be released.
4. On merge to `main`, the Changesets GitHub Action opens a Release PR that aggregates all pending changesets into version bumps and `CHANGELOG.md` entries.
5. Approving and merging the Release PR triggers the CI release workflow (build, sign, publish).

**Versioning policy:**

- Semantic versioning (`MAJOR.MINOR.PATCH`) for all packages.
- `0.x.y` while packages are not yet considered stable for external consumption.
- `1.0.0` on a package is a commitment to the public API contract. Breaking changes after `1.0.0` require a `major` bump and an ADR.
- The offline single-file artifact version is stamped into `<meta name="version" content="...">` at build time from the root `package.json` version.
- Do not manually edit `CHANGELOG.md` — Changesets manages it. Human-authored context belongs in PR descriptions, ADRs, and release notes.

---

# 24. Performance Budgets and Bundle Size Gates

For a product that ships as a single self-contained HTML file, bundle size is a first-class constraint enforced in CI — not a post-hoc concern. A `no-ai` offline profile that silently reaches 2 MB is a security and usability regression: users transferring the file across air-gapped networks or on restricted corporate connections will notice.

**Target budgets (based on current ~276 kB uncompressed baseline):**

| **Build profile**            | **Max raw size** | **Max gzip size** |
| ---------------------------- | ---------------- | ----------------- |
| `offline-no-ai`              | 300 kB           | 90 kB             |
| `offline-browser-ai`         | 320 kB           | 95 kB             |
| `offline-internal-ai`        | 320 kB           | 95 kB             |
| `mobile` (initial JS bundle) | 400 kB           | 120 kB            |

**CI enforcement script:**

```javascript
// scripts/assert-bundle-size.mjs
import { readFileSync } from 'fs'
import { gzipSync } from 'zlib'

const BUDGETS = {
  'dist/offline/index.html': { raw: 300_000, gzip: 90_000 },
}

let failed = false
for (const [file, budget] of Object.entries(BUDGETS)) {
  const raw = readFileSync(file)
  const gz = gzipSync(raw)
  if (raw.length > budget.raw) {
    console.error(`FAIL ${file}: raw ${raw.length} > ${budget.raw}`)
    failed = true
  }
  if (gz.length > budget.gzip) {
    console.error(`FAIL ${file}: gzip ${gz.length} > ${budget.gzip}`)
    failed = true
  }
}
if (failed) process.exit(1)
```

Wire into `ci.yml` as a step that runs immediately after `pnpm run build:offline`.

**Key budget drivers to watch:**

- **Valibot vs Zod:** Valibot is ~1.4 kB gzip; Zod standard is ~17.7 kB. The forbidden-string bundle test catches `import ... from 'zod'` in the offline artifact. The bundle size gate provides a second enforcement layer.
- **AI provider stubs:** The offline Vite config aliases cloud providers to disabled stubs. Verify aliases are working — a mis-configured alias can silently include the full Anthropic/OpenAI SDK.
- **DOMPurify:** Already in the bundle (~17 kB gzip); required; not removable.
- **Icons:** Inline SVG renders as text in the HTML file and compresses extremely well; not a concern.

**Lighthouse CI** (enterprise web builds only): Run against a staging environment after each deploy. Target scores: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 80. The Accessibility score from Lighthouse is a supplement to, not a replacement for, the manual WCAG 2.2 AA audit described in Section 1.

---

# 25. Infrastructure and Deployment (Enterprise)

The enterprise server is a containerized application. The target deployment platform is any standard container runtime: Kubernetes (GKE, AKS, EKS), Azure Container Apps, AWS ECS, or Google Cloud Run. The container image and deployment manifests are first-class artefacts with the same supply-chain controls as the JavaScript bundles.

```
Dockerfile                       ← multi-stage: builder + distroless runtime
docker-compose.yml               ← local dev stack: server + postgres + otel-collector + jaeger

infra/                           ← create when enterprise work begins
    k8s/
        deployment.yaml
        service.yaml
        ingress.yaml
        hpa.yaml                 ← horizontal pod autoscaler
        network-policy.yaml      ← deny-all ingress/egress except approved paths
    terraform/                   ← optional cloud resource provisioning
```

**Multi-stage Dockerfile:**

```dockerfile
# Builder stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm turbo run build:server

# Runtime stage — distroless: no shell, no package manager, minimal attack surface
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER nonroot
EXPOSE 3000
CMD ["dist/server.js"]
```

**Security requirements for the container:**

| **Control**               | **Implementation**                                                                         | **Why**                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Non-root user             | `USER nonroot` (distroless)                                                                | Limits blast radius of container escape.                                           |
| No shell                  | Distroless base image                                                                      | Eliminates shell injection as a post-exploitation technique.                       |
| Read-only root filesystem | `readOnlyRootFilesystem: true` in pod spec                                                 | Prevents runtime file tampering; forces intentional temp mounts.                   |
| No privilege escalation   | `allowPrivilegeEscalation: false`                                                          | Prevents `setuid` abuse inside the container.                                      |
| Network policy            | Deny-all ingress except load balancer; deny-all egress except DB, KMS, IdP, OTel endpoints | Limits lateral movement if the container is compromised.                           |
| Image signing             | Cosign keyless signing in `release-enterprise.yml`                                         | Verifiable artifact integrity; prevents substitution attacks.                      |
| Admission webhook         | `policy-controller` or Kyverno verifies Cosign signature before deploy                     | Enforces the signing requirement at the cluster level; CI alone is not sufficient. |

**Health endpoints:**

```typescript
// server/src/api/routes/health.ts
GET /healthz   ← liveness probe: returns 200 if the process is running
GET /readyz    ← readiness probe: returns 200 only after DB connection and KMS connectivity confirmed
```

Kubernetes probes should use `/readyz` for both liveness (after startup) and readiness. During startup, only `/healthz` is probed. This prevents Kubernetes from routing traffic to a pod that has not yet established its required connections.

**Secret management:**

Environment variables injected via Kubernetes secrets or cloud-native secret managers (Azure Key Vault CSI Driver, AWS Secrets Manager, GCP Secret Manager). Secrets are never hardcoded, never baked into the container image, and never logged. The `SECURITY.md` at repo root documents the secret rotation procedure and the escalation path for suspected secret exposure.
