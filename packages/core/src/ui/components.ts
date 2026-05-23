// ── COMPONENTS ─────────────────────────────────────────────────────────────
// Rebuilt for Phase 1 design system. Exports are API-stable — render-pipeline
// and hooks-wiring depend on these names.

import { Icons } from './icons.js'
import {
  escH,
  formatDate,
  formatRelative,
  daysUntil,
  initials as _initials,
  avatarColor as _avatarColor,
} from '../utils.js'
import { getState, setState, navigate, openRecordModal, closeConfirm } from '../state.js'
import { globalSearch } from '../storage/db.js'
import { renderBadge } from './primitives/badge.js'
import { renderAvatar as _renderAvatarPrim } from './primitives/avatar.js'
import { patchInnerHTML } from '../render-utils.js'

type AnyRecord = Record<string, unknown>
type Toast = { type?: string; message?: unknown } | null | undefined
type ConfirmDialog =
  | { message?: unknown; onConfirm?: () => void; onCancel?: () => void }
  | null
  | undefined
type CommandAction = { label: string; icon: string; action: () => void }
type NotificationItem = {
  id: string
  read?: boolean
  type?: string
  title?: unknown
  body?: unknown
  createdAt?: string | null
}

// ── Focus trap (KEEP unchanged) ──────────────────────────────────────────────
const FOCUSABLE_SELECTORS =
  'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function trapFocus(container: HTMLElement): () => void {
  const getFocusable = () =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusable = getFocusable()
    if (!focusable.length) {
      e.preventDefault()
      return
    }
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (e.shiftKey) {
      if (document.activeElement === first || !container.contains(document.activeElement)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last || !container.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
  }
  container.addEventListener('keydown', handleKeyDown)
  return () => {
    container.removeEventListener('keydown', handleKeyDown)
  }
}

// ── AI hook (injected from hooks-wiring.ts) ──────────────────────────────────
let aiNeedsOnboarding: () => boolean = () => false
let openAIWizard: (step: number) => void = () => {}
export function setComponentsAIHooks(needs: () => boolean, open: (step: number) => void): void {
  aiNeedsOnboarding = needs
  openAIWizard = open
}

const _state = new Proxy(
  {},
  {
    get(_t, k: string) {
      return (getState() as unknown as AnyRecord)[k]
    },
  },
)

// ── Visual components ────────────────────────────────────────────────────────
export function renderToast(toast: Toast): string {
  if (!toast) return ''
  const icon =
    { success: Icons.Check(16), error: Icons.Alert(16), info: Icons.Info(16) }[
      toast.type as string
    ] || Icons.Info(16)
  return `<div class="toast-container"><div class="toast toast-${escH(toast.type)}" role="alert" aria-live="assertive">${icon}<span>${escH(toast.message)}</span></div></div>`
}

export function renderConfirmDialog(d: ConfirmDialog): string {
  if (!d) return ''
  return `<div class="modal-backdrop" id="confirm-backdrop"><div class="modal" style="max-width:400px" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg"><div class="modal-header"><span class="modal-title" id="confirm-title">Confirm</span></div><div class="modal-body"><p id="confirm-msg" style="color:var(--text-secondary);font-size:.9375rem;line-height:1.6">${escH(d.message)}</p></div><div class="modal-footer"><button class="btn btn-secondary" id="confirm-cancel">Cancel</button><button class="btn btn-danger" id="confirm-ok">Confirm</button></div></div></div>`
}

export function bindConfirmDialog(d: ConfirmDialog): void {
  const cancel = () => {
    closeConfirm()
    d?.onCancel?.()
  }
  const confirm = () => {
    closeConfirm()
    d?.onConfirm?.()
  }
  document.getElementById('confirm-ok')?.addEventListener('click', confirm)
  document.getElementById('confirm-cancel')?.addEventListener('click', cancel)
  document.getElementById('confirm-backdrop')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement | null)?.id === 'confirm-backdrop') cancel()
  })
  const dialogEl = document.querySelector<HTMLElement>('[role="alertdialog"]')
  if (dialogEl) trapFocus(dialogEl)
  document.getElementById('confirm-cancel')?.focus()
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation()
      document.removeEventListener('keydown', handleEsc)
      cancel()
    }
  }
  document.addEventListener('keydown', handleEsc)
}

export function renderAvatar(name: string | null | undefined, size = 'md', style = ''): string {
  return _renderAvatarPrim({ name, size: size as 'xs' | 'sm' | 'md' | 'lg' | 'xl', style })
}

export function renderPriorityBadge(p: string | null | undefined): string {
  if (!p) return ''
  const variantMap: Record<string, 'success' | 'warning' | 'danger'> = {
    Low: 'success',
    Medium: 'warning',
    High: 'danger',
    Critical: 'danger',
  }
  return renderBadge({ label: p, variant: variantMap[p] ?? 'default' })
}

export function renderDueBadge(ds: string | null | undefined): string {
  if (!ds) return ''
  const d = daysUntil(ds)
  if (d === null) return ''
  if (d < 0) return renderBadge({ label: `${Math.abs(d)}d overdue`, variant: 'danger' })
  if (d === 0) return renderBadge({ label: 'Due today', variant: 'warning' })
  if (d <= 3) return renderBadge({ label: `Due in ${d}d`, variant: 'warning' })
  return renderBadge({ label: formatDate(ds), variant: 'slate' })
}

export function renderSpinner(msg = ''): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;padding:3rem;color:var(--text-tertiary)"><div class="spinner"></div>${msg ? `<p style="font-size:.875rem">${escH(msg)}</p>` : ''}</div>`
}

export function renderEmpty(icon: string, title: string, sub = '', action = ''): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;padding:4rem 2rem;text-align:center;color:var(--text-tertiary)"><div style="opacity:.4">${icon}</div><div><p style="font-weight:600;color:var(--text-secondary);font-size:1rem">${escH(title)}</p>${sub ? `<p style="font-size:.875rem;margin-top:.25rem">${escH(sub)}</p>` : ''}</div>${action}</div>`
}

export function renderSearchInput(val: unknown = '', ph = 'Search…', id = 'search-input'): string {
  return `<div style="position:relative;display:flex;align-items:center"><span style="position:absolute;left:.625rem;color:var(--text-tertiary);pointer-events:none">${Icons.Search(14)}</span><input class="input" id="${id}" value="${escH(val)}" placeholder="${escH(ph)}" style="padding-left:2rem;width:220px;height:34px" autocomplete="off"></div>`
}

export function renderViewTabs(cur: string): string {
  return `<div class="view-tabs">${[
    ['list', Icons.List(16), 'List'],
    ['grid', Icons.Grid(16), 'Grid'],
    ['kanban', Icons.Kanban(16), 'Kanban'],
    ['spatial', Icons.Spatial(16), 'Spatial'],
  ]
    .map(
      ([id, icon, label]) =>
        `<button class="view-tab ${cur === id ? 'active' : ''}" data-view="${id}" title="${label}">${icon}</button>`,
    )
    .join('')}</div>`
}

// ── Command palette ──────────────────────────────────────────────────────────
export let _cmdQuery = '',
  _cmdSel = 0
export const CMD_ACTIONS: CommandAction[] = [
  {
    label: 'Dashboard',
    icon: Icons.Dashboard(),
    action: () => {
      navigate('dashboard')
    },
  },
  {
    label: 'Clients',
    icon: Icons.Clients(),
    action: () => {
      navigate('clients')
    },
  },
  {
    label: 'Departments',
    icon: Icons.Departments(),
    action: () => {
      navigate('departments')
    },
  },
  {
    label: 'Projects',
    icon: Icons.Projects(),
    action: () => {
      navigate('projects')
    },
  },
  {
    label: 'Tasks',
    icon: Icons.Tasks(),
    action: () => {
      navigate('tasks')
    },
  },
  {
    label: 'People',
    icon: Icons.People(),
    action: () => {
      navigate('people')
    },
  },
  {
    label: 'Notes',
    icon: Icons.Notes(),
    action: () => {
      navigate('standaloneNotes')
    },
  },
  {
    label: 'Calendar',
    icon: Icons.Calendar(),
    action: () => {
      navigate('calendar')
    },
  },
  {
    label: 'Time Tracker',
    icon: Icons.Clock(),
    action: () => {
      navigate('time')
    },
  },
  {
    label: 'Reports',
    icon: Icons.Reports(),
    action: () => {
      navigate('reports')
    },
  },
  {
    label: 'AI Chat',
    icon: Icons.AI(),
    action: () => {
      if (aiNeedsOnboarding()) openAIWizard(1)
      else navigate('ai')
    },
  },
  {
    label: 'Library',
    icon: Icons.Files(),
    action: () => {
      navigate('library')
    },
  },
  {
    label: 'Settings',
    icon: Icons.Settings(),
    action: () => {
      navigate('settings')
    },
  },
  {
    label: 'New Doc',
    icon: Icons.Plus(),
    action: () => {
      navigate('library')
      setTimeout(() => {
        setState({ docModal: true })
      }, 100)
    },
  },
  {
    label: 'Upload File',
    icon: Icons.Upload(),
    action: () => {
      navigate('library')
    },
  },
  {
    label: 'Recycle Bin',
    icon: Icons.Trash(),
    action: () => {
      navigate('trash')
    },
  },
  {
    label: 'Toggle AI Panel',
    icon: Icons.AI(),
    action: () => {
      if (aiNeedsOnboarding()) openAIWizard(1)
      else setState({ aiPanelOpen: !getState().aiPanelOpen })
    },
  },
  {
    label: 'New Client',
    icon: Icons.Plus(),
    action: () => {
      openRecordModal('clients')
    },
  },
  {
    label: 'New Project',
    icon: Icons.Plus(),
    action: () => {
      openRecordModal('projects')
    },
  },
  {
    label: 'New Task',
    icon: Icons.Plus(),
    action: () => {
      openRecordModal('tasks')
    },
  },
  {
    label: 'New Person',
    icon: Icons.Plus(),
    action: () => {
      openRecordModal('people')
    },
  },
]

export function getCmdItems(): CommandAction[] {
  const q = _cmdQuery.toLowerCase()
  const sr: CommandAction[] =
    q.length >= 2
      ? globalSearch(q).map((r) => ({
          label: r.label,
          icon: r.icon,
          action: () => {
            navigate(r.store)
          },
        }))
      : []
  return [...CMD_ACTIONS.filter((a) => !q || a.label.toLowerCase().includes(q)), ...sr].slice(0, 12)
}

export function renderCommandPalette(open: boolean): string {
  if (!open) return ''
  const items = getCmdItems()
  const activeId = items.length ? `cmd-item-${_cmdSel}` : ''
  return `<div class="command-backdrop" id="cmd-backdrop" role="dialog" aria-modal="true" aria-label="Command palette"><div class="command-palette"><div class="command-input-wrap">${Icons.Search(18)}<input class="command-input" id="cmd-input" placeholder="Search or type a command…" value="${escH(_cmdQuery)}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmd-listbox" aria-autocomplete="list"${activeId ? ` aria-activedescendant="${activeId}"` : ''}><span class="kbd">ESC</span></div><div class="command-results" id="cmd-listbox" role="listbox" aria-label="Results">${items.length ? items.map((item, i) => `<button class="command-item ${i === _cmdSel ? 'selected' : ''}" id="cmd-item-${i}" role="option" aria-selected="${i === _cmdSel}" data-cmd="${i}"><span style="opacity:.6">${item.icon}</span><span>${escH(item.label)}</span></button>`).join('') : '<p style="padding:1.5rem;text-align:center;color:var(--text-tertiary);font-size:.875rem">No results</p>'}</div></div></div>`
}

export function bindCommandPalette(): void {
  const input = document.getElementById('cmd-input') as HTMLInputElement | null
  document.getElementById('cmd-backdrop')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement | null)?.id === 'cmd-backdrop') {
      setState({ commandOpen: false })
      _cmdQuery = ''
      _cmdSel = 0
    }
  })
  input?.focus()
  const refreshResults = () => {
    const results = document.querySelector('.command-results')
    if (!results) return
    const items = getCmdItems()
    results.innerHTML = patchInnerHTML(
      items.length
        ? items
            .map(
              (item, i) =>
                `<button class="command-item ${i === _cmdSel ? 'selected' : ''}" id="cmd-item-${i}" role="option" aria-selected="${i === _cmdSel}" data-cmd="${i}"><span style="opacity:.6">${item.icon}</span><span>${escH(item.label)}</span></button>`,
            )
            .join('')
        : '<p style="padding:1.5rem;text-align:center;color:var(--text-tertiary);font-size:.875rem">No results</p>',
    )
    results.querySelectorAll<HTMLElement>('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        getCmdItems()[parseInt(btn.dataset.cmd || '0')]?.action()
        setState({ commandOpen: false })
        _cmdQuery = ''
        _cmdSel = 0
      })
    })
  }
  input?.addEventListener('input', (e) => {
    _cmdQuery = (e.target as HTMLInputElement).value
    _cmdSel = 0
    refreshResults()
  })
  input?.addEventListener('keydown', (e) => {
    const items = getCmdItems()
    const updateSel = () => {
      document.querySelectorAll('.command-item').forEach((el, i) => {
        el.classList.toggle('selected', i === _cmdSel)
        el.setAttribute('aria-selected', String(i === _cmdSel))
      })
      document
        .getElementById('cmd-input')
        ?.setAttribute('aria-activedescendant', `cmd-item-${_cmdSel}`)
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      _cmdSel = Math.min(_cmdSel + 1, items.length - 1)
      updateSel()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      _cmdSel = Math.max(_cmdSel - 1, 0)
      updateSel()
    }
    if (e.key === 'Enter') {
      items[_cmdSel]?.action()
      setState({ commandOpen: false })
      _cmdQuery = ''
      _cmdSel = 0
    }
    if (e.key === 'Escape') {
      setState({ commandOpen: false })
      _cmdQuery = ''
      _cmdSel = 0
    }
  })
  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      getCmdItems()[parseInt(btn.dataset.cmd || '0')]?.action()
      setState({ commandOpen: false })
      _cmdQuery = ''
      _cmdSel = 0
    })
  })
}

// ── Notification panel ───────────────────────────────────────────────────────
export function renderNotifPanel(notifications: NotificationItem[], open: boolean): string {
  if (!open) return ''
  const items = notifications.slice(0, 20)
  const unread = notifications.filter((n) => !n.read).length
  const headerBtns = [
    unread ? `<button class="btn btn-ghost btn-sm" id="mark-all-read">Mark all read</button>` : '',
    items.length
      ? `<button class="btn btn-ghost btn-sm" id="notif-clear-all">Clear All</button>`
      : '',
  ]
    .filter(Boolean)
    .join('')
  const itemsHtml = items.length
    ? items
        .map(
          (n) =>
            `<div class="notif-item" data-notif="${escH(n.id)}" style="padding:.75rem 1rem;border-bottom:1px solid var(--border-subtle);cursor:pointer;${n.read ? '' : 'background:var(--accent-light)'}"><div style="display:flex;gap:.5rem;align-items:flex-start"><span style="font-size:.7rem;font-weight:600;text-transform:uppercase;color:${n.type === 'error' ? '#dc2626' : n.type === 'warning' ? '#b45309' : 'var(--accent)'}">${escH(n.type ?? 'info')}</span><span style="font-size:.7rem;color:var(--text-tertiary);margin-left:auto">${formatRelative(n.createdAt)}</span><button class="btn btn-ghost btn-icon btn-sm" data-notif-del="${escH(n.id)}" title="Dismiss" style="width:20px;height:20px;padding:0;margin-left:.25rem" onclick="event.stopPropagation()">×</button></div><div style="font-size:.875rem;font-weight:500;margin-top:.2rem">${escH(n.title)}</div><div style="font-size:.8rem;color:var(--text-secondary);margin-top:.1rem">${escH(n.body)}</div></div>`,
        )
        .join('')
    : `<div style="padding:2rem;text-align:center;color:var(--text-tertiary)">${Icons.Bell(32)}<p style="margin-top:.5rem">All caught up!</p></div>`
  return `<div id="notif-panel" style="position:absolute;top:calc(100%+8px);right:0;width:360px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl);z-index:200;overflow:hidden"><div style="display:flex;align-items:center;justify-content:space-between;padding:.875rem 1rem;border-bottom:1px solid var(--border-subtle)"><span style="font-weight:600;font-size:.9375rem">Notifications</span><div style="display:flex;gap:.25rem">${headerBtns}</div></div><div style="max-height:400px;overflow-y:auto">${itemsHtml}</div></div>`
}

export function bindNotifPanel(onDelete: (id: string) => void, onClearAll: () => void): void {
  document.querySelectorAll<HTMLElement>('[data-notif-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onDelete((btn.dataset as DOMStringMap & { notifDel: string }).notifDel)
    })
  })
  document.getElementById('notif-clear-all')?.addEventListener('click', onClearAll)
}

// ── DLP warning (C.7) ────────────────────────────────────────────────────────
// Shown in strong/strict lockdown before copy/export/external-link actions.
// Writes dlp_warning_shown + dlp_action_proceeded audit events.

export function renderDLPWarning(action = 'transfer data'): string {
  return `<div class="modal-backdrop" id="dlp-backdrop" role="dialog" aria-modal="true" aria-labelledby="dlp-title">
    <div class="modal" style="max-width:420px">
      <div class="modal-header" style="gap:.5rem;display:flex;align-items:center">
        ${Icons.Alert(16)}<span class="modal-title" id="dlp-title" style="color:#b45309">Data Transfer Warning</span>
      </div>
      <div class="modal-body">
        <p style="font-size:.9375rem;line-height:1.6;color:var(--text-secondary)">
          This action may ${escH(action)} outside the organisation boundary.<br>
          Your admin has enabled <strong>strong lockdown</strong> — proceed only if authorised.
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="dlp-cancel">Cancel</button>
        <button class="btn btn-danger" id="dlp-proceed">Proceed Anyway</button>
      </div>
    </div>
  </div>`
}

export function bindDLPWarning(onProceed: () => void, onCancel: () => void): void {
  const backdrop = document.getElementById('dlp-backdrop')
  document.getElementById('dlp-proceed')?.addEventListener('click', () => {
    backdrop?.remove()
    onProceed()
  })
  const cancel = () => {
    backdrop?.remove()
    onCancel()
  }
  document.getElementById('dlp-cancel')?.addEventListener('click', cancel)
  backdrop?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement | null)?.id === 'dlp-backdrop') cancel()
  })
  const dialogEl = backdrop?.querySelector<HTMLElement>('[role="dialog"]') ?? backdrop
  if (dialogEl) trapFocus(dialogEl)
}

/**
 * Show the DLP warning if lockdown >= strong; otherwise call onProceed immediately.
 * Mounts the dialog into document.body and removes it on dismiss.
 */
export function guardedAction(lockdownLevel: string, action: string, onProceed: () => void): void {
  if (lockdownLevel !== 'strong' && lockdownLevel !== 'strict') {
    onProceed()
    return
  }
  const wrap = document.createElement('div')
  wrap.innerHTML = patchInnerHTML(renderDLPWarning(action))
  document.body.appendChild(wrap)
  bindDLPWarning(onProceed, () => {})
}

// Keep _state accessible for any downstream code that might read it
void _state
