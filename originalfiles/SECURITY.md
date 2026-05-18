# Security Policy

**Task App CRM** — `taskapp.html`  
**Last reviewed:** 2026-05-15  
All information in this document is derived from direct inspection of the current file.

---

## Threat model

This is a **local, offline-first, single-user application** opened directly from the filesystem via `file://`. It is not a web service and has no server. The threat model is therefore narrower than a typical web app — but not trivial.

**In scope:**
- Physical access to the device while the app is closed (data at rest must be unreadable without the password)
- An attacker who gains read access to the browser profile directory (IndexedDB files, localStorage)
- A tampered copy of `taskapp.html` substituted for the real one (supply-chain / file tampering)
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

The CSP meta tag enforces the following:

- **`default-src 'none'`** — no resources load by default
- **`script-src`** — SHA-256 hashes for exactly the 15 inline script blocks in the file; `'strict-dynamic'` to allow dynamically created scripts (used by transformers.js WebLLM)
- **`style-src 'unsafe-inline'`** — allows inline `style=` attributes throughout the app. Style block hashes are not used because when `style-src` contains any hash values, browsers ignore `unsafe-inline` entirely per spec — which would block the 177+ inline `style=` attributes in render functions. Script hashes are the security-critical protection; style hashing is not required for this threat model.
- **`img-src 'self' data: blob:`** — permits inline data URIs (file attachments stored as base64) and blob URLs
- **`connect-src 'self' https: http://localhost:* http://127.0.0.1:*`** — allows AI cloud API calls (Anthropic, OpenAI, Google) over HTTPS and Ollama over localhost only
- **`worker-src blob:`** — required for transformers.js WebLLM Web Worker
- **`object-src 'none'`** — blocks all plugin content
- **`base-uri 'none'`** — prevents base tag injection
- **`frame-ancestors 'none'`** — not in the CSP meta tag (browsers ignore `frame-ancestors` in `<meta>` elements per spec — it only works in HTTP response headers). If the app is ever served via HTTPS, add `frame-ancestors 'none'` as a server-side response header.
- **`trusted-types nexus-crm nexus-crm-raw`** — only these two policy names may be created
- **`require-trusted-types-for 'script'`** — any raw string assigned to `innerHTML` or another DOM sink throws a `TypeError`; all assignments must go through a registered policy

**CSP hashes must be regenerated after every edit.** Run `node generate-csp.mjs`. Editing the CSP `content=` attribute manually will break the app.

---

## Trusted Types

Two Trusted Types policies are registered once at module scope:

- **`nexus-crm`** (`_ttPolicy`) — sanitises user-visible strings (HTML-escapes `&`, `<`, `>`, `"`, `'`) before `innerHTML`
- **`nexus-crm-raw`** (`_rawPolicy`) — passes already-safe template HTML through unchanged; used by the `patchInnerHTML` override and the toast `insertAdjacentHTML` path

`Element.prototype.innerHTML` is monkey-patched to automatically route all string assignments through `_rawPolicy`. This means existing template-string render functions work without a line-by-line rewrite while still satisfying the Trusted Types enforcement.

**The rule:** Never call `trustedTypes.createPolicy('nexus-crm-raw', ...)` again. Per the Trusted Types spec, creating a policy with an already-registered name throws a `TypeError` unless the CSP includes `'allow-duplicates'` — which it does not.

---

## XSS mitigations

- `escH()` is applied to all user-supplied strings before they are interpolated into HTML template strings
- The Trusted Types `patchInnerHTML` override provides a second layer — any unescaped string assignment not going through a policy throws at runtime
- No `eval()` or `new Function()` anywhere in the file
- Cloud AI responses are treated as untrusted text — they are escaped before rendering in the chat UI (`escH(text)` in `streamToBubble()`)

---

## File integrity

`generate-csp.mjs` computes a SHA-256 hash of the final written `taskapp.html` and saves it to `taskapp.sha256`. On every page load, `checkFileIntegrity()` fetches both files, re-hashes the HTML, and compares. A mismatch triggers a persistent red warning banner across the top of the app.

**Limitation:** `fetch()` from `file://` is blocked by Chrome and Edge via CORS policy. The check detects this by inspecting `location.protocol` at startup and returns immediately with an informational console message rather than firing failed network requests. The app works normally. The check works reliably when the file is served via HTTP or HTTPS.

**What this detects:** Modification of `taskapp.html` by a third party between the last `generate-csp.mjs` run and the current load. It does not detect modifications to `taskapp.sha256` itself — if both files are replaced, the check passes. Treat `taskapp.sha256` as a secondary signal, not a cryptographic proof.

---

## Network connections

The app makes no network requests during normal offline operation. Network is used only for:

| Destination | When | What is sent |
|-------------|------|-------------|
| `https://api.anthropic.com/v1/messages` | Cloud AI — Anthropic tier | System prompt, chat history, user message |
| `https://api.openai.com/v1/chat/completions` | Cloud AI — OpenAI tier | System prompt, chat history, user message |
| `https://generativelanguage.googleapis.com/...` | Cloud AI — Google tier | System prompt, chat history, user message |
| `http://localhost:11434` (or configured URL) | Ollama tier | System prompt, chat history, user message |
| `taskapp.sha256` (same origin/folder) | On every page load | Nothing — fetch only |

**No telemetry. No analytics. No tracking of any kind.**

Cloud AI calls include a compact summary of current CRM record counts and a few field values as context (built by `buildDataSummary()`). Users should be aware that when using cloud AI tiers, this CRM summary is transmitted to the selected provider. Local tiers (Browser, Ollama) send nothing over the network.

---

## Auth and brute-force protection

- Password is never stored. The PBKDF2-derived key is tested against an encrypted verify token (`'NEXUS_CRM_OK'`); if decryption fails, the password is wrong.
- Failed attempts trigger an exponential lockout: attempt 1 = 500ms delay, attempt 2 = 1s, attempt 3 = 2s ... capped at 30 seconds per attempt.
- Lockout state (`_authFailCount`, `_authLockedUntil`) is in-memory only — cleared on page refresh. This is a UI-level protection, not a cryptographic one. An attacker with access to the raw IDB files can attempt offline dictionary attacks at the speed of their hardware against a PBKDF2-600k key. Password strength is the primary defence.

---

## Accepted risks and known limitations

| Risk | Severity | Accepted? | Reason |
|------|----------|-----------|--------|
| OPFS not used (faster large file storage) | Low | Yes | OPFS requires a secure context (HTTPS or localhost); `file://` is not a secure context |
| `unsafe-inline` in `style-src` | Low | Yes | When `style-src` contains hashes, browsers ignore `unsafe-inline` per spec — blocks 177+ inline `style=` attributes. Style hashes removed; `unsafe-inline` used alone. Script hashes remain in place. |
| `connect-src https:` is broad | Low-Medium | Yes | Required to allow all three cloud AI providers without listing each domain. Could be tightened to specific domains if cloud providers are not used. |
| File integrity check skipped on `file://` | Low | Yes | Chrome/Edge block `fetch()` from `file://` via CORS. Check detects `location.protocol === 'file:'` and exits cleanly. App works normally. Check runs when served via HTTP/HTTPS. |
| Session key survives F5 (tab close clears it) | Low | Yes | This is intentional UX — requiring the password on every page refresh would be disruptive. Tab close is the security boundary. |
| Brute-force lockout is in-memory only | Medium | Yes | Offline dictionary attacks against the IDB file are bounded only by password strength and PBKDF2 cost, not by the UI lockout. Strong password is required. |
| `localStorage` still used for non-sensitive preferences | None | Yes | Theme, dashboard layout, AI prefs (no keys). These are intentionally not encrypted — there is no sensitive data in them. |
| Cloud AI receives CRM summary data | Medium | User-controlled | Only when cloud tier is selected. Local tiers send nothing. Documented in network connections section above. |
| AI cloud API keys are encrypted but stored locally | Medium | Yes | Best available option for a no-server offline app. Keys are AES-GCM encrypted under the vault key. |

---

## Reporting a security issue

This is a personal offline application. If you identify a security issue, open a discussion in the project or contact the maintainer directly. Do not disclose publicly without giving reasonable time to patch.
