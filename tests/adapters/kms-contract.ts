// KmsAdapter contract suite — verifies the behavioural guarantees of any
// KmsAdapter implementation.  Uses MockKmsAdapter (in-memory, real WebCrypto).
// Run with: pnpm test (vitest picks up tests/**/*.ts)

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MockKmsAdapter } from './kms-mock.js'

vi.useFakeTimers()

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z')

beforeEach(() => {
  vi.setSystemTime(BASE_TIME)
})

describe('KmsAdapter — key lifecycle contract', () => {
  it('issueKey(userId) resolves with a KeyHandle containing a non-empty keyId', async () => {
    const adapter = new MockKmsAdapter()
    const handle = await adapter.issueKey('user1')
    expect(handle.keyId).toBeTruthy()
    expect(typeof handle.keyId).toBe('string')
    expect(handle.userId).toBe('user1')
    expect(handle.issuedAt).toBe(BASE_TIME.toISOString())
    expect(handle.provider).toBeTruthy()
  })

  it('issueKey(userId) issues a distinct key for each user (no shared keys)', async () => {
    const adapter = new MockKmsAdapter()
    const h1 = await adapter.issueKey('alice')
    const h2 = await adapter.issueKey('bob')
    expect(h1.keyId).not.toBe(h2.keyId)
  })

  it('wrapKey(dek, kek) returns an opaque WrappedKey that cannot be used directly as a CryptoKey', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user1')
    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])

    const wrapped = await adapter.wrapKey(dek, kek)

    // WrappedKey is a plain object — not a CryptoKey
    expect(wrapped).not.toBeInstanceOf(CryptoKey)
    expect(typeof wrapped.wrappedKeyMaterial).toBe('string')
    expect(wrapped.wrappedKeyMaterial.length).toBeGreaterThan(0)
    expect(wrapped.keyId).toBe(kek.keyId)
    expect(wrapped.algorithm).toBe('AES-KW')
  })

  it('unwrapKey(wrapped, kek) returns the original CryptoKey after wrap/unwrap round-trip', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user1')

    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped = await adapter.wrapKey(dek, kek)
    const restored = await adapter.unwrapKey(wrapped, kek)

    expect(restored).toBeInstanceOf(CryptoKey)

    // Verify the restored key is functionally equivalent — encrypts and decrypts correctly
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode('round-trip test payload')
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, restored, plaintext)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, restored, cipher)
    expect(new TextDecoder().decode(decrypted)).toBe('round-trip test payload')
  })

  it('unwrapKey(wrapped, wrongKek) rejects with an error (key mismatch)', async () => {
    const adapter = new MockKmsAdapter()
    const kek1 = await adapter.issueKey('user1')
    const kek2 = await adapter.issueKey('user2')

    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    // Wrap with user1's key
    const wrapped = await adapter.wrapKey(dek, kek1)

    // Attempt to unwrap with user2's key — must reject
    await expect(adapter.unwrapKey(wrapped, kek2)).rejects.toThrow()
  })
})

describe('KmsAdapter — key destruction (GDPR Article 17)', () => {
  it('scheduleKeyDestruction(userId, destroyAt) resolves without throwing', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user1')
    const destroyAt = new Date(BASE_TIME.getTime() + 30 * 24 * 3600 * 1000)
    await expect(adapter.scheduleKeyDestruction('user1', destroyAt)).resolves.not.toThrow()
  })

  it('getKeyStatus(userId) returns { status: "scheduled_for_destruction" } after scheduling', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user1')
    const destroyAt = new Date(BASE_TIME.getTime() + 30 * 24 * 3600 * 1000)
    await adapter.scheduleKeyDestruction('user1', destroyAt)

    const status = await adapter.getKeyStatus('user1')
    expect(status.status).toBe('scheduled_for_destruction')
    expect(status.scheduledDestroyAt).toBe(destroyAt.toISOString())
  })

  it('getKeyStatus(userId) returns { status: "destroyed" } after destroyAt has passed', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user1')
    const destroyAt = new Date(BASE_TIME.getTime() + 1000)
    await adapter.scheduleKeyDestruction('user1', destroyAt)

    vi.setSystemTime(new Date(destroyAt.getTime() + 1))

    const status = await adapter.getKeyStatus('user1')
    expect(status.status).toBe('destroyed')
    expect(status.destroyedAt).toBeTruthy()
  })

  it('unwrapKey after destruction rejects — data is cryptographically unreadable', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user1')
    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped = await adapter.wrapKey(dek, kek)

    await adapter.scheduleKeyDestruction('user1', new Date(BASE_TIME.getTime() - 1))

    await expect(adapter.unwrapKey(wrapped, kek)).rejects.toThrow()
  })

  it('a vault blob encrypted with a destroyed key cannot be decrypted (crypto-shredding)', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user1')
    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped = await adapter.wrapKey(dek, kek)

    // Encrypt vault data with the DEK
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      dek,
      new TextEncoder().encode('vault data'),
    )

    // Destroy the KEK
    await adapter.scheduleKeyDestruction('user1', new Date(BASE_TIME.getTime() - 1))

    // Cannot recover DEK → cannot decrypt ciphertext
    await expect(adapter.unwrapKey(wrapped, kek)).rejects.toThrow()
    // Ciphertext is unreadable (only verifying it exists — DEK is gone)
    expect(ciphertext.byteLength).toBeGreaterThan(0)
  })

  it('backup copy of vault blob is also unreadable after key destruction', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user1')
    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped = await adapter.wrapKey(dek, kek)

    // Backup is a snapshot of the wrapped key taken before destruction
    const backupWrapped = { ...wrapped }

    await adapter.scheduleKeyDestruction('user1', new Date(BASE_TIME.getTime() - 1))

    await expect(adapter.unwrapKey(backupWrapped, kek)).rejects.toThrow()
  })
})

describe('KmsAdapter — DSAR (Data Subject Access Request) workflow', () => {
  it('getKeyStatus returns audit metadata: issuedAt, lastUsedAt, destroyedAt', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user1')

    // Use the key (triggers lastUsedAt update)
    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    await adapter.wrapKey(dek, kek)

    const status = await adapter.getKeyStatus('user1')
    expect(status.issuedAt).toBe(BASE_TIME.toISOString())
    expect(status.lastUsedAt).toBeTruthy()
    expect(status.destroyedAt).toBeNull()
    expect(status.status).toBe('active')
  })

  it('scheduleKeyDestruction emits an auditable event with userId and destroyAt', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user1')
    const destroyAt = new Date(BASE_TIME.getTime() + 30 * 24 * 3600 * 1000)
    await adapter.scheduleKeyDestruction('user1', destroyAt)

    const status = await adapter.getKeyStatus('user1')
    const event = status.auditTrail.find((e) => e.event === 'destruction_scheduled')
    expect(event).toBeDefined()
    expect(status.userId).toBe('user1')
    expect(status.scheduledDestroyAt).toBe(destroyAt.toISOString())
  })

  it('the audit trail for a key lifecycle is complete: issue → use → schedule → destroy', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user1')

    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    await adapter.wrapKey(dek, kek)

    const destroyAt = new Date(BASE_TIME.getTime() + 1000)
    await adapter.scheduleKeyDestruction('user1', destroyAt)

    vi.setSystemTime(new Date(destroyAt.getTime() + 1))
    const status = await adapter.getKeyStatus('user1')

    const eventTypes = status.auditTrail.map((e) => e.event)
    expect(eventTypes).toContain('issued')
    expect(eventTypes).toContain('used')
    expect(eventTypes).toContain('destruction_scheduled')
    expect(eventTypes).toContain('destroyed')

    // Chronological order: issued first, destroyed last
    const iIssued = eventTypes.indexOf('issued')
    const iScheduled = eventTypes.lastIndexOf('destruction_scheduled')
    const iDestroyed = eventTypes.lastIndexOf('destroyed')
    expect(iIssued).toBeLessThan(iScheduled)
    expect(iScheduled).toBeLessThan(iDestroyed)
  })
})
