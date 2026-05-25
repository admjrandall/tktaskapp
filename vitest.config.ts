import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 30_000,
    include: ['tests/**/*.ts'],
    exclude: [
      '**/node_modules/**',
      'tests/adapters/adapter-contract.ts',
      'tests/adapters/kms-mock.ts',
      'tests/adapters/mock-mobile-adapters.ts',
      // Playwright E2E tests run via pnpm exec playwright test, not vitest.
      'tests/e2e/**',
    ],
    coverage: {
      provider: 'istanbul',
      include: [
        'server/src/**/*.ts',
        'packages/core/src/security/**/*.ts',
        'packages/core/src/storage/**/*.ts',
      ],
      exclude: ['**/*.d.ts', '**/node_modules/**', 'server/src/db/schema/**'],
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'packages/core/src'),
      '@config': resolve(__dirname, 'config'),
      '@adapter-null': resolve(__dirname, 'packages/adapter-null/src'),
      '@adapter-rxdb': resolve(__dirname, 'packages/adapter-rxdb/src'),
      '@adapter-dataverse': resolve(__dirname, 'packages/adapter-dataverse/src'),
      '@adapter-mobile-native': resolve(__dirname, 'packages/adapter-mobile-native/src'),
    },
  },
})
