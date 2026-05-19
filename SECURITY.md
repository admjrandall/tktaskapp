# Security Policy

**Task App CRM** — monorepo, built to `dist/offline/index.html`
**Last reviewed:** 2026-05-18
All information in this document is derived from direct inspection of the current codebase.

---

## Threat model

This is a **local, offline-first, single-user application** opened directly from the filesystem via `file://`. It is not a web service and has no server. The threat model is therefore narrower than a typical web app — but not trivial.

**In scope:**
- Physical access to the device while the app is closed (data at rest must be unreadable without the password)
- An attacker who gains read access to the browser profile directory (IndexedDB files, localStorage)
- A tampered copy of the built `dist/offline/index.html` substituted for the real one (supply-chain / file tampering)
- Stored XSS via data entered into the CRM that is later rendered
- Cloud API key exposure (Anthropic, OpenAI, Google keys stored locally)
- Brute-force attacks on the vault password

**Out of scope (accepted):**
- An attacker with active code execution on the device — at that point the OS is compromised and no browser app can protect the data
- Network interception — the app makes no requests for data; AI cloud calls are to provider APIs over HTTPS only
- Browser vulnerabilities — we trust the browser's WebCrypto implementation
- Physical access while the app is **open and unlocked** — the session key is in memory; this is a device-lock problem

---

## Data at rest

### Encryption algorithm
**AES-256-GCM** with a fresh 12-byte random IV per encryption call. Implemented via the browser's native `crypto.subtle` API (WebCrypto). The plaintext is always JSON-serialised before encryption.

### Key derivation
**PBKDF2-HMAC-SHA-256** at **600,000 iterations** — the OWASP 2026 recommendation. A 32-byte cryptographically random salt is generated on first run and stored in IndexedDB. The derived key is `extractable: false` — its raw bytes never leave the WebCrypto subsystem and cannot be read by JavaScript.

### Session key caching
After successful unlock, the non-extractable `CryptoKey` object is stored directly in IndexedDB (`nexus_keys_v1`). This survives page refresh (F5) without requiring the password again, but clears when the browser tab is closed. The key object itself is opaque to JavaScript — only the browser engine can use it.

### Legacy migration
Vaults created before the 2026-05-15 hardening pass used 310,000 PBKDF2 iterations. On unlock, `initCrypto()` detects the legacy iteration count and silently re-derives at 600,000, re-encrypts the vault, and marks the upgrade complete. The user sees no interruption.

### What is encrypted

| Data | Backend | Encryption |
|------|---------|------------|
| All CRM records (clients, projects, tasks, etc.) | IndexedDB `nexus_vault_v2` | Single AES-GCM blob keyed by vault password |
| Documents | IndexedDB `nexus_data_v1` | Each record individually AES-GCM encrypted |
| Conversations | IndexedDB `nexus_data_v1` | Each record individually AES-GCM encrypted |
| Cloud API keys (Anthropic, OpenAI, Google) | IndexedDB `nexus_data_v1` record `__ai_secrets__` | AES-GCM encrypted |
| Audit log | IndexedDB `nexus_data_v1` record `__audit_log__` | AES-GCM encrypted |
| TOTP config (secret, enabled, timestamps) | IndexedDB `nexus_data_v1` record `__mfa_totp__` | AES-GCM encrypted |
| Passkey credentials (PRF-wrapped master password) | IndexedDB `nexus_data_v1` record `__mfa_passkeys__` | AES-GCM encrypted (inner password also AES-GCM under PRF key) |
| Salt, verify token, KDF version | IndexedDB `nexus_vault_v2` | Salt is plaintext (it must be); verify token and vault are AES-GCM encrypted |

### What is NOT encrypted

| Data | Backend | Reason |
|------|---------|--------|
| Theme preference | `localStorage` `taskapp_theme` | Non-sensitive |
| Dashboard layout | `localStorage` `taskapp_dash_v1` | Non-sensitive |
| AI preferences (tier, model selection, usage stats) | `localStorage` `taskapp_ai_prefs_v2` | Non-sensitive; no keys stored here |
| Disk vault file (`nexus-data.vault`) | Filesystem | Contains the same encrypted vault blob as IDB — the encryption is the protection, not the storage |

---

## Content Security Policy

The CSP meta tag in the built `dist/offline/index.html` enforces the following:

- **`default-src 'none'`** — no resources load by default
- **`script-src`** — SHA-256 hash of the single inlined script block. No `'wasm-unsafe-eval'` in the offline build — transformers.js WebLLM is disabled (aliased to a stub) and the ONNX runtime is not bundled. (`'wasm-unsafe-eval'` may be present in sync/enterprise build profiles that include WebGPU model support.)
- **`style-src 'unsafe-inline'`** — allows inline `style=` attributes throughout the app. Style block hashes are not used because when `style-src` contains any hash values, browsers ignore `unsafe-inline` entirely per spec — which would block the 177+ inline `style=` attributes in render functions. Script hashes are the security-critical protection; style hashing is not required for this threat model.
- **`img-src 'self' data: blob:`** — permits inline data URIs (file attachments stored as base64) and blob URLs
- **Offline `connect-src 'self' http://localhost:11434 http://127.0.0.1:11434` by default** — the offline profile uses browser built-in AI (Gemini Nano on Chrome, Phi-4-mini on Edge), which runs entirely on-device and makes no network requests during inference. The localhost entries are maintained for forward compatibility. `OT_AI_CONNECT_SRC` at build time adds extra origins to this directive (CSP header only — does not enable the Ollama tier).
- **Sync/enterprise `connect-src`** — may allow supported cloud AI APIs, Hugging Face model weights, and default Ollama localhost endpoints depending on the build profile.
- **`worker-src blob:`** — required for transformers.js WebLLM Web Worker
- **`object-src 'none'`** — blocks all plugin content
- **`base-uri 'none'`** — prevents base tag injection
- **`frame-ancestors 'none'`** — not in the CSP meta tag (browsers ignore `frame-ancestors` in `<meta>` elements per spec — it only works in HTTP response headers). If the app is ever served via HTTPS, add `frame-ancestors 'none'` as a server-side response header.
- **`trusted-types nexus-crm nexus-crm-raw`** — only these two policy names may be created
- **`require-trusted-types-for 'script'`** — any raw string assigned to `innerHTML` or another DOM sink throws a `TypeError`; all assignments must go through a registered policy

**CSP hashes are regenerated automatically** by `generate-csp.mjs`, which runs as part of every `pnpm run build:offline` command. Never edit the hash manually.

---

## Trusted Types

Two Trusted Types policies are registered once in `packages/core/src/trusted-types.ts`, which must be the **first import** in `main.ts`:

- **`nexus-crm`** (`_ttPolicy`) — sanitises user-visible strings (HTML-escapes `&`, `<`, `>`, `"`, `'`) before `innerHTML`
- **`nexus-crm-raw`** (`_rawPolicy`) — passes already-safe template HTML through unchanged; used by the `patchInnerHTML` override and the toast `insertAdjacentHTML` path

`Element.prototype.innerHTML` is monkey-patched to automatically route all string assignments through `_rawPolicy`. This means template-string render functions work without a line-by-line rewrite while still satisfying Trusted Types enforcement.

**The rule:** Never call `trustedTypes.createPolicy('nexus-crm-raw', ...)` again. Per the Trusted Types spec, creating a policy with an already-registered name throws a `TypeError` unless the CSP includes `'allow-duplicates'` — which it does not.

---

## XSS mitigations

- `escH()` is applied to all user-supplied strings before they are interpolated into HTML template strings
- The Trusted Types `patchInnerHTML` override provides a second layer — any unescaped string assignment not going through a policy throws at runtime
- No `eval()` or `new Function()` anywhere in the file
- Cloud AI responses are treated as untrusted text — they are escaped before rendering in the chat UI (`escH(text)` in `streamToBubble()`)

---

## File integrity

`generate-csp.mjs` (run automatically by every `pnpm run build:*` command) computes a SHA-256 hash of the built `dist/offline/index.html` and saves it to `dist/offline/index.sha256`. On every page load, `checkFileIntegrity()` in `main.ts` fetches both, re-hashes the HTML, and compares. A mismatch triggers a persistent red warning banner.

**Limitation:** `fetch()` from `file://` is blocked by Chrome and Edge via CORS policy. The check detects `location.protocol === 'file:'` at startup and exits cleanly with a console message. The app works normally. The check runs when the file is served via HTTP or HTTPS.

**What this detects:** Modification of the built file between the last build run and the current page load. It does not detect modifications to `index.sha256` itself — if both files are replaced, the check passes. Treat `index.sha256` as a secondary signal, not a cryptographic proof.

---

## Network connections

The app makes no network requests during normal offline operation. Network is used only for:

| Destination | When | What is sent |
|-------------|------|-------------|
| No network request | Offline AI — browser built-in tier | Gemini Nano (Chrome) / Phi-4-mini (Edge) runs on-device; no data leaves the device |
| `https://api.anthropic.com/v1/messages` | Enterprise/cloud AI — Anthropic tier | System prompt, chat history, user message |
| `https://api.openai.com/v1/chat/completions` | Enterprise/cloud AI — OpenAI tier | System prompt, chat history, user message |
| `https://generativelanguage.googleapis.com/...` | Enterprise/cloud AI — Google tier | System prompt, chat history, user message |
| `dist/offline/index.sha256` (same origin/folder) | On every page load | Nothing — fetch only |

**No telemetry. No analytics. No tracking of any kind.**

The offline profile allows only browser built-in AI (Gemini Nano on Chrome, Phi-4-mini on Edge) — cloud AI and WebGPU/transformers.js model downloads are disabled. Enterprise/cloud AI calls (sync/enterprise builds only) include a compact summary of current CRM record counts and a few field values as context (built by `buildDataSummary()`). Users should be aware that when using cloud AI tiers, this CRM summary is transmitted to the selected provider. Local/internal Ollama-compatible tiers (sync/enterprise builds) send data only to the configured endpoint.

---

## Auth, MFA, and brute-force protection

- Password is never stored. The PBKDF2-derived key is tested against an encrypted verify token (`'NEXUS_CRM_OK'`); if decryption fails, the password is wrong.
- Failed attempts trigger an exponential lockout: attempt 1 = 500ms delay, attempt 2 = 1s, attempt 3 = 2s ... capped at 30 seconds per attempt.
- Lockout state (`nexus_auth_fail_count`, `nexus_auth_locked_until`) is stored in `localStorage` so it persists across tab closes (NIST AC-7 compliance). This is a UI-level protection, not a cryptographic one. An attacker with access to the raw IDB files can attempt offline dictionary attacks at the speed of their hardware against a PBKDF2-600k key. Password strength is the primary defence.

### TOTP MFA (all builds — NIST AAL2)
- Pure WebCrypto TOTP: RFC 6238 / RFC 4226, HMAC-SHA1, 6-digit codes, 30-second window, ±1 step drift tolerance.
- Secret generated via `crypto.getRandomValues(20 bytes)`, Base32-encoded, stored encrypted in `nexus_data_v1`.
- Setup wizard shows QR code (Microsoft Authenticator, Google Authenticator, Authy, 1Password compatible) and manual entry key.
- TOTP second factor is required at each unlock when enabled.

### WebAuthn Passkeys with PRF extension (HTTPS builds only — NIST AAL2+)
- WebAuthn Level 3 PRF extension: the authenticator evaluates a PRF over a stored salt, producing 32 bytes which are used to derive an AES-256-GCM key.
- The master password is encrypted under this PRF-derived key; successful authentication decrypts the master password directly — no password entry required.
- Requires a secure context (`https://` or `localhost`). Not available on `file://`. The UI hides the passkey option when `isWebAuthnAvailable()` returns false.
- Multiple passkeys supported (different devices). Each credential stores its own PRF salt and encrypted password blob.

### App lock / idle timeout (NIST AC-11)
- `lockApp(reason)` clears the in-memory `CryptoKey`, all DB state (`_dbData`), the session key from IndexedDB, AI secrets, and disconnects the AI connection. Re-renders the auth screen.
- Idle events monitored: `pointermove`, `pointerdown`, `keydown`, `touchstart`, `wheel`, `scroll`. Default timeout: 15 minutes.
- Configurable 1–60 minutes or Off via Settings → Security.
- Lock button in topbar provides one-click manual lock.

### Audit log (NIST AU-2, AU-3, AU-9)
- All security-relevant events are recorded: session start, auth success/failure/lockout, MFA enable/disable/success/failure, passkey register/remove, app lock/unlock, password change, vault/backup export/import, app reset, AI key add/remove, AI queries.
- Log stored encrypted (AES-GCM) in `nexus_data_v1` under `__audit_log__`. Each entry has an ID, ISO timestamp, event type, details object, and user-agent string.
- Exportable as CSV or JSON Lines. Auto-purge policy configurable (30/90/365 days/never).

### Re-auth before sensitive operations (NIST IA-11 / Zero Trust)
- Vault export (`.taskappbak`) and JSON export require re-entering the master password before proceeding.
- Password change requires the current password (handled by `changePassword()`).

---

## Accepted risks and known limitations

| Risk | Severity | Accepted? | Reason |
|------|----------|-----------|--------|
| OPFS not used (faster large file storage) | Low | Yes | OPFS requires a secure context (HTTPS or localhost); `file://` is not a secure context |
| `unsafe-inline` in `style-src` | Low | Yes | When `style-src` contains hashes, browsers ignore `unsafe-inline` per spec — blocks 177+ inline `style=` attributes. Style hashes removed; `unsafe-inline` used alone. Script hashes remain in place. |
| `'wasm-unsafe-eval'` in script-src | Low | Enterprise only | Removed from the offline OT CSP. Other profiles may allow it for the ONNX runtime used by transformers.js WebLLM. |
| Hugging Face model-weight downloads | Low-Medium | Enterprise only | Disabled in the offline OT profile. Other profiles may allow it when the user opts into Gemma WebGPU models. |
| File integrity check skipped on `file://` | Low | Yes | Chrome/Edge block `fetch()` from `file://` via CORS. Check detects `location.protocol === 'file:'` and exits cleanly. App works normally. Check runs when served via HTTP/HTTPS. |
| Session key survives F5 (tab close clears it) | Low | Yes | This is intentional UX — requiring the password on every page refresh would be disruptive. Tab close is the security boundary. |
| Brute-force lockout persists in localStorage | Medium | Yes | Lockout now survives tab close. Offline dictionary attacks against the IDB file are bounded only by password strength and PBKDF2 cost. Strong password is the primary defence. |
| `localStorage` still used for non-sensitive preferences | None | Yes | Theme, dashboard layout, AI prefs (no keys). These are intentionally not encrypted — there is no sensitive data in them. |
| Cloud AI receives CRM summary data | Medium | Enterprise only | Disabled in the offline OT profile. Enterprise users may opt into cloud tiers; documented in network connections above. |
| AI cloud API keys are encrypted but stored locally | Medium | Yes | Best available option for a no-server offline app. Keys are AES-GCM encrypted under the vault key. |

---

## Reporting a security issue

This is a personal offline application. If you identify a security issue, open a discussion in the project or contact the maintainer directly. Do not disclose publicly without giving reasonable time to patch.
