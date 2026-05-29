import { defineProject } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

export default defineProject({
  plugins: [react()],
  test: {
    name: 'react-components',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./setup.ts'],
    include: ['**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@core': resolve(root, 'packages/core/src'),
      '@config': resolve(root, 'config'),
    },
  },
})
