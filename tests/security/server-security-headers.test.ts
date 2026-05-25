import { describe, expect, it } from 'vitest'
import { securityHeaders } from '../../server/src/middleware/security-headers.js'

describe('server security headers', () => {
  it('sets browser hardening headers on enterprise HTML responses', async () => {
    const headers = new Map<string, string>()
    const middleware = securityHeaders()

    await middleware(
      {
        req: { path: '/' },
        header: (name: string, value: string) => headers.set(name.toLowerCase(), value),
      } as never,
      async () => {},
    )

    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('permissions-policy')).toContain('camera=()')
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(headers.get('origin-agent-cluster')).toBe('?1')
    expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(headers.get('content-security-policy')).toContain("require-trusted-types-for 'script'")
  })

  it('does not attach an enterprise page CSP to API JSON responses', async () => {
    const headers = new Map<string, string>()
    const middleware = securityHeaders()

    await middleware(
      {
        req: { path: '/api/v1/health' },
        header: (name: string, value: string) => headers.set(name.toLowerCase(), value),
      } as never,
      async () => {},
    )

    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('content-security-policy')).toBeUndefined()
  })
})
