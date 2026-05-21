import { RxDBAdapter } from '../../packages/adapter-rxdb/src/index.js'
import { runAdapterContractSuite } from './adapter-contract.js'

// RxDBAdapter is a stub that inherits SyncAdapter no-ops.
// Skipped tests:
//   round-trip (pull returns pushed records) — RxDB storage not yet implemented;
//   the stub discards all push() payloads, so pull() always returns empty records.
// All other contract tests pass because the stub inherits the no-op default
// implementations from SyncAdapter.
runAdapterContractSuite('RxDBAdapter (stub)', () => new RxDBAdapter(), { isStub: true })
