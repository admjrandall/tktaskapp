import { NullAdapter } from '../../packages/adapter-null/src/index.js'
import { runAdapterContractSuite } from './adapter-contract.js'

// NullAdapter is the default offline adapter — all four methods are intentional
// no-ops that never throw. It satisfies the full contract; the round-trip
// persistence test is skipped because NullAdapter intentionally discards all
// push() payloads (offline-only mode — data lives in IDB, not the sync adapter).
runAdapterContractSuite('NullAdapter', () => new NullAdapter(), { isStub: true })
