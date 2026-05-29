import { defineConfig } from 'vitest/config'
import { viteAliases } from './config/aliases.js'
import { sharedConfig } from './vitest.shared'

export default defineConfig({
  test: {
    ...sharedConfig,
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
    // test.projects: each entry is a vitest.config.ts for a package/app/workspace.
    // Individual project configs must use defineProject (not defineConfig) to avoid
    // circular project references. Coverage is configured here at root only.
    projects: [
      'tests/vitest.config.ts',
      'tests/react/vitest.config.ts',
      'packages/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'server/vitest.config.ts',
    ],
  },
  resolve: {
    alias: viteAliases,
  },
})
