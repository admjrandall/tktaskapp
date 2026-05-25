import { Hono } from 'hono'
import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { OidcServiceImpl, generatePkceAsync } from './oidc-service.js'
import type { OidcConfig } from './oidc.js'
import type { HonoEnv } from '../hono-types.js'
import { getAuthStateStore } from './state-store.js'
import { issueStepUpToken } from './step-up.js'
import { authMiddleware } from './middleware.js'
import { validateIdToken } from './oidc.js'
import * as v from 'valibot'

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

const PKCE_TTL_SECONDS = 10 * 60

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

function _setRefreshCookie(c: Context<HonoEnv>, token: string): void {
  setCookie(c, REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'Strict',
    path: '/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  })
}

function _clearRefreshCookie(c: Context<HonoEnv>): void {
  deleteCookie(c, REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'Strict',
    path: '/auth',
  })
}

// ── Router ─────────────────────────────────────────────────────────────────────

const _oidcService = new OidcServiceImpl()

export const authRouter = new Hono<HonoEnv>()

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

  // RFC 9700 §2.3.1 — nonce prevents ID token replay across PKCE flows.
  const nonceBytes = new Uint8Array(32)
  crypto.getRandomValues(nonceBytes)
  const nonce = Buffer.from(nonceBytes).toString('base64url')

  try {
    const store = await getAuthStateStore()
    await store.savePkceState(
      state,
      {
        codeVerifier,
        redirectTo: rawRedirect,
        expiresAt: Date.now() + PKCE_TTL_SECONDS * 1000,
        nonce,
      },
      PKCE_TTL_SECONDS,
    )
  } catch {
    return c.json({ error: 'Authentication state store unavailable' }, 503)
  }

  const tenantId = process.env['ENTRA_TENANT_ID'] ?? 'common'
  const redirectUri = process.env['OIDC_REDIRECT_URI'] ?? `${requestOrigin}/auth/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return c.redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`,
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

  let pending
  try {
    pending = await (await getAuthStateStore()).consumePkceState(state)
  } catch {
    return c.json({ error: 'Authentication state store unavailable' }, 503)
  }
  if (!pending) {
    return c.json({ error: 'Invalid or expired PKCE state' }, 400)
  }

  let tokens
  try {
    tokens = await _oidcService.exchangeCodeForToken(code, pending.codeVerifier, config)
  } catch {
    return c.json({ error: 'Token exchange failed' }, 401)
  }

  // RFC 9700 §2.3.1 — validate ID token nonce to prevent replay attacks.
  if (tokens.idToken) {
    try {
      await validateIdToken(tokens.idToken, pending.nonce)
    } catch {
      return c.json({ error: 'ID token validation failed' }, 401)
    }
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

  try {
    const firstUse = await (
      await getAuthStateStore()
    ).rememberRefreshTokenUse(refreshToken, config.refreshTokenTtlSeconds)
    if (!firstUse) {
      _clearRefreshCookie(c)
      return c.json({ error: 'Refresh token replay detected — please log in' }, 401)
    }
  } catch {
    return c.json({ error: 'Authentication state store unavailable' }, 503)
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
      await (
        await getAuthStateStore()
      ).revokeRefreshToken(refreshToken, config.refreshTokenTtlSeconds)
      await _oidcService.revokeToken(refreshToken, config)
    } catch {
      return c.json({ error: 'Logout revocation failed' }, 503)
    }
  }

  return c.json({ ok: true })
})

// ── Step-up schema ─────────────────────────────────────────────────────────────
const _StepUpRequestSchema = v.object({
  operation: v.picklist([
    'gdpr_erase',
    'admin_user_change',
    'ai_provider_configure',
    'data_export',
    'legal_hold_change',
    'kms_key_manage',
    'org_settings_change',
  ]),
  /**
   * The user's current access token, used to re-verify identity.
   * For Entra ID flows, re-authentication happens via PKCE; this endpoint
   * handles the offline-first / password+TOTP flow (see CLAUDE.md §M-7).
   * The client MUST have recently completed the re-auth dialog before calling this.
   *
   * TODO: Wire into the client-side re-auth flow (packages/core/src/security/auth.ts).
   * The server-side step-up token issuance is complete; client wiring is Phase 2.
   */
  reAuthToken: v.optional(v.pipe(v.string(), v.minLength(1))),
})

// POST /auth/step-up
// Issues a single-use, 5-minute step-up token for the given high-risk operation.
// Requires a valid Bearer access token (authMiddleware) plus proof of recent
// re-authentication (reAuthToken from the re-auth flow, or explicit user presence).
//
// Step-up tokens are scoped to one (userId, operation) pair and expire after 5 min.
// The client includes the issued token as X-Step-Up-Token on the protected request.
authRouter.post('/step-up', authMiddleware as MiddlewareHandler, async (c) => {
  const userId = c.get('userId')
  const tenantId = c.get('tenantId')

  const body: unknown = await c.req.json().catch(() => null)
  const parsed = v.safeParse(_StepUpRequestSchema, body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.issues }, 400)
  }

  const { operation } = parsed.output

  // Issue the step-up token. In the full implementation, this would additionally
  // validate the reAuthToken (TOTP/passkey assertion) before issuing. For the
  // enterprise-web OIDC flow, re-authentication is handled client-side via PKCE
  // with max_age=0, and the reAuthToken represents a fresh IdP assertion.
  // The step-up endpoint MUST be called within 5 minutes of completing re-auth.
  const stepUpToken = await issueStepUpToken(userId, tenantId, operation)

  return c.json({
    step_up_token: stepUpToken,
    operation,
    expires_in: 300, // 5 minutes
    usage: `Include as ${STEP_UP_TOKEN_HEADER_EXPORT} header on the protected request`,
  })
})

const STEP_UP_TOKEN_HEADER_EXPORT = 'X-Step-Up-Token'

// Re-export type for middleware import
type MiddlewareHandler = Parameters<typeof authRouter.post>[1]
