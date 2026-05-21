// Shared Playwright auth helper.
// Creates a fresh vault (first-run mode — fresh IndexedDB) and waits for
// the sidebar to appear.  PBKDF2 at 600k iterations takes 2–5 s in Chromium,
// so the 30 s timeout on waitForSelector('#sidebar') is intentional.

import type { Page } from '@playwright/test'
import { APP_FILE } from '../../../playwright.config.js'

export { APP_FILE }

export const TEST_PASSWORD = 'Accessibility_E2E_2026!'

export async function createVaultAndUnlock(page: Page): Promise<void> {
  await page.goto(APP_FILE)
  await page.waitForSelector('#auth-password', { timeout: 15_000 })
  await page.fill('#auth-password', TEST_PASSWORD)
  // #auth-confirm only present on first run (fresh browser context → empty IndexedDB)
  const confirm = page.locator('#auth-confirm')
  if ((await confirm.count()) > 0) {
    await confirm.fill(TEST_PASSWORD)
  }
  await page.click('#auth-submit')
  await page.waitForSelector('#sidebar', { timeout: 30_000 })
}
