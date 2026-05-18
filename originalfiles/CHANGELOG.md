# Changelog

All notable changes to Task App CRM are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.
Versions are dated; there is no semantic version number because this is a single-file app with no public API.

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

*Run `node generate-csp.mjs` after every edit to regenerate CSP hashes and `taskapp.sha256`.*
