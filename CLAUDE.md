# CLAUDE.md

This file gives Claude accurate guidance for working with the Task App CRM monorepo.
All information is derived directly from the current codebase — not from any prior cached description.

Get Current Date.
Never guess or assume.
If you're unsure, ask questions.
Always use the AskUserQuestion tool to ask questions.
Wait for an answer before providing any comments or code.
Always use the most recent versions, security and best practices without compromise.
Search the internet to ensure you have the most current information.
If you get stuck in a loop trying to fix an issue, try twice, then stop and discuss.

---

## What this is

**Task App CRM** — a fully offline-first, AES-256-GCM encrypted CRM. It is developed as a **TypeScript monorepo** (pnpm workspaces, Vite build) and deployed as a **single self-contained HTML file** (`dist/offline/index.html`, ~276 kB). No server needed. Open in Chrome or Edge and it runs from `file://`.

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
│   │   ├── trusted-types.ts      ← MUST be first import in main.ts
│   │   ├── crypto.ts
│   │   ├── session.ts
│   │   ├── vault.ts
│   │   ├── idb-data.ts
│   │   ├── db.ts
│   │   ├── fs.ts
│   │   ├── state.ts
│   │   ├── utils.ts
│   │   ├── icons.ts
│   │   ├── components.ts
│   │   ├── auth.ts
│   │   ├── main.ts               ← entry point, exported init()
│   │   ├── adapter-interface.ts
│   │   ├── styles/main.css
│   │   ├── views/                ← one file per view
│   │   └── ai/                   ← ai-v1.ts, ai-v2.ts
│   ├── adapter-null/src/index.ts ← NullAdapter (offline-only, no-op)
│   ├── adapter-rxdb/src/index.ts ← RxDBAdapter stub
│   └── adapter-dataverse/src/index.ts ← DataverseAdapter stub
├── apps/
│   ├── offline/                  ← Vite entry for single-file offline build
│   │   ├── index.html
│   │   ├── src/entry.ts          ← sets NullAdapter, calls init()
│   │   └── vite.config.ts
│   ├── sync/                     ← PWA build (same adapter for now)
│   ├── dataverse/                ← Power Apps Code App build
│   └── mobile/                   ← Capacitor config
├── dist/
│   └── offline/index.html        ← built single-file output (open this in browser)
├── generate-csp.mjs              ← regenerates CSP hashes in dist file
├── taskapp.html                  ← legacy reference (not active codebase)
└── *.md                          ← documentation
```

---

## Build

```bash
pnpm run build:offline   # builds dist/offline/index.html + regenerates CSP
pnpm run build:sync      # builds dist/sync/index.html (PWA)
pnpm run build:all       # all targets
pnpm run typecheck       # TypeScript type check (no emit)
```

After `build:offline`, open `dist/offline/index.html` in Chrome or Edge. No server needed.

For an offline OT build with an internal LAN AI endpoint, allowlist the exact origin at build time:

```bash
OT_AI_CONNECT_SRC="http://localhost:11434 http://127.0.0.1:11434 https://ai-server.internal" pnpm run build:offline
```

**After every build**, `generate-csp.mjs` runs automatically and writes:
- Updated SHA-256 hashes into the built file's CSP `<meta>` tag
- `dist/offline/index.sha256` for file integrity detection

---

## Module dependency order

Modules must be imported in this order (deeper dependencies first):

```
1.  constants.ts          — no dependencies
2.  crypto.ts             — constants
3.  session.ts            — constants
4.  vault.ts              — constants, crypto
5.  idb-data.ts           — constants, crypto
6.  db.ts                 — constants, vault, idb-data, adapter-interface
7.  fs.ts                 — constants, vault, db
8.  state.ts              — db
9.  utils.ts              — constants
10. icons.ts              — no dependencies
11. trusted-types.ts      — no dependencies (side-effect IIFE — MUST import first in main.ts)
12. components.ts         — state, utils, icons, db
13. sanitize.ts           — dompurify (XSS sanitization for HTML/URLs)
14. totp.ts               — no dependencies (pure WebCrypto TOTP, RFC 6238)
15. webauthn.ts           — no dependencies (WebAuthn PRF passkeys; hooks injected by main.ts)
16. mfa.ts                — totp; hooks injected by main.ts
17. audit.ts              — no app deps (hooks injected by main.ts via setAuditHooks)
18. views/*               — state, db, utils, icons, components, sanitize
19. ai/ai-prefs.ts        — no dependencies (localStorage only)
20. deployment-policy.ts  — no dependencies; build/profile policy
21. ai/providers/*        — stateless; no app-layer deps
22. ai/ai-runtime.ts      — state, ai-prefs, deployment-policy, providers, (lazy: state.js)
23. ai/ai-tools.ts        — ai-runtime, (injected: SCHEMAS, streamToBubble, finalRender)
24. ai/ai-settings.ts     — ai-prefs, ai-runtime, deployment-policy, providers/ollama
25. ai/ai-ui.ts           — ai-runtime, ai-tools, ai-settings, ai-prefs, deployment-policy, state, utils, icons
26. auth.ts               — crypto, vault, session, state, utils, icons, fs, mfa
27. main.ts               — all of the above
```

---

## Architecture patterns

### Render / bind pattern

Every view follows the same contract:

```ts
export function renderFoo(state: AppState): string { return `<html string>`; }
export function bindFoo(state?: AppState): void { /* attach event listeners */ }
```

`fullRender(state)` in `main.ts` replaces `appEl.innerHTML` entirely and re-attaches all listeners.
`appRenderWorkspace(view)` is a cheaper partial update that only replaces `#workspace-container`.

All user-visible strings **must** go through `escH()` before being interpolated into template strings. `escH()` is exported from `utils.ts`.

### Hook injection pattern

Views that need to call `appRenderWorkspace` or other main.ts functions receive them via setter functions to avoid circular imports:

```ts
// In the view module:
let _appRenderWorkspace: (view: string) => void = () => {};
export function setFooHooks(appRenderWorkspace: (v: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace;
}

// In main.ts — called once before first render:
setFooHooks(appRenderWorkspace);
```

### Adapter interface

The sync layer is abstracted behind a four-method interface (`packages/core/src/adapter-interface.ts`):

```ts
pull(checkpoint)      → { records, checkpoint }
push(changes)         → { conflicts }
stream(onRemoteChange) → unsubscribe fn
clear()               → void
```

`NullAdapter` (the default) inherits all four as no-ops. The app never imports a concrete adapter directly — `setAdapter()` in `db.ts` injects it, called from `apps/*/src/entry.ts`.

---

## Storage architecture

| What | Backend | Key / DB name | Notes |
|------|---------|---------------|-------|
| Salt, verify token, encrypted vault blob, KDF version | IndexedDB `nexus_vault_v2` / store `meta` | `nexus_salt_v1`, `nexus_verify_v1`, `nexus_vault_v1`, `nexus_kdf_v` | Primary encrypted data store |
| Session `CryptoKey` | IndexedDB `nexus_keys_v1` / store `sessionKey` | key `'active'` | Non-extractable; survives F5, clears on tab close |
| Documents, Conversations | IndexedDB `nexus_data_v1` / stores `documents`, `conversations` | record `id` | Each record individually AES-GCM encrypted |
| FS handle (vault file pointer) | IndexedDB `nexus_fs_v1` / store `handles` | `'fileHandle'` | Chrome/Edge File System Access API handle |
| Theme | `localStorage` key `taskapp_theme` | — | Non-sensitive preference |
| Dashboard layout | `localStorage` key `taskapp_dash_v1` | — | Non-sensitive preference |
| AI preferences | `localStorage` key `taskapp_ai_prefs_v2` | — | Plaintext JSON |
| Cloud API keys | IDB `nexus_data_v1` / record `__ai_secrets__` | — | AES-GCM encrypted |
| Audit log | IDB `nexus_data_v1` / record `__audit_log__` | — | AES-GCM encrypted; exportable CSV/JSON Lines |
| TOTP config | IDB `nexus_data_v1` / record `__mfa_totp__` | — | AES-GCM encrypted; secret + enabled flag |
| Passkey credentials | IDB `nexus_data_v1` / record `__mfa_passkeys__` | — | AES-GCM encrypted; PRF-wrapped master password per credential |
| Auth lockout state | `localStorage` keys `nexus_auth_fail_count`, `nexus_auth_locked_until` | — | Persists across tab close (NIST AC-7) |

---

## Crypto layer

- **PBKDF2-HMAC-SHA-256** at **600,000 iterations** (OWASP 2026 recommendation) — `crypto.ts`
- **AES-256-GCM** for all data at rest
- Key is **non-extractable** (`extractable: false`); never exists as a JS string
- **Base64**: uses `Uint8Array.prototype.toBase64()` (Sep 2025) with chunked `btoa` fallback. Never use `btoa(String.fromCharCode(...array))` — stack overflow on large arrays.
- **Legacy migration**: KDF version `'1'` (310k iterations) → `initCrypto()` silently re-derives at 600k

---

## Trusted Types

Two policies created once at module scope in `trusted-types.ts`:

- `nexus-crm` (`_ttPolicy`) — sanitises plain-text user data for `innerHTML`
- `nexus-crm-raw` (`_rawPolicy`) — passes already-safe template HTML through unchanged

`patchInnerHTML()` IIFE overrides `Element.prototype.innerHTML` — all string assignments auto-route through `_rawPolicy`. **`trusted-types.ts` must be the first import in `main.ts`.**

**Never call `trustedTypes.createPolicy('nexus-crm-raw', ...)` again** — throws `TypeError` on duplicate names.

---

## State management (`state.ts`)

```ts
getState()              // returns current AppState
setState(patch)         // shallow merge, notifies all listeners
subscribe(fn)           // returns unsubscribe fn — always store it
reloadData()            // pulls fresh records from _dbData into state
```

**State shape** (full `AppState` interface in `state.ts`):
```
authed, cryptoKey, currentView, sidebarCollapsed, theme,
clients, departments, projects, tasks, people, standaloneNotes,
tags, communications, files, timeEntries, notifications, trash,
documents, conversations,
aiPanelOpen, commandOpen, notifPanelOpen,
toast, confirmDialog, recordModal, docModal, fileViewer,
runningTimer, timerElapsed
```

---

## Database helpers (`db.ts`)

All UI code uses these — never touches IDB or the vault directly:

```ts
dbGetAll(store)                    // returns copy of in-memory store array
dbGetById(store, id)               // returns record or null
dbCreate(store, rec)               // async — schedules debounced flush
dbUpdate(store, id, changes)       // async — schedules debounced flush
dbDelete(store, id)                // async — schedules debounced flush
softDelete(store, id)              // moves to trash store
restoreFromTrash(trashId)
permanentDelete(trashId)
```

**CRM stores** (flushed as one encrypted blob to `nexus_vault_v2`):
`clients`, `departments`, `projects`, `tasks`, `people`, `standaloneNotes`, `tags`, `communications`, `files`, `timeEntries`, `notifications`, `trash`

**IDB stores** (each record individually encrypted in `nexus_data_v1`):
`documents`, `conversations`

**Debounced flush:** `dbCreate/Update/Delete` call `_scheduleFlush()` (300ms debounce). `beforeunload` forces immediate flush. IDB-backed stores (`documents`, `conversations`) write immediately, not via the flush.

To add a new large-content store: add to `IDB_STORES` in `constants.ts`, create its object store in `_dataDbOpen()` in `idb-data.ts`, route through `_idbPutRecord` / `_idbLoadStore`. Do **not** add to `STORES`.

---

## AI system

The core supports three tiers, but build profiles may restrict them:

| Tier | Backend |
|------|---------|
| `browser` | Chrome Built-in AI (Gemini Nano) or transformers.js (WebGPU) |
| `ollama` | Local Ollama daemon, default `qwen2.5:3b` |
| `cloud` | Anthropic / OpenAI / Google — direct fetch, no SDK |

`apps/offline` sets the `ot-only` deployment policy in `apps/offline/src/entry.ts`. In that profile, only the Ollama-compatible local/internal AI tier is allowed. Browser AI, cloud AI, Hugging Face model downloads, and in-app model pulls are disabled.

`apps/offline/vite.config.ts` aliases browser AI and cloud provider imports to disabled stubs so the OT-only artifact does not bundle browser-model runtime code or cloud API endpoints.

Cloud API keys stored encrypted in IDB under `__ai_secrets__`. Prefs in `localStorage` key `taskapp_ai_prefs_v2`.

**Module layout** (`packages/core/src/ai/`):
- `ai-prefs.ts` — `AIPrefs` type, singleton `aiPrefs`, `loadAIPrefs` / `saveAIPrefs`
- `providers/browser-nano.ts` — Chrome Prompt API; stateless, sessions owned by ai-runtime
- `providers/browser-transformers.ts` — WebGPU via bundled `@huggingface/transformers`
- `providers/ollama.ts` — Ollama daemon; `loadOllama`, `callOllama`, `fetchOllamaModels`, `probeOllama`, `pullOllamaModel`, `deleteOllamaModel`
- `providers/anthropic.ts` / `openai.ts` / `google.ts` — cloud providers; SSE streaming, token counting
- `ai-runtime.ts` — owns all mutable AI state (`aiRuntime` object); `startAILoad`, `disconnectAI`, `callBackend`, model helpers
- `ai-tools.ts` — tool catalog, system prompt, `handleModelOutput`, `routeToolCall`, `applyPendingAction`
- `ai-settings.ts` — wizard, encrypted secrets, cost tracking, model catalogs (`BROWSER_MODELS`, `OLLAMA_CATALOG`, `CLOUD_PROVIDERS`); Nano download modal (`openNanoDownloadModal`, `closeNanoDownloadModal`, `renderNanoDownloadModal`, `bindNanoDownloadModal`) used in offline/OT builds when the wizard is opened
- `ai-ui.ts` — chat panel / workspace render+bind, model picker, `sendAIMessage`
- `deployment-policy.ts` — profile-level AI/network policy; offline uses OT-only local/internal AI

**ESM live binding rule:** All mutable AI state lives on the `aiRuntime` object (not `export let`). Any module can read or write `aiRuntime.*` properties without owning the module.

---

## Views (valid values for `currentView`)

`dashboard` · `clients` · `departments` · `projects` · `tasks` · `people` · `standaloneNotes` · `calendar` · `time` · `reports` · `ai` · `library` · `settings` · `trash`

---

## File System persistence (`fs.ts`)

Dual-save: IDB vault (primary) + `.vault` disk file (survives cache clear).

- `nexus-data.vault` — disk file, written via File System Access API (Chrome/Edge)
- Handle persisted in IDB `nexus_fs_v1`
- `fsWriteVault()` — reads vault/salt/verify from `nexus_vault_v2`, writes to disk
- `fsUnlink()` — clears the handle, resets ready/last-save state, deletes the IDB entry
- `isFsReady()` — returns whether a writable handle is active
- File System Access API available in Chrome/Edge only; graceful degradation elsewhere

In `db.ts`, `dbFlush()` calls `fsWriteVault()` lazily (dynamic import) to avoid a circular import at module-evaluation time.

---

## Security rules — never bypass

1. All user-visible strings must go through `escH()` before `innerHTML` interpolation.
2. Never make `_dbKey` (the `CryptoKey`) extractable.
3. The four IndexedDB databases must remain separate: `nexus_keys_v1`, `nexus_vault_v2`, `nexus_data_v1`, `nexus_fs_v1`.
4. `IDB_STORES = ['documents', 'conversations']` — any new large-content store must be added here and routed through `_idbPutRecord` / `_idbLoadStore`, not `dbFlush`.
5. Never call `trustedTypes.createPolicy` with an already-registered name.
6. Never use `btoa(String.fromCharCode(...array))` — use `u8ToBase64(array)` from `crypto.ts`.
7. `trusted-types.ts` must be the first import in `main.ts`.
8. After every build, `generate-csp.mjs` runs automatically. If editing source and testing via dev server, CSP hashes won't match — use the built `dist/offline/index.html` for production testing.

---

## Running / testing

Open `dist/offline/index.html` directly in Chrome or Edge. No server needed — `file://` protocol works.

For Ollama from `file://`: prefer `OLLAMA_ORIGINS=null ollama serve` (or the specific served origin if not using `file://`). Avoid `*` in OT builds.
For Chrome Built-in AI: Chrome 127+ with Prompt API available.

Do not edit `taskapp.html` — it is the legacy reference file, not the active source. All edits go in `packages/core/src/`.

---

## Keeping documentation current

After completing any task that changes documented facts — new stores, views, build commands, architecture patterns, crypto parameters, or module dependencies — update the relevant `.md` files in the repo root to reflect the change. The files to keep current are: `CLAUDE.md`, `TECHNICAL-REFERENCE.md`, `SECURITY.md`, `DECISIONS.md`, and `CHANGELOG.md`. Do not update `agenttask.md` or `STRATEGIC-DIRECTION-FINAL.md`. Only update what actually changed; do not rewrite sections that are still accurate.
