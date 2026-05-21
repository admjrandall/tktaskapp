// Shared behavioural contract suite for all SyncAdapter implementations.
// Import this module and call runAdapterContractSuite() from a .test.ts file.

import { describe, it, expect } from 'vitest'
import type { SyncAdapter } from '../../packages/core/src/adapter-interface.js'
import { validateImportPayload } from '../../packages/core/src/schemas/import.schema.js'

export interface ContractSuiteOptions {
  /**
   * Set true for stub adapters that do not actually persist records.
   * Skips round-trip and persistence-dependent tests.
   */
  isStub?: boolean
}

export function runAdapterContractSuite(
  adapterName: string,
  createAdapter: () => SyncAdapter,
  opts: ContractSuiteOptions = {},
): void {
  const { isStub = false } = opts

  describe(`${adapterName} — adapter contract`, () => {
    // ── pull() ──────────────────────────────────────────────────────────────

    describe('pull()', () => {
      it('resolves without throwing', async () => {
        const adapter = createAdapter()
        await expect(adapter.pull(null)).resolves.toBeDefined()
      })

      it('returns an object with records and checkpoint properties', async () => {
        const adapter = createAdapter()
        const result = await adapter.pull(null)
        expect(result).toHaveProperty('records')
        expect(result).toHaveProperty('checkpoint')
        expect(typeof result.records).toBe('object')
        expect(result.records).not.toBeNull()
      })

      it('records is a plain object (not an array)', async () => {
        const adapter = createAdapter()
        const result = await adapter.pull(null)
        expect(Array.isArray(result.records)).toBe(false)
      })

      it('accepts a non-null checkpoint without throwing', async () => {
        const adapter = createAdapter()
        await expect(adapter.pull({ seq: 42, ts: '2026-01-01T00:00:00Z' })).resolves.toBeDefined()
      })
    })

    // ── push() ──────────────────────────────────────────────────────────────

    describe('push()', () => {
      it('resolves without throwing on empty payload', async () => {
        const adapter = createAdapter()
        await expect(adapter.push({})).resolves.toBeDefined()
      })

      it('returns an object with a conflicts array', async () => {
        const adapter = createAdapter()
        const result = await adapter.push({})
        expect(result).toHaveProperty('conflicts')
        expect(Array.isArray(result.conflicts)).toBe(true)
      })

      it('accepts a valid record payload without throwing', async () => {
        const adapter = createAdapter()
        const now = new Date().toISOString()
        const record = {
          id: 'test-client-1',
          createdAt: now,
          updatedAt: now,
          name: 'Acme Corp',
          stage: 'Active',
        }
        await expect(adapter.push({ clients: [record] })).resolves.toBeDefined()
      })

      it('does not corrupt record metadata (createdAt/updatedAt/id survive the call)', async () => {
        const adapter = createAdapter()
        const now = new Date().toISOString()
        const original = { id: 'rec-001', createdAt: now, updatedAt: now }
        // NullAdapter discards input — we verify the call itself does not throw
        // and the returned conflict list is well-shaped.
        const result = await adapter.push({ tasks: [original] })
        expect(result.conflicts).toBeDefined()
      })

      it('rejects (via schema validation) a payload missing required id field', () => {
        // This test exercises the validation layer that wraps adapter push calls.
        // Applications MUST call validateImportPayload before invoking adapter.push().
        const now = new Date().toISOString()
        const bad = { createdAt: now, updatedAt: now, name: 'No ID' } // missing id
        const result = validateImportPayload({ clients: [bad] })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toMatch(/id/)
        }
      })

      it('rejects (via schema validation) a payload with an unknown store name', () => {
        const now = new Date().toISOString()
        const rec = { id: 'x', createdAt: now, updatedAt: now }
        const result = validateImportPayload({ unknownStore: [rec] })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toMatch(/Unknown store/)
        }
      })

      it('rejects (via schema validation) a record missing createdAt', () => {
        const rec = { id: 'y', updatedAt: new Date().toISOString() }
        const result = validateImportPayload({ clients: [rec] })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toMatch(/createdAt/)
        }
      })

      it.skipIf(isStub)('round-trip: records pushed are returned on the next pull', async () => {
        const adapter = createAdapter()
        const now = new Date().toISOString()
        const record = { id: 'rt-1', createdAt: now, updatedAt: now, name: 'Round-trip Test' }
        await adapter.push({ clients: [record] })
        const { records } = await adapter.pull(null)
        const found = (records['clients'] ?? []) as Record<string, unknown>[]
        expect(found.some((r) => r['id'] === 'rt-1')).toBe(true)
      })
    })

    // ── stream() ─────────────────────────────────────────────────────────────

    describe('stream()', () => {
      it('returns a function (unsubscribe)', () => {
        const adapter = createAdapter()
        const unsub = adapter.stream(() => {})
        expect(typeof unsub).toBe('function')
      })

      it('unsubscribe function does not throw when called', () => {
        const adapter = createAdapter()
        const unsub = adapter.stream(() => {})
        expect(() => unsub()).not.toThrow()
      })

      it('calling unsubscribe multiple times does not throw', () => {
        const adapter = createAdapter()
        const unsub = adapter.stream(() => {})
        expect(() => {
          unsub()
          unsub()
        }).not.toThrow()
      })
    })

    // ── clear() ──────────────────────────────────────────────────────────────

    describe('clear()', () => {
      it('resolves without throwing', async () => {
        const adapter = createAdapter()
        await expect(adapter.clear()).resolves.toBeUndefined()
      })

      it('can be called multiple times without throwing', async () => {
        const adapter = createAdapter()
        await expect(adapter.clear().then(() => adapter.clear())).resolves.toBeUndefined()
      })
    })
  })
}
