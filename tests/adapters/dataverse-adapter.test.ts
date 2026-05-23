import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DataverseAdapter,
  DataverseNotImplementedError,
} from '../../packages/adapter-dataverse/src/index.js'
import { runAdapterContractSuite } from './adapter-contract.js'

// ── Fetch mock ────────────────────────────────────────────────────────────────

const config = {
  environmentUrl: 'https://test.crm.dynamics.com',
  getAccessToken: () => 'test-bearer-token',
  entityMap: {
    tasks: 'tktaskapp_tasks',
    clients: 'tktaskapp_clients',
  },
}

type ODataPageResponse = { value: Record<string, unknown>[]; '@odata.nextLink'?: string }

function makeFetch(pages: Record<string, ODataPageResponse> = {}): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string): Promise<Response> => {
    // $batch — always 200 OK
    if (String(url).includes('$batch')) {
      return new Response('', { status: 200 })
    }
    // Entity GET — return mock page or empty page
    for (const [entitySet, page] of Object.entries(pages)) {
      if (String(url).includes(entitySet)) {
        return new Response(JSON.stringify(page), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    // Default: empty OData page
    return new Response(JSON.stringify({ value: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Adapter contract suite ────────────────────────────────────────────────────
// isStub: true — DataverseAdapter does not persist round-trips in tests
// (fetch is mocked to return empty pages; no real Dataverse available)

runAdapterContractSuite('DataverseAdapter (stub)', () => new DataverseAdapter(config), {
  isStub: true,
})

// ── Constructor ───────────────────────────────────────────────────────────────

describe('DataverseAdapter constructor', () => {
  it('accepts a valid config without throwing', () => {
    expect(() => new DataverseAdapter(config)).not.toThrow()
  })

  it('accepts empty environmentUrl without throwing at construction', () => {
    expect(
      () =>
        new DataverseAdapter({ environmentUrl: '', getAccessToken: () => 'tok', entityMap: {} }),
    ).not.toThrow()
  })
})

// ── DataverseNotImplementedError ──────────────────────────────────────────────

describe('DataverseNotImplementedError', () => {
  it('has name "DataverseNotImplementedError"', () => {
    expect(new DataverseNotImplementedError('pull').name).toBe('DataverseNotImplementedError')
  })

  it('message includes the method name', () => {
    expect(new DataverseNotImplementedError('pull').message).toContain('pull')
    expect(new DataverseNotImplementedError('push').message).toContain('push')
    expect(new DataverseNotImplementedError('clear').message).toContain('clear')
  })

  it('is an instance of Error', () => {
    expect(new DataverseNotImplementedError('pull')).toBeInstanceOf(Error)
  })
})

// ── OData v4 pull() ───────────────────────────────────────────────────────────

describe('DataverseAdapter OData v4 — pull()', () => {
  it('returns empty records when Dataverse returns empty pages', async () => {
    const adapter = new DataverseAdapter(config)
    const { records, checkpoint } = await adapter.pull(null)
    expect(records['tasks']).toEqual([])
    expect(records['clients']).toEqual([])
    expect(checkpoint).toBeNull()
  })

  it('returns records from mocked OData page', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        tktaskapp_tasks: {
          value: [{ id: 'task-1', modifiedon: '2026-05-01T10:00:00Z', title: 'Inspect PLC' }],
        },
      }),
    )
    const adapter = new DataverseAdapter(config)
    const { records, checkpoint } = await adapter.pull(null)
    expect(records['tasks']).toHaveLength(1)
    expect((records['tasks']?.[0] as Record<string, unknown>)?.['id']).toBe('task-1')
    expect(checkpoint).toBe('2026-05-01T10:00:00Z')
  })

  it('includes delta filter when checkpoint is a string', async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new DataverseAdapter(config)
    await adapter.pull('2026-04-01T00:00:00Z')
    const urls = (fetchMock.mock.calls as [string, unknown][]).map(([url]) => url)
    expect(urls.some((u) => u.includes('modifiedon'))).toBe(true)
  })

  it('advances checkpoint to latest modifiedon across entities', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        tktaskapp_tasks: {
          value: [{ id: 'task-1', modifiedon: '2026-05-10T00:00:00Z' }],
        },
        tktaskapp_clients: {
          value: [{ id: 'client-1', modifiedon: '2026-05-15T00:00:00Z' }],
        },
      }),
    )
    const adapter = new DataverseAdapter(config)
    const { checkpoint } = await adapter.pull(null)
    expect(checkpoint).toBe('2026-05-15T00:00:00Z')
  })
})

// ── OData v4 push() ───────────────────────────────────────────────────────────

describe('DataverseAdapter OData v4 — push()', () => {
  it('returns empty conflicts on successful upsert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    )
    const adapter = new DataverseAdapter(config)
    const { conflicts } = await adapter.push({
      tasks: [{ id: 'task-1', title: 'Inspect valve', updatedAt: '2026-05-01T00:00:00Z' }],
    })
    expect(conflicts).toEqual([])
  })

  it('falls back to POST when PATCH returns 412', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if ((opts as RequestInit & { method?: string })?.method === 'PATCH') {
        return new Response('', { status: 412 })
      }
      return new Response('', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new DataverseAdapter(config)
    const { conflicts } = await adapter.push({
      tasks: [{ id: 'new-task', title: 'New work order' }],
    })
    expect(conflicts).toEqual([])
    const postCalls = (fetchMock.mock.calls as [string, RequestInit][]).filter(
      ([, opts]) => opts?.method === 'POST',
    )
    expect(postCalls.length).toBeGreaterThan(0)
  })

  it('records conflicts on non-412 push failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )
    const adapter = new DataverseAdapter(config)
    const { conflicts } = await adapter.push({
      tasks: [{ id: 'task-1', title: 'Failing record' }],
    })
    expect(conflicts.length).toBeGreaterThan(0)
  })

  it('skips rows without an id', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new DataverseAdapter(config)
    await adapter.push({ tasks: [{ title: 'No ID record' }] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('DELETEs records marked _deleted', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new DataverseAdapter(config)
    await adapter.push({ tasks: [{ id: 'task-del', _deleted: true }] })
    const deleteCalls = (fetchMock.mock.calls as [string, RequestInit][]).filter(
      ([, opts]) => opts?.method === 'DELETE',
    )
    expect(deleteCalls.length).toBe(1)
  })
})

// ── stream() ──────────────────────────────────────────────────────────────────

describe('DataverseAdapter stream()', () => {
  it('returns an unsubscribe function', () => {
    const adapter = new DataverseAdapter(config)
    const unsub = adapter.stream(() => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('unsubscribe stops the polling timer', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const adapter = new DataverseAdapter(config)
    const unsub = adapter.stream(() => {})
    unsub()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

// ── clear() ───────────────────────────────────────────────────────────────────

describe('DataverseAdapter clear()', () => {
  it('resolves without error when pages are empty', async () => {
    const adapter = new DataverseAdapter(config)
    await expect(adapter.clear()).resolves.toBeUndefined()
  })

  it('sends $batch DELETE when records exist', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('$batch')) return new Response('', { status: 200 })
      return new Response(JSON.stringify({ value: [{ tktaskapp_tasksid: 'task-1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new DataverseAdapter(config)
    await adapter.clear()
    const batchCalls = (fetchMock.mock.calls as [string, unknown][]).filter(([url]) =>
      String(url).includes('$batch'),
    )
    expect(batchCalls.length).toBeGreaterThan(0)
  })
})
