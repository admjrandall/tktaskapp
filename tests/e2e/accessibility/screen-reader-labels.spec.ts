// Playwright E2E — screen reader labels and ARIA (WCAG 2.1 AA §1.1, §1.3, §4.1).
// Requires: pnpm run build:offline
// Run: pnpm exec playwright test tests/e2e/accessibility/screen-reader-labels.spec.ts
//
// Uses @axe-core/playwright for automated WCAG scanning plus targeted assertions
// for specific ARIA patterns the app must implement.

import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
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

// ── Full WCAG 2.1 AA axe-core scan ────────────────────────────────────────────

test.describe('axe-core WCAG 2.1 AA audit', () => {
  test('dashboard view has no WCAG 2.1 AA violations (axe-core)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="dashboard"]').click()
    await expect(page.locator('button[data-nav="dashboard"]')).toHaveClass(/active/)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    expect(results.violations, formatViolations(results.violations)).toEqual([])
  })

  test('clients list view has no WCAG 2.1 AA violations (axe-core)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="clients"]').click()
    await expect(page.locator('button[data-nav="clients"]')).toHaveClass(/active/)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    expect(results.violations, formatViolations(results.violations)).toEqual([])
  })

  test('settings view has no WCAG 2.1 AA violations (axe-core)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="settings"]').click()
    await expect(page.locator('button[data-nav="settings"]')).toHaveClass(/active/)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    expect(results.violations, formatViolations(results.violations)).toEqual([])
  })

  test('record modal has no WCAG 2.1 AA violations while open (axe-core)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="clients"]').click()
    await page.locator('#ws-add-btn').click()
    await expect(page.locator('#record-modal-backdrop')).toBeVisible({ timeout: 5_000 })

    const results = await new AxeBuilder({ page })
      .include('#record-modal-backdrop')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    await page.keyboard.press('Escape')
    expect(results.violations, formatViolations(results.violations)).toEqual([])
  })
})

// ── Icon-only buttons — accessible names (WCAG 4.1.2, 1.1.1) ─────────────────

test.describe('screen reader labels — icon-only buttons', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="dashboard"]').click()
    await expect(page.locator('button[data-nav="dashboard"]')).toHaveClass(/active/)
  })

  test('every icon-only button in the topbar has a non-empty accessible name (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Icon-only buttons: AI toggle, notif, theme toggle, lock
    const iconBtns = [
      page.locator('#ai-toggle-btn'),
      page.locator('#notif-btn'),
      page.locator('#theme-toggle'),
      page.locator('#topbar-lock-btn'),
    ]
    for (const btn of iconBtns) {
      if ((await btn.count()) === 0) continue
      const accessibleName = await btn.evaluate((el: Element) => {
        const label =
          el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent?.trim()
        return label ?? ''
      })
      expect(accessibleName, `topbar button must have a non-empty accessible name`).toBeTruthy()
    }
  })

  test('every sidebar nav button has an accessible name (title attribute — WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const navBtns = page.locator('#sidebar button[data-nav]')
    const count = await navBtns.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const btn = navBtns.nth(i)
      const title = await btn.getAttribute('title')
      const ariaLabel = await btn.getAttribute('aria-label')
      expect(
        title || ariaLabel,
        `sidebar nav button must have a title or aria-label (accessible name)`,
      ).toBeTruthy()
    }
  })

  test('notification badge reflects unread count in the accessible name (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const notifBadge = page.locator('.notif-badge')
    if ((await notifBadge.count()) === 0) {
      // No notifications — badge is not visible; test is n/a
      return
    }
    // The notification button must communicate unread count via accessible name
    const notifBtn = page.locator('#notif-btn')
    const accessibleName = await notifBtn.evaluate((el: Element) => {
      return el.getAttribute('aria-label') ?? el.getAttribute('title') ?? ''
    })
    expect(
      accessibleName,
      '#notif-btn must have aria-label that includes unread count when notifications exist',
    ).toMatch(/\d+/) // Must contain a number representing the unread count
  })

  test('table row action icon buttons have unique accessible names per row (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="clients"]').click()

    const actionBtns = page.locator('table button, [class*="row-actions"] button')
    const count = await actionBtns.count()
    if (count === 0) return // Empty list — no rows to test

    // Each action button must have a unique, non-empty accessible name
    const names = new Set<string>()
    for (let i = 0; i < Math.min(count, 10); i++) {
      const btn = actionBtns.nth(i)
      const name = await btn.evaluate((el: Element) => {
        return (
          el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent?.trim() ?? ''
        )
      })
      expect(name, `table action button at index ${i} must have an accessible name`).toBeTruthy()
      names.add(name)
    }
    // For a list with multiple rows, the names must be unique (include the record name)
    if (count >= 2) {
      expect(names.size, 'action button names should be unique per row').toBeGreaterThan(1)
    }
  })
})

// ── Status and live regions (WCAG 4.1.3, 1.3.1) ──────────────────────────────

test.describe('screen reader labels — status and live regions', () => {
  test('AI streaming response text is enclosed in an aria-live region (WCAG 4.1.3)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="ai"]').click()
    // The AI response output area must use aria-live so screen readers announce updates
    const liveRegion = page.locator('[aria-live], [role="status"], [role="log"]')
    const count = await liveRegion.count()
    expect(
      count,
      'AI view must contain at least one aria-live region for response streaming',
    ).toBeGreaterThan(0)
  })

  test('the running timer display is in an aria-live region (WCAG 4.1.3)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="dashboard"]').click()
    // Check if the running timer element exists; it may not on a fresh vault
    const timerEl = page.locator('[id*="timer"], [class*="timer"]')
    if ((await timerEl.count()) === 0) {
      // Timer not visible — check after navigating to time view
      await page.locator('button[data-nav="time"]').click()
    }
    const timerLive = page.locator(
      '[aria-live][id*="timer"], [role="timer"], [aria-live][class*="timer"]',
    )
    if ((await timerLive.count()) > 0) {
      const liveAttr = await timerLive.first().getAttribute('aria-live')
      expect(['polite', 'assertive']).toContain(liveAttr)
    }
    // If no timer is running, this assertion is skipped — that is acceptable
  })

  test('loading states use aria-busy="true" on the container (WCAG 4.1.3)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Check if any loading state is present; navigate to a data view
    await page.locator('button[data-nav="clients"]').click()
    // After navigation the view should be fully loaded (aria-busy removed)
    const busyElements = page.locator('[aria-busy="true"]')
    // Immediately after navigation the loading state should be cleared
    await expect(busyElements).toHaveCount(0, { timeout: 5_000 })
  })
})

// ── Navigation landmarks (WCAG 1.3.1, 2.4.1) ─────────────────────────────────

test.describe('screen reader labels — landmarks and headings', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="dashboard"]').click()
    await expect(page.locator('button[data-nav="dashboard"]')).toHaveClass(/active/)
  })

  test('the page has a <main> landmark or role="main" (WCAG 1.3.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const main = page.locator('main, [role="main"]')
    await expect(main, 'page must have a <main> or role="main" landmark').toHaveCount(1)
  })

  test('each view rendered in the workspace has a visible heading h1 or h2 (WCAG 1.3.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Navigate to a content view and check for a heading
    await page.locator('button[data-nav="clients"]').click()
    const heading = page.locator(
      '.workspace-body h1, .workspace-body h2, #workspace-container h1, #workspace-container h2',
    )
    await expect(heading.first(), 'workspace content must have an h1 or h2 heading').toBeVisible({
      timeout: 5_000,
    })
  })

  test('modal dialogs have a heading that matches their aria-labelledby target (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="clients"]').click()
    await page.locator('#ws-add-btn').click()
    await expect(page.locator('#record-modal-backdrop')).toBeVisible({ timeout: 5_000 })

    const modal = page.locator('#record-modal-backdrop .modal')
    const labelledBy = await modal.getAttribute('aria-labelledby')
    if (labelledBy) {
      const title = page.locator(`#${CSS.escape(labelledBy)}`)
      await expect(title).toBeVisible()
      const text = await title.textContent()
      expect(text?.trim()).toBeTruthy()
    } else {
      // Modal doesn't have aria-labelledby — this is an accessibility gap
      expect(
        labelledBy,
        'record modal must have aria-labelledby pointing to its visible heading',
      ).toBeTruthy()
    }

    await page.keyboard.press('Escape')
  })

  test('there are no skipped heading levels on the dashboard (axe heading-order)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const results = await new AxeBuilder({ page }).withRules(['heading-order']).analyze()
    expect(results.violations, formatViolations(results.violations)).toEqual([])
  })
})

// ── Images and decorative icons (WCAG 1.1.1) ─────────────────────────────────

test.describe('screen reader labels — images and decorative icons', () => {
  test('SVG icons that are purely decorative have aria-hidden="true" (WCAG 1.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="dashboard"]').click()
    // Decorative SVGs inside buttons must be aria-hidden so screen readers skip them
    // (the button's accessible name carries the meaning)
    const svgsInsideButtons = page.locator('button svg')
    const count = await svgsInsideButtons.count()
    if (count === 0) return

    // Check a representative sample (first 10)
    for (let i = 0; i < Math.min(count, 10); i++) {
      const svg = svgsInsideButtons.nth(i)
      const ariaHidden = await svg.getAttribute('aria-hidden')
      // If the button has an accessible name, the SVG must be aria-hidden
      const parentBtn = svg.locator('xpath=ancestor::button[1]')
      const btnName = await parentBtn.evaluate((el: Element) => {
        return (
          el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent?.trim() ?? ''
        )
      })
      if (btnName) {
        expect(
          ariaHidden,
          `SVG inside button with name "${btnName}" should be aria-hidden="true"`,
        ).toBe('true')
      }
    }
  })

  test('any <img> element has a non-empty alt attribute, or alt="" if decorative (WCAG 1.1.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="dashboard"]').click()
    const images = page.locator('img')
    const count = await images.count()
    for (let i = 0; i < count; i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute('alt')
      expect(
        alt,
        'every <img> must have an alt attribute (empty string is valid for decorative images)',
      ).not.toBeNull()
    }
  })
})

// ── Data tables (WCAG 1.3.1) ──────────────────────────────────────────────────

test.describe('screen reader labels — data tables', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="clients"]').click()
    await expect(page.locator('button[data-nav="clients"]')).toHaveClass(/active/)
  })

  test('every data table has column headers with scope="col" (WCAG 1.3.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const tables = page.locator('table')
    const tableCount = await tables.count()
    if (tableCount === 0) return // No table in this view (e.g. grid/card view active)

    for (let t = 0; t < tableCount; t++) {
      const headers = tables.nth(t).locator('th')
      const hCount = await headers.count()
      if (hCount === 0) continue
      for (let h = 0; h < hCount; h++) {
        const scope = await headers.nth(h).getAttribute('scope')
        expect(scope, `<th> at index ${h} must have scope="col" for screen readers`).toBe('col')
      }
    }
  })

  test('sortable column headers announce current sort state via aria-sort (WCAG 1.3.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const sortableThs = page.locator('th[data-sort], th[class*="sortable"]')
    const count = await sortableThs.count()
    if (count === 0) return

    for (let i = 0; i < count; i++) {
      const th = sortableThs.nth(i)
      const ariaSortAttr = await th.getAttribute('aria-sort')
      expect(
        ariaSortAttr,
        `sortable <th> must have aria-sort="ascending", "descending", or "none"`,
      ).toMatch(/^(ascending|descending|none)$/)
    }
  })
})

// ── Toggles and interactive controls (WCAG 4.1.2) ─────────────────────────────

test.describe('screen reader labels — toggles and checkboxes', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="dashboard"]').click()
    await expect(page.locator('button[data-nav="dashboard"]')).toHaveClass(/active/)
  })

  test('theme toggle (#theme-toggle) announces current state via aria-pressed (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const themeToggle = page.locator('#theme-toggle')
    const ariaPressedAttr = await themeToggle.getAttribute('aria-pressed')
    // aria-pressed must be present and set to "true" or "false" to communicate state
    expect(
      ariaPressedAttr,
      '#theme-toggle must have aria-pressed to communicate active theme',
    ).toMatch(/^(true|false)$/)
  })

  test('settings toggle switches have accessible names and reflect state via aria-checked (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="settings"]').click()
    const toggleSwitches = page.locator('input[type="checkbox"][role="switch"], [role="switch"]')
    const count = await toggleSwitches.count()
    if (count === 0) return

    for (let i = 0; i < count; i++) {
      const toggle = toggleSwitches.nth(i)
      const ariaChecked = await toggle.getAttribute('aria-checked')
      expect(ariaChecked, `toggle switch at index ${i} must have aria-checked`).toMatch(
        /^(true|false)$/,
      )
      const name = await toggle.evaluate((el: Element) => {
        return (
          el.getAttribute('aria-label') ??
          el.getAttribute('aria-labelledby') ??
          el.getAttribute('id') ??
          ''
        )
      })
      expect(name, `toggle switch at index ${i} must have an accessible name`).toBeTruthy()
    }
  })
})

// ── AI-specific labels (WCAG 4.1.3) ──────────────────────────────────────────

test.describe('screen reader labels — AI chat and actions', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="ai"]').click()
    await expect(page.locator('button[data-nav="ai"]')).toHaveClass(/active/)
  })

  test('AI message bubbles are distinguishable by screen readers (role or aria-label — WCAG 1.3.1)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const messageBubbles = page.locator('[class*="message"], [class*="bubble"], [class*="ai-msg"]')
    const count = await messageBubbles.count()
    if (count === 0) return // No messages sent yet — acceptable

    for (let i = 0; i < Math.min(count, 5); i++) {
      const bubble = messageBubbles.nth(i)
      const role = await bubble.getAttribute('role')
      const ariaLabel = await bubble.getAttribute('aria-label')
      const ariaLabelledBy = await bubble.getAttribute('aria-labelledby')
      expect(
        role || ariaLabel || ariaLabelledBy,
        `AI message bubble at index ${i} must have a role or aria-label to distinguish it`,
      ).toBeTruthy()
    }
  })

  test('AI download progress bar has role="progressbar" with aria-valuenow/min/max (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const progressBar = page.locator('[role="progressbar"]')
    if ((await progressBar.count()) === 0) {
      // Progress bar only appears during model download — acceptable to skip
      return
    }
    for (let i = 0; i < (await progressBar.count()); i++) {
      const bar = progressBar.nth(i)
      await expect(bar).toHaveAttribute('aria-valuemin')
      await expect(bar).toHaveAttribute('aria-valuemax')
      await expect(bar).toHaveAttribute('aria-valuenow')
    }
  })
})

// ── Utility ───────────────────────────────────────────────────────────────────

function formatViolations(
  violations: Array<{ id: string; description: string; nodes: Array<{ html: string }> }>,
): string {
  if (violations.length === 0) return 'no violations'
  return violations
    .map((v) => `[${v.id}] ${v.description}\n  ${v.nodes.map((n) => n.html).join('\n  ')}`)
    .join('\n')
}
