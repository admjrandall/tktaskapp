// patchInnerHTML is the required wrapper for all innerHTML assignments in the app.
// Element.prototype.innerHTML is already patched by security/trusted-types.ts to route
// through the nexus-crm-raw Trusted Types policy. This function is an explicit,
// auditable marker for every HTML insertion point — required by the no-restricted-syntax
// ESLint rule in the core views override block.
export function patchInnerHTML(html: string): string {
  return html
}
