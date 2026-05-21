// Mobile vault storage — abstract adapter.
// Concrete implementation uses @capacitor/filesystem to store the AES-256-GCM
// encrypted vault blob in the platform's private app directory:
//   iOS:     Library/Application Support/taskapp-vault/vault.enc
//   Android: filesDir/taskapp-vault/vault.enc
//
// These directories are excluded from iCloud/Google Drive auto-backup by default
// and are inaccessible to other apps (no READ_EXTERNAL_STORAGE required).
// The raw DEK and master password never touch the filesystem — only the encrypted
// vault blob is written.
//
// Phase 8 defines the interface. Concrete Capacitor implementation: Phase 8 device work.
// See: docs/architecture/0004-mobile-storage.md

export interface VaultReadResult {
  data: Uint8Array
  /** ISO 8601 — used to detect stale vaults during conflict resolution. */
  modifiedAt: string
}

export abstract class MobileVaultAdapter {
  /**
   * Read the current encrypted vault blob from native app storage.
   * Returns null if no vault exists yet (first launch).
   */
  abstract readVault(): Promise<VaultReadResult | null>

  /**
   * Atomically write the encrypted vault blob to native storage, replacing any
   * prior content. The caller guarantees `data` is AES-256-GCM ciphertext —
   * this adapter must not inspect or re-encrypt the payload.
   * Implementations should write to a temp file then rename to ensure atomicity.
   */
  abstract writeVault(data: Uint8Array): Promise<void>

  /**
   * Permanently delete the vault from native storage.
   * Called only on user-initiated wipe or GDPR erasure.
   * Does not throw if no vault exists.
   */
  abstract deleteVault(): Promise<void>

  /**
   * Returns true if a vault blob exists in native storage.
   */
  abstract vaultExists(): Promise<boolean>

  /**
   * Return the platform-specific vault directory path for display purposes only.
   * Must not reveal user identity or tenant information in the returned path.
   */
  abstract getVaultDirectory(): string
}
