// Playwright configuration — accessibility (WCAG 2.1 AA) end-to-end tests.
// Tests run against the pre-built dist/offline/index.html.
// Run `pnpm run build:offline` before running these tests.
// Run tests: pnpm exec playwright test
// Run with UI: pnpm exec playwright test --ui

import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'path'

// Absolute file:// URL for the built offline app.
// On Windows: file:///d:/techkeycrmapp/dist/offline/index.html
const APP_FILE = `file:///${resolve('dist/offline/index.html').replace(/\\/g, '/')}`

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.{test,spec}.ts',

  // Each test gets its own isolated browser context (fresh IndexedDB).
  // The auth setup in beforeAll creates a vault for each suite.
  fullyParallel: false,
  workers: 1,

  // Generous timeout: PBKDF2 at 600 k iterations takes 2-5 s in Chromium.
  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    // file:// protocol — no base URL needed; each test navigates directly.
    headless: true,
    browserName: 'chromium',
    ...devices['Desktop Chrome'],

    // Expose APP_FILE path to tests via a custom property on the worker fixture.
    // Tests import APP_FILE from this config directly.
  },

  projects: [
    {
      name: 'accessibility',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

// Re-export constants that test files import.
export { APP_FILE }
