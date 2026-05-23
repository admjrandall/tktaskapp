// Enterprise web entry point.
// Auth: BFF OIDC PKCE flow — access token held in memory only, refresh token
// stored in HttpOnly SameSite=Strict cookie managed by the server.
// On every page load, bootstrap() calls POST /auth/refresh to obtain a fresh
// access token from the cookie. If the cookie is absent or expired, the user
// is redirected to GET /auth/login (PKCE initiation).

import { RxDBAdapter } from '../../../packages/adapter-rxdb/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import {
  setDeploymentPolicy,
  ENTERPRISE_DEPLOYMENT_POLICY,
} from '../../../packages/core/src/deployment-policy.js'
import { init } from '../../../packages/core/src/main.js'

// ── Server URL ─────────────────────────────────────────────────────────────────
const serverUrl: string =
  (import.meta.env['VITE_SERVER_URL'] as string | undefined) ??
  `${window.location.protocol}//${window.location.host}`

// ── AuthClient ─────────────────────────────────────────────────────────────────
// Holds the access token in memory. On expiry, transparently calls
// POST /auth/refresh (HttpOnly cookie auto-sent by the browser) to rotate
// both the access token and the refresh token.
//
// Only one refresh request runs at a time — parallel callers share the same
// Promise to prevent duplicate token requests (token thundering-herd).

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
      credentials: 'include', // sends HttpOnly tk_refresh_token cookie
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

// ── Server liveness check ──────────────────────────────────────────────────────
async function _checkServerReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  const reachable = await _checkServerReachable(serverUrl)
  if (!reachable) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:grid;place-items:center;height:100vh;font-family:system-ui'
    const p = document.createElement('p')
    p.style.cssText = 'color:#6b7280;font-size:1rem'
    p.textContent = 'Server unreachable. Check your network connection.'
    wrap.appendChild(p)
    document.body.appendChild(wrap)
    return
  }

  const authClient = new AuthClient(serverUrl)

  try {
    // Attempt silent refresh — succeeds if the HttpOnly refresh cookie is present.
    await authClient.getAuthHeader()
  } catch {
    // No valid session — redirect to PKCE login. The server's /auth/callback
    // will redirect back to the current URL after a successful login.
    const loginUrl = `${serverUrl}/auth/login?redirect=${encodeURIComponent(window.location.href)}`
    window.location.href = loginUrl
    return
  }

  setDeploymentPolicy(ENTERPRISE_DEPLOYMENT_POLICY)

  setAdapter(
    new RxDBAdapter({
      serverUrl,
      getAuthHeader: () => authClient.getAuthHeader(),
      pullLimit: 200,
    }),
  )

  await init()
}

void bootstrap()
