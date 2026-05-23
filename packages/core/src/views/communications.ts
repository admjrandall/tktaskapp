// ── COMMUNICATIONS ──────────────────────────────────────────────────────────────
// Activity log view: calls, emails, meetings, notes linked to clients/people/projects.

import { escH, formatRelative as _formatRelative, formatDate } from '../utils.js'
import { Icons } from '../ui/icons.js'
import { renderEmpty } from '../ui/components.js'
import { dbGetAll, dbDelete } from '../storage/db.js'
import {
  getState as _getState,
  showConfirm,
  showToast,
  openRecordModal,
  reloadData,
} from '../state.js'
import type { AppState } from '../state.js'

type AnyRecord = Record<string, unknown>

let _appRenderWorkspace: (view: string) => void = () => {}
export function setCommunicationsHooks(appRenderWorkspace: (view: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace
}

type CommFilter = 'all' | 'Call' | 'Email' | 'Meeting' | 'Note' | 'Other'
let _commFilter: CommFilter = 'all'

function commTypeIcon(type: string): string {
  switch (type) {
    case 'Call':
      return `<span title="Call" style="font-size:.85rem">📞</span>`
    case 'Email':
      return `<span title="Email" style="font-size:.85rem">✉️</span>`
    case 'Meeting':
      return `<span title="Meeting" style="font-size:.85rem">${Icons.Calendar(14)}</span>`
    case 'Note':
      return `<span title="Note" style="font-size:.85rem">${Icons.Notes(14)}</span>`
    default:
      return `<span title="${escH(type)}" style="font-size:.85rem">💬</span>`
  }
}

function resolveRelatedName(comm: AnyRecord): string {
  if (comm.clientId) {
    const client = (dbGetAll('clients') as AnyRecord[]).find((c) => c.id === comm.clientId)
    if (client) return escH(String(client.name || 'Client'))
  }
  if (comm.personId) {
    const person = (dbGetAll('people') as AnyRecord[]).find((p) => p.id === comm.personId)
    if (person) return escH(String(person.name || 'Person'))
  }
  if (comm.relatedStore && comm.relatedId) {
    const records = dbGetAll(String(comm.relatedStore)) as AnyRecord[]
    const rec = records.find((r) => r.id === comm.relatedId)
    if (rec) return escH(String(rec.name || rec.title || String(comm.relatedId)))
  }
  return '—'
}

export function renderCommunications(state: AppState): string {
  let items = (state.communications as AnyRecord[])
    .slice()
    .sort(
      (a, b) =>
        new Date(String(b.occurredAt || b.createdAt || '')).getTime() -
        new Date(String(a.occurredAt || a.createdAt || '')).getTime(),
    )
  if (_commFilter !== 'all') {
    items = items.filter((c) => c.type === _commFilter)
  }

  const filters: CommFilter[] = ['all', 'Call', 'Email', 'Meeting', 'Note', 'Other']
  const filterBar = `<div style="display:flex;gap:.375rem;flex-wrap:wrap">${filters
    .map(
      (f) =>
        `<button class="btn btn-sm ${_commFilter === f ? 'btn-primary' : 'btn-secondary'}" data-comm-filter="${f}">${f === 'all' ? 'All' : f}</button>`,
    )
    .join('')}</div>`

  const rows = items
    .map((c) => {
      const relName = resolveRelatedName(c)
      const dur =
        (c.type === 'Call' || c.type === 'Meeting') && c.durationMinutes
          ? ` · ${c.durationMinutes}m`
          : ''
      return `<div style="display:flex;align-items:center;gap:.75rem;padding:.625rem .75rem;border-radius:var(--radius-md);background:var(--bg-surface);border:1px solid var(--border-subtle);margin-bottom:.375rem">
        <div style="flex-shrink:0;width:28px;text-align:center">${commTypeIcon(String(c.type || ''))}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.875rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(c.subject || ''))}</div>
          <div style="font-size:.75rem;color:var(--text-tertiary)">${relName}${dur}</div>
        </div>
        <div style="font-size:.75rem;color:var(--text-tertiary);white-space:nowrap">${formatDate(String(c.occurredAt || ''))}</div>
        <button class="btn btn-ghost btn-icon btn-sm" data-comm-edit="${escH(String(c.id))}" title="Edit">${Icons.Edit(14)}</button>
        <button class="btn btn-ghost btn-icon btn-sm" style="color:var(--priority-high)" data-comm-del="${escH(String(c.id))}" title="Delete">${Icons.Delete(14)}</button>
      </div>`
    })
    .join('')

  const body = items.length
    ? rows
    : renderEmpty(
        Icons.Bell(40),
        'No activity logged yet',
        'Use Log Activity to record calls, emails, and meetings.',
      )

  return `<div style="display:flex;flex-direction:column;height:100%">
    <div class="workspace-toolbar">
      <span style="font-weight:600">Communications</span>
      <div style="flex:1"></div>
      ${filterBar}
      <button class="btn btn-primary btn-sm" id="log-activity-btn">${Icons.Plus(14)} Log Activity</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:1.25rem">${body}</div>
  </div>`
}

export function bindCommunications(_state?: AppState): void {
  document.getElementById('log-activity-btn')?.addEventListener('click', () => {
    openRecordModal('communications')
  })

  document.querySelectorAll<HTMLElement>('[data-comm-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _commFilter = (btn.dataset as DOMStringMap & { commFilter: string }).commFilter as CommFilter
      _appRenderWorkspace('communications')
    })
  })

  document.querySelectorAll<HTMLElement>('[data-comm-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn.dataset as DOMStringMap & { commEdit: string }).commEdit
      openRecordModal('communications', id)
    })
  })

  document.querySelectorAll<HTMLElement>('[data-comm-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn.dataset as DOMStringMap & { commDel: string }).commDel
      showConfirm('Delete this activity log entry?', async () => {
        await dbDelete('communications', id)
        reloadData()
        showToast('Entry deleted', 'success')
        _appRenderWorkspace('communications')
      })
    })
  })
}
