// Mobile adapter contract tests — MASVS 2.0 acceptance requirements.
// All tests are marked .todo until concrete Capacitor implementations exist
// and can be executed on real iOS and Android devices.
// See docs/architecture/0004-mobile-storage.md for the full design.

import { describe, it, expect } from 'vitest'

describe('MobileVaultAdapter — vault persistence (MASVS-STORAGE-1)', () => {
  it.todo('readVault() returns null on first launch (no vault written yet)')

  it.todo('writeVault() + readVault() round-trips the encrypted blob without modification')

  it.todo('writeVault() is atomic — a crash mid-write leaves the previous vault intact')

  it.todo('vaultExists() returns false before first write and true after')

  it.todo('deleteVault() removes the vault; subsequent readVault() returns null')

  it.todo(
    'vault file is in the platform private directory and not world-readable (iOS: Library/Application Support, Android: filesDir)',
  )

  it.todo('vault file is not accessible to other apps (confirmed via adb / Xcode Organizer)')
})

describe('MobileBackupAdapter — backup/export/import round-trip', () => {
  it.todo('exportVault() presents the platform share sheet without throwing on user cancellation')

  it.todo('importVault() + writeVault() round-trips: imported blob decrypts to original data')

  it.todo(
    'dryRunImport() returns correct schemaVersion and recordCounts without modifying live vault',
  )

  it.todo('dryRunImport() throws on a corrupted or non-vault blob')

  it.todo(
    'exportAuditLog() produces a file that is parseable as CSV or JSONL and contains no key material',
  )

  it.todo(
    'backup file exported on iOS is importable on Android (cross-platform format compatibility)',
  )
})

describe('BiometricUnlockAdapter — secure enclave / Keystore (MASVS-AUTH-1)', () => {
  it.todo(
    'isAvailable() returns { available: true, enrolled: true } on a device with enrolled biometrics',
  )

  it.todo('isAvailable() returns { available: false } on a simulator without biometric hardware')

  it.todo(
    'storeWrappedKey() + retrieveWrappedKey() round-trips the wrapped key after biometric success',
  )

  it.todo('retrieveWrappedKey() throws when biometric authentication is cancelled by the user')

  it.todo('retrieveWrappedKey() throws when biometric authentication fails (wrong biometric)')

  it.todo('deleteWrappedKey() removes the stored key; hasStoredKey() returns false after deletion')

  it.todo(
    'Android: retrieveWrappedKey() throws KeyPermanentlyInvalidatedException after biometric enrollment change',
  )

  it.todo(
    'no raw master password or CryptoKey material appears in Keychain / Keystore — only wrapped key bytes',
  )
})

describe('Network policy — cleartext traffic prohibited (MASVS-NETWORK-1)', () => {
  it.todo('MITM proxy test (iOS): no cleartext HTTP connections in any offline-profile flow')

  it.todo('MITM proxy test (Android): no cleartext HTTP connections; proxy certificate is rejected')

  it.todo('iOS Info.plist NSAllowsArbitraryLoads is false in the release IPA')

  it.todo(
    'Android network_security_config.xml cleartextTrafficPermitted is false in the release APK',
  )
})

describe('Network policy — isNavigationAllowed() unit tests', () => {
  it('blocks cleartext HTTP navigation regardless of policy', async () => {
    const { isNavigationAllowed, OFFLINE_MOBILE_NETWORK_POLICY } =
      await import('../../packages/adapter-mobile-native/src/network-policy.js')
    const result = isNavigationAllowed('http://example.com', OFFLINE_MOBILE_NETWORK_POLICY)
    expect(result).toBe(false)
  })

  it('blocks all external navigation when blockExternalRequests is true', async () => {
    const { isNavigationAllowed, OFFLINE_MOBILE_NETWORK_POLICY } =
      await import('../../packages/adapter-mobile-native/src/network-policy.js')
    const result = isNavigationAllowed('https://example.com', OFFLINE_MOBILE_NETWORK_POLICY)
    expect(result).toBe(false)
  })

  it('rejects a malformed URL without throwing', async () => {
    const { isNavigationAllowed, OFFLINE_MOBILE_NETWORK_POLICY } =
      await import('../../packages/adapter-mobile-native/src/network-policy.js')
    expect(() => isNavigationAllowed('not-a-url', OFFLINE_MOBILE_NETWORK_POLICY)).not.toThrow()
    expect(isNavigationAllowed('not-a-url', OFFLINE_MOBILE_NETWORK_POLICY)).toBe(false)
  })

  it('assertNetworkPolicyCompliant() does not throw for a valid compliant policy', async () => {
    const { assertNetworkPolicyCompliant, OFFLINE_MOBILE_NETWORK_POLICY } =
      await import('../../packages/adapter-mobile-native/src/network-policy.js')
    expect(() => assertNetworkPolicyCompliant(OFFLINE_MOBILE_NETWORK_POLICY)).not.toThrow()
  })
})

describe('MASVS-PLATFORM-1 — JavaScript bridge exposure', () => {
  it.todo('only explicitly declared Capacitor plugins are registered — no wildcard bridge exposure')

  it.todo(
    'Capacitor plugin inputs are validated before processing (no blind trust of bridge strings)',
  )
})
