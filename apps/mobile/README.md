# Task App CRM — Mobile (Capacitor)

**Status: Scaffold only — Capacitor is not yet installed. This target is not production-capable.**

This app target will deliver the offline-first, AES-256-GCM encrypted CRM as a native mobile app
on iOS and Android using [Capacitor](https://capacitorjs.com/).

---

## What already exists

| File                                                       | Purpose                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `capacitor.config.ts`                                      | Capacitor configuration stub — `androidScheme: 'https'`, no external navigation      |
| `ios/App/Info.plist`                                       | iOS ATS config — `NSAllowsArbitraryLoads: false`                                     |
| `ios/App/PrivacyInfo.xcprivacy`                            | iOS 17+ privacy manifest — no tracking, no data collection                           |
| `android/app/src/main/res/xml/network_security_config.xml` | Android NSC — `cleartextTrafficPermitted="false"`, system CAs only                   |
| `src/entry.ts`                                             | Documented wiring stub — deployment policy, adapter order, MASVS acceptance criteria |

---

## What must exist before this target is production-capable

### 1. Capacitor installed and platforms created

```bash
# From the repo root — DO NOT run until all prerequisites below are complete
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

### 4. Wired entry point

`src/entry.ts` must be updated from a stub to a real entry. Call in this order:

```ts
assertNetworkPolicyCompliant(OFFLINE_MOBILE_NETWORK_POLICY) // security gate — must be first
setDeploymentPolicy(MOBILE_OFFLINE_PROFILE.policy)
setAdapter(new NullAdapter())
setStorageAdapter(new MobileNativeVaultAdapter())
setNativeSecurityAdapter(new NativeBiometricAdapter())
init()
```

### 5. `AndroidManifest.xml` reference

The Android manifest must reference the NSC file:

```xml
<application
  android:networkSecurityConfig="@xml/network_security_config"
  ...>
```

### 6. iOS usage description strings

Add to `Info.plist` before the corresponding features ship:

- `NSFaceIDUsageDescription` — required before biometric unlock is enabled.
- App Store rejects apps with missing usage strings for features present in the binary.
- Do not add strings for capabilities that are not yet implemented.

### 7. `PrivacyInfo.xcprivacy` update

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

## Build target (once Capacitor is installed)

```bash
pnpm run build:offline          # builds dist/offline/index.html (the WebView bundle)
cd apps/mobile
npx cap sync                    # copies dist/ to native platform projects
npx cap run ios                 # or: npx cap run android
```

---

## Security contacts

Vulnerabilities: developer@techkeycloud.com — see [SECURITY.md](../../SECURITY.md)
