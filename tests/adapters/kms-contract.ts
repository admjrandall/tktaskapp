// KmsAdapter contract — stub tests.
// All tests are marked .todo until KmsAdapter is implemented (Phase 9+).
// See packages/adapter-kms/README.md for the crypto-shredding design and
// the DEK/KEK hierarchy that makes GDPR Article 17 erasure possible.

import { describe, it } from 'vitest'

describe('KmsAdapter — key lifecycle contract', () => {
  it.todo('issueKey(userId) resolves with a KeyHandle containing a non-empty keyId')

  it.todo('issueKey(userId) issues a distinct key for each user (no shared keys)')

  it.todo(
    'wrapKey(dek, kek) returns an opaque WrappedKey that cannot be used directly as a CryptoKey',
  )

  it.todo('unwrapKey(wrapped, kek) returns the original CryptoKey after wrap/unwrap round-trip')

  it.todo('unwrapKey(wrapped, wrongKek) rejects with an error (key mismatch)')
})

describe('KmsAdapter — key destruction (GDPR Article 17)', () => {
  it.todo('scheduleKeyDestruction(userId, destroyAt) resolves without throwing')

  it.todo('getKeyStatus(userId) returns { status: "scheduled_for_destruction" } after scheduling')

  it.todo('getKeyStatus(userId) returns { status: "destroyed" } after destroyAt has passed')

  it.todo('unwrapKey after destruction rejects — data is cryptographically unreadable')

  it.todo('a vault blob encrypted with a destroyed key cannot be decrypted (crypto-shredding)')

  it.todo('backup copy of vault blob is also unreadable after key destruction')
})

describe('KmsAdapter — DSAR (Data Subject Access Request) workflow', () => {
  it.todo('getKeyStatus returns audit metadata: issuedAt, lastUsedAt, destroyedAt')

  it.todo('scheduleKeyDestruction emits an auditable event with userId and destroyAt')

  it.todo('the audit trail for a key lifecycle is complete: issue → use → schedule → destroy')
})
