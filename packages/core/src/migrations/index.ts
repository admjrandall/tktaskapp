// ── Client-side IDB migration framework ───────────────────────────────────────
// Manages schema upgrades for the four IndexedDB databases used by the app.
// Migrations run inside the IDBOpenDBRequest.onupgradeneeded callback where
// the upgrade transaction is already open — callers must not open a new
// transaction; they must use the one provided.
//
// Usage:
//   const runner = new MigrationRunner(migrations)
//   request.onupgradeneeded = (e) => runner.run(e.target.result, e.oldVersion, e.newVersion)

export interface MigrationRecord {
  /** Target IDB database version number (positive integer, monotonically increasing). */
  readonly version: number
  /** Human-readable name used in audit logs and error messages. */
  readonly name: string
  /** The upgrade function. Called only when oldVersion < version <= newVersion. */
  readonly up: MigrationFn
}

/**
 * Called inside an active IDB upgrade transaction.
 * @param db   The IDBDatabase being upgraded.
 * @param tx   The active IDBVersionChangeTransaction (do NOT open a new one).
 */
export type MigrationFn = (db: IDBDatabase, tx: IDBTransaction) => void

// ── Migration runner ───────────────────────────────────────────────────────────

export class MigrationRunner {
  private readonly _migrations: readonly MigrationRecord[]

  constructor(migrations: MigrationRecord[]) {
    // Sort ascending so they always run in version order regardless of declaration order.
    this._migrations = [...migrations].sort((a, b) => a.version - b.version)
    this._assertNoDuplicates()
  }

  /**
   * Run all migrations whose version is in the range (oldVersion, newVersion].
   * Call this inside IDBOpenDBRequest.onupgradeneeded.
   */
  run(db: IDBDatabase, oldVersion: number, newVersion: number | null): void {
    const target = newVersion ?? this._latestVersion()
    for (const m of this._migrations) {
      if (m.version > oldVersion && m.version <= target) {
        m.up(
          db,
          (db as unknown as { transaction: IDBDatabase['transaction'] })
            .transaction as unknown as IDBTransaction,
        )
      }
    }
  }

  /** The highest version number in the migration set. */
  latestVersion(): number {
    return this._latestVersion()
  }

  private _latestVersion(): number {
    return this._migrations.reduce((max, m) => Math.max(max, m.version), 0)
  }

  private _assertNoDuplicates(): void {
    const seen = new Set<number>()
    for (const m of this._migrations) {
      if (seen.has(m.version)) {
        throw new Error(
          `Duplicate migration version ${m.version} ("${m.name}") — each version must be unique`,
        )
      }
      seen.add(m.version)
    }
  }
}

// ── Object store helpers (safe idempotent wrappers) ───────────────────────────
// These helpers are designed to be called inside migration up() functions.
// They are idempotent: calling them when the store/index already exists is a no-op.

export function createObjectStore(
  db: IDBDatabase,
  name: string,
  options?: IDBObjectStoreParameters,
): IDBObjectStore {
  if (db.objectStoreNames.contains(name)) {
    // Already exists — no-op during this upgrade; return the existing store
    // through the upgrade transaction so callers can add indexes.
    return (
      db as unknown as { transaction: { objectStore: (n: string) => IDBObjectStore } }
    ).transaction.objectStore(name)
  }
  return db.createObjectStore(name, options)
}

export function createIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options?: IDBIndexParameters,
): void {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options)
  }
}

export function deleteObjectStore(db: IDBDatabase, name: string): void {
  if (db.objectStoreNames.contains(name)) {
    db.deleteObjectStore(name)
  }
}

// ── Built-in migration helpers ─────────────────────────────────────────────────

/**
 * Produce a migration that adds a new object store with an optional list of indexes.
 * Useful for single-statement upgrades that don't need custom logic.
 */
export function addStoreMigration(
  version: number,
  name: string,
  storeName: string,
  options: IDBObjectStoreParameters,
  indexes: Array<{ name: string; keyPath: string | string[]; options?: IDBIndexParameters }> = [],
): MigrationRecord {
  return {
    version,
    name,
    up: (db) => {
      const store = createObjectStore(db, storeName, options)
      for (const idx of indexes) {
        createIndex(store, idx.name, idx.keyPath, idx.options)
      }
    },
  }
}
