# adapter-mobile-native

**Status: Interface defined. Concrete Capacitor implementations pending.**

Abstract adapter interfaces for native mobile vault storage, biometric unlock, and encrypted backup
on iOS and Android. Designed for use in `apps/mobile` via [Capacitor](https://capacitorjs.com/).

---

## Modules

| Module                        | Purpose                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `mobile-vault-adapter.ts`     | Abstract class — read/write/delete the AES-256-GCM encrypted vault blob via native filesystem                                   |
| `biometric-unlock-adapter.ts` | Abstract class — store/retrieve wrapped master key in platform secure enclave / Android Keystore                                |
| `mobile-backup-adapter.ts`    | Abstract class — export/import encrypted vault and audit log via platform document picker / share sheet                         |
| `network-policy.ts`           | `MobileNetworkPolicy` type, `OFFLINE_MOBILE_NETWORK_POLICY` constant, `isNavigationAllowed()`, `assertNetworkPolicyCompliant()` |

---

## Capacitor dependency

This package requires `@capacitor/core`, `@capacitor/filesystem`, and `@capacitor/biometrics`.

**Do not add these as dependencies until Capacitor is installed in `apps/mobile`.**
Adding Capacitor before the iOS/Android platform projects are created results in broken `cap sync` commands.

```bash
# Add when ready (from repo root)
pnpm add @capacitor/core @capacitor/filesystem @capacitor/biometrics
```

---

## iOS ATS requirements

App Transport Security is declared in `apps/mobile/ios/App/Info.plist`.

| Key                          | Required value          | Why                                                                        |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `NSAllowsArbitraryLoads`     | `false`                 | Prohibits all cleartext HTTP connections                                   |
| `NSAllowsLocalNetworking`    | `true`                  | Required by Capacitor for local bundle loading                             |
| `NSFaceIDUsageDescription`   | Non-empty string        | Required before biometric unlock ships; App Review rejects missing strings |
| `NSExceptionDomains` entries | None in offline profile | Domain exceptions must be justified and reviewed; never add wildcards      |

---

## Android NSC requirements

Android Network Security Config is declared in
`apps/mobile/android/app/src/main/res/xml/network_security_config.xml`.

| Requirement                         | Config                                                  | Why                                                                   |
| ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `cleartextTrafficPermitted="false"` | `<base-config>` attribute                               | Prohibits cleartext HTTP globally                                     |
| System CAs only                     | `<certificates src="system" />`                         | Prevents MITM via user-installed proxy certificates (MASVS-NETWORK-2) |
| No user CA trust in production      | Omit `<certificates src="user" />` from `<base-config>` | User CAs trusted = SSL inspection bypasses the NSC                    |

`AndroidManifest.xml` must reference this file:

```xml
<application
  android:networkSecurityConfig="@xml/network_security_config"
  ...>
```

---

## MASVS 2.0 acceptance criteria

All criteria must pass before shipping a production build.

| Control          | Requirement                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MASVS-STORAGE-1  | `MobileVaultAdapter.writeVault()` stores ciphertext in platform-private directory; no world-read permission on the file                                                        |
| MASVS-STORAGE-2  | No sensitive fields (master password, DEK, session token) written to SharedPreferences (Android) or UserDefaults (iOS) by any adapter method                                   |
| MASVS-CRYPTO-1   | AES-256-GCM + PBKDF2-HMAC-SHA-256 at 600k iterations; key non-extractable; raw key material never written to disk                                                              |
| MASVS-AUTH-1     | `BiometricUnlockAdapter` binds key to biometric; `setInvalidatedByBiometricEnrollment(true)` on Android; key wiped on enrollment change; master password required to re-enroll |
| MASVS-NETWORK-1  | All vault sync (if any) over HTTPS only; `MobileNetworkPolicy.cleartextTrafficPermitted: false` enforced at runtime via `assertNetworkPolicyCompliant()`                       |
| MASVS-NETWORK-2  | User-installed CA certificates not trusted in production build (NSC `<certificates src="user" />` absent from `<base-config>`)                                                 |
| MASVS-PLATFORM-1 | Capacitor plugin allowlist reviewed; no broad JavaScript bridge exposure; only required plugins declared in `capacitor.config.ts`                                              |

---

## Backup format compatibility

The `.vault` export format produced by `MobileBackupAdapter.exportVault()` is identical to the
desktop backup format — same AES-256-GCM encrypted blob, same header, same schema version.
Mobile and desktop backups are fully interchangeable.

The dry-run import (`dryRunImport()`) must inspect the blob header and return schema metadata
without modifying live vault state or performing any decryption.

---

## Security contacts

Vulnerabilities: developer@techkeycloud.com — see [SECURITY.md](../../SECURITY.md)
