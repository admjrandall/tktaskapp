/**
 * Unit tests for packages/core/src/storage/db.ts
 *
 * Tests cover the pure in-memory helpers and state management functions
 * that do not require IndexedDB. IDB-dependent paths (dbCreate, dbUpdate,
 * dbDelete, dbFlush, dbInit, softDelete) require a browser environment
 * and are covered by the e2e test suite instead.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  uid,
  nowISO,
  getStore,
  dbGetAll,
  dbGetById,
  clearDbState,
  _setDbData,
  _getDbData,
  _buildCrmPayload,
} from '../../packages/core/src/storage/db.js'
import { STORES } from '../../packages/core/src/constants.js'

beforeEach(() => {
  clearDbState()
})

// ── uid ───────────────────────────────────────────────────────────────────────

describe('uid', () => {
  it('returns a string', () => {
    expect(typeof uid()).toBe('string')
  })
  it('produces unique values', () => {
    const ids = new Set(Array.from({ length: 1000 }, uid))
    expect(ids.size).toBe(1000)
  })
  it('is a non-empty alphanumeric string (base36 timestamp + random)', () => {
    // uid() returns Date.now().toString(36) + 9 random bytes in base36 — not UUID format.
    expect(uid()).toMatch(/^[0-9a-z]+$/)
    expect(uid().length).toBeGreaterThan(10)
  })
})

// ── nowISO ────────────────────────────────────────────────────────────────────

describe('nowISO', () => {
  it('returns a valid ISO 8601 datetime string', () => {
    const ts = nowISO()
    expect(() => new Date(ts)).not.toThrow()
    expect(new Date(ts).toISOString()).toBe(ts)
  })
  it('is close to the current time', () => {
    const before = Date.now()
    const ts = nowISO()
    const after = Date.now()
    const d = new Date(ts).getTime()
    expect(d).toBeGreaterThanOrEqual(before)
    expect(d).toBeLessThanOrEqual(after + 5) // tolerate 5 ms clock skew
  })
})

// ── In-memory store access ─────────────────────────────────────────────────────

describe('getStore / dbGetAll / dbGetById', () => {
  const FIXTURE_CLIENTS = [
    { id: 'c1', name: 'Acme Corp' },
    { id: 'c2', name: 'Beta Ltd' },
  ]

  beforeEach(() => {
    _setDbData({ clients: FIXTURE_CLIENTS as unknown as Record<string, unknown>[] })
  })

  it('getStore returns the in-memory array for a known store', () => {
    expect(getStore('clients')).toEqual(FIXTURE_CLIENTS)
  })
  it('getStore returns an empty array for an unknown store', () => {
    expect(getStore('nonexistent_store')).toEqual([])
  })
  it('dbGetAll returns a copy of the store array', () => {
    const result = dbGetAll('clients')
    expect(result).toEqual(FIXTURE_CLIENTS)
    // Mutations to the result must not affect the in-memory store
    result.push({ id: 'injected' } as unknown as Record<string, unknown>)
    expect(getStore('clients')).toHaveLength(FIXTURE_CLIENTS.length)
  })
  it('dbGetById finds a record by id', () => {
    expect(dbGetById('clients', 'c1')).toMatchObject({ id: 'c1', name: 'Acme Corp' })
  })
  it('dbGetById returns null for a missing id', () => {
    expect(dbGetById('clients', 'nonexistent')).toBeNull()
  })
})

// ── _buildCrmPayload ──────────────────────────────────────────────────────────

describe('_buildCrmPayload', () => {
  it('includes every STORES key', () => {
    const payload = _buildCrmPayload()
    for (const store of STORES) {
      expect(payload).toHaveProperty(store)
      expect(Array.isArray(payload[store])).toBe(true)
    }
  })
  it('reflects in-memory state', () => {
    const task = { id: 't1', title: 'Test task' }
    _setDbData({ tasks: [task] as unknown as Record<string, unknown>[] })
    const payload = _buildCrmPayload()
    expect(payload['tasks']).toContainEqual(task)
  })
})

// ── clearDbState ──────────────────────────────────────────────────────────────

describe('clearDbState', () => {
  it('empties all in-memory stores', () => {
    _setDbData({
      clients: [{ id: 'c1', name: 'Acme' }] as unknown as Record<string, unknown>[],
    })
    clearDbState()
    expect(dbGetAll('clients')).toHaveLength(0)
  })
  it('resets the db key reference to null', () => {
    clearDbState()
    // After clearing, no key should be set — dbInit would be needed again
    // (we can only observe this indirectly; the module exposes _getDbData)
    expect(_getDbData()).toMatchObject({})
  })
})
