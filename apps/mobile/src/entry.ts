// Mobile PWA entry — PWA install profile of the enterprise build.
// Wires OIDC token auth + RxDB-Hono sync + service worker registration.
// Mobile = PWA only. Capacitor deferred until native-specific needs arise.

import { RxDBAdapter } from '../../../packages/adapter-rxdb/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import { setDeploymentPolicy } from '../../../packages/core/src/deployment-policy.js'
import { init } from '../../../packages/core/src/main.js'
import { initMobileGestures } from './gestures.js'

// ── Mobile PWA deployment policy ──────────────────────────────────────────────
// Browser + cloud AI permitted; Ollama excluded (no daemon on mobile).
const MOBILE_PWA_POLICY = {
  id: 'mobile-pwa',
  label: 'Mobile PWA',
  ai: {
    allowedTiers: ['browser', 'cloud'] as ('browser' | 'ollama' | 'cloud')[],
    allowOllamaModelPull: false,
    allowPublicAIEndpoints: true,
    allowedConnectSrc: [] as string[],
  },
}

// ── Auth token resolution ──────────────────────────────────────────────────────
// Production: HttpOnly cookie `tk_access_token` set by server after PKCE flow.
// Dev: VITE_AUTH_TOKEN env var override.
function _resolveAuthToken(): string | undefined {
  const devToken = import.meta.env['VITE_AUTH_TOKEN'] as string | undefined
  if (devToken) return devToken
  const match = document.cookie.match(/(?:^|;\s*)tk_access_token=([^;]+)/)
  return match?.[1]
}

const serverUrl =
  (import.meta.env['VITE_SERVER_URL'] as string | undefined) ??
  `${window.location.protocol}//${window.location.host}`

// ── Service worker registration ────────────────────────────────────────────────
function _registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Non-fatal — app continues without offline cache
    })
  })
}

// ── Visual Viewport keyboard avoidance ────────────────────────────────────────
// Sets --vvh CSS variable to the visual viewport height so layout can shrink
// when the on-screen keyboard appears.
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
  _registerServiceWorker()
  _initKeyboardAvoidance()
  initMobileGestures()

  const token = _resolveAuthToken()
  if (!token) {
    const loginUrl = `${serverUrl}/auth/login?redirect=${encodeURIComponent(window.location.href)}`
    window.location.href = loginUrl
    return
  }

  setDeploymentPolicy(MOBILE_PWA_POLICY)
  setAdapter(
    new RxDBAdapter({
      serverUrl,
      authHeader: `Bearer ${token}`,
      pullLimit: 100,
    }),
  )
  await init()
}

void bootstrap()
