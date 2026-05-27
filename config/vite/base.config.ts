import type { UserConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { viteAliases } from '../aliases.js'

/** Shared Vite options inherited by every app build config. */
export function baseConfig(): UserConfig {
  return {
    plugins: [viteSingleFile()],
    esbuild: {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    },
    build: {
      target: 'esnext',
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
    },
    resolve: {
      alias: viteAliases,
    },
  }
}
