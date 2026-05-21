import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import type { UserConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '../../')

/** Shared Vite options inherited by every app build config. */
export function baseConfig(): UserConfig {
  return {
    plugins: [viteSingleFile()],
    build: {
      target: 'esnext',
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
    },
    resolve: {
      alias: [
        { find: '@core', replacement: resolve(repoRoot, 'packages/core/src') },
        { find: '@adapter-null', replacement: resolve(repoRoot, 'packages/adapter-null/src') },
        { find: '@config', replacement: resolve(repoRoot, 'config') },
      ],
    },
  }
}
