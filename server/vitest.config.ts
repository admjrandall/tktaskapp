import { defineProject } from 'vitest/config'
import { sharedConfig } from '../vitest.shared'

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    ...sharedConfig,
    include: ['**/*.test.ts'],
    passWithNoTests: true,
  },
})
