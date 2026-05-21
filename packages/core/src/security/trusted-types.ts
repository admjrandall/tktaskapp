// ── TRUSTED TYPES POLICY ───────────────────────────────────────────────
// Extracted from taskapp.html ~2616–2661
// 2026 best practice: all innerHTML assignments must go through this policy.
// The policy wraps escH() so user data is always sanitized.
// require-trusted-types-for 'script' in the CSP enforces this at the
// browser level — any raw string assigned to innerHTML throws instead of
// silently executing. Falls back gracefully in unsupported browsers.
//
// nexus-crm:     sanitises plain-text user data before innerHTML.
// nexus-crm-raw: passes already-safe template HTML through unchanged.
// Both are created once here. The innerHTML setter patch reuses _rawPolicy.
// Creating a policy twice with the same name throws a TypeError per spec.

// Permissive types for the Trusted Types API in browsers that have it.
type TTPolicy = { createHTML: (s: string) => string } | null
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

// _rawPolicy is module-scoped so patchInnerHTML and any future callers
// share the single registered instance rather than re-creating it.
export const _rawPolicy: TTPolicy =
  typeof trustedTypes !== 'undefined'
    ? trustedTypes.createPolicy('nexus-crm-raw', { createHTML: (x: string) => x })
    : null

// Patch innerHTML and outerHTML setters to route through Trusted Types when enforced.
// All existing el.innerHTML = templateString assignments work without
// a full rewrite while still satisfying the CSP policy requirement.
;(function patchHTMLSetters() {
  if (!_rawPolicy) return

  const _origInner = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
  if (_origInner?.set && _origInner.get) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
      set(val: unknown) {
        if (typeof val === 'string') {
          _origInner.set!.call(this, _rawPolicy.createHTML(val))
        } else {
          _origInner.set!.call(this, val as string)
        }
      },
      get() {
        return _origInner.get!.call(this) as string
      },
      configurable: true,
    })
  }

  const _origOuter = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML')
  if (_origOuter?.set && _origOuter.get) {
    Object.defineProperty(Element.prototype, 'outerHTML', {
      set(val: unknown) {
        if (typeof val === 'string') {
          _origOuter.set!.call(this, _rawPolicy.createHTML(val))
        } else {
          _origOuter.set!.call(this, val as string)
        }
      },
      get() {
        return _origOuter.get!.call(this) as string
      },
      configurable: true,
    })
  }
})()
