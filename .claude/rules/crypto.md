# Cryptography rules

Apply whenever touching `packages/core/src/security/` or any code that handles key derivation, encryption, or key storage. These invariants are security-sensitive; verify current guidance before changing any parameter.

## Key derivation — PBKDF2

Algorithm: **PBKDF2-HMAC-SHA-256** at **600,000 iterations** (`PBKDF2_ITERATIONS` in `constants.ts`). This is the OWASP 2026 recommendation verified at time of implementation. Do not lower this value. If raising it, verify the current OWASP recommendation, measure performance impact on target devices, and add a migration path for existing vaults.

Salt: 32 bytes (`SALT_BYTES`), randomly generated once at first run, stored in `nexus_vault_v2` under key `nexus_salt_v1`.

Legacy migration: version `'1'` = 310,000 iterations (`PBKDF2_ITERATIONS_LEGACY`). On unlock, `initCrypto()` detects this via `KDF_VERSION_KEY` (`nexus_kdf_v`) and silently re-derives at 600,000. The `PBKDF2_ITERATIONS_LEGACY` constant is used only for migration detection — never for new key derivation.

## Symmetric encryption — AES-GCM

Algorithm: **AES-256-GCM**. IV: 12 bytes (`IV_BYTES`), randomly generated per encryption call via `crypto.getRandomValues()`. The IV is prepended to the ciphertext before base64 encoding (format: `[12-byte IV][ciphertext]`).

## Non-extractable key rule

`_dbKey` (the session `CryptoKey`) must always be created with `extractable: false`. The raw key bytes must never:

- Exist as a JavaScript string
- Be serialized to JSON, localStorage, or any readable format
- Be returned from any function outside WebCrypto

Session persistence is handled by storing the non-extractable `CryptoKey` object itself in IndexedDB (`nexus_keys_v1` / store `sessionKey` / key `'active'`) via `cacheSessionKey()`. This survives page reload but clears on tab close.

## Base64 encoding

Use `u8ToBase64()` and `base64ToU8()` from `security/crypto.ts`. Do not use `btoa(String.fromCharCode(...array))` — RangeError on arrays >~65 KB. The helpers use `Uint8Array.toBase64()` / `Uint8Array.fromBase64()` with chunked btoa fallbacks.

## Vault structure

The vault encryption chain:

1. `deriveKey(password, salt)` → non-extractable `CryptoKey` (PBKDF2)
2. `aesEncrypt(key, allStoreData)` → encrypted blob → stored in `nexus_vault_v2` / key `nexus_vault_v1`
3. Per-record: `aesEncrypt(key, record)` → stored individually in `nexus_data_v1` (for all `IDB_STORES`)

## Changing crypto parameters

Any change to: PBKDF2 iterations, algorithm, IV length, key usage flags, or IDB database/store names requires:

1. Security impact notes with reference to current OWASP/NIST guidance
2. A migration path for existing encrypted vaults (cannot just change — existing data becomes unreadable)
3. KDF version bump in `KDF_VERSION_KEY` storage
4. Updated documentation in `SECURITY.md` and `TECHNICAL-REFERENCE.md`
