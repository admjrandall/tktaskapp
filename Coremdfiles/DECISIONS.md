# Architecture Decision Records

**Task App CRM** — TypeScript monorepo; offline-web, enterprise-web PWA, and Dataverse targets
**Last reviewed:** 2026-05-24 (ADR-038 added)

This document records every significant architectural and technical decision made for the application — what was chosen, what alternatives were considered, and why. Each decision entry answers the question: _"Why does the code look like this?"_

---

## ADR-001 — Single-file deployment with TypeScript monorepo source

**Status:** Active (supersedes original ADR-001)
**Date:** 2026-05-16 (migrated from single-file; original from project origin)

### Decision

The application is **developed** as a TypeScript monorepo (pnpm workspaces, Vite, `vite-plugin-singlefile`) and **deployed** as a single self-contained HTML file (`dist/offline/index.html`). Development experience uses a proper module system with TypeScript strict mode; deployment experience is unchanged — one file, open in browser.

### Original decision (project origin)

The original app was a single `taskapp.html` with all CSS, HTML, and JS inline, no build step. This satisfied the core constraint but created a 7,853-line global-scope JavaScript file with no module system, no type safety, and no separation of concerns.

### Why migrate to a build step

The original no-build approach was correct for the initial constraint (no install, no server). It became limiting once sync adapters, multiple deployment targets (offline, PWA, Capacitor, Code App), and TypeScript type safety were required. A build step that **produces** the same single-file output preserves the deployment experience while unlocking the development tools.

### Why `vite-plugin-singlefile`

It inlines all JS and CSS into `<script>` and `<style>` tags, producing a truly self-contained HTML file with no external asset references. Designed specifically for offline single-file web apps opened from `file://`. Actively maintained as of May 2026.

### Consequence

- Editing source: change files in `packages/core/src/`, run `pnpm run build:offline`, open `dist/offline/index.html`.
- `generate-csp.mjs` runs automatically post-build, recomputes the single bundled script hash, and writes `dist/offline/index.sha256`.
- The legacy `taskapp.html` remains in the repo root as a historical reference but is not the active codebase.

---

## ADR-002 — `file://` protocol as the launch mechanism

**Status:** Active  
**Date:** Project origin

### Decision

The app opens directly from the filesystem via `file://`. No local web server is required for core functionality.

### Alternatives considered

- Require `npx serve` or `python -m http.server` to run
- Bundle as a Chrome extension (gets a secure origin)
- Self-contained Electron app

### Rationale

A local server adds a step that breaks the "no install" requirement. Chrome extensions require packaging and distribution. Electron requires installing a runtime. `file://` works everywhere, immediately, with no prerequisites. Most browser APIs the app needs — IndexedDB, WebCrypto, File System Access API — work from `file://`.

### Known limitations accepted

- **OPFS is unavailable from `file://`** — OPFS requires a secure context (HTTPS or localhost). This is why large file attachments use IndexedDB instead.
- **`fetch()` to same-origin files is blocked from `file://`** — Chrome and Edge block all `fetch()` calls from `file://` origins via CORS policy. The integrity check detects `location.protocol === 'file:'` at startup and returns immediately with an informational console message rather than firing failed requests. The check runs correctly when served via HTTP or HTTPS.
- **WebLLM (transformers.js) requires a Web Worker** — Workers spawned from blob URLs work from `file://` in Chrome/Edge but may not in all browsers. WebLLM is an optional tier; the app falls back gracefully.
- **Ollama CORS** — Ollama requires `OLLAMA_ORIGINS=null` when called from `file://` or the specific served origin when hosted. OT builds should avoid `*`.

---

## ADR-003 — IndexedDB for all vault storage (replaced localStorage)

**Status:** Active  
**Date:** 2026-05-15 (changed from localStorage)

### Decision

The encrypted vault blob, salt, verify token, and KDF version are stored in IndexedDB (`nexus_vault_v2` / store `meta`). localStorage is used only for non-sensitive UI preferences (theme, dashboard layout, AI prefs).

### What it replaced

Previously, `nexus_vault_v1`, `nexus_salt_v1`, `nexus_verify_v1`, and `nexus_kdf_v` all lived in localStorage. This worked but imposed a hard 5MB limit per origin across all browsers.

### Alternatives considered

- Keep localStorage with compression (LZ-String)
- OPFS for the vault file
- Keep localStorage and limit data

### Rationale

**localStorage has a hard 5MB cap per origin** in all major browsers. A CRM with documents, file attachments, and conversation history will exceed this. IndexedDB has no fixed cap — quota is typically 50%+ of available disk space. The migration is transparent: `_migrateLocalStorageToIDB()` runs once on first load, moves data, and removes the old keys.

OPFS was not chosen because it requires a secure context (`https://` or `localhost`) — unavailable from `file://` (see ADR-002).

### Migration strategy

`_migrateLocalStorageToIDB()` is idempotent: it checks for the existence of `SALT_KEY` in IDB before running. If it finds data in localStorage and not in IDB, it copies it over and removes the localStorage keys. Existing users lose no data.

---

## ADR-004 — AES-256-GCM with PBKDF2 at 600,000 iterations

**Status:** Active  
**Date:** Project origin; iteration count updated 2024

### Decision

All data at rest is encrypted with AES-256-GCM. The encryption key is derived from the user's password using PBKDF2-HMAC-SHA-256 at 600,000 iterations with a 32-byte random salt.

### Alternatives considered

- AES-128-GCM (smaller key, faster)
- Argon2id (memory-hard, stronger against GPU attacks)
- Storing the key in the OS keychain

### Rationale

AES-256-GCM is the WebCrypto standard and is natively accelerated on all modern hardware. 256-bit keys provide adequate security for personal data. AES-128 was rejected as there is no performance reason to use a shorter key when the browser is doing the work.

Argon2id is theoretically stronger for key derivation (memory-hardness makes GPU attacks more expensive) but **is not available in the WebCrypto API**. Implementing it in pure JavaScript would be both slow and unaudited. PBKDF2 at 600,000 iterations is the OWASP 2026 recommendation for WebCrypto contexts.

The OS keychain was not used because it is not accessible from a browser running a `file://` document, and it would tie the app to a specific OS.

### IV / nonce

A fresh 12-byte random IV is generated per encryption call via `crypto.getRandomValues()`. The IV is prepended to the ciphertext and stored alongside it. IV reuse with AES-GCM would be catastrophic — random IVs prevent this given the low encryption volume of a personal CRM.

### Legacy migration

The original iteration count was 310,000. When a vault at 310,000 iterations is detected (KDF version `'1'`), `initCrypto()` silently re-derives at 600,000, re-encrypts the vault with a new salt, and marks the upgrade complete. The password entry experience is unchanged.

---

## ADR-005 — Non-extractable CryptoKey stored in IndexedDB for session caching

**Status:** Active  
**Date:** Project origin

### Decision

After successful password unlock, the `CryptoKey` object is stored directly in IndexedDB (`nexus_keys_v1`) with `extractable: false`. The app checks for a cached key on page load and skips the password prompt if one is found and valid.

### Alternatives considered

- Store the raw key bytes in sessionStorage
- Re-derive the key on every page load (require password on every F5)
- Store the key in a cookie

### Rationale

**sessionStorage with raw key bytes** would mean the key exists as a JavaScript string — it could be read by any code running on the page. Storing a non-extractable `CryptoKey` object in IDB means the key material never exists in JavaScript memory as readable bytes. Only the browser engine can use it.

**Requiring the password on every F5** was rejected as a UX tradeoff — the target is a CRM used throughout the workday, not a one-shot tool.

**Cookies** do not persist a `CryptoKey` object; only strings. Encoding the key as bytes in a cookie would expose it to the same risks as sessionStorage.

The `CryptoKey` approach is the only one that both caches the session and keeps the key material opaque to JavaScript. The security boundary is tab close — the key is cleared when the tab is closed.

---

## ADR-006 — SHA-256 hash-based CSP (not nonce-based)

**Status:** Active  
**Date:** 2026-05-15

### Decision

The Content Security Policy uses SHA-256 hashes for each inline **script** block only. Style blocks are intentionally not hashed. A companion script (`generate-csp.mjs`) regenerates the script hashes and updates the CSP meta tag after every edit.

### Alternatives considered

- Nonce-based CSP
- `'unsafe-inline'` with no hash
- No CSP at all

### Rationale

**Nonce-based CSP** requires a server to inject a fresh random nonce into every HTTP response. This app has no server and is opened via `file://`. Nonces are not applicable.

**`'unsafe-inline'`** would allow any inline script to execute — it defeats the primary purpose of CSP (XSS mitigation) and is explicitly deprecated by OWASP and MDN.

**Hash-based CSP** is the correct approach for static files served without a server (per Google web.dev and OWASP cheat sheets). The tradeoff is that the hash must be regenerated after every edit — which `generate-csp.mjs` automates. The script also generates `taskapp.sha256` for file integrity detection.

---

## ADR-007 — Trusted Types with `patchInnerHTML` instead of a full render rewrite

**Status:** Active  
**Date:** 2026-05-15

### Decision

Trusted Types enforcement is implemented by registering two policies (`nexus-crm` and `nexus-crm-raw`) and monkey-patching `Element.prototype.innerHTML` to automatically route all string assignments through `_rawPolicy`. This avoids a full rewrite of 200+ render functions.

### Alternatives considered

- Full rewrite to DOM APIs (`createElement`, `textContent`, `setAttribute`)
- DOMPurify as the sanitisation library
- Skip Trusted Types entirely, rely on `escH()` alone

### Rationale

**Full DOM API rewrite** would eliminate all `innerHTML` usage — the gold standard — but would require restructuring 200+ render functions across 7,800 lines of code. The risk of introducing rendering bugs during such a rewrite outweighs the incremental security benefit given that `escH()` is already applied consistently.

**DOMPurify** is the most widely recommended sanitiser but is an external dependency. This app has zero external dependencies and must work fully offline. DOMPurify would need to be inlined as a base64 data URI or copied inline — adding ~50KB and a supply-chain dependency.

**The patch approach** satisfies the Trusted Types enforcement requirement (every `innerHTML` assignment goes through a registered policy), adds a second XSS layer on top of `escH()`, and requires no changes to existing render functions. Future additions automatically get the protection.

**The one rule this creates:** `trustedTypes.createPolicy('nexus-crm-raw', ...)` must never be called again — the spec throws a `TypeError` on duplicate policy names without `'allow-duplicates'` in the CSP.

---

## ADR-008 — Debounced vault flush (300ms) instead of per-operation flush

**Status:** Active  
**Date:** 2026-05-15

### Decision

`dbCreate`, `dbUpdate`, and `dbDelete` call `_scheduleFlush()` (300ms debounce) instead of `await dbFlush()` directly. In-memory `_dbData` is updated immediately. A `beforeunload` handler forces a flush on tab close.

### Alternatives considered

- Flush synchronously on every write (previous behaviour)
- Flush every N writes
- Use IndexedDB per-record storage for all CRM stores (not just documents/conversations)

### Rationale

**Flushing on every write** means every create/update/delete triggers a full AES-GCM re-encryption of the entire CRM payload. For a user editing a task description character by character, or importing 100 records, this causes dozens of encrypt+write cycles in rapid succession. Google's web.dev IDB best practice guidance explicitly warns against this pattern.

**Per-record IDB storage for all stores** (like documents/conversations) would eliminate the batch-flush entirely but would require each of the 12 CRM stores to be individually managed, with per-record encryption. The current architecture was chosen because CRM records are small and infrequently modified — a 300ms debounce captures natural interaction pauses. Documents and conversations are already per-record because they are large.

**300ms** was chosen as a value that captures most rapid edits without a perceptible delay. The `beforeunload` flush ensures no data is lost on tab close even if a debounced write is pending.

---

## ADR-009 — `u8ToBase64` / `base64ToU8` helpers instead of `btoa(String.fromCharCode(...))`

**Status:** Active  
**Date:** 2026-05-15

### Decision

Base64 encoding uses `Uint8Array.prototype.toBase64()` (September 2025, all major browsers) with a 64KB-chunked `btoa` fallback. Base64 decoding uses `Uint8Array.fromBase64()` with an `atob` fallback.

### What it replaced

`btoa(String.fromCharCode(...array))` — spreading a `Uint8Array` into `String.fromCharCode` as function arguments.

### Rationale

The spread pattern hits the JavaScript engine's maximum argument count limit (commonly 65,000–125,000 arguments depending on browser and OS). For an encrypted CRM vault with many records or large documents, the ciphertext easily exceeds this size. The call throws a `RangeError: Maximum call stack size exceeded` — a silent data loss failure where the vault cannot be saved.

`Uint8Array.toBase64()` is a native method that avoids argument passing entirely. The 64KB chunked fallback is safe at any size. Both paths produce identical base64 output.

---

## ADR-010 — Dual-save: IndexedDB vault + File System Access API disk file

**Status:** Active  
**Date:** Project origin

### Decision

Every vault save writes to both IndexedDB (`nexus_vault_v2`) and, if a file handle is established, to a `.vault` disk file via the File System Access API.

### Rationale

IndexedDB data can be evicted by browsers under storage pressure (especially on Safari, which previously had a 7-day eviction policy for infrequently accessed sites). Calling `navigator.storage.persist()` requests persistent storage, but browsers are not required to grant it. For a personal CRM where data loss is catastrophic, a second copy on disk — the user's own filesystem, not a cloud — provides a recovery path that is entirely independent of browser behaviour.

The File System Access API handle is stored in a separate IDB database (`nexus_fs_v1`) so that on next launch the file can be re-opened automatically (subject to permission re-grant in some browsers).

### Limitation

The File System Access API is only available in Chrome and Edge. On other browsers (Firefox, Safari), only the IDB vault is used. Firefox and Safari users should use the export/backup function for off-machine copies.

---

## ADR-011 — `documents` and `conversations` stored with per-record IDB encryption

**Status:** Active  
**Date:** Project origin

### Decision

`documents` and `conversations` are stored in `nexus_data_v1` with each record individually AES-GCM encrypted, rather than being included in the single vault blob.

### Rationale

The vault blob is loaded entirely into memory on unlock and re-encrypted entirely on every flush. Including large document content in this blob would make the memory footprint and flush cost proportional to total document size. A user with 100 large documents would face slow unlocks and slow saves on every CRM operation.

Per-record encryption means only the record being read or written is touched. The tradeoff is slightly more complex code (separate open/read/write paths for IDB stores vs vault stores) and that the IDB stores do not benefit from the debounced flush.

---

## ADR-012 — String-template render functions instead of DOM APIs

**Status:** Active  
**Date:** Project origin

### Decision

All views are rendered by functions that return HTML strings, which are then set via `element.innerHTML`. Event listeners are re-attached after every render.

### Alternatives considered

- React, Vue, Solid, or similar component frameworks
- Direct DOM manipulation with `createElement` / `textContent`
- A lightweight virtual DOM

### Rationale

Frameworks require either a CDN (breaks offline) or inlining their source (adds significant size and a supply-chain dependency). Direct DOM manipulation for complex views (a Kanban board with drag-drop, a project canvas with draggable panels) produces hundreds of lines of verbose, error-prone imperative code.

String templates are readable, writable without tooling, and fast enough for a single-user local app. The XSS risk they introduce is mitigated by `escH()` consistently applied to all user data, plus the Trusted Types enforcement layer.

The tradeoff — losing event listeners on every full render, no fine-grained updates — is managed by the `appRenderWorkspace()` partial update path that only replaces `#workspace-container` on most interactions.

---

## ADR-013 — Three AI tiers: Browser, Ollama, Cloud

**Status:** Active  
**Date:** Project origin

### Decision

AI is optional and user-selectable across three tiers: Chrome Built-in AI (Gemini Nano), local Ollama, and direct cloud API calls (Anthropic/OpenAI/Google). The app works fully without any AI tier configured.

### Rationale

**Browser tier** works from `file://` with no network — maximum privacy, zero cost, but quality limited by on-device model capabilities.

**Ollama tier** provides high-quality models locally with full privacy. Requires a one-time installation on the user's machine and CORS configuration. Best for privacy-sensitive CRM data.

**Cloud tier** provides the highest model quality with no local compute requirements. Sends a CRM data summary to the provider's API. Appropriate when the user is comfortable with the provider's privacy terms.

No single tier satisfies all users. Providing all three with a user-controlled selection gives each user the privacy/quality/cost tradeoff that fits their situation.

Cloud API keys are stored AES-GCM encrypted under the vault key in IDB, not in plaintext — they are only accessible to a user who knows the vault password.

---

## ADR-014 — System font stack, no CDN fonts

**Status:** Active  
**Date:** Project origin

### Decision

The app uses the system-ui font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`) instead of loading a custom font from a CDN.

### What it replaced

DM Sans was the originally intended font, to be loaded from Google Fonts.

### Rationale

Loading from Google Fonts requires a network request and breaks offline operation. Embedding a font as a base64 data URI adds significant file size (~50–200KB per weight). The system font stack renders well on all modern platforms (San Francisco on macOS/iOS, Segoe UI on Windows, Roboto on Android) and requires zero additional bytes.

To restore DM Sans, a base64 `@font-face` block can be added to the `<style>` section — this is noted in a comment at line 30.

---

## ADR-015 — `navigator.storage.persist()` called once in `init()`, not on every unlock

**Status:** Active  
**Date:** 2026-05-15

### Decision

`navigator.storage.persist()` is called once in `init()` before the auth flow, rather than in `afterUnlock()` which runs on both fresh login and session-key restores.

### Rationale

`afterUnlock()` runs on every page load when a valid session key is cached (i.e., every F5 during a work session). Calling `persist()` inside it would fire the request on every reload. While browsers handle repeated calls gracefully, it is semantically incorrect — the persistence grant is per-origin, not per-session. Moving it to `init()` ensures it runs exactly once per page load regardless of the auth path.

---

## ADR-016 — Brute-force lockout as UI-only protection, not cryptographic

**Status:** Active  
**Date:** Project origin

### Decision

Failed password attempts trigger an exponential delay (500ms base, doubles per attempt, capped at 30 seconds) in the browser UI only. The lockout state is in-memory and cleared on page refresh.

### Rationale

A cryptographic brute-force defence would require server-side state or a hardware token — neither is available in an offline `file://` app. The UI lockout deters casual attempts from a logged-in user's device but does not protect against an attacker who has a copy of the IDB files and can attempt offline dictionary attacks at hardware speed.

The actual defence against offline attacks is PBKDF2 at 600,000 iterations. A GPU attacking PBKDF2-HMAC-SHA-256 at 600k iterations would need approximately 1,000+ years to exhaust a 12-character mixed-case alphanumeric password. **Password strength is the primary security control.** The UI lockout is a secondary convenience.

This limitation is documented in SECURITY.md under accepted risks.

---

## ADR-017 — TypeScript monorepo with pnpm workspaces

**Status:** Active
**Date:** 2026-05-16

### Decision

Source code is organised as a pnpm workspace monorepo with packages (`core`, `adapter-null`, `adapter-rxdb`, `adapter-dataverse`) and apps (`offline`, `sync`, `dataverse`, `mobile`). TypeScript strict mode throughout.

### Rationale

The strategic direction (STRATEGIC-DIRECTION-FINAL.md) identified three deployment targets (offline single-file, PWA sync, Dataverse Code App, Capacitor mobile) sharing one core codebase. A monorepo with a clean package boundary is the only maintainable structure for this. pnpm workspaces was chosen over npm/yarn workspaces for its strict `node_modules` isolation and fast install performance.

### Consequence

- `packages/core` contains all application logic and has no direct dependency on any adapter.
- Adapter implementations are injected at the app entry point (`apps/*/src/entry.ts`) via `setAdapter()`.
- All three adapter packages currently have stubs; `NullAdapter` is the active default.

---

## ADR-018 — Sync adapter interface with hook injection for circular-import avoidance

**Status:** Active
**Date:** 2026-05-16

### Decision

Cross-module dependencies that would create circular imports are resolved by **hook injection**: a module exports a setter function (`setFooHooks(...)`) that receives the dependency at runtime from `main.ts`, rather than importing it at module scope.

### Rationale

`db.ts` needs to call `fsWriteVault()` from `fs.ts` after every flush, but `fs.ts` imports from `vault.ts` which imports from `crypto.ts` — creating a cycle if `db.ts` imported `fs.ts` at module scope. The solution is a lazy dynamic import (`const fs = await import('./fs.js')`) inside `dbFlush()`, which breaks the cycle at module-evaluation time.

Similarly, views need `appRenderWorkspace` from `main.ts`, but `main.ts` imports all views. This is resolved by each view exporting a `setXxxHooks(appRenderWorkspace)` function called once from `main.ts`'s `_wireHooks()` during startup.

### Consequence

`_wireHooks()` in `main.ts` is the single place where all cross-module function references are injected. It must be called before the first render. Adding a new view requires adding its hook setter call to `_wireHooks()`.

---

## ADR-019 — `cryptoKey` passed as explicit parameter to `idb-data.ts` functions

**Status:** Active
**Date:** 2026-05-16

### Decision

`_idbLoadStore(storeName, cryptoKey)` and `_idbPutRecord(storeName, record, cryptoKey)` take `cryptoKey` as an explicit parameter rather than reading a module-level `_dbKey` variable.

### Rationale

In the original single-file app, `_dbKey` was global and accessible everywhere. In the module system, `idb-data.ts` sits below `db.ts` in the dependency graph. If `idb-data.ts` imported `_dbKey` from `db.ts`, it would create a circular import (`db → idb-data → db`). Passing the key as a parameter is the clean resolution — `db.ts` owns `_dbKey` and passes it explicitly to every `idb-data` call.

---

## ADR-020 — NullAdapter as default; adapter set at app entry point

**Status:** Active
**Date:** 2026-05-16

### Decision

`packages/core` never imports a concrete adapter. The active adapter is injected via `setAdapter()` in `db.ts`, called from `apps/*/src/entry.ts` before `init()`.

### Rationale

This keeps `core` fully agnostic of any sync backend. Each `apps/*/` build can choose its adapter independently. The `NullAdapter` (all methods are inherited no-ops from `SyncAdapter`) is set in `apps/offline-web/` (all three sub-profiles) and `apps/pwa-sync/`, preserving current offline-only behaviour with zero code change to core logic.

### Consequence

Switching the offline app to sync (when `RxDBAdapter` is implemented) requires only changing one line in `apps/pwa-sync/src/entry.ts`. Core logic is untouched.

---

## ADR-021 — OOXML DOCX export in pure TypeScript (STORED mode ZIP, no library)

**Status:** Active
**Date:** 2026-05-16

### Decision

DOCX export generates a valid OOXML `.docx` file using a hand-written ZIP builder (STORED mode, no DEFLATE) and an HTML-to-OOXML converter, both in pure TypeScript inside `documents.ts`. No external library is used.

### Alternatives considered

- **`docx` npm package** — would add ~200 kB to the bundle and a supply-chain dependency; incompatible with the single-file offline constraint without significant bundler configuration.
- **HTML file with `application/msword` MIME** — the previous approach. Modern Word versions (2019+) often refuse to open it or show a warning; it is not a valid `.docx` and loses all formatting metadata.
- **`htmlDocx-js`** — produces a Blob that some versions of Word accept, but uses the same HTML-in-Word trick and is unmaintained.

### Rationale

The app has a hard constraint: the entire build must fit in a single self-contained HTML file with no CDN or external assets. Any library producing real OOXML must either be bundled inline (adds size) or fetched at runtime (breaks offline). Writing the ZIP builder and OOXML converter inline is ~200 lines and produces a file that Word opens natively with no warnings.

### ZIP format choice

PKZIP STORED mode (compression method 0) requires no DEFLATE implementation in the browser. Word and all other OOXML consumers accept STORED-mode ZIP — it is valid per the Open Packaging Conventions spec (ECMA-376 Part 2).

### Consequence

The OOXML converter handles the HTML elements the editor produces (H1–H3, p, ul, ol, table, strong, em, u, a, br, blockquote). Elements outside this set fall back to plain paragraph text. Adding new element support requires extending `nodeToParas` / `nodeToRuns` in `documents.ts`.

---

## ADR-023 — AI system refactored into nine purpose-specific modules

**Status:** Active
**Date:** 2026-05-16

### Decision

The AI system was split from two large mixed-concern files (`ai-v1.ts`, `ai-v2.ts`) into nine focused modules: `ai-prefs.ts`, `providers/browser-nano.ts`, `providers/browser-transformers.ts`, `providers/ollama.ts`, `providers/anthropic.ts`, `providers/openai.ts`, `providers/google.ts`, `ai-runtime.ts`, `ai-tools.ts`, `ai-settings.ts`, `ai-ui.ts`.

### What it replaced

`ai-v1.ts` (1,178 lines) mixed runtime state, UI rendering, tool execution, model loading, and preference handling. `ai-v2.ts` layered cloud providers, the onboarding wizard, and secrets management on top via an IIFE hoisting pattern to override exported functions — a pattern that was correct but fragile and non-obvious.

### Rationale

**Single-responsibility boundaries** — each module has one clear owner: ai-runtime owns all mutable state, ai-tools owns the tool catalog and executor, ai-settings owns the wizard and secrets, ai-ui owns rendering and event binding, and each provider file is a stateless call adapter.

**ESM live binding problem** — `export let` can only be mutated by the declaring module. The old codebase had to work around this with the IIFE hoisting pattern so `ai-v2.ts` could override `startAILoad` from `ai-v1.ts`. The new architecture avoids this entirely: all mutable state lives on `export const aiRuntime = { ... }`. Any module can write `aiRuntime.ready = true` — they're mutating an object property, not an ESM binding.

**Circular import elimination** — the old `ai-v1.ts` → `ai-v2.ts` → `ai-v1.ts` hookback cycle is gone. The new graph is a strict DAG: `ai-runtime` ← `ai-tools` ← `ai-ui`. Remaining cross-cutting calls use the same hook injection pattern established in ADR-018.

### Alternatives considered

- Keep the two-file structure but refactor internally — would still have mixed concerns and the ESM binding workaround
- Use a class with a singleton instance — would work but adds unnecessary ceremony for a single-instance stateful object; the plain object is idiomatic TypeScript and simpler to inspect

### Consequence

- `ai-v1.ts` and `ai-v2.ts` deleted.
- `main.ts` now calls `setRuntimeHooks`, `setAIUIHooks`, `setAIUISchemas`, `setAISettingsHooks`, `setAIV2IDBHooks` instead of `setAIV1Hooks`/`setAIV2Hooks`.
- The `setDocsStreamHook` dispatcher simplifies from 40 lines of inline tier dispatch to `callBackend(system, [{role:'user', content:prompt}], onToken, signal)`.
- `exactOptionalPropertyTypes: true` required changing cloud provider call sites to conditional spread (`signal !== undefined ? { signal } : {}`).

---

## ADR-022 — AI streaming in document editor via injected `setDocsStreamHook`

**Status:** Active
**Date:** 2026-05-16

### Decision

Document AI features (AI Edit modal, inline selection toolbar) stream AI output via a `StreamFn` callback injected from `main.ts` via `setDocsStreamHook()`. `documents.ts` never imports from `ai-v1.ts` or `ai-v2.ts` directly.

### Rationale

`documents.ts` cannot import from the AI modules without creating a circular dependency chain (`documents.ts` → `ai-v1.ts` → `db.ts` → `documents.ts` indirectly via state). The hook injection pattern (already established in ADR-018) avoids this: `main.ts` — which is the root of the import graph — owns all cross-cutting wiring.

The injected `StreamFn` signature is `{ system, prompt, onToken, signal } → Promise<string>`. It is tier-agnostic from `documents.ts`'s perspective. `main.ts` implements the tier dispatch internally (cloud → `callAnthropic`/`callOpenAI`/`callGoogle`; Ollama → direct SSE fetch; webllm → `callOllama`).

### Consequence

The injected `StreamFn` in `main.ts` now delegates entirely to `callBackend()` from `ai-runtime.ts`, which handles all tier dispatch internally. When a new AI tier is added, only `ai-runtime.ts`'s `callBackend` and `startAILoad` need updating. `documents.ts` and `main.ts`'s `setDocsStreamHook` call are unchanged.

---

## ADR-024 — Offline build uses OT-only browser built-in AI policy

**Status:** Active
**Date:** 2026-05-17 (updated 2026-05-18)

### Decision

The `apps/offline` build sets an `ot-only` deployment policy (`OT_ONLY_DEPLOYMENT_POLICY.ai.allowedTiers = ['browser']`). In this profile, only the **browser built-in AI tier** is allowed — Chrome 148+ exposes Gemini Nano, Edge 148+ exposes Phi-4-mini; both use the same `window.LanguageModel` API and the same `browser-nano.ts` provider. Cloud AI, WebGPU/transformers.js, Hugging Face model downloads, and in-app Ollama model pulls are disabled. The offline Vite config aliases the WebGPU/transformers.js provider and all three cloud provider modules to disabled stubs. `browser-nano.ts` is **not** aliased and remains active in the offline bundle.

The built-in AI modal (`openNanoDownloadModal`) handles the full setup flow: it auto-triggers when the user navigates to the AI view with AI enabled but not loaded. If the browser model still needs downloading, a one-time disclaimer is shown (`aiPrefs.nanoDisclaimerAcknowledged`); after acknowledgement the disclaimer never appears again, even after disable/re-enable cycles. Download progress is reported via the browser's `downloadprogress` event (real bytes-loaded / bytes-total) with an animated progress bar. When the model is already present, the modal is skipped and the workspace connecting spinner handles feedback.

### Rationale

OT/ICS environments are typically air-gapped or severely network-restricted. Browser built-in AI is the only tier that satisfies this constraint: the model is managed by the browser itself (same trust boundary as installing Chrome/Edge), works from `file://`, and after a one-time browser-managed download requires zero network access for inference. Cloud AI would require internet. Ollama requires a separate local service installation. Transformers.js WebGPU models require internet to download weights from Hugging Face CDN (app-initiated third-party download — unacceptable for air-gapped OT). Browser-managed model downloads are equivalent in trust to the browser binary itself.

Both Chrome and Edge require a flag to expose `window.LanguageModel` to web pages (including `file://` origins, which cannot participate in Origin Trials):

- Chrome: `chrome://flags/#prompt-api-for-gemini-nano` → Enabled → Relaunch
- Edge: equivalent flag at `edge://flags` → Enabled → Relaunch

The ~4 GB model files are stored outside the browser profile directory and survive cache/cookie clears. Resetting the browser profile or reinstalling the browser restores the flag to default (disabled) — users must re-enable it.

### CSP consequence

The offline CSP `connect-src` defaults to `http://localhost:11434 http://127.0.0.1:11434`. These entries are maintained for forward compatibility. The `OT_AI_CONNECT_SRC` env var adds additional origins to `connect-src` at build time but does **not** enable the Ollama tier (blocked by `allowedTiers`). It is provided for environments that may need specific origins in the CSP for other reasons:

```bash
OT_AI_CONNECT_SRC="http://localhost:11434 http://127.0.0.1:11434 https://ai-server.internal" pnpm run build:offline
```

---

## ADR-025 — Flat sidebar IA with footer-based Settings access

**Status:** Active
**Date:** 2026-05-17

### Decision

The sidebar navigation uses a flat `NAV_ENTRIES` array (discriminated union of `item | divider | label`) rather than grouped `NavSection[]` objects. Section headings (CRM, Content) are rendered as compact label entries between hairline dividers. Settings is not a sidebar nav item — it is accessed via a gear icon in the sidebar footer user row.

### Alternatives considered

- **Grouped sections with section headers** — the previous approach. Created a scrollbar in the sidebar when all items were listed under their groups, required hiding the scrollbar via CSS, and added visual bulk.
- **Collapsible sub-menus** — considered for grouping People/Departments and Library/Documents/Notes. Rejected because collapsible state adds persistent UI state and hides items behind a click; the flat structure is better for discoverability in a small-team tool.
- **Settings as a nav item** — kept Settings visible in main nav in previous iterations. Moved to footer because it is rarely visited and removing it from the list eliminates one entry that was pushing the sidebar toward needing a scrollbar.

### Rationale

Removing the scrollbar structurally (fewer items, flatter hierarchy) is better than hiding it with CSS, which masks a layout problem. The flat-with-dividers pattern matches modern sidebar conventions (Linear, Notion, Craft) and allows the sidebar to fit its full list in the viewport without scroll for any typical screen height ≥ 600px.

---

## ADR-026 — Recycle Bin as a Settings subsection; "Trash" terminology retired

**Status:** Active
**Date:** 2026-05-17

### Decision

The soft-delete destination is called **Recycle Bin** throughout the UI (previously "Trash"). The Recycle Bin is accessible as a section within Settings (`Settings → Recycle Bin`) rather than as a dedicated sidebar nav item. The `trash.ts` view still exists for direct navigation but is no longer linked from the sidebar.

### Alternatives considered

- **Keep "Trash" as a sidebar item** — occupied a nav slot for an infrequently used destructive operation; contributed to the sidebar scroll problem.
- **Remove trash entirely** — permanent delete on first action is too risky in a CRM; soft-delete with a recovery path is required.
- **Rename to "Archive"** — rejected; archive implies intentional long-term storage, whereas this is a recoverable delete buffer.

### Rationale

"Recycle Bin" is the platform-standard term on Windows (the primary target environment) and is unambiguous about the intent (deleted, recoverable, not permanent). Nesting it inside Settings reduces sidebar clutter while keeping the feature accessible. Users who need it visit Settings → Recycle Bin; the path is discoverable without occupying prime nav real estate.

---

## ADR-028 — AI Write inserts at cursor position rather than replacing the document

**Status:** Active
**Date:** 2026-05-19

### Decision

The AI Edit "Write" action inserts generated content **at the cursor position** (after the nearest block-level ancestor — `<p>`, `<h1>`–`<h3>`, `<li>`, `<blockquote>`, `<pre>`, `<div>`) rather than clearing the editor and replacing all content. The cursor range is captured in `_aiInsertRange` immediately before `_reRenderDocModal()` is called (which would otherwise destroy the selection). During streaming a `contenteditable="false"` `<div>` with a blue left-border accent is inserted at that position, streaming tokens are rendered into it, and on completion it is replaced with a clean `DocumentFragment` via `_safeHtmlFragment()`. Falls back to `editor.appendChild` when no cursor range is available.

### Alternatives considered

- **Replace entire document** — original behaviour; destructive and unexpected when the user has existing content they want to keep.
- **Append to end always** — simpler fallback, used when no cursor position is recorded, but not the primary behaviour.
- **Insert at exact text cursor offset** — possible via `range.insertNode()` directly, but would split paragraphs mid-sentence. Walking up to the nearest block ancestor produces cleaner insertion points.

### Rationale

Users position their cursor to indicate intent. Replacing the whole document when they are trying to add a section is surprising and destructive. Version history captures a pre-write snapshot regardless, so Replace-all is recoverable — but avoiding the replacement in the first place is simpler UX. The block-level ancestor walk (`P`, `H1`–`H3`, `LI`, etc.) avoids orphaned inline nodes by always inserting after complete structural units.

### DOM / Trusted Types constraint

The streaming container's `innerHTML` setter is covered by the `patchInnerHTML` IIFE (routes through `_rawPolicy`). `streamDiv.replaceWith(frag)` uses a `DocumentFragment` produced by `_safeHtmlFragment()`, which goes through `tempDiv.innerHTML` (also patched) — the unpatched `Range.createContextualFragment` sink is not used anywhere in this path.

---

## ADR-027 — Constrained Markdown renderer for AI document content; retire HTML-direct model output

**Status:** Active
**Date:** 2026-05-19

### Decision

AI models that write or edit document content are instructed to return **Markdown only** (no HTML tags). A line-by-line constrained renderer (`_mdToHtml` in `documents.ts`) converts the Markdown to HTML before DOMPurify sanitisation. The renderer HTML-escapes all text content _before_ wrapping it in structural tags, so model output can never inject markup even if the model ignores the Markdown instruction. `Range.createContextualFragment` is replaced with a `tempDiv.innerHTML` approach to keep all DOM-string insertion inside the patched `innerHTML` sink (Trusted Types compliance).

### Alternatives considered

- **HTML-direct output + DOMPurify only** — single gate; relies on DOMPurify catching every edge case against the full HTML/CSS/SVG attack surface.
- **Structured JSON schema output** — strongest isolation but Nano/small models produce unreliable JSON; adds parsing complexity.
- **Markdown + third-party renderer (marked, markdown-it)** — adds bundle weight and a dependency surface; the constrained subset needed here (headings, lists, tables, code, inline styles) is straightforward to implement inline.

### Rationale

Industry standard (ChatGPT, Notion AI, GitHub Copilot, Gemini) is Markdown-in → renderer → sanitize. The renderer grammar is a second gate that collapses the attack surface before DOMPurify runs. A model that ignores "Markdown only" and emits `<script>` gets it HTML-escaped by the renderer into visible text — DOMPurify never even sees it as a tag. Belt-and-braces matches the threat model of an offline app where vault data could contain adversarially crafted AI output from a compromised or jailbroken model.

---

## ADR-029 — Three discrete offline build sub-profiles instead of a single offline profile with runtime flags

**Status:** Accepted (pending implementation)
**Date:** 2026-05-19

### Decision

The offline build target is split into **three separate, build-time-distinct artifacts** rather than one build with runtime feature flags:

| Profile               | Bundle contents                             | Use case                                      |
| --------------------- | ------------------------------------------- | --------------------------------------------- |
| `offline-no-ai`       | No AI code                                  | Air-gapped OT/ICS — zero AI surface           |
| `offline-browser-ai`  | Browser Prompt API only                     | Workstations with Chrome/Edge flags enabled   |
| `offline-internal-ai` | Browser Prompt API + LAN endpoint allowlist | Sites with a private Ollama-compatible server |

Each profile has its own `vite.config.ts` variant and its own CSP.

### Alternatives considered

- **One build, runtime flags** — current state; a single `offline` artifact whose AI tier is selected by `aiPrefs`. The problem: dead code for disabled tiers is still present in the bundle, and the CSP must permit all possible `connect-src` destinations regardless of runtime selection.
- **Two profiles (no-ai vs browser-ai)** — considered; rejected because `internal-ai` (LAN AI endpoint, different `connect-src`) cannot share a CSP with `browser-ai` (no network required).

### Rationale

OT/ICS deployments require strict network isolation. A single CSP that mentions `http://internal-ai-server` leaks internal topology even if the endpoint is never reached at runtime. Separate artifacts guarantee that a `no-ai` build's CSP contains no network origins whatsoever, and a `browser-ai` build's CSP contains only `'self'`. Each build is independently auditable. Three build-time artifacts is the pattern used by Chromium (stable/beta/dev), Firefox (release/ESR/nightly), and every security-conscious embedded product.

### Consequence

- Three new Vite configs: `apps/offline-no-ai/vite.config.ts`, `apps/offline-browser-ai/vite.config.ts`, `apps/offline-internal-ai/vite.config.ts` — or sub-config variants inside `apps/offline/`.
- `pnpm run build:offline` produces three artifacts: `dist/offline-no-ai/`, `dist/offline-browser-ai/`, `dist/offline-internal-ai/`.
- `generate-csp.mjs` runs on each artifact separately.
- The current single-profile build is the migration source; it becomes the `offline-browser-ai` profile.

---

## ADR-030 — OIDC with PKCE is the mandatory authentication protocol for enterprise and sync builds

**Status:** Accepted (pending implementation)
**Date:** 2026-05-19

### Decision

Enterprise and sync builds (anything with a server-side sync layer) must use **OpenID Connect (OIDC) with the Authorization Code flow + PKCE** (RFC 7636). The implicit flow and the hybrid flow are both prohibited. Refresh token rotation must be one-time-use with server-side revocation. DPoP (RFC 9449) is the high-assurance option for token binding.

### Alternatives considered

- **Implicit flow** — prohibited by RFC 9700 (OAuth 2.0 Security BCP, 2023). Tokens appear in URLs (browser history, referrer headers); no mechanism for sender-constraint. Cannot be used.
- **Client credentials** — server-to-server only; not appropriate for user-facing flows.
- **Basic auth over HTTPS** — no federation, no SSO, no MFA delegation; ruled out for enterprise.
- **SAML 2.0** — remains the incumbent in some enterprise IdPs but is XML-heavy, has no standardised browser flow, and is not suited for SPA/offline-first architectures. OIDC supersedes it for new development per every major IdP's published migration guidance.

### Rationale

RFC 9700 ("OAuth 2.0 Security Best Current Practice", December 2023) explicitly prohibits the implicit flow and requires PKCE for all public clients. Enterprise procurement now routinely asks for RFC 9700 compliance. PKCE prevents authorization code interception attacks (relevant even in redirect-based SPA flows). DPoP (RFC 9449) provides proof-of-possession token binding, preventing token replay from a stolen bearer token — a meaningful upgrade for high-assurance deployments.

### Consequence

- `packages/adapter-enterprise/` must implement an OIDC client (PKCE code verifier generation, `state` anti-CSRF, `nonce` for ID token binding, refresh token rotation).
- Token storage: access tokens in memory only; refresh tokens in IDB (short-TTL, one-time-use).
- Session key derivation from OIDC ID token claims for server-authoritative encryption is the preferred pattern — the offline AES-GCM vault key must not be re-used as the enterprise record encryption key.

---

## ADR-031 — Policy-as-code authorization (OPA or AWS Cedar) instead of hardcoded RBAC

**Status:** Accepted (pending implementation)
**Date:** 2026-05-19

### Decision

Enterprise builds implement authorization via a **centralized Policy Decision Point (PDP)** — either Open Policy Agent (OPA, Rego-based) or AWS Cedar (formally verified, strongly typed). Authorization is evaluated against a deny-by-default policy bundle. Route handlers, API endpoints, and UI actions act as Policy Enforcement Points (PEPs) — they call the PDP and enforce the decision; they do not contain authorization logic themselves.

### Alternatives considered

- **Hardcoded RBAC** — current approach in the offline app (no server, single user, so RBAC is moot). Fails at enterprise scale: role proliferation, no ABAC conditions, no audit trail of policy changes, no runtime policy update without a build.
- **Simple middleware RBAC** — `if (user.role === 'admin')` checks in route handlers. Unsustainable at scale; authorization logic scattered across hundreds of endpoints; no way to audit or test policy uniformly.
- **Casbin** — a capable RBAC/ABAC library but lacks OPA's declarative policy language (Rego), the policy-as-code ecosystem, and the formal verification guarantees of Cedar.

### Rationale

OPA is CNCF-graduated and used at scale by Styra, Netflix, Pinterest, and major cloud providers. Cedar is formally verified (the policy language has a machine-checked correctness proof) and is the basis of Amazon Verified Permissions. Both support: deny-by-default, fine-grained ABAC conditions (resource owner, tenant, data classification), policy-as-code version control, offline policy evaluation (no PDP round-trip for embedded use), BOLA/IDOR prevention via resource-level policies. A BOLA/IDOR test suite (automated ownership checks across all record types) is a required acceptance criterion alongside the PDP implementation.

### Consequence

- `server/src/authz/` directory with policy bundle (Rego or Cedar files), PDP client, and middleware PEP.
- Policy bundle is version-controlled, tested with OPA's conftest or Cedar's CLI, and deployed as a sidecar or embedded library.
- UI enforces PDP decisions client-side for UX only — server enforcement is authoritative.
- Every enterprise API endpoint must document its required policy conditions in code comments or OpenAPI extensions.

---

## ADR-032 — GDPR crypto-shredding via per-user DEK/KEK key hierarchy for enterprise builds

**Status:** Accepted (pending implementation)
**Date:** 2026-05-19

### Decision

Enterprise builds implement a **three-level key hierarchy** to support Article 17 GDPR erasure through crypto-shredding:

```
Tenant KMS-managed KEK  (Key Encryption Key — per tenant, rotated annually)
        ↓ wraps
User DEK                (Data Encryption Key — per user account, stored encrypted by KEK)
        ↓ encrypts
User's CRM records      (all data at rest for that user)
```

When a user account is deleted, the user DEK is immediately destroyed in the KMS. All encrypted record blobs — including copies in offsite backups — become permanently unreadable. This constitutes Article 17 erasure. EU DPAs accept AES-256-GCM crypto-shredding as compliant erasure when the key destruction is immediate and irreversible (documented in EDPB guidance and confirmed in multiple DPA decisions, 2024–2025).

### Alternatives considered

- **Hard-delete from primary database** — satisfies erasure for live data but fails for encrypted backup blobs. The EDPB's 2026 enforcement priority is backup deletion compliance; 764 controllers were audited in 2025; backup non-deletion was the most common gap. Hard-delete alone is insufficient.
- **Encryption at rest with shared key** — current offline architecture (one key per vault). Adequate for single-user offline; not suitable for multi-tenant enterprise because deleting one user's key would require re-encrypting all other users' data.
- **No encryption / plaintext multi-tenant** — incompatible with GDPR, SOC 2, and enterprise requirements.

### Rationale

The offline vault architecture (one password → one AES-256-GCM key → one vault blob) cannot be extended to multi-tenant enterprise. Each user must have an independent key so their destruction does not affect other users. KMS-managed KEKs (AWS KMS, Azure Key Vault, GCP CKMS, HashiCorp Vault) provide the irreversible destruction guarantee, hardware isolation, and audit trail (CloudTrail / Azure Monitor) required for SOC 2 and GDPR compliance evidence.

### Consequence

- `packages/adapter-kms/` or `server/src/kms/` manages DEK lifecycle: create on account creation, wrap/unwrap via KMS, schedule destruction on deletion with configurable soft-delete-to-destroy delay (default 30 days for legal hold, then immediate destruction).
- Backup pipeline must handle encrypted blobs as opaque objects — no plaintext backup. Backup integrity is verified by attempting DEK retrieval (key exists → blob is recoverable).
- Legal hold pauses DEK destruction for the hold duration. A `legalHoldUntil` field in the KMS record controls this.
- `packages/core/src/` offline architecture is unchanged — per-user DEK is an enterprise-only concern.

---

## ADR-033 — OpenTelemetry as the mandatory observability standard for enterprise server builds

**Status:** Accepted (pending implementation)
**Date:** 2026-05-19

### Decision

All enterprise server-side components are instrumented with **OpenTelemetry** (CNCF-graduated, 2023) from day one — before any production traffic. The three signals (traces, metrics, logs) are exported to a compatible backend (Jaeger, Tempo, Prometheus/Cortex, Loki, or a commercial OTEL-compatible platform). SLOs are defined and SLO-based alerting (RED model: Rate, Errors, Duration) replaces ad-hoc threshold alerts.

### Alternatives considered

- **Custom structured logging only** — captures events but not distributed traces or service-level metrics. Cannot produce SOC 2 Availability evidence (uptime SLO, incident response time distribution).
- **Proprietary APM agents (Datadog, New Relic, Dynatrace)** — lock-in; cannot switch backends without re-instrumenting. OTEL instrumentation is vendor-neutral.
- **No instrumentation initially, add later** — deferred observability is the single most common cause of extended incident response time in production systems. Adding it retroactively requires touching every code path.
- **OpenCensus** — OTEL's predecessor; EOL since 2023; not an option for new development.

### Rationale

OpenTelemetry is the CNCF standard for observability; its 2023 graduation signals API stability. Enterprise procurement increasingly asks for OTel-compatible telemetry as a requirement alongside SOC 2. An application with no traces cannot diagnose latency regressions across async boundaries. An application with no structured metrics cannot produce uptime SLO evidence for SOC 2 Availability. An application with unstructured logs cannot correlate security events across services for SOC 2 Security. The cost of adding OTel from the start (one SDK, semantic conventions, a few decorators/middleware wraps) is far lower than retrofitting it.

### Consequence

- `server/src/observability/` owns OTel SDK initialization: resource attributes (service name, version, environment, tenant), exporter configuration (OTLP gRPC/HTTP), sampler selection (head-based, 10–100% configurable).
- All HTTP handlers are wrapped with the `@opentelemetry/instrumentation-http` auto-instrumentation.
- Structured log fields: `trace_id`, `span_id`, `service`, `tenant_id`, `user_id` (hashed), `error.type`, `error.message`.
- SLOs defined before production launch: API p99 latency < 500ms, error rate < 0.1%, availability > 99.9%.
- SLO burn rate alerts replace static threshold alerts.

---

## ADR-034 — SLSA Level 2 minimum for all releases; Level 3 for enterprise; Sigstore/Cosign for artifact signing

**Status:** Accepted (pending implementation)
**Date:** 2026-05-19

### Decision

All release artifacts target **SLSA (Supply-chain Levels for Software Artifacts) Level 2** as a minimum. Enterprise distribution targets **SLSA Level 3** (hermetic builds + OIDC-signed provenance). Artifact signing uses **Sigstore/Cosign** with keyless signing (OIDC identity from CI provider) — no long-lived signing keys. Every signing event is recorded in the Rekor public transparency log.

### Alternatives considered

- **No supply chain controls** — acceptable for a single-developer personal tool; insufficient for enterprise distribution or open-source where a maintainer account compromise could push a malicious release.
- **GPG-signed releases** — the traditional approach; requires managing long-lived private keys (rotation, revocation, backup). Key compromise is an existential risk to artifact integrity. Sigstore eliminates long-lived keys entirely.
- **SLSA Level 1 only** — requires only that the build is scripted. Provides no tamper-evidence. Insufficient for enterprise.
- **SLSA Level 4** — requires two-party review for every build; disproportionate for the current team size.

### Rationale

Software supply chain attacks (SolarWinds, XZ Utils, PyPI/npm package hijacking) are now the top-tier risk vector for software distributed to enterprises. SLSA provides a graduated framework; Level 2 (version-controlled build, machine-generated signed provenance) is achievable with `slsa-github-generator` in GitHub Actions without significant overhead. Level 3 (hermetic builds, non-falsifiable provenance tied to OIDC CI identity) closes the build-time tampering window. Sigstore's keyless model means a compromised developer laptop cannot sign a release — only a legitimate CI run holding a valid OIDC token from the CI provider can.

### Consequence

- `slsa-github-generator` GitHub Actions workflow added for every release build.
- `cosign sign` called on every build artifact (HTML file, APK, IPA, Docker image) with `--key env://COSIGN_KEY` for Level 2 or keyless (`--identity-token`) for Level 3.
- Verification command published in SECURITY.md for consumers: `cosign verify --certificate-identity <workflow-url> --certificate-oidc-issuer <issuer> dist/offline/index.html`.
- `dist/offline/index.sha256` upgraded to a SLSA provenance bundle (`index.html.intoto.jsonl`) for Level 3 builds.
- Dependency review (`actions/dependency-review-action`) runs on every PR; rejects new high-CVE dependencies.

---

## ADR-035 — Mobile scaffold as pure TypeScript abstract classes; Capacitor installation deferred

**Status:** Accepted (scaffold complete; implementation pending)
**Date:** 2026-05-20

### Decision

`packages/adapter-mobile-native/` defines **abstract TypeScript classes** (`MobileVaultAdapter`, `BiometricUnlockAdapter`, `MobileBackupAdapter`) rather than installing Capacitor or creating iOS/Android platform projects. Capacitor installation is deferred until the concrete implementations are written.

### Alternatives considered

- **Install Capacitor immediately** — creates platform project boilerplate now; requires macOS for iOS. Adds platform directories with hundreds of generated files before any logic exists.
- **Use interfaces instead of abstract classes** — interfaces produce no runtime code but give no opportunity to add shared validation logic (e.g. ensuring `writeVault` always receives ciphertext with a minimum length before delegating to platform code).
- **Single `MobileAdapter` class** — merging vault, biometric, and backup into one class creates an overly large API surface and prevents test isolation.

### Rationale

Abstract classes let concrete Capacitor implementations override only what differs per platform while inheriting any future shared guards. The scaffold documents the full MASVS 2.0 acceptance criteria and the platform config files (`Info.plist`, NSC XML, `PrivacyInfo.xcprivacy`, `capacitor.config.ts`) without requiring macOS or Android SDK tooling during the definition phase. iOS/Android platform directories added to `apps/mobile/` can be gitignored or committed once `cap add ios/android` runs.

### Consequence

- `packages/adapter-mobile-native/src/` contains four modules: `mobile-vault-adapter.ts`, `biometric-unlock-adapter.ts`, `mobile-backup-adapter.ts`, `network-policy.ts`.
- `apps/mobile/src/entry.ts` is a fully documented stub; it re-exports nothing until all prerequisites exist.
- Platform config files (`Info.plist`, NSC XML, `PrivacyInfo.xcprivacy`) are committed as stubs with inline comments; they become live config once `cap add` generates the surrounding platform projects.
- `pnpm add @capacitor/core @capacitor/filesystem @capacitor/biometrics` is withheld until the concrete adapter implementations are ready for device testing.

---

## ADR-036 — Enterprise server scaffold in `server/` separate from pnpm workspace packages

**Status:** Accepted (scaffold complete; implementation pending)
**Date:** 2026-05-20

### Decision

The enterprise server lives in `server/` at the repo root — a distinct directory with its own `package.json` (`@tktaskapp/server`) — rather than inside `packages/` or `apps/`. The root `tsconfig.json` includes `server/src/**/*.ts` so the interface stubs are type-checked, but `server/` is not yet added as a pnpm workspace.

### Alternatives considered

- **`packages/server/`** — semantically wrong; `packages/` contains shared library code consumed by apps. The server is not a library package.
- **`apps/server/`** — `apps/` contains deployable frontend targets (Vite builds). A Node.js server is not a Vite app.
- **Monorepo workspace package immediately** — adds the server to pnpm install graph before any real dependencies exist; premature. Add to `pnpm-workspace.yaml` when the server gains real `node_modules` dependencies (Phase 11 adds drizzle-orm and drizzle-kit).

### Rationale

`server/` follows the convention used by T3 Stack, RedwoodJS, and other full-stack monorepos where the backend is a peer of the apps/ directory. Keeping it out of the pnpm workspace until Phase 11 avoids a noisy `pnpm install` that does nothing useful. Interface stubs compile cleanly as part of the root typecheck — no separate tsconfig or build step needed for the scaffold phase.

### Consequence

- `server/src/auth/oidc.ts`, `server/src/authorization/policy-engine.ts`, `server/src/kms/key-service.ts`, `server/src/observability/otel.ts`, `server/src/ai-gateway/policy-engine.ts` exist as typed interface stubs with TODO implementation comments referencing their respective Section 11 design notes.
- `server/src/api/routes/`, `server/src/db/schema/`, `server/src/db/migrations/` exist as `.gitkeep` placeholders.
- `server/package.json` has `name: @tktaskapp/server, private: true`; no dependencies yet.
- `pnpm-workspace.yaml` gains `- 'server'` when drizzle-orm is added in Phase 11.
- `apps/enterprise-web/src/entry.ts` is a documented stub listing all prerequisites for production readiness.

---

## ADR-037 — `document.execCommand` retained for contenteditable formatting despite deprecation

**Status:** Active  
**Date:** 2026-05-20

### Decision

`document.execCommand` is retained in `views/documents.ts` for rich-text formatting commands (bold, italic, underline, lists, etc.). The ESLint rule `@typescript-eslint/no-deprecated` is downgraded to `warn` for that file via a narrow override.

### Why not replace it

The Selection and Range APIs do not provide equivalent synchronous formatting APIs. Replacing `execCommand` for each formatting command (bold, italic, underline, ordered/unordered lists, strikethrough, etc.) requires per-command implementations that are non-trivial, browser-quirk-prone, and out of scope for a toolchain upgrade session. `createLink` is already implemented using the modern Selection/Range API; the remaining formatting commands are the gap.

### Why keep the warning

The `warn` level (not `off`) ensures the deprecation remains visible in lint output so future refactors can pick it up. No browser has announced a concrete timeline for removing the formatting-command variants of `execCommand` used here.

### Alternative considered

Inline `eslint-disable` comment at the call site — rejected per project constraint of no per-line suppressions.

### Consequence

- `packages/core/src/views/documents.ts` has `@typescript-eslint/no-deprecated: 'warn'` via `eslint.config.mjs` narrow override.
- `execCommand` usage appears in the warning list but not the error list.
- The `createLink` command already uses the modern API; remaining formatting commands are tracked for a future editor refactor.

---

## ADR-038 — Three delivery types: offline-web, enterprise-web PWA, dataverse

**Status:** Active
**Date:** 2026-05-24

### Decision

Consolidate five build targets (offline-web, pwa-sync, mobile-web, enterprise-web, dataverse) into three delivery types:

1. **offline-web** — single self-contained HTML artifact, no server, `file://`
2. **enterprise-web** — HTTPS-hosted PWA; browser desktop, mobile browser (installable), Capacitor WebView
3. **dataverse** — Power Platform Code App

`apps/pwa-sync/` is deleted. `apps/mobile/` becomes Capacitor native-packaging only, with `webDir` pointing at `dist/enterprise`. `build:mobile` is an alias for `build:enterprise`.

### Alternatives considered

- **Keep five targets**: pwa-sync and enterprise-web were architecturally identical (same AuthClient, same RxDBAdapter, same ENTERPRISE_DEPLOYMENT_POLICY). Maintaining two entries for the same app added confusion with no runtime differentiation.
- **Merge mobile into enterprise-web completely**: mobile's native Capacitor scaffolding (iOS/Android configs, MASVS test plan) is valuable and should remain. The directory stays; only the web build files move.
- **Keep a separate mobile PWA build**: PWA capabilities (service worker, manifest, touch gestures) belong in enterprise-web. All platforms install the same app from the same URL. Separate mobile builds are not the 2026 industry standard for responsive SPAs.

### Rationale

Industry standard as of 2026: one responsive HTTPS PWA installable on desktop and mobile, with a service worker for offline shell caching. There is no case for a separate mobile-web target that is identical to the enterprise-web target except for the absence of a health check. The portable offline artifact remains as offline-web because `file://` and HTTPS have fundamentally different security and deployment models.

Dataverse remains separate because Power Platform Code Apps have strict hosting requirements: flat asset naming (no content hash), `__msalToken` token injection by the platform runtime, and a fundamentally different auth and data model. A unified build is not practical.

### Consequence

- `pnpm run build:enterprise` builds `dist/enterprise/` (hashed assets, PWA, not single-file).
- `pnpm run build:mobile` is `build:enterprise`; `npx cap sync` then copies it to the native platform.
- The Hono server optionally serves `dist/enterprise/` as static assets via `ENTERPRISE_STATIC_DIR`.
- CSP is enforced via HTTP response headers for enterprise-web, not a meta tag.
- `apps/enterprise-web/` is the only target for any browser-based server-connected deployment.
