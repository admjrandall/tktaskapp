import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RxDBAdapter } from '../../packages/adapter-rxdb/src/index.js'
import { runAdapterContractSuite } from './adapter-contract.js'

// ── Mock infrastructure ──────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3000'
const config = { serverUrl: BASE_URL }

let lastEs: MockEventSource | null = null

class MockEventSource {
  readonly url: string
  private _listeners = new Map<string, ((e: MessageEvent) => void)[]>()
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    lastEs = this
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    const existing = this._listeners.get(type) ?? []
    this._listeners.set(type, [...existing, fn])
  }

  emit(type: string, data: string) {
    for (const fn of this._listeners.get(type) ?? []) {
      fn(Object.assign(new Event(type), { data }) as MessageEvent)
    }
  }
}

type DocWithRev = {
  id: string
  store: string
  rev: string
  data: Record<string, unknown>
  _deleted?: boolean
  updatedAt: string
}

type FetchMockOpts = {
  pullDocuments?: DocWithRev[]
  pullCheckpoint?: unknown
  pushConflicts?: Record<string, unknown>[]
  ok?: boolean
}

function makeFetch(opts: FetchMockOpts = {}) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url)
    const ok = opts.ok ?? true
    let body: unknown
    if (u.includes('/api/v1/sync/pull')) {
      body = { documents: opts.pullDocuments ?? [], checkpoint: opts.pullCheckpoint ?? null }
    } else if (u.includes('/api/v1/sync/push')) {
      body = { conflicts: opts.pushConflicts ?? [] }
    } else if (u.includes('/api/v1/sync/stream-ticket')) {
      body = { ticket: 'stream-ticket-1', expiresAt: Date.now() + 60_000 }
    } else {
      body = {}
    }
    return Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(body),
    })
  })
}

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  lastEs = null
  mockFetch = makeFetch()
  vi.stubGlobal('fetch', mockFetch)
  vi.stubGlobal('EventSource', MockEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Interface contract ───────────────────────────────────────────────────────

// Verifies the adapter satisfies the SyncAdapter interface.
// isStub:true skips the round-trip persistence test (no live server).
runAdapterContractSuite('RxDBAdapter', () => new RxDBAdapter(config), { isStub: true })

// ── pull() ───────────────────────────────────────────────────────────────────

describe('RxDBAdapter pull()', () => {
  it('POSTs to /api/v1/sync/pull with checkpoint null when called with null', async () => {
    const adapter = new RxDBAdapter(config)
    await adapter.pull(null)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/sync/pull`,
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string) as {
      checkpoint: unknown
    }
    expect(body.checkpoint).toBeNull()
  })

  it('passes a non-null checkpoint through in the request body', async () => {
    const adapter = new RxDBAdapter(config)
    await adapter.pull('tok-42')
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string) as {
      checkpoint: unknown
    }
    expect(body.checkpoint).toBe('tok-42')
  })

  it('maps flat DocWithRev array to per-store record arrays', async () => {
    const now = new Date().toISOString()
    mockFetch = makeFetch({
      pullDocuments: [
        { id: 'c1', store: 'clients', rev: '1-a', data: { name: 'Acme' }, updatedAt: now },
        { id: 't1', store: 'tasks', rev: '1-b', data: { title: 'Fix bug' }, updatedAt: now },
      ],
      pullCheckpoint: 'tok-2',
    })
    vi.stubGlobal('fetch', mockFetch)

    const adapter = new RxDBAdapter(config)
    const { records, checkpoint } = await adapter.pull(null)

    expect(records['clients']).toHaveLength(1)
    expect(records['tasks']).toHaveLength(1)
    expect(records['clients']?.[0]).toMatchObject({ id: 'c1', name: 'Acme' })
    expect(records['tasks']?.[0]).toMatchObject({ id: 't1', title: 'Fix bug' })
    expect(checkpoint).toBe('tok-2')
  })

  it('skips deleted documents', async () => {
    const now = new Date().toISOString()
    mockFetch = makeFetch({
      pullDocuments: [
        { id: 'c1', store: 'clients', rev: '2-del', data: {}, _deleted: true, updatedAt: now },
      ],
    })
    vi.stubGlobal('fetch', mockFetch)

    const adapter = new RxDBAdapter(config)
    const { records } = await adapter.pull(null)
    expect(Object.keys(records)).toHaveLength(0)
  })

  it('throws when server returns non-ok response', async () => {
    mockFetch = makeFetch({ ok: false })
    vi.stubGlobal('fetch', mockFetch)

    const adapter = new RxDBAdapter(config)
    await expect(adapter.pull(null)).rejects.toThrow('Sync pull failed')
  })

  it('includes Authorization header when authHeader is configured', async () => {
    const adapter = new RxDBAdapter({ serverUrl: BASE_URL, authHeader: 'Bearer tok' })
    await adapter.pull(null)
    const init = mockFetch.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok')
  })

  it('omits Authorization header when authHeader is not configured', async () => {
    const adapter = new RxDBAdapter(config)
    await adapter.pull(null)
    const init = mockFetch.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })
})

// ── push() ───────────────────────────────────────────────────────────────────

describe('RxDBAdapter push()', () => {
  it('returns empty conflicts immediately for an empty payload without calling fetch', async () => {
    const adapter = new RxDBAdapter(config)
    const result = await adapter.push({})
    expect(result.conflicts).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('POSTs changeRows to /api/v1/sync/push', async () => {
    const adapter = new RxDBAdapter(config)
    const now = new Date().toISOString()
    await adapter.push({ clients: [{ id: 'c1', createdAt: now, updatedAt: now, name: 'Acme' }] })

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/sync/push`,
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string) as {
      changeRows: { newDocumentState: Record<string, unknown> }[]
    }
    expect(body.changeRows[0]!.newDocumentState['id']).toBe('c1')
    expect(body.changeRows[0]!.newDocumentState['store']).toBe('clients')
  })

  it('returns conflicts reported by the server', async () => {
    mockFetch = makeFetch({
      pushConflicts: [{ id: 'c1', store: 'clients', error: 'conflict' }],
    })
    vi.stubGlobal('fetch', mockFetch)

    const adapter = new RxDBAdapter(config)
    const now = new Date().toISOString()
    const result = await adapter.push({
      clients: [{ id: 'c1', createdAt: now, updatedAt: now }],
    })
    expect(result.conflicts).toHaveLength(1)
    expect((result.conflicts[0] as Record<string, unknown>)['error']).toBe('conflict')
  })

  it('throws when push server returns non-ok response', async () => {
    mockFetch = makeFetch({ ok: false })
    vi.stubGlobal('fetch', mockFetch)

    const adapter = new RxDBAdapter(config)
    const now = new Date().toISOString()
    await expect(
      adapter.push({ clients: [{ id: 'c1', createdAt: now, updatedAt: now }] }),
    ).rejects.toThrow('Sync push failed')
  })
})

// ── stream() ─────────────────────────────────────────────────────────────────

describe('RxDBAdapter stream()', () => {
  it('opens an EventSource to /api/v1/sync/stream', async () => {
    const adapter = new RxDBAdapter(config)
    adapter.stream(() => {})
    await Promise.resolve()
    expect(lastEs?.url).toBe(`${BASE_URL}/api/v1/sync/stream`)
  })

  it('uses an opaque stream ticket instead of putting a bearer token in the URL', async () => {
    const adapter = new RxDBAdapter({ serverUrl: BASE_URL, authHeader: 'Bearer access-token' })
    adapter.stream(() => {})
    await vi.waitFor(() => expect(lastEs).not.toBeNull())
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/sync/stream-ticket`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    )
    expect(lastEs?.url).toBe(`${BASE_URL}/api/v1/sync/stream?ticket=stream-ticket-1`)
    expect(lastEs?.url).not.toContain('access-token')
  })

  it('calls onRemoteChange with per-store records when a sync event arrives', async () => {
    const onRemoteChange = vi.fn()
    const adapter = new RxDBAdapter(config)
    adapter.stream(onRemoteChange)
    await Promise.resolve()
    const now = new Date().toISOString()
    lastEs!.emit(
      'sync',
      JSON.stringify({
        documents: [
          { id: 't1', store: 'tasks', rev: '1-x', data: { title: 'Test' }, updatedAt: now },
        ],
        checkpoint: 'tok-1',
      }),
    )

    expect(onRemoteChange).toHaveBeenCalledOnce()
    const arg = onRemoteChange.mock.calls[0]![0] as Record<string, unknown[]>
    expect(arg['tasks']).toHaveLength(1)
    expect((arg['tasks']![0] as Record<string, unknown>)['title']).toBe('Test')
  })

  it('ignores malformed JSON events without throwing', async () => {
    const onRemoteChange = vi.fn()
    const adapter = new RxDBAdapter(config)
    adapter.stream(onRemoteChange)
    await Promise.resolve()

    expect(() => lastEs!.emit('sync', '{not valid json')).not.toThrow()
    expect(onRemoteChange).not.toHaveBeenCalled()
  })

  it('closes the EventSource when the returned unsubscribe function is called', async () => {
    const adapter = new RxDBAdapter(config)
    const unsub = adapter.stream(() => {})
    await Promise.resolve()
    unsub()
    expect(lastEs!.close).toHaveBeenCalledOnce()
  })

  it('calling unsubscribe multiple times does not throw', () => {
    const adapter = new RxDBAdapter(config)
    const unsub = adapter.stream(() => {})
    expect(() => {
      unsub()
      unsub()
      unsub()
    }).not.toThrow()
  })
})

// ── clear() ──────────────────────────────────────────────────────────────────

describe('RxDBAdapter clear()', () => {
  it('resolves without throwing (no-op in Hono-native adapter)', async () => {
    const adapter = new RxDBAdapter(config)
    await expect(adapter.clear()).resolves.toBeUndefined()
  })

  it('does not call fetch during clear()', async () => {
    const adapter = new RxDBAdapter(config)
    await adapter.clear()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
