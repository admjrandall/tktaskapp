// ── CORS configuration ─────────────────────────────────────────────────────────
// Wire this into the HTTP framework (Express / Hono / Fastify) when the server
// entry point is created. The ALLOW_ORIGINS env var controls permitted origins.
//
// Deployment note:
//   ALLOW_ORIGINS=https://app.example.com,https://admin.example.com
//   Separate multiple origins with commas. Wildcards are intentionally not
//   supported — explicitly enumerate every permitted origin.
//
// The API uses Bearer tokens (Authorization header), not cookies.
// credentials: false keeps the CORS attack surface minimal.

const _rawOrigins = (process.env['ALLOW_ORIGINS'] ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(_rawOrigins)

export interface CorsOptions {
  readonly allowedOrigins: ReadonlySet<string>
  readonly allowCredentials: boolean
  readonly exposedHeaders: readonly string[]
}

export const corsOptions: CorsOptions = {
  allowedOrigins: ALLOWED_ORIGINS,
  allowCredentials: false,
  exposedHeaders: [],
}

/**
 * Returns the CORS headers to apply for a given request origin.
 * Returns an empty object if the origin is not in the allow-list (the
 * browser will block the request without any CORS error leaking server info).
 */
export function corsHeaders(requestOrigin: string | undefined): Record<string, string> {
  if (!requestOrigin || !ALLOWED_ORIGINS.has(requestOrigin)) {
    return {}
  }
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': requestOrigin,
    Vary: 'Origin',
  }
  if (corsOptions.exposedHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = corsOptions.exposedHeaders.join(', ')
  }
  return headers
}

/**
 * Returns the headers for an OPTIONS preflight response.
 * Only called after corsHeaders() has confirmed the origin is permitted.
 */
export function corsPreflight(requestOrigin: string): Record<string, string> {
  return {
    ...corsHeaders(requestOrigin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID, X-Step-Up-Token',
    'Access-Control-Max-Age': '86400',
  }
}
