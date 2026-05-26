// ── TIME TRACKER ──────────────────────────────────────────────────────────────

import { escH, formatDuration, formatRelative, formatDate as _formatDate } from '../utils.js'
import { Icons } from '../ui/icons.js'
import { renderEmpty } from '../ui/components.js'
import {
  startTimer,
  stopTimer,
  getRunningTimer,
  dbCreate,
  dbUpdate,
  dbDelete,
  nowISO as _nowISO,
} from '../storage/db.js'
import { reloadData, showConfirm, showToast } from '../state.js'
import type { AppState } from '../state.js'

type AnyRecord = Record<string, unknown>

// Active manual-entry / edit modal state
let _editingEntryId: string | null = null
let _showManualForm = false

export function renderTimeTracker(state: AppState): string {
  const { tasks, timeEntries, runningTimer, timerElapsed } = state
  const tArr = tasks as AnyRecord[]
  const entries = [...(timeEntries as AnyRecord[])].sort(
    (a, b) =>
      new Date(String(b.startedAt || '')).getTime() - new Date(String(a.startedAt || '')).getTime(),
  )
  const total = entries
    .filter((e) => !e.running)
    .reduce((s, e) => s + (Number(e.duration) || Number(e.durationSeconds) || 0), 0)
  const todaySec = entries
    .filter(
      (e) =>
        !e.running &&
        e.startedAt &&
        new Date(String(e.startedAt)).toDateString() === new Date().toDateString(),
    )
    .reduce((s, e) => s + (Number(e.duration) || Number(e.durationSeconds) || 0), 0)
  const running = runningTimer as AnyRecord | null
  const elapsed = running ? timerElapsed : 0

  // Find editing entry data
  const editEntry = _editingEntryId ? (entries.find((e) => e.id === _editingEntryId) ?? null) : null

  const manualFormHtml =
    _showManualForm || _editingEntryId ? renderManualEntryForm(tArr, editEntry) : ''

  const entryRows =
    entries
      .slice(0, 50)
      .map((e) => {
        const task = tArr.find((t) => t.id === e.taskId)
        const dur = e.running
          ? formatDuration(elapsed)
          : formatDuration(Number(e.duration) || Number(e.durationSeconds) || 0)
        const isRunning = !!e.running
        const actions = isRunning
          ? `<span class="badge badge-green" style="font-size:.7rem">Running</span>`
          : `<button class="btn btn-ghost btn-icon btn-sm" data-te-edit="${escH(String(e.id))}" title="Edit">${Icons.Edit(12)}</button>
           <button class="btn btn-ghost btn-icon btn-sm" style="color:var(--priority-high)" data-te-del="${escH(String(e.id))}" title="Delete">${Icons.Delete(12)}</button>`
        return `<div style="display:flex;align-items:center;gap:.75rem;padding:.625rem;border-radius:var(--radius-md);background:var(--bg-surface);border:1px solid var(--border-subtle);margin-bottom:.375rem">
        <div style="width:8px;height:8px;border-radius:50%;background:${isRunning ? '#10b981' : 'var(--border-default)'};flex-shrink:0${isRunning ? ';animation:pulse 2s infinite' : ''}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.875rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(task?.title || e.description || 'Session'))}</div>
          <div style="font-size:.75rem;color:var(--text-tertiary)">${formatRelative(String(e.startedAt || ''))}</div>
        </div>
        <div class="timer-display" style="font-size:1rem">${dur}</div>
        <div style="display:flex;gap:.25rem">${actions}</div>
      </div>`
      })
      .join('') || renderEmpty(Icons.Clock(40), 'No entries yet')

  return `<div style="display:flex;flex-direction:column;height:100%">
    <div class="workspace-toolbar">
      <span style="font-weight:600">Time Tracker</span>
      <div style="flex:1"></div>
      <button class="btn btn-secondary btn-sm" id="add-time-entry-btn">${Icons.Plus(14)} Add Time Entry</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:1.5rem">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.5rem;max-width:480px">
        <div class="metric-tile"><div class="metric-value">${formatDuration(todaySec)}</div><div class="metric-label">Today</div></div>
        <div class="metric-tile"><div class="metric-value">${formatDuration(total)}</div><div class="metric-label">All Time</div></div>
      </div>
      <div class="card" style="padding:1.5rem;max-width:480px;margin-bottom:1.5rem">
        <div class="timer-display" style="margin-bottom:1rem;text-align:center">${formatDuration(elapsed)}</div>
        ${
          running
            ? `<div style="text-align:center;margin-bottom:.75rem;font-size:.875rem;color:var(--text-secondary)">${escH(String(tArr.find((t) => t.id === running.taskId)?.title || 'No task selected'))}</div><button class="btn btn-danger" id="stop-timer" style="width:100%">${Icons.Stop(16)} Stop</button>`
            : `<div style="display:flex;flex-direction:column;gap:.75rem">
              <select class="select" id="timer-task"><option value="">— Select task —</option>${tArr.map((t) => `<option value="${t.id}">${escH(String(t.title || 'Untitled'))}</option>`).join('')}</select>
              <input class="input" id="timer-desc" placeholder="What are you working on?">
              <button class="btn btn-primary" id="start-timer" style="width:100%">${Icons.Play(16)} Start Timer</button>
            </div>`
        }
      </div>
      ${manualFormHtml}
      <div style="margin-bottom:.5rem;font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary)">Log</div>
      ${entryRows}
    </div>
  </div>`
}

function renderManualEntryForm(tasks: AnyRecord[], entry: AnyRecord | null): string {
  const now = new Date()
  const dateStr = now.toISOString().split('T').at(0) ?? ''
  const timeStr = now.toTimeString().slice(0, 5)
  const endTime = new Date(now.getTime() + 3600000).toTimeString().slice(0, 5)

  const startedAt = entry?.startedAt ? new Date(String(entry.startedAt)) : null
  const endedAt = entry?.endedAt ? new Date(String(entry.endedAt)) : null

  const entryDate = startedAt ? (startedAt.toISOString().split('T').at(0) ?? '') : dateStr
  const entryStart = startedAt ? startedAt.toTimeString().slice(0, 5) : timeStr
  const entryEnd = endedAt ? endedAt.toTimeString().slice(0, 5) : endTime
  const entryDesc = entry?.description ? String(entry.description) : ''
  const entryTaskId = entry?.taskId ? String(entry.taskId) : ''

  return `<div class="card" style="padding:1.25rem;max-width:480px;margin-bottom:1.5rem" id="manual-entry-form">
    <div style="font-weight:600;margin-bottom:.875rem">${entry ? 'Edit Time Entry' : 'Add Time Entry'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label">Task (optional)</label>
        <select class="select" id="te-task">
          <option value="">— No task —</option>
          ${tasks.map((t) => `<option value="${escH(String(t.id))}"${t.id === entryTaskId ? ' selected' : ''}>${escH(String(t.title || 'Untitled'))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label">Description</label>
        <input class="input" id="te-desc" value="${escH(entryDesc)}" placeholder="What was worked on?">
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="input" type="date" id="te-date" value="${entryDate}">
      </div>
      <div class="form-group">
        <label class="form-label">Start time</label>
        <input class="input" type="time" id="te-start" value="${entryStart}">
      </div>
      <div class="form-group">
        <label class="form-label">End time</label>
        <input class="input" type="time" id="te-end" value="${entryEnd}">
      </div>
    </div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-primary btn-sm" id="te-save">${Icons.Save(14)} ${entry ? 'Save' : 'Add Entry'}</button>
      <button class="btn btn-secondary btn-sm" id="te-cancel">Cancel</button>
    </div>
  </div>`
}

export function bindTimeTracker(): void {
  document.getElementById('start-timer')?.addEventListener('click', async () => {
    const tid = (document.getElementById('timer-task') as HTMLSelectElement | null)?.value || null
    const desc = (document.getElementById('timer-desc') as HTMLInputElement | null)?.value || ''
    await startTimer(tid || '', desc)
    reloadData()
  })
  document.getElementById('stop-timer')?.addEventListener('click', async () => {
    const r = getRunningTimer() as AnyRecord | null
    if (r) {
      await stopTimer(String(r.id))
      reloadData()
    }
  })

  document.getElementById('add-time-entry-btn')?.addEventListener('click', () => {
    _editingEntryId = null
    _showManualForm = true
    reloadData()
  })

  document.querySelectorAll<HTMLElement>('[data-te-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn.dataset as DOMStringMap & { teEdit: string }).teEdit
      _editingEntryId = id
      _showManualForm = false
      reloadData()
    })
  })

  document.querySelectorAll<HTMLElement>('[data-te-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn.dataset as DOMStringMap & { teDel: string }).teDel
      showConfirm('Delete this time entry?', async () => {
        await dbDelete('timeEntries', id)
        reloadData()
        showToast('Entry deleted', 'success')
      })
    })
  })

  document.getElementById('te-cancel')?.addEventListener('click', () => {
    _editingEntryId = null
    _showManualForm = false
    reloadData()
  })

  document.getElementById('te-save')?.addEventListener('click', async () => {
    const date = (document.getElementById('te-date') as HTMLInputElement | null)?.value
    const start = (document.getElementById('te-start') as HTMLInputElement | null)?.value
    const end = (document.getElementById('te-end') as HTMLInputElement | null)?.value
    const desc = (document.getElementById('te-desc') as HTMLInputElement | null)?.value || ''
    const taskId = (document.getElementById('te-task') as HTMLSelectElement | null)?.value || ''

    if (!date || !start) {
      showToast('Date and start time are required', 'error')
      return
    }

    const startedAt = new Date(`${date}T${start}`).toISOString()
    const endedAt = end ? new Date(`${date}T${end}`).toISOString() : null
    const durationSeconds = endedAt
      ? Math.max(
          0,
          Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000),
        )
      : undefined

    try {
      if (_editingEntryId) {
        await dbUpdate('timeEntries', _editingEntryId, {
          startedAt,
          endedAt,
          durationSeconds,
          duration: durationSeconds,
          description: desc,
          taskId: taskId || undefined,
        })
        showToast('Entry updated', 'success')
        _editingEntryId = null
      } else {
        await dbCreate('timeEntries', {
          startedAt,
          endedAt,
          durationSeconds,
          duration: durationSeconds,
          description: desc,
          taskId: taskId || undefined,
          running: false,
        })
        showToast('Entry added', 'success')
        _showManualForm = false
      }
      reloadData()
    } catch (e) {
      showToast(`Failed: ${(e as Error).message}`, 'error')
    }
  })
}
