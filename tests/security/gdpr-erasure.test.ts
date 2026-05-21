// GDPR Article 17 erasure via crypto-shredding — contract tests.
// All tests are marked .todo until KmsAdapter is implemented (Phase 9+).
// See docs/architecture/0006-gdpr-crypto-shredding.md for the full design.

import { describe, it } from 'vitest'

describe('GDPR crypto-shredding — key destruction makes data unreadable', () => {
  it.todo('vault ciphertext encrypted under a destroyed KEK cannot be decrypted')

  it.todo('unwrapKey() rejects after scheduleKeyDestruction() destroyAt has passed')

  it.todo('wrapKey() rejects after key destruction (no new data can be encrypted for erased user)')

  it.todo('getKeyStatus() returns { status: "destroyed" } after destroyAt')
})

describe('GDPR crypto-shredding — backup copy unreadability', () => {
  it.todo('a .vault backup file exported before key destruction is unreadable after destruction')

  it.todo('a cold-storage copy of the IDB dump is unreadable after key destruction')

  it.todo('all WrappedKey records for the destroyed userId are permanently unusable')
})

describe('GDPR crypto-shredding — DSAR evidence auditability', () => {
  it.todo('getKeyStatus() auditTrail contains an "issued" event with correct timestamp')

  it.todo(
    'getKeyStatus() auditTrail contains a "destruction_scheduled" event after scheduleKeyDestruction()',
  )

  it.todo('getKeyStatus() auditTrail contains a "destroyed" event after destroyAt')

  it.todo(
    'the destruction receipt timestamp satisfies the 30-day GDPR Art. 12(3) deadline from the erasure request',
  )

  it.todo(
    'DSAR audit trail contains no personal data (only userId pseudonym, timestamps, and event types)',
  )
})
