/**
 * Render tests for the React Reports component (ADR-M-015, issue #26).
 *
 * State is provided via vi.mock() on the store modules — the component uses
 * useAppState() which delegates to getState/subscribe from state.ts.
 *
 * The Trusted Types bridge (dangerousAuditedHtml) falls back to a passthrough
 * in jsdom (trustedTypes is undefined), so no policy mock is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Reports } from '@core/react/views/Reports.js'

// ── store mock ────────────────────────────────────────────────────────────────

const _listeners = new Set<() => void>()

const baseState = {
  projects: [],
  tasks: [],
  clients: [],
  people: [],
  timeEntries: [],
  currentView: 'reports',
  notifications: [],
  toast: null,
  confirmDialog: null,
  recordModal: null,
  docModal: null,
  fileViewer: null,
  aiPanelOpen: false,
  commandOpen: false,
  notifPanelOpen: false,
}

let _state = { ...baseState }

vi.mock('@core/state.js', () => ({
  getState: () => _state,
  subscribe: (fn: () => void) => {
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  },
  setState: (patch: Partial<typeof _state>) => {
    _state = { ..._state, ...patch }
    _listeners.forEach((fn) => fn())
  },
  showToast: vi.fn(),
  navigate: vi.fn(),
}))

// utils.ts — downloadText calls document.createElement('a') which is fine in jsdom
vi.mock('@core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/utils.js')>()
  return {
    ...actual,
    downloadText: vi.fn(),
  }
})

beforeEach(() => {
  _state = { ...baseState }
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Reports component', () => {
  it('renders metric tiles with zero counts when store is empty', () => {
    render(<Reports />)
    expect(screen.getByText('Total Projects')).toBeInTheDocument()
    expect(screen.getByText('Total Tasks')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Time Tracked')).toBeInTheDocument()
    // All numeric metrics should be 0 when store is empty
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(4)
  })

  it('renders correct project and task counts from store', () => {
    _state = {
      ..._state,
      projects: [
        { id: '1', name: 'Alpha', stage: 'Active' },
        { id: '2', name: 'Beta', stage: 'Done' },
        { id: '3', name: 'Gamma', stage: 'Planning' },
      ],
      tasks: [
        { id: 't1', title: 'Task A', status: 'Todo', priority: 'High' },
        { id: 't2', title: 'Task B', status: 'Done', priority: 'Low' },
        { id: 't3', title: 'Task C', status: 'Todo', priority: 'Low' },
      ],
    }
    render(<Reports />)
    // Total Projects = 3, Total Tasks = 3 — both unambiguous
    const threes = screen.getAllByText('3')
    expect(threes.length).toBeGreaterThanOrEqual(2) // Total Projects + Total Tasks
    // Active Projects (stage not Done/Cancelled) = Alpha + Gamma = 2
    // Open Tasks (status !== 'Done') = Task A + Task C = 2
    const twos = screen.getAllByText('2')
    expect(twos.length).toBeGreaterThanOrEqual(2)
  })

  it('renders Projects by Stage chart with data', () => {
    _state = {
      ..._state,
      projects: [
        { id: '1', stage: 'Active' },
        { id: '2', stage: 'Active' },
        { id: '3', stage: 'Planning' },
      ],
    }
    render(<Reports />)
    expect(screen.getByText('Projects by Stage')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Planning')).toBeInTheDocument()
  })

  it('renders Tasks by Priority chart with data', () => {
    _state = {
      ..._state,
      tasks: [
        { id: 't1', priority: 'High' },
        { id: 't2', priority: 'High' },
        { id: 't3', priority: 'Low' },
      ],
    }
    render(<Reports />)
    expect(screen.getByText('Tasks by Priority')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('shows "No data" when there are no projects', () => {
    render(<Reports />)
    const noDataEls = screen.getAllByText('No data')
    expect(noDataEls.length).toBeGreaterThanOrEqual(1)
  })

  it('CSV button calls downloadText', async () => {
    const { downloadText } = await import('@core/utils.js')
    render(<Reports />)
    const csvBtn = screen.getByRole('button', { name: /csv/i })
    fireEvent.click(csvBtn)
    expect(downloadText).toHaveBeenCalledWith('taskapp-report.csv', expect.any(String), 'text/csv')
  })

  it('Print button calls window.print', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<Reports />)
    const printBtn = screen.getByRole('button', { name: /print/i })
    fireEvent.click(printBtn)
    expect(printSpy).toHaveBeenCalledOnce()
    printSpy.mockRestore()
  })
})
