// RxDB CouchDB adapter contract tests.
// The CouchDBAdapter implements the same four-method SyncAdapter interface as
// NullAdapter and RxDBAdapter. The contract suite verifies shape and safety.
//
// Stub mode: fetch is mocked so all tests run without a live CouchDB server.
// Live mode: set COUCHDB_URL=http://localhost:5984/tktaskapp_test to run real round-trips.

import { describe, vi, beforeAll, afterAll } from 'vitest'
import { runAdapterContractSuite } from './adapter-contract.js'
import { CouchDBAdapter } from '../../packages/adapter-rxdb-couchdb/src/index.js'

// ── Live mode (requires a running CouchDB) ────────────────────────────────────

const COUCHDB_URL = process.env['COUCHDB_URL']

describe.skipIf(!COUCHDB_URL)('CouchDBAdapter — live round-trip (requires COUCHDB_URL)', () => {
  runAdapterContractSuite(
    'CouchDBAdapter (live)',
    () =>
      new CouchDBAdapter({
        couchDbUrl: `${COUCHDB_URL}`,
        authHeader: process.env['COUCHDB_AUTH'],
      }),
    { isStub: false },
  )
})

// ── Stub mode (fetch mocked — no live server required) ───────────────────────
// Mocks return the minimal CouchDB response shapes so the adapter can produce
// correctly-typed pull/push/stream/clear results for contract verification.

const emptyChanges = JSON.stringify({
  results: [],
  last_seq: '0-g1AAAAA',
})

const emptyAllDocs = JSON.stringify({
  rows: [],
})

const emptyBulkDocs = JSON.stringify([])

function mockFetch(url: string): Promise<Response> {
  const u = String(url)
  let body = emptyChanges
  if (u.includes('_all_docs')) body = emptyAllDocs
  else if (u.includes('_bulk_docs')) body = emptyBulkDocs
  return Promise.resolve(
    new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )
}

// Minimal EventSource stub — CouchDBAdapter's stream() uses EventSource for
// CouchDB _changes feed. Node.js test environment has no EventSource.
class StubEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  addEventListener(_type: string, _handler: EventListenerOrEventListenerObject): void {
    /* no-op */
  }
  removeEventListener(_type: string, _handler: EventListenerOrEventListenerObject): void {
    /* no-op */
  }
  close(): void {
    /* no-op */
  }
  readonly readyState = 0
  readonly url = ''
  readonly withCredentials = false
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
}

describe('CouchDBAdapter — stub (fetch mocked)', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', mockFetch)
    vi.stubGlobal('EventSource', StubEventSource)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  runAdapterContractSuite(
    'CouchDBAdapter (stub)',
    () => new CouchDBAdapter({ couchDbUrl: 'http://localhost:5984/test_db' }),
    { isStub: true },
  )
})
