import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../hono-types.js'

function _splitOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin) => !origin.includes('*'))
}

function _enterpriseConnectSrc(): string {
  const configured = [
    ..._splitOrigins(process.env['ALLOW_ORIGINS']),
    ..._splitOrigins(process.env['ENTERPRISE_CSP_CONNECT_SRC']),
  ]
  const defaultAiOrigins = [
    'https://api.anthropic.com',
    'https://api.openai.com',
    'https://generativelanguage.googleapis.com',
  ]
  return ["'self'", ...defaultAiOrigins, ...configured].join(' ')
}

function _enterpriseCsp(): string {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${_enterpriseConnectSrc()}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    'trusted-types nexus-crm nexus-crm-static-template dompurify',
    "require-trusted-types-for 'script'",
  ].join('; ')
}

export const enterpriseContentSecurityPolicy = _enterpriseCsp()

export function securityHeaders(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()',
    )
    c.header('Cross-Origin-Opener-Policy', 'same-origin')
    c.header('Cross-Origin-Resource-Policy', 'same-origin')
    c.header('Origin-Agent-Cluster', '?1')

    if (process.env['NODE_ENV'] !== 'development') {
      const preload = process.env['SECURITY_HEADERS_HSTS_PRELOAD'] === 'true' ? '; preload' : ''
      c.header('Strict-Transport-Security', `max-age=63072000; includeSubDomains${preload}`)
    }

    if (!c.req.path.startsWith('/api/') && !c.req.path.startsWith('/auth/')) {
      c.header('Content-Security-Policy', enterpriseContentSecurityPolicy)
    }

    await next()
  }
}
