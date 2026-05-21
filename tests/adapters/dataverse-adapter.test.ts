import { DataverseAdapter } from '../../packages/adapter-dataverse/src/index.js'
import { runAdapterContractSuite } from './adapter-contract.js'

// DataverseAdapter is a stub that inherits SyncAdapter no-ops.
// Skipped tests:
//   round-trip (pull returns pushed records) — Dataverse OData sync not yet implemented;
//   the stub discards all push() payloads, so pull() always returns empty records.
// All other contract tests pass because the stub inherits the no-op default
// implementations from SyncAdapter.
runAdapterContractSuite('DataverseAdapter (stub)', () => new DataverseAdapter(), { isStub: true })
