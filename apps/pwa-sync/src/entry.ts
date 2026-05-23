// PWA sync entry — server-connected build using RxDB-Hono adapter.
// Auth: same BFF OIDC PKCE flow as enterprise-web and mobile.
// Falls back to VITE_AUTH_TOKEN (dev only) when no refresh cookie is present.

import { RxDBAdapter } from '../../../packages/adapter-rxdb/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import {
  setDeploymentPolicy,
  ENTERPRISE_DEPLOYMENT_POLICY,
} from '../../../packages/core/src/deployment-policy.js'
import { init } from '../../../packages/core/src/main.js'

// ── Server URL ─────────────────────────────────────────────────────────────────
// Default: same origin as the served page — safe for same-origin deployments
// and avoids the `http://localhost:3000` plaintext default that was previously
// used when VITE_SERVER_URL was not set.
const serverUrl: string =
  (import.meta.env['VITE_SERVER_URL'] as string | undefined) ??
  `${window.location.protocol}//${window.location.host}`

// ── AuthClient ─────────────────────────────────────────────────────────────────
class AuthClient {
  private _accessToken: string | null = null
  private _expiresAt = 0
  private _refreshPromise: Promise<string> | null = null

  constructor(private readonly _baseUrl: string) {}

  async getAuthHeader(): Promise<string> {
    if (this._accessToken && Date.now() < this._expiresAt - 60_000) {
      return `Bearer ${this._accessToken}`
    }
    return `Bearer ${await this._refresh()}`
  }

  private _refresh(): Promise<string> {
    if (!this._refreshPromise) {
      this._refreshPromise = this._doRefresh().finally(() => {
        this._refreshPromise = null
      })
    }
    return this._refreshPromise
  }

  private async _doRefresh(): Promise<string> {
    const res = await fetch(`${this._baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) {
      this._accessToken = null
      this._expiresAt = 0
      throw new Error('auth_refresh_failed')
    }
    const data = (await res.json()) as {
      access_token: string
      expires_in: number
    }
    this._accessToken = data.access_token
    this._expiresAt = Date.now() + data.expires_in * 1000
    return data.access_token
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  setDeploymentPolicy(ENTERPRISE_DEPLOYMENT_POLICY)

  // Dev-only static token (VITE_AUTH_TOKEN set in .env.local).
  const devToken = import.meta.env['VITE_AUTH_TOKEN'] as string | undefined
  if (devToken) {
    setAdapter(new RxDBAdapter({ serverUrl, authHeader: `Bearer ${devToken}` }))
    await init()
    return
  }

  const authClient = new AuthClient(serverUrl)

  try {
    await authClient.getAuthHeader()
  } catch {
    const loginUrl = `${serverUrl}/auth/login?redirect=${encodeURIComponent(window.location.href)}`
    window.location.href = loginUrl
    return
  }

  setAdapter(
    new RxDBAdapter({
      serverUrl,
      getAuthHeader: () => authClient.getAuthHeader(),
    }),
  )

  await init()
}

void bootstrap()
