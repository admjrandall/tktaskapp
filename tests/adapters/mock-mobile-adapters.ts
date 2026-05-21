// Shared in-memory mock adapters for mobile adapter contract tests.
// Implements the abstract interfaces from packages/adapter-mobile-native using
// in-memory state only — no Capacitor, no filesystem, no native APIs.
// Follow the same pattern as tests/adapters/kms-mock.ts.

import {
  MobileVaultAdapter,
  MobileBackupAdapter,
  BiometricUnlockAdapter,
  type VaultReadResult,
  type BackupImportResult,
  type DryRunResult,
  type BiometricAvailability,
  type BiometricPromptOptions,
  type BiometricType,
} from '../../packages/adapter-mobile-native/src/index.js'

// ---------------------------------------------------------------------------
// MockMobileVaultAdapter
// ---------------------------------------------------------------------------

export class MockMobileVaultAdapter extends MobileVaultAdapter {
  private _blob: Uint8Array | null = null

  async readVault(): Promise<VaultReadResult | null> {
    if (this._blob === null) return null
    return { data: new Uint8Array(this._blob), modifiedAt: new Date().toISOString() }
  }

  async writeVault(data: Uint8Array): Promise<void> {
    this._blob = new Uint8Array(data)
  }

  async deleteVault(): Promise<void> {
    this._blob = null
  }

  async vaultExists(): Promise<boolean> {
    return this._blob !== null
  }

  getVaultDirectory(): string {
    return 'mock://taskapp-vault'
  }
}

// ---------------------------------------------------------------------------
// MockMobileBackupAdapter
// ---------------------------------------------------------------------------

export class MockMobileBackupAdapter extends MobileBackupAdapter {
  private _exports: Array<{ data: Uint8Array; filename: string }> = []
  private _importResult: BackupImportResult | null = null

  async exportVault(data: Uint8Array, suggestedFilename: string): Promise<void> {
    this._exports.push({ data: new Uint8Array(data), filename: suggestedFilename })
  }

  async importVault(): Promise<BackupImportResult | null> {
    return this._importResult
  }

  async exportAuditLog(data: Uint8Array, suggestedFilename: string): Promise<void> {
    this._exports.push({ data: new Uint8Array(data), filename: suggestedFilename })
  }

  async dryRunImport(data: Uint8Array): Promise<DryRunResult> {
    if (data.length === 0) throw new Error('empty blob')
    let parsed: unknown
    try {
      const text = new TextDecoder().decode(data)
      parsed = JSON.parse(text)
    } catch {
      throw new Error('not a vault blob')
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('v' in parsed) ||
      !('vault' in parsed) ||
      !('salt' in parsed) ||
      !('verify' in parsed)
    ) {
      throw new Error('missing required vault fields')
    }
    return {
      schemaVersion: Number((parsed as Record<string, unknown>).v) || 2,
      recordCounts: {},
      vaultCreatedAt: new Date().toISOString(),
    }
  }

  /** Set the result returned by the next importVault() call. */
  setNextImportResult(r: BackupImportResult | null): void {
    this._importResult = r
  }
}

// ---------------------------------------------------------------------------
// MockBiometricUnlockAdapter
// ---------------------------------------------------------------------------

export class MockBiometricUnlockAdapter extends BiometricUnlockAdapter {
  private _storedKey: Uint8Array | null = null
  private _availability: BiometricAvailability
  private _authShouldFail: boolean = false

  constructor(opts?: { available?: boolean; enrolled?: boolean; biometricType?: BiometricType }) {
    super()
    this._availability = {
      available: opts?.available ?? true,
      enrolled: opts?.enrolled ?? true,
      biometricType: opts?.biometricType ?? 'faceId',
    }
  }

  async isAvailable(): Promise<BiometricAvailability> {
    return this._availability
  }

  async storeWrappedKey(wrappedKey: Uint8Array): Promise<void> {
    this._storedKey = new Uint8Array(wrappedKey)
  }

  async retrieveWrappedKey(_prompt: BiometricPromptOptions): Promise<Uint8Array> {
    if (this._authShouldFail) throw new Error('biometric authentication failed')
    if (!this._storedKey) throw new Error('no key stored')
    return new Uint8Array(this._storedKey)
  }

  async deleteWrappedKey(): Promise<void> {
    this._storedKey = null
  }

  async hasStoredKey(): Promise<boolean> {
    return this._storedKey !== null
  }

  /** Control whether the next retrieveWrappedKey() call simulates auth failure. */
  setAuthShouldFail(fail: boolean): void {
    this._authShouldFail = fail
  }
}
