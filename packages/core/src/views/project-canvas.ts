// ── PROJECT CANVAS ────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 3665–4117.

import { escH, formatRelative, initials, avatarColor } from '../utils.js'
import { dbGetAll, dbGetById, dbUpdate, softDelete } from '../storage/db.js'
import { subscribe, showToast, showConfirm, openRecordModal, reloadData } from '../state.js'
import { Icons } from '../ui/icons.js'
import { renderPriorityBadge } from '../ui/components.js'
import { stageBadge } from './list-grid-kanban-spatial.js'
import { PRIORITIES, PROJECT_STAGES } from '../constants.js'
import { patchInnerHTML } from '../render-utils.js'

// forward-declared — set by main.ts wiring after bootstrap loads
let _appRenderWorkspace: (view: string) => void = () => {}
export function setPCHooks(appRenderWorkspace: (view: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace
}

type AnyRecord = Record<string, unknown>

export let _pcProjectId: string | null = null
export let _pcFromCanvas = false
export function setPcFromCanvas(val: boolean): void {
  _pcFromCanvas = val
}

const PC_DEFAULTS: Record<string, { x: number; y: number; w: number; h: number; z: number }> = {
  details: { x: 24, y: 24, w: 300, h: 400, z: 10 },
  narrative: { x: 344, y: 24, w: 420, h: 200, z: 11 },
  tasks: { x: 344, y: 244, w: 420, h: 420, z: 12 },
  notes: { x: 24, y: 444, w: 300, h: 320, z: 13 },
  people: { x: 784, y: 24, w: 300, h: 400, z: 14 },
}

export function openProjectCanvas(projectId: string): void {
  if (window.innerWidth < 768) {
    openRecordModal('projects', projectId)
    return
  }
  const existing = document.getElementById('proj-canvas-overlay')
  if (existing) existing.remove()
  _pcProjectId = projectId
  const overlay = document.createElement('div')
  overlay.id = 'proj-canvas-overlay'
  overlay.className = 'proj-canvas-overlay'
  document.body.appendChild(overlay)
  overlay.innerHTML = patchInnerHTML(renderProjectCanvas())
  bindProjectCanvas()
}

export function closeProjectCanvas(): void {
  _pcProjectId = null
  document.getElementById('proj-canvas-overlay')?.remove()
}

export async function pcSaveLayout(): Promise<void> {
  if (!_pcProjectId) return
  const layout: Record<string, { x: number; y: number; w: number; h: number; z: number }> = {}
  document.querySelectorAll<HTMLElement>('.proj-panel[data-panel]').forEach((el) => {
    const panelId = (el.dataset as DOMStringMap & { panel: string }).panel
    layout[panelId] = {
      x: parseInt(el.style.left) || 0,
      y: parseInt(el.style.top) || 0,
      w: el.offsetWidth,
      h: el.offsetHeight,
      z: parseInt(el.style.zIndex) || 10,
    }
  })
  try {
    await dbUpdate('projects', _pcProjectId, { _canvasLayout: layout })
  } catch (e) {
    console.warn('layout save failed', e)
  }
}

export function pcRefreshPanel(panelId: string): void {
  if (!_pcProjectId) return
  const project = dbGetById('projects', _pcProjectId) as AnyRecord | null
  if (!project) return
  const body = document.getElementById('pc-body-' + panelId)
  if (!body) return
  if (panelId === 'tasks') {
    const tasks = (dbGetAll('tasks') as AnyRecord[]).filter((t) => t.projectId === _pcProjectId)
    body.innerHTML = patchInnerHTML(pcTasksBody(tasks))
    pcBindTasks()
  } else if (panelId === 'notes') {
    body.innerHTML = patchInnerHTML(pcNotesBody(project))
    pcBindNotes(project)
  } else if (panelId === 'details') {
    body.innerHTML = patchInnerHTML(pcDetailsBody(project))
    pcBindDetails(project)
  } else if (panelId === 'narrative') {
    body.innerHTML = patchInnerHTML(pcNarrativeBody(project))
    pcBindNarrative(project)
  } else if (panelId === 'people') {
    const tasks = (dbGetAll('tasks') as AnyRecord[]).filter((t) => t.projectId === _pcProjectId)
    body.innerHTML = patchInnerHTML(pcPeopleBody(project, tasks))
    pcBindPeople(project)
  }
}

// ── Panel body renderers ─────────────────────────────────────────────────────

export function pcDetailsBody(project: AnyRecord): string {
  const clientOpts = (dbGetAll('clients') as AnyRecord[])
    .map(
      (c) =>
        `<option value="${c.id}"${c.id === project.clientId ? ' selected' : ''}>${escH(String(c.name || ''))}</option>`,
    )
    .join('')
  const ownerOpts = (dbGetAll('people') as AnyRecord[])
    .map(
      (p) =>
        `<option value="${p.id}"${p.id === project.ownerId ? ' selected' : ''}>${escH(String(p.name || ''))}</option>`,
    )
    .join('')
  const deptOpts = (dbGetAll('departments') as AnyRecord[])
    .map(
      (d) =>
        `<option value="${d.id}"${d.id === project.deptId ? ' selected' : ''}>${escH(String(d.name || ''))}</option>`,
    )
    .join('')
  const stageOpts = PROJECT_STAGES.map(
    (s) => `<option value="${s}"${s === project.stage ? ' selected' : ''}>${s}</option>`,
  ).join('')
  const prioOpts = PRIORITIES.map(
    (p) => `<option value="${p}"${p === project.priority ? ' selected' : ''}>${p}</option>`,
  ).join('')
  return `
    <div class="pc-row"><span class="pc-label">Name</span>
      <input class="pc-inline-input" data-pc-field="name" value="${escH(String(project.name || ''))}" style="text-align:right">
    </div>
    <div class="pc-row"><span class="pc-label">Stage</span>
      <select class="pc-inline-input" data-pc-field="stage" style="text-align:right"><option value="">— None —</option>${stageOpts}</select>
    </div>
    <div class="pc-row"><span class="pc-label">Priority</span>
      <select class="pc-inline-input" data-pc-field="priority" style="text-align:right"><option value="">— None —</option>${prioOpts}</select>
    </div>
    <div class="pc-row"><span class="pc-label">Client</span>
      <select class="pc-inline-input" data-pc-field="clientId" style="text-align:right"><option value="">— None —</option>${clientOpts}</select>
    </div>
    <div class="pc-row"><span class="pc-label">Owner</span>
      <select class="pc-inline-input" data-pc-field="ownerId" style="text-align:right"><option value="">— None —</option>${ownerOpts}</select>
    </div>
    <div class="pc-row"><span class="pc-label">Department</span>
      <select class="pc-inline-input" data-pc-field="deptId" style="text-align:right"><option value="">— None —</option>${deptOpts}</select>
    </div>
    <div class="pc-row"><span class="pc-label">Due Date</span>
      <input class="pc-inline-input" type="date" data-pc-field="dueDate" value="${escH(String(project.dueDate || ''))}" style="text-align:right">
    </div>
    <div class="pc-row"><span class="pc-label">Start Date</span>
      <input class="pc-inline-input" type="date" data-pc-field="startDate" value="${escH(String(project.startDate || ''))}" style="text-align:right">
    </div>
    <div style="margin-top:.75rem;display:flex;gap:.5rem">
      <button class="btn btn-danger btn-sm" id="pc-delete-btn" style="margin-left:auto">${Icons.Trash(14)} Delete</button>
    </div>`
}

export function pcBindDetails(_project: AnyRecord): void {
  document
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-pc-field]')
    .forEach((el) => {
      el.addEventListener('change', async () => {
        const field = (el.dataset as DOMStringMap & { pcField: string }).pcField
        const value = (el as HTMLInputElement).value
        await dbUpdate('projects', _pcProjectId!, { [field]: value })
        reloadData()
        if (field === 'name') {
          const tb = document.getElementById('pc-project-name')
          if (tb) tb.textContent = value || 'Untitled Project'
        }
      })
      el.addEventListener('blur', async () => {
        if (el.tagName === 'INPUT') {
          const field = (el.dataset as DOMStringMap & { pcField: string }).pcField
          await dbUpdate('projects', _pcProjectId!, { [field]: (el as HTMLInputElement).value })
          reloadData()
          if (field === 'name') {
            const tb = document.getElementById('pc-project-name')
            if (tb) tb.textContent = (el as HTMLInputElement).value || 'Untitled Project'
          }
        }
      })
    })
  document.getElementById('pc-delete-btn')?.addEventListener('click', () => {
    showConfirm('Delete this project? It will be moved to the Recycle Bin.', async () => {
      await softDelete('projects', _pcProjectId!)
      reloadData()
      closeProjectCanvas()
      showToast('Project moved to Recycle Bin', 'success')
    })
  })
}

export function pcNarrativeBody(project: AnyRecord): string {
  return `<textarea class="pc-inline-input" id="pc-narrative-ta" rows="6"
    style="width:100%;height:calc(100% - 8px);resize:none;font-size:.875rem;line-height:1.65;padding:.5rem"
    placeholder="Project description…">${escH(String(project.description || ''))}</textarea>`
}

export function pcBindNarrative(_project: AnyRecord): void {
  const ta = document.getElementById('pc-narrative-ta') as HTMLTextAreaElement | null
  if (!ta) return
  ta.addEventListener('blur', async () => {
    await dbUpdate('projects', _pcProjectId!, { description: ta.value })
    reloadData()
  })
}

export function pcTasksBody(tasks: AnyRecord[]): string {
  const rows = tasks.length
    ? tasks
        .map((t) => {
          const assignee = t.assigneeId
            ? (dbGetById('people', String(t.assigneeId)) as AnyRecord | null)
            : null
          return `<div class="pc-task-row" data-task-id="${t.id}">
      <input type="checkbox" data-task-toggle="${t.id}" ${t.status === 'Done' ? 'checked' : ''} style="flex-shrink:0;cursor:pointer" onclick="event.stopPropagation()">
      <span class="pc-task-title ${t.status === 'Done' ? 'pc-task-done' : ''}" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(t.title || 'Untitled'))}</span>
      ${assignee ? `<span style="font-size:.7rem;color:var(--text-tertiary);flex-shrink:0">${escH(initials(String(assignee.name || '')))}</span>` : ''}
      ${t.dueDate ? `<span style="font-size:.7rem;color:var(--priority-high);flex-shrink:0">${t.dueDate}</span>` : ''}
    </div>`
        })
        .join('')
    : `<p style="color:var(--text-tertiary);font-size:.8rem;padding:.5rem 0">No tasks yet.</p>`
  return `<div style="display:flex;gap:.5rem;margin-bottom:.75rem">
    <button class="btn btn-primary btn-sm" id="pc-add-task" style="width:100%">${Icons.Plus(14)} Add Task</button>
  </div>
  <div id="pc-task-list">${rows}</div>`
}

export function pcBindTasks(): void {
  document.getElementById('pc-add-task')?.addEventListener('click', () => {
    const overlay = document.getElementById('proj-canvas-overlay')
    if (overlay) overlay.style.display = 'none'
    openRecordModal('tasks', null, { projectId: _pcProjectId })
    const unwatchModal = subscribe((state) => {
      if (!state.recordModal) {
        unwatchModal()
        if (overlay) overlay.style.display = ''
        reloadData()
        setTimeout(() => {
          pcRefreshPanel('tasks')
        }, 50)
      }
    })
  })
  document.querySelectorAll<HTMLInputElement>('[data-task-toggle]').forEach((cb) => {
    cb.addEventListener('change', async (e) => {
      e.stopPropagation()
      const tid = (cb.dataset as DOMStringMap & { taskToggle: string }).taskToggle
      const newStatus = cb.checked ? 'Done' : 'Todo'
      await dbUpdate('tasks', tid, { status: newStatus })
      reloadData()
      const row = cb.closest('.pc-task-row')
      if (row) {
        const lbl = row.querySelector('.pc-task-title')
        if (lbl) lbl.className = 'pc-task-title' + (newStatus === 'Done' ? ' pc-task-done' : '')
      }
    })
  })
  document.querySelectorAll<HTMLElement>('.pc-task-row').forEach((row) => {
    row.addEventListener('click', (e: Event) => {
      if ((e.target as HTMLInputElement).type === 'checkbox') return
      const tid = (row.dataset as DOMStringMap & { taskId: string }).taskId
      const overlay = document.getElementById('proj-canvas-overlay')
      if (overlay) overlay.style.display = 'none'
      openRecordModal('tasks', tid)
      const unwatchModal = subscribe((state) => {
        if (!state.recordModal) {
          unwatchModal()
          if (overlay) overlay.style.display = ''
          reloadData()
          setTimeout(() => {
            pcRefreshPanel('tasks')
          }, 50)
        }
      })
    })
  })
}

export function pcNotesBody(project: AnyRecord): string {
  const notes = Array.isArray(project.notes) ? (project.notes as AnyRecord[]) : []
  const items = notes.length
    ? [...notes]
        .reverse()
        .map(
          (n) =>
            `<div class="pc-note-item" data-note-id="${n.id}">
          <div style="font-size:.7rem;color:var(--text-tertiary);margin-bottom:.25rem">${formatRelative(String(n.date || ''))}</div>
          <div style="white-space:pre-wrap">${escH(String(n.text || ''))}</div>
          <button data-del-note="${n.id}" style="position:absolute;top:.4rem;right:.4rem;background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:.75rem;line-height:1" title="Delete">✕</button>
        </div>`,
        )
        .join('')
    : `<p style="color:var(--text-tertiary);font-size:.8rem;padding:.25rem 0">No notes yet.</p>`
  return `<div style="display:flex;gap:.5rem;margin-bottom:.75rem">
    <textarea class="textarea" id="pc-new-note" placeholder="Add note…" rows="2" style="flex:1;font-size:.8rem;resize:none"></textarea>
    <button class="btn btn-primary btn-sm" id="pc-add-note" style="align-self:flex-end">${Icons.Plus(14)}</button>
  </div>
  <div id="pc-note-list">${items}</div>`
}

export function pcBindNotes(_project: AnyRecord): void {
  document.getElementById('pc-add-note')?.addEventListener('click', async () => {
    const ta = document.getElementById('pc-new-note') as HTMLTextAreaElement | null
    const text = ta?.value?.trim()
    if (!text) return
    const existing = dbGetById('projects', _pcProjectId!) as AnyRecord | null
    const newNote = { id: Date.now().toString(36), text, date: new Date().toISOString() }
    const updatedNotes = [
      ...(Array.isArray(existing?.notes) ? (existing.notes as AnyRecord[]) : []),
      newNote,
    ]
    await dbUpdate('projects', _pcProjectId!, { notes: updatedNotes })
    reloadData()
    if (ta) ta.value = ''
    pcRefreshPanel('notes')
    showToast('Note added', 'success')
  })
  document.getElementById('pc-new-note')?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
      document.getElementById('pc-add-note')?.click()
  })
  document.querySelectorAll<HTMLElement>('[data-del-note]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nid = (btn.dataset as DOMStringMap & { delNote: string }).delNote
      const existing = dbGetById('projects', _pcProjectId!) as AnyRecord | null
      const filtered = ((existing?.notes as AnyRecord[] | undefined) || []).filter(
        (n) => n.id !== nid,
      )
      await dbUpdate('projects', _pcProjectId!, { notes: filtered })
      reloadData()
      pcRefreshPanel('notes')
    })
  })
}

export function pcPeopleBody(project: AnyRecord, tasks: AnyRecord[]): string {
  const teamIds = [
    ...new Set([
      ...(project.ownerId ? [String(project.ownerId)] : []),
      ...(Array.isArray(project._teamIds) ? (project._teamIds as string[]) : []),
      ...tasks.map((t) => t.assigneeId as string).filter(Boolean),
    ]),
  ]
  const team = teamIds
    .map((id) => dbGetById('people', id) as AnyRecord | null)
    .filter(Boolean) as AnyRecord[]
  const allPeople = dbGetAll('people') as AnyRecord[]
  const rows =
    team
      .map((p) => {
        const [bg, fg] = avatarColor(String(p.name || ''))
        const isOwner = p.id === project.ownerId
        return `<div class="pc-person-row">
      <div class="avatar avatar-sm" style="background:${bg};color:${fg}">${initials(String(p.name || ''))}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem">${escH(String(p.name || ''))}</div>
        <div style="font-size:.7rem;color:var(--text-tertiary)">${escH(String(p.role || (isOwner ? 'Owner' : 'Team')))}</div>
      </div>
      ${isOwner ? `<span style="font-size:.65rem;background:var(--accent-muted);color:var(--accent);padding:.1rem .4rem;border-radius:999px;flex-shrink:0">Owner</span>` : ''}
    </div>`
      })
      .join('') ||
    `<p style="color:var(--text-tertiary);font-size:.8rem;padding:.25rem 0">No team members yet.</p>`
  return `<div id="pc-people-list">${rows}</div>
    <div style="display:flex;gap:.5rem;margin-top:.75rem">
      <select class="select" id="pc-add-person-sel" style="flex:1;height:32px;font-size:.8rem">
        <option value="">Add team member…</option>
        ${allPeople.map((p) => `<option value="${p.id}">${escH(String(p.name || ''))}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" id="pc-add-person-btn">${Icons.Plus(14)}</button>
    </div>`
}

export function pcBindPeople(_project: AnyRecord): void {
  document.getElementById('pc-add-person-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('pc-add-person-sel') as HTMLSelectElement | null
    const pid = sel?.value
    if (!pid) return
    const existing = dbGetById('projects', _pcProjectId!) as AnyRecord | null
    if (!existing) return
    if (!existing.ownerId) {
      await dbUpdate('projects', _pcProjectId!, { ownerId: pid })
    } else {
      const teamIds = Array.isArray(existing._teamIds) ? (existing._teamIds as string[]) : []
      if (!teamIds.includes(pid)) {
        await dbUpdate('projects', _pcProjectId!, { _teamIds: [...teamIds, pid] })
      }
    }
    reloadData()
    pcRefreshPanel('people')
    showToast('Team member added', 'success')
  })
}

// ── Main render ──────────────────────────────────────────────────────────────

export function renderProjectCanvas(): string {
  if (!_pcProjectId) return ''
  const project = dbGetById('projects', _pcProjectId) as AnyRecord | null
  if (!project) {
    closeProjectCanvas()
    return ''
  }
  const saved = (project._canvasLayout || {}) as Record<
    string,
    Partial<(typeof PC_DEFAULTS)[string]>
  >
  const panels: Record<string, (typeof PC_DEFAULTS)[string]> = {}
  Object.keys(PC_DEFAULTS).forEach((k) => {
    panels[k] = { ...PC_DEFAULTS[k], ...(saved[k] || {}) } as (typeof PC_DEFAULTS)[string]
  })
  const tasks = (dbGetAll('tasks') as AnyRecord[]).filter((t) => t.projectId === _pcProjectId)
  const doneCount = tasks.filter((t) => t.status === 'Done').length
  const progressPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  const mkPanel = (id: string, title: string, bodyHTML: string) => {
    const l = panels[id]!
    return `<div class="proj-panel" data-panel="${id}" style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;z-index:${l.z}">
      <div class="proj-panel-header" data-drag="${id}">
        <span class="proj-panel-title">${title}</span>
      </div>
      <div class="proj-panel-body" id="pc-body-${id}">${bodyHTML}</div>
      <svg class="proj-panel-resize" data-resize="${id}" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="9" y1="1" x2="1" y2="9"/><line x1="9" y1="5" x2="5" y2="9"/>
      </svg>
    </div>`
  }

  return `
    <div class="proj-canvas-topbar">
      <button class="btn btn-ghost btn-sm" id="pc-close">${Icons.ChevronLeft(14)} Back</button>
      <div style="width:1px;height:20px;background:var(--border-default);flex-shrink:0"></div>
      <span id="pc-project-name" style="font-weight:600;font-size:1rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(project.name || 'Untitled Project'))}</span>
      ${stageBadge(project.stage || '')} ${renderPriorityBadge(String(project.priority || ''))}
      ${
        tasks.length
          ? `<div style="display:flex;align-items:center;gap:.5rem;font-size:.8rem;color:var(--text-secondary);flex-shrink:0">
        <div style="width:80px;height:6px;background:var(--border-subtle);border-radius:999px;overflow:hidden">
          <div style="height:100%;background:var(--accent);border-radius:999px;width:${progressPct}%"></div>
        </div>
        ${doneCount}/${tasks.length}
      </div>`
          : ''
      }
    </div>
    <div class="proj-canvas-body" id="pc-canvas-body">
      ${mkPanel('details', '📋 Details', pcDetailsBody(project))}
      ${mkPanel('narrative', '📝 Description', pcNarrativeBody(project))}
      ${mkPanel('tasks', '✅ Tasks', pcTasksBody(tasks))}
      ${mkPanel('notes', '🗒 Notes', pcNotesBody(project))}
      ${mkPanel('people', '👥 Team', pcPeopleBody(project, tasks))}
    </div>`
}

export function bindProjectCanvas(): void {
  let _pcTopZ = 20

  document.getElementById('pc-close')?.addEventListener('click', () => {
    void pcSaveLayout().then(() => {
      closeProjectCanvas()
      _appRenderWorkspace('projects')
    })
  })

  const project = dbGetById('projects', _pcProjectId!) as AnyRecord
  const _tasks = (dbGetAll('tasks') as AnyRecord[]).filter((t) => t.projectId === _pcProjectId)

  pcBindDetails(project)
  pcBindNarrative(project)
  pcBindTasks()
  pcBindNotes(project)
  pcBindPeople(project)

  // Drag
  document.querySelectorAll<HTMLElement>('[data-drag]').forEach((header) => {
    const panel = header.closest<HTMLElement>('.proj-panel')
    if (!panel) return
    header.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea,button')) return
      e.preventDefault()
      _pcTopZ++
      panel.style.zIndex = String(_pcTopZ)
      const sx = e.clientX - panel.offsetLeft,
        sy = e.clientY - panel.offsetTop
      const onMove = (e2: MouseEvent) => {
        panel.style.left = Math.max(0, e2.clientX - sx) + 'px'
        panel.style.top = Math.max(0, e2.clientY - sy) + 'px'
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        void pcSaveLayout()
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    panel.addEventListener('mousedown', () => {
      _pcTopZ++
      panel.style.zIndex = String(_pcTopZ)
    })
  })

  // Resize
  document.querySelectorAll<HTMLElement>('[data-resize]').forEach((handle) => {
    const panel = handle.closest<HTMLElement>('.proj-panel')
    if (!panel) return
    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const sx = e.clientX,
        sy = e.clientY
      const sw = panel.offsetWidth,
        sh = panel.offsetHeight
      const onMove = (e2: MouseEvent) => {
        panel.style.width = Math.max(240, sw + e2.clientX - sx) + 'px'
        panel.style.height = Math.max(140, sh + e2.clientY - sy) + 'px'
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        void pcSaveLayout()
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  })

  // Switch to modal if window resizes below 768px while canvas is open
  const _pcResizeHandler = () => {
    if (_pcProjectId && window.innerWidth < 768) {
      const pid = _pcProjectId
      void pcSaveLayout().then(() => {
        closeProjectCanvas()
        _pcFromCanvas = true
        openRecordModal('projects', pid)
        setTimeout(() => {
          const backdrop = document.getElementById('record-modal-backdrop')
          const modal = backdrop?.querySelector('.modal')
          if (backdrop) backdrop.classList.add('modal-backdrop-fullscreen')
          if (modal) modal.classList.add('modal-fullscreen')
        }, 10)
      })
      window.removeEventListener('resize', _pcResizeHandler)
    }
  }
  window.addEventListener('resize', _pcResizeHandler)
}
