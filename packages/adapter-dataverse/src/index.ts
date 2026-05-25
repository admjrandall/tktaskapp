// ── DataverseAdapter — OData v4 sync adapter ─────────────────────────────────
// Implements AdapterInterface against Microsoft Dataverse Web API v9.2.
// pull/push use OData CRUD + If-Match for conflict-safe upserts.
// stream uses 30s polling (EventSource unavailable in Dataverse Code Apps).
// clear uses OData $batch for bulk deletion.

import { SyncAdapter } from '../../core/src/adapter-interface.js'

export interface DataverseAdapterConfig {
  /** Dataverse environment URL. e.g. 'https://org.crm.dynamics.com' */
  environmentUrl: string
  /**
   * Function that returns the current MSAL bearer token.
   * Called on every request so the auto-refreshed `window.__msalToken`
   * value is always used — never a stale snapshot from construction time.
   * Returns null when no token is available (requests will fail with 401).
   */
  getAccessToken: () => string | null
  /** Maps internal store name → Dataverse entity set name.
   *  e.g. { tasks: 'tktaskapp_tasks', clients: 'tktaskapp_clients' }
   */
  entityMap: Record<string, string>
}

interface ODataPage {
  value: Record<string, unknown>[]
  '@odata.nextLink'?: string
}

export class DataverseAdapter extends SyncAdapter {
  private readonly _config: DataverseAdapterConfig
  private _pollTimer: ReturnType<typeof setInterval> | null = null

  constructor(config: DataverseAdapterConfig) {
    super()
    this._config = config
  }

  private _headers(): Record<string, string> {
    const token = this._config.getAccessToken()
    if (!token) throw new Error('Dataverse: no access token available')
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Content-Type': 'application/json',
    }
  }

  override async pull(
    checkpoint: unknown,
  ): Promise<{ records: Record<string, unknown[]>; checkpoint: unknown }> {
    const { environmentUrl, entityMap } = this._config
    const since = typeof checkpoint === 'string' ? checkpoint : null
    const records: Record<string, unknown[]> = {}
    let latestModified: string | null = since

    for (const [store, entitySet] of Object.entries(entityMap)) {
      const rows: Record<string, unknown>[] = []
      const filter = since ? `$filter=${encodeURIComponent(`modifiedon gt ${since}`)}&` : ''
      let url: string | null =
        `${environmentUrl}/api/data/v9.2/${entitySet}?${filter}$orderby=modifiedon`

      while (url) {
        const resp = await fetch(url, { headers: this._headers() })
        if (!resp.ok) throw new Error(`Dataverse pull ${entitySet}: HTTP ${resp.status}`)
        const page = (await resp.json()) as ODataPage
        rows.push(...page.value)
        url = page['@odata.nextLink'] ?? null
      }

      for (const row of rows) {
        const mod = row['modifiedon'] as string | undefined
        if (mod && (!latestModified || mod > latestModified)) latestModified = mod
        // Normalise Dataverse primary key to 'id'
        const pkField = entitySet.replace('tktaskapp_', '') + 'id'
        if (!row['id'] && row[pkField]) row['id'] = row[pkField]
      }

      records[store] = rows
    }

    return { records, checkpoint: latestModified }
  }

  override async push(changes: Record<string, unknown[]>): Promise<{ conflicts: unknown[] }> {
    const { environmentUrl, entityMap } = this._config
    const conflicts: unknown[] = []

    for (const [store, rows] of Object.entries(changes)) {
      const entitySet = entityMap[store]
      if (!entitySet) continue

      for (const row of rows) {
        const rec = row as { id?: string; _deleted?: boolean; [k: string]: unknown }
        const id = rec.id
        if (!id) continue

        const url = `${environmentUrl}/api/data/v9.2/${entitySet}(${id})`

        if (rec._deleted) {
          const r = await fetch(url, { method: 'DELETE', headers: this._headers() })
          if (!r.ok && r.status !== 404) conflicts.push({ id, store, error: r.status })
          continue
        }

        const body = JSON.stringify(rec)
        // Try update first (If-Match: * = record must exist)
        const patch = await fetch(url, {
          method: 'PATCH',
          headers: { ...this._headers(), 'If-Match': '*', Prefer: 'return=minimal' },
          body,
        })
        if (patch.status === 412) {
          // Record not found in Dataverse — create it
          const post = await fetch(`${environmentUrl}/api/data/v9.2/${entitySet}`, {
            method: 'POST',
            headers: this._headers(),
            body,
          })
          if (!post.ok) conflicts.push({ id, store, error: post.status })
        } else if (!patch.ok) {
          conflicts.push({ id, store, error: patch.status })
        }
      }
    }

    return { conflicts }
  }

  override stream(onRemoteChange: (changes: Record<string, unknown[]>) => void): () => void {
    let lastCheckpoint: unknown = new Date().toISOString()

    const poll = async () => {
      try {
        const { records, checkpoint } = await this.pull(lastCheckpoint)
        lastCheckpoint = checkpoint
        if (Object.values(records).some((arr) => arr.length > 0)) {
          onRemoteChange(records)
        }
      } catch {
        // silent — next tick retries
      }
    }

    this._pollTimer = setInterval(() => {
      void poll()
    }, 30_000)

    return () => {
      if (this._pollTimer !== null) {
        clearInterval(this._pollTimer)
        this._pollTimer = null
      }
    }
  }

  override async clear(): Promise<void> {
    const { environmentUrl, entityMap } = this._config
    const boundary = `batch_del_${Date.now()}`

    for (const [, entitySet] of Object.entries(entityMap)) {
      const resp = await fetch(
        `${environmentUrl}/api/data/v9.2/${entitySet}?$select=${entitySet}id`,
        { headers: this._headers() },
      )
      if (!resp.ok) continue
      const page = (await resp.json()) as ODataPage
      if (page.value.length === 0) continue

      const parts = page.value.map((row) => {
        const id = Object.values(row)[0] as string
        return [
          `--${boundary}`,
          'Content-Type: application/http',
          'Content-Transfer-Encoding: binary',
          '',
          `DELETE ${environmentUrl}/api/data/v9.2/${entitySet}(${id}) HTTP/1.1`,
          'Accept: application/json',
          '',
          '',
        ].join('\r\n')
      })

      await fetch(`${environmentUrl}/api/data/v9.2/$batch`, {
        method: 'POST',
        headers: {
          ...this._headers(),
          'Content-Type': `multipart/mixed;boundary=${boundary}`,
        },
        body: parts.join('\r\n') + `\r\n--${boundary}--`,
      })
    }
  }
}
