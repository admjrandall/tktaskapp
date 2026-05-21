// Screen reader label accessibility tests.
// Tests that verify ARIA attributes in the rendered HTML strings of render
// functions run here (Vitest, Node environment). Tests that require an
// instrumented browser (axe-core, Playwright + axe) are kept as .todo.
// Target: WCAG 2.1 AA §1.1 (Text Alternatives), §1.3 (Adaptable), §4.1 (Compatible).

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

// ── Shared minimal state ───────────────────────────────────────────────────────

const BASE_STATE = {
  currentView: 'dashboard',
  sidebarCollapsed: false,
  notifications: [] as unknown[],
  authed: true,
  theme: 'light',
  aiPanelOpen: false,
}

// ── Lazy imports ───────────────────────────────────────────────────────────────

type RenderFn = (s: typeof BASE_STATE) => string

let renderSidebar: RenderFn
let renderTopbar: RenderFn
let renderToast: (t: { type?: string; message?: string } | null) => string
let renderConfirmDialog: (d: { message?: string } | null) => string
let renderViewTabs: (cur: string) => string

beforeAll(async () => {
  const sidebar = await import('../../packages/core/src/views/sidebar.js')
  const topbar = await import('../../packages/core/src/views/topbar.js')
  const components = await import('../../packages/core/src/ui/components.js')
  renderSidebar = sidebar.renderSidebar as RenderFn
  renderTopbar = topbar.renderTopbar as RenderFn
  renderToast = components.renderToast as typeof renderToast
  renderConfirmDialog = components.renderConfirmDialog as typeof renderConfirmDialog
  renderViewTabs = components.renderViewTabs as typeof renderViewTabs
})

// ── Icon-only buttons ──────────────────────────────────────────────────────────

describe('screen reader labels — icon-only buttons', () => {
  it('every sidebar nav item button has a title attribute (accessible name)', () => {
    const html = renderSidebar(BASE_STATE)
    const navButtons = html.match(/<button[^>]+data-nav="[^"]+"[^>]*>/g) ?? []
    expect(navButtons.length).toBeGreaterThan(0)
    for (const btn of navButtons) {
      expect(btn).toMatch(/title="[^"]+"/)
    }
  })

  it('sidebar settings button has title="Settings"', () => {
    const html = renderSidebar(BASE_STATE)
    expect(html).toContain('title="Settings"')
  })

  it('topbar AI assistant toggle has title="AI Assistant"', () => {
    const html = renderTopbar(BASE_STATE)
    expect(html).toMatch(
      /id="ai-toggle-btn"[^>]*title="AI Assistant"|title="AI Assistant"[^>]*id="ai-toggle-btn"/,
    )
  })

  it('topbar lock button has title="Lock app" when authenticated', () => {
    const html = renderTopbar(BASE_STATE)
    expect(html).toContain('title="Lock app"')
  })

  it('view tab buttons (list/grid/kanban/spatial) each have a title attribute', () => {
    const html = renderViewTabs('list')
    const tabButtons = html.match(/<button[^>]+data-view="[^"]+"[^>]*>/g) ?? []
    expect(tabButtons.length).toBe(4)
    for (const btn of tabButtons) {
      expect(btn).toMatch(/title="[^"]+"/)
    }
  })

  it.todo(
    'every icon-only button has a non-empty accessible name (aria-label or aria-labelledby) — full audit requires Playwright + axe',
  )
  it.todo(
    'notification panel icon button reflects unread count in accessible name (requires Playwright)',
  )
  it.todo(
    'table row action icon buttons (edit, delete) have unique accessible names per row (requires Playwright)',
  )
})

// ── Status and live regions ────────────────────────────────────────────────────

describe('screen reader labels — status and live regions', () => {
  it('info toast has role="alert" so it is announced by screen readers', () => {
    const html = renderToast({ type: 'info', message: 'Record saved.' })
    expect(html).toContain('role="alert"')
  })

  it('error toast has role="alert" so it is announced assertively', () => {
    const html = renderToast({ type: 'error', message: 'Something went wrong.' })
    expect(html).toContain('role="alert"')
  })

  it('success toast has role="alert"', () => {
    const html = renderToast({ type: 'success', message: 'Done.' })
    expect(html).toContain('role="alert"')
  })

  it('null toast renders empty string (no spurious live region in DOM)', () => {
    expect(renderToast(null)).toBe('')
  })

  it.todo(
    'AI streaming response text is announced incrementally via an aria-live region (requires Playwright)',
  )
  it.todo(
    'the running timer display updates are announced via an aria-live region (requires Playwright)',
  )
  it.todo('loading states have aria-busy="true" on the container (requires Playwright)')
})

// ── Confirm dialog structure ───────────────────────────────────────────────────

describe('screen reader labels — confirm dialog', () => {
  it('confirm dialog renders a Cancel button and a Confirm button', () => {
    const html = renderConfirmDialog({ message: 'Are you sure?' })
    expect(html).toContain('id="confirm-cancel"')
    expect(html).toContain('id="confirm-ok"')
  })

  it('confirm dialog Cancel and Confirm are <button> elements', () => {
    const html = renderConfirmDialog({ message: 'Are you sure?' })
    expect(html).toMatch(/<button[^>]*id="confirm-cancel"/)
    expect(html).toMatch(/<button[^>]*id="confirm-ok"/)
  })

  it('confirm dialog message is rendered in the modal body', () => {
    const html = renderConfirmDialog({ message: 'Delete this record?' })
    expect(html).toContain('Delete this record?')
  })

  it('null confirm dialog renders empty string (no spurious modal in DOM)', () => {
    expect(renderConfirmDialog(null)).toBe('')
  })
})

// ── Navigation landmarks ───────────────────────────────────────────────────────

describe('screen reader labels — landmarks and headings', () => {
  it('sidebar includes a <nav> element (navigation landmark for screen readers)', () => {
    const html = renderSidebar(BASE_STATE)
    expect(html).toContain('<nav ')
  })

  it('sidebar is wrapped in an <aside> element (complementary landmark)', () => {
    const html = renderSidebar(BASE_STATE)
    expect(html).toMatch(/<aside[^>]*class="sidebar/)
  })

  it('topbar is wrapped in a <header> element (banner landmark)', () => {
    const html = renderTopbar(BASE_STATE)
    expect(html).toMatch(/<header[^>]*class="topbar"/)
  })

  it.todo('the page has a <main> landmark or role="main" (requires full-page render)')
  it.todo(
    'each view rendered in the workspace has a visible heading h1 or h2 (requires Playwright)',
  )
  it.todo(
    'modal dialogs have a heading that matches their aria-labelledby target (requires Playwright + aria)',
  )
  it.todo('there are no skipped heading levels (requires Playwright + axe)')
})

// ── Images and decorative icons ────────────────────────────────────────────────

describe('screen reader labels — images and decorative icons', () => {
  it.todo(
    'SVG icons that are purely decorative have aria-hidden="true" (requires axe or manual audit)',
  )
  it.todo('SVG icons that convey meaning have a <title> or aria-label (requires axe)')
  it.todo('any <img> element has a non-empty alt attribute, or alt="" if decorative (requires axe)')
})

// ── Data tables ────────────────────────────────────────────────────────────────

describe('screen reader labels — data tables', () => {
  it.todo('every data table has column headers with scope="col" (requires Playwright + axe)')
  it.todo('sortable column headers announce current sort state via aria-sort (requires Playwright)')
  it.todo('tables have a programmatic caption or aria-label (requires Playwright + axe)')
})

// ── Toggles and checkboxes ─────────────────────────────────────────────────────

describe('screen reader labels — toggles and checkboxes', () => {
  it.todo(
    'theme toggle announces its current state via aria-pressed or aria-checked (requires Playwright)',
  )
  it.todo(
    'settings toggle switches have accessible names and reflect state via aria-checked (requires Playwright)',
  )
})

// ── AI-specific labels ─────────────────────────────────────────────────────────

describe('screen reader labels — AI chat and actions', () => {
  it.todo('AI message bubbles are distinguishable by screen readers (requires Playwright)')
  it.todo('the AI pending action description is announced when it appears (requires Playwright)')
  it.todo(
    'the AI download progress bar has role="progressbar" with aria-valuenow/min/max (requires Playwright)',
  )
})
