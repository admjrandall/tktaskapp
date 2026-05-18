# Changelog

All notable changes to Task App CRM are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.
Versions are dated; there is no semantic version number — the public interface is the built `dist/offline/index.html` file.

---

## [2026-05-17] — Sidebar IA redesign + Recycle Bin + mobile "More" sheet

### Navigation — Changed
- **Sidebar restructured to flat IA** — `NAV_ENTRIES` replaces the old `NAV_ITEMS` section groups. Navigation is now a flat list with thin `.nav-divider` separators and compact `.nav-entry-label` section headings (CRM, Content), matching contemporary sidebar patterns.
- **Time Tracker removed from sidebar** — no longer appears as a nav item; view still exists for future work.
- **Settings moved to sidebar footer** — a gear icon button in the user footer row (`data-nav="settings"`) navigates to Settings; Settings is no longer a main nav entry.
- **Sidebar footer added** — shows a placeholder avatar ("U") and name ("Your Name") with a gear icon; will be replaced with real auth when authentication is implemented.
- **Mobile "More" bottom-tab opens a slide-up sheet** — tapping the More tab in the 5-tab mobile bottom nav opens a full-screen bottom sheet showing all nav items instead of navigating to Settings.
- **Mobile sheet mirrors desktop sidebar** — the sheet uses the same `SheetEntry[]` structure as `NAV_ENTRIES` (Dashboard, AI Chat, divider, CRM label, Clients/Projects/Tasks, divider, People/Departments, divider, Content label, Notes/Library/Calendar, divider, Reports, divider, Settings).

### Recycle Bin — Changed
- **"Trash" renamed to "Recycle Bin"** across all UI text — topbar title, trash view, record modal soft-delete confirmation, project canvas, document library, AI tool responses.
- **Recycle Bin moved into Settings → Recycle Bin** — the Recycle Bin section is now a subsection of Settings with full restore/permanent-delete/empty-all actions; the `trash` nav item is no longer in the sidebar.

### CSS — Added / Changed
- `.nav-divider` — 1 px hairline separator (`rgba(255,255,255,.06)`) between sidebar nav groups.
- `.nav-entry-label` — compact uppercase section label (10px, 700 weight); hidden when sidebar is collapsed.
- `.sidebar-footer-user`, `.sidebar-user-name`, `.sidebar-settings-btn` — user identity row in sidebar footer.
- `.mobile-sheet` — always `display: flex`, hidden off-screen via `transform: translateY(100%)`; `.open` slides it up with a cubic-bezier transition. No `display` toggle.
- `.mobile-sheet-overlay` — `opacity: 0; pointer-events: none` when closed; `opacity: 1; pointer-events: auto` when open. No `display` toggle.
- `.mobile-sheet-divider` — 1 px horizontal rule inside the mobile sheet nav.
- `.mobile-sheet-section-label` — uppercase section label inside the mobile sheet.

---

## [2026-05-17] — Topbar/sidebar UX overhaul + Settings → Storage

### UI — Changed
- **Save button removed from topbar** — vault file management (link, unlink, save, status) moved to Settings → Storage.
- **Topbar simplified** — now shows a view icon beside the page title, a vertical divider separating the search bar from the icon group, and an indigo fill on the AI button when the panel is open.
- **Search bar expands on focus** — `min-width` transitions from 180 px to 240 px with an accent border on focus.
- **Sidebar logo mark badge** — a small green ✓ or amber ! badge overlaid on the `N` logo mark indicates vault file link status at a glance; visible collapsed or expanded; hidden when File System Access API is not supported.

### Settings — Added
- **Storage section** — new Settings → Storage section exposes vault file controls: create a new vault file, link an existing file, save now, link a different file, and unlink. Shows current link status and last-saved time. Falls back to an info message on unsupported browsers.

### fs.ts — Added
- `fsUnlink()` — clears the in-memory handle, resets `_fsReady`/`_fsLastSave`, and deletes the IDB entry.

---

## [2026-05-17] — AI production hardening

### Offline Profile — Changed
- **Offline build is now OT-only for AI** — `apps/offline` sets an OT deployment policy that allows only Ollama-compatible local/internal AI endpoints. Browser AI, cloud AI, Hugging Face model downloads, and in-app Ollama model pulls are disabled in this profile.
- **Offline build excludes Transformers payload** — `apps/offline/vite.config.ts` aliases `@huggingface/transformers` to a disabled stub so the OT artifact does not carry browser-model runtime code it cannot use.
- **Offline build stubs browser AI providers** — Chrome Prompt API and WebGPU provider modules are aliased to disabled stubs in the offline build.
- **Offline build stubs cloud providers** — Anthropic, OpenAI, and Google provider modules are aliased to disabled stubs in the offline build so cloud API endpoints are not bundled into the OT artifact.
- **Offline CSP now blocks cloud/internet AI** — removed cloud provider and Hugging Face endpoints from `apps/offline/index.html`; `connect-src` defaults to `http://localhost:11434 http://127.0.0.1:11434`.
- **Internal LAN AI endpoints are build allowlisted** — set `OT_AI_CONNECT_SRC` when building offline to include approved origins such as `https://ai-server.internal` or `http://10.10.1.20:11434`.

### Security — Fixed
- **Transformers.js bundled locally** — replaced the jsDelivr dynamic import with the `@huggingface/transformers` npm package and removed the CDN script allowlist from CSP.
- **`connect-src` tightened** — replaced broad `https:` with explicit AI provider, Hugging Face model-weight, and default Ollama localhost endpoints.
- **AI tool writes validate schemas** — model-proposed create/update fields are now allowlisted against record schemas, required fields are enforced on create, select/date values are validated, and relations must resolve.
- **Internal AI secrets filtered from documents** — the encrypted `__ai_secrets__` record no longer appears in normal document state/list reads.

### AI — Fixed
- **Live AI state hooks** — document and settings views now read AI readiness/secrets through live getters instead of stale one-time snapshots.
- **Model picker persistence** — model switching now writes the structured `aiPrefs` fields consumed by `startAILoad()`.
- **Prompt and usage hooks wired** — Nano initialization receives the real system prompt, and cloud token/cost tracking is connected.
- **Browser tier fallback** — Gemini Nano remains selectable on supported Chrome builds even when WebGPU is unavailable.
- **Cloud model catalog refreshed** — updated default/provider model IDs and pricing from current official provider docs.

---

## [2026-05-16] — WebAssembly CSP fix for in-browser AI (transformers.js)

### Security — Fixed
- **`'wasm-unsafe-eval'` added to `script-src`** — the ONNX runtime inside transformers.js compiles `.wasm` binaries at runtime; without this directive the browser blocks `WebAssembly.instantiate()` with a CSP violation, preventing the Gemma WebGPU models from loading. `'wasm-unsafe-eval'` is scoped to WebAssembly compilation only — unlike `'unsafe-eval'` it does not permit arbitrary JavaScript `eval()`.
- **`generate-csp.mjs` regex fixed** — `resetPlaceholders()` was stripping all single-quoted tokens from `script-src` (using `'[^']*'`), which silently dropped any static keyword like `'wasm-unsafe-eval'` on every rebuild. The regex now only strips hash tokens (`sha256-`, `sha384-`, `sha512-`) and nonce tokens, leaving static directives intact across re-runs.

---

## [2026-05-16] — AI system architecture refactor (nine-module split)

### Architecture — Changed
- **`ai-v1.ts` and `ai-v2.ts` deleted** — 2,000+ lines across two mixed-concern files replaced by nine focused modules in `packages/core/src/ai/`.
- **`ai-prefs.ts`** — isolated preference singleton (`aiPrefs`), `AIPrefs` type, `loadAIPrefs`, `saveAIPrefs`, `syncAIPrefsLegacy`, migration from v1 prefs schema.
- **`providers/`** — six stateless provider files: `browser-nano.ts` (Chrome Prompt API sessions owned by caller), `browser-transformers.ts` (WebGPU via CDN dynamic import), `ollama.ts` (load, call, fetch models, probe, pull, delete), `anthropic.ts`, `openai.ts`, `google.ts` (SSE streaming, token accounting, key testing). Providers receive everything as parameters — no module state.
- **`ai-runtime.ts`** — single owner of all mutable AI state (`aiRuntime` object with `ready`, `loadStarted`, `backend`, `streaming`, `nanoSession`, `webllmPipeline`, `history`, `pendingAction`, `abortController`, etc.); exports `startAILoad`, `disconnectAI`, `callBackend`, and model-chip label helpers. All cross-cutting setters (`setRuntimeHooks`, `setRuntimeSecretsGetter`, `setRuntimePromptBuilder`, `setRuntimeUsageTracker`, `setRuntimeCloudLabelGetters`) injected by their providers.
- **`ai-tools.ts`** — tool catalog, `buildSystemPrompt`, `handleModelOutput`, `extractToolCall`, `routeToolCall`, `applyPendingAction`, `execTool`, `speakResult`. No UI imports; no provider imports.
- **`ai-settings.ts`** — `BROWSER_MODELS`, `CLOUD_PROVIDERS`, onboarding wizard (all 4 steps), AES-GCM encrypted secrets (`aiSecretsLoad/Save/Wipe/Refresh`), cost tracking (`aiTrackUsage`, `aiCurrentMonthKey`). Wires `setRuntimeSecretsGetter` and `setRuntimeCloudLabelGetters` at module init.
- **`ai-ui.ts`** — chat panel and workspace render+bind, model picker, `sendAIMessage`. No circular deps — imports runtime/tools/settings/prefs, nothing imports back.
- **`main.ts`** — AI import section replaced with new modules; `_wireHooks()` calls `setRuntimeHooks`, `setAIUIHooks`, `setAIUISchemas`, `setAISettingsHooks`, `setAIV2IDBHooks`. `setDocsStreamHook` dispatcher simplified from 40-line inline tier dispatch to single `callBackend(...)` call.

### Architecture — Fixed
- **ESM live binding workaround eliminated** — the IIFE hoisting pattern (`const _orig = (function(){ return startAILoad; })()`) that allowed `ai-v2.ts` to override `ai-v1.ts`'s exported function is no longer needed. Mutable state lives on the `aiRuntime` object; any module can write `aiRuntime.property` without owning the binding.
- **Circular import chain broken** — the `ai-v1 ↔ ai-v2` cross-import cycle is gone. New import graph is a strict DAG.
- **`exactOptionalPropertyTypes` compliance** — cloud provider call sites now use conditional spread (`signal !== undefined ? { signal } : {}`) instead of passing `signal: AbortSignal | undefined` directly to a `signal?: AbortSignal` parameter.
- **`noUncheckedIndexedAccess` compliance** — CRC32 implementation in `documents.ts` now uses `DataView.getUint8(i)` (always returns `number`, throws on OOB) for byte access and `!` assertion for the 256-entry lookup table where `& 0xFF` statically bounds the index.

---

## [2026-05-16] — Document editor fixes, production DOCX export, Copilot-style inline AI

### Documents — Fixed
- **Save button non-functional** — `bindDocumentEditor()` was never called when the modal opened because the deferred hook in `library.ts` was never wired up. Fixed by moving `renderDocModal`/`bindDocModal` fully into `documents.ts` and calling `bindDocumentEditor()` directly from `bindDocModal()`. All editor listeners (Save, toolbar, tabs, file upload, exports, AI) now attach reliably on every open.
- **Close (×) icon overlapping Save button** — the floating `doc-modal-close` button was `position:absolute` over the topbar where Save sits. Removed the button and its CSS rule. The topbar Back button auto-saves and closes; backdrop click-to-close still works.

### Documents — Added
- **Production DOCX export** — replaces the previous HTML-disguised-as-Word hack. Generates a standards-compliant OOXML `.docx` (ZIP + XML) in pure TypeScript with no external library. Supports: H1/H2/H3 with Word's built-in Heading styles (Calibri Light), paragraphs, bold, italic, underline, bullet lists, numbered lists, tables (header row shading), hyperlinks (proper `r:id` relationship entries), blockquotes, line breaks. Opens natively in Word with full style editability.
- **AI Edit modal (whole-document rewrite)** — clicking "AI Edit" opens a focused prompt modal inside the document editor. User enters an instruction; clicking Write closes the modal, saves a version snapshot, and streams the AI's rewrite token-by-token directly into the editor. A Stop button in the topbar halts the stream. Works with cloud (Anthropic/OpenAI/Google) and Ollama tiers.
- **Inline Copilot-style selection toolbar** — when text is selected in the editor and AI is connected, a floating toolbar appears above the selection with 8 actions: Rewrite (with instruction input), Improve, Expand, Summarise, Translate (with language input), Table, Make Formal, Shorten. AI output streams into a preview bubble; user chooses Replace, Insert Below, Regenerate, or Discard. Matches Microsoft Copilot Word 2026 workflow.

### Architecture — Changed
- `renderDocModal` and `bindDocModal` moved from `library.ts` to `documents.ts` — consolidates the full document editor lifecycle in one module. `library.ts` retains `openDocumentEditor`/`closeDocumentEditor` which call through hooks to set state.
- New `setDocsStreamHook(fn)` in `documents.ts` — injected from `main.ts` with a tier-dispatching streaming function that routes to `callAnthropic`, `callOpenAI`, `callGoogle`, or a direct Ollama SSE reader depending on `_aiPrefs.tier`.

---

## [2026-05-16] — Monorepo migration: TypeScript modules, Vite build, adapter interface

### Architecture — Changed
- **Single HTML file (`taskapp.html`) extracted into TypeScript monorepo** — all 7,853 lines split into 35 typed modules across `packages/core/src/`. The original `taskapp.html` remains in the repo root as a historical reference.
- **pnpm workspaces** — monorepo managed with pnpm; packages: `core`, `adapter-null`, `adapter-rxdb` (stub), `adapter-dataverse` (stub); apps: `offline`, `sync`, `dataverse`, `mobile`.
- **Vite build pipeline** (`vite-plugin-singlefile`) — `pnpm run build:offline` produces `dist/offline/index.html` (~276 kB), a single self-contained HTML file functionally identical to the original. Deployment experience unchanged: open in Chrome or Edge from `file://`.
- **TypeScript strict mode** — all 35 modules use `strict: true`. Type annotations added; function logic unchanged.
- **`generate-csp.mjs` integrated into build** — runs automatically post-build via `build:offline` script; computes SHA-256 of the single bundled script block; writes hash to CSP meta tag and `dist/offline/index.sha256`. No longer needs to be run manually.

### Architecture — Added
- **Sync adapter interface** (`packages/core/src/adapter-interface.ts`) — four-method contract: `pull`, `push`, `stream`, `clear`. Wired into `dbInit` (pull on unlock) and `dbFlush` (push after every write).
- **`NullAdapter`** (`packages/adapter-null/src/index.ts`) — offline-only no-op adapter. All four methods inherited from `SyncAdapter` base. Current default for all builds. Zero behaviour change from original.
- **`RxDBAdapter`** stub (`packages/adapter-rxdb/src/index.ts`) — not yet implemented.
- **`DataverseAdapter`** stub (`packages/adapter-dataverse/src/index.ts`) — not yet implemented.
- **App entry points** (`apps/offline/src/entry.ts`, `apps/sync/src/entry.ts`) — set adapter and call `init()`.
- **Hook injection pattern** — cross-module dependencies (views → `appRenderWorkspace`, state → AI wizard, components → AI guard) injected via setter functions from `main.ts`'s `_wireHooks()` to avoid circular imports.
- **`_wireHooks()`** in `main.ts` — single startup function that injects all cross-module function references before first render.

### Breaking — Internal (no user-visible change)
- **`_idbLoadStore` and `_idbPutRecord` now take `cryptoKey` as explicit parameter** — resolved circular import between `idb-data.ts` and `db.ts` (see ADR-019).
- **`fs.ts` imported lazily inside `dbFlush()`** — dynamic `import('./fs.js')` breaks module-evaluation cycle; `fsWriteVault()` still called after every flush as before.
- **`initCrypto` moved from `crypto.ts` to `vault.ts`** — owns vault operations; avoids circular import with crypto module.

---

## [2026-05-15] — Security hardening, storage migration, code quality pass

### Security — Added
- **Content Security Policy** (`Content-Security-Policy` meta tag) with SHA-256 hashes for all 15 inline script blocks; `strict-dynamic`; `object-src 'none'`; `base-uri 'none'`; `trusted-types nexus-crm nexus-crm-raw`; `require-trusted-types-for 'script'`. Style blocks are not hashed — when `style-src` contains hashes, browsers ignore `unsafe-inline` per spec, which blocks the 177+ inline `style=` attributes throughout render functions. `frame-ancestors` is not in the meta tag — browsers ignore it there per spec (only works in HTTP response headers).
- **`require-trusted-types-for 'script'`** in CSP — any future unguarded `innerHTML` assignment now throws instead of silently executing
- **Trusted Types policies**: `nexus-crm` (sanitises user data) and `nexus-crm-raw` (wraps safe template HTML) registered once at module scope; `patchInnerHTML()` IIFE overrides `Element.prototype.innerHTML` so all existing template assignments are routed through the raw policy automatically
- **`Referrer-Policy: no-referrer`** meta tag — no referrer data leaves the app on any network request
- **`Permissions-Policy`** meta tag — camera, microphone, geolocation, payment, USB, and Bluetooth locked out entirely
- **`generate-csp.mjs`** companion Node.js script — auto-generates SHA-256 hashes for all 15 inline script blocks (not style blocks — see rationale above) and writes them into the CSP meta tag after every edit; also emits `taskapp.sha256`
- **`taskapp.sha256`** file integrity companion — SHA-256 hash of the full HTML file; startup self-check (`checkFileIntegrity()`) detects `file://` protocol and skips (Chrome/Edge block `fetch()` from `file://` via CORS); when served via HTTP/HTTPS, fetches and verifies the hash; shows a red banner if mismatch detected
- **`navigator.storage.persist()`** called once at startup — requests browser mark IDB data as persistent so it won't be evicted under storage pressure

### Security — Fixed
- **`btoa(String.fromCharCode(...array))` stack overflow** — replaced all 5 occurrences with `u8ToBase64()` helper (`Uint8Array.prototype.toBase64()` with 64KB-chunked `btoa` fallback); and `base64ToU8()` for decoding. The old pattern throws a `RangeError` when the encrypted vault exceeds ~65KB, causing silent data loss.
- **Duplicate Trusted Types policy creation** — `_ttRaw()` was calling `trustedTypes.createPolicy('nexus-crm-raw', ...)` on every invocation; `patchInnerHTML` had already registered that name; per spec this throws a `TypeError`. Fixed by hoisting `_rawPolicy` to module scope so both share the single registered instance.
- **Double `reset-app-btn` event listener** — a leftover incomplete handler was registered back-to-back with the correct async handler on the same line; on click both fired, producing two stacked confirm dialogs and running `localStorage.clear()` before IDB cleanup completed. Removed the leftover handler.
- **`_vaultMetaSet` had no error handling** — IDB write failures (disk full, quota exceeded, private browsing) propagated as unhandled rejections with no user-visible error; wrapped in `try/catch` that rethrows a readable message.

### Storage — Changed
- **Vault, salt, verify token, and KDF version migrated from `localStorage` to IndexedDB** (`nexus_vault_v2` / store `meta`). Removes the 5MB `localStorage` cap as a hard ceiling on CRM data. One-time silent migration on first load — reads existing `localStorage` data, writes to IDB, removes `localStorage` keys. Idempotent.
- **`dbFlush()` debounced** — `dbCreate`, `dbUpdate`, `dbDelete` now call `_scheduleFlush()` (300ms debounce) instead of `await dbFlush()` directly. Eliminates redundant encrypt+write cycles during rapid consecutive mutations (bulk import, fast field edits). In-memory `_dbData` still updates immediately so reads are never stale. A `beforeunload` handler forces an immediate flush on tab close.

### Code quality — Fixed
- **Eliminated redundant IDB round-trip in `initCrypto()`** — `getSalt()` already fetches `SALT_KEY`; the subsequent `isFirstRun()` call fetched the same key again. Replaced with a single `!hasVault` check.
- **`navigator.storage.persist()` moved from `afterUnlock()` to `init()`** — was called on every unlock including session-key restores (every F5); now runs once per session.
- **`subscribe()` return value stored** — the unsubscribe function returned by `subscribe()` in `afterUnlock` is now captured as `_unsubscribe`.
- **`setInterval` for due-date polling stored** — reference captured as `_dueDateInterval`.
- **`insertAdjacentHTML` now routes through `_rawPolicy`** — closing the Trusted Types gap where the toast fallback path bypassed the `innerHTML` patch.
- **Commented-out dead code removed** — stale `_fsReady` toast hint block removed from `afterUnlock`.
- **Dead code removed** — `safeHTML()`, `_ttRaw()`, `_vaultMetaDel()`, and the `KEY_BITS` constant were defined but never called; removed.
- **Stale comments corrected** — `// localStorage blob` and `// Load CRM data from localStorage vault` updated to reflect IDB storage.

### Previously established (pre-hardening baseline)

The following were already in place before this hardening pass and are recorded here for completeness:

- AES-256-GCM encryption for all CRM data at rest
- PBKDF2-HMAC-SHA-256 at 600,000 iterations (OWASP 2026) — up from 310,000; transparent migration on unlock
- Non-extractable `CryptoKey` stored in IndexedDB (`nexus_keys_v1`) — key bytes never exist as a JS string
- Per-record AES-GCM encryption for `documents` and `conversations` in `nexus_data_v1`
- Brute-force lockout on auth — exponential delay starting at 500ms, capped at 30 seconds
- `escH()` applied consistently to all user-visible strings before `innerHTML` interpolation
- Dual-save: IDB vault + File System Access API `.vault` disk file (`nexus-data.vault`)
- Three AI tiers: Chrome Built-in AI, local Ollama, cloud (Anthropic/OpenAI/Google); cloud API keys stored AES-GCM encrypted in IDB
- System font stack (no CDN dependency) for true offline operation
- No `eval()`, no `new Function()` anywhere in the codebase

---

*`generate-csp.mjs` runs automatically as part of `pnpm run build:offline`. Run `pnpm run build:offline` after every source edit to produce an updated `dist/offline/index.html` with correct CSP hashes.*
