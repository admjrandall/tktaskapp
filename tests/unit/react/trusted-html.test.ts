import { describe, expect, it } from 'vitest'
import { dangerousAuditedHtml } from '@core/react/trusted-html.js'

/**
 * The Trusted Types bridge for React's dangerouslySetInnerHTML (roadmap Phase 2,
 * #5/ADR-M-015). Runs in the node env: when Trusted Types is unavailable (as in
 * Node), `createAuditedStaticHTML` returns the string unchanged, so we assert the
 * shape and passthrough. Browser TrustedHTML enforcement is covered by the offline
 * CSP at runtime.
 */
describe('dangerousAuditedHtml', () => {
  it('wraps HTML in a React __html prop', () => {
    const result = dangerousAuditedHtml('<svg aria-hidden="true"></svg>')
    expect(result).toHaveProperty('__html')
    expect(typeof result.__html).toBe('string')
  })

  it('passes trusted static markup through unchanged (node: no TT enforcement)', () => {
    const svg = '<svg width="14"><path d="M0 0h14v14H0z"/></svg>'
    expect(dangerousAuditedHtml(svg).__html).toBe(svg)
  })

  it('preserves empty string', () => {
    expect(dangerousAuditedHtml('').__html).toBe('')
  })
})
