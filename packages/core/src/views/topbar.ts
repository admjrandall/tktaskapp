// ── TOPBAR ────────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 7492–7525.

import { Icons } from '../icons.js';
import { setState } from '../state.js';
import type { AppState } from '../state.js';

// ── Hook injection ────────────────────────────────────────────────────────────
let _aiNeedsOnboarding: () => boolean = () => false;
let _openAIWizard: (step?: number) => void = () => {};
let _setTheme: (theme: string) => void = () => {};

export interface TopbarHooks {
  aiNeedsOnboarding: () => boolean;
  openAIWizard: (step?: number) => void;
  setTheme: (theme: string) => void;
}

export function setTopbarHooks(hooks: TopbarHooks): void {
  _aiNeedsOnboarding = hooks.aiNeedsOnboarding;
  _openAIWizard = hooks.openAIWizard;
  _setTheme = hooks.setTheme;
}

// ── View label + icon maps ────────────────────────────────────────────────────
const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', clients: 'Clients', departments: 'Departments',
  projects: 'Projects', tasks: 'Tasks', people: 'People', calendar: 'Calendar',
  time: 'Time Tracker', reports: 'Reports', ai: 'AI Chat', settings: 'Settings',
  standaloneNotes: 'Notes', trash: 'Recycle Bin', documents: 'Library',
  files: 'Library', library: 'Library',
};

const VIEW_ICONS: Record<string, (s?: number) => string> = {
  dashboard: Icons.Dashboard, clients: Icons.Clients, departments: Icons.Departments,
  projects: Icons.Projects, tasks: Icons.Tasks, people: Icons.People,
  standaloneNotes: Icons.Notes, calendar: Icons.Calendar, time: Icons.Clock,
  reports: Icons.Reports, ai: Icons.AI, settings: Icons.Settings,
  trash: Icons.Trash, library: Icons.Files, files: Icons.Files, documents: Icons.Doc,
};

// ── Renderer ──────────────────────────────────────────────────────────────────
export function renderTopbar(state: AppState): string {
  const unread = (state.notifications as Array<Record<string, unknown>>).filter(n => !n.read).length;
  const iconFn = VIEW_ICONS[state.currentView];
  const viewIcon = iconFn ? `<span class="topbar-view-icon">${iconFn(16)}</span>` : '';

  return `<header class="topbar"><span class="topbar-title">${viewIcon}${VIEW_LABELS[state.currentView] || state.currentView}</span><div class="topbar-spacer"></div><button class="global-search" id="global-search-btn">${Icons.Search(14)}<span>Search…</span><span class="kbd">⌘K</span></button><div class="topbar-divider"></div><button class="btn btn-ghost btn-icon${state.aiPanelOpen ? ' ai-btn-active' : ''}" id="ai-toggle-btn" title="AI Assistant">${Icons.AI()}</button><div style="position:relative"><button class="btn btn-ghost btn-icon" id="notif-btn">${Icons.Bell()}</button>${unread > 0 ? `<span class="notif-badge">${unread > 9 ? '9+' : unread}</span>` : ''}</div><button class="btn btn-ghost btn-icon" id="theme-toggle">${state.theme === 'dark' ? Icons.Sun() : Icons.Moon()}</button></header>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────
export function bindTopbar(state: AppState): void {
  document.getElementById('global-search-btn')?.addEventListener('click', () => setState({ commandOpen: true }));

  document.getElementById('ai-toggle-btn')?.addEventListener('click', () => {
    if (_aiNeedsOnboarding()) {
      _openAIWizard(1);
    } else {
      setState({ aiPanelOpen: !state.aiPanelOpen });
    }
  });

  document.getElementById('notif-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    setState({ notifPanelOpen: !state.notifPanelOpen });
  });

  document.getElementById('theme-toggle')?.addEventListener('click', () =>
    _setTheme(state.theme === 'dark' ? 'light' : 'dark')
  );
}
