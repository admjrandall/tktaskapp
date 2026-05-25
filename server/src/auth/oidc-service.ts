import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type {
  OidcService,
  OidcConfig,
  TokenResponse,
  AuthorizationUrlResult,
  TokenClaims,
} from './oidc.js'
import { getAuthStateStore } from './state-store.js'

export class OidcServiceImpl implements OidcService {
  async buildAuthorizationUrl(config: OidcConfig, state: string): Promise<AuthorizationUrlResult> {
    const { codeVerifier, codeChallenge } = await generatePkceAsync()
    const tenantId = process.env['ENTRA_TENANT_ID'] ?? 'common'
    const redirectUri = process.env['OIDC_REDIRECT_URI'] ?? 'http://localhost:3000/auth/callback'

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email offline_access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
    return { url, codeVerifier, codeChallenge }
  }

  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    config: OidcConfig,
  ): Promise<TokenResponse> {
    const tenantId = process.env['ENTRA_TENANT_ID'] ?? 'common'
    const redirectUri = process.env['OIDC_REDIRECT_URI'] ?? 'http://localhost:3000/auth/callback'
    const clientSecret = process.env['ENTRA_CLIENT_SECRET'] ?? ''

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: config.clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scope: 'openid profile email offline_access',
    })

    return _postTokenEndpoint(tenantId, body)
  }

  async validateToken(accessToken: string, config: OidcConfig): Promise<TokenClaims> {
    const rawPayload = _decodePayloadUnsafe(accessToken)
    const tid = rawPayload['tid']
    if (typeof tid !== 'string' || !tid) throw new Error('Missing tid claim')

    const jwksUrl = new URL(`https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`)
    const getKey = createRemoteJWKSet(jwksUrl, { cacheMaxAge: 24 * 60 * 60 * 1000 })

    const { payload } = await jwtVerify(accessToken, getKey, {
      issuer: `https://login.microsoftonline.com/${tid}/v2.0`,
      audience: config.clientId,
      algorithms: ['RS256'],
    })

    const sub = payload['sub']
    const iss = payload['iss']
    const aud = payload['aud']
    const exp = payload['exp']
    const iat = payload['iat']
    const rolesRaw = payload['roles']

    if (typeof sub !== 'string') throw new Error('Missing sub claim')
    if (typeof iss !== 'string') throw new Error('Missing iss claim')
    if (typeof exp !== 'number') throw new Error('Missing exp claim')
    if (typeof iat !== 'number') throw new Error('Missing iat claim')

    const roles = Array.isArray(rolesRaw) ? (rolesRaw as string[]) : []
    const scope = typeof payload['scp'] === 'string' ? payload['scp'] : ''

    return {
      sub,
      iss,
      aud: Array.isArray(aud) ? (aud[0] ?? '') : (aud ?? ''),
      exp,
      iat,
      tenantId: tid,
      roles,
      scope,
    }
  }

  async rotateRefreshToken(refreshToken: string, config: OidcConfig): Promise<TokenResponse> {
    const tenantId = process.env['ENTRA_TENANT_ID'] ?? 'common'
    const clientSecret = process.env['ENTRA_CLIENT_SECRET'] ?? ''

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: clientSecret,
      scope: 'openid profile email offline_access',
    })

    return _postTokenEndpoint(tenantId, body)
  }

  async revokeToken(
    token: string,
    config: OidcConfig,
    opts: { userId?: string; reason?: string } = {},
  ): Promise<void> {
    // ── Step 1: Add to local access-token blocklist ───────────────────────────
    // This is the reliable revocation path. The IdP call below is best-effort.
    const payload = _decodePayloadUnsafe(token)
    const exp = typeof payload['exp'] === 'number' ? payload['exp'] : 0
    const ttl = Math.max(60, exp - Math.floor(Date.now() / 1000))
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('base64url')

    try {
      const store = await getAuthStateStore()
      await store.revokeAccessToken(tokenHash, ttl, opts.userId, opts.reason ?? 'logout')
    } catch (err) {
      // Local revocation failure must surface — this is not best-effort
      throw new Error(`Failed to write token to revocation store: ${String(err)}`)
    }

    // ── Step 2: Best-effort IdP notification ─────────────────────────────────
    // Microsoft Entra ID v2.0 does not expose a standard RFC 7009 /revoke endpoint
    // for individual access tokens. For refresh-token revocation, the correct endpoint
    // is POST /oauth2/v2.0/token with token_type_hint=refresh_token.
    // For full session revocation, use Microsoft Graph: POST /users/{id}/revokeSignInSessions.
    // Either way, our local blocklist (Step 1) is the enforcement mechanism.
    const isLikelyRefreshToken =
      typeof payload['oid'] === 'undefined' && typeof payload['exp'] !== 'undefined'
    if (isLikelyRefreshToken && config.clientId) {
      const tenantId = process.env['ENTRA_TENANT_ID'] ?? 'common'
      const body = new URLSearchParams({
        token,
        token_type_hint: 'refresh_token',
        client_id: config.clientId,
        client_secret: process.env['ENTRA_CLIENT_SECRET'] ?? '',
      })
      // Per RFC 7009 §2.2, the server MUST respond 200 even for unrecognised tokens.
      // Non-200 is a server fault, but we treat it as non-fatal since Step 1 succeeded.
      try {
        await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })
      } catch {
        // IdP unreachable — local revocation in Step 1 still enforces the block
      }
    }
  }
}

async function _postTokenEndpoint(tenantId: string, body: URLSearchParams): Promise<TokenResponse> {
  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token endpoint error ${resp.status}: ${text}`)
  }

  const data = (await resp.json()) as Partial<Record<string, unknown>>
  const accessToken = data['access_token']
  const tokenType = data['token_type']
  const expiresIn = data['expires_in']
  const refreshToken = data['refresh_token']
  const idToken = data['id_token']
  const scope = data['scope']

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('Token endpoint response missing access_token')
  }

  return {
    accessToken,
    tokenType: tokenType === 'DPoP' ? 'DPoP' : 'Bearer',
    expiresIn: typeof expiresIn === 'number' ? expiresIn : 900,
    ...(typeof refreshToken === 'string' ? { refreshToken } : {}),
    idToken: typeof idToken === 'string' ? idToken : '',
    scope: typeof scope === 'string' ? scope : '',
  }
}

function _decodePayloadUnsafe(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')
  const payloadPart = parts[1]
  if (parts.length !== 3 || !payloadPart) throw new Error('Invalid JWT format')
  return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf-8')) as Record<
    string,
    unknown
  >
}

export async function generatePkceAsync(): Promise<{
  codeVerifier: string
  codeChallenge: string
}> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const codeVerifier = Buffer.from(array).toString('base64url')
  const codeChallenge = await createPkceChallengeForVerifier(codeVerifier)
  return { codeVerifier, codeChallenge }
}

export async function createPkceChallengeForVerifier(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier))
  return Buffer.from(hashBuffer).toString('base64url')
}
