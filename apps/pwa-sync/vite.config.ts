/// <reference types="node" />
import { defineConfig } from 'vite'
import type { Alias } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { baseConfig } from '../../config/vite/base.config.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const base = baseConfig()

export default defineConfig({
  root: __dirname,
  plugins: [...((base.plugins ?? []) as NonNullable<(typeof base)['plugins']>)],
  define: {
    __OT_ONLY_BUILD__: 'false',
  },
  build: {
    ...base.build,
    outDir: '../../dist/sync',
    emptyOutDir: true,
  },
  resolve: {
    alias: [...((base.resolve?.alias ?? []) as Alias[])],
  },
})
