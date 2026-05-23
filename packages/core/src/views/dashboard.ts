// ── DASHBOARD ─────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 4287–4375.

import {
  escH,
  formatRelative,
  daysUntil,
  initials,
  avatarColor,
  plural,
  formatDuration as _formatDuration,
} from '../utils.js'
import { Icons } from '../ui/icons.js'
import { openRecordModal, setState, showToast as _showToast } from '../state.js'
import type { AppState } from '../state.js'

type AnyRecord = Record<string, unknown>

const DASH_DEFAULTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  overview: { x: 24, y: 24, w: 480, h: 580 },
  attention: { x: 528, y: 24, w: 380, h: 280 },
  activity: { x: 928, y: 24, w: 380, h: 560 },
  team: { x: 24, y: 620, w: 480, h: 280 },
  clients: { x: 928, y: 600, w: 380, h: 300 },
  actions: { x: 528, y: 320, w: 380, h: 580 },
  timer: { x: 528, y: 920, w: 380, h: 200 },
}

let _dashLayouts: Record<string, { x: number; y: number; w: number; h: number }> | null = null
let _dashEdit = false
let _dashZ = 20
const _dashZMap: Record<string, number> = {}

// AI hooks injected by main.ts
let _aiNeedsOnboarding: () => boolean = () => false
let _openAIWizard: (step: number) => void = () => {}
export function setDashAIHooks(needs: () => boolean, open: (step: number) => void): void {
  _aiNeedsOnboarding = needs
  _openAIWizard = open
}

// forward-declared by main.ts
let _appRenderWorkspace: (view: string) => void = () => {}
export function setDashHooks(appRenderWorkspace: (view: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace
}

function getDashLayouts(): typeof _dashLayouts & object {
  if (!_dashLayouts) {
    try {
      const r = localStorage.getItem('taskapp_dash_v1')
      _dashLayouts = r ? (JSON.parse(r) as typeof _dashLayouts) : { ...DASH_DEFAULTS }
    } catch {
      _dashLayouts = { ...DASH_DEFAULTS }
    }
  }
  return _dashLayouts!
}
function saveDashLayouts(): void {
  localStorage.setItem('taskapp_dash_v1', JSON.stringify(_dashLayouts))
}

export function renderDashboard(state: AppState): string {
  const { projects, tasks, clients, people, communications, runningTimer, timerElapsed } = state
  const pArr = projects as AnyRecord[],
    tArr = tasks as AnyRecord[],
    cArr = clients as AnyRecord[],
    pPArr = people as AnyRecord[],
    commArr = communications as AnyRecord[]
  const ap = pArr.filter((p) => !['Done', 'Cancelled'].includes(String(p.stage || '')))
  const ot = tArr.filter((t) => t.status !== 'Done' && !t.done)
  const od = ot.filter((t) => {
    const d = daysUntil(String(t.dueDate || ''))
    return d !== null && d < 0
  })
  const L = getDashLayouts()

  const cards = [
    {
      id: 'overview',
      title: 'Portfolio',
      body: () => {
        const sc: Record<string, number> = {}
        ap.forEach((p) => {
          sc[String(p.stage || '?')] = (sc[String(p.stage || '?')] || 0) + 1
        })
        return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem">${[
          ['Active Projects', ap.length],
          ['Open Tasks', ot.length],
          ['Overdue', od.length],
          ['Clients', cArr.length],
        ]
          .map(
            ([l, v], i) =>
              `<div class="metric-tile"${i === 2 && od.length ? ` style="border-color:#fecaca"` : ''}><div class="metric-value"${i === 2 && od.length ? ` style="color:#dc2626"` : ''}>${v}</div><div class="metric-label">${l}</div></div>`,
          )
          .join('')}</div><div>${Object.entries(sc)
          .map(
            ([s, c]) =>
              `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem"><div style="font-size:.8rem;color:var(--text-secondary);width:80px">${s}</div><div style="flex:1;height:6px;background:var(--bg-base);border-radius:999px;overflow:hidden"><div style="height:100%;background:var(--accent);border-radius:999px;width:${Math.round((c / Math.max(ap.length, 1)) * 100)}%"></div></div><div style="font-size:.8rem;font-weight:600;width:24px;text-align:right">${c}</div></div>`,
          )
          .join('')}</div>`
      },
    },
    {
      id: 'attention',
      title: 'Due Soon',
      body: () => {
        const items = (
          ot
            .filter((t) => t.dueDate)
            .map((t) => ({ ...t, d: daysUntil(String(t.dueDate || '')) })) as (AnyRecord & {
            d: number | null
          })[]
        )
          .filter((t) => t.d !== null && t.d <= 7)
          .sort((a, b) => (a.d as number) - (b.d as number))
          .slice(0, 8)
        return items.length
          ? items
              .map((t) => {
                const col = (t.d as number) < 0 ? '#dc2626' : t.d === 0 ? '#b45309' : '#4338ca'
                return `<div style="display:flex;align-items:center;gap:.625rem;padding:.5rem;border-radius:var(--radius-md);background:var(--bg-base);margin-bottom:.375rem;cursor:pointer" data-open-task="${t.id}"><div style="width:6px;height:6px;border-radius:50%;background:${col};flex-shrink:0"></div><div style="flex:1;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(t.title || ''))}</div><div style="font-size:.7rem;color:${col};font-weight:600">${(t.d as number) < 0 ? `${Math.abs(t.d as number)}d late` : t.d === 0 ? 'Today' : `${t.d}d`}</div></div>`
              })
              .join('')
          : `<p style="font-size:.8rem;color:var(--text-tertiary);text-align:center;padding:1rem">🎉 Nothing due soon!</p>`
      },
    },
    {
      id: 'activity',
      title: 'Recent Activity',
      body: () => {
        const commItems = commArr
          .slice()
          .sort(
            (a, b) =>
              new Date(String(b.occurredAt || b.createdAt || '')).getTime() -
              new Date(String(a.occurredAt || a.createdAt || '')).getTime(),
          )
          .slice(0, 5)
          .map((c) => ({
            label: String(c.subject || ''),
            type: String(c.type || 'Note'),
            ts: String(c.occurredAt || c.createdAt || ''),
          }))
        const noteItems = pArr
          .flatMap((p) =>
            ((p.notes as AnyRecord[] | undefined) || []).map((n) => ({
              label: String(p.name || ''),
              type: 'Note',
              ts: String(n.date || ''),
            })),
          )
          .filter((i) => i.ts)
        const items = [...commItems, ...noteItems]
          .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
          .slice(0, 10)
        return items.length
          ? items
              .map(
                (i) =>
                  `<div style="padding:.5rem;border-radius:var(--radius-md);background:var(--bg-base);margin-bottom:.375rem"><div style="display:flex;justify-content:space-between;margin-bottom:.2rem"><span style="font-size:.7rem;font-weight:600;text-transform:uppercase;color:var(--accent)">${escH(i.type)}</span><span style="font-size:.7rem;color:var(--text-tertiary)">${formatRelative(i.ts)}</span></div><div style="font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(i.label)}</div></div>`,
              )
              .join('')
          : `<p style="font-size:.8rem;color:var(--text-tertiary);text-align:center;padding:1rem">No recent activity</p>`
      },
    },
    {
      id: 'team',
      title: 'Team Load',
      body: () => {
        return (
          pPArr
            .slice(0, 6)
            .map((p) => {
              const open =
                ot.filter((t) => t.assigneeId === p.id).length +
                ap.filter((pr) => pr.ownerId === p.id).length
              const [bg, fg] = avatarColor(String(p.name || ''))
              return `<div style="display:flex;align-items:center;gap:.625rem;margin-bottom:.5rem"><div class="avatar avatar-sm" style="background:${bg};color:${fg}">${initials(String(p.name || ''))}</div><div style="flex:1;min-width:0"><div style="font-size:.8rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(p.name || ''))}</div><div style="height:4px;background:var(--bg-base);border-radius:999px;margin-top:3px;overflow:hidden"><div style="height:100%;background:${open > 8 ? '#ef4444' : open > 5 ? '#f59e0b' : '#6366f1'};border-radius:999px;width:${Math.min(open * 10, 100)}%"></div></div></div><span style="font-size:.75rem;color:var(--text-tertiary);width:28px;text-align:right">${open}</span></div>`
            })
            .join('') ||
          `<p style="font-size:.8rem;color:var(--text-tertiary)">No team members yet</p>`
        )
      },
    },
    {
      id: 'clients',
      title: 'Clients',
      body: () => {
        return (
          cArr
            .slice(0, 6)
            .map((c) => {
              const cp = ap.filter((p) => p.clientId === c.id).length
              const [bg, fg] = avatarColor(String(c.name || ''))
              return `<div style="display:flex;align-items:center;gap:.625rem;padding:.375rem 0;border-bottom:1px solid var(--border-subtle)"><div class="avatar avatar-sm" style="background:${bg};color:${fg}">${initials(String(c.name || ''))}</div><div style="flex:1;min-width:0"><div style="font-size:.8rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(c.name || ''))}</div><div style="font-size:.7rem;color:var(--text-tertiary)">${escH(String(c.contactName || 'No contact'))}</div></div><span style="font-size:.75rem;font-weight:600;color:${cp ? 'var(--accent)' : 'var(--text-tertiary)'}">${plural(cp, 'project')}</span></div>`
            })
            .join('') || `<p style="font-size:.8rem;color:var(--text-tertiary)">No clients yet</p>`
        )
      },
    },
    {
      id: 'actions',
      title: 'Quick Actions',
      body: () => {
        const icons: Record<string, string> = {
          clients: '🏢',
          projects: '📁',
          tasks: '✅',
          people: '👤',
          departments: '🏛️',
          ai: '🤖',
        }
        return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:.625rem">${(
          [
            ['New Client', 'clients'],
            ['New Project', 'projects'],
            ['New Task', 'tasks'],
            ['New Person', 'people'],
            ['New Dept', 'departments'],
            ['AI Chat', 'ai'],
          ] as [string, string][]
        )
          .map(
            ([l, a]) =>
              `<button class="btn btn-secondary" style="flex-direction:column;gap:.375rem;padding:1rem;height:auto;text-align:center" data-quick="${a}"><span style="font-size:1.25rem">${icons[a] ?? ''}</span><span style="font-size:.8rem">${l}</span></button>`,
          )
          .join('')}</div>`
      },
    },
    {
      id: 'timer',
      title: 'Timer',
      body: () => {
        const running = runningTimer as AnyRecord | null
        if (running) {
          const task = tArr.find((t) => t.id === running.taskId)
          const elapsed = timerElapsed || 0
          const h = Math.floor(elapsed / 3600)
          const m = Math.floor((elapsed % 3600) / 60)
          const s = elapsed % 60
          const dur =
            h > 0
              ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
              : `${m}:${String(s).padStart(2, '0')}`
          return `<div style="text-align:center;padding:.5rem 0"><div class="timer-display" style="font-size:1.5rem;margin-bottom:.375rem">${dur}</div><div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(task?.title || running.description || 'Timer running'))}</div><button class="btn btn-secondary btn-sm" data-nav="time">Open Time Tracker</button></div>`
        }
        return `<div style="text-align:center;padding:1rem;color:var(--text-tertiary)"><div style="font-size:.8rem;margin-bottom:.5rem">No timer running</div><button class="btn btn-secondary btn-sm" data-nav="time">${Icons.Clock(14)} Start Timer</button></div>`
      },
    },
  ]

  const desktopCards = cards
    .map((c) => {
      const l = (L[c.id] || DASH_DEFAULTS[c.id])!
      return `<div class="dash-card" data-card="${c.id}" style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;z-index:${_dashZMap[c.id] || 10}"><div class="dash-card-header" style="${_dashEdit ? 'cursor:grab' : 'cursor:default'}"><span class="dash-card-title">${c.title}</span>${_dashEdit ? `<span style="color:var(--text-tertiary);font-size:.7rem">drag</span>` : ''}</div><div class="dash-card-body">${c.body()}</div>${_dashEdit ? `<div style="position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:se-resize" class="dash-resize" data-card="${c.id}"></div>` : ''}</div>`
    })
    .join('')
  const mobileCards = cards
    .map(
      (c) =>
        `<div class="card" style="margin-bottom:1rem"><div class="card-header"><span class="card-title">${c.title}</span></div><div class="card-body">${c.body()}</div></div>`,
    )
    .join('')

  return `<div style="display:flex;flex-direction:column;height:100%;overflow:hidden"><div style="padding:.625rem 1.25rem;background:var(--bg-surface);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:.75rem;flex-shrink:0"><span style="font-size:.8rem;color:var(--text-secondary)">Dashboard</span><span style="margin-left:auto;display:flex;gap:.5rem">${_dashEdit ? `<button class="btn btn-secondary btn-sm" id="dash-reset">Reset</button><button class="btn btn-secondary btn-sm" id="dash-cancel">Cancel</button><button class="btn btn-primary btn-sm" id="dash-save">${Icons.Save(14)} Save</button>` : `<button class="btn btn-secondary btn-sm" id="dash-edit">${Icons.Edit(14)} Edit</button>`}</span></div><div id="dash-canvas-scroll" style="flex:1;overflow:auto;position:relative;display:none"><div id="dash-canvas" class="canvas-grid" style="position:relative;width:4000px;height:2000px">${desktopCards}</div></div><div id="dash-mobile" style="flex:1;overflow-y:auto;padding:1rem">${mobileCards}</div></div>`
}

export function bindDashboard(_state: AppState): void {
  const cw = document.getElementById('dash-canvas-scroll'),
    mob = document.getElementById('dash-mobile')
  if (window.innerWidth >= 768) {
    if (cw) cw.style.display = 'block'
    if (mob) mob.style.display = 'none'
  }
  document.getElementById('dash-edit')?.addEventListener('click', () => {
    _dashEdit = true
    _appRenderWorkspace('dashboard')
  })
  document.getElementById('dash-cancel')?.addEventListener('click', () => {
    _dashEdit = false
    _dashLayouts = JSON.parse(JSON.stringify(getDashLayouts())) as typeof _dashLayouts
    _appRenderWorkspace('dashboard')
  })
  document.getElementById('dash-save')?.addEventListener('click', () => {
    _dashEdit = false
    saveDashLayouts()
    _appRenderWorkspace('dashboard')
  })
  document.getElementById('dash-reset')?.addEventListener('click', () => {
    _dashLayouts = { ...DASH_DEFAULTS }
    _appRenderWorkspace('dashboard')
  })
  document.querySelectorAll<HTMLElement>('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = (btn.dataset as DOMStringMap & { quick: string }).quick
      if (a === 'ai') {
        if (_aiNeedsOnboarding()) _openAIWizard(1)
        else setState({ aiPanelOpen: true })
      } else openRecordModal(a)
    })
  })
  document.querySelectorAll<HTMLElement>('[data-open-task]').forEach((el) => {
    el.addEventListener('click', () => {
      openRecordModal('tasks', (el.dataset as DOMStringMap & { openTask: string }).openTask)
    })
  })
  if (_dashEdit) bindDashDrag()
}

function bindDashDrag(): void {
  const L = getDashLayouts()
  document.querySelectorAll<HTMLElement>('.dash-card').forEach((card) => {
    const id = (card.dataset as DOMStringMap & { card: string }).card
    const header = card.querySelector<HTMLElement>('.dash-card-header')
    card.addEventListener('mousedown', () => {
      _dashZ++
      _dashZMap[id] = _dashZ
      card.style.zIndex = String(_dashZ)
    })
    if (header) {
      header.addEventListener('mousedown', (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('.dash-resize')) return
        const sx = e.clientX,
          sy = e.clientY,
          ol = card.offsetLeft,
          ot2 = card.offsetTop
        const om = (e2: MouseEvent) => {
          const nx = ol + (e2.clientX - sx),
            ny = ot2 + (e2.clientY - sy)
          card.style.left = Math.max(0, nx) + 'px'
          card.style.top = Math.max(0, ny) + 'px'
          if (!L[id]) L[id] = { ...DASH_DEFAULTS[id] } as (typeof DASH_DEFAULTS)[string]
          L[id].x = Math.max(0, nx)
          L[id].y = Math.max(0, ny)
        }
        const ou = () => {
          document.removeEventListener('mousemove', om)
          document.removeEventListener('mouseup', ou)
        }
        document.addEventListener('mousemove', om)
        document.addEventListener('mouseup', ou)
        e.preventDefault()
      })
    }
    const resizer = card.querySelector<HTMLElement>('.dash-resize')
    if (resizer) {
      resizer.addEventListener('mousedown', (e: MouseEvent) => {
        const sx = e.clientX,
          sy = e.clientY,
          ow = card.offsetWidth,
          oh = card.offsetHeight
        const om = (e2: MouseEvent) => {
          const nw = Math.max(250, ow + (e2.clientX - sx)),
            nh = Math.max(150, oh + (e2.clientY - sy))
          card.style.width = nw + 'px'
          card.style.height = nh + 'px'
          if (!L[id]) L[id] = { ...DASH_DEFAULTS[id] } as (typeof DASH_DEFAULTS)[string]
          L[id].w = nw
          L[id].h = nh
        }
        const ou = () => {
          document.removeEventListener('mousemove', om)
          document.removeEventListener('mouseup', ou)
        }
        document.addEventListener('mousemove', om)
        document.addEventListener('mouseup', ou)
        e.preventDefault()
      })
    }
  })
}
