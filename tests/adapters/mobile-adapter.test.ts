// Mobile adapter contract tests — MASVS 2.0 acceptance requirements.
// Tests marked .todo require physical iOS/Android hardware or OS-level access.
// See docs/architecture/0004-mobile-storage.md for the full design.

import { describe, it, expect } from 'vitest'
import {
  MockMobileVaultAdapter,
  MockMobileBackupAdapter,
  MockBiometricUnlockAdapter,
} from './mock-mobile-adapters.js'

describe('MobileVaultAdapter — vault persistence (MASVS-STORAGE-1)', () => {
  it('readVault() returns null on first launch (no vault written yet)', async () => {
    const adapter = new MockMobileVaultAdapter()
    const result = await adapter.readVault()
    expect(result).toBeNull()
  })

  it('writeVault() + readVault() round-trips the encrypted blob without modification', async () => {
    const adapter = new MockMobileVaultAdapter()
    const blob = new Uint8Array([1, 2, 3, 4, 5])
    await adapter.writeVault(blob)
    const result = await adapter.readVault()
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(blob)
    expect(result!.modifiedAt).toBeTruthy()
    // readVault must return a copy, not a reference to the internal buffer
    result!.data[0] = 99
    const result2 = await adapter.readVault()
    expect(result2!.data[0]).toBe(1)
  })

  it.todo('writeVault() is atomic — a crash mid-write leaves the previous vault intact')

  it('vaultExists() returns false before first write and true after', async () => {
    const adapter = new MockMobileVaultAdapter()
    expect(await adapter.vaultExists()).toBe(false)
    await adapter.writeVault(new Uint8Array([0xde, 0xad]))
    expect(await adapter.vaultExists()).toBe(true)
  })

  it('deleteVault() removes the vault; subsequent readVault() returns null', async () => {
    const adapter = new MockMobileVaultAdapter()
    await adapter.writeVault(new Uint8Array([1, 2, 3]))
    expect(await adapter.vaultExists()).toBe(true)
    await adapter.deleteVault()
    expect(await adapter.vaultExists()).toBe(false)
    expect(await adapter.readVault()).toBeNull()
  })

  it.todo(
    'vault file is in the platform private directory and not world-readable (iOS: Library/Application Support, Android: filesDir)',
  )

  it.todo('vault file is not accessible to other apps (confirmed via adb / Xcode Organizer)')
})

describe('MobileBackupAdapter — backup/export/import round-trip', () => {
  it.todo('exportVault() presents the platform share sheet without throwing on user cancellation')

  it('importVault() + writeVault() round-trips: imported blob decrypts to original data', async () => {
    const adapter = new MockMobileVaultAdapter()
    const backupAdapter = new MockMobileBackupAdapter()
    const original = new Uint8Array([10, 20, 30])
    backupAdapter.setNextImportResult({
      data: original,
      filename: 'backup-2026-01-01.vault',
      importedAt: new Date().toISOString(),
    })
    const imported = await backupAdapter.importVault()
    expect(imported).not.toBeNull()
    await adapter.writeVault(imported!.data)
    const readBack = await adapter.readVault()
    expect(readBack!.data).toEqual(original)
  })

  it('dryRunImport() returns correct schemaVersion and recordCounts without modifying live vault', async () => {
    const adapter = new MockMobileVaultAdapter()
    await adapter.writeVault(new Uint8Array([0xff]))
    const backupAdapter = new MockMobileBackupAdapter()
    const fakeVaultJson = JSON.stringify({ v: 2, salt: 'abc', verify: 'def', vault: 'ghi' })
    const result = await backupAdapter.dryRunImport(new TextEncoder().encode(fakeVaultJson))
    expect(result.schemaVersion).toBe(2)
    expect(result.recordCounts).toBeDefined()
    // live vault must be unchanged
    const liveVault = await adapter.readVault()
    expect(liveVault!.data[0]).toBe(0xff)
  })

  it('dryRunImport() throws on a corrupted or non-vault blob', async () => {
    const backupAdapter = new MockMobileBackupAdapter()
    // empty blob
    await expect(backupAdapter.dryRunImport(new Uint8Array())).rejects.toThrow()
    // random non-JSON bytes
    await expect(
      backupAdapter.dryRunImport(new Uint8Array([0xde, 0xad, 0xbe, 0xef])),
    ).rejects.toThrow()
    // valid JSON but missing vault fields
    await expect(
      backupAdapter.dryRunImport(new TextEncoder().encode('{"foo":"bar"}')),
    ).rejects.toThrow()
  })

  it.todo(
    'exportAuditLog() produces a file that is parseable as CSV or JSONL and contains no key material',
  )

  it.todo(
    'backup file exported on iOS is importable on Android (cross-platform format compatibility)',
  )
})

describe('BiometricUnlockAdapter — secure enclave / Keystore (MASVS-AUTH-1)', () => {
  it('isAvailable() returns { available: true, enrolled: true } on a device with enrolled biometrics', async () => {
    const adapter = new MockBiometricUnlockAdapter({
      available: true,
      enrolled: true,
      biometricType: 'faceId',
    })
    const result = await adapter.isAvailable()
    expect(result.available).toBe(true)
    expect(result.enrolled).toBe(true)
    expect(result.biometricType).toBe('faceId')
    expect(typeof result.reason).toSatisfy((v: unknown) => v === undefined || typeof v === 'string')
  })

  it('isAvailable() returns { available: false } on a simulator without biometric hardware', async () => {
    const adapter = new MockBiometricUnlockAdapter({
      available: false,
      enrolled: false,
      biometricType: 'none',
    })
    const result = await adapter.isAvailable()
    expect(result.available).toBe(false)
    expect(result.enrolled).toBe(false)
    expect(result.biometricType).toBe('none')
  })

  it('storeWrappedKey() + retrieveWrappedKey() round-trips the wrapped key after biometric success', async () => {
    const adapter = new MockBiometricUnlockAdapter()
    const key = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])
    await adapter.storeWrappedKey(key)
    const retrieved = await adapter.retrieveWrappedKey({ title: 'Unlock' })
    expect(retrieved).toEqual(key)
    // Retrieved must be a copy, not a reference
    retrieved[0] = 0xff
    const retrieved2 = await adapter.retrieveWrappedKey({ title: 'Unlock' })
    expect(retrieved2[0]).toBe(0xaa)
  })

  it.todo('retrieveWrappedKey() throws when biometric authentication is cancelled by the user')

  it.todo('retrieveWrappedKey() throws when biometric authentication fails (wrong biometric)')

  it('deleteWrappedKey() removes the stored key; hasStoredKey() returns false after deletion', async () => {
    const adapter = new MockBiometricUnlockAdapter()
    await adapter.storeWrappedKey(new Uint8Array([1, 2, 3]))
    expect(await adapter.hasStoredKey()).toBe(true)
    await adapter.deleteWrappedKey()
    expect(await adapter.hasStoredKey()).toBe(false)
    await expect(adapter.retrieveWrappedKey({ title: 'Unlock' })).rejects.toThrow()
  })

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
