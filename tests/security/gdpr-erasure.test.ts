// GDPR Article 17 erasure tests.
// Section 1: client-side data-deletion mechanics (offline db layer).
// Section 2: crypto-shredding via MockKmsAdapter — KEK destruction makes
//            all data encrypted under that KEK permanently unreadable.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MockKmsAdapter } from '../adapters/kms-mock.js'
import type { WrappedKey } from '../../packages/adapter-kms/src/index.js'

vi.useFakeTimers()

// Fixed base timestamp so time-sensitive tests are deterministic.
const BASE_TIME = new Date('2026-01-01T00:00:00.000Z')

let _setDbData: (d: Record<string, unknown[]>) => void
let _getDbData: () => Record<string, unknown[]>
let dbGetById: (s: string, id: string) => unknown
let dbGetAll: (s: string) => unknown[]
let softDelete: (s: string, id: string) => Promise<boolean>
let permanentDelete: (tid: string) => Promise<boolean>

beforeEach(async () => {
  const mod = await import('../../packages/core/src/storage/db.js')
  _setDbData = mod._setDbData
  _getDbData = mod._getDbData
  dbGetById = mod.dbGetById
  dbGetAll = mod.dbGetAll
  softDelete = mod.softDelete
  permanentDelete = mod.permanentDelete

  _setDbData({
    clients: [],
    departments: [],
    projects: [],
    tasks: [],
    people: [],
    standaloneNotes: [],
    tags: [],
    communications: [],
    files: [],
    timeEntries: [],
    notifications: [],
    trash: [],
    documents: [],
    conversations: [],
  })

  vi.setSystemTime(BASE_TIME)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.setSystemTime(BASE_TIME)
})

// ── Client-side erasure mechanics ──────────────────────────────────────────────

describe('GDPR erasure — data deletion mechanics', () => {
  it('permanentDelete removes the record from trash', async () => {
    _setDbData({ ..._getDbData(), people: [{ id: 'p1', name: 'Alice User' }] })
    await softDelete('people', 'p1')
    const trash = dbGetAll('trash')
    expect(trash.length).toBe(1)
    const tid = (trash[0] as Record<string, unknown>)['id'] as string
    await permanentDelete(tid)
    expect(dbGetAll('trash')).toEqual([])
  })

  it('after permanentDelete, dbGetById returns null for the erased record', async () => {
    _setDbData({ ..._getDbData(), people: [{ id: 'p1', name: 'Alice User' }] })
    await softDelete('people', 'p1')
    const trash = dbGetAll('trash')
    const tid = (trash[0] as Record<string, unknown>)['id'] as string
    await permanentDelete(tid)
    expect(dbGetById('people', 'p1')).toBeNull()
    expect(dbGetById('trash', tid)).toBeNull()
  })

  it('soft-delete without permanentDelete leaves record in trash (can still be erased)', async () => {
    _setDbData({ ..._getDbData(), clients: [{ id: 'c1', name: 'Corp A' }] })
    await softDelete('clients', 'c1')
    const trash = dbGetAll('trash')
    expect(trash.length).toBe(1)
    expect((trash[0] as Record<string, unknown>)['_store']).toBe('clients')
  })

  it('erasing a record that does not exist returns false without throwing', async () => {
    const result = await permanentDelete('non-existent-trash-id')
    expect(result).toBe(false)
  })

  it('multiple records for the same person can all be erased', async () => {
    _setDbData({
      ..._getDbData(),
      people: [{ id: 'p1', name: 'Bob' }],
      communications: [
        { id: 'comm1', relatedId: 'p1', body: 'Call' },
        { id: 'comm2', relatedId: 'p1', body: 'Email' },
      ],
    })
    await softDelete('people', 'p1')
    await softDelete('communications', 'comm1')
    await softDelete('communications', 'comm2')
    const trash = dbGetAll('trash')
    expect(trash.length).toBe(3)
    for (const item of trash) {
      const tid = (item as Record<string, unknown>)['id'] as string
      await permanentDelete(tid)
    }
    expect(dbGetAll('trash')).toEqual([])
    expect(dbGetAll('people')).toEqual([])
    expect(dbGetAll('communications')).toEqual([])
  })
})

// ── Crypto-shredding (MockKmsAdapter) ─────────────────────────────────────────
// These tests use MockKmsAdapter which implements the KmsAdapter interface with
// real WebCrypto AES-KW wrap/unwrap and in-memory lifecycle state.

describe('GDPR crypto-shredding — key destruction makes data unreadable', () => {
  it('vault ciphertext encrypted under a destroyed KEK cannot be decrypted', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user-vault')

    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped = await adapter.wrapKey(dek, kek)

    // Encrypt vault-like data with the DEK
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      dek,
      new TextEncoder().encode('{ "clients": [{ "id": "c1", "name": "Acme" }] }'),
    )

    // Destroy the KEK (destroyAt in the past → immediately expired)
    await adapter.scheduleKeyDestruction('user-vault', new Date(BASE_TIME.getTime() - 1))

    // Unwrap must throw — DEK is permanently inaccessible
    await expect(adapter.unwrapKey(wrapped, kek)).rejects.toThrow()

    // The ciphertext exists in storage but cannot be decrypted without the DEK
    expect(ciphertext.byteLength).toBeGreaterThan(0)
  })

  it('unwrapKey() rejects after scheduleKeyDestruction() destroyAt has passed', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user-unwrap')

    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped = await adapter.wrapKey(dek, kek)

    // Schedule destruction 30 days from BASE_TIME
    const destroyAt = new Date(BASE_TIME.getTime() + 30 * 24 * 60 * 60 * 1000)
    await adapter.scheduleKeyDestruction('user-unwrap', destroyAt)

    // Before destroyAt — unwrap succeeds
    const dekBefore = await adapter.unwrapKey(wrapped, kek)
    expect(dekBefore).toBeTruthy()

    // Advance fake time past destroyAt
    vi.setSystemTime(new Date(destroyAt.getTime() + 1000))

    // After destroyAt — unwrap throws
    await expect(adapter.unwrapKey(wrapped, kek)).rejects.toThrow()
  })

  it('wrapKey() rejects after key destruction (no new data can be encrypted for erased user)', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user-wrap')

    // Destroy immediately
    await adapter.scheduleKeyDestruction('user-wrap', new Date(BASE_TIME.getTime() - 1))

    const newDek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    await expect(adapter.wrapKey(newDek, kek)).rejects.toThrow()
  })

  it('getKeyStatus() returns { status: "destroyed" } after destroyAt', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user-status')

    const destroyAt = new Date(BASE_TIME.getTime() + 1000)
    await adapter.scheduleKeyDestruction('user-status', destroyAt)

    const statusBefore = await adapter.getKeyStatus('user-status')
    expect(statusBefore.status).toBe('scheduled_for_destruction')

    vi.setSystemTime(new Date(destroyAt.getTime() + 1))

    const statusAfter = await adapter.getKeyStatus('user-status')
    expect(statusAfter.status).toBe('destroyed')
    expect(statusAfter.destroyedAt).toBeTruthy()
  })
})

describe('GDPR crypto-shredding — backup copy unreadability', () => {
  it('a .vault backup file exported before key destruction is unreadable after destruction', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user-backup')

    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped = await adapter.wrapKey(dek, kek)

    // Simulate exporting a backup: snapshot the WrappedKey (stored in the .vault file)
    const backupWrappedKey: WrappedKey = { ...wrapped }

    // Destroy the KEK
    await adapter.scheduleKeyDestruction('user-backup', new Date(BASE_TIME.getTime() - 1))

    // The backup's wrapped key is permanently unusable — KEK is gone
    await expect(adapter.unwrapKey(backupWrappedKey, kek)).rejects.toThrow()
  })

  it('a cold-storage copy of the IDB dump is unreadable after key destruction', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user-coldstorage')

    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped = await adapter.wrapKey(dek, kek)

    // Cold-storage copy is a snapshot of the IDB dump: ciphertext + wrapped DEK
    const coldStorageCopy = { wrappedKey: { ...wrapped } as WrappedKey }

    // Destroy the KEK
    await adapter.scheduleKeyDestruction('user-coldstorage', new Date(BASE_TIME.getTime() - 1))

    // Cold-storage copy is permanently unreadable — wrapped DEK cannot be recovered
    await expect(adapter.unwrapKey(coldStorageCopy.wrappedKey, kek)).rejects.toThrow()
  })

  it('all WrappedKey records for the destroyed userId are permanently unusable', async () => {
    const adapter = new MockKmsAdapter()
    const kek = await adapter.issueKey('user-multi')

    // Wrap multiple DEKs (each record in the vault has its own DEK)
    const dek1 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const dek2 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
    const wrapped1 = await adapter.wrapKey(dek1, kek)
    const wrapped2 = await adapter.wrapKey(dek2, kek)

    // Destroy the KEK
    await adapter.scheduleKeyDestruction('user-multi', new Date(BASE_TIME.getTime() - 1))

    // Every wrapped DEK is now permanently unusable
    await expect(adapter.unwrapKey(wrapped1, kek)).rejects.toThrow()
    await expect(adapter.unwrapKey(wrapped2, kek)).rejects.toThrow()
  })
})

describe('GDPR crypto-shredding — DSAR evidence auditability', () => {
  it('getKeyStatus() auditTrail contains an "issued" event with correct timestamp', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user-dsar')

    const status = await adapter.getKeyStatus('user-dsar')
    const issuedEvent = status.auditTrail.find((e) => e.event === 'issued')
    expect(issuedEvent).toBeDefined()
    expect(issuedEvent!.ts).toBe(BASE_TIME.toISOString())
    expect(status.issuedAt).toBe(BASE_TIME.toISOString())
  })

  it('getKeyStatus() auditTrail contains a "destruction_scheduled" event after scheduleKeyDestruction()', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user-dsar2')

    const destroyAt = new Date(BASE_TIME.getTime() + 30 * 24 * 3600 * 1000)
    await adapter.scheduleKeyDestruction('user-dsar2', destroyAt)

    const status = await adapter.getKeyStatus('user-dsar2')
    const scheduledEvent = status.auditTrail.find((e) => e.event === 'destruction_scheduled')
    expect(scheduledEvent).toBeDefined()
    expect(scheduledEvent!.ts).toBe(BASE_TIME.toISOString())
    expect(status.scheduledDestroyAt).toBe(destroyAt.toISOString())
    expect(status.status).toBe('scheduled_for_destruction')
  })

  it('getKeyStatus() auditTrail contains a "destroyed" event after destroyAt', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user-dsar3')

    const destroyAt = new Date(BASE_TIME.getTime() + 1000)
    await adapter.scheduleKeyDestruction('user-dsar3', destroyAt)

    vi.setSystemTime(new Date(destroyAt.getTime() + 1))

    const status = await adapter.getKeyStatus('user-dsar3')
    expect(status.status).toBe('destroyed')
    const destroyedEvent = status.auditTrail.find((e) => e.event === 'destroyed')
    expect(destroyedEvent).toBeDefined()
    expect(status.destroyedAt).toBeTruthy()
  })

  it('the destruction receipt timestamp satisfies the 30-day GDPR Art. 12(3) deadline from the erasure request', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('user-deadline')

    // Erasure request at BASE_TIME; must be completed within 30 days (Art. 12(3))
    const erasureRequestedAt = BASE_TIME
    const destroyAt = new Date(erasureRequestedAt.getTime() + 29 * 24 * 3600 * 1000) // 29 days
    await adapter.scheduleKeyDestruction('user-deadline', destroyAt)

    vi.setSystemTime(new Date(destroyAt.getTime() + 1))

    const status = await adapter.getKeyStatus('user-deadline')
    const destroyedEvent = status.auditTrail.find((e) => e.event === 'destroyed')
    expect(destroyedEvent).toBeDefined()

    const destroyedAt = new Date(destroyedEvent!.ts)
    const daysElapsed = (destroyedAt.getTime() - erasureRequestedAt.getTime()) / (1000 * 3600 * 24)
    expect(daysElapsed).toBeLessThanOrEqual(30)
  })

  it('DSAR audit trail contains no personal data (only userId pseudonym, timestamps, and event types)', async () => {
    const adapter = new MockKmsAdapter()
    await adapter.issueKey('pseudonym-abc123')

    await adapter.scheduleKeyDestruction('pseudonym-abc123', new Date(BASE_TIME.getTime() - 1))

    const status = await adapter.getKeyStatus('pseudonym-abc123')
    expect(status.status).toBe('destroyed')

    // Each audit entry must only contain the three permitted fields
    for (const entry of status.auditTrail) {
      expect(Object.keys(entry).sort()).toEqual(['actor', 'event', 'ts'])
      expect(['issued', 'used', 'destruction_scheduled', 'destroyed']).toContain(entry.event)
      expect(new Date(entry.ts).toISOString()).toBe(entry.ts)
    }

    // Top-level status must not contain any email addresses or real names
    const serialised = JSON.stringify(status)
    expect(serialised).not.toMatch(/@\w+\.\w+/) // no email-like strings
    expect(status.userId).toBe('pseudonym-abc123')
  })
})
