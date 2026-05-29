import type { UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { viteAliases } from '../aliases.js'

/** Shared Vite options inherited by every app build config. */
export function baseConfig(): UserConfig {
  return {
    // `react()` must precede `viteSingleFile()` so `.tsx` is transformed to JS
    // before the single-file plugin inlines the bundle. On Vite 8 / Rolldown,
    // `@vitejs/plugin-react` v6 drives the JSX automatic runtime + Oxc Fast
    // Refresh (dev only); `@vitejs/plugin-react-oxc` is deprecated and merged in.
    plugins: [react(), viteSingleFile()],
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
