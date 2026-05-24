import { createAuditedStaticHTML } from './security/trusted-types.js'

export function auditedStaticHtml(html: string): string {
  return createAuditedStaticHTML(html)
}

export function setAuditedStaticHtml(el: Element, html: string): void {
  el.innerHTML = createAuditedStaticHTML(html)
}

export function appendAuditedStaticHtml(el: Element, position: InsertPosition, html: string): void {
  el.insertAdjacentHTML(position, createAuditedStaticHTML(html))
}
