// ── STATE ──────────────────────────────────────────────────────────────
// Extracted from taskapp.html ~3422–3451
// Tiny pub/sub system. _state is treated as immutable from outside —
// always go through setState. Listeners receive the new state.

import { dbGetAll, getRunningTimer } from './storage/db.js'

export interface AppState {
  authed: boolean
  cryptoKey: CryptoKey | null
  currentView: string
  sidebarCollapsed: boolean
  theme: string
  clients: unknown[]
  departments: unknown[]
  projects: unknown[]
  tasks: unknown[]
  people: unknown[]
  standaloneNotes: unknown[]
  tags: unknown[]
  communications: unknown[]
  files: unknown[]
  timeEntries: unknown[]
  notifications: unknown[]
  trash: unknown[]
  documents: unknown[]
  conversations: unknown[]
  activeConversationId: string | null
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
  theme: localStorage.getItem('nexus_theme') || 'light',
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
  documents: [],
  conversations: [],
  activeConversationId: null,
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
    // Re-entrant call from inside a subscriber: queue and drain after the
    // current notification round completes (prevents infinite loops).
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
  // Drain any patches that were queued by subscribers during notification.
  while (_pendingPatches.length > 0) {
    const next = _pendingPatches.shift()!
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
export function initTheme(): void {
  document.documentElement.setAttribute('data-theme', _state.theme)
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

// AI hooks — injected from main.ts (avoids circular import).
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
  setState({
    currentView: view,
    aiPanelOpen: false,
    commandOpen: false,
    notifPanelOpen: false,
  })
}
