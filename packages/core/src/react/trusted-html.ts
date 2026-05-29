// ── Trusted Types bridge for React ───────────────────────────────────────────
//
// The offline-web CSP enforces `require-trusted-types-for 'script'`, so any HTML
// fed to a DOM innerHTML sink — including React's `dangerouslySetInnerHTML` — must
// be a value produced by an allow-listed Trusted Types policy, not a raw string.
//
// This routes through the existing `nexus-crm-static-template` policy
// (`createAuditedStaticHTML`), the single audited static-HTML sink shared with the
// legacy render pipeline. Only pass HTML that is already escaped/sanitised
// (`escH()` or DOMPurify) or trusted-static (e.g. inline SVG from `Icons`).
//
// In React, prefer plain JSX (auto-escaped) for all user data. Reach for this
// helper only for trusted static markup such as icon SVG strings.

import { createAuditedStaticHTML } from '../security/trusted-types.js'

/**
 * Wrap audited static HTML for use as a React `dangerouslySetInnerHTML` prop.
 * The returned `__html` carries a TrustedHTML value (at runtime, when Trusted
 * Types is enforced), satisfying the offline CSP.
 */
export function dangerousAuditedHtml(html: string): { __html: string } {
  return { __html: createAuditedStaticHTML(html) }
}
