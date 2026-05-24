# apps/mobile — Capacitor Native Packaging

**Status:** Native Capacitor packaging scaffolded. Web PWA functionality has moved to `apps/enterprise-web`.

This directory contains only the native Capacitor platform configuration. The web build used by Capacitor is `dist/enterprise/`, produced by `pnpm run build:enterprise`.

---

## What lives here

| File / Directory                                           | Purpose                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `capacitor.config.ts`                                      | Capacitor config — `webDir: ../../dist/enterprise`, `androidScheme: https` |
| `capacitor.config.json`                                    | Generated mirror of `capacitor.config.ts` (used by Capacitor CLI)          |
| `ios/App/Info.plist`                                       | iOS ATS config — `NSAllowsArbitraryLoads: false`                           |
| `ios/App/PrivacyInfo.xcprivacy`                            | iOS 17+ privacy manifest — no tracking, no data collection                 |
| `android/app/src/main/res/xml/network_security_config.xml` | Android NSC — `cleartextTrafficPermitted="false"`, system CAs only         |

---

## Web assets

The Capacitor WebView loads `dist/enterprise/`. Build it first:

```bash
# From repo root
pnpm run build:enterprise   # same as pnpm run build:mobile
```

---

## Native build workflow (once Capacitor is installed)

```bash
# 1. Build web assets
pnpm run build:enterprise

# 2. Sync to native platform projects
cd apps/mobile
npx cap sync

# 3. Run on device / simulator
npx cap run ios     # or: npx cap run android
```

---

## What must exist before native Capacitor packaging is production-capable

### 1. Capacitor installed and platforms created

```bash
pnpm add @capacitor/core @capacitor/cli @capacitor/filesystem @capacitor/biometrics
cd apps/mobile && npx cap add ios && npx cap add android
```

### 2. Concrete `MobileVaultAdapter` using `@capacitor/filesystem`

`packages/adapter-mobile-native/src/mobile-vault-adapter.ts` defines the abstract `MobileVaultAdapter`.
A concrete subclass must:

- Write the encrypted vault blob to `Library/Application Support/taskapp-vault/vault.enc` (iOS)
  or `filesDir/taskapp-vault/vault.enc` (Android).
- Use atomic write (temp file → rename) to prevent partial writes on crash.
- Verify the directory is excluded from iCloud / Google Drive automatic backup.
- Never write the raw DEK, KEK, or master password — only the AES-256-GCM ciphertext.

### 3. Concrete `BiometricUnlockAdapter` using `@capacitor/biometrics`

`packages/adapter-mobile-native/src/biometric-unlock-adapter.ts` defines the abstract `BiometricUnlockAdapter`.
A concrete subclass must:

- Bind wrapped key material to biometric authentication via iOS Keychain / Android Keystore.
- Set `setInvalidatedByBiometricEnrollment(true)` on Android — enrollment change wipes the stored key by design.
- Never store the raw master password; store only the AES-KW wrapped key.
- On iOS: use `kSecAccessControlBiometryAny` + `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
  - `kSecAttrSynchronizable: false` (never synced to iCloud).

### 4. `AndroidManifest.xml` reference

The Android manifest must reference the NSC file:

```xml
<application
  android:networkSecurityConfig="@xml/network_security_config"
  ...>
```

### 5. iOS usage description strings

Add to `Info.plist` before the corresponding features ship:

- `NSFaceIDUsageDescription` — required before biometric unlock is enabled.
- App Store rejects apps with missing usage strings for features present in the binary.

### 6. `PrivacyInfo.xcprivacy` update

Before App Store submission, review `NSPrivacyAccessedAPITypes` for:

- `@capacitor/filesystem` — may access file timestamps (`NSPrivacyAccessedAPICategoryFileTimestamp`).
- LocalAuthentication (biometric unlock) — may require `NSPrivacyAccessedAPICategoryUserDefaults`.

---

## MASVS 2.0 acceptance test plan

All criteria must pass before a release candidate build is submitted to the App Store or Google Play.

| MASVS Control    | Test                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| MASVS-STORAGE-1  | Vault file in platform-private directory; not world-readable (`adb shell ls -la` or iOS Files app)             |
| MASVS-STORAGE-2  | No sensitive data in SharedPreferences (Android) or UserDefaults (iOS) after vault write                       |
| MASVS-CRYPTO-1   | AES-256-GCM + PBKDF2-HMAC-SHA-256 at 600k iterations; key non-extractable; static analysis confirms            |
| MASVS-AUTH-1     | Biometric key invalidated on Android enrollment change; master password required to re-enroll                  |
| MASVS-NETWORK-1  | No cleartext traffic — TLS inspection compliance test (Charles / mitmproxy) confirms all connections are HTTPS |
| MASVS-NETWORK-2  | Only system CA certificates trusted — NSC / ATS config verified via TLS compliance test                        |
| MASVS-PLATFORM-1 | Capacitor plugin allowlist reviewed; no broad JavaScript bridge exposure; only required plugins enabled        |

---

## Security contacts

Vulnerabilities: developer@techkeycloud.com — see [SECURITY.md](../../SECURITY.md)
