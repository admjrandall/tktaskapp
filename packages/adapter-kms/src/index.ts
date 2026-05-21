// ── KMS ADAPTER INTERFACE ───────────────────────────────────────────────────
// Abstraction over Azure Key Vault, AWS KMS, HashiCorp Vault, or any
// BYOK-compatible key management service.
//
// Crypto-shredding model (GDPR Article 17):
//   Each user gets a unique Key Encryption Key (KEK) held by the KMS.
//   Every data blob is encrypted with a per-record Data Encryption Key (DEK).
//   DEKs are wrapped (encrypted) by the user's KEK before storage.
//   To erase a user's data, destroy the KEK — all wrapped DEKs become
//   permanently unreadable without touching the ciphertext itself.
//
// Phase 9 provides concrete implementations (server/src/kms/key-service.ts).
// This file defines the contract only.

// ── Types ────────────────────────────────────────────────────────────────────

/** Opaque reference to a KEK held in the KMS. Never contains raw key material. */
export interface KeyHandle {
  /** KMS-assigned unique identifier for this key. */
  keyId: string
  /** The user this KEK belongs to. */
  userId: string
  /** ISO 8601 timestamp when the key was issued. */
  issuedAt: string
  /** KMS provider hint (e.g. 'azure-kv', 'aws-kms', 'hashicorp-vault'). */
  provider: string
}

/** A DEK encrypted (wrapped) by a KEK. Safe to store alongside ciphertext. */
export interface WrappedKey {
  /** ID of the KEK used to wrap this DEK. */
  keyId: string
  /** Base64url-encoded wrapped key ciphertext. */
  wrappedKeyMaterial: string
  /** Key-wrapping algorithm used (matches SubtleCrypto importKey algorithm). */
  algorithm: 'AES-KW' | 'RSA-OAEP'
}

/** Lifecycle state of a KEK. */
export interface KeyStatus {
  keyId: string
  userId: string
  status: 'active' | 'scheduled_for_destruction' | 'destroyed'
  issuedAt: string
  lastUsedAt: string | null
  /** Set when scheduleKeyDestruction() has been called. */
  scheduledDestroyAt: string | null
  /** Set when the key has been destroyed (crypto-shredded). */
  destroyedAt: string | null
  /** Audit metadata for DSAR evidence. */
  auditTrail: Array<{
    event: 'issued' | 'used' | 'destruction_scheduled' | 'destroyed'
    ts: string
    actor: string
  }>
}

// ── KmsAdapter abstract class ─────────────────────────────────────────────────

export abstract class KmsAdapter {
  /**
   * Issue a new Key Encryption Key (KEK) for the given user.
   * Each user gets exactly one active KEK at a time.
   * The raw key material never leaves the KMS boundary.
   */
  abstract issueKey(userId: string): Promise<KeyHandle>

  /**
   * Wrap (encrypt) a Data Encryption Key with the user's KEK.
   * The DEK is encrypted inside the KMS; only the ciphertext is returned.
   * The raw DEK is never stored or logged.
   */
  abstract wrapKey(dek: CryptoKey, kek: KeyHandle): Promise<WrappedKey>

  /**
   * Unwrap (decrypt) a wrapped DEK using the user's KEK.
   * Throws if the key has been destroyed (GDPR erasure in effect).
   * The returned CryptoKey is non-extractable.
   */
  abstract unwrapKey(wrapped: WrappedKey, kek: KeyHandle): Promise<CryptoKey>

  /**
   * Schedule the user's KEK for destruction at the given time.
   * After destroyAt, all wrapKey/unwrapKey calls for this user will reject,
   * making all data encrypted under this KEK permanently unreadable.
   * This constitutes erasure under GDPR Article 17 without touching ciphertext.
   */
  abstract scheduleKeyDestruction(userId: string, destroyAt: Date): Promise<void>

  /**
   * Return the current lifecycle status of the user's KEK, including
   * the full audit trail required for DSAR evidence.
   */
  abstract getKeyStatus(userId: string): Promise<KeyStatus>
}
