// ── TIME TRACKER ──────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 4410–4421.

import { escH, formatDuration, formatRelative } from '../utils.js';
import { Icons } from '../icons.js';
import { renderEmpty } from '../components.js';
import { startTimer, stopTimer, getRunningTimer } from '../db.js';
import { reloadData } from '../state.js';
import type { AppState } from '../state.js';

type AnyRecord = Record<string, unknown>;

export function renderTimeTracker(state: AppState): string {
  const { tasks, timeEntries, runningTimer, timerElapsed } = state;
  const tArr = tasks as AnyRecord[];
  const entries = [...(timeEntries as AnyRecord[])].sort((a, b) => new Date(String(b.startedAt || '')).getTime() - new Date(String(a.startedAt || '')).getTime());
  const total = entries.filter(e => !e.running).reduce((s, e) => s + (Number(e.duration) || 0), 0);
  const todaySec = entries.filter(e => !e.running && e.startedAt && new Date(String(e.startedAt)).toDateString() === new Date().toDateString()).reduce((s, e) => s + (Number(e.duration) || 0), 0);
  const running = runningTimer as AnyRecord | null;
  const elapsed = running ? (timerElapsed as number) : 0;
  return `<div style="display:flex;flex-direction:column;height:100%"><div class="workspace-toolbar"><span style="font-weight:600">Time Tracker</span></div><div style="flex:1;overflow-y:auto;padding:1.5rem"><div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.5rem;max-width:480px"><div class="metric-tile"><div class="metric-value">${formatDuration(todaySec)}</div><div class="metric-label">Today</div></div><div class="metric-tile"><div class="metric-value">${formatDuration(total)}</div><div class="metric-label">All Time</div></div></div><div class="card" style="padding:1.5rem;max-width:480px;margin-bottom:1.5rem"><div class="timer-display" style="margin-bottom:1rem;text-align:center">${formatDuration(elapsed)}</div>${running ? `<div style="text-align:center;margin-bottom:.75rem;font-size:.875rem;color:var(--text-secondary)">${escH(String(tArr.find(t => t.id === running.taskId)?.title || 'No task selected'))}</div><button class="btn btn-danger" id="stop-timer" style="width:100%">${Icons.Stop(16)} Stop</button>` : `<div style="display:flex;flex-direction:column;gap:.75rem"><select class="select" id="timer-task"><option value="">— Select task —</option>${tArr.map(t => `<option value="${t.id}">${escH(String(t.title || 'Untitled'))}</option>`).join('')}</select><input class="input" id="timer-desc" placeholder="What are you working on?"><button class="btn btn-primary" id="start-timer" style="width:100%">${Icons.Play(16)} Start Timer</button></div>`}</div><div style="margin-bottom:.5rem;font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary)">Log</div>${entries.slice(0, 20).map(e => { const task = tArr.find(t => t.id === e.taskId); return `<div style="display:flex;align-items:center;gap:.75rem;padding:.625rem;border-radius:var(--radius-md);background:var(--bg-surface);border:1px solid var(--border-subtle);margin-bottom:.375rem"><div style="width:8px;height:8px;border-radius:50%;background:${e.running ? '#10b981' : 'var(--border-default)'};flex-shrink:0${e.running ? ';animation:pulse 2s infinite' : ''}"></div><div style="flex:1;min-width:0"><div style="font-size:.875rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(task?.title || e.description || 'Session'))}</div><div style="font-size:.75rem;color:var(--text-tertiary)">${formatRelative(String(e.startedAt || ''))}</div></div><div class="timer-display" style="font-size:1rem">${e.running ? formatDuration(elapsed) : formatDuration(Number(e.duration) || 0)}</div></div>`; }).join('') || renderEmpty(Icons.Clock(40), 'No entries yet')}</div></div>`;
}

export function bindTimeTracker(): void {
  document.getElementById('start-timer')?.addEventListener('click', async () => {
    const tid = (document.getElementById('timer-task') as HTMLSelectElement | null)?.value || null;
    const desc = (document.getElementById('timer-desc') as HTMLInputElement | null)?.value || '';
    await startTimer(tid || '', desc); reloadData();
  });
  document.getElementById('stop-timer')?.addEventListener('click', async () => {
    const r = getRunningTimer() as AnyRecord | null;
    if (r) { await stopTimer(String(r.id)); reloadData(); }
  });
}
