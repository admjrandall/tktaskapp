// ── SIDEBAR ───────────────────────────────────────────────────────────────────
// Adaptive nav: reorders entries per active persona preset.

import { Icons } from '../ui/icons.js'
import { setState, getState, navigate } from '../state.js'
import type { AppState } from '../state.js'
import { BRAND } from '../branding.js'
import { getPersonaSidebarOrder, PERSONA_PRESETS } from '../personas/index.js'
import { LS_USER_PROFILE_KEY } from '../constants.js'
import { escH } from '../utils.js'

type IconName = keyof typeof Icons

// ── FS hook injection ─────────────────────────────────────────────────────────
let _getFsReady: () => boolean = () => false
let _getFsLastSave: () => string | null = () => null

export function setSidebarFsHooks(hooks: {
  getFsReady: () => boolean
  getFsLastSave: () => string | null
}): void {
  _getFsReady = hooks.getFsReady
  _getFsLastSave = hooks.getFsLastSave
}

type NavEntry =
  | { kind: 'item'; id: string; label: string; icon: IconName }
  | { kind: 'divider' }
  | { kind: 'label'; text: string }

// Full nav registry — all possible views
export const NAV_REGISTRY: Record<string, { label: string; icon: IconName }> = {
  dashboard: { label: 'Dashboard', icon: 'Dashboard' },
  ai: { label: 'AI Chat', icon: 'AI' },
  clients: { label: 'Clients', icon: 'Clients' },
  departments: { label: 'Departments', icon: 'Departments' },
  projects: { label: 'Projects', icon: 'Projects' },
  tasks: { label: 'Tasks', icon: 'Tasks' },
  people: { label: 'People', icon: 'People' },
  communications: { label: 'Communications', icon: 'Bell' },
  standaloneNotes: { label: 'Notes', icon: 'Notes' },
  library: { label: 'Library', icon: 'Files' },
  calendar: { label: 'Calendar', icon: 'Calendar' },
  time: { label: 'Time Tracker', icon: 'Clock' },
  reports: { label: 'Reports', icon: 'Reports' },
  settings: { label: 'Settings', icon: 'Settings' },
  trash: { label: 'Recycle Bin', icon: 'Trash' },
}

// Default nav order (no persona)
export const NAV_ENTRIES: NavEntry[] = [
  { kind: 'item', id: 'dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { kind: 'item', id: 'ai', label: 'AI Chat', icon: 'AI' },
  { kind: 'divider' },
  { kind: 'label', text: 'CRM' },
  { kind: 'item', id: 'clients', label: 'Clients', icon: 'Clients' },
  { kind: 'item', id: 'projects', label: 'Projects', icon: 'Projects' },
  { kind: 'item', id: 'tasks', label: 'Tasks', icon: 'Tasks' },
  { kind: 'item', id: 'communications', label: 'Communications', icon: 'Bell' },
  { kind: 'divider' },
  { kind: 'item', id: 'people', label: 'People', icon: 'People' },
  { kind: 'item', id: 'departments', label: 'Departments', icon: 'Departments' },
  { kind: 'divider' },
  { kind: 'label', text: 'Content' },
  { kind: 'item', id: 'standaloneNotes', label: 'Notes', icon: 'Notes' },
  { kind: 'item', id: 'library', label: 'Library', icon: 'Files' },
  { kind: 'item', id: 'calendar', label: 'Calendar', icon: 'Calendar' },
  { kind: 'divider' },
  { kind: 'item', id: 'reports', label: 'Reports', icon: 'Reports' },
]

function buildPersonaEntries(order: string[]): NavEntry[] {
  const entries: NavEntry[] = []
  for (const id of order) {
    const entry = NAV_REGISTRY[id]
    if (entry) entries.push({ kind: 'item', id, label: entry.label, icon: entry.icon })
  }
  return entries
}

const PRIMARY_TAB_VIEWS = new Set(['dashboard', 'projects', 'tasks', 'calendar'])

export const MOBILE_TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Home', icon: 'Dashboard' },
  { id: 'projects', label: 'Projects', icon: 'Projects' },
  { id: 'tasks', label: 'Tasks', icon: 'Tasks' },
  { id: 'calendar', label: 'Calendar', icon: 'Calendar' },
  { id: '__more__', label: 'More', icon: 'Menu' },
]

export function renderSidebar(state: AppState): string {
  const { currentView, sidebarCollapsed, currentPersona } = state

  const hasFsApi = typeof window !== 'undefined' && 'showSaveFilePicker' in window
  const fsReady = _getFsReady()
  const fsLastSave = _getFsLastSave()
  const fsTooltip = fsReady
    ? `Vault linked${fsLastSave ? ' · saved ' + new Date(fsLastSave).toLocaleTimeString() : ''}`
    : 'No vault file linked — go to Settings → Storage'
  const fsBadge = hasFsApi
    ? `<span class="fs-logo-badge ${fsReady ? 'fs-logo-ok' : 'fs-logo-warn'}" title="${escH(fsTooltip)}">${fsReady ? '✓' : '!'}</span>`
    : ''

  const profile = (() => {
    try {
      return JSON.parse(localStorage.getItem(LS_USER_PROFILE_KEY) || '{}') as {
        displayName?: string
        initials?: string
      }
    } catch {
      return {}
    }
  })()
  const displayName = profile.displayName || 'Your Name'
  const profileInitials =
    profile.initials ||
    displayName
      .split(' ')
      .map((w) => w[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase() ||
    'U'

  const activeEntries = currentPersona
    ? buildPersonaEntries(getPersonaSidebarOrder(currentPersona))
    : NAV_ENTRIES

  const entriesHtml = activeEntries
    .map((entry) => {
      if (entry.kind === 'divider') return `<div class="nav-divider"></div>`
      if (entry.kind === 'label') return `<div class="nav-entry-label">${escH(entry.text)}</div>`
      const isActive = currentView === entry.id
      const iconFn = Icons[entry.icon] as ((size?: number) => string) | undefined
      return `<button class="nav-item ${isActive ? 'active' : ''}" data-nav="${entry.id}" title="${escH(entry.label)}"><span class="nav-item-icon">${iconFn?.(20) ?? ''}</span><span class="nav-item-label">${escH(entry.label)}</span></button>`
    })
    .join('')

  const personaLabel = currentPersona ? PERSONA_PRESETS[currentPersona].label : ''
  const personaBadge = personaLabel
    ? `<span style="font-size:.6875rem;background:var(--accent-muted);color:var(--accent);border-radius:4px;padding:.1rem .35rem;font-weight:600">${escH(personaLabel)}</span>`
    : ''

  return `<aside class="sidebar ${sidebarCollapsed ? 'collapsed' : ''}" id="sidebar">
    <div class="sidebar-logo"><div class="sidebar-logo-mark" style="position:relative">${escH(BRAND.logoMark)}${fsBadge}</div><span class="sidebar-logo-text">${escH(BRAND.shortName)}</span></div>
    <nav class="sidebar-nav">${entriesHtml}</nav>
    <div class="sidebar-footer-user">
      <div class="avatar avatar-sm sidebar-user-avatar">${escH(profileInitials)}</div>
      <div style="flex:1;min-width:0"><span class="sidebar-user-name">${escH(displayName)}</span>${personaBadge}</div>
      <button class="btn btn-ghost btn-icon sidebar-settings-btn" data-nav="settings" title="Settings">${Icons.Settings(18)}</button>
    </div>
    <div class="sidebar-footer"><button class="collapse-btn" id="sidebar-collapse">${sidebarCollapsed ? Icons.ChevronRight(18) : Icons.ChevronLeft(18)}</button></div>
  </aside>`
}

function _openMobileSheet(): void {
  document.getElementById('mobile-sheet')?.classList.add('open')
  document.getElementById('mobile-sheet-overlay')?.classList.add('open')
  document.body.style.overflow = 'hidden'
}

function _closeMobileSheet(): void {
  document.getElementById('mobile-sheet')?.classList.remove('open')
  document.getElementById('mobile-sheet-overlay')?.classList.remove('open')
  document.body.style.overflow = ''
}

export function renderBottomTabs(state: AppState): string {
  const tabs = MOBILE_TABS.map((t) => {
    const iconFn = Icons[t.icon] as ((size?: number) => string) | undefined
    const isActive =
      t.id === '__more__' ? !PRIMARY_TAB_VIEWS.has(state.currentView) : state.currentView === t.id
    return `<button class="bottom-tab ${isActive ? 'active' : ''}" data-nav="${t.id}">${iconFn?.(22) ?? ''}<span>${escH(t.label)}</span></button>`
  }).join('')

  const sheetEntries = [
    ...NAV_ENTRIES,
    { kind: 'divider' as const },
    { kind: 'item' as const, id: 'settings', label: 'Settings', icon: 'Settings' as IconName },
  ]
  const sheetNav = sheetEntries
    .map((entry) => {
      if (entry.kind === 'divider') return `<div class="mobile-sheet-divider"></div>`
      if (entry.kind === 'label')
        return `<div class="mobile-sheet-section-label">${escH(entry.text)}</div>`
      const iconFn = Icons[entry.icon] as ((size?: number) => string) | undefined
      return `<button class="mobile-sheet-item ${state.currentView === entry.id ? 'active' : ''}" data-nav="${entry.id}">${iconFn?.(20) ?? ''}<span>${escH(entry.label)}</span></button>`
    })
    .join('')

  return `<div class="bottom-tabs" id="bottom-tabs">${tabs}</div>
<div class="mobile-sheet-overlay" id="mobile-sheet-overlay"></div>
<div class="mobile-sheet" id="mobile-sheet">
  <div class="mobile-sheet-handle"></div>
  <div class="mobile-sheet-header"><span>Menu</span><button class="btn btn-ghost btn-icon" id="mobile-sheet-close">${Icons.Close(20)}</button></div>
  <div class="mobile-sheet-nav">${sheetNav}</div>
</div>`
}

export function bindSidebar(): void {
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nav = (btn.dataset as DOMStringMap & { nav: string }).nav
      if (nav === '__more__') {
        _openMobileSheet()
      } else {
        _closeMobileSheet()
        navigate(nav)
      }
    })
  })
  document.getElementById('sidebar-collapse')?.addEventListener('click', () => {
    setState({ sidebarCollapsed: !getState().sidebarCollapsed })
  })
  document.getElementById('mobile-sheet-overlay')?.addEventListener('click', _closeMobileSheet)
  document.getElementById('mobile-sheet-close')?.addEventListener('click', _closeMobileSheet)
}
