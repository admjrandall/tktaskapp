/// <reference types="node" />
import { defineConfig } from 'vite'
import type { Alias } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '../../')

// Mobile PWA build — NOT single-file; service worker + manifest must stay separate.
export default defineConfig({
  root: __dirname,
  publicDir: 'public',
  define: {
    __OT_ONLY_BUILD__: 'false',
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },
  build: {
    target: 'esnext',
    outDir: '../../dist/mobile',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  resolve: {
    alias: [
      { find: '@core', replacement: resolve(repoRoot, 'packages/core/src') },
      { find: '@adapter-null', replacement: resolve(repoRoot, 'packages/adapter-null/src') },
      { find: '@config', replacement: resolve(repoRoot, 'config') },
    ] as Alias[],
  },
})
