// ── CALENDAR ──────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 4378–4408.

import { escH } from '../utils.js'
import { Icons } from '../ui/icons.js'
import { renderEmpty } from '../ui/components.js'
import type { AppState } from '../state.js'

let _calDate = new Date()
let _calView = 'month'

// forward-declared by main.ts
let _appRenderWorkspace: (view: string) => void = () => {}
export function setCalendarHooks(appRenderWorkspace: (view: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace
}

export function renderCalendar(state: AppState): string {
  const { tasks, projects } = state
  type CalEvent = { date: string; label: string; color: string }
  const events: CalEvent[] = [
    ...(tasks as Record<string, unknown>[])
      .filter((t) => t.dueDate)
      .map((t) => ({
        date: String(t.dueDate),
        label: String(t.title || 'Task'),
        color: '#6366f1',
      })),
    ...(projects as Record<string, unknown>[])
      .filter((p) => p.dueDate)
      .map((p) => ({
        date: String(p.dueDate),
        label: String(p.name || 'Project'),
        color: '#10b981',
      })),
  ]
  const viewBtns = ['month', 'week', 'day', 'agenda']
    .map(
      (v) =>
        `<button class="btn btn-sm ${_calView === v ? 'btn-primary' : 'btn-secondary'}" data-calview="${v}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`,
    )
    .join('')
  let body = ''
  if (_calView === 'month') {
    const yr = _calDate.getFullYear(),
      mo = _calDate.getMonth()
    const first = new Date(yr, mo, 1)
    const last = new Date(yr, mo + 1, 0)
    const sd = first.getDay()
    const today = new Date().toDateString()
    let cells = ''
    for (let i = 0; i < sd; i++) {
      const d = new Date(yr, mo, -sd + i + 1)
      cells += `<div class="cal-day other-month"><div class="cal-day-num">${d.getDate()}</div></div>`
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(yr, mo, d)
      const ds = date.toISOString().split('T')[0]
      const isT = date.toDateString() === today
      const de = events.filter((e) => e.date === ds)
      cells += `<div class="cal-day${isT ? ' today' : ''}"><div class="cal-day-num">${d}</div>${de
        .slice(0, 3)
        .map(
          (e) =>
            `<div class="cal-event" style="background:${e.color}22;color:${e.color};border-left:2px solid ${e.color}">${escH(e.label)}</div>`,
        )
        .join(
          '',
        )}${de.length > 3 ? `<div style="font-size:.6rem;color:var(--text-tertiary)">+${de.length - 3}</div>` : ''}</div>`
    }
    const rem = (7 - ((sd + last.getDate()) % 7)) % 7
    for (let i = 1; i <= rem; i++)
      cells += `<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`
    body = `<div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-day-header">${d}</div>`).join('')}${cells}</div>`
  } else if (_calView === 'week') {
    const sow = new Date(_calDate)
    sow.setDate(_calDate.getDate() - _calDate.getDay())
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sow)
      d.setDate(sow.getDate() + i)
      return d
    })
    body = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden">${days
      .map((d) => {
        const ds = d.toISOString().split('T')[0]
        const isT = d.toDateString() === new Date().toDateString()
        const de = events.filter((e) => e.date === ds)
        return `<div style="background:${isT ? 'var(--accent-light)' : 'var(--bg-surface)'};padding:.625rem;min-height:120px"><div style="font-size:.75rem;font-weight:600;margin-bottom:.375rem;color:${isT ? 'var(--accent)' : 'var(--text-secondary)'}">${d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</div>${de.map((e) => `<div class="cal-event" style="background:${e.color}22;color:${e.color};border-left:2px solid ${e.color}">${escH(e.label)}</div>`).join('')}</div>`
      })
      .join('')}</div>`
  } else if (_calView === 'day') {
    const ds = _calDate.toISOString().split('T')[0]
    const de = events.filter((e) => e.date === ds)
    body = `<div><h2 style="font-size:1.25rem;font-weight:600;margin-bottom:1rem">${_calDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>${de.length ? de.map((e) => `<div style="padding:.875rem;border-radius:var(--radius-lg);background:${e.color}18;border-left:3px solid ${e.color};margin-bottom:.625rem"><div style="font-weight:600">${escH(e.label)}</div></div>`).join('') : renderEmpty(Icons.Calendar(40), 'Nothing scheduled')}</div>`
  } else {
    const sorted = [...events]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .filter((e) => new Date(e.date) >= new Date(new Date().toDateString()))
    body = sorted.length
      ? `<div>${sorted
          .slice(0, 30)
          .map(
            (e) =>
              `<div style="display:flex;gap:1rem;align-items:flex-start;padding:.75rem;border-radius:var(--radius-lg);background:var(--bg-surface);border:1px solid var(--border-subtle);margin-bottom:.5rem"><div style="text-align:center;min-width:48px"><div style="font-size:.65rem;font-weight:600;text-transform:uppercase;color:var(--text-tertiary)">${new Date(e.date).toLocaleDateString('en-US', { month: 'short' })}</div><div style="font-size:1.5rem;font-weight:700;line-height:1;color:${e.color}">${new Date(e.date).getDate()}</div></div><div><div style="font-weight:500">${escH(e.label)}</div></div></div>`,
          )
          .join('')}</div>`
      : renderEmpty(Icons.Calendar(40), 'No upcoming events')
  }
  return `<div style="display:flex;flex-direction:column;height:100%"><div class="workspace-toolbar" style="justify-content:space-between"><div style="display:flex;align-items:center;gap:.75rem"><button class="btn btn-secondary btn-icon" id="cal-prev">${Icons.ChevronLeft()}</button><span style="font-weight:600;font-size:1rem;min-width:180px;text-align:center">${_calDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span><button class="btn btn-secondary btn-icon" id="cal-next">${Icons.ChevronRight()}</button><button class="btn btn-secondary btn-sm" id="cal-today">Today</button></div><div style="display:flex;gap:.375rem">${viewBtns}</div></div><div style="flex:1;overflow:auto;padding:1rem">${body}</div></div>`
}

export function bindCalendar(): void {
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    if (_calView === 'month') _calDate.setMonth(_calDate.getMonth() - 1)
    else if (_calView === 'week') _calDate.setDate(_calDate.getDate() - 7)
    else _calDate.setDate(_calDate.getDate() - 1)
    _appRenderWorkspace('calendar')
  })
  document.getElementById('cal-next')?.addEventListener('click', () => {
    if (_calView === 'month') _calDate.setMonth(_calDate.getMonth() + 1)
    else if (_calView === 'week') _calDate.setDate(_calDate.getDate() + 7)
    else _calDate.setDate(_calDate.getDate() + 1)
    _appRenderWorkspace('calendar')
  })
  document.getElementById('cal-today')?.addEventListener('click', () => {
    _calDate = new Date()
    _appRenderWorkspace('calendar')
  })
  document.querySelectorAll<HTMLElement>('[data-calview]').forEach((b) => {
    b.addEventListener('click', () => {
      _calView = (b.dataset as DOMStringMap & { calview: string }).calview
      _appRenderWorkspace('calendar')
    })
  })
}
