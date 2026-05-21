import { RxDBAdapter } from '../../../packages/adapter-rxdb/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import { init } from '../../../packages/core/src/main.js'

// CouchDB/PouchDB endpoint — set VITE_COUCHDB_URL at build time or in .env.local
const couchDbUrl =
  (import.meta.env['VITE_COUCHDB_URL'] as string | undefined) ?? 'http://localhost:5984/tktaskapp'

setAdapter(new RxDBAdapter({ couchDbUrl }))
void init()
