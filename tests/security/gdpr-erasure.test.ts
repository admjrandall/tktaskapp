// GDPR Article 17 erasure tests.
// The crypto-shredding tests (KEK destruction making data unreadable) require
// KmsAdapter (Phase 9+) and remain .todo until that adapter is implemented.
// The tests below verify the data-deletion mechanics of the offline db layer
// that underpin the client-side erasure path.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.useFakeTimers()

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
})

afterEach(() => {
  vi.clearAllTimers()
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
    // Record no longer in source store
    expect(dbGetById('people', 'p1')).toBeNull()
    // Record no longer in trash
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

// ── Crypto-shredding (KmsAdapter — Phase 9+) ──────────────────────────────────

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
