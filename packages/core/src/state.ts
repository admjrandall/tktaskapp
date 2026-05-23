// ── STATE ──────────────────────────────────────────────────────────────────
// Tiny pub/sub system. _state is treated as immutable from outside —
// always go through setState. Listeners receive the new state.

import { dbGetAll, getRunningTimer } from './storage/db.js'
import { LS_DENSITY_KEY } from './constants.js'
import type { Client } from './schemas/client.schema.js'
import type { Project } from './schemas/project.schema.js'
import type { Task } from './schemas/task.schema.js'
import type { Person } from './schemas/person.schema.js'
import type { Department } from './schemas/department.schema.js'
import type { Tag } from './schemas/tag.schema.js'
import type { Communication } from './schemas/communication.schema.js'
import type { TimeEntry } from './schemas/time-entry.schema.js'
import type { Notification } from './schemas/notification.schema.js'
import type { StandaloneNote } from './schemas/standalone-note.schema.js'

// ── Persona types ──────────────────────────────────────────────────────────
export type PersonaId =
  | 'closer'
  | 'maintainer'
  | 'investigator'
  | 'builder'
  | 'inspector'
  // Phase 5 — OT/ICS vertical pack
  | 'operator'
  | 'field-engineer'

// ── Lockdown levels (C.7) ──────────────────────────────────────────────────
export type LockdownLevel = 'off' | 'standard' | 'strong' | 'strict'

// ── Workspace layout block ─────────────────────────────────────────────────
export interface CanvasBlock {
  id: string
  x: number
  y: number
  w: number
  h: number
  z?: number
  type?: string
}

export interface AppState {
  authed: boolean
  cryptoKey: CryptoKey | null
  currentView: string
  sidebarCollapsed: boolean
  theme: string
  density: 'comfortable' | 'compact'

  // Typed CRM collections
  clients: Client[]
  departments: Department[]
  projects: Project[]
  tasks: Task[]
  people: Person[]
  standaloneNotes: StandaloneNote[]
  tags: Tag[]
  communications: Communication[]
  files: Record<string, unknown>[]
  timeEntries: TimeEntry[]
  notifications: Notification[]
  trash: Record<string, unknown>[]
  documents: Record<string, unknown>[]
  conversations: Record<string, unknown>[]
  activeConversationId: string | null

  // Phase 1: deals + pipelines
  deals: Record<string, unknown>[]
  pipelines: Record<string, unknown>[]

  // Workspace / persona state (Phase 1)
  currentPersona: PersonaId | null
  workspaceLayout: Record<string, CanvasBlock>
  aiAttributeValues: Record<string, unknown>[]
  adaptiveSuggestions: Array<{ id: string; type: string; payload: unknown }>
  lockdownLevel: LockdownLevel

  // UI state
  aiPanelOpen: boolean
  commandOpen: boolean
  notifPanelOpen: boolean
  toast: { id: number; message: string; type: string } | null
  confirmDialog: { message: string; onConfirm: () => void; onCancel: (() => void) | null } | null
  recordModal: { store: string; id: string | null; defaults: Record<string, unknown> } | null
  docModal: boolean
  fileViewer: unknown
  runningTimer: unknown
  timerElapsed: number
}

let _state: AppState = {
  authed: false,
  cryptoKey: null,
  currentView: 'dashboard',
  sidebarCollapsed: false,
  theme: localStorage.getItem('taskapp_theme') || 'light',
  density: (localStorage.getItem(LS_DENSITY_KEY) || 'comfortable') as 'comfortable' | 'compact',
  clients: [],
  departments: [],
  projects: [],
  tasks: [],
  people: [],
  standaloneNotes: [],
  tags: [],
  communications: [],
  files: [],
  timeEntries: [],
  notifications: [],
  trash: [],
  documents: [] as Record<string, unknown>[],
  conversations: [] as Record<string, unknown>[],
  activeConversationId: null,
  deals: [],
  pipelines: [],
  currentPersona: null,
  workspaceLayout: {},
  aiAttributeValues: [],
  adaptiveSuggestions: [],
  lockdownLevel: 'off',
  aiPanelOpen: false,
  commandOpen: false,
  notifPanelOpen: false,
  toast: null,
  confirmDialog: null,
  recordModal: null,
  docModal: false,
  fileViewer: null,
  runningTimer: null,
  timerElapsed: 0,
}

const _listeners = new Set<(s: AppState) => void>()
let _timerInterval: ReturnType<typeof setInterval> | null = null

export function subscribe(fn: (s: AppState) => void): () => void {
  _listeners.add(fn)
  return () => {
    _listeners.delete(fn)
  }
}

let _isNotifying = false
const _pendingPatches: Partial<AppState>[] = []

function _notify(): void {
  _listeners.forEach((fn) => {
    fn(_state)
  })
}

export function getState(): AppState {
  return _state
}

export function setState(patch: Partial<AppState>): void {
  if (_isNotifying) {
    _pendingPatches.push(patch)
    return
  }
  _state = { ..._state, ...patch }
  _isNotifying = true
  try {
    _notify()
  } finally {
    _isNotifying = false
  }
  while (_pendingPatches.length > 0) {
    const next = _pendingPatches.shift()
    if (!next) break
    _state = { ..._state, ...next }
    _isNotifying = true
    try {
      _notify()
    } finally {
      _isNotifying = false
    }
  }
}

export function setTheme(t: string): void {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem('taskapp_theme', t)
  setState({ theme: t })
}

export function setDensity(d: 'comfortable' | 'compact'): void {
  document.documentElement.setAttribute('data-density', d)
  localStorage.setItem(LS_DENSITY_KEY, d)
  setState({ density: d })
}

export function initTheme(): void {
  document.documentElement.setAttribute('data-theme', _state.theme)
}

export function initDensity(): void {
  const d = _state.density
  if (d !== 'comfortable') document.documentElement.setAttribute('data-density', d)
}

export function reloadData(): void {
  const stores = [
    'clients',
    'departments',
    'projects',
    'tasks',
    'people',
    'standaloneNotes',
    'tags',
    'communications',
    'files',
    'timeEntries',
    'notifications',
    'trash',
    'documents',
    'conversations',
    'deals',
    'pipelines',
  ]
  const patch: Partial<AppState> = {}
  stores.forEach((s) => {
    ;(patch as Record<string, unknown>)[s] = dbGetAll(s)
  })
  const running =
    (patch.timeEntries as Array<{ running: boolean }> | undefined)?.find((e) => e.running) ??
    getRunningTimer()
  ;(patch as Record<string, unknown>).runningTimer = running || null
  if (running && !_timerInterval) {
    _timerInterval = setInterval(() => {
      const r = _state.runningTimer as { startedAt: string } | null
      if (!r) {
        if (_timerInterval) clearInterval(_timerInterval)
        _timerInterval = null
        return
      }
      setState({ timerElapsed: Math.floor((Date.now() - new Date(r.startedAt).getTime()) / 1000) })
    }, 1000)
  }
  if (!running && _timerInterval) {
    clearInterval(_timerInterval)
    _timerInterval = null
    ;(patch as Record<string, unknown>).timerElapsed = 0
  }
  setState(patch)
}

export function showToast(message: string, type = 'info', duration = 3500): void {
  const id = Date.now()
  setState({ toast: { id, message, type } })
  setTimeout(() => {
    if (_state.toast?.id === id) setState({ toast: null })
  }, duration)
}

export function showConfirm(
  message: string,
  onConfirm: () => void,
  onCancel: (() => void) | null = null,
): void {
  setState({ confirmDialog: { message, onConfirm, onCancel } })
}

export function closeConfirm(): void {
  setState({ confirmDialog: null })
}

export function openRecordModal(
  store: string,
  id: string | null = null,
  defaults: Record<string, unknown> = {},
): void {
  setState({ recordModal: { store, id, defaults } })
}

export function closeRecordModal(): void {
  setState({ recordModal: null })
}

// ── AI hooks — injected from main.ts to avoid circular imports ─────────────
let _aiNeedsOnboarding: (() => boolean) | null = null
let _openAIWizard: ((step: number) => void) | null = null
export function setAIHooks(
  needsOnboarding: () => boolean,
  openWizard: (step: number) => void,
): void {
  _aiNeedsOnboarding = needsOnboarding
  _openAIWizard = openWizard
}

export function navigate(view: string): void {
  if (view === 'ai' && _aiNeedsOnboarding && _aiNeedsOnboarding()) {
    if (_openAIWizard) {
      _openAIWizard(1)
      return
    }
  }
  setState({ currentView: view, aiPanelOpen: false, commandOpen: false, notifPanelOpen: false })
}
