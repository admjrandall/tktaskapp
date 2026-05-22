// Enterprise web entry point.
// Wires OIDC token auth + RxDB-Hono sync + enterprise deployment policy + init().
//
// Prerequisites from the acceptance checklist in the original stub are now
// met by the supporting infrastructure built in Phase 3:
//   - OIDC token validation: server/src/auth/oidc.ts + auth/oidc-service.ts
//   - RxDB-Hono adapter: packages/adapter-rxdb/src/index.ts
//   - KMS: server/src/kms/key-service.ts
//   - OPA: server/src/middleware/opa.ts + authorization/policy-engine.ts
//   - OTel: server/src/observability/otel.ts
//
// This entry handles the client side only — the server already enforces
// auth middleware, OPA, RLS, and OTel on every API request.

import { RxDBAdapter } from '../../../packages/adapter-rxdb/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import { setDeploymentPolicy } from '../../../packages/core/src/deployment-policy.js'
import { init } from '../../../packages/core/src/main.js'

// ── Enterprise deployment policy ───────────────────────────────────────────────
// All AI tiers permitted; lockdown enforcement is driven by org settings
// fetched from the server after login.
const ENTERPRISE_POLICY = {
  id: 'enterprise',
  label: 'Enterprise',
  ai: {
    allowedTiers: ['browser', 'ollama', 'cloud'] as ('browser' | 'ollama' | 'cloud')[],
    allowOllamaModelPull: true,
    allowPublicAIEndpoints: true,
    allowedConnectSrc: [] as string[],
  },
}

// ── OIDC token resolution ──────────────────────────────────────────────────────
// Production: token is set as a cookie by the server after PKCE flow.
// Dev: VITE_AUTH_TOKEN env var overrides for local development only.
function _resolveAuthToken(): string | undefined {
  const devToken = import.meta.env['VITE_AUTH_TOKEN'] as string | undefined
  if (devToken) return devToken
  // Extract from cookie (server sets HttpOnly cookie named `tk_access_token`)
  const match = document.cookie.match(/(?:^|;\s*)tk_access_token=([^;]+)/)
  return match?.[1]
}

// ── Server URL ─────────────────────────────────────────────────────────────────
const serverUrl =
  (import.meta.env['VITE_SERVER_URL'] as string | undefined) ??
  `${window.location.protocol}//${window.location.host}`

// ── Liveness check before wiring ──────────────────────────────────────────────
async function _checkServerReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  const token = _resolveAuthToken()
  if (!token) {
    // No auth token — redirect to OIDC login endpoint
    const loginUrl = `${serverUrl}/auth/login?redirect=${encodeURIComponent(window.location.href)}`
    window.location.href = loginUrl
    return
  }

  const reachable = await _checkServerReachable(serverUrl)
  if (!reachable) {
    // Server unreachable — show offline notice and abort
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:grid;place-items:center;height:100vh;font-family:system-ui'
    const p = document.createElement('p')
    p.style.cssText = 'color:#6b7280;font-size:1rem'
    p.textContent = 'Server unreachable. Check your network connection.'
    wrap.appendChild(p)
    document.body.appendChild(wrap)
    return
  }

  setDeploymentPolicy(ENTERPRISE_POLICY)

  setAdapter(
    new RxDBAdapter({
      serverUrl,
      authHeader: `Bearer ${token}`,
      pullLimit: 200,
    }),
  )

  await init()
}

void bootstrap()
