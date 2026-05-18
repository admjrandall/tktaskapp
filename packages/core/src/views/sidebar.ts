// ── SIDEBAR ───────────────────────────────────────────────────────────────────

import { Icons } from '../icons.js';
import { setState, getState, navigate } from '../state.js';
import type { AppState } from '../state.js';

type IconName = keyof typeof Icons;

// ── FS hook injection ─────────────────────────────────────────────────────────
let _getFsReady: () => boolean = () => false;
let _getFsLastSave: () => string | null = () => null;

export function setSidebarFsHooks(hooks: {
  getFsReady: () => boolean;
  getFsLastSave: () => string | null;
}): void {
  _getFsReady = hooks.getFsReady;
  _getFsLastSave = hooks.getFsLastSave;
}

type NavEntry =
  | { kind: 'item'; id: string; label: string; icon: IconName }
  | { kind: 'divider' }
  | { kind: 'label'; text: string };

export const NAV_ENTRIES: NavEntry[] = [
  { kind: 'item',  id: 'dashboard',       label: 'Dashboard',   icon: 'Dashboard' },
  { kind: 'item',  id: 'ai',              label: 'AI Chat',     icon: 'AI' },
  { kind: 'divider' },
  { kind: 'label', text: 'CRM' },
  { kind: 'item',  id: 'clients',         label: 'Clients',     icon: 'Clients' },
  { kind: 'item',  id: 'projects',        label: 'Projects',    icon: 'Projects' },
  { kind: 'item',  id: 'tasks',           label: 'Tasks',       icon: 'Tasks' },
  { kind: 'divider' },
  { kind: 'item',  id: 'people',          label: 'People',      icon: 'People' },
  { kind: 'item',  id: 'departments',     label: 'Departments', icon: 'Departments' },
  { kind: 'divider' },
  { kind: 'label', text: 'Content' },
  { kind: 'item',  id: 'standaloneNotes', label: 'Notes',       icon: 'Notes' },
  { kind: 'item',  id: 'library',         label: 'Library',     icon: 'Files' },
  { kind: 'item',  id: 'calendar',        label: 'Calendar',    icon: 'Calendar' },
  { kind: 'divider' },
  { kind: 'item',  id: 'reports',         label: 'Reports',     icon: 'Reports' },
];

// Primary tab views — "More" tab highlights when current view is NOT one of these
const PRIMARY_TAB_VIEWS = new Set(['dashboard', 'projects', 'tasks', 'calendar']);

export const MOBILE_TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Home',     icon: 'Dashboard' },
  { id: 'projects',  label: 'Projects', icon: 'Projects' },
  { id: 'tasks',     label: 'Tasks',    icon: 'Tasks' },
  { id: 'calendar',  label: 'Calendar', icon: 'Calendar' },
  { id: '__more__',  label: 'More',     icon: 'Menu' },
];

export function renderSidebar(state: AppState): string {
  const { currentView, sidebarCollapsed } = state;

  const hasFsApi = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  const fsReady = _getFsReady();
  const fsLastSave = _getFsLastSave();
  const fsTooltip = fsReady
    ? `Vault linked${fsLastSave ? ' · saved ' + new Date(fsLastSave).toLocaleTimeString() : ''}`
    : 'No vault file linked — go to Settings → Storage';
  const fsBadge = hasFsApi
    ? `<span class="fs-logo-badge ${fsReady ? 'fs-logo-ok' : 'fs-logo-warn'}" title="${fsTooltip}">${fsReady ? '✓' : '!'}</span>`
    : '';

  const entries = NAV_ENTRIES.map(entry => {
    if (entry.kind === 'divider') return `<div class="nav-divider"></div>`;
    if (entry.kind === 'label')   return `<div class="nav-entry-label">${entry.text}</div>`;
    const isActive = currentView === entry.id;
    const iconFn = Icons[entry.icon] as ((size?: number) => string) | undefined;
    return `<button class="nav-item ${isActive ? 'active' : ''}" data-nav="${entry.id}" title="${entry.label}"><span class="nav-item-icon">${iconFn?.(20) ?? ''}</span><span class="nav-item-label">${entry.label}</span></button>`;
  }).join('');

  return `<aside class="sidebar ${sidebarCollapsed ? 'collapsed' : ''}" id="sidebar">
    <div class="sidebar-logo"><div class="sidebar-logo-mark" style="position:relative">N${fsBadge}</div><span class="sidebar-logo-text">Task App CRM</span></div>
    <nav class="sidebar-nav">${entries}</nav>
    <div class="sidebar-footer-user">
      <div class="avatar avatar-sm sidebar-user-avatar">U</div>
      <span class="sidebar-user-name">Your Name</span>
      <button class="btn btn-ghost btn-icon sidebar-settings-btn" data-nav="settings" title="Settings">${Icons.Settings(18)}</button>
    </div>
    <div class="sidebar-footer"><button class="collapse-btn" id="sidebar-collapse">${sidebarCollapsed ? Icons.ChevronRight(18) : Icons.ChevronLeft(18)}</button></div>
  </aside>`;
}

function _openMobileSheet(): void {
  document.getElementById('mobile-sheet')?.classList.add('open');
  document.getElementById('mobile-sheet-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _closeMobileSheet(): void {
  document.getElementById('mobile-sheet')?.classList.remove('open');
  document.getElementById('mobile-sheet-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

export function renderBottomTabs(state: AppState): string {
  const tabs = MOBILE_TABS.map(t => {
    const iconFn = Icons[t.icon] as ((size?: number) => string) | undefined;
    const isActive = t.id === '__more__'
      ? !PRIMARY_TAB_VIEWS.has(state.currentView)
      : state.currentView === t.id;
    return `<button class="bottom-tab ${isActive ? 'active' : ''}" data-nav="${t.id}">${iconFn?.(22) ?? ''}<span>${t.label}</span></button>`;
  }).join('');

  // Mirror NAV_ENTRIES exactly — same structure as the desktop sidebar
  type SheetEntry =
    | { kind: 'item'; id: string; label: string; icon: IconName }
    | { kind: 'divider' }
    | { kind: 'label'; text: string };

  const sheetEntries: SheetEntry[] = [
    { kind: 'item',  id: 'dashboard',       label: 'Dashboard',   icon: 'Dashboard' },
    { kind: 'item',  id: 'ai',              label: 'AI Chat',     icon: 'AI' },
    { kind: 'divider' },
    { kind: 'label', text: 'CRM' },
    { kind: 'item',  id: 'clients',         label: 'Clients',     icon: 'Clients' },
    { kind: 'item',  id: 'projects',        label: 'Projects',    icon: 'Projects' },
    { kind: 'item',  id: 'tasks',           label: 'Tasks',       icon: 'Tasks' },
    { kind: 'divider' },
    { kind: 'item',  id: 'people',          label: 'People',      icon: 'People' },
    { kind: 'item',  id: 'departments',     label: 'Departments', icon: 'Departments' },
    { kind: 'divider' },
    { kind: 'label', text: 'Content' },
    { kind: 'item',  id: 'standaloneNotes', label: 'Notes',       icon: 'Notes' },
    { kind: 'item',  id: 'library',         label: 'Library',     icon: 'Files' },
    { kind: 'item',  id: 'calendar',        label: 'Calendar',    icon: 'Calendar' },
    { kind: 'divider' },
    { kind: 'item',  id: 'reports',         label: 'Reports',     icon: 'Reports' },
    { kind: 'divider' },
    { kind: 'item',  id: 'settings',        label: 'Settings',    icon: 'Settings' },
  ];

  const sheetNav = sheetEntries.map(entry => {
    if (entry.kind === 'divider') return `<div class="mobile-sheet-divider"></div>`;
    if (entry.kind === 'label')   return `<div class="mobile-sheet-section-label">${entry.text}</div>`;
    const iconFn = Icons[entry.icon] as ((size?: number) => string) | undefined;
    return `<button class="mobile-sheet-item ${state.currentView === entry.id ? 'active' : ''}" data-nav="${entry.id}">${iconFn?.(20) ?? ''}<span>${entry.label}</span></button>`;
  }).join('');

  return `<div class="bottom-tabs" id="bottom-tabs">${tabs}</div>
<div class="mobile-sheet-overlay" id="mobile-sheet-overlay"></div>
<div class="mobile-sheet" id="mobile-sheet">
  <div class="mobile-sheet-handle"></div>
  <div class="mobile-sheet-header"><span>Menu</span><button class="btn btn-ghost btn-icon" id="mobile-sheet-close">${Icons.Close(20)}</button></div>
  <div class="mobile-sheet-nav">${sheetNav}</div>
</div>`;
}

export function bindSidebar(): void {
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(btn =>
    btn.addEventListener('click', () => {
      const nav = (btn.dataset as DOMStringMap & { nav: string }).nav;
      if (nav === '__more__') {
        _openMobileSheet();
      } else {
        _closeMobileSheet();
        navigate(nav);
      }
    })
  );
  document.getElementById('sidebar-collapse')?.addEventListener('click', () =>
    setState({ sidebarCollapsed: !(getState() as AppState).sidebarCollapsed })
  );
  document.getElementById('mobile-sheet-overlay')?.addEventListener('click', _closeMobileSheet);
  document.getElementById('mobile-sheet-close')?.addEventListener('click', _closeMobileSheet);
}
