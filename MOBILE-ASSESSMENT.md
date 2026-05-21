# Task App CRM — Mobile Build Assessment

> **Assessment type:** Static architecture, code, documentation, and standards-alignment review.
> Not a penetration test, certification audit, source-code exhaustive review, or legal opinion.
>
> **Assessment rule:** No unsupported certification claims. Each finding is marked
> _implemented_, _partial_, _not implemented_, or _not applicable_ based on observed branch
> evidence and current public standards.

| Field               | Value                                        |
| ------------------- | -------------------------------------------- |
| Assessment date     | 2026-05-19                                   |
| Version             | v3                                           |
| Repository / branch | `claude/generate-offline-profile-html-CRKHK` |

---

## Executive Verdict

> **No-BS verdict:** Mobile is not production-ready. The branch contains a mobile roadmap
> that points in a reasonable direction, but no implemented `apps/mobile/capacitor.config.ts`
> was found. Treat mobile as a **planned build profile, not a working mobile product.**
> Capacitor is still the recommended path for the offline mobile client, but only if native
> storage, backup/export, Keychain/Keystore, biometrics, network lockdown (including iOS ATS
> and Android Network Security Config), privacy manifests, app signing, and MASVS testing are
> actually implemented.

| Mobile area          | Current state                                                                           | Required production state                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build implementation | `MOBILE-ROADMAP.md` describes Capacitor plan. No `capacitor.config.ts` found in branch. | `apps/mobile` with `capacitor.config.ts`, iOS/Android platform projects, mobile entry point, native storage plugin, release signing.               |
| Storage              | Roadmap notes IndexedDB works in WebView but File System Access API is absent.          | Native encrypted vault storage/snapshot; native import/export. Do not rely on WebView IndexedDB as the only durable copy.                          |
| Backup / export      | Desktop file system feature absent on mobile without a replacement.                     | Native document picker/share/storage access; encrypted backup default; restore dry-run tested on real devices.                                     |
| Biometrics           | WebAuthn PRF exists for secure web origins; not a complete native mobile unlock design. | Face ID/Touch ID/Android BiometricPrompt with Keychain/Keystore-bound key wrapping.                                                                |
| AI                   | Roadmap proposes `@capgo/capacitor-llm`/native AI bridge.                               | Vendor/plugin security review, model hash pinning, model provenance, MDM preload strategy, on-device inference data boundary, AI policy and audit. |
| Network lockdown     | No platform-level restrictions observed.                                                | iOS App Transport Security (ATS) and Android Network Security Config enforced at platform layer, not only JS policy.                               |
| Certification        | No mobile verification evidence.                                                        | OWASP MASVS/MASTG test evidence, App Store privacy manifest, Play Data Safety, SBOM, signing, release process.                                     |

---

## Certification and Assurance Applicability

| Standard / requirement                   | Mobile applicability                                                                | Current state                                                                | Required evidence                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **OWASP MASVS / MASTG**                  | Primary mobile app security verification baseline.                                  | **Not ready.** No implemented mobile app evidence.                           | MASVS matrix for storage, crypto, auth, network, platform interaction, code quality, resilience, and privacy. Device test results. |
| **OWASP ASVS 5.0**                       | Applies to web core running in WebView and enterprise APIs.                         | **Partial** for core; not verified in mobile runtime.                        | WebView-specific tests for XSS, CSP behavior, storage, file handling, and bridge restrictions.                                     |
| **NIST SP 800-63B-4**                    | Applies to authentication, biometrics, passkeys, session, recovery.                 | **Partial** in web core. Native biometric/Keychain/Keystore not implemented. | Biometric enrollment/change handling, fallback rules, master password recovery, reauth for sensitive actions.                      |
| **NIST SP 800-207 Zero Trust**           | Applies to enterprise mobile client with backend and device posture.                | **Not implemented.**                                                         | MDM/device compliance, IdP, conditional access, server-side authorization, telemetry, remote wipe/session revoke.                  |
| **ISO/IEC 27001 / SOC 2**                | Applies to organization/service operating the mobile app, not the app binary alone. | **Not ready.**                                                               | Secure SDLC, release signing, mobile vulnerability management, incident response, access controls, monitoring evidence.            |
| **ISO/IEC 42001:2023**                   | Applies if AI is a material product function (native AI provider on mobile).        | **Not ready.**                                                               | AI policy, model inventory, risk assessments, human oversight, monitoring, supplier controls.                                      |
| **WCAG 2.2 / mobile accessibility**      | Applies to mobile UI and web core.                                                  | **Unknown.**                                                                 | VoiceOver/TalkBack, dynamic type, focus order, touch targets, contrast, keyboard/external keyboard testing.                        |
| **Apple App Privacy / Privacy Manifest** | Required for iOS distribution depending on APIs/SDKs used.                          | **Not implemented / evidenced.**                                             | Privacy manifest (`PrivacyInfo.xcprivacy`), permission strings, data collection disclosures, third-party SDK reason declarations.  |
| **Google Play Data Safety**              | Required for Play distribution.                                                     | **Not implemented / evidenced.**                                             | Data collection/sharing declarations, permission audit, SDK list, security practices.                                              |
| **FIPS 140-3**                           | Only if regulated/federal mobile deployment requires validated crypto.              | **Cannot claim** based on WebCrypto alone.                                   | Use/platform-validate cryptographic module and document boundary/certificates.                                                     |
| **Enterprise MDM**                       | Required for managed enterprise mobile rollout.                                     | **Roadmap only; no implementation.**                                         | Managed app config, app protection policy, remote wipe, cert distribution, managed open-in restrictions.                           |

---

## Detailed Mobile Findings

### M-01 · Critical · Mobile build is roadmap, not implemented

**Evidence/Reason:** `MOBILE-ROADMAP.md` exists and describes the Capacitor plan; no `apps/mobile/capacitor.config.ts` was found in the branch.

**Implementation instruction:** Create `apps/mobile` as a first-class build target with: `capacitor.config.ts`, `package.json` (mobile-specific scripts), `src/entry.ts` (mobile profile, native adapters), iOS and Android platform projects (`ios/`, `android/`), build scripts (`pnpm build:mobile`, `npx cap sync`), CI jobs for both platforms. The mobile entry must select `MOBILE_OFFLINE_PROFILE`, inject `MobileVaultStorageAdapter`, and call `init()`.

**Acceptance criteria:** `pnpm build:mobile`, `npx cap sync`, Android build (`./gradlew assembleDebug`), and iOS build (`xcodebuild`) all succeed. App loads offline CRM UI on a real iOS and Android device with the profile label displayed.

---

### M-02 · Critical · WebView IndexedDB alone is insufficient for vault durability

**Evidence/Reason:** Roadmap states IndexedDB works in Capacitor WebView but notes that Capacitor storage documentation warns browser storage is subject to OS-level eviction and has no native backup guarantee. An app restart, OS storage pressure event, or app reinstall can destroy IndexedDB data with no user warning.

**Implementation instruction:** Implement a `MobileVaultStorage` adapter backed by the platform native filesystem (iOS `Library/Application Support/` — not `Documents/` unless user-facing export is intended; Android app-internal storage via `Context.filesDir`). Use Capacitor's `Filesystem` plugin or a native Capacitor plugin for encrypted SQLite as the vault's durable backing store. Treat WebView IndexedDB as a session-scoped cache only, not the source of truth. Provide a first-launch migration path for any user who previously relied on WebView storage.

**Acceptance criteria:** Vault persists correctly after: app restart, device reboot, clearing WebView cache. Encrypted backup/import works on real iOS and Android devices. Desktop/mobile backup format compatibility is documented.

---

### M-03 · Critical · No native backup/export replacement for File System Access API

**Evidence/Reason:** `MOBILE-ROADMAP.md` explicitly states the disk backup feature will be absent on mobile because the File System Access API is not available in Capacitor WebView.

**Implementation instruction:** Implement native encrypted `.vault` export/import using platform-native file APIs: iOS `UIDocumentPickerViewController` (Files app integration) or `UIActivityViewController` (share sheet); Android `Storage Access Framework` (`ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`) or share intent. The exported file must be the same encrypted vault format as the desktop build. Provide a restore dry-run that imports the vault to a temporary location and verifies decryption before overwriting the live vault.

**Acceptance criteria:** User can export and import an encrypted backup on real iOS and Android devices. Restore dry-run works and does not overwrite current vault. Exported file is readable by the desktop offline build.

---

### M-04 · High · Native biometric unlock not implemented

**Evidence/Reason:** WebAuthn PRF requires a secure HTTPS or `localhost` context and is not a complete native mobile vault unlock mechanism. Mobile biometrics require platform-native APIs bound to hardware-backed key storage.

**Implementation instruction:**

- **iOS:** Use `LocalAuthentication` framework (`LAContext.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)`) with a Keychain item protected by `kSecAccessControlBiometryAny` and `.privateKeyUsage`. Store only a key-wrapping key in the Keychain, not the master password or vault key directly. Handle `LAError.biometryLockout` and `LAError.biometryChanged` (re-require master password when biometric enrollment changes).
- **Android:** Use `BiometricPrompt` API with a `KeyStore`-backed key using `setUserAuthenticationRequired(true)` and `setInvalidatedByBiometricEnrollment(true)`. Store only wrapped key material. Fallback to master password if biometrics are unavailable or invalidated.

In both cases: master password remains the recovery mechanism; biometrics are an unlock convenience only; biometric bypass tests must fail.

**Acceptance criteria:** Biometric unlock works and is optional. Biometric enrollment change invalidates stored key material where platform supports it. Fallback to master password works correctly. No plaintext master password or vault key stored in preferences or logs.

---

### M-05 · High · Native bridge security not defined

**Evidence/Reason:** Capacitor bridge is planned but no plugin allowlist, bridge API surface definition, or bridge security policy was observed.

**Implementation instruction:** Define a minimal, typed native bridge API with exactly the methods the app needs:

- `vaultStorage.read()` / `vaultStorage.write(blob)` / `vaultStorage.delete()`
- `backup.export(encryptedBlob)` / `backup.import()`
- `security.biometricUnlock()` / `security.platformInfo()`
- `managedConfig.get()` (for enterprise MDM)

Forbid: arbitrary file read/write by path, arbitrary URL fetch, shell command execution, dynamic script evaluation, clipboard access without user gesture. Review every Capacitor plugin added to the project against the principle of least privilege. Unit-test each bridge method. Document the bridge API surface in the mobile security model.

**Acceptance criteria:** Bridge methods are documented, typed, and unit-tested. No broad file system access, URL fetch, or command execution exposed through the bridge. Plugin inventory reviewed before release.

---

### M-06 · High · Network lockdown not implemented at platform layer

**Evidence/Reason:** The offline JS deployment policy restricts AI tier, but no platform-level network restrictions were observed. On mobile, JS policy alone is insufficient — the platform must also enforce restrictions.

**Implementation instruction:**

**Android:** Add `res/xml/network_security_config.xml` to the Android project:

```xml
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="false">
        <!-- Add only explicitly required domains -->
    </domain-config>
</network-security-config>
```

Reference it from `AndroidManifest.xml`. Disable cleartext traffic globally. Add `android:networkSecurityConfig` reference.

**iOS:** Configure App Transport Security (ATS) in `Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
    <!-- Add NSExceptionDomains only for explicitly required internal endpoints -->
</dict>
```

`NSAllowsArbitraryLoads` must be `false` in the offline-no-ai profile. ATS exceptions require documented justification and will be reviewed by App Store review.

Add a Capacitor WebView navigation allowlist restricting navigation to `capacitor://`, `localhost`, and any explicitly approved internal endpoints only.

**Acceptance criteria:** External navigation and public API calls fail in the `offline-no-ai` profile. Network interception proxy test (mitmproxy) shows only approved endpoints. Android Network Security Config and iOS ATS configuration reviewed and documented.

---

### M-07 · High · AI mobile plan has unresolved supply-chain and model risk

**Evidence/Reason:** `MOBILE-ROADMAP.md` proposes `@capgo/capacitor-llm` and native AI engines/models. No plugin security review, model provenance documentation, model hash validation, or data boundary definition was observed.

**Implementation instruction:** Before writing any AI mobile code, complete a structured AI supply-chain review:

**Plugin and vendor review:**

- Audit `@capgo/capacitor-llm` (or chosen plugin): source code review, license compatibility, native bridge surface, permissions required, last security update, maintainer history.
- Confirm the plugin does not expose arbitrary file access, URL fetch, or command execution through its bridge surface.

**Model hash pinning:**

- Every model file used on-device must have its SHA-256 hash pinned in the build configuration.
- CI must fail if a model file's hash does not match the pinned value.
- Never load a model file whose hash cannot be verified.

**Model provenance:**

- Document for each model: training data source and license, publisher and publisher verification method, model version and release date, open-weight or proprietary, export control implications.

**Distribution strategy:**

- For enterprise deployments: prefer MDM preload (model distributed via MDM, not downloaded by the app) to avoid in-app download code in the binary. In-app download code expands the attack surface and complicates App Store/Play review.
- For consumer deployments: model download must use HTTPS, verify hash after download, store in app-private storage, and provide user-visible download progress and cancellation.

**On-device inference data boundary:**

- Define exactly what context is passed to the model: which fields, which records, which history.
- Define what the model output can trigger: read-only suggestions, or write actions requiring explicit user confirmation.
- Confirm model inference runs entirely on-device with no network call during inference.
- Define what (if anything) is logged from model inputs/outputs and where those logs are stored.
- Document the data boundary in the AI policy and security model.

**Acceptance criteria:** Plugin/model inventory and risk assessment approved before implementation. Model hashes are pinned in CI. Distribution strategy reviewed by security and legal. Data boundary definition approved. Enterprise MDM preload strategy documented.

---

### M-08 · Medium · App Store / Play compliance not prepared

**Evidence/Reason:** No iOS `PrivacyInfo.xcprivacy`, `Info.plist` permission strings, Android permission audit, or Play Data Safety worksheet was observed.

**Implementation instruction:**

- **iOS:** Create `PrivacyInfo.xcprivacy` declaring all privacy-sensitive APIs used. Add `Info.plist` purpose strings for every permission requested (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, etc.). Declare required reason APIs for any system APIs accessed (file timestamp APIs, disk space APIs, etc.).
- **Android:** Audit `AndroidManifest.xml` permissions to minimum required. Complete Play Data Safety declaration: what data is collected, what is shared, security practices. Add `android:requestLegacyExternalStorage="false"` for Android 10+ compliance.
- Maintain a third-party SDK list with each SDK's data collection behavior.

**Acceptance criteria:** Distribution checklist complete before beta. App Store review and Play review pass without privacy-related rejection. Third-party SDK list maintained in the repo.

---

### M-09 · Medium · No MASVS test plan

**Evidence/Reason:** No mobile security verification evidence was observed.

**Implementation instruction:** Create a MASVS 2.0 checklist covering all applicable controls. Required test cases include: jailbreak/root detection policy decision (detect or document non-detection), device backup behavior (encrypted backup must not appear in iTunes/iCloud/ADB backups in plaintext), WebView JS bridge tests (attempt to call non-exposed bridge methods), network interception tests (proxy with untrusted cert — should fail), reverse engineering risk assessment (code obfuscation policy decision), screenshot protection policy (FLAG_SECURE on Android for sensitive screens if required). Run tests on real devices (not only emulators) before production release.

**Acceptance criteria:** MASVS findings tracked to closure. Real device test matrix documented. Test results stored as release evidence.

---

### M-10 · Medium · No release signing or provenance pipeline

**Evidence/Reason:** Mobile signing is roadmap-only; no Apple Developer account setup, Android keystore management, or signing key controls were observed.

**Implementation instruction:**

- **iOS:** Set up Apple Developer account, create App ID and provisioning profiles, configure Xcode signing (Development and Distribution), set up TestFlight for beta. For enterprise distribution: Apple Business Manager.
- **Android:** Create a release keystore, store securely (not in the repo), configure Gradle signing config, set up Play Console internal test / closed beta tracks.
- **CI:** Configure signing secrets as CI secrets (not environment variables in logs). Generate SBOM and run dependency scan on every release build. Generate SHA-256 of release IPA/APK. Tag releases with build metadata.
- Consider Fastlane for automating signing and distribution workflows.

**Acceptance criteria:** Reproducible signed beta releases with checksums and SBOM. Signing keys stored securely and rotatable. Signing key access is audited.

---

### M-11 · Medium · Mobile accessibility not tested

**Evidence/Reason:** No VoiceOver, TalkBack, dynamic type, or external keyboard test evidence was observed.

**Implementation instruction:** Test on real devices with assistive technology enabled: VoiceOver (iOS) and TalkBack (Android) for primary workflows (unlock, create task, view client, export backup). Test dynamic text sizing at maximum accessibility size setting. Test external keyboard navigation on iPadOS. Verify touch target minimum size (44×44 pt iOS, 48×48 dp Android). Test reduced-motion preference honored. Test focus order is logical in all modals. Fix findings before production release.

**Acceptance criteria:** Primary workflows completable with assistive technology on real devices. Mobile accessibility test report documented.

---

### M-12 · Medium · Enterprise mobile controls missing

**Evidence/Reason:** No SSO, MDM managed configuration, remote session revoke, or offline cache policy was observed.

**Implementation instruction:** For enterprise mobile builds: integrate with enterprise IdP via OIDC (PKCE flow, no implicit flow); read managed app configuration via Capacitor plugin or `AppConfig` (iOS MDM-managed app config dictionary / Android Managed Configurations); implement remote cache wipe triggered by server-side session revoke; define offline cache TTL (how long device-cached data is valid before requiring re-authentication to the enterprise backend); support certificate pinning if enterprise PKI is used (document the rotation process carefully to avoid outages).

**Acceptance criteria:** Admin can revoke mobile session and trigger device cache expiry. Managed configuration allows admin to set API URL, disable export, disable AI, and set cache TTL without app update.

---

### M-13 · High · iOS App Transport Security (ATS) requires explicit configuration _(added)_

**Evidence/Reason:** M-06 addresses Android Network Security Config. iOS has an equivalent, mandatory mechanism: App Transport Security (ATS). Apple requires all iOS apps to use HTTPS and enforces ATS by default; however, apps can opt out with `NSAllowsArbitraryLoads: true`, which is a common shortcut that undermines security. The offline mobile build must configure ATS explicitly and restrictively. The App Store review team scrutinizes ATS exceptions and requires documented justification for any `NSAllowsArbitraryLoads` usage. An ATS misconfiguration can result in App Store rejection or, worse, silent cleartext traffic.

**Implementation instruction:** In the iOS project's `Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <!-- Never set NSAllowsArbitraryLoads to true in production -->
    <key>NSAllowsArbitraryLoads</key>
    <false/>
    <!-- offline-internal-ai profile only: add internal server exceptions -->
    <!--
    <key>NSExceptionDomains</key>
    <dict>
        <key>your-internal-server.local</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <false/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
    </dict>
    -->
</dict>
```

For the `offline-no-ai` and `offline-browser-ai` profiles: `NSAllowsArbitraryLoads` must be `false` with no exception domains. For the `offline-internal-ai` profile: add only explicitly required internal domain exceptions, document each with a justification comment, and submit the App Store justification documentation.

Additionally, configure `WKWebView` navigation with a `WKNavigationDelegate` that rejects navigation to any URL not on the approved allowlist. This provides a second layer of defense inside the WebView.

**Acceptance criteria:** `NSAllowsArbitraryLoads` is `false` in all production configurations. ATS exceptions (if any) are documented and justified for App Store review. A proxy/MITM test confirms no cleartext traffic in the `offline-no-ai` profile. WebView navigation delegate rejects unapproved URLs.

---

## Recommended Mobile Architecture

Keep `packages/core/src` as the shared UI/business logic, but add platform adapters rather than assuming browser APIs behave identically on mobile.

```
packages/core/src/platform/
    storage-adapter.ts          — interface: VaultStorage
    browser-vault-storage.ts    — desktop/offline web implementation
    mobile-vault-storage.ts     — Capacitor native implementation

packages/core/src/platform/
    native-security.ts          — interface: NativeSecurity (biometrics, platform info)
    native-backup.ts            — interface: NativeBackup (export/import)
    managed-config.ts           — interface: ManagedConfig (MDM)

packages/core/src/ai/providers/
    mobile-native.ts            — only after plugin/model security review

apps/mobile/
    capacitor.config.ts
    src/entry.ts                — sets MOBILE_OFFLINE_PROFILE, injects native adapters, calls init()
    ios/
    android/
```

For enterprise mobile: do not make the local vault the source of truth. Use the backend API as source of truth and treat device data as an encrypted offline cache with remote wipe/revocation capability.

---

## Mobile Build Profiles

| Profile                    | Use case                                 | Storage                                                                               | Network / AI                                                                                                  | Distribution                                                                                          |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `mobile-offline-no-ai`     | Highest-assurance local mobile vault.    | Native encrypted vault snapshot + encrypted backup export/import.                     | No public network; no AI; block external navigation via ATS (iOS) + Network Security Config (Android).        | Signed IPA/APK; App Store/Play or MDM.                                                                |
| `mobile-offline-native-ai` | Offline mobile with native on-device AI. | Same as no-AI plus model storage with hash-pinned model files in app-private storage. | Native AI bridge only; no HTTP cloud AI; model hashes verified on load; MDM preload preferred for enterprise. | Requires model license/privacy review, device compatibility matrix, and App Store review of AI usage. |
| `mobile-enterprise`        | Managed enterprise mobile client.        | Encrypted offline cache only; not source of truth. Backend API is authoritative.      | Enterprise API + IdP (OIDC, PKCE) only; MDM managed config; remote wipe/session revoke supported.             | Managed App Store / Google Play / MDM enterprise distribution.                                        |

---

## Mobile Implementation Roadmap

| Phase                            | Implementation steps                                                                                                                                                                                                                                        | Exit criteria                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Capacitor skeleton**       | Add `apps/mobile/capacitor.config.ts`, mobile entry point, iOS/Android platform projects, build scripts, native plugin inventory, profile flags, iOS ATS configuration, Android Network Security Config.                                                    | Hello-world mobile app loads offline CRM UI offline on real iOS and Android devices with profile label visible.                                                     |
| **2 — Native vault storage**     | Build `MobileVaultStorage`: native filesystem read/write of encrypted vault, encrypted backup export/import, restore dry-run, backup status indicator. Decide encrypted SQLite vs. encrypted vault file snapshot.                                           | Vault persists correctly after app restart and device reboot; encrypted backup/import works on real devices; desktop/mobile backup format compatibility documented. |
| **3 — Native unlock**            | Implement biometrics with Keychain/Keystore wrapped key material; master password fallback; biometric enrollment change handling; reauth for sensitive actions; no plaintext secrets in preferences or logs.                                                | Biometric unlock works and fails safely; enrollment change invalidates stored key; fallback to master password works.                                               |
| **4 — Platform lockdown**        | Enforce iOS ATS with `NSAllowsArbitraryLoads: false`; configure Android Network Security Config with `cleartextTrafficPermitted="false"`; restrict WebView navigation; minimize permissions; add iOS privacy manifest; decide screenshot protection policy. | Network/permission test report passes for each profile; MITM proxy test shows only approved endpoints.                                                              |
| **5 — AI mobile decision**       | Before coding: complete plugin/vendor review, model hash pinning plan, model provenance documentation, MDM preload strategy, on-device data boundary definition, legal/privacy review. Implement only if risk accepted.                                     | AI risk assessment and device compatibility matrix approved; model hash pinning plan documented.                                                                    |
| **6 — Verification and release** | MASVS/MASTG tests on real devices, VoiceOver/TalkBack accessibility, iOS App Store privacy manifest and ATS justification, Android Play Data Safety, app signing, SBOM, SCA, release notes, beta distribution.                                              | Signed beta with test evidence, accessibility report, and rollback plan.                                                                                            |

---

## Definition of Done

- Capacitor is implemented as a platform shell with native storage and security adapters, not just a wrapper around the current HTML file.
- The mobile app does not depend on WebView IndexedDB as the only durable copy of vault data.
- Native backup/export/import works on real iOS and Android devices.
- Biometric unlock is bound to platform secure storage (Keychain/Keystore) and has safe fallback/recovery behavior.
- iOS ATS is configured with `NSAllowsArbitraryLoads: false`. Android Network Security Config disables cleartext traffic globally.
- Offline profiles block public network paths at platform (ATS/Network Security Config), WebView navigation, CSP, and app-policy layers.
- The mobile app has MASVS test evidence, app signing, privacy manifests/Data Safety disclosures, and a permission inventory.
- Model hash pinning is in place for any AI model used on-device; model provenance is documented.
- Enterprise mobile uses backend identity and server authorization; local cache is not treated as the authoritative record.

---

## Source Materials Used

| Source                          | How used                                                                                      | URL                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| OWASP ASVS 5.0.0                | Application-security verification baseline for WebView and web core.                          | https://owasp.org/www-project-application-security-verification-standard/                                  |
| OWASP MASVS 2.0 / MASTG         | Primary mobile app security verification baseline.                                            | https://mas.owasp.org/                                                                                     |
| NIST SP 800-207                 | Zero Trust Architecture definition; enterprise mobile client model.                           | https://csrc.nist.gov/pubs/sp/800/207/final                                                                |
| NIST SP 800-63B-4               | Authentication/biometric/passkey/session guidance.                                            | https://csrc.nist.gov/pubs/sp/800/63/b/4/final                                                             |
| NIST SP 800-218 SSDF            | Secure software development for mobile release pipeline.                                      | https://csrc.nist.gov/pubs/sp/800/218/final                                                                |
| NIST SP 800-53 Rev. 5           | Security/privacy control catalog for enterprise mobile.                                       | https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final                                                         |
| FedRAMP 20x                     | Automation-first cloud authorization; applies if enterprise mobile connects to federal cloud. | https://www.fedramp.gov/20x/                                                                               |
| ISO/IEC 27001:2022              | Organization-level ISMS certification standard.                                               | https://www.iso.org/standard/27001                                                                         |
| ISO/IEC 27701:2025              | Privacy information management system standard.                                               | https://www.iso.org/standard/27701                                                                         |
| ISO/IEC 42001:2023              | AI management system standard — applies to mobile AI provider.                                | https://www.iso.org/standard/42001                                                                         |
| SOC 2 / AICPA                   | Service-organization controls assurance.                                                      | https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services        |
| WCAG 2.2                        | Web accessibility recommendation; mobile UI compliance.                                       | https://www.w3.org/TR/WCAG22/                                                                              |
| Apple App Transport Security    | iOS network security configuration requirements.                                              | https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity |
| Apple PrivacyInfo.xcprivacy     | iOS privacy manifest requirements for App Store.                                              | https://developer.apple.com/documentation/bundleresources/privacy-manifest-files                           |
| Android Network Security Config | Android platform-level network restriction configuration.                                     | https://developer.android.com/privacy-and-security/network-security-config                                 |
| CSA Cloud Controls Matrix 4.1   | Cloud security control framework for enterprise mobile.                                       | https://cloudsecurityalliance.org/research/cloud-controls-matrix                                           |
| Capacitor Security Guide        | Capacitor-specific security guidance and plugin model.                                        | https://capacitorjs.com/docs/guides/security                                                               |

---

## Repository Evidence Reviewed

| Evidence area            | Path                                                 | What it proves                                                                                                                                  |
| ------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo / build scripts | `package.json`                                       | Defines `build:offline`, `build:sync`, `build:dataverse`, `build:all`, and `typecheck`. No `build:mobile`.                                      |
| Offline entry            | `apps/offline/src/entry.ts`                          | Sets `OT_ONLY_DEPLOYMENT_POLICY`, sets `NullAdapter`, calls `init()`. Pattern to follow for mobile entry.                                       |
| Offline CSP template     | `apps/offline/index.html`                            | CSP template; model for mobile WebView CSP policy.                                                                                              |
| Deployment policy        | `packages/core/src/deployment-policy.ts`             | Defines AI tier policy; must be extended for mobile profiles.                                                                                   |
| Sync adapter interface   | `packages/core/src/adapter-interface.ts`             | Pull/push/stream/clear interface — used by `NullAdapter`; mobile native adapter must implement same interface.                                  |
| RxDB adapter             | `packages/adapter-rxdb/src/index.ts`                 | TODO stub.                                                                                                                                      |
| Dataverse adapter        | `packages/adapter-dataverse/src/index.ts`            | TODO stub.                                                                                                                                      |
| Crypto                   | `packages/core/src/crypto.ts`, `constants.ts`        | AES-GCM, PBKDF2-HMAC-SHA-256, 600 k iterations, 32-byte salt, 12-byte IV, non-extractable `CryptoKey`.                                          |
| Vault and backup         | `packages/core/src/vault.ts`                         | Encrypted vault load/save, KDF migration, backup import/export. Mobile native adapter must use same vault format.                               |
| Session key              | `packages/core/src/session.ts`                       | Non-extractable `CryptoKey` in IDB with `sessionStorage` sentinel. Mobile must adapt: native secure enclave replaces WebCrypto for key storage. |
| Authentication           | `packages/core/src/auth.ts`                          | Master password unlock, lockout. Mobile extends with native biometric hook.                                                                     |
| TOTP / passkeys          | `packages/core/src/totp.ts`, `mfa.ts`, `webauthn.ts` | WebAuthn PRF requires secure context; not usable as native mobile biometric unlock.                                                             |
| Audit log                | `packages/core/src/audit.ts`                         | Local encrypted audit; mobile must extend to log biometric events and native bridge access.                                                     |
| Sanitization             | `packages/core/src/sanitize.ts`                      | DOMPurify allowlist; applies in mobile WebView.                                                                                                 |
| Trusted Types            | `packages/core/src/trusted-types.ts`                 | Raw policy; applies in mobile WebView; XSS risk same as desktop.                                                                                |
| Mobile roadmap           | `MOBILE-ROADMAP.md`                                  | Describes Capacitor plan, File System Access API absence, native AI bridge intent.                                                              |

---

## Appendix A — Capacitor Implementation Blueprint

Create `apps/mobile` as a first-class build target, not a documentation-only roadmap. The recommended platform adapter structure:

```
apps/mobile/
    capacitor.config.ts          — app ID, web dir, server config, plugin config
    package.json                 — mobile-specific build scripts
    src/entry.ts                 — MOBILE_OFFLINE_PROFILE + native adapters + init()
    ios/                         — Xcode project
        App/PrivacyInfo.xcprivacy
        App/Info.plist           — ATS config, permission strings
    android/                     — Android Gradle project
        app/src/main/res/xml/network_security_config.xml
        app/src/main/AndroidManifest.xml

packages/core/src/platform/
    storage-adapter.ts           — interface: VaultStorage
    browser-vault-storage.ts     — desktop/offline web
    mobile-vault-storage.ts      — Capacitor native filesystem
    native-security.ts           — interface: biometric unlock, platform checks
    native-backup.ts             — interface: export/import via native file picker
    managed-config.ts            — interface: MDM managed app configuration

packages/core/src/ai/providers/
    mobile-native.ts             — only after plugin/model security review approval
```

Treat native bridge methods as privileged. Keep them minimal, typed, audited, and unit-tested. Never expose: arbitrary file access by path, arbitrary URL fetch, shell commands, dynamic script evaluation, or clipboard access without user gesture.

Capacitor plugin allowlist (`capacitor.config.ts`):

```typescript
plugins: {
  // Explicitly list only plugins the app uses
  // Do not import plugins that are not in this list
}
```

---

## Appendix B — Native Mobile Security Controls

| Control                         | iOS implementation                                                                                                                                                   | Android implementation                                                                                                                    | Acceptance criteria                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Secure storage**              | App container + Keychain/Secure Enclave for wrapped key material. Use `Library/Application Support/` (not `Documents/`) for vault files.                             | App-internal storage (`filesDir`) + Android Keystore for wrapped key material. Avoid shared external storage for vault.                   | No plaintext secrets in WebView storage, logs, backups, screenshots, or preferences.                                |
| **Biometrics**                  | `LocalAuthentication` with Keychain item access control; handle biometric enrollment changes (`LAError.biometryChanged` → require master password re-entry).         | `BiometricPrompt` with Keystore key `setInvalidatedByBiometricEnrollment(true)`. Master password fallback.                                | Biometric unlock works; bypass tests fail; enrollment change forces master password.                                |
| **Backup / export**             | `UIDocumentPickerViewController` or `UIActivityViewController` for encrypted `.vault` export. Optional iCloud Backup only if user/admin policy explicitly allows it. | Storage Access Framework (`ACTION_CREATE_DOCUMENT`) for encrypted `.vault`; share intent for portability; managed storage for enterprise. | Encrypted export/import works on real devices; restore dry-run passes; vault not in plaintext in iCloud/ADB backup. |
| **Network lockdown**            | `NSAllowsArbitraryLoads: false` in `Info.plist`; ATS exceptions require documented justification; `WKWebView` navigation delegate allowlist.                         | Network Security Config with `cleartextTrafficPermitted="false"`; Capacitor WebView navigation allowlist.                                 | MITM proxy test shows only approved endpoints reachable in `offline-no-ai` profile.                                 |
| **Permissions**                 | Only request permissions the app actually uses; `PrivacyInfo.xcprivacy` matches behavior; purpose strings accurate.                                                  | Minimal Android permissions; Data Safety declaration matches behavior; no unnecessary runtime permissions.                                | Permission inventory reviewed; store/play submissions pass privacy review.                                          |
| **Screenshots / notifications** | Decide whether sensitive screens require screenshot protection; avoid sensitive push/local notification content.                                                     | Use `FLAG_SECURE` on sensitive Activities if policy requires; avoid sensitive notification content.                                       | Sensitive data not leaked through OS screenshot or notification surfaces per test plan.                             |
| **App integrity**               | Apple Developer signing, distribution profile, App Store review, optional Notarization for Mac Catalyst.                                                             | Keystore/Play signing, release variant build, Play Integrity API if policy requires.                                                      | Signed release artifacts with provenance metadata; CI produces reproducible signed builds.                          |
| **ATS (iOS specific)**          | `NSAllowsArbitraryLoads: false`; no wildcard exception domains; justify any `NSExceptionDomains` entries to App Store.                                               | N/A (covered by Network Security Config).                                                                                                 | App Store review passes ATS scrutiny; no `NSAllowsArbitraryLoads: true` in production builds.                       |

---

## Appendix C — Mobile MASVS-Oriented Test Plan

| MASVS area               | Tests to perform                                                                                                                                                                                         | Expected evidence                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Storage**              | Inspect app sandbox, iCloud/ADB backup, shared storage, logs, WebView localStorage/IndexedDB, Keychain/Keystore entries for plaintext sensitive data.                                                    | No plaintext sensitive data anywhere outside Keychain/Keystore and encrypted vault. |
| **Crypto**               | Key generation entropy, IV uniqueness, key wrapping correctness, biometric enrollment change behavior, backup password handling.                                                                         | Crypto design doc and test results.                                                 |
| **Auth**                 | Master password, TOTP, biometric unlock, lock timeout, app background/foreground transition, device reboot, biometric enrollment change.                                                                 | Auth state transitions, audit events, master password fallback confirmed.           |
| **Network**              | MITM proxy test (untrusted cert), cleartext attempt, external navigation attempt, public endpoint call in `offline-no-ai` profile; ATS enforcement (iOS); Network Security Config enforcement (Android). | Only approved endpoints reachable; ATS/NSC blocks all others.                       |
| **Platform interaction** | Deep links, custom URL schemes, clipboard access, screenshot leakage, notifications, file providers, document import path traversal attempts.                                                            | No unintended data leakage or unsafe file handling.                                 |
| **Code quality**         | SAST, dependency scan, secret scan, SBOM, plugin review, WebView JS bridge surface review.                                                                                                               | Scan reports and plugin risk acceptance documented.                                 |
| **Resilience**           | Rooted/jailbroken device policy decision (detect/document), debug flag check in release build, repackaging detection if required.                                                                        | Release build debug-disabled; policy decision documented.                           |
| **Privacy**              | Permission/data collection audit, Apple privacy manifest accuracy, Play Data Safety accuracy, third-party SDK inventory.                                                                                 | Store submission evidence and privacy documentation.                                |
| **Accessibility**        | VoiceOver/TalkBack, dynamic type at max size, focus order, touch target size (44×44 pt / 48×48 dp), reduced motion, external keyboard (iPadOS).                                                          | Mobile accessibility test report.                                                   |
| **AI (if implemented)**  | Model hash verification on load, model file inspection for plaintext training data, bridge surface test for non-inference calls, data boundary test (what context reaches the model).                    | Model hash verification log, bridge surface review documented.                      |

---

## Appendix D — Mobile Implementation Backlog

| Priority | Backlog item                                                    | Owner skillset             | Done when                                                                                                       |
| -------- | --------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **P0**   | Build real Capacitor mobile target with iOS ATS and Android NSC | Mobile/web engineer        | iOS and Android shells load offline app with profile label on real devices; ATS and NSC configured.             |
| **P0**   | Native vault storage adapter                                    | Mobile/security engineer   | Vault persists; encrypted import/export works on real devices.                                                  |
| **P0**   | Native biometric/key storage                                    | Mobile/security engineer   | Biometric unlock optional, safe, recoverable by master password; no plaintext secrets in storage.               |
| **P0**   | Network restrictions — ATS (iOS) and NSC (Android)              | Mobile engineer            | `offline-no-ai` build cannot reach public endpoints at platform layer; MITM test passes.                        |
| **P1**   | Privacy manifests and Data Safety                               | Mobile/product/privacy     | Store/MDM distribution package has accurate privacy declarations; review passes.                                |
| **P1**   | MASVS test plan and execution                                   | Security tester            | Findings tracked to closure; real device test matrix documented.                                                |
| **P1**   | Mobile backup UX                                                | UX/mobile engineer         | User can export/import/restore-test encrypted backups easily on real devices.                                   |
| **P2**   | Native AI provider                                              | AI/mobile/security         | Only after plugin/model risk review, model hash pinning, data boundary definition, and profile gating approved. |
| **P2**   | MDM managed configuration                                       | Enterprise/mobile engineer | Enterprise admins can set API URL, disable export/AI, set cache TTL without app update.                         |
