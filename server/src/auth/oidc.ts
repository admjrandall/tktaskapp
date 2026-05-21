// OIDC/PKCE authentication server — interface stub.
// TODO: Implement when server-side identity infrastructure is ready.
//
// Section 11.1 — Identity: OIDC with PKCE mandatory
//
// RFC references:
//   RFC 9700 (OAuth 2.0 Security BCP, ratified 2025):
//     - Mandatory PKCE (S256 only) for all authorization code flows.
//     - Implicit flow and hybrid flow explicitly deprecated — not acceptable for 2026.
//   RFC 9449 (DPoP): token binding for high-assurance enterprise customers.
//     Design the token layer to accommodate DPoP as a near-term addition.
//   OpenID Connect Core 1.0: token endpoint, userinfo endpoint, ID token validation.
//
// Implementation requirements:
//   1. Authorization code flow + PKCE (S256 code challenge method only).
//   2. Short-lived access tokens: 15 minutes (900 seconds).
//   3. Refresh token rotation: one-time-use; server-side revocation list.
//   4. Step-up re-authentication required for: data export, admin changes,
//      AI provider changes, destructive operations, legal hold actions.
//   5. DPoP (RFC 9449): design the token handling layer to support it as a
//      near-term addition for high-assurance customers.
//   6. Never issue tokens via implicit flow or hybrid flow.

export type CodeChallengeMethod = 'S256'
// 'plain' is intentionally absent — RFC 9700 prohibits it in new implementations.

export interface OidcConfig {
  /** OIDC issuer URL — must match the `iss` claim in all issued ID tokens. */
  readonly issuer: string
  /** Client ID registered at the IdP. */
  readonly clientId: string
  /** PKCE code challenge method. S256 is the only acceptable value. */
  readonly codeChallengeMethod: CodeChallengeMethod
  /** Access token lifetime in seconds. Must not exceed 900 (15 minutes). */
  readonly accessTokenTtlSeconds: number
  /** Refresh token lifetime in seconds. Tokens are one-time-use and rotated on every use. */
  readonly refreshTokenTtlSeconds: number
  /** Require DPoP token binding (RFC 9449). Set true for high-assurance deployments. */
  readonly requireDPoP: boolean
}

export interface TokenClaims {
  /** Subject — stable, opaque user identifier from the IdP. */
  readonly sub: string
  readonly iss: string
  readonly aud: string
  /** Expiry as Unix timestamp seconds. */
  readonly exp: number
  readonly iat: number
  /**
   * Tenant identifier — resolved from IdP claim mapping at token validation time.
   * Must never be taken from the request body or query string.
   */
  readonly tenantId: string
  /**
   * User roles — resolved from IdP groups/claims, never from request body.
   * Policy engine consumes these; never trust client-supplied roles.
   */
  readonly roles: readonly string[]
  readonly scope: string
}

export type TokenType = 'Bearer' | 'DPoP'

export interface TokenResponse {
  readonly accessToken: string
  readonly tokenType: TokenType
  readonly expiresIn: number
  readonly refreshToken?: string
  readonly idToken: string
  readonly scope: string
}

export interface AuthorizationUrlResult {
  readonly url: string
  /** S256 PKCE code verifier — store in server-side session; never send to client. */
  readonly codeVerifier: string
  readonly codeChallenge: string
}

export interface OidcService {
  /**
   * Build the IdP authorization URL for PKCE flow.
   * Returns the URL to redirect the user to, plus the code verifier to store
   * in the server-side session (never the client).
   */
  buildAuthorizationUrl(config: OidcConfig, state: string): AuthorizationUrlResult

  /**
   * Exchange an authorization code + PKCE code verifier for tokens.
   * Validates the ID token signature and claims before returning.
   */
  exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    config: OidcConfig,
  ): Promise<TokenResponse>

  /**
   * Validate an access token and extract its claims.
   * Performs signature verification, expiry check, issuer check, and audience check.
   * Throws on any validation failure — never return partial claims.
   */
  validateToken(accessToken: string, config: OidcConfig): Promise<TokenClaims>

  /**
   * Rotate a refresh token (one-time-use).
   * Invalidates the provided token after issuing a new pair.
   * Throws if the token is expired, already used, or on the revocation list.
   */
  rotateRefreshToken(refreshToken: string, config: OidcConfig): Promise<TokenResponse>

  /**
   * Add a token to the server-side revocation list.
   * Called on: logout, step-up failure, suspicious activity detection.
   */
  revokeToken(token: string, config: OidcConfig): Promise<void>
}

// TODO: implement OidcServiceImpl implements OidcService
//   - Use a well-audited OIDC client library (e.g. openid-client)
//   - Persist revocation list in server DB with TTL equal to token lifetime
//   - server/src/auth/dpop.ts — RFC 9449 DPoP token binding (near-term)
//   - server/src/auth/saml.ts — SAML 2.0 SP-initiated (only if buyer requires; prefer OIDC)
//   - server/src/auth/scim.ts — SCIM 2.0 provisioning/deprovisioning
//   - server/src/auth/step-up.ts — re-authentication gate for high-risk operations
