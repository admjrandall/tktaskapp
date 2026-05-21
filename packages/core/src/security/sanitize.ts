// ── HTML SANITIZATION ─────────────────────────────────────────────────────────
// DOMPurify 3.x — OWASP-recommended client-side HTML sanitizer (2026).
// Used for all AI-generated and stored rich-text content before innerHTML
// assignment to prevent stored XSS via the document editor.
//
// Must remain a standalone module with no app-layer imports so it can be
// tree-shaken efficiently and imported early in the render pipeline.

import DOMPurify from 'dompurify'

const SAFE_TAGS = [
  'p',
  'div',
  'span',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'mark',
  'code',
  'pre',
  'kbd',
  'sub',
  'sup',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'a',
  'figure',
  'figcaption',
]

const SAFE_ATTRS = [
  'href',
  'target',
  'rel',
  'class',
  'id',
  'colspan',
  'rowspan',
  'scope',
  'start',
  'type',
  'reversed',
]

// Force all <a> tags to open safely and strip non-http(s)/mailto schemes.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const el = node as HTMLAnchorElement
    const href = el.getAttribute('href') ?? ''
    const scheme = (href.split(':')[0] ?? '').toLowerCase()
    if (!['http', 'https', 'mailto'].includes(scheme)) {
      el.removeAttribute('href')
    }
    el.setAttribute('target', '_blank')
    el.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * Sanitize arbitrary HTML (AI-generated or stored document content) against a
 * strict allowlist before assigning to innerHTML. Returns a plain string that
 * is then routed through the Trusted Types _rawPolicy by the patchInnerHTML
 * override in trusted-types.ts.
 */
export function sanitizeDocHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: SAFE_TAGS,
    ALLOWED_ATTR: SAFE_ATTRS,
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: false,
  })
}

/**
 * Validate a URL for use in document links.
 * Returns the URL if it uses http, https, or mailto — null otherwise.
 */
export function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return null
    return trimmed
  } catch {
    return null
  }
}

/**
 * Validate a dataUrl for use in href/src attributes for file records.
 * Only allows data: URIs (produced by FileReader.readAsDataURL) and https: URLs.
 * Rejects javascript:, vbscript:, and all other schemes to prevent XSS via
 * maliciously crafted vault import payloads.
 */
export function sanitizeDataUrl(url: unknown): string {
  if (typeof url !== 'string' || !url) return ''
  const trimmed = url.trim()
  if (trimmed.toLowerCase().startsWith('data:')) return trimmed
  try {
    const u = new URL(trimmed)
    if (u.protocol === 'https:') return trimmed
  } catch {
    /* invalid URL */
  }
  return ''
}
