// Dataverse (Power Platform) sync adapter — implementation stub.
//
// Implements the AdapterInterface contract against the Microsoft Dataverse Web API
// (OData v4). The Dataverse Web API reference:
//   https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview
//
// Prerequisites before this adapter is production-capable:
//   - A Dataverse environment URL (e.g. https://org.crm.dynamics.com)
//   - Entra ID app registration with Dynamics CRM delegated permissions
//   - Custom Dataverse tables mirroring the CRM schema (or standard entity mapping)
//   - Power Platform environment provisioned with sufficient API capacity
//
// Sync protocol:
//   pull()  → GET /api/data/v9.2/{entity}?$filter=modifiedon gt {checkpoint}
//   push()  → PATCH /api/data/v9.2/{entity}({id}) (upsert via If-Match: * / If-None-Match: *)
//   stream() → Dataverse Change Notifications (webhook or polling — EventSource not available)
//   clear()  → bulk delete via $batch request
//
// Multi-tenancy: org_id is passed as a query filter on every request; the Entra ID
// access token must have the correct Dataverse scope for the target environment.

import { SyncAdapter } from '../../core/src/adapter-interface.js'

export interface DataverseAdapterConfig {
  /** Dataverse environment URL. e.g. 'https://org.crm.dynamics.com' */
  environmentUrl: string
  /** Bearer token for the Dataverse Web API (from Entra ID MSAL flow). */
  accessToken: string
  /** Map from internal store name to Dataverse entity set name.
   *  e.g. { tasks: 'tktaskapp_tasks', clients: 'tktaskapp_clients' }
   */
  entityMap: Record<string, string>
}

export class DataverseAdapter extends SyncAdapter {
  private readonly _config: DataverseAdapterConfig

  constructor(config: DataverseAdapterConfig) {
    super()
    this._config = config
  }

  private _headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this._config.accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Content-Type': 'application/json',
    }
  }

  override pull(
    _checkpoint: unknown,
  ): Promise<{ records: Record<string, unknown[]>; checkpoint: unknown }> {
    // TODO: implement per-entity _changes fetch using modifiedon filter
    // Pattern:
    //   const since = _checkpoint as string ?? '1970-01-01T00:00:00Z'
    //   for (const [store, entity] of Object.entries(this._config.entityMap)) {
    //     const url = `${this._config.environmentUrl}/api/data/v9.2/${entity}?$filter=modifiedon gt ${since}`
    //     const res = await fetch(url, { headers: this._headers() })
    //     const data = await res.json()
    //     records[store] = data.value.map(mapDataverseToRecord)
    //   }
    void this._headers // suppress unused warning until implemented
    return Promise.reject(new DataverseNotImplementedError('pull'))
  }

  override push(_changes: Record<string, unknown[]>): Promise<{ conflicts: unknown[] }> {
    // TODO: implement per-entity upsert using PATCH with If-Match: * or If-None-Match: *
    // Dataverse uses OData upsert semantics:
    //   If-None-Match: * → create only (409 if exists)
    //   If-Match: *      → update only (404 if not found)
    //   Omit both        → upsert (create or update)
    return Promise.reject(new DataverseNotImplementedError('push'))
  }

  override stream(_onRemoteChange: (changes: Record<string, unknown[]>) => void): () => void {
    // TODO: Dataverse Change Notifications via webhook registration
    // Dataverse does not support EventSource. Options:
    //   1. Polling: call pull() on a short interval (simplest)
    //   2. Dataverse webhook: register a server-side webhook endpoint that calls
    //      the onRemoteChange callback via a server-push mechanism
    //   3. Azure Service Bus trigger from Dataverse plugin
    // Return a no-op unsubscribe for now — callers must tolerate no real-time sync.
    return () => {}
  }

  override clear(): Promise<void> {
    // TODO: implement bulk delete via $batch OData request
    // DELETE /api/data/v9.2/{entity}({id}) for each record
    // Use $batch to stay within Dataverse API rate limits
    return Promise.reject(new DataverseNotImplementedError('clear'))
  }
}

export class DataverseNotImplementedError extends Error {
  constructor(method: string) {
    super(
      `DataverseAdapter.${method}() is not yet implemented. ` +
        'See packages/adapter-dataverse/src/index.ts for the implementation plan.',
    )
    this.name = 'DataverseNotImplementedError'
  }
}
