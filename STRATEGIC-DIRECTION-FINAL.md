# Task App CRM — Strategic Direction Document
**Purpose:** Handoff document for a new execution chat. Contains the full strategic conversation about where to take the app next — questions asked, answers given, concerns raised, decisions made, and recommendations. Includes both high-level strategy and technical detail.  
**Date of conversation:** 2026-05-15  
**Current file:** `taskapp.html` (~7,853 lines, single-file offline-first encrypted CRM)

---

## 1. What the App Is Today

A fully offline-first, AES-256-GCM encrypted CRM delivered as a **single self-contained HTML file**. No build step, no npm, no framework, no server. Open in Chrome or Edge and it runs from `file://`. Optional AI via three tiers: Chrome Built-in AI (Gemini Nano), local Ollama, or cloud APIs (Anthropic/OpenAI/Google).

**Core strengths identified:**
- Runs from `file://` — no install, no server, no infrastructure
- AES-256-GCM encryption with PBKDF2 at 600,000 iterations
- Non-extractable CryptoKey in IndexedDB — key bytes never exist as a JavaScript string
- Works on any device with Chrome or Edge
- Zero external dependencies — fully offline capable
- Dual-save: IndexedDB vault + File System Access API disk file

**This combination — offline, encrypted, no install, no dependencies — was identified as genuinely rare and underserved.**

---

## 2. Technologies Researched

### 2.1 RxDB

**What it is:** A local-first, offline-first JavaScript database library. Runs inside the browser. Not a platform or service — it replaces the data layer inside an app.

**Current version:** 17.2.0 (May 4, 2026)

**Key capabilities relevant to this app:**
- Reactive queries — subscribe to a query and UI updates automatically when data changes
- Built-in schema migrations — increment version number, provide migration strategy, RxDB handles the rest
- Field-level encryption plugin (`encryption-web-crypto`) using native WebCrypto API
- Multi-tab sync out of the box
- MongoDB-style Mango query selectors with indexing and sorting
- Pluggable storage backends: IndexedDB, OPFS, React Native, Electron, Node.js

**RxDB 17 new sync targets (April 2026):**
- Google Drive replication plugin — syncs RxDB documents to a Google Drive folder; each document becomes one JSON file
- OneDrive replication plugin — identical mechanism via Microsoft Graph API
- WebRTC peer-to-peer signaling using the Drive folder as the signaling channel

**Critical limitation for Google Drive / OneDrive sync:**
Both plugins are designed for **one user across their own devices** — not multi-user team collaboration. Google Drive does not provide real-time push events; it polls. No ACID guarantees. Heavy concurrent writes may hit Google's API rate limits. Explicitly described in RxDB docs as beta and subject to breaking changes.

**For true team use:** Requires a real backend — Supabase, CouchDB, custom REST endpoint, or similar — where a server acts as authoritative source of truth.

**Hard constraint for this app:** RxDB requires npm install and a build step. It cannot be dropped into the current single-file no-build architecture. Adopting it requires a Vite or Rollup build pipeline that outputs a single bundled HTML file. The deployment experience (one file) stays the same; the development experience changes.

**RxDB encryption note:** The free encryption plugin uses crypto-js, not native WebCrypto. It is slower and less secure than the existing AES-256-GCM implementation already in the app. The premium `encryption-web-crypto` plugin uses native WebCrypto but is a paid tier.

---

### 2.2 Microsoft Power Apps Code Apps

**What it is:** A new app type in Power Platform (GA February 2026) that lets developers build custom web apps using React, Vue, or Blazor in any IDE and deploy them directly into Power Platform as governed assets.

**Key capabilities:**
- Native Dataverse connectivity via the Power Apps client library — no row ceiling, direct API access
- Entra ID authentication handled by the platform runtime — no credential proxy needed
- Data Loss Prevention (DLP) policies, ALM, and governance inherited automatically
- No artificial row limits like canvas apps
- React/Vue/Blazor — full code-first development in VS Code

**Current limitations:**
- Not available in the Power Apps mobile app or Power Apps for Windows
- No offline capability documented for Code Apps (offline is a Canvas App feature)
- End users require Power Apps Premium license
- Requires a build pipeline (VS Code, Node.js, npm, git, dotnet CLI)
- `vibe.powerapps.com` AI generation is preview only — not production ready

**Canvas MCP Server (also new 2026):** Lets AI assistants including Claude Code build and modify canvas apps via natural conversation. Relevant for future canvas app development, not Code Apps specifically.

---

### 2.3 Microsoft Dataverse

**What it is:** OData v4 REST service — the data backend of Power Platform and Dynamics 365.

**Key facts:**
- Authentication: OAuth 2.0 via Microsoft Entra ID — no simple API keys
- Rate limit: 6,000 requests per 5 minutes
- Max rows per request: 5,000 (pagination via `@odata.nextLink`)
- Every org is customised differently — tables, columns, relationships vary per customer
- Storage cost: $40/GB/month — significant for large datasets
- Real-time push from Dataverse to browser requires middleware (webhook receiver or Azure Service Bus) — not browser-native

**RxDB + Dataverse:** No pre-built plugin exists. Would require a custom replication handler implementing `pullHandler` (OData `$filter=modifiedon gt [checkpoint]`), `pushHandler` (PATCH/POST), and `pullStream` (polling or middleware). Calling Dataverse directly from a browser exposes the OAuth client secret — requires a thin proxy layer (Azure Function or Cloudflare Worker) to hold credentials server-side. This reintroduces a server into an otherwise server-free architecture.

**Code Apps + Dataverse:** The credential/proxy problem goes away entirely — authentication is handled by the Power Platform runtime. This is the recommended path for Dataverse connectivity.

---

### 2.4 QNOPY

**What it is:** A field data workflow automation platform for Civil, Environmental, and Asset Management industries. Native iOS and Android mobile app, works fully offline, syncs to proprietary cloud backend when connectivity returns. Over 3,500 custom forms built for clients including groundwater monitoring, soil boring, EHS checklists, construction daily logs.

**Relevance to this app:** Real-world production proof of the exact architecture pattern being considered — offline-first field data collection that syncs when connected. QNOPY proves the model works at scale for field teams. The difference: QNOPY is a closed vertical SaaS product for environmental work. This app is a general-purpose CRM the owner controls.

---

### 2.5 Cyolo

**What it is:** A zero trust access (ZTNA) solution. Sits between users and applications, verifying identity before granting access. Replaces or augments VPNs. Key differentiator: customer passwords, encryption keys, and tokens never leave the customer's own environment — Cyolo's cloud holds nothing sensitive about the customer.

**Supports:** Cloud-connected, on-premises, and fully offline/air-gapped environments.

**Relevance to this app:** Directly relevant if the app is ever deployed in enterprise team scenarios where the sync backend sits behind a corporate network, particularly in ICS/OT environments where network access is tightly controlled. Cyolo's trustless architecture — keeping all sensitive data within the customer's perimeter — aligns philosophically with how this app already handles encryption.

---

## 3. The Owner's Context

Three distinct professional contexts were identified during the conversation:

| Context | Description |
|---------|-------------|
| ICS/OT environments | Works in industrial control systems / operational technology environments — frequently air-gapped or severely network-restricted. Field technicians need offline-capable tools that require no install and no server. |
| Power Platform developer | Builds on Power Platform / Dynamics 365 / Dataverse professionally. Understands that ecosystem deeply. |
| Open source ambition | Wants to build something others can fork with their database of choice. Identified as the most ambitious and longest-term path. |

---

## 4. Strategic Options Identified

Three distinct deployment paths were identified and discussed:

### Option A — Keep current app as-is (offline only)
**Architecture:** Single HTML file, `file://`, no build step, no sync, no server  
**Users:** Solo users, ICS/OT field technicians, anyone needing fully private encrypted offline CRM  
**Status:** Works today. No changes needed.  
**Strengths:** Runs anywhere, no install, no infrastructure, strongest encryption, air-gap compatible  
**Limitations:** No team collaboration, no cross-device sync, 5MB localStorage cap (now resolved with IDB migration)

---

### Option B — RxDB fork with pluggable sync backend
**Architecture:** Monorepo, Vite build pipeline, RxDB as data layer, sync adapter interface, outputs single bundled HTML file  
**Users:** Solo users wanting cross-device sync, small teams with shared backend  
**Sync targets:** Google Drive or OneDrive (single user across own devices), Supabase, CouchDB, custom REST endpoint (for teams)  
**Strengths:** User owns their data and sync target, no Microsoft dependency, reactive queries, schema migrations built in  
**Limitations:** Build step required, RxDB is a dependency, Google Drive/OneDrive sync is beta and single-user only, team sync requires a real backend  
**ICS/OT note:** Not appropriate for air-gapped environments once sync is enabled

---

### Option C — Power Apps Code App fork (Dataverse backend)
**Architecture:** React Code App deployed into Power Platform, Power Apps client library for Dataverse connectivity, Entra ID auth  
**Users:** Teams already in Microsoft 365 / Dynamics 365 / Power Platform ecosystem  
**Strengths:** Dataverse as backend (team data sharing), Entra ID auth for free, DLP governance, no credential proxy needed, no row limits  
**Limitations:** Power Apps Premium license required per user, browser-only (no mobile app support for Code Apps currently), no offline capability for Code Apps, Microsoft ecosystem dependency  
**Note:** RxDB could still be used as the local data layer *inside* a Code App for offline-first behaviour — the two are not mutually exclusive

---

## 5. iOS and Android — Options Identified

Two paths were identified:

### PWA (Progressive Web App)
Add `manifest.json` and service worker to existing app. Users add to home screen on iOS (Share → Add to Home Screen) and Android (automatic install banner). Opens in standalone mode — no browser chrome, looks native.

**Pros:** Single codebase, updates go live immediately without app store review, typically 40–60% cost of native equivalent, no app store distribution required for known internal users  
**Cons:** Apple has been inconsistent — removed PWA features in iOS 17.4, EU regulators investigating, no timeline for resolution. No hardware access (Bluetooth, NFC, sensors). No automatic install prompt on iOS.  
**Best for:** Open source general-purpose CRM, known internal team users deployed via link

### Capacitor
Wraps the web app in a native shell. Compiles to proper `.ipa` (iOS) and `.apk` (Android) for app store distribution. Requires Mac + Xcode for iOS, Android Studio for Android.

**Pros:** Full native hardware access (Bluetooth, NFC, camera, sensors), proper app store distribution, updates reach field technicians automatically, deep OS integration  
**Cons:** App store review process and delays, 30% revenue cut if paid app, Mac required for iOS builds  
**Best for:** ICS/OT field use case specifically — camera for documentation, potential Bluetooth/NFC for sensor data

**Recommendation from conversation:** PWA first for the general open source path, Capacitor for the ICS/OT fork specifically. Not mutually exclusive.

---

## 6. Recommended Architecture — One Codebase, Three Modes

The conclusion reached was that **three separate forks are not the right approach**. One codebase with a clean sync adapter interface is maintainable and serves all three contexts.

### Sync adapter interface (4 functions)

```
pull(checkpoint)   → returns records changed since checkpoint
push(changes)      → sends local changes to backend, returns conflicts
stream()           → observable of real-time remote changes
clear()            → wipes all synced data (used by reset-app)
```

The core app calls only these four functions. It does not know or care what is behind them.

### Three adapter implementations

| Adapter | Backend | Who uses it |
|---------|---------|------------|
| `NullAdapter` | None — data stays in IDB vault | Offline-only users, ICS/OT air-gapped environments |
| `RxDBAdapter` | RxDB → user's chosen backend (Supabase, Google Drive, CouchDB, custom REST) | Small teams, open source forks pointing at own backend |
| `DataverseAdapter` | Power Apps client library → Dataverse | Teams in Microsoft ecosystem, Power Platform shops |

### Proposed monorepo structure

```
/
├── packages/
│   ├── core/              ← all current app logic, crypto, UI, AI system
│   ├── adapter-null/      ← offline only (no-op push/pull)
│   ├── adapter-rxdb/      ← RxDB with configurable backend
│   └── adapter-dataverse/ ← Power Apps client library
├── apps/
│   ├── offline/           ← Vite build → single HTML file
│   ├── sync/              ← Vite build → single HTML file + service worker (PWA)
│   ├── dataverse/         ← Power Apps Code App build
│   └── mobile/            ← Capacitor wrapper (iOS + Android)
├── CLAUDE.md
├── DECISIONS.md
├── SECURITY.md
└── CHANGELOG.md
```

### What this means for maintenance
- One set of UI components, one crypto layer, one AI system, one data model
- Adapter implementations are typically 100–200 lines of code each
- Bug fixes and features added to `core` propagate to all three targets automatically on next build
- Migration path from current `taskapp.html` is clean — extract existing code into `core` package, add build step, write adapter interface around the existing `dbFlush`/`loadVault` boundary

---

## 7. Concerns and Open Questions

| Concern | Status | Notes |
|---------|--------|-------|
| Single-file constraint vs build step | **Resolved** — owner is OK with a build pipeline that outputs a single HTML file | Vite can bundle everything into one self-contained HTML file. Deployment experience stays the same. |
| Three separate forks vs one codebase | **Resolved** — one codebase with adapter pattern | Avoids triple maintenance burden |
| RxDB Google Drive sync for teams | **Concern confirmed** — not suitable for multi-user teams | For team use, a real backend (Supabase, CouchDB, etc.) is required behind the RxDB adapter |
| Dataverse credential exposure from browser | **Resolved via Code Apps** — Power Platform runtime handles auth | Direct browser-to-Dataverse calls are unsafe; Code Apps eliminate the need for a proxy |
| OPFS not available from `file://` | **Accepted limitation** — documented in DECISIONS.md | OPFS requires secure context; IndexedDB is the correct storage backend for `file://` |
| iOS PWA unreliability (Apple) | **Open** — Apple's position is unclear, EU investigating | Design PWA to work without standalone mode, treat standalone as enhancement |
| RxDB encryption tier | **Noted** — free tier uses crypto-js, not native WebCrypto | Premium plugin uses native WebCrypto; current app's encryption is already stronger than RxDB free tier |
| Dataverse storage cost | **Noted** — $40/GB/month | Worth communicating to any enterprise customer considering Dataverse as the sync backend |
| Code Apps offline capability | **Gap confirmed** — Code Apps have no built-in offline support | If offline + Dataverse is required, RxDB inside a Code App is the solution |

---

## 8. Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Build pipeline producing single HTML file is acceptable | Unlocks RxDB, TypeScript, proper adapter interface while preserving single-file deployment |
| 2 | One codebase with adapter interface, not three forks | Maintenance burden of three forks is not justified; adapter pattern solves the same problem cleanly |
| 3 | PWA for general/open source path | Single codebase, no app store friction, immediate updates, sufficient for CRM use case |
| 4 | Capacitor for ICS/OT fork specifically | Hardware access (Bluetooth, NFC, camera), proper offline storage, app store distribution for field technician update delivery |
| 5 | Open source under MIT or Apache 2.0 | Enables community forks with own database backends |
| 6 | `NullAdapter` as the default | Preserves current offline-only behaviour as the baseline; sync is opt-in |
| 7 | User guide deferred until production | Confirmed by owner — not needed yet |

---

## 9. Recommended Next Steps (Execution Order)

These are the recommendations from the conversation in the order they were discussed:

1. **Define the sync adapter interface** — establish the four-function contract (`pull`, `push`, `stream`, `clear`) before touching any other code. This is the architectural decision everything else depends on.

2. **Extract `core` package from `taskapp.html`** — refactor the existing single file into proper ES modules organised around the proposed `packages/core/` structure. The crypto layer, database layer, state management, UI components, and AI system are the primary modules.

3. **Build `NullAdapter`** — implement the offline-only adapter first. The app behaviour is unchanged but it now conforms to the adapter interface. This validates the interface design before writing any sync code.

4. **Add Vite build pipeline** — configure Vite to output a single self-contained HTML file from the modular source. The existing `generate-csp.mjs` script needs to be updated to work with the built output rather than the source files.

5. **Add PWA manifest and service worker** — add `manifest.json` and a service worker to the `sync` app target. This enables iOS and Android home screen installation.

6. **Build `RxDBAdapter`** — implement pull/push against RxDB with Supabase as the first reference backend. Document how to point it at other backends (CouchDB, Google Drive, custom REST).

7. **Build Capacitor wrapper** — wrap the `offline` build in Capacitor for iOS and Android. Add camera plugin for documentation. This is the ICS/OT fork.

8. **Build `DataverseAdapter`** — implement as a Power Apps Code App using the Power Apps client library. Entra ID auth is handled by the platform.

9. **Open source release** — publish monorepo on GitHub under MIT or Apache 2.0. The existing CLAUDE.md, TECHNICAL-REFERENCE.md, DECISIONS.md, SECURITY.md, and CHANGELOG.md become the repo documentation.

---

## 10. Key References from Conversation

| Technology | Source confirmed | Key finding |
|-----------|-----------------|-------------|
| RxDB 17.2.0 | npmjs.com, rxdb.info | Google Drive/OneDrive sync is beta, single-user only |
| RxDB Google Drive plugin | rxdb.info docs | Uses Drive folder as sync target and WebRTC signaling channel; polls for changes |
| Power Apps Code Apps GA | Microsoft docs, 2026 release wave | GA February 2026; no offline support; Premium license required |
| Dataverse Web API | Microsoft docs | OData v4, 6,000 req/5 min, 5,000 row limit, OAuth via Entra ID |
| PWA vs Capacitor 2026 | exe-squared.co.uk, magicbell.com | PWA iOS limitations real but manageable for internal users; Capacitor for hardware access needs |
| QNOPY | qnopy.com | Production proof of offline-first field data sync model |
| Cyolo | cyolo.io | Relevant for enterprise/ICS team scenarios; trustless architecture aligns with app's encryption philosophy |
| vibe.powerapps.com | Microsoft | AI Code App generation — preview only, not production ready as of May 2026 |
| Dataverse storage cost | Microsoft pricing | $40/GB/month — material cost for large CRM datasets |

---

## 11. What Was NOT Decided

These topics came up but no decision was reached — they are open for the next conversation:

- **Which sync backend to prioritise first** — Supabase, Google Drive, CouchDB, or custom REST endpoint for the RxDB adapter
- **Whether to pursue app store distribution** — PWA is sufficient for known internal users; app store presence requires Capacitor and is a separate decision
- **Licensing** — MIT vs Apache 2.0 not finalised
- **Whether the ICS/OT fork has a different name/brand** from the general open source CRM
- **RxDB premium tier** — whether the paid `encryption-web-crypto` plugin is worth the cost given the existing AES-256-GCM implementation is already stronger
- **Dataverse adapter priority** — depends on whether the owner wants to invest Power Platform time in this project or keep it separate from client work

---

## 12. Detailed Migration Plan — Core Package Extraction, Build Step, and Adapter Interface

This section describes exactly how to migrate `taskapp.html` into the monorepo structure. Everything here is based on direct inspection of the current file — line numbers are accurate as of 2026-05-15.

---

### 12.1 Overview of the Migration

The migration has three sequential phases:

| Phase | What happens | Risk |
|-------|-------------|------|
| 1. Extract core | Split `taskapp.html` into ES modules without changing any logic | Medium — global scope coupling must be resolved |
| 2. Add build step | Configure Vite + `vite-plugin-singlefile` to output a single HTML file from modules | Low — well-established tool |
| 3. Write adapter interface | Define the four-function contract and implement `NullAdapter` (offline-only, current behaviour) | Low — minimal new code, no behaviour change |

**Critical principle throughout:** The app must remain fully functional after every phase. Do not start Phase 2 until Phase 1 produces a working app. Do not start Phase 3 until Phase 2 produces a working single HTML file.

---

### 12.2 Phase 1 — Extract Core Modules

#### 12.2.1 Why this is the hardest phase

The current `taskapp.html` uses 15 `<script>` blocks in global scope. Every function and variable is global. The coupling map from the file shows:

| Symbol | Used by | Count |
|--------|---------|-------|
| `escH()` | All view render functions | 121 call sites |
| `getState()` / `setState()` | Views, AI, auth, bootstrap | 83 call sites |
| `Icons.*` | All view render functions | 115 call sites |
| `_aiPrefs` | AI system throughout | 97 references |
| `dbCreate` / `dbUpdate` / `dbDelete` | All view bind functions | 43 call sites |
| `showToast()` | Throughout the app | 66 call sites |
| `_dbKey` / `_dbData` | Crypto, DB, views | Core shared state |

Modules cannot be extracted one at a time without ordering the dependency graph. Extract in dependency order — deepest dependencies first, consuming modules last.

#### 12.2.2 Dependency order (extract in this exact sequence)

```
1.  packages/core/src/constants.js
    — all constants (PBKDF2_ITERATIONS, STORES, IDB_STORES, etc.)
    — depends on: nothing

2.  packages/core/src/crypto.js
    — u8ToBase64, base64ToU8, aesEncrypt, aesDecrypt, deriveKey,
      initCrypto, changePassword, exportEncryptedBackup,
      importEncryptedBackup, exportJSON, importJSON
    — depends on: constants

3.  packages/core/src/session.js
    — cacheSessionKey, loadSessionKey, clearSessionKey
    — depends on: nothing (uses native IDB directly)

4.  packages/core/src/vault.js
    — _vaultDbOpen, _vaultMetaGet, _vaultMetaSet,
      _migrateLocalStorageToIDB, getSalt, isFirstRun,
      loadVault, saveVault, writeVerifyToken, verifyPassword
    — depends on: constants, crypto

5.  packages/core/src/idb-data.js
    — _dataDbOpen, _idbLoadStore, _idbPutRecord,
      _idbDeleteRecord, _idbClearStore
    — depends on: constants, crypto (key passed as parameter — see 12.2.4)

6.  packages/core/src/db.js
    — _dbKey, _dbData, dbInit, dbFlush, _scheduleFlush,
      _buildCrmPayload, uid, nowISO, getStore, dbGetAll,
      dbGetById, dbCreate, dbUpdate, dbDelete,
      softDelete, restoreFromTrash, permanentDelete,
      createNotification, getUnreadNotifications,
      markNotificationRead, markAllNotificationsRead,
      checkDueDates, startTimer, stopTimer,
      getRunningTimer, globalSearch
    — depends on: constants, crypto, vault, idb-data

7.  packages/core/src/fs.js
    — _fsHandle, _fsReady, _idbFsOpen, _idbGet, _idbSet,
      _verifyPermission, fsWriteVault, fsReadVault,
      fsPickFile, fsInit
    — depends on: constants, vault, db

8.  packages/core/src/state.js
    — _state, subscribe, getState, setState, setTheme,
      initTheme, reloadData, showToast, showConfirm,
      closeConfirm, openRecordModal, closeRecordModal, navigate
    — depends on: db

9.  packages/core/src/utils.js
    — sanitize, formatDate, formatRelative, formatDuration,
      formatFileSize, parseDateLocal, daysUntil, initials,
      avatarColor, sortRecords, filterRecords, searchRecords,
      debounce, downloadText, toCSV, plural, readFileAsText,
      clamp, escH
    — depends on: nothing

10. packages/core/src/icons.js
    — Icons object (all SVG render functions)
    — depends on: nothing

11. packages/core/src/trusted-types.js
    — _ttPolicy, _rawPolicy, patchInnerHTML IIFE
    — depends on: nothing
    — MUST be first import in main.js

12. packages/core/src/components.js
    — renderToast, renderConfirmDialog, bindConfirmDialog,
      renderAvatar, renderPriorityBadge, renderDueBadge,
      renderSpinner, renderEmpty, renderSearchInput,
      renderViewTabs, renderCommandPalette, bindCommandPalette,
      renderNotifPanel
    — depends on: state, utils, icons

13. packages/core/src/views/  (one file per view)
    — dashboard.js, workspace.js, project-canvas.js,
      record-modal.js, calendar.js, time-tracker.js,
      reports.js, trash.js, settings.js, documents.js,
      library.js, files.js, sidebar.js, topbar.js
    — each depends on: state, db, utils, icons, components

14. packages/core/src/ai/
    — ai-v1.js (backend dispatch, tool executor, chat UI)
    — ai-v2.js (catalogs, wizard, secrets, cloud providers, overrides)
    — depends on: state, db, utils, icons, components, vault

15. packages/core/src/auth.js
    — renderAuth, bindAuth, _authFailCount, _authLockedUntil
    — depends on: crypto, vault, session, state, utils

16. packages/core/src/main.js  (entry point)
    — appRenderWorkspace, fullRender, init
    — imports and wires everything together
    — depends on: all of the above
```

#### 12.2.3 Global scope to ES module conversion pattern

Every function in the current app is global. Converting means adding `export` to every declaration and adding `import` to every consumer.

```js
// BEFORE (global scope in taskapp.html)
function escH(s) {
  return String(s ?? '').replace(/&/g, '&amp;') /* ... */;
}

// AFTER (packages/core/src/utils.js)
export function escH(s) {
  return String(s ?? '').replace(/&/g, '&amp;') /* ... */;
}
```

```js
// BEFORE (render function in global scope)
function renderFoo(state) {
  return `<div>${escH(state.name)}</div>`;
}

// AFTER (packages/core/src/views/foo.js)
import { escH } from '../utils.js';
export function renderFoo(state) {
  return `<div>${escH(state.name)}</div>`;
}
```

#### 12.2.4 The one real refactor — resolving the _dbKey circular dependency

`idb-data.js` currently reaches into the global scope for `_dbKey` to call `aesEncrypt(_dbKey, record)`. In a module system this creates a circular dependency (idb-data imports crypto, db imports idb-data, db owns _dbKey). Fix: pass `cryptoKey` as a parameter.

```js
// BEFORE
async function _idbPutRecord(storeName, record) {
  const enc = await aesEncrypt(_dbKey, record); // _dbKey from global scope
}

// AFTER (packages/core/src/idb-data.js)
export async function _idbPutRecord(storeName, record, cryptoKey) {
  const enc = await aesEncrypt(cryptoKey, record);
}

// In db.js — all callers pass _dbKey explicitly
await _idbPutRecord(storeName, item, _dbKey);
```

This is the only structural refactor required. All other extractions are mechanical search-and-replace of global references to imports.

#### 12.2.5 CSS

The `<style>` block (lines 29–2608 in current file) moves to `packages/core/src/styles/main.css`. Imported in `main.js`:

```js
import './styles/main.css';
```

`vite-plugin-singlefile` inlines it back into the output HTML. Visually identical result.

#### 12.2.6 Trusted Types — import order is mandatory

`patchInnerHTML()` must execute before any other module runs `innerHTML`. In `main.js`:

```js
// packages/core/src/main.js — THIS ORDER IS REQUIRED
import './trusted-types.js';   // patches Element.prototype.innerHTML first
import './styles/main.css';
import { initTheme } from './state.js';
// ... all other imports after
```

---

### 12.3 Phase 2 — Add Vite Build Step

#### 12.3.1 Tool

`vite-plugin-singlefile` inlines all JavaScript and CSS into a single `dist/index.html`. No other files. Designed specifically for offline single-file web apps opened directly from the filesystem. Actively maintained (May 2026).

#### 12.3.2 Full repository structure

```
taskapp/
├── package.json                    ← npm workspaces
├── packages/
│   ├── core/src/                   ← all 16 modules above
│   ├── adapter-null/src/index.js
│   ├── adapter-rxdb/src/index.js
│   └── adapter-dataverse/src/index.js
├── apps/
│   ├── offline/
│   │   ├── index.html              ← Vite entry
│   │   └── vite.config.js
│   ├── sync/
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   └── public/manifest.json    ← PWA manifest
│   ├── dataverse/
│   │   ├── index.html
│   │   └── vite.config.js
│   └── mobile/
│       └── capacitor.config.json
├── dist/
│   ├── offline/index.html          ← final single-file output
│   └── sync/index.html             ← final single-file output (PWA)
├── generate-csp.mjs                ← run on dist/ after every build
├── CLAUDE.md
├── DECISIONS.md
├── SECURITY.md
├── CHANGELOG.md
└── STRATEGIC-DIRECTION.md
```

#### 12.3.3 Vite config — offline target

```js
// apps/offline/vite.config.js
import { defineConfig }   from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: '.',
  plugins: [viteSingleFile()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    outDir: '../../dist/offline',
    emptyOutDir: true,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  resolve: {
    alias: {
      '@core':    '../../packages/core/src',
      '@adapter': '../../packages/adapter-null/src',
    },
  },
});
```

#### 12.3.4 Entry HTML

```html
<!-- apps/offline/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <!-- generate-csp.mjs replaces {{SCRIPT_HASHES}} after build -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src {{SCRIPT_HASHES}} 'strict-dynamic'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; worker-src blob:; object-src 'none'; base-uri 'none'; trusted-types nexus-crm nexus-crm-raw; require-trusted-types-for 'script';">
  <meta http-equiv="Referrer-Policy" content="no-referrer">
  <meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()">
  <title>Task App CRM</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="../../packages/core/src/main.js"></script>
</body>
</html>
```

#### 12.3.5 Root package.json build scripts

```json
{
  "name": "taskapp-crm",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build:offline":   "vite build --config apps/offline/vite.config.js  && node generate-csp.mjs dist/offline/index.html",
    "build:sync":      "vite build --config apps/sync/vite.config.js     && node generate-csp.mjs dist/sync/index.html",
    "build:dataverse": "vite build --config apps/dataverse/vite.config.js",
    "build:all":       "npm run build:offline && npm run build:sync && npm run build:dataverse"
  }
}
```

After `npm run build:offline`, `dist/offline/index.html` is a single self-contained file with correct CSP hashes — functionally identical to the current `taskapp.html`.

---

### 12.4 Phase 3 — Write the Adapter Interface

#### 12.4.1 The exact insertion points in the current code

Three locations in `taskapp.html` are where an adapter intercepts the data flow:

| Hook | Current code | Lines | Adapter function |
|------|-------------|-------|-----------------|
| Load on unlock | `_dbData = await loadVault(_dbKey)` | 3046 | `pull()` |
| Save on every write | `saveVault` wrapped by `fsWriteVault` hook | 3357–3362 | `push()` |
| Real-time remote changes | Does not exist yet | — | `stream()` |
| App reset | `_vaultMetaSet` cleared in reset handler | ~4534 | `clear()` |

The `fsWriteVault` hook at line 3357 already demonstrates the exact wrapping pattern. The adapter reuses it.

#### 12.4.2 The interface

```js
// packages/core/src/adapter-interface.js
export class SyncAdapter {
  // Pull remote changes after loading local vault on unlock.
  // checkpoint: opaque — null on first run.
  // Returns { records: { [store]: Record[] }, checkpoint: any }
  async pull(checkpoint) { return { records: {}, checkpoint: null }; }

  // Push local changes to remote after every dbFlush (debounced 300ms).
  // changes: { [store]: Record[] }
  // Returns { conflicts: Record[] }
  async push(changes) { return { conflicts: [] }; }

  // Start listening for remote changes. Returns unsubscribe function.
  // Calls onRemoteChange({ [store]: Record[] }) on remote mutation.
  stream(onRemoteChange) { return () => {}; }

  // Wipe remote state on full app reset.
  async clear() {}
}
```

#### 12.4.3 NullAdapter — five lines, zero behaviour change

```js
// packages/adapter-null/src/index.js
import { SyncAdapter } from '@core/adapter-interface.js';

// All four methods inherited from SyncAdapter are already no-ops.
// No overrides needed. Behaviour identical to current taskapp.html.
export class NullAdapter extends SyncAdapter {}
```

#### 12.4.4 Two additions to db.js — pull wired into dbInit, push wired into dbFlush

```js
// db.js additions (no existing logic changes)

let _adapter = null;
export function setAdapter(a) { _adapter = a; }

// dbInit — add after _dbData is loaded
if (_adapter) {
  const checkpoint = await _vaultMetaGet('sync_checkpoint').catch(() => null);
  const { records, checkpoint: next } = await _adapter.pull(checkpoint).catch(e => {
    console.warn('[sync] pull failed — working offline:', e?.message);
    return { records: {}, checkpoint };
  });
  Object.entries(records).forEach(([store, recs]) => {
    if (!_dbData[store]) _dbData[store] = [];
    recs.forEach(r => {
      const i = _dbData[store].findIndex(x => x.id === r.id);
      if (i === -1) _dbData[store].push(r);
      else if (r.updatedAt > _dbData[store][i].updatedAt) _dbData[store][i] = r;
    });
  });
  if (next) await _vaultMetaSet('sync_checkpoint', next).catch(() => {});
}

// dbFlush — add after saveVault call
if (_adapter) {
  _adapter.push(_buildCrmPayload()).catch(e =>
    console.warn('[sync] push failed — data safe locally:', e?.message)
  );
}
```

#### 12.4.5 Stream wired in main.js afterUnlock, clear wired in reset handler

```js
// In afterUnlock (main.js)
const _unsubscribeSync = _adapter.stream(changes => {
  Object.entries(changes).forEach(([store, recs]) => {
    recs.forEach(r => {
      const i = _dbData[store]?.findIndex(x => x.id === r.id) ?? -1;
      if (i === -1) getStore(store).push(r);
      else if (r.updatedAt > _dbData[store][i].updatedAt) _dbData[store][i] = r;
    });
  });
  reloadData();
});

// In reset-app handler (before location.reload())
await _adapter.clear().catch(() => {});
```

#### 12.4.6 App entry points — one per build target, picks its adapter

```js
// apps/offline/src/entry.js
import { NullAdapter } from '@adapter/index.js';
import { setAdapter }  from '@core/db.js';
import { init }        from '@core/main.js';
setAdapter(new NullAdapter());
init();

// apps/sync/src/entry.js
import { RxDBAdapter } from '@adapter/index.js';
import { setAdapter }  from '@core/db.js';
import { init }        from '@core/main.js';
setAdapter(new RxDBAdapter());
init();
```

Each `vite.config.js` sets `@adapter` to resolve to its own package. The `core` package never imports a concrete adapter.

---

### 12.5 Estimated Effort

| Phase | Work | Time |
|-------|------|------|
| Phase 1 — Extract 16 modules | Convert global scope to ES modules, fix _dbKey circular dep, update all 121+ escH call sites to imports | 3–5 days |
| Phase 2 — Vite build | vite.config.js per target, root package.json, update generate-csp.mjs path | 1 day |
| Phase 3 — NullAdapter + interface | adapter-interface.js, NullAdapter, 2 db.js additions, main.js wiring | 1 day |
| **Total: working offline monorepo app** | | **5–7 days** |
| RxDB adapter (Supabase reference) | pull/push/stream against RxDB + Supabase | 3–5 days |
| PWA (manifest + service worker) | manifest.json, sw.js | 0.5 days |
| Capacitor mobile wrapper | capacitor.config.json, iOS/Android platforms, camera plugin | 1–2 days |
| Dataverse Code App adapter | Power Apps client library integration | 5–10 days |

---

### 12.6 What Does Not Change During Migration

The migration is a structural reorganisation. None of the following change during Phases 1–3:

- All crypto: AES-256-GCM, PBKDF2, non-extractable key, IDB vault
- All 14 view render and bind functions — zero visual or behavioural changes
- Full AI system (v1 and v2, all three tiers)
- Auth and brute-force lockout
- File System Access API dual-save
- Trusted Types policies
- All security headers (CSP, Referrer-Policy, Permissions-Policy)
- `generate-csp.mjs` — path argument update only, logic unchanged
- All documentation files
