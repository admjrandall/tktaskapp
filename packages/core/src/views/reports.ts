// ── REPORTS ───────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 4422–4433.

import { formatDuration, downloadText, toCSV } from '../utils.js'
import { showToast } from '../state.js'
import { Icons } from '../ui/icons.js'
import type { AppState } from '../state.js'

type AnyRecord = Record<string, unknown>

export function renderReports(state: AppState): string {
  const { projects, tasks, clients, people, timeEntries } = state
  const pArr = projects as AnyRecord[],
    tArr = tasks as AnyRecord[],
    cArr = clients as AnyRecord[],
    ppArr = people as AnyRecord[],
    teArr = timeEntries as AnyRecord[]
  const ap = pArr.filter((p) => !['Done', 'Cancelled'].includes(String(p.stage || '')))
  const sc: Record<string, number> = {}
  pArr.forEach((p) => {
    sc[String(p.stage || 'Unknown')] = (sc[String(p.stage || 'Unknown')] || 0) + 1
  })
  const pc: Record<string, number> = {}
  tArr.forEach((t) => {
    pc[String(t.priority || 'None')] = (pc[String(t.priority || 'None')] || 0) + 1
  })
  const total = teArr.reduce((s, e) => s + (Number(e.duration) || 0), 0)
  return `<div style="display:flex;flex-direction:column;height:100%"><div class="workspace-toolbar" style="justify-content:space-between"><span style="font-weight:600">Reports</span><div style="display:flex;gap:.5rem"><button class="btn btn-secondary btn-sm" id="rpt-print">${Icons.Print(14)} Print</button><button class="btn btn-secondary btn-sm" id="rpt-csv">${Icons.Download(14)} CSV</button></div></div><div style="flex:1;overflow-y:auto;padding:1.5rem"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:2rem">${[
    ['Total Projects', pArr.length],
    ['Active Projects', ap.length],
    ['Total Tasks', tArr.length],
    ['Open Tasks', tArr.filter((t) => t.status !== 'Done').length],
    ['Clients', cArr.length],
    ['People', ppArr.length],
    ['Time Tracked', formatDuration(total)],
  ]
    .map(
      ([l, v]) =>
        `<div class="metric-tile"><div class="metric-value">${v}</div><div class="metric-label">${l}</div></div>`,
    )
    .join(
      '',
    )}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem"><div class="card"><div class="card-header"><span class="card-title">Projects by Stage</span></div><div class="card-body">${
    Object.entries(sc)
      .map(
        ([s, c]) =>
          `<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem"><div style="width:90px;font-size:.8rem;color:var(--text-secondary)">${s}</div><div style="flex:1;height:8px;background:var(--bg-base);border-radius:999px;overflow:hidden"><div style="height:100%;background:var(--accent);border-radius:999px;width:${Math.round((c / Math.max(pArr.length, 1)) * 100)}%"></div></div><div style="font-weight:600;font-size:.875rem;width:24px;text-align:right">${c}</div></div>`,
      )
      .join('') || '<p style="color:var(--text-tertiary)">No data</p>'
  }</div></div><div class="card"><div class="card-header"><span class="card-title">Tasks by Priority</span></div><div class="card-body">${
    Object.entries(pc)
      .map(([p, c]) => {
        const col =
          (
            {
              Low: '#10b981',
              Medium: '#f59e0b',
              High: '#ef4444',
              Critical: '#dc2626',
              None: '#94a3b8',
            } as Record<string, string>
          )[p] || '#94a3b8'
        return `<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem"><div style="width:80px;font-size:.8rem;color:var(--text-secondary)">${p}</div><div style="flex:1;height:8px;background:var(--bg-base);border-radius:999px;overflow:hidden"><div style="height:100%;background:${col};border-radius:999px;width:${Math.round((c / Math.max(tArr.length, 1)) * 100)}%"></div></div><div style="font-weight:600;font-size:.875rem;width:24px;text-align:right">${c}</div></div>`
      })
      .join('') || '<p style="color:var(--text-tertiary)">No data</p>'
  }</div></div></div></div></div>`
}

export function bindReports(state: AppState): void {
  const { projects, tasks, clients, people } = state
  document.getElementById('rpt-print')?.addEventListener('click', () => {
    window.print()
  })
  document.getElementById('rpt-csv')?.addEventListener('click', () => {
    const csv = [
      toCSV(projects as AnyRecord[], ['name', 'stage', 'priority', 'dueDate']),
      toCSV(tasks as AnyRecord[], ['title', 'status', 'priority', 'dueDate']),
      toCSV(clients as AnyRecord[], ['name', 'contactName', 'email']),
      toCSV(people as AnyRecord[], ['name', 'role', 'email']),
    ].join('\n\n')
    downloadText('taskapp-report.csv', csv, 'text/csv')
    showToast('CSV exported', 'success')
  })
}
