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

  // pull() / push() / stream() / clear() — inherit SyncAdapter no-ops until OData is wired.
  // Implementation plan for each method is in the module header comment above.
  // When implementing, inject this._headers() and this._config into the fetch calls.
  // Throw DataverseNotImplementedError from the production app entry (apps/dataverse/src/entry.ts)
  // to surface a clear error to the user rather than silently returning empty data.
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
