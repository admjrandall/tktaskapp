// ── VIEWS: List / Grid / Kanban / Spatial ────────────────────────────────────
// Extracted from taskapp.html lines 3544–3663.

import { escH, formatRelative, initials, avatarColor } from '../utils.js'
import { dbGetAll, dbUpdate } from '../storage/db.js'
import { renderEmpty, renderPriorityBadge, renderDueBadge } from '../ui/components.js'
import { Icons } from '../ui/icons.js'

type AnyRecord = Record<string, unknown>

export function stageBadge(s: unknown): string {
  const m: Record<string, string> = {
    Lead: 'badge-slate',
    Active: 'badge-indigo',
    Review: 'badge-amber',
    'On Hold': 'badge-slate',
    Done: 'badge-green',
    Cancelled: 'badge-rose',
  }
  return s ? `<span class="badge ${m[String(s)] || 'badge-slate'}">${s}</span>` : ''
}
export function statusBadge(s: unknown): string {
  const m: Record<string, string> = {
    Todo: 'badge-slate',
    'In Progress': 'badge-indigo',
    Blocked: 'badge-rose',
    Done: 'badge-green',
  }
  return s ? `<span class="badge ${m[String(s)] || 'badge-slate'}">${s}</span>` : ''
}

export function renderListView(
  store: string,
  records: AnyRecord[],
  onOpen: (id: string) => void,
  sortField: string,
  sortDir: string,
  _onSort: (f: string) => void,
): string {
  const colMap: Record<string, [string, string][]> = {
    clients: [
      ['name', 'Name'],
      ['contactName', 'Contact'],
      ['email', 'Email'],
      ['updatedAt', 'Updated'],
    ],
    departments: [
      ['name', 'Name'],
      ['description', 'Description'],
      ['updatedAt', 'Updated'],
    ],
    projects: [
      ['name', 'Name'],
      ['stage', 'Stage'],
      ['priority', 'Priority'],
      ['dueDate', 'Due'],
      ['updatedAt', 'Updated'],
    ],
    tasks: [
      ['title', 'Title'],
      ['status', 'Status'],
      ['priority', 'Priority'],
      ['dueDate', 'Due'],
      ['updatedAt', 'Updated'],
    ],
    people: [
      ['name', 'Name'],
      ['role', 'Role'],
      ['email', 'Email'],
      ['updatedAt', 'Updated'],
    ],
    standaloneNotes: [
      ['body', 'Note'],
      ['createdAt', 'Created'],
      ['updatedAt', 'Updated'],
    ],
  }
  const cols = colMap[store] || [
    ['name', 'Name'],
    ['updatedAt', 'Updated'],
  ]
  if (!records.length)
    return renderEmpty(Icons.List(48), 'No records yet', 'Create one to get started.')
  const rows = records
    .map((r) => {
      const cells = cols
        .map(([field]) => {
          let val: string = String(r[field] ?? '')
          if (field === 'name' || field === 'title') {
            const [bg, fg] = avatarColor(val)
            val = `<div style="display:flex;align-items:center;gap:.625rem"><div class="avatar avatar-sm" style="background:${bg};color:${fg}">${escH(initials(val))}</div><span style="font-weight:500">${escH(val) || '—'}</span></div>`
          } else if (field === 'body') {
            const preview = val.replace(/\n/g, ' ').slice(0, 80)
            val = `<span style="color:var(--text-primary)">${escH(preview) || '—'}</span>${val.length > 80 ? '<span style="color:var(--text-tertiary)">…</span>' : ''}`
          } else if (field === 'stage') val = stageBadge(val)
          else if (field === 'status') val = statusBadge(val)
          else if (field === 'priority') val = renderPriorityBadge(val)
          else if (field === 'dueDate') val = renderDueBadge(val) || '—'
          else if (field === 'updatedAt' || field === 'createdAt') val = formatRelative(val)
          else val = escH(val) || '—'
          return `<td>${val}</td>`
        })
        .join('')
      return `<tr data-id="${r.id}">${cells}</tr>`
    })
    .join('')
  const heads = cols
    .map(([field, label]) => {
      const active = sortField === field
      const dir = active && sortDir === 'asc' ? '↑' : active ? '↓' : ''
      return `<th data-sort="${field}">${label} <span style="opacity:.5;font-size:.7em">${dir}</span></th>`
    })
    .join('')
  return `<div style="overflow:auto;height:100%"><table class="list-table"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div>`
}
export function bindListView(onOpen: (id: string) => void, onSort: (f: string) => void): void {
  document.querySelectorAll<HTMLTableRowElement>('.list-table tbody tr').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = tr.dataset.id
      if (id) onOpen(id)
    })
  })
  document.querySelectorAll<HTMLTableCellElement>('.list-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const sort = th.dataset.sort
      if (sort) onSort(sort)
    })
  })
}

export function renderGridView(
  store: string,
  records: AnyRecord[],
  _onOpen: (id: string) => void,
): string {
  if (!records.length)
    return renderEmpty(Icons.Grid(48), 'No records yet', 'Create one to get started.')
  return `<div class="grid-view">${records
    .map((r) => {
      const name =
        store === 'standaloneNotes'
          ? String(r.body || '').slice(0, 20) || 'Note'
          : String(r.name || r.title || 'Untitled')
      const [bg, fg] = avatarColor(name)
      let meta = ''
      if (store === 'clients')
        meta = `<div class="text-xs text-secondary mt-1">${escH(String(r.contactName || 'No contact'))}</div>`
      if (store === 'departments')
        meta = `<div class="text-xs text-secondary mt-1">${escH(String(r.description || ''))}</div>`
      if (store === 'projects')
        meta = `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">${stageBadge(r.stage)} ${renderPriorityBadge(String(r.priority || ''))}</div>`
      if (store === 'tasks')
        meta = `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">${statusBadge(r.status)} ${renderPriorityBadge(String(r.priority || ''))}</div>`
      if (store === 'standaloneNotes') {
        const preview = String(r.body || '')
          .replace(/\n/g, ' ')
          .slice(0, 60)
        meta = `<div style="font-size:.8rem;color:var(--text-secondary);margin-top:.375rem;line-height:1.4">${escH(preview) || 'No content'}</div><div style="font-size:.7rem;color:var(--text-tertiary);margin-top:.25rem">${formatRelative(String(r.createdAt || ''))}</div>`
      }
      return `<div class="grid-card" data-id="${r.id}"><div class="avatar avatar-lg" style="background:${bg};color:${fg};margin-bottom:.875rem">${escH(initials(name))}</div><div style="font-weight:600;font-size:.9375rem">${escH(name)}</div>${meta}<div class="text-xs text-tertiary" style="margin-top:.75rem">${formatRelative(String(r.updatedAt || ''))}</div></div>`
    })
    .join('')}</div>`
}
export function bindGridView(onOpen: (id: string) => void): void {
  document.querySelectorAll<HTMLElement>('.grid-card').forEach((c) => {
    c.addEventListener('click', () => {
      const id = c.dataset.id
      if (id) onOpen(id)
    })
  })
}

const KANBAN_COLS: Record<string, string[]> = {
  clients: ['Prospect', 'Active', 'Inactive', 'Churned'],
  departments: ['Active', 'Inactive'],
  projects: ['Lead', 'Active', 'Review', 'On Hold', 'Done', 'Cancelled'],
  tasks: ['Todo', 'In Progress', 'Blocked', 'Done'],
  people: ['Active', 'Inactive'],
  standaloneNotes: ['Untagged'],
}

export function renderKanbanView(
  store: string,
  records: AnyRecord[],
  _onOpen: (id: string) => void,
): string {
  let cols: string[], sf: string
  if (store === 'standaloneNotes') {
    const allTags = dbGetAll('tags') as AnyRecord[]
    const usedTagIds = [
      ...new Set(records.flatMap((r) => (Array.isArray(r.tagIds) ? (r.tagIds as string[]) : []))),
    ]
    const tagCols = usedTagIds
      .map((id) => allTags.find((t) => t.id === id)?.name as string)
      .filter(Boolean)
    cols = [...tagCols, 'Untagged']
    sf = '_tagCol'
  } else {
    cols = KANBAN_COLS[store] || ['Active', 'Inactive']
    sf = store === 'tasks' ? 'status' : 'stage'
  }
  return `<div class="kanban-board">${cols
    .map((col) => {
      const cr =
        store === 'standaloneNotes'
          ? col === 'Untagged'
            ? records.filter(
                (r) => !Array.isArray(r.tagIds) || (r.tagIds as unknown[]).length === 0,
              )
            : records.filter((r) => {
                const tag = (dbGetAll('tags') as AnyRecord[]).find((t) => t.name === col)
                return (
                  tag && Array.isArray(r.tagIds) && (r.tagIds as string[]).includes(String(tag.id))
                )
              })
          : records.filter((r) => (r[sf] || cols[0]) === col)
      const cards = cr
        .map((r) => {
          const name =
            store === 'standaloneNotes'
              ? String(r.body || '').slice(0, 30) || 'Note'
              : String(r.name || r.title || 'Untitled')
          const [bg, fg] = avatarColor(name)
          const cardBody =
            store === 'standaloneNotes'
              ? `<div style="font-size:.8rem;color:var(--text-secondary);line-height:1.4;margin-bottom:.375rem">${escH(String(r.body || '').slice(0, 80))}</div><div style="font-size:.7rem;color:var(--text-tertiary)">${formatRelative(String(r.createdAt || ''))}</div>`
              : `<div style="display:flex;gap:.375rem;flex-wrap:wrap">${renderPriorityBadge(String(r.priority || ''))} ${renderDueBadge(String(r.dueDate || ''))}</div><div style="font-size:.7rem;color:var(--text-tertiary);margin-top:.375rem">${formatRelative(String(r.updatedAt || ''))}</div>`
          return `<div class="kanban-card" draggable="${store !== 'standaloneNotes'}" data-id="${r.id}" data-col="${col}">${store !== 'standaloneNotes' ? `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem"><div class="avatar avatar-sm" style="background:${bg};color:${fg}">${escH(initials(name))}</div><span style="font-weight:500;font-size:.875rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(name)}</span></div>` : ''}${cardBody}</div>`
        })
        .join('')
      return `<div class="kanban-col" data-col="${col}"><div class="kanban-col-header"><span class="kanban-col-title">${col}</span><span class="kanban-col-count">${cr.length}</span></div><div class="kanban-col-body">${cards || '<div style="color:var(--text-tertiary);font-size:.8rem;text-align:center;padding:1rem;opacity:.6">Drop here</div>'}</div></div>`
    })
    .join('')}</div>`
}
export function bindKanbanView(
  store: string,
  records: AnyRecord[],
  onOpen: (id: string) => void,
  onRefresh: () => void,
): void {
  let dragging: string | null = null
  const sf = store === 'tasks' ? 'status' : 'stage'
  document.querySelectorAll<HTMLElement>('.kanban-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.id
      if (id) onOpen(id)
    })
    card.addEventListener('dragstart', (e: DragEvent) => {
      dragging = card.dataset.id ?? null
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    })
  })
  document.querySelectorAll<HTMLElement>('.kanban-col').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault()
      col.classList.add('drag-over')
    })
    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over')
    })
    col.addEventListener('drop', async (e) => {
      e.preventDefault()
      col.classList.remove('drag-over')
      if (!dragging) return
      const ns = col.dataset.col
      if (!ns) return
      const rec = records.find((r) => r.id === dragging)
      if (rec && rec[sf] !== ns) {
        await dbUpdate(store, dragging, { [sf]: ns })
        onRefresh()
      }
      dragging = null
    })
  })
}

export function renderSpatialCanvas(
  store: string,
  records: AnyRecord[],
  _onOpen: (id: string) => void,
): string {
  if (!records.length)
    return renderEmpty(Icons.Spatial(48), 'No records yet', 'Create one to place it on the canvas.')
  const nodes = records
    .map((r) => {
      const name = String(r.name || r.title || 'Untitled')
      const [bg, fg] = avatarColor(name)
      const x = typeof r._x === 'number' ? r._x : Math.random() * 70 + 5
      const y = typeof r._y === 'number' ? r._y : Math.random() * 70 + 5
      const content =
        store === 'standaloneNotes'
          ? `<div style="font-size:.8rem;line-height:1.5;color:var(--text-primary);max-width:200px">${escH(String(r.body || '').slice(0, 120))}</div><div style="font-size:.7rem;color:var(--text-tertiary);margin-top:.5rem">${formatRelative(String(r.createdAt || ''))}</div>`
          : `<div class="avatar avatar-md" style="background:${bg};color:${fg};margin-bottom:.625rem">${escH(initials(name))}</div><div style="font-weight:600;font-size:.9375rem">${escH(name)}</div>${r.role ? `<div style="font-size:.8rem;color:var(--text-secondary)">${escH(String(r.role))}</div>` : ''}${r.stage ? stageBadge(r.stage) : ''}${r.status ? statusBadge(r.status) : ''}`
      return `<div class="spatial-node" data-id="${r.id}" style="left:${x}%;top:${y}%;position:absolute"><div class="spatial-node-inner">${content}</div></div>`
    })
    .join('')
  return `<div class="spatial-canvas canvas-grid" style="position:relative;width:100%;height:100%;overflow:hidden">${nodes}</div>`
}
export function bindSpatialCanvas(
  store: string,
  records: AnyRecord[],
  onOpen: (id: string) => void,
  _onRefresh: () => void,
): void {
  const canvas = document.querySelector('.spatial-canvas')
  if (!canvas) return
  document.querySelectorAll<HTMLElement>('.spatial-node').forEach((node) => {
    const nodeId = node.dataset.id
    if (!nodeId) return
    const inner = node.querySelector<HTMLElement>('.spatial-node-inner')
    if (!inner) return
    let dragging = false
    let startX = 0,
      startY = 0,
      origL = 0,
      origT = 0
    inner.addEventListener('click', () => {
      if (!dragging) onOpen(nodeId)
    })
    inner.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return
      dragging = false
      startX = e.clientX
      startY = e.clientY
      origL = node.offsetLeft
      origT = node.offsetTop
      const w = (canvas as HTMLElement).offsetWidth || 1,
        h = (canvas as HTMLElement).offsetHeight || 1
      const onMove = (e2: MouseEvent) => {
        const dx = e2.clientX - startX,
          dy = e2.clientY - startY
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging = true
        if (!dragging) return
        node.style.left = (Math.max(0, Math.min(w - node.offsetWidth, origL + dx)) / w) * 100 + '%'
        node.style.top = (Math.max(0, Math.min(h - node.offsetHeight, origT + dy)) / h) * 100 + '%'
      }
      const onUp = async () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        if (!dragging) return
        await dbUpdate(store, nodeId, {
          _x: parseFloat(node.style.left),
          _y: parseFloat(node.style.top),
        })
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      e.preventDefault()
    })
  })
}
