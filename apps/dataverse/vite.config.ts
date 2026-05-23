/// <reference types="node" />
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  root: __dirname,
  build: {
    // Code Apps target Edge/Chromium on Power Platform — esnext is safe
    target: 'esnext',
    outDir: '../../dist/dataverse',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split vendor so the platform CDN can cache React/valibot separately
        manualChunks: (id) => {
          if (id.includes('node_modules/valibot')) return 'valibot'
          if (id.includes('node_modules/dompurify')) return 'dompurify'
        },
        // Power Platform web resource naming: flat, no hash for stable deploy
        entryFileNames: 'entry.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  define: {
    // Dataverse build: not OT-only, lockdown handled by DATAVERSE_DEPLOYMENT_POLICY
    __OT_ONLY_BUILD__: 'false',
    // Disable offline-only FS persistence (File System Access API not available in Code Apps)
    __OFFLINE_FS__: 'false',
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, '../../packages/core/src'),
      '@adapter-dataverse': resolve(__dirname, '../../packages/adapter-dataverse/src'),
    },
  },
})
