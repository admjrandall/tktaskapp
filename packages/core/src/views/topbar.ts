// ── TOPBAR ────────────────────────────────────────────────────────────────────
// Rebuilt for Phase 1: search centerpiece, AI button, persona avatar, lockdown banner.
// Export API is stable — hooks-wiring.ts and render-pipeline.ts depend on it.

import { Icons } from '../ui/icons.js'
import { setState } from '../state.js'
import type { AppState } from '../state.js'
import { BRAND } from '../branding.js'
import { PERSONA_PRESETS } from '../personas/index.js'
import { escH } from '../utils.js'

// ── Hook injection ────────────────────────────────────────────────────────────
let _aiNeedsOnboarding: () => boolean = () => false
let _openAIWizard: (step?: number) => void = () => {}
let _setTheme: (theme: string) => void = () => {}
let _lockApp: () => void = () => {}

export interface TopbarHooks {
  aiNeedsOnboarding: () => boolean
  openAIWizard: (step?: number) => void
  setTheme: (theme: string) => void
  lockApp?: () => void
}

export function setTopbarHooks(hooks: TopbarHooks): void {
  _aiNeedsOnboarding = hooks.aiNeedsOnboarding
  _openAIWizard = hooks.openAIWizard
  _setTheme = hooks.setTheme
  if (hooks.lockApp) _lockApp = hooks.lockApp
}

const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  clients: 'Clients',
  departments: 'Departments',
  projects: 'Projects',
  tasks: 'Tasks',
  people: 'People',
  calendar: 'Calendar',
  time: 'Time Tracker',
  reports: 'Reports',
  ai: 'AI Chat',
  settings: 'Settings',
  standaloneNotes: 'Notes',
  trash: 'Recycle Bin',
  documents: 'Library',
  files: 'Library',
  library: 'Library',
  communications: 'Communications',
  deals: 'Deals',
  pipelines: 'Pipelines',
}

const VIEW_ICONS: Record<string, (s?: number) => string> = {
  dashboard: Icons.Dashboard,
  clients: Icons.Clients,
  departments: Icons.Departments,
  projects: Icons.Projects,
  tasks: Icons.Tasks,
  people: Icons.People,
  standaloneNotes: Icons.Notes,
  calendar: Icons.Calendar,
  time: Icons.Clock,
  reports: Icons.Reports,
  ai: Icons.AI,
  settings: Icons.Settings,
  trash: Icons.Trash,
  library: Icons.Files,
  files: Icons.Files,
  documents: Icons.Doc,
  communications: Icons.Bell,
  deals: Icons.Projects,
  pipelines: Icons.Projects,
}

function renderLockdownBanner(level: AppState['lockdownLevel']): string {
  if (level === 'off') return ''
  const msg =
    BRAND.lockdown[
      `banner${level.charAt(0).toUpperCase() + level.slice(1)}` as keyof typeof BRAND.lockdown
    ] ?? ''
  const colors: Record<string, string> = {
    standard: 'background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe',
    strong: 'background:#fffbeb;color:#92400e;border-color:#fde68a',
    strict: 'background:#fef2f2;color:#991b1b;border-color:#fecaca',
  }
  const style = colors[level] ?? ''
  return `<div id="lockdown-banner" style="${escH(style)};border-bottom:1px solid;padding:.375rem 1rem;font-size:.8125rem;font-weight:500;display:flex;align-items:center;gap:.5rem">${Icons.Lock(14)}<span>${escH(msg)}</span></div>`
}

function renderPersonaChip(state: AppState): string {
  if (!state.currentPersona) return ''
  const preset = PERSONA_PRESETS[state.currentPersona]
  return `<button class="btn btn-ghost btn-sm" id="topbar-persona-btn" title="Active persona: ${escH(preset.label)}" style="font-size:.8125rem;gap:.25rem;color:var(--text-secondary)"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block"></span>${escH(preset.label)}</button>`
}

export function renderTopbar(state: AppState): string {
  const unread = (state.notifications as Array<Record<string, unknown>>).filter(
    (n) => !n.read,
  ).length
  const iconFn = VIEW_ICONS[state.currentView]
  const viewIcon = iconFn ? `<span class="topbar-view-icon">${iconFn(16)}</span>` : ''
  const viewLabel = VIEW_LABELS[state.currentView] ?? escH(state.currentView)

  const lockBtn = state.authed
    ? `<button class="btn btn-ghost btn-icon" id="topbar-lock-btn" title="Lock app">${Icons.Lock(16)}</button>`
    : ''

  const aiBtn = `<button class="btn btn-ghost btn-icon${state.aiPanelOpen ? ' ai-btn-active' : ''}" id="ai-toggle-btn" title="${escH(BRAND.aiAssistantName)}">${Icons.AI()}</button>`

  const notifBtn = `<div style="position:relative"><button class="btn btn-ghost btn-icon" id="notif-btn">${Icons.Bell()}</button>${unread > 0 ? `<span class="notif-badge">${unread > 9 ? '9+' : unread}</span>` : ''}</div>`

  const searchBtn = `<button class="global-search" id="global-search-btn">${Icons.Search(14)}<span>Search…</span><span class="kbd">⌘K</span></button>`

  const themeBtn = `<button class="btn btn-ghost btn-icon" id="theme-toggle" title="Toggle theme">${state.theme === 'dark' ? Icons.Sun() : Icons.Moon()}</button>`

  const banner = renderLockdownBanner(state.lockdownLevel)
  const personaChip = renderPersonaChip(state)

  return `${banner}<header class="topbar"><span class="topbar-title">${viewIcon}${viewLabel}</span>${personaChip}<div class="topbar-spacer"></div>${searchBtn}<div class="topbar-divider"></div>${aiBtn}${notifBtn}${themeBtn}${lockBtn}</header>`
}

export function bindTopbar(state: AppState): void {
  document.getElementById('global-search-btn')?.addEventListener('click', () => {
    setState({ commandOpen: true })
  })

  document.getElementById('ai-toggle-btn')?.addEventListener('click', () => {
    if (_aiNeedsOnboarding()) {
      _openAIWizard(1)
    } else {
      setState({ aiPanelOpen: !state.aiPanelOpen })
    }
  })

  document.getElementById('notif-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    setState({ notifPanelOpen: !state.notifPanelOpen })
  })

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    _setTheme(state.theme === 'dark' ? 'light' : 'dark')
  })

  document.getElementById('topbar-lock-btn')?.addEventListener('click', () => {
    _lockApp()
  })

  document.getElementById('topbar-persona-btn')?.addEventListener('click', () => {
    // Navigate to settings → persona section
    setState({ currentView: 'settings' })
  })
}
