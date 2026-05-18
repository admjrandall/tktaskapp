# CLAUDE.md

This file gives Claude accurate guidance for working with `taskapp.html`.
All information is derived directly from the current file — not from any prior cached description.

Get Current Date
Never guess or assume.
If your unsure ask questions.
Always use askuserquestion tool to ask questions.  
Wait for an answer before providing any comments or code.
Always use the most recent versions, security and best practices without compromise.
Search internet to ensure you have the most current information.
If you get stuck in a loop trying to fix an issue, try twice, then stop and discuss.

---

## What this is

**Task App CRM** — a fully offline-first, AES-256-GCM encrypted CRM delivered as a **single self-contained HTML file** (`taskapp.html`, ~7,853 lines). No build step, no npm, no framework. Open the file in Chrome or Edge and it runs.

---

## Architecture

### Single-file structure

Everything — CSS, HTML, and all JavaScript — lives in one `.html` file. Code is organised into `<script>` blocks in strict dependency order, separated by comment banners (`// ── SECTION NAME ─────`).

### Script blocks (top to bottom)

| Lines | Block | Contents |
|-------|-------|----------|
| 2614–3452 | Block 1 | Trusted Types, Crypto, Base64 helpers, Session key IDB, AES-GCM, Vault IDB, Migration, Salt, DB layer, File System persistence, State/pub-sub |
| 3461–3543 | Block 2 | Components, Command palette |
| 3544–3663 | Block 3 | View renderers: List, Grid, Kanban, Spatial |
| 3665–4117 | Block 4 | Project canvas |
| 4119–4224 | Block 5 | Record modal |
| 4225–4286 | Block 6 | Workspace (generic list/grid/kanban/spatial) |
| 4287–4375 | Block 7 | Dashboard |
| 4376–4653 | Block 8 | Extra workspaces: Calendar, Time tracker, Reports, Trash, Settings |
| 4655–5108 | Block 9 | Documents (editor, DOCX export) |
| 5110–5386 | Block 10 | Library, Doc modal, File viewer |
| 5395–6594 | Block 11 | AI system v1 (backends, tool dispatch, tool executor) |
| 6595–7392 | Block 12 | AI v2 (catalogs, wizard, secrets, cloud provider calls, overrides) |
| 7393–7526 | Block 13 | Files view, Sidebar, Bottom tabs, Topbar |
| 7527–7681 | Block 14 | Auth (password screen, brute-force lockout, vault file open) |
| 7682–7851 | Block 15 | App bootstrap: `init()`, `fullRender()`, `appRenderWorkspace()` |

---

## Storage architecture

| What | Backend | Key / DB name | Notes |
|------|---------|---------------|-------|
| Salt, verify token, encrypted vault blob, KDF version | IndexedDB `nexus_vault_v2` / store `meta` | `nexus_salt_v1`, `nexus_verify_v1`, `nexus_vault_v1`, `nexus_kdf_v` | Primary encrypted data store. Replaced localStorage. |
| Session `CryptoKey` | IndexedDB `nexus_keys_v1` / store `sessionKey` | key `'active'` | Non-extractable; survives F5, clears on tab close |
| Documents, Conversations | IndexedDB `nexus_data_v1` / stores `documents`, `conversations` | record `id` | Each record individually AES-GCM encrypted |
| FS handle (vault file pointer) | IndexedDB `nexus_fs_v1` / store `handles` | `'fileHandle'` | Chrome/Edge File System Access API handle |
| Theme | `localStorage` key `taskapp_theme` | — | Non-sensitive preference |
| Dashboard layout | `localStorage` key `taskapp_dash_v1` | — | Non-sensitive preference |
| AI preferences | `localStorage` key `taskapp_ai_prefs_v2` (v1 key still read for migration) | — | Plaintext JSON |
| Cloud API keys | IDB `nexus_data_v1` / store `documents` record `__ai_secrets__` | — | AES-GCM encrypted |

### localStorage migration

On first load after upgrade, `_migrateLocalStorageToIDB()` silently reads any legacy vault data from localStorage and writes it to `nexus_vault_v2`. It then removes the localStorage keys. Safe to call multiple times.

---

## Crypto layer

- **PBKDF2-HMAC-SHA-256** at **600,000 iterations** (OWASP 2026 recommendation)
- **AES-256-GCM** for all data at rest
- Key is **non-extractable** (`extractable: false`); never exists as a JS string
- **Base64 encoding**: uses `Uint8Array.prototype.toBase64()` (September 2025, all major browsers) with a chunked `btoa` fallback. Never uses `btoa(String.fromCharCode(...array))` — that pattern causes stack overflow on large arrays.
- **Legacy migration**: if `nexus_kdf_v` is `'1'` (310k iterations), `initCrypto()` silently re-derives at 600k and re-encrypts on next save

---

## Security headers (lines 13–23)

```
Content-Security-Policy  SHA-256 hashes per script block (not style blocks — when style-src
                         contains hashes, unsafe-inline is ignored per spec, breaking 177+
                         inline style= attributes); strict-dynamic;
                         trusted-types nexus-crm nexus-crm-raw;
                         require-trusted-types-for 'script'
                         trusted-types nexus-crm nexus-crm-raw,
                         require-trusted-types-for 'script'
Referrer-Policy          no-referrer
Permissions-Policy       camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()
```

CSP hashes are **auto-generated** — never edit them manually. Run `node generate-csp.mjs` after every edit to `taskapp.html`. This also writes a `taskapp.sha256` integrity file.

---

## Trusted Types

Two policies are created once at module scope (lines 2628–2657):

- `nexus-crm` (`_ttPolicy`) — sanitises plain-text user data for `innerHTML`
- `nexus-crm-raw` (`_rawPolicy`) — passes already-safe template HTML through unchanged

`patchInnerHTML()` overrides `Element.prototype.innerHTML` so all existing `el.innerHTML = string` assignments automatically route through `_rawPolicy`. **Do not call `trustedTypes.createPolicy('nexus-crm-raw', ...)` again anywhere** — it throws a `TypeError` (duplicate policy names are forbidden by spec unless CSP includes `'allow-duplicates'`).

---

## Render / bind pattern

Every view follows the same contract:

```js
function renderFoo(state) { return `<html string>`; }  // returns HTML string
function bindFoo(state?)  { /* attach event listeners */ }
```

`fullRender(state)` replaces `appEl.innerHTML` entirely and re-attaches all listeners.
`appRenderWorkspace(view)` is a cheaper partial update that only replaces `#workspace-container`.

All user-visible strings **must** go through `escH()` before being interpolated into template strings. `escH()` is defined at line 3227.

---

## State management

Tiny pub/sub system at lines 3422–3451:

```js
_state       // plain object — never mutate directly
setState(patch)    // merges patch, calls all listeners
getState()         // returns current state
subscribe(fn)      // returns an unsubscribe function — store the return value
reloadData()       // pulls fresh records from _dbData into state
```

**State shape:**
```js
{
  authed, cryptoKey, currentView, sidebarCollapsed, theme,
  clients, departments, projects, tasks, people, standaloneNotes,
  tags, communications, files, timeEntries, notifications, trash,
  documents, conversations,
  aiPanelOpen, commandOpen, notifPanelOpen,
  toast, confirmDialog, recordModal, docModal, fileViewer,
  runningTimer, timerElapsed
}
```

---

## Database helpers

All UI code uses these — never touches IDB or the vault directly:

```js
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

### Debounced flush

`dbCreate/Update/Delete` call `_scheduleFlush()` rather than `await dbFlush()` directly. This coalesces rapid consecutive writes into a single encrypt+write (300ms debounce). A `beforeunload` listener forces an immediate flush on tab close.

To add a new large-content store: add its name to `IDB_STORES`, create its object store in `_dataDbOpen()`, and route writes through `_idbPutRecord` / `_idbLoadStore`. Do **not** add it to `STORES` (that is the vault-blob list).

---

## AI system

Three tiers, user-selectable:

| Tier | Backend | Key constant |
|------|---------|-------------|
| `browser` | Chrome Built-in AI (Gemini Nano) or transformers.js (WebGPU) | `AI_PREFS_KEY` |
| `ollama` | Local Ollama daemon, default `qwen2.5:3b` | `AI_PREFS_KEY` |
| `cloud` | Anthropic / OpenAI / Google — direct fetch, no SDK | `AI_PREFS_KEY` |

Cloud API keys are stored encrypted in IDB under the magic document ID `__ai_secrets__`.

AI preferences live in `_aiPrefs` (loaded from `localStorage` key `taskapp_ai_prefs_v2`).

**Important override pattern** in Block 12: `callBackend` and `startAILoad` are re-declared using an IIFE to capture the original before redeclaring:

```js
// CORRECT
const _origStartAILoad = (function() { return startAILoad; })();
function startAILoad() { /* new impl, may call _origStartAILoad */ }

// WRONG — function hoisting makes _orig point to the new function
const _orig = startAILoad;
function startAILoad() { ... }
```

---

## Views (valid values for `currentView`)

`dashboard` · `clients` · `departments` · `projects` · `tasks` · `people` · `standaloneNotes` · `calendar` · `time` · `reports` · `ai` · `library` · `settings` · `trash`

---

## File System persistence

Dual-save: IDB vault (primary) + a `.vault` disk file (survives cache clear).

- `nexus-data.vault` — the disk file, written via File System Access API (Chrome/Edge)
- Handle persisted in IDB `nexus_fs_v1`
- `fsWriteVault()` reads current vault/salt/verify from `nexus_vault_v2` IDB and writes to disk
- `fsReadVault()` reads disk file and writes back to `nexus_vault_v2` IDB
- File System Access API only available in Chrome/Edge; graceful degradation on other browsers

---

## Security rules — never bypass

1. All user-visible strings must go through `escH()` before `innerHTML` interpolation.
2. Never make `_dbKey` (the `CryptoKey`) extractable.
3. The four IndexedDB databases must remain separate: `nexus_keys_v1`, `nexus_vault_v2`, `nexus_data_v1`, `nexus_fs_v1`.
4. `IDB_STORES = ['documents', 'conversations']` — any new large-content store must be added here and routed through `_idbPutRecord` / `_idbLoadStore`, not `dbFlush`.
5. Never call `trustedTypes.createPolicy` with an already-registered name.
6. Never use `btoa(String.fromCharCode(...array))` — use `u8ToBase64(array)` instead.
7. After every edit run `node generate-csp.mjs` to keep CSP hashes and `.sha256` current.

---

## Running / testing

Open `taskapp.html` directly in Chrome or Edge. No server needed — `file://` protocol works.

For the Ollama tier, Ollama must be running locally with CORS enabled: `OLLAMA_ORIGINS=*`

For the Chrome Built-in AI tier, Chrome must have the Prompt API available (Chrome 127+, may require flag).

Keep `taskapp.sha256` and `generate-csp.mjs` in the same folder as `taskapp.html`.
