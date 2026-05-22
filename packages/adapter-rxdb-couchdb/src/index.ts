// RxDB adapter — CouchDB / PouchDB replication protocol (preserved).
// This is the original CouchDB implementation, kept for users who want
// to run their own CouchDB instance. The active adapter-rxdb package
// now uses the Hono-native 3-endpoint protocol (C.3).
//
// Document ID convention: "{store}/{recordId}"

import { SyncAdapter } from '../../core/src/adapter-interface.js'

export interface CouchDBAdapterConfig {
  /** CouchDB base URL including database name. e.g. 'http://localhost:5984/tktaskapp' */
  couchDbUrl: string
  /** Authorization header value. e.g. 'Basic dXNlcjpwYXNz' or 'Bearer <token>' */
  authHeader?: string
}

interface CouchChangeRow {
  id: string
  seq: string | number
  deleted?: boolean
  doc?: Record<string, unknown>
}

interface CouchChangesResponse {
  results: CouchChangeRow[]
  last_seq: string | number
}

interface CouchAllDocsRow {
  id: string
  value: { rev: string }
  error?: string
}

interface CouchAllDocsResponse {
  rows: CouchAllDocsRow[]
}

interface CouchBulkResult {
  id: string
  rev?: string
  error?: string
  reason?: string
}

export class CouchDBAdapter extends SyncAdapter {
  private readonly _baseUrl: string
  private readonly _authHeader: string | undefined

  constructor(config: CouchDBAdapterConfig) {
    super()
    this._baseUrl = config.couchDbUrl.replace(/\/$/, '')
    this._authHeader = config.authHeader
  }

  private _headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this._authHeader !== undefined) h['Authorization'] = this._authHeader
    return h
  }

  override async pull(
    checkpoint: unknown,
  ): Promise<{ records: Record<string, unknown[]>; checkpoint: unknown }> {
    const since =
      typeof checkpoint === 'string' || typeof checkpoint === 'number' ? String(checkpoint) : '0'
    const url =
      `${this._baseUrl}/_changes` +
      `?since=${encodeURIComponent(since)}&include_docs=true&limit=500`
    const res = await fetch(url, { headers: this._headers() })
    if (!res.ok) throw new Error(`CouchDB _changes failed: ${String(res.status)} ${res.statusText}`)
    const data = (await res.json()) as CouchChangesResponse
    const records: Record<string, unknown[]> = {}
    for (const row of data.results) {
      if (!row.doc || row.deleted === true) continue
      const slash = row.id.indexOf('/')
      if (slash === -1) continue
      const store = row.id.slice(0, slash)
      const id = row.id.slice(slash + 1)
      const doc: Record<string, unknown> = { ...row.doc, id }
      delete doc['_id']
      delete doc['_rev']
      if (!records[store]) records[store] = []
      records[store].push(doc)
    }
    return { records, checkpoint: data.last_seq }
  }

  override async push(changes: Record<string, unknown[]>): Promise<{ conflicts: unknown[] }> {
    const docs: Array<Record<string, unknown>> = []
    for (const [store, recs] of Object.entries(changes)) {
      for (const rec of recs) {
        const r = rec as Record<string, unknown>
        docs.push({ ...r, _id: `${store}/${String(r['id'])}` })
      }
    }
    if (docs.length === 0) return { conflicts: [] }
    const revRes = await fetch(`${this._baseUrl}/_all_docs`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ keys: docs.map((d) => d['_id']) }),
    })
    if (revRes.ok) {
      const revData = (await revRes.json()) as CouchAllDocsResponse
      for (const row of revData.rows) {
        if (row.error !== undefined) continue
        const doc = docs.find((d) => d['_id'] === row.id)
        if (doc !== undefined) doc['_rev'] = row.value.rev
      }
    }
    const bulkRes = await fetch(`${this._baseUrl}/_bulk_docs`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ docs }),
    })
    if (!bulkRes.ok) throw new Error(`CouchDB _bulk_docs failed: ${String(bulkRes.status)}`)
    const results = (await bulkRes.json()) as CouchBulkResult[]
    return { conflicts: results.filter((r) => r.error === 'conflict') }
  }

  override stream(onRemoteChange: (changes: Record<string, unknown[]>) => void): () => void {
    const url =
      `${this._baseUrl}/_changes` + `?feed=eventsource&since=now&include_docs=true&heartbeat=10000`
    let es: EventSource | null = new EventSource(url)
    const onMessage = (event: MessageEvent) => {
      try {
        const data = event.data as string
        if (!data || data.trim() === '') return
        const row = JSON.parse(data) as CouchChangeRow
        if (!row.doc || row.deleted === true) return
        const slash = row.id.indexOf('/')
        if (slash === -1) return
        const store = row.id.slice(0, slash)
        const id = row.id.slice(slash + 1)
        const doc: Record<string, unknown> = { ...row.doc, id }
        delete doc['_id']
        delete doc['_rev']
        onRemoteChange({ [store]: [doc] })
      } catch {
        /* malformed event */
      }
    }
    es.addEventListener('message', onMessage as EventListener)
    return () => {
      es?.close()
      es = null
    }
  }

  override async clear(): Promise<void> {
    const res = await fetch(`${this._baseUrl}/_all_docs`, { headers: this._headers() })
    if (!res.ok) throw new Error(`CouchDB _all_docs failed: ${String(res.status)}`)
    const data = (await res.json()) as CouchAllDocsResponse
    const toDelete = data.rows
      .filter((r) => !r.id.startsWith('_design/'))
      .map((r) => ({ _id: r.id, _rev: r.value.rev, _deleted: true }))
    if (toDelete.length === 0) return
    await fetch(`${this._baseUrl}/_bulk_docs`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ docs: toDelete }),
    })
  }
}
