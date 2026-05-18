# Architecture Decision Records

**Task App CRM** — `taskapp.html`  
**Last reviewed:** 2026-05-15  

This document records every significant architectural and technical decision made for the application — what was chosen, what alternatives were considered, and why. Each decision entry answers the question: *"Why does the code look like this?"*

---

## ADR-001 — Single HTML file, no build step, no framework

**Status:** Active  
**Date:** Project origin

### Decision
The entire application — CSS, HTML, and all JavaScript — lives in one `.html` file. There is no npm, no bundler, no transpiler, and no framework.

### Alternatives considered
- Vite + React or Vue with a build step
- Multi-file vanilla JS with a local dev server
- Electron or Tauri for a native desktop wrapper

### Rationale
The primary constraint is **no install required on any device**. A user must be able to open the file in a browser and have it work — on Windows, macOS, iOS, and Android. A build step produces a dist folder, which requires either a file server or bundling everything back into one file anyway. A native wrapper requires an installer. The single-file approach is the only one that satisfies the constraint without any ceremony. The tradeoff — no module system, larger file, harder to lint — is accepted.

### Consequence
Every edit requires running `node generate-csp.mjs` to regenerate CSP hashes. No hot reload. All JS is global scope within each `<script>` block.

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
- **Ollama CORS** — Ollama requires `OLLAMA_ORIGINS=*` (or `null`) when called from `file://`. Documented in the UI and wizard.

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
