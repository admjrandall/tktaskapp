# AGENTS.md

This file gives Codex accurate guidance for working with the Task App CRM monorepo.
All information is derived directly from the current codebase — not from any prior cached description.

Get Current Date.
Never guess or assume.
If you're unsure, ask questions.
Always use the AskUserQuestion tool to ask questions.
Wait for an answer before providing any comments or code.
Always use the most recent versions, security and best practices without compromise.
Search the internet to ensure you have the most current information.
If you get stuck in a loop trying to fix an issue, try twice, then stop and discuss.

## Production readiness standard

When the user asks for production readiness, treat "production ready" as final maturity, not partial remediation. Do not leave fixable items as "mostly closed", "closed for implemented controls", "placeholder", "future work", or "should be revisited" when code, tests, scripts, or documentation can close the gap now. Refactor or rework as needed.

If a control depends on environment-specific values that cannot be discovered from the repo, convert it into a fail-closed required configuration, checked template, validation script, or explicit deployment gate. Ask the user only for real external values that are required to generate a deployable artifact, such as production CIDRs, domains, tenant IDs, or secrets.

---

## What this is

**Task App CRM** — an offline-first, AES-256-GCM encrypted CRM with three delivery types. The app is developed as a **TypeScript monorepo** (pnpm workspaces, Vite build) around a shared core UI in `packages/core/src/`. The product has three delivery types: the **offline-web** artifact (single self-contained HTML file, no server, runs from `file://`), the **enterprise-web** PWA (HTTPS-hosted, server-backed, installable on desktop and mobile), and the **dataverse** Code App (Power Platform, Microsoft Dataverse).

Target-specific behavior belongs in the thin app entry points under `apps/`; shared business logic and UI stay in `packages/core/src/`. Each target sets a deployment policy and injects the appropriate adapter before calling `init()`.

The legacy single-file source (`taskapp.html`, ~7,853 lines) still exists in the repo root as a reference but is **no longer the active codebase**. All development happens in the monorepo packages.

---

## Repository structure

```
d:\techkeycrmapp\
├── package.json                  ← pnpm workspace root; build scripts
├── pnpm-workspace.yaml
├── packages/
│   ├── core/src/                 ← all app logic (TypeScript)
│   │   ├── constants.ts
│   │   ├── adapter-interface.ts
│   │   ├── deployment-policy.ts
│   │   ├── state.ts
│   │   ├── utils.ts
│   │   ├── main.ts               ← entry point, exported init()
│   │   ├── bootstrap.ts          ← app bootstrap / startup sequence
│   │   ├── branding.ts           ← app name, logo, theme tokens
│   │   ├── hooks-wiring.ts       ← wires hook-injection calls for all view modules
│   │   ├── render-pipeline.ts    ← fullRender, appRenderWorkspace, event delegation
│   │   ├── render-utils.ts       ← patchInnerHTML and low-level DOM helpers
│   │   ├── voice-input.ts        ← Web Speech API voice input integration
│   │   ├── app-lock.ts           ← idle-timeout / screen-lock logic
│   │   ├── styles/main.css
│   │   ├── security/             ← auth and crypto modules
│   │   │   ├── trusted-types.ts  ← MUST be first import in main.ts
│   │   │   ├── crypto.ts
│   │   │   ├── session.ts
│   │   │   ├── vault.ts
│   │   │   ├── sanitize.ts
│   │   │   ├── totp.ts
│   │   │   ├── webauthn.ts
│   │   │   ├── mfa.ts
│   │   │   ├── audit.ts
│   │   │   └── auth.ts
│   │   ├── storage/              ← IDB and file-system persistence
│   │   │   ├── idb-data.ts
│   │   │   ├── db.ts
│   │   │   └── fs.ts
│   │   ├── ui/                   ← shared UI primitives
│   │   │   ├── components.ts
│   │   │   ├── icons.ts
│   │   │   ├── design-tokens.ts  ← CSS custom-property token definitions
│   │   │   └── primitives/       ← low-level UI atom components
│   │   │       ├── index.ts
│   │   │       ├── avatar.ts
│   │   │       ├── badge.ts
│   │   │       ├── button.ts
│   │   │       ├── input.ts
│   │   │       └── modal.ts
│   │   ├── schemas/              ← Valibot / runtime schemas
│   │   │   ├── index.ts
│   │   │   ├── client.schema.ts
│   │   │   ├── project.schema.ts
│   │   │   ├── task.schema.ts
│   │   │   ├── person.schema.ts
│   │   │   ├── document.schema.ts
│   │   │   ├── file.schema.ts
│   │   │   ├── import.schema.ts
│   │   │   ├── audit.schema.ts
│   │   │   ├── ai-tool.schema.ts
│   │   │   ├── communication.schema.ts
│   │   │   ├── department.schema.ts
│   │   │   ├── conversation.schema.ts
│   │   │   ├── time-entry.schema.ts
│   │   │   ├── notification.schema.ts
│   │   │   ├── tag.schema.ts
│   │   │   ├── standalone-note.schema.ts
│   │   │   ├── deal.schema.ts
│   │   │   ├── pipeline.schema.ts
│   │   │   ├── custom-field.schema.ts
│   │   │   ├── ai-attribute.schema.ts
│   │   │   ├── extension-object.schema.ts
│   │   │   ├── workspace-layout.schema.ts
│   │   │   └── persona.schema.ts
│   │   ├── views/                ← one file per view
│   │   │   ├── admin-console.ts, calendar.ts, communications.ts, dashboard.ts
│   │   │   ├── documents.ts, files.ts, library.ts, list-grid-kanban-spatial.ts
│   │   │   ├── onboarding.ts, project-canvas.ts, record-modal.ts, reports.ts
│   │   │   ├── settings.ts, settings-user.ts, sidebar.ts, time-tracker.ts
│   │   │   ├── topbar.ts, trash.ts, workspace-canvas.ts, workspace.ts
│   │   ├── personas/             ← PERSONA_PRESETS for all 5 persona IDs
│   │   │   ├── index.ts
│   │   │   └── ot-ics-extension-objects.ts  ← OT/ICS-specific extension object schemas
│   │   ├── application/          ← placeholder — application layer (Phase 1)
│   │   ├── domain/               ← placeholder — domain layer (Phase 1)
│   │   ├── migrations/           ← placeholder — migrations layer (Phase 1)
│   │   ├── platform/             ← placeholder — platform layer (Phase 1)
│   │   └── ai/                   ← AI subsystem
│   │       ├── ai-prefs.ts, ai-runtime.ts, ai-tools.ts, ai-settings.ts, ai-ui.ts
│   │       ├── attributes-engine.ts   ← AI-driven attribute inference engine
│   │       ├── adaptive-engine.ts     ← adaptive suggestion / learning engine
│   │       └── providers/
│   │           ├── browser-nano.ts            ← Chrome Gemini Nano / Edge Phi-4-mini
│   │           ├── browser-transformers.ts    ← WebGPU via @huggingface/transformers
│   │           ├── browser-ai-disabled.ts     ← stub used when browser AI is off
│   │           ├── browser-transformers-disabled.ts ← stub for non-WebGPU builds
│   │           ├── cloud-disabled.ts          ← stub when cloud AI is disallowed
│   │           ├── ollama.ts, anthropic.ts, openai.ts, google.ts, powerplatform.ts
│   ├── adapter-null/src/index.ts          ← NullAdapter (offline/no-sync, no-op)
│   ├── adapter-rxdb/src/index.ts          ← Hono sync adapter for PWA/mobile/enterprise targets
│   ├── adapter-rxdb-couchdb/src/index.ts  ← RxDB adapter using CouchDB replication protocol
│   ├── adapter-dataverse/src/index.ts     ← DataverseAdapter stub
│   ├── adapter-kms/src/index.ts           ← KMS adapter interface (Azure KV / AWS KMS / HashiCorp; GDPR crypto-shredding contract)
│   └── adapter-mobile-native/src/         ← Mobile native adapters (Capacitor)
│       ├── index.ts
│       ├── mobile-vault-adapter.ts
│       ├── mobile-backup-adapter.ts
│       ├── biometric-unlock-adapter.ts
│       └── network-policy.ts
├── apps/
│   ├── offline-web/              ← Vite entry for all offline build profiles
│   │   ├── index.html            ← entry-browser-ai.ts (default build)
│   │   ├── src/
│   │   │   ├── entry-browser-ai.ts  ← browser AI only (Gemini Nano / Phi-4-mini); default build:offline
│   │   │   ├── entry-no-ai.ts       ← zero AI code
│   │   │   └── entry-internal-ai.ts ← browser AI + private Ollama endpoints; OT_AI_CONNECT_SRC at build
│   │   ├── vite.config.ts        ← builds browser-ai profile → dist/offline/index.html
│   │   └── README.md             ← documents three sub-profiles
│   ├── dataverse/                ← Power Apps Code App build using DataverseAdapter
│   ├── mobile/                   ← Capacitor native packaging only (iOS/Android); web assets come from dist/enterprise
│   │   ├── capacitor.config.ts   ← webDir: ../../dist/enterprise
│   │   ├── ios/                  ← iOS ATS config, PrivacyInfo.xcprivacy
│   │   └── android/              ← Android NSC (cleartextTrafficPermitted=false)
│   └── enterprise-web/           ← HTTPS PWA: browser + mobile browser + Capacitor WebView
│       ├── index.html            ← PWA meta, manifest link, app.css
│       ├── vite.config.ts        ← hashed assets build → dist/enterprise/
│       ├── src/
│       │   ├── entry.ts          ← OIDC/PKCE bootstrap, health check, SW registration, gestures
│       │   └── gestures.ts       ← touch swipe gestures (active on touch devices only)
│       └── public/
│           ├── manifest.webmanifest ← W3C PWA manifest; id, display_override, shortcuts
│           ├── sw.js             ← service worker; cache-first assets, network-first API, SPA fallback
│           └── app.css           ← safe-area insets, 44px touch targets, responsive layout
├── dist/
│   └── offline/index.html        ← built single-file output (open this in browser)
├── server/                       ← Hono v4 REST API backend (Node.js, TypeScript)
│   ├── src/
│   │   ├── index.ts              ← entry point; OTel init, Hono app, graceful shutdown
│   │   ├── hono-types.ts         ← shared Hono context variable type definitions
│   │   ├── db/
│   │   │   ├── index.ts          ← Drizzle ORM pg pool + closeDb()
│   │   │   ├── migrate.ts        ← run Drizzle migrations
│   │   │   ├── seed.ts           ← dev seed data (idempotent)
│   │   │   └── schema/           ← Drizzle table definitions (CRM entities + audit + KMS + users + org/sync/integrations)
│   │   ├── auth/
│   │   │   ├── oidc.ts           ← OidcService interface + validateEntraIdToken
│   │   │   ├── oidc-service.ts   ← OidcServiceImpl (PKCE, token exchange, JWKS validation via jose)
│   │   │   └── middleware.ts     ← authMiddleware — sets userId/tenantId/role on context
│   │   ├── authorization/
│   │   │   └── policy-engine.ts  ← deny-by-default TypeScript ABAC engine (Phase 9+: replace with OPA/Cedar)
│   │   ├── middleware/
│   │   │   ├── cors.ts           ← ALLOW_ORIGINS whitelist; no wildcards
│   │   │   ├── lockdown.ts       ← lockdown mode middleware (emergency access restriction)
│   │   │   └── opa.ts            ← opaMiddleware(action) factory; REST → WASM → in-process fallback
│   │   ├── observability/
│   │   │   ├── otel.ts           ← OtelServiceImpl; OTLPTraceExporter (HTTP); must init first
│   │   │   ├── middleware.ts     ← otelMiddleware; root span per request; X-Trace-Id header
│   │   │   └── metrics.ts        ← RED metrics (requests counter, duration histogram, connections gauge)
│   │   ├── services/             ← one service file per CRM entity; all use withTenant() + writeAuditEvent()
│   │   ├── api/routes/           ← one Hono router per entity; Zod validation; OPA per route
│   │   │   └── (includes: sync.ts, ai-attributes.ts, health.ts in addition to all CRM entities)
│   │   ├── types/
│   │   │   └── vendor.d.ts       ← ambient type declarations for third-party modules
│   │   ├── kms/
│   │   │   ├── key-service.ts    ← AzureKeyVaultKeyService; scheduleKeyExpiry / getKeyUri
│   │   │   ├── legal-hold.ts     ← LegalHoldService; placeHold / liftHold / isUserOnHold
│   │   │   ├── erasure-workflow.ts ← runDataRemovalWorkflow; retention hold check → KMS schedule → soft-delete → audit
│   │   │   └── destruction-scheduler.ts ← polls kmsKeyLifecycle every 60s; calls Azure KV scheduleKeyExpiry
│   │   └── ai-gateway/
│   │       └── policy-engine.ts  ← evaluateAiGatewayRequest; model allowlist, rate limit, budget, PII scrub
│   ├── policies/
│   │   └── crm.rego              ← OPA policy (role-based allow/deny + cross-tenant deny)
│   ├── drizzle/                  ← generated SQL migrations
│   ├── drizzle.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.example              ← all required env vars documented
├── generate-csp.mjs              ← regenerates CSP hashes in dist file
├── taskapp.html                  ← legacy reference (not active codebase)
└── *.md                          ← documentation
```

---

## Build

```bash
pnpm run build:offline    # builds dist/offline/index.html + regenerates CSP
pnpm run build:enterprise # builds dist/enterprise/ (hashed assets, PWA)
pnpm run build:mobile     # alias for build:enterprise (Capacitor uses dist/enterprise)
pnpm run build:dataverse  # builds Power Apps Code App bundle
pnpm run build:all        # build:offline + build:enterprise + build:mobile + build:dataverse
pnpm run typecheck        # TypeScript type check (no emit)
```

After `build:offline`, open `dist/offline/index.html` in Chrome or Edge. No server needed. The enterprise-web and dataverse targets require their respective backend/platform services. The Hono server serves `dist/enterprise/` as static assets when `ENTERPRISE_STATIC_DIR` is set.

## Deployment targets

The repo has **three delivery types** sharing one core UI:

| Delivery type  | Entry                                      | Adapter            | Runtime intent                                                                                                           |
| -------------- | ------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Offline web    | `apps/offline-web/src/entry-browser-ai.ts` | `NullAdapter`      | Single-file portable artifact; no server; runs from `file://`                                                            |
| Enterprise web | `apps/enterprise-web/src/entry.ts`         | `RxDBAdapter`      | HTTPS PWA: browser desktop, mobile browser (installable), and Capacitor WebView; BFF OIDC/PKCE; service worker; gestures |
| Dataverse      | `apps/dataverse/src/entry.ts`              | `DataverseAdapter` | Power Platform Code App; auth via `__msalToken`; hosted and governed by Microsoft Power Platform                         |

`apps/mobile/` is now Capacitor native-packaging only — no web entry. It uses `dist/enterprise` as its WebView source. `build:mobile` is an alias for `build:enterprise`.

Do not describe the whole monorepo as "offline-only." Use "offline-first" for the product architecture, and reserve "offline-only" or "local-only" for the offline-web build/profile where `NullAdapter` and offline CSP restrictions apply.

The three offline sub-profiles are built from `apps/offline-web/`:

| Profile                  | Entry                  | Build command            | AI                                                               |
| ------------------------ | ---------------------- | ------------------------ | ---------------------------------------------------------------- |
| **browser-ai** (default) | `entry-browser-ai.ts`  | `pnpm run build:offline` | Chrome Gemini Nano or Edge Phi-4-mini only — no Ollama, no cloud |
| **no-ai**                | `entry-no-ai.ts`       | Phase 1                  | Zero AI code in bundle                                           |
| **internal-ai**          | `entry-internal-ai.ts` | Phase 1                  | Browser AI + private Ollama endpoints                            |

For the **browser-ai** profile, `OT_AI_CONNECT_SRC` only affects the CSP `connect-src` directive — it does **not** enable Ollama or any other tier (the deployment policy is hard-coded to `allowedTiers: ['browser']`):

```bash
OT_AI_CONNECT_SRC="https://ai-server.internal" pnpm run build:offline
```

For the **internal-ai** profile (Phase 1), `OT_AI_CONNECT_SRC` both sets the CSP origins and enables connections to those Ollama-compatible endpoints:

```bash
OT_AI_CONNECT_SRC="http://ai-server.internal:11434" pnpm run build:offline:internal-ai
```

**After every build**, `generate-csp.mjs` runs automatically and writes:

- Updated SHA-256 hashes into the built file's CSP `<meta>` tag
- `dist/offline/index.sha256` for file integrity detection

---

## Module dependency order

Modules must be imported in this order (deeper dependencies first):

```
1.  constants.ts                   — no dependencies
2.  security/crypto.ts             — constants
3.  security/session.ts            — constants
4.  security/vault.ts              — constants, crypto
5.  storage/idb-data.ts            — constants, crypto
6.  storage/db.ts                  — constants, vault, idb-data, adapter-interface
7.  storage/fs.ts                  — constants, vault, db
8.  state.ts                       — db
9.  utils.ts                       — constants
10. ui/icons.ts                    — no dependencies
11. security/trusted-types.ts      — no dependencies (side-effect IIFE — MUST import first in main.ts)
12. ui/components.ts               — state, utils, icons, db
13. security/sanitize.ts           — dompurify (XSS sanitization for HTML/URLs)
14. security/totp.ts               — no dependencies (pure WebCrypto TOTP, RFC 6238)
15. security/webauthn.ts           — no dependencies (WebAuthn PRF passkeys; hooks injected by main.ts)
16. security/mfa.ts                — totp; hooks injected by main.ts
17. security/audit.ts              — no app deps (hooks injected by main.ts via setAuditHooks)
18. personas/index.ts              — state (PersonaId type only)
19. views/*                        — state, db, utils, icons, components, sanitize, personas
20. ai/ai-prefs.ts                 — no dependencies (localStorage only)
21. deployment-policy.ts           — no dependencies; build/profile policy
22. ai/providers/*                 — stateless; no app-layer deps
23. ai/ai-runtime.ts               — state, ai-prefs, deployment-policy, providers, (lazy: state.js)
24. ai/ai-tools.ts                 — ai-runtime, (injected: SCHEMAS, streamToBubble, finalRender)
25. ai/ai-settings.ts              — ai-prefs, ai-runtime, deployment-policy, providers/ollama
26. ai/ai-ui.ts                    — ai-runtime, ai-tools, ai-settings, ai-prefs, deployment-policy, state, utils, icons
27. security/auth.ts               — crypto, vault, session, state, utils, icons, fs, mfa
28. main.ts                        — all of the above
```

---

## Architecture patterns

### Render / bind pattern

Every view follows the same contract:

```ts
export function renderFoo(state: AppState): string {
  return `<html string>`
}
export function bindFoo(state?: AppState): void {
  /* attach event listeners */
}
```

`fullRender(state)` in `main.ts` replaces `appEl.innerHTML` entirely and re-attaches all listeners.
`appRenderWorkspace(view)` is a cheaper partial update that only replaces `#workspace-container`.

All user-visible strings **must** go through `escH()` before being interpolated into template strings. `escH()` is exported from `utils.ts`.

### Hook injection pattern

Views that need to call `appRenderWorkspace` or other main.ts functions receive them via setter functions to avoid circular imports:

```ts
// In the view module:
let _appRenderWorkspace: (view: string) => void = () => {}
export function setFooHooks(appRenderWorkspace: (v: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace
}

// In main.ts — called once before first render:
setFooHooks(appRenderWorkspace)
```

### Adapter interface

The sync layer is abstracted behind a four-method interface ([`packages/core/src/adapter-interface.ts`](packages/core/src/adapter-interface.ts)):

```ts
pull(checkpoint)      → { records, checkpoint }
push(changes)         → { conflicts }
stream(onRemoteChange) → unsubscribe fn
clear()               → void
```

`NullAdapter` is the offline/no-sync adapter and inherits all four methods as no-ops. Connected targets inject concrete adapters such as `RxDBAdapter` or `DataverseAdapter`. The core app never imports a concrete adapter directly — `setAdapter()` in `storage/db.ts` injects it from the target entry file before `init()`.

---

## Storage architecture

| What                                                  | Backend                                                                | Key / DB name                                                       | Notes                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Salt, verify token, encrypted vault blob, KDF version | IndexedDB `nexus_vault_v2` / store `meta`                              | `nexus_salt_v1`, `nexus_verify_v1`, `nexus_vault_v1`, `nexus_kdf_v` | Primary encrypted data store                                                           |
| Session `CryptoKey`                                   | IndexedDB `nexus_keys_v1` / store `sessionKey`                         | key `'active'`                                                      | Non-extractable; survives F5, clears on tab close                                      |
| Documents, Conversations                              | IndexedDB `nexus_data_v1` / stores `documents`, `conversations`        | record `id`                                                         | Each record individually AES-GCM encrypted                                             |
| FS handle (vault file pointer)                        | IndexedDB `nexus_fs_v1` / store `handles`                              | `'fileHandle'`                                                      | Chrome/Edge File System Access API handle                                              |
| Theme                                                 | `localStorage` key `taskapp_theme`                                     | —                                                                   | Non-sensitive preference                                                               |
| Dashboard layout                                      | `localStorage` key `taskapp_dash_v1`                                   | —                                                                   | Non-sensitive preference                                                               |
| AI preferences                                        | `localStorage` key `taskapp_ai_prefs_v2`                               | —                                                                   | Plaintext JSON; includes `nanoDisclaimerAcknowledged` (one-time download warning flag) |
| Cloud API keys                                        | IDB `nexus_data_v1` / record `__ai_secrets__`                          | —                                                                   | AES-GCM encrypted                                                                      |
| Audit log                                             | IDB `nexus_data_v1` / record `__audit_log__`                           | —                                                                   | AES-GCM encrypted; exportable CSV/JSON Lines                                           |
| TOTP config                                           | IDB `nexus_data_v1` / record `__mfa_totp__`                            | —                                                                   | AES-GCM encrypted; secret + enabled flag                                               |
| Passkey credentials                                   | IDB `nexus_data_v1` / record `__mfa_passkeys__`                        | —                                                                   | AES-GCM encrypted; PRF-wrapped master password per credential                          |
| Auth lockout state                                    | `localStorage` keys `nexus_auth_fail_count`, `nexus_auth_locked_until` | —                                                                   | Persists across tab close (NIST AC-7)                                                  |

---

## Crypto layer

- **PBKDF2-HMAC-SHA-256** at **600,000 iterations** (OWASP 2026 recommendation) — `security/crypto.ts`
- **AES-256-GCM** for all data at rest
- Key is **non-extractable** (`extractable: false`); never exists as a JS string
- **Base64**: uses `Uint8Array.prototype.toBase64()` (Sep 2025) with chunked `btoa` fallback. Never use `btoa(String.fromCharCode(...array))` — stack overflow on large arrays.
- **Legacy migration**: KDF version `'1'` (310k iterations) → `initCrypto()` silently re-derives at 600k

---

## Trusted Types

Two policies created once at module scope in `security/trusted-types.ts`:

- `nexus-crm` (`_ttPolicy`) — sanitises plain-text user data for `innerHTML`
- `nexus-crm-raw` (`_rawPolicy`) — passes already-safe template HTML through unchanged

`patchInnerHTML()` IIFE overrides `Element.prototype.innerHTML` — all string assignments auto-route through `_rawPolicy`. **`security/trusted-types.ts` must be the first import in `main.ts`.**

**Never call `trustedTypes.createPolicy('nexus-crm-raw', ...)` again** — throws `TypeError` on duplicate names.

---

## State management (`state.ts`)

```ts
getState() // returns current AppState
setState(patch) // shallow merge, notifies all listeners
subscribe(fn) // returns unsubscribe fn — always store it
reloadData() // pulls fresh records from _dbData into state
```

**State shape** (full `AppState` interface in `state.ts`):

```
authed, cryptoKey, currentView, sidebarCollapsed, theme, density,
clients, departments, projects, tasks, people, standaloneNotes,
tags, communications, files, timeEntries, notifications, trash,
documents, conversations,
deals, pipelines,
currentPersona, workspaceLayout, aiAttributeValues, adaptiveSuggestions, lockdownLevel,
aiPanelOpen, commandOpen, notifPanelOpen,
toast, confirmDialog, recordModal, docModal, fileViewer,
runningTimer, timerElapsed
```

---

## Database helpers (`db.ts`)

All UI code uses these — never touches IDB or the vault directly. Source: `storage/db.ts`.

```ts
dbGetAll(store) // returns copy of in-memory store array
dbGetById(store, id) // returns record or null
dbCreate(store, rec) // async — schedules debounced flush
dbUpdate(store, id, changes) // async — schedules debounced flush
dbDelete(store, id) // async — schedules debounced flush
softDelete(store, id) // moves to trash store
restoreFromTrash(trashId)
permanentDelete(trashId)
```

**CRM stores** (flushed as one encrypted blob to `nexus_vault_v2`):
`clients`, `departments`, `projects`, `tasks`, `people`, `standaloneNotes`, `tags`, `communications`, `files`, `timeEntries`, `notifications`, `trash`

**IDB stores** (each record individually encrypted in `nexus_data_v1`):
`documents`, `conversations`

**Debounced flush:** `dbCreate/Update/Delete` call `_scheduleFlush()` (300ms debounce). `beforeunload` forces immediate flush. IDB-backed stores (`documents`, `conversations`) write immediately, not via the flush.

To add a new large-content store: add to `IDB_STORES` in `constants.ts`, create its object store in `_dataDbOpen()` in `storage/idb-data.ts`, route through `_idbPutRecord` / `_idbLoadStore`. Do **not** add to `STORES`.

---

## AI system

The core supports three tiers, but build profiles may restrict them:

| Tier      | Backend                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browser` | Chrome Built-in AI (Gemini Nano) / Edge Built-in AI (Phi-4-mini) — same `window.LanguageModel` API; or transformers.js (WebGPU) in non-OT builds |
| `ollama`  | Local Ollama daemon, default `qwen2.5:3b`                                                                                                        |
| `cloud`   | Anthropic / OpenAI / Google — direct fetch, no SDK                                                                                               |

**`apps/offline-web` — three sub-profiles:**

| Profile                                  | Entry                  | Allowed AI                                                                                                                                             |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **browser-ai** (default `build:offline`) | `entry-browser-ai.ts`  | Browser built-in only: Chrome Gemini Nano or Edge Phi-4-mini via `window.LanguageModel`. Fully on-device, no network after initial model download.     |
| **no-ai**                                | `entry-no-ai.ts`       | None — `allowedTiers: []`. Zero AI code.                                                                                                               |
| **internal-ai**                          | `entry-internal-ai.ts` | Browser AI + private/LAN Ollama endpoints (`allowedTiers: ['browser', 'ollama']`). OT_AI_CONNECT_SRC specifies permitted Ollama origins at build time. |

The **browser-ai** profile (`entry-browser-ai.ts`) sets `OT_ONLY_DEPLOYMENT_POLICY` (`allowedTiers: ['browser']`). Cloud AI, WebGPU/transformers.js, Hugging Face model downloads, and in-app Ollama model pulls are all disabled. When the AI wizard is opened it redirects to a built-in AI setup modal that shows a one-time download disclaimer (only when the model still needs downloading), then a progress bar, then navigates to chat when ready. The disclaimer is not shown again after first acknowledgement.

`apps/offline-web/vite.config.ts` aliases the WebGPU/transformers.js browser provider and all three cloud providers to disabled stubs. `browser-nano.ts` (browser Prompt API — Chrome Gemini Nano / Edge Phi-4-mini) is **not** aliased — it remains active in the bundle for all three profiles.

Cloud API keys stored encrypted in IDB under `__ai_secrets__`. Prefs in `localStorage` key `taskapp_ai_prefs_v2`.

**Module layout** (`packages/core/src/ai/`):

- `ai-prefs.ts` — `AIPrefs` type, singleton `aiPrefs`, `loadAIPrefs` / `saveAIPrefs`
- `attributes-engine.ts` — AI-driven attribute inference; populates `aiAttributeValues` in state
- `adaptive-engine.ts` — adaptive suggestion / learning engine; populates `adaptiveSuggestions` in state
- `providers/browser-nano.ts` — Chrome/Edge Prompt API (`window.LanguageModel`); single `create()` call handles download (with `downloadprogress` monitor) + session creation; stateless, sessions owned by ai-runtime
- `providers/browser-transformers.ts` — WebGPU via bundled `@huggingface/transformers`
- `providers/browser-ai-disabled.ts` — stub used when browser AI is disabled by the deployment policy
- `providers/browser-transformers-disabled.ts` — stub aliased in OT builds where WebGPU is disallowed
- `providers/cloud-disabled.ts` — stub aliased in OT builds where cloud AI is disallowed
- `providers/ollama.ts` — Ollama daemon; `loadOllama`, `callOllama`, `fetchOllamaModels`, `probeOllama`, `pullOllamaModel`, `deleteOllamaModel`
- `providers/anthropic.ts` / `openai.ts` / `google.ts` — cloud providers; SSE streaming, token counting
- `providers/powerplatform.ts` — Power Platform AI connector (Copilot Studio / AI Builder)
- `ai-runtime.ts` — owns all mutable AI state (`aiRuntime` object: `ready`, `loadStarted`, `backend`, `streaming`, `nanoSession`, `downloadProgress`, `history`, `pendingAction`, etc.); `startAILoad`, `disconnectAI`, `callBackend`, model helpers
- `ai-tools.ts` — tool catalog, system prompt, `handleModelOutput`, `routeToolCall`, `applyPendingAction`
- `ai-settings.ts` — wizard, encrypted secrets, cost tracking, model catalogs (`BROWSER_MODELS`, `OLLAMA_CATALOG`, `CLOUD_PROVIDERS`); built-in AI modal (`openNanoDownloadModal`, `closeNanoDownloadModal`, `renderNanoDownloadModal`, `bindNanoDownloadModal`, `isNanoModalOpen`) used in offline/OT builds — shows disclaimer only on first download, real progress bar via `aiRuntime.downloadProgress`, auto-triggers when AI view loads and model isn't running
- `ai-ui.ts` — chat panel / workspace render+bind, model picker, `sendAIMessage`
- `deployment-policy.ts` — profile-level AI/network policy; browser-ai profile uses OT-only policy (`allowedTiers: ['browser']`, covering both Chrome Gemini Nano and Edge Phi-4-mini); no-ai profile uses `allowedTiers: []`; internal-ai profile uses `allowedTiers: ['browser', 'ollama']`

**ESM live binding rule:** All mutable AI state lives on the `aiRuntime` object (not `export let`). Any module can read or write `aiRuntime.*` properties without owning the module.

---

## Views (valid values for `currentView`)

`dashboard` · `clients` · `departments` · `projects` · `tasks` · `people` · `standaloneNotes` · `calendar` · `time` · `communications` · `reports` · `ai` · `library` · `settings` · `trash`

---

## File System persistence (`storage/fs.ts`)

Dual-save: IDB vault (primary) + `.vault` disk file (survives cache clear).

- `nexus-data.vault` — disk file, written via File System Access API (Chrome/Edge)
- Handle persisted in IDB `nexus_fs_v1`
- `fsWriteVault()` — reads vault/salt/verify from `nexus_vault_v2`, writes to disk
- `fsUnlink()` — clears the handle, resets ready/last-save state, deletes the IDB entry
- `isFsReady()` — returns whether a writable handle is active
- File System Access API available in Chrome/Edge only; graceful degradation elsewhere

In `storage/db.ts`, `dbFlush()` calls `fsWriteVault()` lazily (dynamic import) to avoid a circular import at module-evaluation time.

---

## Security rules — never bypass

1. All user-visible strings must go through `escH()` before `innerHTML` interpolation.
2. Never make `_dbKey` (the `CryptoKey`) extractable.
3. The four IndexedDB databases must remain separate: `nexus_keys_v1`, `nexus_vault_v2`, `nexus_data_v1`, `nexus_fs_v1`.
4. `IDB_STORES = ['documents', 'conversations']` — any new large-content store must be added here and routed through `_idbPutRecord` / `_idbLoadStore`, not `dbFlush`.
5. Never call `trustedTypes.createPolicy` with an already-registered name.
6. Never use `btoa(String.fromCharCode(...array))` — use `u8ToBase64(array)` from `security/crypto.ts`.
7. `security/trusted-types.ts` must be the first import in `main.ts`.
8. After every build, `generate-csp.mjs` runs automatically. If editing source and testing via dev server, CSP hashes won't match — use the built `dist/offline/index.html` for production testing.

---

## Running / testing

For the offline-web target, open `dist/offline/index.html` directly in Chrome or Edge. No server needed — `file://` protocol works. For enterprise-web, deploy `dist/enterprise/` behind HTTPS (the Hono server or a reverse proxy) with `ENTERPRISE_STATIC_DIR` set. For the Dataverse target, use the Power Platform environment and Dataverse deployment process.

For Built-in AI (the only AI tier in the offline build — Gemini Nano in Chrome, Phi-4-mini in Edge):

- **Chrome 127+**: enable `chrome://flags/#prompt-api-for-gemini-nano`, relaunch. Chrome auto-downloads the ~4 GB model in the background.
- **Edge 127+**: enable the equivalent flag at `edge://flags`, relaunch. Edge downloads Phi-4-mini on first use.
- After the flag is enabled and the model is present, the app auto-presents the built-in AI modal when you navigate to the AI view. The one-time download disclaimer appears only if the browser still needs to fetch the model; subsequent enable/disable cycles skip it and go straight to the progress bar or connecting state.
  For Ollama (sync/enterprise builds only, not the offline profile): prefer `OLLAMA_ORIGINS=null ollama serve` (or the specific served origin if not using `file://`).

Do not edit `taskapp.html` — it is the legacy reference file, not the active source. All edits go in `packages/core/src/` (and its subdirectories: `security/`, `storage/`, `ui/`, `views/`, `ai/`, `schemas/`).

---

## Server (`server/`)

The server is a **Hono v4** REST API running on Node.js with `@hono/node-server`. It backs the enterprise-web build profile; offline builds do not require it.

### Entry point

`server/src/index.ts` — OTel **must** be initialised first (before any other import that creates spans). Middleware stack: CORS → connection tracking → OTel spans → auth (`/api/v1/*`) → routes. Graceful shutdown on `SIGTERM`/`SIGINT`: stops destruction scheduler, closes DB pool, exits.

### HTTP routes

All CRM routes are mounted at `/api/v1/<entity>`. Public routes: `GET /healthz`, `GET /readyz`.

| Prefix                     | Entity                            |
| -------------------------- | --------------------------------- |
| `/api/v1/clients`          | Clients                           |
| `/api/v1/departments`      | Departments                       |
| `/api/v1/projects`         | Projects                          |
| `/api/v1/tasks`            | Tasks                             |
| `/api/v1/people`           | People                            |
| `/api/v1/tags`             | Tags                              |
| `/api/v1/communications`   | Communications                    |
| `/api/v1/time-entries`     | Time entries                      |
| `/api/v1/notifications`    | Notifications                     |
| `/api/v1/files`            | Files                             |
| `/api/v1/documents`        | Documents                         |
| `/api/v1/standalone-notes` | Standalone notes                  |
| `/api/v1/conversations`    | Conversations (+ `/messages`)     |
| `/api/v1/audit`            | Audit log (+ `/export`)           |
| `/api/v1/admin`            | Admin: users, suspend, GDPR erase |
| `/api/v1/sync`             | Adapter sync checkpoint/push/pull |
| `/api/v1/ai-attributes`    | AI-inferred attribute values      |

### Database (Drizzle ORM + PostgreSQL)

`server/src/services/base.ts` exports `withTenant(tenantId, fn)` — wraps every query in a transaction that runs `SET LOCAL app.tenant_id = <id>` before calling `fn(tx)`. All service methods call this; never query without it.

RLS policies on every CRM table (`server/drizzle/0002_crm_entities.sql`):

```sql
CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id = current_setting('app.tenant_id', true)::text);
```

Audit events write to the existing `audit_events` table via `writeAuditEvent()` in `base.ts`. Every create/update/delete/suspend/erase operation writes one.

### Auth (Entra ID OIDC + PKCE)

`server/src/auth/middleware.ts` — reads `Authorization: Bearer <token>`, calls `validateEntraIdToken()` (JWKS via `jose`), looks up user in DB, sets `userId`/`tenantId`/`role` on the Hono context. Returns 401 on failure. Never expose raw errors to HTTP responses.

### Authorization (OPA)

`server/src/middleware/opa.ts` — `opaMiddleware(action)` factory. Evaluation chain:

1. **REST sidecar** — `POST ${OPA_URL}/v1/data/crm/allow` if `OPA_URL` env var is set
2. **WASM** — loads `policies/crm.wasm` via `@open-policy-agent/opa-wasm` (compile with `opa build crm.rego`)
3. **In-process TypeScript fallback** — role-based logic in `opa.ts`

Policy: `admin`/`owner` → all actions; `editor` → read/create/update; `viewer` → read only. Cross-tenant access always denied.

### KMS / GDPR

- `server/src/kms/key-service.ts` — `AzureKeyVaultKeyService`; schedules key expiry in `kms_key_lifecycle` (append-only table; update trigger prevents row modification)
- `server/src/kms/legal-hold.ts` — `LegalHoldService`; checks retention holds before allowing data removal
- `server/src/kms/erasure-workflow.ts` — `runDataRemovalWorkflow(userId, tenantId, requestedBy)`: checks retention hold → schedules KMS key expiry → soft-deletes all user records across CRM tables → writes `gdpr_erasure_requested` audit event
- `server/src/kms/destruction-scheduler.ts` — polls every 60s; calls `scheduleKeyExpiry()` on Azure Key Vault; writes `EXPIRED` lifecycle event

### AI Gateway

`server/src/ai-gateway/policy-engine.ts` — `evaluateAiGatewayRequest()`: model allowlist → per-user rate limit (20 RPM; Redis if `AI_GATEWAY_REDIS_URL` set, else in-memory) → per-tenant monthly token budget → PII scrubbing (regex redaction). All decisions are audit-logged.

### Environment variables

All configuration via env vars (see `server/.env.example`):
`PORT`, `NODE_ENV`, `DATABASE_URL`, `AZURE_KV_URL`, `AZURE_CLIENT_ID/SECRET/TENANT_ID`, `ENTRA_TENANT_ID/CLIENT_ID/CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `ALLOW_ORIGINS`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OPA_URL` (optional), `AI_GATEWAY_MONTHLY_BUDGET_TOKENS`, `AI_GATEWAY_REDIS_URL` (optional).

### Server development commands

```bash
cd server
pnpm dev           # tsx watch src/index.ts
pnpm build         # tsc → dist/
pnpm start         # node dist/index.js
pnpm typecheck     # tsc --noEmit
pnpm db:generate   # drizzle-kit generate
pnpm db:migrate    # drizzle-kit migrate
pnpm db:seed       # tsx src/db/seed.ts
pnpm test          # vitest
```

### Server security rules — never bypass

1. Never log raw SQL errors or stack traces to HTTP responses — always `{ error: 'Internal server error' }`.
2. Every DB query must go through `withTenant()` — never query CRM tables without RLS set.
3. Every create/update/delete/suspend/erase endpoint writes an audit event via `writeAuditEvent()`.
4. All secrets from environment variables — never hardcode credentials.
5. Valibot validation on all request bodies — schemas live in `server/src/schemas/index.ts`, parsed via `safeParseV` helper; return 400 with error details on failure.
6. Do not edit files in `packages/core/src/` from server code — frontend and server are separate packages.

---

## Keeping documentation current

After completing any task that changes documented facts — new stores, views, build commands, architecture patterns, crypto parameters, or module dependencies — update the relevant `.md` files in the repo root to reflect the change. The files to keep current are: `AGENTS.md`, `TECHNICAL-REFERENCE.md`, `SECURITY.md`, `DECISIONS.md`, and `CHANGELOG.md`. Do not update `agenttask.md` or `STRATEGIC-DIRECTION-FINAL.md`. Only update what actually changed; do not rewrite sections that are still accurate.
