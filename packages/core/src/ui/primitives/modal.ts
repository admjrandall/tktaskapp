// ── MODAL PRIMITIVE ──────────────────────────────────────────────────────────
import { escH } from '../../utils.js'

export interface ModalProps {
  id: string
  title: string
  body: string
  footer?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  backdropId?: string
  ariaDescribedby?: string
  extraClass?: string
}

const SIZE_WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  sm: '360px',
  md: '480px',
  lg: '640px',
  xl: '800px',
  full: '96vw',
}

export function renderModal(p: ModalProps): string {
  const w = SIZE_WIDTH[p.size ?? 'md']
  const backdropId = p.backdropId ?? `${p.id}-backdrop`
  const describedBy = p.ariaDescribedby ? ` aria-describedby="${p.ariaDescribedby}"` : ''
  const extraCls = p.extraClass ? ` ${p.extraClass}` : ''

  const footerHtml = p.footer ? `<div class="modal-footer">${p.footer}</div>` : ''

  return `<div class="modal-backdrop" id="${backdropId}" role="dialog" aria-modal="true" aria-labelledby="${p.id}-title"${describedBy}>
  <div class="modal${extraCls}" style="max-width:${w};width:100%">
    <div class="modal-header">
      <span class="modal-title" id="${p.id}-title">${escH(p.title)}</span>
      <button type="button" class="btn btn-ghost btn-icon btn-sm modal-close" data-modal-close="${p.id}" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="modal-body">${p.body}</div>
    ${footerHtml}
  </div>
</div>`
}

export function bindModalClose(id: string, onClose: () => void): void {
  const backdropId = `${id}-backdrop`
  document.getElementById(backdropId)?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === backdropId) onClose()
  })
  document.querySelectorAll<HTMLElement>(`[data-modal-close="${id}"]`).forEach((btn) => {
    btn.addEventListener('click', onClose)
  })
  const esc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', esc)
      onClose()
    }
  }
  document.addEventListener('keydown', esc)
}
