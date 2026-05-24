// ── TRUSTED TYPES POLICY ───────────────────────────────────────────────
// Trusted Types are an enforcement boundary, not a compatibility shim.
// Dynamic user text must be escaped with escH(), and stored/AI rich text must
// be sanitized before it reaches the render helper. The raw policy below is
// intentionally module-private; callers can only request audited static HTML
// through render-utils.ts.

// Permissive types for the Trusted Types API in browsers that have it.
type TrustedHtmlValue = string
type TTPolicy = { createHTML: (s: string) => TrustedHtmlValue } | null
declare global {
  interface Window {
    trustedTypes?: {
      createPolicy: (name: string, rules: { createHTML: (s: string) => string }) => TTPolicy
    }
  }

  var trustedTypes: Window['trustedTypes']
}

export const _ttPolicy: TTPolicy =
  typeof trustedTypes !== 'undefined'
    ? trustedTypes.createPolicy('nexus-crm', {
        createHTML: (s: string) =>
          s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;'),
      })
    : null

const _staticTemplatePolicy: TTPolicy =
  typeof trustedTypes !== 'undefined'
    ? trustedTypes.createPolicy('nexus-crm-static-template', { createHTML: (x: string) => x })
    : null

export function createAuditedStaticHTML(html: string): string {
  return _staticTemplatePolicy ? _staticTemplatePolicy.createHTML(html) : html
}
