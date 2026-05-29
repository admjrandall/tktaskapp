// ── Reports view — React reference component ──────────────────────────────────
//
// Reference implementation for the React migration (see REACT-MIGRATION.md and
// ADR-M-015). It replaces the `renderReports(state): string` + `bindReports(state)`
// pair in `../../views/reports.ts`, demonstrating the target patterns:
//
//   - state via `useAppState()` (the useSyncExternalStore bridge) instead of a
//     `state` argument threaded through a string builder
//   - JSX (auto-escaped) instead of template-literal HTML + manual `escH()`
//   - `onClick` props instead of `bindReports` + `getElementById` listener wiring
//   - existing CSS classes (`metric-tile`, `card`, …) and `utils`/`Icons` reused
//   - icon SVG strings rendered via the Trusted Types bridge (`dangerousAuditedHtml`)
//
// The legacy `reports.ts` stays until the host shell is migrated; both read the
// same store, so they are behaviourally equivalent during the transition.

import { useAppState } from '../use-app-state.js'
import { dangerousAuditedHtml } from '../trusted-html.js'
import { downloadText, formatDuration, toCSV } from '../../utils.js'
import { showToast } from '../../state.js'
import { Icons } from '../../ui/icons.js'

type AnyRecord = Record<string, unknown>

/** Narrow an unknown field to a non-empty string, falling back otherwise. */
function asLabel(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback
}

const PRIORITY_COLORS: Record<string, string> = {
  Low: '#10b981',
  Medium: '#f59e0b',
  High: '#ef4444',
  Critical: '#dc2626',
  None: '#94a3b8',
}

function countBy(rows: AnyRecord[], key: string, fallback: string): Array<[string, number]> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const bucket = asLabel(row[key], fallback)
    counts[bucket] = (counts[bucket] ?? 0) + 1
  }
  return Object.entries(counts)
}

function Bar({
  label,
  value,
  total,
  color,
}: {
  label: string
  value: number
  total: number
  color: string
}) {
  const pct = Math.round((value / Math.max(total, 1)) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.5rem' }}>
      <div style={{ width: '90px', fontSize: '.8rem', color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: '8px',
          background: 'var(--bg-base)',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{ height: '100%', background: color, borderRadius: '999px', width: `${pct}%` }}
        />
      </div>
      <div style={{ fontWeight: 600, fontSize: '.875rem', width: '24px', textAlign: 'right' }}>
        {value}
      </div>
    </div>
  )
}

export function Reports() {
  const state = useAppState()
  const projects = state.projects as AnyRecord[]
  const tasks = state.tasks as AnyRecord[]
  const clients = state.clients as AnyRecord[]
  const people = state.people as AnyRecord[]
  const timeEntries = state.timeEntries as AnyRecord[]

  const activeProjects = projects.filter(
    (p) => !['Done', 'Cancelled'].includes(asLabel(p.stage, '')),
  )
  const stageCounts = countBy(projects, 'stage', 'Unknown')
  const priorityCounts = countBy(tasks, 'priority', 'None')
  const totalDuration = timeEntries.reduce((sum, e) => sum + (Number(e.duration) || 0), 0)

  const metrics: Array<[string, string | number]> = [
    ['Total Projects', projects.length],
    ['Active Projects', activeProjects.length],
    ['Total Tasks', tasks.length],
    ['Open Tasks', tasks.filter((t) => t.status !== 'Done').length],
    ['Clients', clients.length],
    ['People', people.length],
    ['Time Tracked', formatDuration(totalDuration)],
  ]

  function exportCsv() {
    const csv = [
      toCSV(projects, ['name', 'stage', 'priority', 'dueDate']),
      toCSV(tasks, ['title', 'status', 'priority', 'dueDate']),
      toCSV(clients, ['name', 'contactName', 'email']),
      toCSV(people, ['name', 'role', 'email']),
    ].join('\n\n')
    downloadText('taskapp-report.csv', csv, 'text/csv')
    showToast('CSV exported', 'success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="workspace-toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>Reports</span>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            id="rpt-print"
            onClick={() => {
              window.print()
            }}
          >
            <span dangerouslySetInnerHTML={dangerousAuditedHtml(Icons.Print(14))} /> Print
          </button>
          <button className="btn btn-secondary btn-sm" id="rpt-csv" onClick={exportCsv}>
            <span dangerouslySetInnerHTML={dangerousAuditedHtml(Icons.Download(14))} /> CSV
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          {metrics.map(([label, value]) => (
            <div className="metric-tile" key={label}>
              <div className="metric-value">{value}</div>
              <div className="metric-label">{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Projects by Stage</span>
            </div>
            <div className="card-body">
              {stageCounts.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)' }}>No data</p>
              ) : (
                stageCounts.map(([stage, count]) => (
                  <Bar
                    key={stage}
                    label={stage}
                    value={count}
                    total={projects.length}
                    color="var(--accent)"
                  />
                ))
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Tasks by Priority</span>
            </div>
            <div className="card-body">
              {priorityCounts.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)' }}>No data</p>
              ) : (
                priorityCounts.map(([priority, count]) => (
                  <Bar
                    key={priority}
                    label={priority}
                    value={count}
                    total={tasks.length}
                    color={PRIORITY_COLORS[priority] ?? '#94a3b8'}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
