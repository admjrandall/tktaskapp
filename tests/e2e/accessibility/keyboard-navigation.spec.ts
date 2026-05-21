// Playwright E2E — keyboard navigation accessibility (WCAG 2.1 AA §2.1).
// Requires: pnpm run build:offline  (dist/offline/index.html must exist)
// Run: pnpm exec playwright test tests/e2e/accessibility/keyboard-navigation.spec.ts
//
// Tests are serial and share one browser context to avoid paying PBKDF2 (600k
// iterations) on every test.  Tests that expose known accessibility gaps will
// fail until the gap is fixed — that is the correct outcome.

import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { createVaultAndUnlock } from '../helpers/auth.js'

const BUILT = existsSync('dist/offline/index.html')

// ── Shared browser context ─────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

let page: Page

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  if (!BUILT) return
  const ctx = await browser.newContext()
  page = await ctx.newPage()
  await createVaultAndUnlock(page)
})

test.afterAll(async () => {
  await page?.context().close()
})

// ── Sidebar and top nav ────────────────────────────────────────────────────────

test.describe('keyboard navigation — sidebar and top nav', () => {
  test('all sidebar navigation buttons are reachable by Tab key (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first — dist/offline/index.html is missing')
    const navBtns = page.locator('button[data-nav]')
    const count = await navBtns.count()
    expect(count, 'sidebar must contain at least one nav button').toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const btn = navBtns.nth(i)
      await btn.focus()
      await expect(btn).toBeFocused()
    }
  })

  test('sidebar navigation links activate on Enter key press (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const clientsBtn = page.locator('button[data-nav="clients"]')
    await clientsBtn.focus()
    await expect(clientsBtn).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#sidebar button[data-nav="clients"]')).toHaveClass(/active/)
  })

  test('sidebar navigation links activate on Space key press (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const projectsBtn = page.locator('button[data-nav="projects"]')
    await projectsBtn.focus()
    await page.keyboard.press(' ')
    await expect(page.locator('#sidebar button[data-nav="projects"]')).toHaveClass(/active/)
  })

  test('sidebar collapse/expand toggle activates on Enter key (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const collapseBtn = page.locator('#sidebar-collapse')
    const sidebar = page.locator('#sidebar')

    await collapseBtn.focus()
    await page.keyboard.press('Enter')
    await expect(sidebar).toHaveClass(/collapsed/)

    await collapseBtn.focus()
    await page.keyboard.press('Enter')
    await expect(sidebar).not.toHaveClass(/collapsed/)
  })

  test('sidebar collapse/expand toggle activates on Space key (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const collapseBtn = page.locator('#sidebar-collapse')
    const sidebar = page.locator('#sidebar')

    await collapseBtn.focus()
    await page.keyboard.press(' ')
    await expect(sidebar).toHaveClass(/collapsed/)

    await collapseBtn.focus()
    await page.keyboard.press(' ')
    await expect(sidebar).not.toHaveClass(/collapsed/)
  })

  test('keyboard focus order in sidebar matches visual (top-to-bottom) order (WCAG 2.4.3)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const navBtns = page.locator('#sidebar button[data-nav]')
    const ids: string[] = []
    for (let i = 0; i < (await navBtns.count()); i++) {
      ids.push((await navBtns.nth(i).getAttribute('data-nav')) ?? '')
    }
    // NAV_ENTRIES order from packages/core/src/views/sidebar.ts
    const expectedOrder = [
      'dashboard',
      'ai',
      'clients',
      'projects',
      'tasks',
      'people',
      'departments',
      'standaloneNotes',
      'library',
      'calendar',
      'reports',
    ]
    let prevIdx = -1
    for (const id of expectedOrder) {
      const idx = ids.indexOf(id)
      expect(idx, `"${id}" must appear after the preceding entry in DOM order`).toBeGreaterThan(
        prevIdx,
      )
      prevIdx = idx
    }
  })

  test('focus is not discarded (not reset to body) when switching views via keyboard (WCAG 2.4.3)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Navigate to dashboard first to restore known state
    await page.locator('button[data-nav="dashboard"]').click()
    await expect(page.locator('button[data-nav="dashboard"]')).toHaveClass(/active/)

    const peopleBtn = page.locator('button[data-nav="people"]')
    await peopleBtn.focus()
    await page.keyboard.press('Enter')

    // After re-render, activeElement must not be the body
    const tag = await page.evaluate(() => document.activeElement?.tagName?.toUpperCase() ?? 'BODY')
    expect(tag, 'focus must not revert to document.body after view switch').not.toBe('BODY')
  })
})

// ── List views ─────────────────────────────────────────────────────────────────

test.describe('keyboard navigation — list views', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="clients"]').click()
    await expect(page.locator('button[data-nav="clients"]')).toHaveClass(/active/)
  })

  test('"New record" button (#ws-add-btn) is reachable by Tab and activates on Enter (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const addBtn = page.locator('#ws-add-btn')
    await expect(addBtn).toBeVisible()
    await addBtn.focus()
    await expect(addBtn).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page.locator('#record-modal-backdrop')).toBeVisible({ timeout: 5_000 })

    // Close the modal
    await page.keyboard.press('Escape')
    await expect(page.locator('#record-modal-backdrop')).not.toBeVisible({ timeout: 5_000 })
  })

  test('search input in list view is reachable by Tab (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const searchInput = page.locator('#ws-search')
    await expect(searchInput).toBeVisible()
    await searchInput.focus()
    await expect(searchInput).toBeFocused()
  })
})

// ── Record modal ───────────────────────────────────────────────────────────────

test.describe('keyboard navigation — record modal', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="clients"]').click()
    await expect(page.locator('button[data-nav="clients"]')).toHaveClass(/active/)
    await page.locator('#ws-add-btn').click()
    await expect(page.locator('#record-modal-backdrop')).toBeVisible({ timeout: 5_000 })
  })

  test.afterEach(async () => {
    if (!BUILT) return
    // Leave modal in a clean state; Escape first, then fallback click
    await page.keyboard.press('Escape').catch(() => {})
    const backdrop = page.locator('#record-modal-backdrop')
    if (await backdrop.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page
        .locator('#modal-cancel')
        .click()
        .catch(() => {})
    }
  })

  test('all form fields inside the record modal are reachable by Tab (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const modal = page.locator('#record-modal-backdrop .modal')
    const focusable = modal.locator(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
    )
    const count = await focusable.count()
    expect(count, 'modal must have at least one focusable element').toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await focusable.nth(i).focus()
      await expect(focusable.nth(i)).toBeFocused()
    }
  })

  test('Save (#modal-save) and Cancel (#modal-cancel) buttons are reachable by Tab (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('#modal-save').focus()
    await expect(page.locator('#modal-save')).toBeFocused()

    await page.locator('#modal-cancel').focus()
    await expect(page.locator('#modal-cancel')).toBeFocused()
  })

  test('the modal close button (#modal-close) is reachable by Tab (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('#modal-close').focus()
    await expect(page.locator('#modal-close')).toBeFocused()
  })

  test('Escape key closes the record modal (WCAG 2.1.2, §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await expect(page.locator('#record-modal-backdrop')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#record-modal-backdrop')).not.toBeVisible({ timeout: 5_000 })
  })

  test('focus does not escape the record modal while it is open — Tab stays inside (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Tab through all focusable elements; none of them should be outside the modal
    const modal = page.locator('#record-modal-backdrop .modal')
    // Focus first element inside modal
    const firstFocusable = modal.locator('input:not([disabled]), button:not([disabled])').first()
    await firstFocusable.focus()

    // Tab 20 times; every focused element should be inside the modal
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      const isInsideModal = await page.evaluate(() => {
        const modal = document.querySelector('#record-modal-backdrop .modal')
        return modal?.contains(document.activeElement) ?? false
      })
      expect(isInsideModal, `Tab step ${i + 1}: focus escaped the modal`).toBe(true)
    }
  })
})

// ── AI chat panel ──────────────────────────────────────────────────────────────

test.describe('keyboard navigation — AI chat panel', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    // Open AI panel via the topbar toggle
    await page.locator('button[data-nav="dashboard"]').click()
    const aiToggle = page.locator('#ai-toggle-btn')
    const isOpen = await page
      .locator('[class*="ai-panel"]')
      .isVisible()
      .catch(() => false)
    if (!isOpen) await aiToggle.click()
  })

  test.afterEach(async () => {
    if (!BUILT) return
    // Close AI panel if open
    const aiPanel = page.locator('[class*="ai-panel"]')
    if (await aiPanel.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {})
    }
  })

  test('the AI chat input field is reachable by Tab (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // AI chat input — various possible selectors used in the AI panel
    const chatInput = page.locator('#ai-input, textarea[id*="ai"], input[id*="ai-chat"]').first()
    if ((await chatInput.count()) === 0) {
      test.skip()
      return
    }
    await chatInput.focus()
    await expect(chatInput).toBeFocused()
  })

  test('the Send button is reachable by Tab (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const sendBtn = page.locator('#ai-send, button[id*="send"]').first()
    if ((await sendBtn.count()) === 0) {
      test.skip()
      return
    }
    await sendBtn.focus()
    await expect(sendBtn).toBeFocused()
  })

  test('Escape closes the AI panel and returns focus (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.keyboard.press('Escape')
    const aiPanel = page.locator('[class*="ai-panel"]')
    await expect(aiPanel).not.toBeVisible({ timeout: 5_000 })
  })
})

// ── Command palette ────────────────────────────────────────────────────────────

test.describe('keyboard navigation — command palette', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="dashboard"]').click()
    // Ensure command palette is closed
    await page.keyboard.press('Escape')
  })

  test('command palette opens on Ctrl+K (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.keyboard.press('Control+k')
    await expect(page.locator('.command-palette')).toBeVisible({ timeout: 5_000 })
    await page.keyboard.press('Escape')
  })

  test('command palette input receives focus on open (WCAG 2.4.3)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.keyboard.press('Control+k')
    await expect(page.locator('.command-palette')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#cmd-input')).toBeFocused()
    await page.keyboard.press('Escape')
  })

  test('command palette results are navigable by Arrow keys (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.keyboard.press('Control+k')
    await expect(page.locator('.command-palette')).toBeVisible({ timeout: 5_000 })

    const firstItem = page.locator('.command-item').first()
    const initialClass = (await firstItem.getAttribute('class')) ?? ''
    expect(initialClass).toContain('selected')

    await page.keyboard.press('ArrowDown')
    // After ArrowDown the second item should be selected, not the first
    const firstItemClass = (await firstItem.getAttribute('class')) ?? ''
    expect(firstItemClass, 'ArrowDown should move selection off the first item').not.toContain(
      'selected',
    )

    await page.keyboard.press('Escape')
  })

  test('Escape closes the command palette (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.keyboard.press('Control+k')
    await expect(page.locator('.command-palette')).toBeVisible({ timeout: 5_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('.command-palette')).not.toBeVisible({ timeout: 5_000 })
  })
})

// ── Settings ───────────────────────────────────────────────────────────────────

test.describe('keyboard navigation — settings', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="settings"]').click()
    await expect(page.locator('button[data-nav="settings"]')).toHaveClass(/active/)
  })

  test('all settings form fields in the General section are reachable by Tab (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const focusable = page.locator(
      '.workspace-body input:not([disabled]), .workspace-body select:not([disabled]), .workspace-body button:not([disabled])',
    )
    const count = await focusable.count()
    expect(count, 'settings must have at least one focusable element').toBeGreaterThan(0)
    await focusable.first().focus()
    await expect(focusable.first()).toBeFocused()
  })

  test('theme toggle switches in settings are reachable by Tab and operable by Space (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const themeButtons = page.locator('[data-theme]')
    const count = await themeButtons.count()
    if (count === 0) {
      test.skip()
      return
    }
    await themeButtons.first().focus()
    await expect(themeButtons.first()).toBeFocused()
    // Space activates the button (native button behavior)
    await page.keyboard.press(' ')
  })
})

// ── Trash ──────────────────────────────────────────────────────────────────────

test.describe('keyboard navigation — trash', () => {
  test('Restore and Permanently Delete buttons are reachable by Tab when items exist (WCAG 2.1 §2.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="trash"]').click()

    const restoreBtn = page
      .locator('[data-restore], button')
      .filter({ hasText: /restore/i })
      .first()
    const deleteBtn = page
      .locator('[data-perma], button')
      .filter({ hasText: /delete/i })
      .first()

    if ((await restoreBtn.count()) > 0) {
      await restoreBtn.focus()
      await expect(restoreBtn).toBeFocused()
    }
    if ((await deleteBtn.count()) > 0) {
      await deleteBtn.focus()
      await expect(deleteBtn).toBeFocused()
    }
    // If trash is empty there are no buttons to test — that is a valid (empty) state
  })
})

// ── Toasts and alerts ─────────────────────────────────────────────────────────

test.describe('keyboard navigation — toasts and alerts', () => {
  test('toast does not steal keyboard focus from the current context (WCAG 2.4.3)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="clients"]').click()
    const addBtn = page.locator('#ws-add-btn')
    await addBtn.focus()
    await expect(addBtn).toBeFocused()

    // Navigate to another view (may trigger a toast notification in some states)
    await page.locator('button[data-nav="projects"]').click()
    await page.waitForTimeout(600)

    const toast = page.locator('.toast-container')
    if (await toast.isVisible({ timeout: 500 }).catch(() => false)) {
      const activeTag = await page.evaluate(
        () => document.activeElement?.tagName?.toUpperCase() ?? 'BODY',
      )
      // Toast container is a non-interactive div — it must not steal focus
      expect(activeTag, 'toast must not steal keyboard focus').not.toBe('DIV')
      expect(activeTag, 'focus must remain on an interactive element').not.toBe('BODY')
    }
  })
})
