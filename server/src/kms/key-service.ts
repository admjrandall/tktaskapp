// KMS key service — interface stub.
// TODO: Implement when a server-side KMS is available and its DPA has been reviewed.
//   Acceptable KMS implementations: AWS KMS, Azure Key Vault, GCP KMS, or self-hosted HSM.
//
// Section 11.3 — GDPR crypto-shredding: per-user KMS key architecture
//
// GDPR Article 17 — right to erasure:
//   "Deleting" an enterprise user means scheduling the KMS Key Encryption Key (KEK)
//   for destruction. The encrypted data blobs remain in storage but are permanently
//   unreadable once the KEK is destroyed — equivalent to physical erasure under
//   EU DPA guidance (EDPB 2026 enforcement priority, Article 17).
//
//   This architecture is non-optional. Without per-user KMS keys, GDPR Article 17
//   erasure is operationally impossible for systems with encrypted backups.
//
// Per-user key hierarchy:
//   KMS Root Key (HSM-protected, never leaves KMS boundary)
//     └── Per-user KEK  (managed by KMS; destruction = erasure event)
//           └── Per-user DEK  (AES-256-GCM; wrapped by KEK; stored in DB)
//                 └── Encrypted record data
//
// Legal hold:
//   Erasure must be suspendable for active legal holds.
//   Legal holds are time-bounded and require a named approver before blocking destruction.
//   See: server/src/kms/legal-hold.ts (TODO — Phase 9 stub; Phase 11+ implementation)
//
// Backup copies:
//   Encrypted backup blobs remain permanently unreadable after KMS key destruction.
//   This satisfies Article 17 even for systems that cannot physically delete backup tapes.
//   EU DPA acceptance: EDPB endorsed this approach in its 2025 guidance on Article 17.

export type KeyStatus =
  | 'active'
  | 'scheduled-for-destruction'
  | 'destroyed'
  | 'suspended-legal-hold'

export interface KeyHandle {
  /** Opaque KMS key reference — never the raw key material. */
  readonly keyId: string
  readonly userId: string
  readonly tenantId: string
  readonly createdAt: Date
  readonly status: KeyStatus
  /** ISO 8601 — set when status is 'scheduled-for-destruction'. */
  readonly scheduledDestroyAt?: Date
  /** Name of the person who approved a legal hold suspension, if applicable. */
  readonly legalHoldApprover?: string
}

export interface WrappedKey {
  /**
   * AES-256-GCM ciphertext of the DEK — produced by the KMS wrapping the raw DEK bytes.
   * Stored in the server database alongside the KMS key ID.
   */
  readonly ciphertext: Uint8Array
  /** KMS key ID used for wrapping — stored to identify which KEK to use on unwrap. */
  readonly kmsKeyId: string
  /** GCM IV/nonce used in the wrapping operation. 96-bit (12 bytes). */
  readonly iv: Uint8Array
  readonly wrappedAt: Date
}

export interface KeyService {
  /**
   * Issue a new KMS-managed KEK for the given user.
   * Called on: new user account creation, post-erasure re-enrollment.
   * The raw key never leaves the KMS boundary.
   */
  issueKey(userId: string, tenantId: string): Promise<KeyHandle>

  /**
   * Wrap a Data Encryption Key (DEK) using the user's KMS-managed KEK.
   * The caller provides the raw DEK bytes; the KMS returns ciphertext.
   * The caller MUST zero the raw DEK from memory after this call completes.
   * Throws if the KEK is in 'scheduled-for-destruction' or 'destroyed' status.
   */
  wrapKey(dek: Uint8Array, kek: KeyHandle): Promise<WrappedKey>

  /**
   * Unwrap a DEK using the user's KMS-managed KEK.
   * Returns raw DEK bytes — the caller MUST zero the bytes from memory after use.
   * Throws KeyDestroyedError if the KEK is in 'destroyed' status.
   * Throws KeyScheduledForDestructionError if the KEK is 'scheduled-for-destruction'
   * and the grace period has not yet passed (implementation may allow or deny — document).
   */
  unwrapKey(wrapped: WrappedKey, kek: KeyHandle): Promise<Uint8Array>

  /**
   * Schedule irreversible KMS key destruction for GDPR Article 17 erasure.
   * After destroyAt passes, all data encrypted under this key is permanently unreadable.
   *
   * Throws LegalHoldActiveError if a legal hold is currently active for this user.
   * The caller must resolve the hold before erasure can proceed.
   */
  scheduleKeyDestruction(userId: string, tenantId: string, destroyAt: Date): Promise<void>

  /**
   * Return the current status and metadata of the user's KMS key.
   * Used by: DSAR erasure workflow, audit evidence generation, erasure confirmation.
   */
  getKeyStatus(userId: string, tenantId: string): Promise<KeyStatus>
}

// TODO: implement AwsKmsKeyService implements KeyService
// TODO: implement AzureKeyVaultKeyService implements KeyService
// TODO: implement GcpKmsKeyService implements KeyService
//
// TODO: server/src/kms/erasure-workflow.ts
//   DSAR erasure: mark user deleted → suspend new logins → schedule KMS key destruction
//   → record DSAR audit evidence with timestamp, approver, and destruction deadline
//
// TODO: server/src/kms/legal-hold.ts
//   suspend erasure for legal hold; hold is time-bounded; requires named approver
//   LegalHoldActiveError extends Error { holdId: string; approver: string; expiresAt: Date }
