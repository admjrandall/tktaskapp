# ADR 0004 — Mobile Storage Architecture

**Status:** Accepted (design); Pending (implementation — Phase 8 device work)  
**Date:** 2026-05-19  
**Authors:** Task App CRM team  
**Supersedes:** —  
**Related:** ADR 0006 (GDPR crypto-shredding), Phase 8 (mobile implementation)

---

## Context

The offline-web profile persists encrypted vault data in browser IndexedDB and, optionally, on a user-selected disk file via the File System Access API. Neither mechanism is available in a Capacitor native app:

- **IndexedDB** in a Capacitor WebView is not reliable as the sole persistent store — the OS may evict WebView storage under memory pressure, and the data is not accessible to native backup/export APIs.
- **File System Access API** is not available in WKWebView (iOS) or Android WebView.
- **iCloud / Google Drive** sync of WebView storage is unpredictable and cannot be audited.

The mobile profile requires a native storage adapter that:

1. Stores the encrypted vault blob in the platform's private, non-backed-up app directory.
2. Supports backup/export through the platform's standard document picker / share sheet.
3. Integrates biometric unlock via platform secure enclave / Keystore.
4. Makes zero network requests (offline profile invariant).

---

## Decision

The mobile build uses a **native Capacitor filesystem adapter** (`MobileVaultAdapter`) as the primary vault store, replacing browser IndexedDB for vault persistence. The adapter is defined as an abstract class in `packages/adapter-mobile-native/` and implemented using `@capacitor/filesystem` in the concrete Capacitor plugin layer.

Biometric unlock is provided by a separate `BiometricUnlockAdapter` abstract class, implemented using `@capacitor/biometrics` (or equivalent) that binds the wrapped master key to the platform secure enclave / Keystore.

The **sync adapter remains `NullAdapter`** — the mobile offline profile has no sync. A future mobile-enterprise profile would swap in `EnterpriseApiAdapter` (Phase 9+).

---

## Storage locations

| Platform | Vault location                                        | Rationale                                                                                                    |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| iOS      | `Library/Application Support/taskapp-vault/vault.enc` | Excluded from iTunes/iCloud backup by default; not accessible to other apps; survives app updates            |
| Android  | `filesDir/taskapp-vault/vault.enc`                    | App-private; excluded from auto-backup by default; survives app updates; no `READ_EXTERNAL_STORAGE` required |

Both locations are inside the app's sandboxed private container. No vault data touches external storage, shared storage, or the system pasteboard.

---

## Vault format compatibility

The encrypted vault blob format is **identical** to the browser offline profile. The same AES-256-GCM ciphertext, same PBKDF2-derived key, same schema version header. This means:

- A backup exported from iOS can be imported on Android, or on desktop (Chrome/Edge).
- Migration files in `packages/core/src/migrations/` apply equally to all platforms.
- The schema version embedded in the vault header gates migration logic platform-independently.

---

## Backup and export

The mobile profile uses the platform's native share/document picker for backup:

| Platform | Export                                   | Import                           |
| -------- | ---------------------------------------- | -------------------------------- |
| iOS      | `UIActivityViewController` (share sheet) | `UIDocumentPickerViewController` |
| Android  | `ACTION_CREATE_DOCUMENT` (SAF)           | `ACTION_OPEN_DOCUMENT` (SAF)     |

Backup files use the `.vault` extension and the same encrypted format as desktop exports. The restore flow requires a **dry-run validation** before overwriting the live vault — `MobileBackupAdapter.dryRunImport()` must succeed without modifying state.

---

## Biometric unlock

### Threat model for biometric unlock

The biometric adapter mitigates:

- Shoulder surfing of the master password at unlock time.
- Theft of the device by an attacker who cannot enrol biometrics.

It does **not** replace the master password — it wraps it. The master password remains the root secret; biometrics is a convenience unlock.

### Key binding

```
Master password
     │
     ▼ PBKDF2-HMAC-SHA-256 (600k iterations)
 CryptoKey (AES-256-GCM session key)
     │
     ▼ SubtleCrypto.wrapKey(AES-KW)
 WrappedKey (ciphertext — safe to store)
     │
     ▼ stored in platform secure enclave / Keystore
 (retrieval requires biometric authentication)
```

The raw master password and derived CryptoKey **never** reach the platform Keychain / Keystore. Only the wrapped key ciphertext is stored.

### Enrollment change policy

| Platform | Behavior on enrollment change                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| iOS      | Keychain item with `kSecAccessControlBiometryAny` — item remains accessible if a new biometric is added. Use `kSecAccessControlBiometryCurrentSet` for stricter binding.                         |
| Android  | Keystore key with `setInvalidatedByBiometricEnrollment(true)` — key is **permanently destroyed** when biometric enrollment changes. App must prompt for master password to re-wrap and re-store. |

The Android behavior is the more secure default and is the MASVS-AUTH-1 acceptance requirement. If iOS should match this, create a second Keychain item bound to `kSecAccessControlBiometryCurrentSet`.

---

## Network lockdown

The mobile profile makes no network connections. Both platform-level and runtime-level controls enforce this:

| Control            | iOS                                              | Android                                                              |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------------------- |
| Platform config    | `NSAllowsArbitraryLoads: false` in `Info.plist`  | `cleartextTrafficPermitted="false"` in `network_security_config.xml` |
| CA trust           | System CAs only                                  | System CAs only (no user CAs)                                        |
| WebView navigation | `allowNavigation: []` in `capacitor.config.ts`   | `allowNavigation: []` in `capacitor.config.ts`                       |
| Runtime guard      | `isNavigationAllowed()` in `network-policy.ts`   | `isNavigationAllowed()` in `network-policy.ts`                       |
| Startup assertion  | `assertNetworkPolicyCompliant()` before `init()` | `assertNetworkPolicyCompliant()` before `init()`                     |

MITM proxy tests (Burp Suite / mitmproxy) must confirm zero cleartext traffic on both platforms as part of the MASVS-NETWORK-1 acceptance check.

---

## AI model supply chain (mobile)

Before any AI model is added to the mobile build:

1. **Pin model file SHA-256 hashes** in the build config. CI must fail if a model hash changes without a deliberate update.
2. **Document model provenance:** training data source, license, publisher, version, size.
3. **Prefer MDM preload** over in-app download for enterprise deployments (avoids the `NSAllowsArbitraryLoads` exception that a download endpoint would require).
4. **Threat model the model file:** a tampered model could act as a supply-chain attack vector. Treat model downloads with the same scrutiny as binary dependencies.

---

## OWASP MASVS 2.0 acceptance criteria

| MASVS control    | Requirement                                                                     | Acceptance test                                                                                     |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| MASVS-STORAGE-1  | Vault in private app directory only; no cleartext data on external storage.     | Manual verification: adb shell or Xcode Organizer shows no cleartext data in accessible locations.  |
| MASVS-STORAGE-2  | No sensitive data in `SharedPreferences` / `UserDefaults`.                      | Manual: inspect all prefs/defaults entries; confirm no password, key, or personal data present.     |
| MASVS-CRYPTO-1   | AES-256-GCM; PBKDF2-HMAC-SHA-256 at 600k iterations; non-extractable CryptoKey. | Code review + unit test of key derivation parameters.                                               |
| MASVS-AUTH-1     | Biometric key invalidated on Android enrollment change.                         | Device test: enroll new fingerprint → confirm `KeyPermanentlyInvalidatedException` is thrown.       |
| MASVS-NETWORK-1  | No cleartext HTTP traffic in any flow.                                          | MITM proxy test: intercept all traffic on both platforms; confirm zero HTTP connections.            |
| MASVS-PLATFORM-1 | No broad JavaScript bridge exposure.                                            | Code review: only explicitly declared Capacitor plugins are registered; no `addPlugin(*)` wildcard. |
| MASVS-CODE-1     | No debug code or logging in production build.                                   | Build review: `Release` scheme (iOS) / `release` variant (Android) produces no debug output.        |

Test evidence for each MASVS control must be captured and retained in `docs/compliance/masvs-mapping.md`.

---

## Module layout

```
packages/adapter-mobile-native/
    src/
        mobile-vault-adapter.ts     ← abstract: readVault, writeVault, deleteVault, vaultExists
        mobile-backup-adapter.ts    ← abstract: exportVault, importVault, dryRunImport, exportAuditLog
        biometric-unlock-adapter.ts ← abstract: isAvailable, storeWrappedKey, retrieveWrappedKey, deleteWrappedKey
        network-policy.ts           ← MobileNetworkPolicy type, OFFLINE_MOBILE_NETWORK_POLICY constant, guards
        index.ts                    ← barrel export

apps/mobile/
    capacitor.config.ts             ← Capacitor app config (TypeScript; preferred over .json)
    src/entry.ts                    ← mobile entry point (documented stub pending Phase 8 device work)
    ios/App/
        Info.plist                  ← ATS: NSAllowsArbitraryLoads: false; usage strings
        PrivacyInfo.xcprivacy       ← iOS 17+ privacy manifest; no tracking; no collected data
    android/app/src/main/res/xml/
        network_security_config.xml ← cleartextTrafficPermitted: false; system CAs only
```

---

## Consequences

**Positive:**

- Vault data in the platform private directory survives app updates, device restores from backup, and is not accessible to other apps.
- Backup/export through the platform share sheet gives the user full control over backup destinations without any server dependency.
- Biometric unlock does not store the master password — compromise of the Keychain/Keystore entry does not directly expose the master secret.
- Network lockdown at both platform and runtime levels provides defense in depth against accidental network connections.

**Negative:**

- Requires `@capacitor/filesystem` and a biometric plugin — adds build dependencies and native plugin surface.
- Android enrollment change invalidation forces a re-authentication flow that requires UX design and testing.
- Capacitor native plugins must be audited for their own JavaScript bridge exposure (MASVS-PLATFORM-1).

---

## Implementation status

- [x] Abstract adapter interfaces — `packages/adapter-mobile-native/src/`
- [x] Capacitor config — `apps/mobile/capacitor.config.ts`
- [x] iOS ATS config — `apps/mobile/ios/App/Info.plist`
- [x] iOS privacy manifest — `apps/mobile/ios/App/PrivacyInfo.xcprivacy`
- [x] Android NSC — `apps/mobile/android/app/src/main/res/xml/network_security_config.xml`
- [x] Mobile entry point stub — `apps/mobile/src/entry.ts`
- [ ] Concrete `MobileNativeVaultAdapter` using `@capacitor/filesystem` — Phase 8 device
- [ ] Concrete `NativeBiometricAdapter` using `@capacitor/biometrics` — Phase 8 device
- [ ] MASVS test evidence captured — Phase 8 device
- [ ] `apps/mobile/android/app/src/main/AndroidManifest.xml` referencing NSC — Phase 8 device
- [ ] `apps/mobile/ios/` Xcode project wired to `Info.plist` and `PrivacyInfo.xcprivacy` — Phase 8 device
- [ ] Model hash pinning in CI — before any AI model is added to mobile build
