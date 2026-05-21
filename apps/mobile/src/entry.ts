// Mobile entry point — offline-mobile profile.
//
// Wiring order (Phase 8 implementation target):
//
//   1. assertNetworkPolicyCompliant(OFFLINE_MOBILE_NETWORK_POLICY)
//      Verify platform network lockdown before any other code runs.
//
//   2. setDeploymentPolicy(MOBILE_OFFLINE_PROFILE.policy)
//      allowedTiers: ['browser'] — on-device AI only; no cloud, no Ollama.
//
//   3. setAdapter(new NullAdapter())
//      Offline-only; no sync. NullAdapter discards all pull/push payloads.
//
//   4. setStorageAdapter(new MobileNativeVaultAdapter())
//      Capacitor Filesystem plugin: reads/writes encrypted vault to
//      iOS Library/Application Support/ or Android filesDir.
//      See: packages/adapter-mobile-native/src/mobile-vault-adapter.ts
//
//   5. setNativeSecurityAdapter(new NativeBiometricAdapter())
//      Keychain (iOS) / Keystore (Android) backed biometric unlock.
//      Stores only the wrapped master key — never the raw password.
//      See: packages/adapter-mobile-native/src/biometric-unlock-adapter.ts
//
//   6. init()
//      Runs migrations, unlocks vault, renders UI.
//
// Acceptance criteria (MASVS 2.0):
//   - MASVS-STORAGE-1: vault in platform private directory; not world-readable
//   - MASVS-STORAGE-2: no sensitive data in SharedPreferences / UserDefaults
//   - MASVS-CRYPTO-1: AES-256-GCM; PBKDF2-HMAC-SHA-256 at 600k iterations
//   - MASVS-AUTH-1:   biometric key invalidated on enrollment change (Android)
//   - MASVS-NETWORK-1: no cleartext traffic; ATS / NSC enforced
//   - MASVS-PLATFORM-1: no broad JavaScript bridge exposure
//
// Prerequisites before this entry is wired to a real build:
//   - config/build-profiles/mobile-offline.profile.ts (Phase 1)
//   - Concrete MobileNativeVaultAdapter using @capacitor/filesystem (Phase 8 device)
//   - Concrete NativeBiometricAdapter using @capacitor/biometrics (Phase 8 device)
//
// This file is a documented design stub. Do not import before prerequisites exist.

export {}
