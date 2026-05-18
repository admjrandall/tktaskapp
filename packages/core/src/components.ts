// -- COMPONENTS ---------------------------------------------------------
// Extracted from taskapp.html ~3461-3542. Logic preserved, with module
// imports/exports and narrow local types added for TypeScript strict mode.

import { Icons } from './icons.js';
import { escH, formatDate, formatRelative, daysUntil, initials, avatarColor } from './utils.js';
import {
  getState, setState, navigate, openRecordModal, closeConfirm,
} from './state.js';
import { globalSearch } from './db.js';

type AnyRecord = Record<string, unknown>;
type Toast = { type?: string; message?: unknown } | null | undefined;
type ConfirmDialog = {
  message?: unknown;
  onConfirm?: () => void;
  onCancel?: () => void;
} | null | undefined;
type CommandAction = {
  label: string;
  icon: string;
  action: () => void;
};
type NotificationItem = {
  id: string;
  read?: boolean;
  type?: string;
  title?: unknown;
  body?: unknown;
  createdAt?: string | null;
};

// AI hook (filled by main.ts).
let aiNeedsOnboarding: () => boolean = () => false;
let openAIWizard: (step: number) => void = () => {};
export function setComponentsAIHooks(
  needs: () => boolean, open: (step: number) => void,
): void {
  aiNeedsOnboarding = needs;
  openAIWizard = open;
}

const _state = new Proxy({} as AnyRecord, {
  get(_t, k: string) { return (getState() as unknown as AnyRecord)[k]; },
});

export function renderToast(toast: Toast): string { if (!toast) return ''; const icon = { success: Icons.Check(16), error: Icons.Alert(16), info: Icons.Info(16) }[toast.type as string] || Icons.Info(16); return `<div class="toast-container"><div class="toast toast-${toast.type}" role="alert">${icon} <span>${escH(toast.message)}</span></div></div>`; }
export function renderConfirmDialog(d: ConfirmDialog): string { if (!d) return ''; return `<div class="modal-backdrop" id="confirm-backdrop"><div class="modal" style="max-width:400px"><div class="modal-header"><span class="modal-title">Confirm</span></div><div class="modal-body"><p style="color:var(--text-secondary);font-size:.9375rem;line-height:1.6">${escH(d.message)}</p></div><div class="modal-footer"><button class="btn btn-secondary" id="confirm-cancel">Cancel</button><button class="btn btn-danger" id="confirm-ok">Confirm</button></div></div></div>`; }
export function bindConfirmDialog(d: ConfirmDialog): void { document.getElementById('confirm-ok')?.addEventListener('click', () => { closeConfirm(); d?.onConfirm?.(); }); document.getElementById('confirm-cancel')?.addEventListener('click', () => { closeConfirm(); d?.onCancel?.(); }); document.getElementById('confirm-backdrop')?.addEventListener('click', e => { if ((e.target as HTMLElement | null)?.id === 'confirm-backdrop') { closeConfirm(); d?.onCancel?.(); } }); }
export function renderAvatar(name: string | null | undefined, size = 'md', style = ''): string { const [bg, fg] = avatarColor(name); return `<div class="avatar avatar-${size}" style="background:${bg};color:${fg};${style}">${initials(name)}</div>`; }
export function renderPriorityBadge(p: string | null | undefined): string { const m: Record<string, string> = { Low: 'badge-green', Medium: 'badge-amber', High: 'badge-rose', Critical: 'badge-red' }; return p ? `<span class="badge ${m[p] || 'badge-slate'}">${p}</span>` : ''; }
export function renderDueBadge(ds: string | null | undefined): string { if (!ds) return ''; const d = daysUntil(ds); if (d === null) return ''; if (d < 0) return `<span class="badge badge-rose">${Math.abs(d)}d overdue</span>`; if (d === 0) return `<span class="badge badge-amber">Due today</span>`; if (d <= 3) return `<span class="badge badge-amber">Due in ${d}d</span>`; return `<span class="badge badge-slate">${formatDate(ds)}</span>`; }
export function renderSpinner(msg = ''): string { return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;padding:3rem;color:var(--text-tertiary)"><div class="spinner"></div>${msg ? `<p style="font-size:.875rem">${msg}</p>` : ''}</div>`; }
export function renderEmpty(icon: string, title: string, sub = '', action = ''): string { return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;padding:4rem 2rem;text-align:center;color:var(--text-tertiary)"><div style="opacity:.4">${icon}</div><div><p style="font-weight:600;color:var(--text-secondary);font-size:1rem">${title}</p>${sub ? `<p style="font-size:.875rem;margin-top:.25rem">${sub}</p>` : ''}</div>${action}</div>`; }
export function renderSearchInput(val: unknown = '', ph = 'Search…', id = 'search-input'): string { return `<div style="position:relative;display:flex;align-items:center"><span style="position:absolute;left:.625rem;color:var(--text-tertiary);pointer-events:none">${Icons.Search(14)}</span><input class="input" id="${id}" value="${escH(val)}" placeholder="${ph}" style="padding-left:2rem;width:220px;height:34px" autocomplete="off"></div>`; }
export function renderViewTabs(cur: string): string { return `<div class="view-tabs">${[['list', Icons.List(16), 'List'], ['grid', Icons.Grid(16), 'Grid'], ['kanban', Icons.Kanban(16), 'Kanban'], ['spatial', Icons.Spatial(16), 'Spatial']].map(([id, icon, label]) => `<button class="view-tab ${cur === id ? 'active' : ''}" data-view="${id}" title="${label}">${icon}</button>`).join('')}</div>`; }

// -- COMMAND PALETTE ----------------------------------------------------
export let _cmdQuery = '', _cmdSel = 0;
export const CMD_ACTIONS: CommandAction[] = [
  { label: 'Dashboard', icon: Icons.Dashboard(), action: () => navigate('dashboard') },
  { label: 'Clients', icon: Icons.Clients(), action: () => navigate('clients') },
  { label: 'Departments', icon: Icons.Departments(), action: () => navigate('departments') },
  { label: 'Projects', icon: Icons.Projects(), action: () => navigate('projects') },
  { label: 'Tasks', icon: Icons.Tasks(), action: () => navigate('tasks') },
  { label: 'People', icon: Icons.People(), action: () => navigate('people') },
  { label: 'Notes', icon: Icons.Notes(), action: () => navigate('standaloneNotes') },
  { label: 'Calendar', icon: Icons.Calendar(), action: () => navigate('calendar') },
  { label: 'Time Tracker', icon: Icons.Clock(), action: () => navigate('time') },
  { label: 'Reports', icon: Icons.Reports(), action: () => navigate('reports') },
  { label: 'AI Chat', icon: Icons.AI(), action: () => { if (aiNeedsOnboarding()) { openAIWizard(1); } else { navigate('ai'); } } },
  { label: 'Library', icon: Icons.Files(), action: () => navigate('library') },
  { label: 'Settings', icon: Icons.Settings(), action: () => navigate('settings') },
  { label: 'New Doc', icon: Icons.Plus(), action: () => { navigate('library'); setTimeout(() => setState({ docModal: true }), 100); } },
  { label: 'Upload File', icon: Icons.Upload(), action: () => navigate('library') },
  { label: 'Recycle Bin', icon: Icons.Trash(), action: () => navigate('trash') },
  { label: 'Toggle AI Panel', icon: Icons.AI(), action: () => { if (aiNeedsOnboarding()) { openAIWizard(1); } else { setState({ aiPanelOpen: !Boolean(_state.aiPanelOpen) }); } } },
  { label: 'New Client', icon: Icons.Plus(), action: () => openRecordModal('clients') },
  { label: 'New Project', icon: Icons.Plus(), action: () => openRecordModal('projects') },
  { label: 'New Task', icon: Icons.Plus(), action: () => openRecordModal('tasks') },
  { label: 'New Person', icon: Icons.Plus(), action: () => openRecordModal('people') },
];

export function getCmdItems(): CommandAction[] {
  const q = _cmdQuery.toLowerCase();
  const sr: CommandAction[] = q.length >= 2 ? globalSearch(q).map(r => ({ label: r.label, icon: r.icon, action: () => navigate(r.store) })) : [];
  return [...CMD_ACTIONS.filter(a => !q || a.label.toLowerCase().includes(q)), ...sr].slice(0, 12);
}
export function renderCommandPalette(open: boolean): string {
  if (!open) return '';
  const items = getCmdItems();
  return `<div class="command-backdrop" id="cmd-backdrop"><div class="command-palette"><div class="command-input-wrap">${Icons.Search(18)}<input class="command-input" id="cmd-input" placeholder="Search or type a command…" value="${escH(_cmdQuery)}" autocomplete="off" spellcheck="false"><span class="kbd">ESC</span></div><div class="command-results">${items.length ? items.map((item, i) => `<button class="command-item ${i === _cmdSel ? 'selected' : ''}" data-cmd="${i}"><span style="opacity:.6">${typeof item.icon === 'string' ? item.icon : ''}</span><span>${escH(item.label)}</span></button>`).join('') : '<p style="padding:1.5rem;text-align:center;color:var(--text-tertiary);font-size:.875rem">No results</p>'}</div></div></div>`;
}
export function bindCommandPalette(): void {
  const input = document.getElementById('cmd-input') as HTMLInputElement | null;
  document.getElementById('cmd-backdrop')?.addEventListener('click', e => { if ((e.target as HTMLElement | null)?.id === 'cmd-backdrop') { setState({ commandOpen: false }); _cmdQuery = ''; _cmdSel = 0; } });
  input?.focus();
  input?.addEventListener('input', e => {
    _cmdQuery = (e.target as HTMLInputElement).value; _cmdSel = 0;
    // Update results in-place - do NOT call setState which re-renders and kills focus
    const results = document.querySelector('.command-results');
    if (results) {
      const items = getCmdItems();
      results.innerHTML = items.length ? items.map((item, i) => `<button class="command-item ${i === _cmdSel ? 'selected' : ''}" data-cmd="${i}"><span style="opacity:.6">${typeof item.icon === 'string' ? item.icon : ''}</span><span>${escH(item.label)}</span></button>`).join('') : '<p style="padding:1.5rem;text-align:center;color:var(--text-tertiary);font-size:.875rem">No results</p>';
      results.querySelectorAll<HTMLElement>('[data-cmd]').forEach(btn => { btn.addEventListener('click', () => { getCmdItems()[parseInt(btn.dataset.cmd || '0')]?.action(); setState({ commandOpen: false }); _cmdQuery = ''; _cmdSel = 0; }); });
    }
  });
  input?.addEventListener('keydown', e => {
    const items = getCmdItems();
    const updateSelected = () => {
      document.querySelectorAll('.command-item').forEach((el, i) => { el.classList.toggle('selected', i === _cmdSel); });
    };
    if (e.key === 'ArrowDown') { e.preventDefault(); _cmdSel = Math.min(_cmdSel + 1, items.length - 1); updateSelected(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); _cmdSel = Math.max(_cmdSel - 1, 0); updateSelected(); }
    if (e.key === 'Enter') { items[_cmdSel]?.action(); setState({ commandOpen: false }); _cmdQuery = ''; _cmdSel = 0; }
    if (e.key === 'Escape') { setState({ commandOpen: false }); _cmdQuery = ''; _cmdSel = 0; }
  });
  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => { getCmdItems()[parseInt(btn.dataset.cmd || '0')]?.action(); setState({ commandOpen: false }); _cmdQuery = ''; _cmdSel = 0; });
  });
}

export function renderNotifPanel(notifications: NotificationItem[], open: boolean): string {
  if (!open) return '';
  const items = notifications.slice(0, 20);
  const unread = notifications.filter(n => !n.read).length;
  return `<div id="notif-panel" style="position:absolute;top:calc(100% + 8px);right:0;width:360px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl);z-index:200;overflow:hidden"><div style="display:flex;align-items:center;justify-content:space-between;padding:.875rem 1rem;border-bottom:1px solid var(--border-subtle)"><span style="font-weight:600;font-size:.9375rem">Notifications</span>${unread ? `<button class="btn btn-ghost btn-sm" id="mark-all-read">Mark all read</button>` : ''}</div><div style="max-height:400px;overflow-y:auto">${items.length ? items.map(n => `<div class="notif-item" data-notif="${escH(String(n.id || ''))}" style="padding:.75rem 1rem;border-bottom:1px solid var(--border-subtle);cursor:pointer;${n.read ? '' : 'background:var(--accent-light)'}"><div style="display:flex;gap:.5rem;align-items:flex-start"><span style="font-size:.7rem;font-weight:600;text-transform:uppercase;color:${n.type === 'error' ? '#dc2626' : n.type === 'warning' ? '#b45309' : 'var(--accent)'}">${n.type ? escH(String(n.type)) : 'info'}</span><span style="font-size:.7rem;color:var(--text-tertiary);margin-left:auto">${formatRelative(n.createdAt)}</span></div><div style="font-size:.875rem;font-weight:500;margin-top:.2rem">${escH(n.title)}</div><div style="font-size:.8rem;color:var(--text-secondary);margin-top:.1rem">${escH(n.body)}</div></div>`).join('') : `<div style="padding:2rem;text-align:center;color:var(--text-tertiary)">${Icons.Bell(32)}<p style="margin-top:.5rem">All caught up!</p></div>`}</div></div>`;
}
