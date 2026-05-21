/// <reference types="node" />
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '../../')
const otAIConnectSrc = (process.env.OT_AI_CONNECT_SRC ?? '').trim()

export default defineConfig({
  root: __dirname,
  plugins: [
    {
      name: 'taskapp-ot-ai-csp',
      transformIndexHtml(html) {
        return html.replace('{{OT_AI_CONNECT_SRC}}', otAIConnectSrc)
      },
    },
    viteSingleFile(),
  ],
  define: {
    __OT_AI_CONNECT_SRC__: JSON.stringify(otAIConnectSrc),
    __OT_ONLY_BUILD__: 'true',
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    outDir: '../../dist/offline',
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      { find: '@core', replacement: resolve(repoRoot, 'packages/core/src') },
      { find: '@adapter-null', replacement: resolve(repoRoot, 'packages/adapter-null/src') },
      { find: '@config', replacement: resolve(repoRoot, 'config') },
      {
        find: '@huggingface/transformers',
        replacement: resolve(
          repoRoot,
          'packages/core/src/ai/providers/browser-transformers-disabled.ts',
        ),
      },
      {
        find: './providers/browser-transformers.js',
        replacement: resolve(repoRoot, 'packages/core/src/ai/providers/browser-ai-disabled.ts'),
      },
      {
        find: './providers/anthropic.js',
        replacement: resolve(repoRoot, 'packages/core/src/ai/providers/cloud-disabled.ts'),
      },
      {
        find: './providers/openai.js',
        replacement: resolve(repoRoot, 'packages/core/src/ai/providers/cloud-disabled.ts'),
      },
      {
        find: './providers/google.js',
        replacement: resolve(repoRoot, 'packages/core/src/ai/providers/cloud-disabled.ts'),
      },
    ],
  },
})
