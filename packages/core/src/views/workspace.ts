// ── WORKSPACE (generic list/grid/kanban/spatial) ──────────────────────────────
// Extracted from taskapp.html lines 4225–4286.

import { escH, sortRecords, filterRecords, searchRecords, downloadText, toCSV } from '../utils.js'
import { dbGetAll } from '../storage/db.js'
import { showToast, openRecordModal } from '../state.js'
import { Icons } from '../ui/icons.js'
import { renderViewTabs, renderSearchInput } from '../ui/components.js'
import { PRIORITIES, PROJECT_STAGES, TASK_STATUSES } from '../constants.js'
import { openProjectCanvas } from './project-canvas.js'
import {
  renderListView,
  bindListView,
  renderGridView,
  bindGridView,
  renderKanbanView,
  bindKanbanView,
  renderSpatialCanvas,
  bindSpatialCanvas,
} from './list-grid-kanban-spatial.js'

type AnyRecord = Record<string, unknown>

interface WSState {
  view: string
  search: string
  sortField: string
  sortDir: 'asc' | 'desc'
  filters: Record<string, string>
  filterOpen: boolean
}
const WS_STATE: Record<string, WSState> = {}

function wsState(store: string): WSState {
  if (!WS_STATE[store])
    WS_STATE[store] = {
      view: 'list',
      search: '',
      sortField: 'updatedAt',
      sortDir: 'desc',
      filters: {},
      filterOpen: false,
    }
  return WS_STATE[store]
}

const WS_META: Record<
  string,
  { label: string; searchFields: string[]; stageField?: string; stages?: string[] }
> = {
  clients: {
    label: 'Clients',
    searchFields: ['name', 'contactName', 'email', 'phone'],
    stageField: 'stage',
    stages: ['Prospect', 'Active', 'Inactive', 'Churned'],
  },
  departments: { label: 'Departments', searchFields: ['name', 'description'] },
  projects: {
    label: 'Projects',
    searchFields: ['name', 'description'],
    stageField: 'stage',
    stages: PROJECT_STAGES,
  },
  tasks: {
    label: 'Tasks',
    searchFields: ['title', 'description'],
    stageField: 'status',
    stages: TASK_STATUSES,
  },
  people: { label: 'People', searchFields: ['name', 'role', 'email'] },
  standaloneNotes: { label: 'Notes', searchFields: ['body'] },
}

// forward-declared by main.ts
let _appRenderWorkspace: (view: string) => void = () => {}
export function setWorkspaceHooks(appRenderWorkspace: (view: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace
}

export function renderWorkspaceView(store: string): string {
  const meta = WS_META[store]
  if (!meta) return `<div style="padding:2rem">Unknown: ${store}</div>`
  const s = wsState(store)
  let records = dbGetAll(store) as AnyRecord[]
  if (s.search) records = searchRecords(records, s.search, meta.searchFields)
  if (Object.keys(s.filters).length) records = filterRecords(records, s.filters)
  records = sortRecords(records, s.sortField, s.sortDir)
  const onOpen = (id: string) => {
    if (store === 'projects') openProjectCanvas(id)
    else openRecordModal(store, id)
  }
  const onRefresh = () => {
    _appRenderWorkspace(store)
  }

  let body = ''
  if (s.view === 'list')
    body = renderListView(store, records, onOpen, s.sortField, s.sortDir, (f) => {
      if (s.sortField === f) s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc'
      else {
        s.sortField = f
        s.sortDir = 'asc'
      }
      _appRenderWorkspace(store)
    })
  if (s.view === 'grid') body = renderGridView(store, records, onOpen)
  if (s.view === 'kanban') body = renderKanbanView(store, records, onOpen)
  if (s.view === 'spatial') body = renderSpatialCanvas(store, records, onOpen)

  const filterActive = Object.values(s.filters).some((v) => v && v !== 'all')
  const filterPanel = s.filterOpen
    ? `<div class="filter-panel" style="position:absolute;top:calc(100%+6px);right:0;z-index:50;min-width:240px" id="filter-panel">
    ${meta.stageField && meta.stages ? `<div class="form-group"><label class="form-label">${store === 'tasks' ? 'Status' : 'Stage'}</label><select class="select" data-filter="${meta.stageField}" style="height:32px"><option value="all">All</option>${meta.stages.map((sg) => `<option value="${sg}"${s.filters[meta.stageField!] === sg ? ' selected' : ''}>${sg}</option>`).join('')}</select></div>` : ''}
    ${store === 'projects' || store === 'tasks' ? `<div class="form-group"><label class="form-label">Priority</label><select class="select" data-filter="priority" style="height:32px"><option value="all">All</option>${PRIORITIES.map((p) => `<option value="${p}"${s.filters.priority === p ? ' selected' : ''}>${p}</option>`).join('')}</select></div>` : ''}
    ${store === 'projects' ? `<div class="form-group"><label class="form-label">Client</label><select class="select" data-filter="clientId" style="height:32px"><option value="all">All</option>${(dbGetAll('clients') as AnyRecord[]).map((c) => `<option value="${c.id}"${s.filters.clientId === c.id ? ' selected' : ''}>${escH(String(c.name || 'Untitled'))}</option>`).join('')}</select></div>` : ''}
    ${store === 'projects' ? `<div class="form-group"><label class="form-label">Owner</label><select class="select" data-filter="ownerId" style="height:32px"><option value="all">All</option>${(dbGetAll('people') as AnyRecord[]).map((p) => `<option value="${p.id}"${s.filters.ownerId === p.id ? ' selected' : ''}>${escH(String(p.name || 'Untitled'))}</option>`).join('')}</select></div>` : ''}
    ${store === 'tasks' ? `<div class="form-group"><label class="form-label">Project</label><select class="select" data-filter="projectId" style="height:32px"><option value="all">All</option>${(dbGetAll('projects') as AnyRecord[]).map((p) => `<option value="${p.id}"${s.filters.projectId === p.id ? ' selected' : ''}>${escH(String(p.name || 'Untitled'))}</option>`).join('')}</select></div>` : ''}
    ${store === 'tasks' ? `<div class="form-group"><label class="form-label">Assignee</label><select class="select" data-filter="assigneeId" style="height:32px"><option value="all">All</option>${(dbGetAll('people') as AnyRecord[]).map((p) => `<option value="${p.id}"${s.filters.assigneeId === p.id ? ' selected' : ''}>${escH(String(p.name || 'Untitled'))}</option>`).join('')}</select></div>` : ''}
    ${store === 'people' ? `<div class="form-group"><label class="form-label">Department</label><select class="select" data-filter="departmentId" style="height:32px"><option value="all">All</option>${(dbGetAll('departments') as AnyRecord[]).map((d) => `<option value="${d.id}"${s.filters.departmentId === d.id ? ' selected' : ''}>${escH(String(d.name || 'Untitled'))}</option>`).join('')}</select></div>` : ''}
    <div style="display:flex;gap:.5rem;margin-top:.75rem"><button class="btn btn-secondary btn-sm" id="filter-clear" style="flex:1">Clear</button><button class="btn btn-primary btn-sm" id="filter-apply" style="flex:1">Apply</button></div>
  </div>`
    : ''

  return `<div class="workspace"><div class="workspace-toolbar">
    ${renderViewTabs(s.view)}
    <div style="flex:1"></div>
    ${renderSearchInput(s.search, `Search ${meta.label}…`, 'ws-search')}
    <div style="position:relative"><button class="btn btn-secondary btn-sm" id="ws-filter-btn" style="${filterActive ? 'border-color:var(--accent);color:var(--accent)' : ''}">${Icons.Filter(14)} Filter${filterActive ? ` <span style="background:var(--accent);color:#fff;font-size:.6rem;padding:.1rem .35rem;border-radius:999px">${Object.values(s.filters).filter((v) => v && v !== 'all').length}</span>` : ''}</button>${filterPanel}</div>
    <button class="btn btn-secondary btn-sm" id="ws-export-btn">${Icons.Download(14)} Export</button>
    <button class="btn btn-primary btn-sm" id="ws-add-btn">${Icons.Plus(14)} New ${(meta.label || '').replace(/s$/, '')}</button>
  </div><div class="workspace-body" id="workspace-body">${body}</div></div>`
}

export function bindWorkspaceView(store: string): void {
  const s = wsState(store)
  const meta = WS_META[store]
  if (!meta) return
  const records = sortRecords(
    filterRecords(
      searchRecords(dbGetAll(store) as AnyRecord[], s.search, meta.searchFields),
      s.filters,
    ),
    s.sortField,
    s.sortDir,
  )
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      s.view = (btn.dataset as DOMStringMap & { view: string }).view
      _appRenderWorkspace(store)
    })
  })

  const si = document.getElementById('ws-search') as HTMLInputElement | null
  if (si) {
    si.addEventListener('input', (e) => {
      s.search = (e.target as HTMLInputElement).value
      const body = document.getElementById('workspace-body')
      if (!body) {
        _appRenderWorkspace(store)
        return
      }
      let r = dbGetAll(store) as AnyRecord[]
      if (s.search) r = searchRecords(r, s.search, meta.searchFields)
      if (Object.keys(s.filters).length) r = filterRecords(r, s.filters)
      r = sortRecords(r, s.sortField, s.sortDir)
      const oOpen = (id: string) => {
        if (store === 'projects') openProjectCanvas(id)
        else openRecordModal(store, id)
      }
      const oRefresh = () => {
        _appRenderWorkspace(store)
      }
      const oSort = (f: string) => {
        if (s.sortField === f) s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc'
        else {
          s.sortField = f
          s.sortDir = 'asc'
        }
        _appRenderWorkspace(store)
      }
      if (s.view === 'list') {
        body.innerHTML = renderListView(store, r, oOpen, s.sortField, s.sortDir, oSort)
        bindListView(oOpen, oSort)
      } else if (s.view === 'grid') {
        body.innerHTML = renderGridView(store, r, oOpen)
        bindGridView(oOpen)
      } else if (s.view === 'kanban') {
        body.innerHTML = renderKanbanView(store, r, oOpen)
        bindKanbanView(store, r, oOpen, oRefresh)
      } else if (s.view === 'spatial') {
        body.innerHTML = renderSpatialCanvas(store, r, oOpen)
        bindSpatialCanvas(store, r, oOpen, oRefresh)
      }
    })
  }

  document.getElementById('ws-add-btn')?.addEventListener('click', () => {
    openRecordModal(store)
  })
  document.getElementById('ws-export-btn')?.addEventListener('click', () => {
    if (!records.length) {
      showToast('No records to export', 'error')
      return
    }
    const fields = Object.keys(records[0]!).filter(
      (k) => !k.startsWith('_') && k !== 'files' && k !== 'notes',
    )
    downloadText(`taskapp-${store}.csv`, toCSV(records, fields), 'text/csv')
    showToast(`Exported ${records.length} records`, 'success')
  })
  document.getElementById('ws-filter-btn')?.addEventListener('click', (e: Event) => {
    e.stopPropagation()
    s.filterOpen = !s.filterOpen
    _appRenderWorkspace(store)
  })
  if (s.filterOpen) {
    document.getElementById('filter-apply')?.addEventListener('click', () => {
      document.querySelectorAll<HTMLSelectElement>('[data-filter]').forEach((el) => {
        s.filters[(el.dataset as DOMStringMap & { filter: string }).filter] = el.value
      })
      s.filterOpen = false
      _appRenderWorkspace(store)
    })
    document.getElementById('filter-clear')?.addEventListener('click', () => {
      s.filters = {}
      s.filterOpen = false
      _appRenderWorkspace(store)
    })
    setTimeout(() => {
      document.addEventListener('pointerdown', function cf(e) {
        if (
          !(e.target as HTMLElement).closest('#filter-panel') &&
          !(e.target as HTMLElement).closest('#ws-filter-btn')
        ) {
          s.filterOpen = false
          document.removeEventListener('pointerdown', cf)
          _appRenderWorkspace(store)
        }
      })
    }, 0)
  }
  const onOpen = (id: string) => {
    if (store === 'projects') openProjectCanvas(id)
    else openRecordModal(store, id)
  }
  const onRefresh = () => {
    _appRenderWorkspace(store)
  }
  const onSort = (f: string) => {
    if (s.sortField === f) s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc'
    else {
      s.sortField = f
      s.sortDir = 'asc'
    }
    _appRenderWorkspace(store)
  }
  if (s.view === 'list') bindListView(onOpen, onSort)
  if (s.view === 'grid') bindGridView(onOpen)
  if (s.view === 'kanban') bindKanbanView(store, records, onOpen, onRefresh)
  if (s.view === 'spatial') bindSpatialCanvas(store, records, onOpen, onRefresh)
}
