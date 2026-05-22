import { RxDBAdapter } from '../../../packages/adapter-rxdb/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import { init } from '../../../packages/core/src/main.js'

// Hono server base URL — set VITE_SERVER_URL at build time or in .env.local
const serverUrl =
  (import.meta.env['VITE_SERVER_URL'] as string | undefined) ?? 'http://localhost:3000'

// Auth header from env (e.g. a static dev token — production uses OIDC cookie)
const authHeader = import.meta.env['VITE_AUTH_HEADER'] as string | undefined

setAdapter(new RxDBAdapter({ serverUrl, ...(authHeader ? { authHeader } : {}) }))
void init()
