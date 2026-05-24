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
// TODO: implement GcpKmsKeyService implements KeyService
//
// TODO: server/src/kms/erasure-workflow.ts
//   DSAR erasure: mark user deleted → suspend new logins → schedule KMS key destruction
//   → record DSAR audit evidence with timestamp, approver, and destruction deadline
//
// TODO: server/src/kms/legal-hold.ts
//   suspend erasure for legal hold; hold is time-bounded; requires named approver
//   LegalHoldActiveError extends Error { holdId: string; approver: string; expiresAt: Date }

// ── Azure Key Vault implementation ────────────────────────────────────────────

import { DefaultAzureCredential } from '@azure/identity'
import { KeyClient, CryptographyClient } from '@azure/keyvault-keys'
import { kmsKeyLifecycle } from '../db/schema/kms-keys.js'
import { withTenant } from '../services/base.js'

export class KeyDestroyedError extends Error {
  constructor(userId: string) {
    super(`KEK for user ${userId} has been destroyed — data is permanently inaccessible`)
    this.name = 'KeyDestroyedError'
  }
}

export class LegalHoldActiveError extends Error {
  constructor(userId: string) {
    super(`Legal hold is active for user ${userId} — erasure is suspended`)
    this.name = 'LegalHoldActiveError'
  }
}

export class AzureKeyVaultKeyService implements KeyService {
  private readonly _keyClient: KeyClient
  private readonly _vaultUrl: string

  constructor(vaultUrl: string) {
    this._vaultUrl = vaultUrl
    const credential = new DefaultAzureCredential()
    this._keyClient = new KeyClient(vaultUrl, credential)
  }

  private _keyName(userId: string): string {
    return `tktaskapp-user-${userId}`
  }

  async issueKey(userId: string, tenantId: string): Promise<KeyHandle> {
    const keyName = this._keyName(userId)
    const key = await this._keyClient.createKey(keyName, 'RSA-HSM', {
      keySize: 4096,
      keyOperations: ['wrapKey', 'unwrapKey'],
    })
    if (!key.id || !key.properties.version) {
      throw new Error('Azure Key Vault did not return key id or version')
    }
    const keyId = key.id
    const keyVersion = key.properties.version
    await withTenant(tenantId, async (tx) => {
      await tx.insert(kmsKeyLifecycle).values({
        orgId: tenantId,
        userId,
        keyVaultUri: keyId,
        keyVersion,
        event: 'ISSUED',
        effectiveAt: new Date(),
      })
    })
    return {
      keyId,
      userId,
      tenantId,
      createdAt: key.properties.createdOn ?? new Date(),
      status: 'active',
    }
  }

  async wrapKey(dek: Uint8Array, kek: KeyHandle): Promise<WrappedKey> {
    if (kek.status === 'destroyed') throw new KeyDestroyedError(kek.userId)
    const credential = new DefaultAzureCredential()
    const cryptoClient = new CryptographyClient(kek.keyId, credential)
    const result = await cryptoClient.wrapKey('RSA-OAEP-256', dek)
    return {
      ciphertext: result.result,
      kmsKeyId: kek.keyId,
      iv: new Uint8Array(0), // Azure KV handles IV internally
      wrappedAt: new Date(),
    }
  }

  async unwrapKey(wrapped: WrappedKey, kek: KeyHandle): Promise<Uint8Array> {
    if (kek.status === 'destroyed') throw new KeyDestroyedError(kek.userId)
    const credential = new DefaultAzureCredential()
    const cryptoClient = new CryptographyClient(wrapped.kmsKeyId, credential)
    const result = await cryptoClient.unwrapKey('RSA-OAEP-256', wrapped.ciphertext)
    return result.result
  }

  async scheduleKeyDestruction(userId: string, tenantId: string, destroyAt: Date): Promise<void> {
    const keyName = this._keyName(userId)
    const key = await this._keyClient.getKey(keyName)
    if (!key.id || !key.properties.version) {
      throw new Error('Key not found in Azure Key Vault')
    }
    const keyId = key.id
    const keyVersion = key.properties.version
    await withTenant(tenantId, async (tx) => {
      await tx.insert(kmsKeyLifecycle).values({
        orgId: tenantId,
        userId,
        keyVaultUri: keyId,
        keyVersion,
        event: 'SCHEDULE_DESTRUCTION',
        effectiveAt: destroyAt,
      })
    })
  }

  async getKeyStatus(userId: string, _tenantId: string): Promise<KeyStatus> {
    try {
      const keyName = this._keyName(userId)
      await this._keyClient.getKey(keyName)
      return 'active'
    } catch {
      return 'destroyed'
    }
  }

  get vaultUrl(): string {
    return this._vaultUrl
  }
}
