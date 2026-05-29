import { defineProject } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { sharedConfig } from '../vitest.shared'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

export default defineProject({
  test: {
    name: 'root-tests',
    environment: 'node',
    ...sharedConfig,
    include: ['**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      'adapters/adapter-contract.ts',
      'adapters/kms-mock.ts',
      'adapters/mock-mobile-adapters.ts',
      'e2e/**',
      // .tsx component tests run under the react-components jsdom project
      '**/*.test.tsx',
    ],
  },
  resolve: {
    alias: {
      '@core': resolve(root, 'packages/core/src'),
      '@config': resolve(root, 'config'),
      '@adapter-null': resolve(root, 'packages/adapter-null/src'),
      '@adapter-rxdb': resolve(root, 'packages/adapter-rxdb/src'),
      '@adapter-dataverse': resolve(root, 'packages/adapter-dataverse/src'),
      '@adapter-mobile-native': resolve(root, 'packages/adapter-mobile-native/src'),
    },
  },
})
