/// <reference types="node" />
import { defineConfig } from 'vite'
import type { Alias } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'
import { baseConfig } from '../../config/vite/base.config.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '../../')
const otAIConnectSrc = (process.env.OT_AI_CONNECT_SRC ?? '').trim()

const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')) as {
  version: string
}
const appVersion: string = rootPkg.version

const base = baseConfig()

export default defineConfig({
  root: __dirname,
  plugins: [
    {
      name: 'taskapp-build-vars',
      transformIndexHtml(html) {
        return html
          .replace('{{OT_AI_CONNECT_SRC}}', otAIConnectSrc)
          .replace('{{APP_VERSION}}', appVersion)
      },
    },
    ...((base.plugins ?? []) as NonNullable<(typeof base)['plugins']>),
  ],
  define: {
    __OT_AI_CONNECT_SRC__: JSON.stringify(otAIConnectSrc),
    __OT_ONLY_BUILD__: 'true',
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    ...base.build,
    outDir: '../../dist/offline',
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      ...((base.resolve?.alias ?? []) as Alias[]),
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
