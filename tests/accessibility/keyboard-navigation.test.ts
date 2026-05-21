// Keyboard navigation accessibility tests.
// Tests that can be verified by parsing rendered HTML strings run here (Vitest,
// Node environment). Tests that require actual browser focus management (Tab
// cycling, Escape handling, focus-return) are kept as .todo — they belong in a
// Playwright suite against dist/offline/index.html.
// Target: WCAG 2.1 AA §2.1 (Keyboard Accessible).

import { describe, it, expect, vi, beforeAll } from 'vitest'

// ── Module mocks (hoisted before any transitive import that reads localStorage) ─

vi.mock('../../packages/core/src/state.js', () => ({
  getState: () => ({}),
  setState: vi.fn(),
  navigate: vi.fn(),
  openRecordModal: vi.fn(),
  closeConfirm: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}))

vi.mock('../../packages/core/src/storage/db.js', () => ({
  globalSearch: vi.fn(async () => []),
  dbGetAll: vi.fn(() => []),
}))

// ── Shared minimal state for render calls ──────────────────────────────────────

const BASE_STATE = {
  currentView: 'dashboard',
  sidebarCollapsed: false,
  notifications: [] as unknown[],
  authed: true,
  theme: 'light',
  aiPanelOpen: false,
}

// ── Lazy imports (resolved after mocks are hoisted) ───────────────────────────

type RenderFn = (s: typeof BASE_STATE) => string
type NavEntry = { kind: string; id?: string; label?: string }

let renderSidebar: RenderFn
let renderTopbar: RenderFn
let NAV_ENTRIES: NavEntry[]

beforeAll(async () => {
  const sidebar = await import('../../packages/core/src/views/sidebar.js')
  const topbar = await import('../../packages/core/src/views/topbar.js')
  renderSidebar = sidebar.renderSidebar as RenderFn
  renderTopbar = topbar.renderTopbar as RenderFn
  NAV_ENTRIES = sidebar.NAV_ENTRIES as NavEntry[]
})

// ── Sidebar and top nav ───────────────────────────────────────────────────────

describe('keyboard navigation — sidebar and top nav', () => {
  it('sidebar nav items are <button> elements (natively keyboard accessible without tabIndex)', () => {
    const html = renderSidebar(BASE_STATE)
    // Each item-kind entry produces a <button data-nav="..."> element
    const navButtons = html.match(/<button[^>]+data-nav="[^"]+"[^>]*>/g) ?? []
    const itemCount = NAV_ENTRIES.filter((e) => e.kind === 'item').length
    // itemCount nav entries + 1 settings button rendered separately in the footer
    expect(navButtons.length).toBe(itemCount + 1)
  })

  it('no sidebar nav button has tabindex="-1" (all remain reachable by Tab)', () => {
    const html = renderSidebar(BASE_STATE)
    const navButtons = html.match(/<button[^>]+data-nav="[^"]+"[^>]*>/g) ?? []
    for (const btn of navButtons) {
      expect(btn).not.toContain('tabindex="-1"')
    }
  })

  it('sidebar is wrapped in a <nav> element (landmark for keyboard users)', () => {
    const html = renderSidebar(BASE_STATE)
    expect(html).toContain('<nav ')
  })

  it('sidebar collapse/expand toggle is a <button> element (keyboard accessible)', () => {
    const html = renderSidebar(BASE_STATE)
    expect(html).toMatch(/<button[^>]*id="sidebar-collapse"/)
  })

  it('topbar global search control is a <button> element', () => {
    const html = renderTopbar(BASE_STATE)
    expect(html).toMatch(/<button[^>]*id="global-search-btn"/)
  })

  it('topbar AI assistant toggle is a <button> element', () => {
    const html = renderTopbar(BASE_STATE)
    expect(html).toMatch(/<button[^>]*id="ai-toggle-btn"/)
  })

  it('topbar notification button is a <button> element', () => {
    const html = renderTopbar(BASE_STATE)
    expect(html).toMatch(/<button[^>]*id="notif-btn"/)
  })

  it('topbar theme toggle is a <button> element', () => {
    const html = renderTopbar(BASE_STATE)
    expect(html).toMatch(/<button[^>]*id="theme-toggle"/)
  })

  it('topbar lock button is a <button> element when the user is authenticated', () => {
    const html = renderTopbar(BASE_STATE)
    expect(html).toMatch(/<button[^>]*id="topbar-lock-btn"/)
  })

  it.todo(
    'all sidebar navigation links are reachable by Tab key from the main content area (requires Playwright)',
  )
  it.todo('sidebar navigation links activate on Enter key press (requires Playwright)')
  it.todo('sidebar collapse/expand button activates on Enter/Space (requires Playwright)')
  it.todo(
    'keyboard focus order in sidebar matches visual order top to bottom (requires Playwright)',
  )
  it.todo('focus is never lost when switching views via keyboard (requires Playwright)')
})

// ── Dashboard ──────────────────────────────────────────────────────────────────

describe('keyboard navigation — dashboard', () => {
  it.todo('all dashboard cards and action buttons are reachable by Tab key (requires Playwright)')
  it.todo(
    'dashboard layout drag-and-drop controls provide a keyboard alternative (requires Playwright)',
  )
  it.todo('quick-action buttons on dashboard activate on Enter/Space (requires Playwright)')
})

// ── List views ─────────────────────────────────────────────────────────────────

describe('keyboard navigation — list views', () => {
  it.todo(
    '"New record" button in every list view is reachable by Tab and activates on Enter/Space (requires Playwright)',
  )
  it.todo(
    'table rows in list views are focusable and activate the record modal on Enter (requires Playwright)',
  )
  it.todo(
    'sort column headers are reachable by Tab and toggle sort on Enter/Space (requires Playwright)',
  )
  it.todo('search/filter inputs in list views are reachable by Tab (requires Playwright)')
})

// ── Record modal ───────────────────────────────────────────────────────────────

describe('keyboard navigation — record modal', () => {
  it.todo(
    'all form fields inside the record modal are reachable by Tab in logical order (requires Playwright)',
  )
  it.todo('Save and Cancel buttons inside the modal are reachable by Tab (requires Playwright)')
  it.todo('the modal close button (×) is reachable by Tab (requires Playwright)')
  it.todo(
    'Escape key closes the modal and returns focus to the element that opened it (requires Playwright)',
  )
  it.todo('Tab does not escape the modal while it is open (focus trap — requires Playwright)')
})

// ── AI chat panel ──────────────────────────────────────────────────────────────

describe('keyboard navigation — AI chat panel', () => {
  it.todo('the AI chat input field is reachable by Tab (requires Playwright)')
  it.todo('the Send button is reachable by Tab and activates on Enter/Space (requires Playwright)')
  it.todo(
    'AI action confirmation buttons (Apply / Cancel) are reachable by Tab (requires Playwright)',
  )
  it.todo(
    'Escape closes the AI panel and returns focus to the previous element (requires Playwright)',
  )
})

// ── Command palette ────────────────────────────────────────────────────────────

describe('keyboard navigation — command palette', () => {
  it.todo('the command palette opens on its keyboard shortcut (Ctrl+K — requires Playwright)')
  it.todo('command palette results are navigable by Arrow keys (requires Playwright)')
  it.todo('the selected command activates on Enter (requires Playwright)')
  it.todo(
    'Escape closes the command palette and returns focus to the main content (requires Playwright)',
  )
})

// ── Settings and trash ─────────────────────────────────────────────────────────

describe('keyboard navigation — settings', () => {
  it.todo('all settings form fields are reachable by Tab (requires Playwright)')
  it.todo('toggle switches in settings are operable by Space key (requires Playwright)')
})

describe('keyboard navigation — trash', () => {
  it.todo(
    'Restore and Permanently Delete buttons on trash items are reachable by Tab (requires Playwright)',
  )
})

describe('keyboard navigation — toasts and alerts', () => {
  it.todo('toast dismiss button is reachable by Tab when a toast is visible (requires Playwright)')
  it.todo('toast does not steal keyboard focus from the current context (requires Playwright)')
})
