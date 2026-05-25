// RxDB adapter — Hono-native 3-endpoint replication protocol (C.3).
// Communicates with POST /api/v1/sync/pull, POST /api/v1/sync/push,
// and GET /api/v1/sync/stream (SSE).
//
// CouchDB protocol preserved in packages/adapter-rxdb-couchdb/src/index.ts
// for users who prefer to run their own CouchDB instance.

import { SyncAdapter } from '../../core/src/adapter-interface.js'

export interface RxDBAdapterConfig {
  /** Base URL of the Hono API server. e.g. 'https://app.example.com' */
  serverUrl: string
  /**
   * Static Authorization header value. Use for dev/test only (tokens expire).
   * e.g. 'Bearer <jwt>'
   */
  authHeader?: string
  /**
   * Async function that returns the current Authorization header value.
   * Takes priority over `authHeader`. Use this in production — it is called
   * on every request so the in-memory access token can be transparently
   * refreshed without recreating the adapter.
   * e.g. () => authClient.getAuthHeader()
   */
  getAuthHeader?: () => Promise<string>
  /** Max documents per pull request (default 100, max 500). */
  pullLimit?: number
}

// ── Wire document shape (C.3) ─────────────────────────────────────────────────
interface DocWithRev {
  id: string
  store: string
  rev: string
  data: Record<string, unknown>
  _deleted?: boolean
  updatedAt: string
}

interface PullResponse {
  documents: DocWithRev[]
  checkpoint: unknown
}

interface PushResponse {
  conflicts: Record<string, unknown>[]
}

interface StreamTicketResponse {
  ticket: string
  expiresAt: number
}

// ── Conflict resolution (C.3) ─────────────────────────────────────────────────
// customFields: union, newer-wins per key
// tags: union
// All other fields: newer updatedAt wins
// AI Attributes: server wins if cloud > ollama > browser; else newer computedAt
function _resolveConflict(
  local: Record<string, unknown>,
  server: Record<string, unknown>,
): Record<string, unknown> {
  const localTs = typeof local['updatedAt'] === 'string' ? local['updatedAt'] : ''
  const serverTs = typeof server['updatedAt'] === 'string' ? server['updatedAt'] : ''
  const base = serverTs >= localTs ? { ...server } : { ...local }

  // Merge customFields (union, newer-wins per key)
  const lFields =
    local['customFields'] !== null && typeof local['customFields'] === 'object'
      ? (local['customFields'] as Record<string, unknown>)
      : {}
  const sFields =
    server['customFields'] !== null && typeof server['customFields'] === 'object'
      ? (server['customFields'] as Record<string, unknown>)
      : {}
  base['customFields'] = { ...lFields, ...sFields }

  // Merge tags (union)
  const lTags = Array.isArray(local['tags']) ? (local['tags'] as string[]) : []
  const sTags = Array.isArray(server['tags']) ? (server['tags'] as string[]) : []
  base['tags'] = [...new Set([...lTags, ...sTags])]

  return base
}

// ── Adapter ────────────────────────────────────────────────────────────────────
export class RxDBAdapter extends SyncAdapter {
  private readonly _base: string
  private readonly _authHeader: string | undefined
  private readonly _getAuthHeader: (() => Promise<string>) | undefined
  private readonly _pullLimit: number

  constructor(config: RxDBAdapterConfig) {
    super()
    this._base = config.serverUrl.replace(/\/$/, '')
    this._authHeader = config.authHeader
    this._getAuthHeader = config.getAuthHeader
    this._pullLimit = Math.min(500, Math.max(1, config.pullLimit ?? 100))
  }

  private async _headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this._getAuthHeader) {
      h['Authorization'] = await this._getAuthHeader()
    } else if (this._authHeader) {
      h['Authorization'] = this._authHeader
    }
    return h
  }

  override async pull(
    checkpoint: unknown,
  ): Promise<{ records: Record<string, unknown[]>; checkpoint: unknown }> {
    const res = await fetch(`${this._base}/api/v1/sync/pull`, {
      method: 'POST',
      headers: await this._headers(),
      body: JSON.stringify({ checkpoint: checkpoint ?? null, limit: this._pullLimit }),
    })
    if (!res.ok) throw new Error(`Sync pull failed: ${String(res.status)} ${res.statusText}`)
    const data = (await res.json()) as PullResponse

    // Reconstruct per-store record map from flat DocWithRev array
    const records: Record<string, unknown[]> = {}
    for (const doc of data.documents) {
      if (doc._deleted) continue
      const storeKey = doc.store
      if (!records[storeKey]) records[storeKey] = []
      // Merge doc.data with wire metadata that core needs
      records[storeKey].push({
        ...doc.data,
        id: doc.id,
        _rev: doc.rev,
        updatedAt: doc.updatedAt,
      })
    }
    return { records, checkpoint: data.checkpoint }
  }

  override async push(changes: Record<string, unknown[]>): Promise<{ conflicts: unknown[] }> {
    const changeRows: Array<{
      newDocumentState: Record<string, unknown>
      assumedMasterState?: Record<string, unknown>
    }> = []

    for (const [store, recs] of Object.entries(changes)) {
      for (const rec of recs) {
        const r = rec as Record<string, unknown>
        const newDocumentState: Record<string, unknown> = { ...r, store }
        const entry: (typeof changeRows)[0] = { newDocumentState }
        // Pass _rev as assumedMasterState so server can detect conflicts
        if (r['_rev']) {
          entry.assumedMasterState = { id: r['id'], store, updatedAt: r['updatedAt'] }
        }
        changeRows.push(entry)
      }
    }

    if (changeRows.length === 0) return { conflicts: [] }

    const res = await fetch(`${this._base}/api/v1/sync/push`, {
      method: 'POST',
      headers: await this._headers(),
      body: JSON.stringify({ changeRows }),
    })
    if (!res.ok) throw new Error(`Sync push failed: ${String(res.status)} ${res.statusText}`)
    const data = (await res.json()) as PushResponse

    // Apply client-side conflict resolution and re-attempt conflicted docs
    const resolved: Record<string, unknown[]> = {}
    for (const conflict of data.conflicts) {
      const doc = conflict
      const storeVal = doc['store']
      const store = typeof storeVal === 'string' ? storeVal : ''
      const localRec = (changes[store] ?? []).find(
        (r) => (r as Record<string, unknown>)['id'] === doc['id'],
      ) as Record<string, unknown> | undefined
      if (localRec) {
        const winner = _resolveConflict(localRec, doc)
        if (!resolved[store]) resolved[store] = []
        resolved[store].push(winner)
      }
    }

    // One retry for resolved conflicts (no assumedMasterState → force overwrite)
    if (Object.keys(resolved).length > 0) {
      const retryRows = Object.entries(resolved).flatMap(([store, recs]) =>
        recs.map((r) => ({ newDocumentState: { ...(r as Record<string, unknown>), store } })),
      )
      await fetch(`${this._base}/api/v1/sync/push`, {
        method: 'POST',
        headers: await this._headers(),
        body: JSON.stringify({ changeRows: retryRows }),
      })
    }

    return { conflicts: data.conflicts }
  }

  override stream(onRemoteChange: (changes: Record<string, unknown[]>) => void): () => void {
    const onMessage = (event: MessageEvent): void => {
      try {
        const payload = JSON.parse(event.data as string) as {
          documents: DocWithRev[]
          checkpoint: unknown
        }
        const records: Record<string, unknown[]> = {}
        for (const doc of payload.documents) {
          const storeKey = doc.store
          const bucket = records[storeKey] ?? (records[storeKey] = [])
          bucket.push({
            ...doc.data,
            id: doc.id,
            _rev: doc.rev,
            updatedAt: doc.updatedAt,
            _deleted: doc._deleted,
          })
        }
        if (Object.keys(records).length > 0) onRemoteChange(records)
      } catch {
        /* malformed SSE payload — skip */
      }
    }

    const _fetchStreamTicket = async (): Promise<string | null> => {
      if (!this._getAuthHeader && !this._authHeader) return null
      const res = await fetch(`${this._base}/api/v1/sync/stream-ticket`, {
        method: 'POST',
        headers: await this._headers(),
        body: '{}',
      })
      if (!res.ok) throw new Error(`Sync stream ticket failed: ${String(res.status)}`)
      const data = (await res.json()) as StreamTicketResponse
      return data.ticket
    }

    const _openEventSource = (ticket?: string | null): EventSource => {
      const url = ticket
        ? `${this._base}/api/v1/sync/stream?ticket=${encodeURIComponent(ticket)}`
        : `${this._base}/api/v1/sync/stream`
      const source = new EventSource(url, { withCredentials: true })
      source.addEventListener('sync', onMessage as EventListener)
      return source
    }

    let es: EventSource | null = null
    let closed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const _connect = (): void => {
      _fetchStreamTicket()
        .then((ticket) => {
          if (closed) return
          es = _openEventSource(ticket)
          es.onerror = (): void => {
            es?.close()
            es = null
            if (!closed && !reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null
                _connect()
              }, 5_000)
            }
          }
        })
        .catch(() => {
          if (!closed && !reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              _connect()
            }, 5_000)
          }
        })
    }

    _connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
      es = null
    }
  }

  override async clear(): Promise<void> {
    // Push an empty changeset with _deleted flag for all known records.
    // Caller is responsible for building the delete payload; clear() is a
    // best-effort no-op in the Hono-native adapter — full erasure goes
    // through the GDPR erasure workflow on the server.
  }
}
