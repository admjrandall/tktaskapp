// Mobile backup and export adapter — abstract.
// Uses the platform's native document picker / share sheet so the user controls
// where encrypted backup files are stored. The exported .vault format is identical
// to the desktop backup — the same encrypted blob, same header, same schema version —
// so backups are interchangeable between platforms.
//
//   iOS:     UIDocumentPickerViewController / UIActivityViewController
//   Android: Storage Access Framework (ACTION_CREATE_DOCUMENT / ACTION_OPEN_DOCUMENT)
//
// No plaintext data is ever written to disk or passed to the share sheet.
// The dry-run import must not modify live vault state.

export interface BackupImportResult {
  data: Uint8Array
  filename: string
  /** ISO 8601 — timestamp of the file as reported by the platform file picker. */
  importedAt: string
}

export interface DryRunResult {
  schemaVersion: number
  recordCounts: Record<string, number>
  /** ISO 8601 — vault creation date embedded in the blob header. */
  vaultCreatedAt: string
}

export abstract class MobileBackupAdapter {
  /**
   * Present the platform share/export sheet with the encrypted vault blob as a
   * .vault attachment. The suggested filename should include an ISO date suffix.
   * Throws if the user cancels (on iOS, cancellation is not an error — catch and
   * treat as user intent).
   */
  abstract exportVault(data: Uint8Array, suggestedFilename: string): Promise<void>

  /**
   * Present the platform file picker filtered to .vault files.
   * Returns null if the user cancels without selecting a file.
   * The caller must verify the result is a valid vault before attempting decryption.
   */
  abstract importVault(): Promise<BackupImportResult | null>

  /**
   * Parse and validate the backup blob without modifying any live vault state.
   * Returns header metadata (schema version, record counts, creation date).
   * Throws if the blob is not a recognisable vault format.
   */
  abstract dryRunImport(data: Uint8Array): Promise<DryRunResult>

  /**
   * Present the share sheet with the audit log export (CSV or JSONL).
   * Audit logs contain no key material; the exported file is not encrypted.
   */
  abstract exportAuditLog(data: Uint8Array, suggestedFilename: string): Promise<void>
}
