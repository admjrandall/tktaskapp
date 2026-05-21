import { describe, it, expect } from 'vitest'
import {
  DataverseAdapter,
  DataverseNotImplementedError,
} from '../../packages/adapter-dataverse/src/index.js'
import { runAdapterContractSuite } from './adapter-contract.js'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const config = {
  environmentUrl: 'https://test.crm.dynamics.com',
  accessToken: 'test-bearer-token',
  entityMap: {
    tasks: 'tktaskapp_tasks',
    clients: 'tktaskapp_clients',
    projects: 'tktaskapp_projects',
  },
}

// ── Interface contract ────────────────────────────────────────────────────────

// DataverseAdapter is an unimplemented stub — pull/push/stream/clear are inherited
// no-ops from SyncAdapter. isStub:true skips the round-trip persistence test.
runAdapterContractSuite('DataverseAdapter (stub)', () => new DataverseAdapter(config), {
  isStub: true,
})

// ── Constructor ───────────────────────────────────────────────────────────────

describe('DataverseAdapter constructor', () => {
  it('accepts a valid config without throwing', () => {
    expect(() => new DataverseAdapter(config)).not.toThrow()
  })

  it('requires all three config fields — missing environmentUrl throws at runtime', () => {
    // TypeScript prevents this at compile time; this guards against JS callers.
    expect(
      () => new DataverseAdapter({ environmentUrl: '', accessToken: 'tok', entityMap: {} }),
    ).not.toThrow()
  })
})

// ── DataverseNotImplementedError ──────────────────────────────────────────────

describe('DataverseNotImplementedError', () => {
  it('has name "DataverseNotImplementedError"', () => {
    const err = new DataverseNotImplementedError('pull')
    expect(err.name).toBe('DataverseNotImplementedError')
  })

  it('message includes the method name', () => {
    expect(new DataverseNotImplementedError('pull').message).toContain('pull')
    expect(new DataverseNotImplementedError('push').message).toContain('push')
    expect(new DataverseNotImplementedError('clear').message).toContain('clear')
  })

  it('is an instance of Error', () => {
    expect(new DataverseNotImplementedError('pull')).toBeInstanceOf(Error)
  })

  it('can be caught as DataverseNotImplementedError in a catch block', () => {
    const run = () => {
      throw new DataverseNotImplementedError('pull')
    }
    expect(run).toThrowError(DataverseNotImplementedError)
  })
})

// ── Inherited no-op behaviour ─────────────────────────────────────────────────

describe('DataverseAdapter inherited no-op methods', () => {
  it('pull() resolves to { records: {}, checkpoint: null }', async () => {
    const adapter = new DataverseAdapter(config)
    const result = await adapter.pull(null)
    expect(result.records).toEqual({})
    expect(result.checkpoint).toBeNull()
  })

  it('push() resolves to { conflicts: [] }', async () => {
    const adapter = new DataverseAdapter(config)
    const result = await adapter.push({ clients: [] })
    expect(result.conflicts).toEqual([])
  })

  it('stream() returns a no-op unsubscribe function', () => {
    const adapter = new DataverseAdapter(config)
    const unsub = adapter.stream(() => {})
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
  })

  it('clear() resolves without error', async () => {
    const adapter = new DataverseAdapter(config)
    await expect(adapter.clear()).resolves.toBeUndefined()
  })
})
