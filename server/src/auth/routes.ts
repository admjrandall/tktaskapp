import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { OidcServiceImpl, generatePkceAsync } from './oidc-service.js'
import type { OidcConfig } from './oidc.js'

// ── OIDC config ────────────────────────────────────────────────────────────────
// Populated from env vars at module evaluation time. The server refuses /auth/*
// requests with 503 if ENTRA_CLIENT_ID is absent (rather than silently breaking).

function _oidcConfig(): OidcConfig {
  return {
    issuer: `https://login.microsoftonline.com/${process.env['ENTRA_TENANT_ID'] ?? 'common'}/v2.0`,
    clientId: process.env['ENTRA_CLIENT_ID'] ?? '',
    codeChallengeMethod: 'S256',
    accessTokenTtlSeconds: 900, // 15 min — RFC 9700 §2.2.2
    refreshTokenTtlSeconds: 30 * 24 * 60 * 60, // 30 days
    requireDPoP: false,
  }
}

// ── Cookie names ────────────────────────────────────────────────────────────────
const REFRESH_COOKIE = 'tk_refresh_token'
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

// ── PKCE state store ────────────────────────────────────────────────────────────
// Maps random state nonce → { codeVerifier, redirectTo, expiresAt }.
// TTL: 10 minutes — sufficient for any browser redirect round-trip.
// Production note: replace with a Redis SET when running multiple server instances.

interface PkceEntry {
  codeVerifier: string
  redirectTo: string
  expiresAt: number
}

const _pendingStates = new Map<string, PkceEntry>()

function _cleanExpiredStates(): void {
  const now = Date.now()
  for (const [k, v] of _pendingStates) {
    if (v.expiresAt < now) _pendingStates.delete(k)
  }
}

setInterval(_cleanExpiredStates, 5 * 60 * 1000).unref()

// ── Redirect allowlist ─────────────────────────────────────────────────────────
// Validates that the post-login redirect target is same-origin or a configured
// allowed origin. Prevents open-redirect attacks (RFC 9700 §4.10).

function _isAllowedRedirect(redirectTo: string, requestOrigin: string): boolean {
  const allowed = (process.env['ALLOW_ORIGINS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Relative paths (starting with /) are always safe — same origin by definition.
  if (redirectTo.startsWith('/') && !redirectTo.startsWith('//')) return true

  try {
    const url = new URL(redirectTo)
    const origin = `${url.protocol}//${url.host}`
    return origin === requestOrigin || allowed.includes(origin)
  } catch {
    return false
  }
}

// ── Cookie helpers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _setRefreshCookie(c: any, token: string): void {
  setCookie(c, REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'Strict',
    path: '/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _clearRefreshCookie(c: any): void {
  deleteCookie(c, REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'Strict',
    path: '/auth',
  })
}

// ── Router ─────────────────────────────────────────────────────────────────────

const _oidcService = new OidcServiceImpl()

export const authRouter = new Hono()

// GET /auth/login
// Initiates PKCE flow: generates code_verifier + state, stores them, redirects to IdP.
authRouter.get('/login', async (c) => {
  const config = _oidcConfig()
  if (!config.clientId) {
    return c.json({ error: 'OIDC not configured on this server' }, 503)
  }

  const rawRedirect = c.req.query('redirect') ?? '/'
  const reqUrl = new URL(c.req.url)
  const requestOrigin = `${reqUrl.protocol}//${reqUrl.host}`

  if (!_isAllowedRedirect(rawRedirect, requestOrigin)) {
    return c.json({ error: 'Redirect target not allowed' }, 400)
  }

  const { codeVerifier, codeChallenge } = await generatePkceAsync()

  const stateBytes = new Uint8Array(32)
  crypto.getRandomValues(stateBytes)
  const state = Buffer.from(stateBytes).toString('base64url')

  _pendingStates.set(state, {
    codeVerifier,
    redirectTo: rawRedirect,
    expiresAt: Date.now() + 10 * 60 * 1000,
  })

  const tenantId = process.env['ENTRA_TENANT_ID'] ?? 'common'
  const redirectUri = process.env['OIDC_REDIRECT_URI'] ?? `${requestOrigin}/auth/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return c.redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`,
    302,
  )
})

// GET /auth/callback
// Receives IdP redirect. Validates state (CSRF guard), exchanges code for tokens,
// sets HttpOnly refresh cookie, redirects back to the app.
// Access token is NOT placed in the URL — client calls POST /auth/refresh to get it.
authRouter.get('/callback', async (c) => {
  const config = _oidcConfig()
  const error = c.req.query('error')
  if (error) {
    const desc = c.req.query('error_description') ?? error
    return c.json({ error: `IdP error: ${desc}` }, 401)
  }

  const code = c.req.query('code')
  const state = c.req.query('state')
  if (!code || !state) {
    return c.json({ error: 'Missing code or state parameter' }, 400)
  }

  const pending = _pendingStates.get(state)
  if (!pending || pending.expiresAt < Date.now()) {
    _pendingStates.delete(state)
    return c.json({ error: 'Invalid or expired PKCE state' }, 400)
  }
  _pendingStates.delete(state)

  let tokens
  try {
    tokens = await _oidcService.exchangeCodeForToken(code, pending.codeVerifier, config)
  } catch {
    return c.json({ error: 'Token exchange failed' }, 401)
  }

  if (tokens.refreshToken) {
    _setRefreshCookie(c, tokens.refreshToken)
  }

  // Redirect to app with no token in URL. Client must call POST /auth/refresh.
  return c.redirect(pending.redirectTo, 302)
})

// POST /auth/refresh
// Silent access-token refresh. Reads HttpOnly refresh cookie, rotates tokens,
// returns new access_token as JSON. Client stores it in memory only.
authRouter.post('/refresh', async (c) => {
  const config = _oidcConfig()
  const refreshToken = getCookie(c, REFRESH_COOKIE)
  if (!refreshToken) {
    return c.json({ error: 'No refresh token — please log in' }, 401)
  }

  let tokens
  try {
    tokens = await _oidcService.rotateRefreshToken(refreshToken, config)
  } catch {
    _clearRefreshCookie(c)
    return c.json({ error: 'Refresh token expired or revoked — please log in' }, 401)
  }

  if (tokens.refreshToken) {
    _setRefreshCookie(c, tokens.refreshToken)
  }

  return c.json({
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: tokens.expiresIn,
  })
})

// POST /auth/logout
// Clears the HttpOnly refresh cookie and requests IdP revocation.
// The access token expires naturally at its 15-min TTL.
authRouter.post('/logout', async (c) => {
  const config = _oidcConfig()
  const refreshToken = getCookie(c, REFRESH_COOKIE)
  _clearRefreshCookie(c)

  if (refreshToken && config.clientId) {
    try {
      await _oidcService.revokeToken(refreshToken, config)
    } catch {
      // Best-effort revocation — cookie is already cleared regardless.
    }
  }

  return c.json({ ok: true })
})
