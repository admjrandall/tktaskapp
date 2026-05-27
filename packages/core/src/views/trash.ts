// ── TRASH ─────────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 4434–4443.

import { escH, formatRelative, plural, initials, avatarColor } from '../utils.js'
import { Icons } from '../ui/icons.js'
import { renderEmpty } from '../ui/components.js'
import { dbGetAll, permanentDelete, restoreFromTrash } from '../storage/db.js'
import { reloadData, showToast, showConfirm } from '../state.js'
import type { AppState } from '../state.js'

type AnyRecord = Record<string, unknown>

export function renderTrash(state: AppState): string {
  const { trash } = state
  const tArr = trash as AnyRecord[]
  if (!tArr.length)
    return `<div style="flex:1;display:flex;align-items:center;justify-content:center">${renderEmpty(Icons.Trash(48), 'Recycle Bin is empty')}</div>`
  return `<div style="display:flex;flex-direction:column;height:100%"><div class="workspace-toolbar" style="justify-content:space-between"><span style="font-weight:600">Recycle Bin — ${plural(tArr.length, 'item')}</span><button class="btn btn-danger btn-sm" id="empty-trash">Empty Recycle Bin</button></div><div style="flex:1;overflow-y:auto">${tArr
    .map((r) => {
      const name = String(r.name || r.title || 'Untitled')
      const [bg, fg] = avatarColor(name)
      return `<div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-bottom:1px solid var(--border-subtle)"><div class="avatar avatar-sm" style="background:${bg};color:${fg}">${escH(initials(name))}</div><div style="flex:1;min-width:0"><div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(name)}</div><div style="font-size:.75rem;color:var(--text-tertiary)">${escH(String(r._store || ''))} · ${formatRelative(String(r.deletedAt || ''))}</div></div><button class="btn btn-secondary btn-sm" data-restore="${r.id}">${Icons.Restore(14)} Restore</button><button class="btn btn-danger btn-sm" data-perma="${r.id}">${Icons.Delete(14)}</button></div>`
    })
    .join('')}</div></div>`
}

export function bindTrash(): void {
  document.getElementById('empty-trash')?.addEventListener('click', () => {
    showConfirm(
      'Permanently delete everything in the Recycle Bin? This cannot be undone.',
      async () => {
        for (const i of dbGetAll('trash') as AnyRecord[]) await permanentDelete(String(i.id))
        reloadData()
        showToast('Recycle Bin emptied', 'success')
      },
    )
  })
  document.querySelectorAll<HTMLElement>('[data-restore]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await restoreFromTrash((btn.dataset as DOMStringMap & { restore: string }).restore)
      reloadData()
      showToast('Restored', 'success')
    })
  })
  document.querySelectorAll<HTMLElement>('[data-perma]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showConfirm('Permanently delete?', async () => {
        await permanentDelete((btn.dataset as DOMStringMap & { perma: string }).perma)
        reloadData()
        showToast('Deleted', 'success')
      })
    })
  })
}
