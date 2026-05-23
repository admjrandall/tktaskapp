// Mobile PWA entry.
// Auth: same BFF OIDC PKCE flow as enterprise-web — access token in memory,
// refresh token in HttpOnly SameSite=Strict cookie.
// Gesture and keyboard listeners are only attached after a valid session is
// confirmed to avoid leaking DOM listeners on pre-auth redirects.

import { RxDBAdapter } from '../../../packages/adapter-rxdb/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import { setDeploymentPolicy } from '../../../packages/core/src/deployment-policy.js'
import { init } from '../../../packages/core/src/main.js'
import { initMobileGestures } from './gestures.js'
import type { DeploymentPolicy } from '../../../packages/core/src/deployment-policy.js'

// ── Mobile PWA deployment policy ──────────────────────────────────────────────
// Browser + cloud AI permitted; Ollama excluded (no daemon on mobile).
const MOBILE_PWA_POLICY: DeploymentPolicy = {
  id: 'mobile-pwa',
  label: 'Mobile PWA',
  lockdownLevel: 'standard',
  auditRetentionDays: 2190, // match enterprise default
  ai: {
    allowedTiers: ['browser', 'cloud'],
    allowOllamaModelPull: false,
    allowPublicAIEndpoints: true,
    allowedConnectSrc: [],
  },
}

// ── Server URL ─────────────────────────────────────────────────────────────────
const serverUrl: string =
  (import.meta.env['VITE_SERVER_URL'] as string | undefined) ??
  `${window.location.protocol}//${window.location.host}`

// ── AuthClient ─────────────────────────────────────────────────────────────────
// Access token in memory only. Transparent refresh via HttpOnly cookie.
// Shared Promise prevents duplicate refresh requests under concurrent callers.

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

  async logout(): Promise<void> {
    this._accessToken = null
    this._expiresAt = 0
    await fetch(`${this._baseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // Best-effort — clear local state regardless of server response
    })
    // Signal the service worker to purge the API cache so stale authenticated
    // responses from this session are not served to the next user on this device.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('CLEAR_API_CACHE')
    }
  }
}

// ── Service worker registration ────────────────────────────────────────────────
function _registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Non-fatal — app continues without offline shell cache
    })
  })
}

// ── Visual Viewport keyboard avoidance ────────────────────────────────────────
function _initKeyboardAvoidance(): void {
  const vv = window.visualViewport
  if (!vv) return
  const update = (): void => {
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`)
  }
  vv.addEventListener('resize', update)
  update()
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Register service worker early — non-blocking, no auth dependency.
  _registerServiceWorker()

  const authClient = new AuthClient(serverUrl)

  try {
    // Attempt silent refresh — succeeds if the HttpOnly refresh cookie is present.
    await authClient.getAuthHeader()
  } catch {
    // No valid session — redirect to PKCE login.
    // Gesture and keyboard listeners are intentionally NOT attached here:
    // the page will navigate away immediately and there is nothing to interact with.
    const loginUrl = `${serverUrl}/auth/login?redirect=${encodeURIComponent(window.location.href)}`
    window.location.href = loginUrl
    return
  }

  // Auth confirmed — wire UI enhancements before app init.
  _initKeyboardAvoidance()
  initMobileGestures()

  setDeploymentPolicy(MOBILE_PWA_POLICY)

  setAdapter(
    new RxDBAdapter({
      serverUrl,
      getAuthHeader: () => authClient.getAuthHeader(),
      pullLimit: 100,
    }),
  )

  // Expose logout callback globally so the core auth module can trigger
  // session teardown (including the SW cache purge) without importing this entry.
  // The core module checks for window.__tkLogout before calling it.
  ;(window as Window & { __tkLogout?: () => Promise<void> }).__tkLogout = () => authClient.logout()

  await init()
}

void bootstrap()
