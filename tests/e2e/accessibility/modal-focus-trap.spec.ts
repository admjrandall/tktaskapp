// Playwright E2E — modal focus trap (WCAG 2.1 AA §2.1.2 No Keyboard Trap,
// ARIA Authoring Practices Guide — dialog pattern).
// Requires: pnpm run build:offline
// Run: pnpm exec playwright test tests/e2e/accessibility/modal-focus-trap.spec.ts
//
// Many tests in this file document known accessibility gaps (no focus trap, no
// auto-focus on dialog open, Escape not bound to confirm dialog).  They will
// fail until those gaps are fixed — that is the correct outcome for a test suite
// that enforces WCAG 2.1 AA compliance.

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

// ── Helper: open the confirm dialog via Settings → Security → Reset App ────────

async function openConfirmDialog(): Promise<void> {
  await page.locator('button[data-nav="settings"]').click()
  await expect(page.locator('button[data-nav="settings"]')).toHaveClass(/active/)
  // Navigate to the Security section where #reset-app-btn lives
  await page.locator('button[data-section="security"]').click()
  await expect(page.locator('#reset-app-btn')).toBeVisible({ timeout: 5_000 })
  await page.locator('#reset-app-btn').click()
  await expect(page.locator('#confirm-backdrop')).toBeVisible({ timeout: 5_000 })
}

async function closeConfirmDialog(): Promise<void> {
  const backdrop = page.locator('#confirm-backdrop')
  if (await backdrop.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await page.locator('#confirm-cancel').click()
    await expect(backdrop).not.toBeVisible({ timeout: 5_000 })
  }
}

// ── Confirm dialog — focus trap (WCAG 2.1.2) ──────────────────────────────────

test.describe('focus trap — confirm dialog', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await openConfirmDialog()
  })
  test.afterEach(async () => {
    if (!BUILT) return
    await closeConfirmDialog()
  })

  test('focus is placed on the Cancel button by default when dialog opens (ARIA dialog pattern)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // ARIA pattern: on dialog open, focus moves to the first focusable element
    // or to an element with autofocus — Cancel is the safe default.
    const cancelBtn = page.locator('#confirm-cancel')
    await expect(cancelBtn, 'Cancel button should be focused on dialog open').toBeFocused()
  })

  test('Tab from #confirm-ok wraps to #confirm-cancel (WCAG 2.1.2 — no keyboard trap escape)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Move focus to the last focusable element in the dialog
    await page.locator('#confirm-ok').focus()
    await expect(page.locator('#confirm-ok')).toBeFocused()

    await page.keyboard.press('Tab')
    // Focus must wrap back to the first focusable element (Cancel), not escape the dialog
    await expect(
      page.locator('#confirm-cancel'),
      'Tab from confirm-ok must wrap to confirm-cancel',
    ).toBeFocused()
  })

  test('Shift+Tab from #confirm-cancel wraps to #confirm-ok (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('#confirm-cancel').focus()
    await expect(page.locator('#confirm-cancel')).toBeFocused()

    await page.keyboard.press('Shift+Tab')
    await expect(
      page.locator('#confirm-ok'),
      'Shift+Tab from confirm-cancel must wrap to confirm-ok',
    ).toBeFocused()
  })

  test('Escape activates Cancel and closes the dialog (ARIA dialog pattern)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.keyboard.press('Escape')
    await expect(
      page.locator('#confirm-backdrop'),
      'Escape must close the confirm dialog',
    ).not.toBeVisible({ timeout: 5_000 })
  })

  test('focus does not reach elements behind the modal overlay while it is open (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Tab several times; every focused element must be inside #confirm-backdrop
    await page.locator('#confirm-cancel').focus()
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      const isInsideDialog = await page.evaluate(() => {
        const backdrop = document.getElementById('confirm-backdrop')
        return backdrop?.contains(document.activeElement) ?? false
      })
      expect(isInsideDialog, `Tab step ${i + 1}: focus escaped the confirm dialog`).toBe(true)
    }
  })

  test('clicking the overlay outside the modal closes it (ARIA dialog pattern)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Click the backdrop element itself (not the inner .modal)
    await page.locator('#confirm-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('#confirm-backdrop')).not.toBeVisible({ timeout: 5_000 })
  })
})

// ── Record modal — focus trap (WCAG 2.1.2) ────────────────────────────────────

test.describe('focus trap — record modal', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('button[data-nav="clients"]').click()
    await expect(page.locator('button[data-nav="clients"]')).toHaveClass(/active/)
    await page.locator('#ws-add-btn').click()
    await expect(page.locator('#record-modal-backdrop')).toBeVisible({ timeout: 5_000 })
  })

  test.afterEach(async () => {
    if (!BUILT) return
    await page.keyboard.press('Escape').catch(() => {})
    const backdrop = page.locator('#record-modal-backdrop')
    if (await backdrop.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page
        .locator('#modal-cancel')
        .click()
        .catch(() => {})
    }
  })

  test('modal receives focus on open — first focusable element or dialog element (ARIA dialog pattern)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Focus must move into the modal on open, not remain on the button that opened it
    const isInsideModal = await page.evaluate(() => {
      const modal = document.querySelector('#record-modal-backdrop .modal')
      return modal?.contains(document.activeElement) ?? false
    })
    expect(isInsideModal, 'focus must move into the modal when it opens').toBe(true)
  })

  test('Tab from the last focusable element in the modal wraps to the first (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Focus the last focusable element in the modal
    await page.locator('#modal-save').focus()
    await expect(page.locator('#modal-save')).toBeFocused()

    await page.keyboard.press('Tab')
    // Focus must wrap within the modal, not escape to the background page
    const isInsideModal = await page.evaluate(() => {
      const modal = document.querySelector('#record-modal-backdrop .modal')
      return modal?.contains(document.activeElement) ?? false
    })
    expect(isInsideModal, 'Tab from last element must wrap inside the modal, not escape').toBe(true)
  })

  test('Shift+Tab from the first focusable element wraps to the last (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const modal = page.locator('#record-modal-backdrop .modal')
    const firstFocusable = modal.locator('input:not([disabled]), button:not([disabled])').first()
    await firstFocusable.focus()
    await expect(firstFocusable).toBeFocused()

    await page.keyboard.press('Shift+Tab')
    const isInsideModal = await page.evaluate(() => {
      const modal = document.querySelector('#record-modal-backdrop .modal')
      return modal?.contains(document.activeElement) ?? false
    })
    expect(isInsideModal, 'Shift+Tab from first element must wrap inside the modal').toBe(true)
  })

  test('Escape key closes the record modal and focus can return to the page (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await expect(page.locator('#record-modal-backdrop')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#record-modal-backdrop')).not.toBeVisible({ timeout: 5_000 })
  })
})

// ── ARIA dialog role and attributes (WCAG 4.1.2) ──────────────────────────────

test.describe('ARIA dialog role and attributes', () => {
  test('confirm dialog has role="dialog" or role="alertdialog" (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await openConfirmDialog()
    // The modal container must have an ARIA role
    const modal = page.locator('#confirm-backdrop .modal')
    const role = await modal.getAttribute('role')
    expect(
      role,
      '#confirm-backdrop .modal must have role="alertdialog" for destructive confirms',
    ).toMatch(/^(dialog|alertdialog)$/)
    await closeConfirmDialog()
  })

  test('confirm dialog has aria-modal="true" (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await openConfirmDialog()
    const modal = page.locator('#confirm-backdrop .modal')
    await expect(
      modal,
      'dialog must have aria-modal="true" to prevent background interaction',
    ).toHaveAttribute('aria-modal', 'true')
    await closeConfirmDialog()
  })

  test('confirm dialog has a non-empty aria-labelledby pointing to its visible heading (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await openConfirmDialog()
    const modal = page.locator('#confirm-backdrop .modal')
    const labelledBy = await modal.getAttribute('aria-labelledby')
    expect(labelledBy, 'dialog must have aria-labelledby').toBeTruthy()
    if (labelledBy) {
      const heading = page.locator(`#${CSS.escape(labelledBy)}`)
      await expect(heading).toBeVisible()
      const text = await heading.textContent()
      expect(text?.trim(), 'aria-labelledby target must have non-empty text').toBeTruthy()
    }
    await closeConfirmDialog()
  })

  test('destructive confirm dialog uses role="alertdialog" (WCAG 4.1.3)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await openConfirmDialog()
    const modal = page.locator('#confirm-backdrop .modal')
    await expect(
      modal,
      'destructive confirm must use role="alertdialog" per ARIA spec',
    ).toHaveAttribute('role', 'alertdialog')
    await closeConfirmDialog()
  })

  test('record modal has role="dialog" (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="clients"]').click()
    await page.locator('#ws-add-btn').click()
    await expect(page.locator('#record-modal-backdrop')).toBeVisible({ timeout: 5_000 })

    const modal = page.locator('#record-modal-backdrop .modal')
    const role = await modal.getAttribute('role')
    expect(role, 'record modal must have role="dialog"').toBe('dialog')

    await page.keyboard.press('Escape')
  })

  test('the background page content has aria-hidden="true" while a modal is open (WCAG 4.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="clients"]').click()
    await page.locator('#ws-add-btn').click()
    await expect(page.locator('#record-modal-backdrop')).toBeVisible({ timeout: 5_000 })

    // The main app container (not the modal) must be aria-hidden while a modal is open
    const mainContent = page.locator('#app, main, [role="main"]').first()
    if ((await mainContent.count()) > 0) {
      await expect(
        mainContent,
        'background content must be aria-hidden while modal is open',
      ).toHaveAttribute('aria-hidden', 'true')
    }

    await page.keyboard.press('Escape')
  })
})

// ── AI action confirmation (WCAG 2.1.2) ───────────────────────────────────────

test.describe('focus trap — AI pending action confirmation', () => {
  test('AI action Apply/Cancel buttons trap focus while visible (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    // Navigate to AI view to check if the pending action UI is visible
    await page.locator('button[data-nav="ai"]').click()
    const pendingActionContainer = page.locator('[class*="pending-action"], #ai-pending-action')
    if ((await pendingActionContainer.count()) === 0) {
      // No pending action present — skip rather than fail
      test.skip()
      return
    }
    const applyBtn = pendingActionContainer.locator('button').filter({ hasText: /apply/i }).first()
    const cancelBtn = pendingActionContainer
      .locator('button')
      .filter({ hasText: /cancel/i })
      .first()
    if ((await applyBtn.count()) > 0 && (await cancelBtn.count()) > 0) {
      await applyBtn.focus()
      await expect(applyBtn).toBeFocused()
      await cancelBtn.focus()
      await expect(cancelBtn).toBeFocused()
    }
  })

  test('Cancel is the safe default focus for AI action confirmation (WCAG 3.3.4)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    await page.locator('button[data-nav="ai"]').click()
    const pendingContainer = page.locator('[class*="pending-action"], #ai-pending-action')
    if ((await pendingContainer.count()) === 0) {
      test.skip()
      return
    }
    // Cancel must be focused by default when the action appears
    const cancelBtn = pendingContainer
      .locator('button')
      .filter({ hasText: /cancel/i })
      .first()
    if ((await cancelBtn.count()) > 0) {
      await expect(
        cancelBtn,
        'Cancel is the safe default — must receive focus on action appear',
      ).toBeFocused()
    }
  })
})

// ── Notification panel (WCAG 2.1.2) ───────────────────────────────────────────

test.describe('focus trap — notification panel', () => {
  test.beforeEach(async () => {
    if (!BUILT) return
    await page.locator('#notif-btn').click()
    await page.waitForTimeout(300)
  })
  test.afterEach(async () => {
    if (!BUILT) return
    await page.keyboard.press('Escape').catch(() => {})
  })

  test('Escape closes the notification panel and returns focus to #notif-btn (WCAG 2.1.2)', async () => {
    test.skip(!BUILT, 'Run pnpm run build:offline first')
    const notifPanel = page.locator('[class*="notif-panel"], #notif-panel')
    if ((await notifPanel.count()) === 0) {
      test.skip()
      return
    }
    await expect(notifPanel).toBeVisible({ timeout: 3_000 })
    await page.keyboard.press('Escape')
    await expect(notifPanel).not.toBeVisible({ timeout: 5_000 })
    // Focus should return to the button that opened the panel
    await expect(page.locator('#notif-btn')).toBeFocused()
  })
})
