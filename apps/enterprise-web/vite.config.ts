/// <reference types="node" />
import { defineConfig } from 'vite'
import type { Alias } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '../../')

const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')) as {
  version: string
}
const appVersion: string = rootPkg.version

// Enterprise build — standard hashed assets, NOT single-file.
// Served over HTTPS by the Hono server (or a reverse proxy) alongside the API.
// CSP is enforced via HTTP response headers, not a meta tag.
export default defineConfig({
  root: __dirname,
  publicDir: 'public',
  define: {
    __OT_ONLY_BUILD__: 'false',
    __OFFLINE_FS__: 'false',
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  esbuild: {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  },
  build: {
    target: 'esnext',
    outDir: '../../dist/enterprise',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        // Content-hashed filenames for long-term cache busting
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: (id) => {
          if (id.includes('node_modules/valibot')) return 'vendor-valibot'
          if (id.includes('node_modules/dompurify')) return 'vendor-dompurify'
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: '@core', replacement: resolve(repoRoot, 'packages/core/src') },
      { find: '@adapter-rxdb', replacement: resolve(repoRoot, 'packages/adapter-rxdb/src') },
      { find: '@config', replacement: resolve(repoRoot, 'config') },
    ] as Alias[],
  },
})
