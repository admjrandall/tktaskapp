/**
 * Canonical path alias definitions shared by Vite and Vitest.
 *
 * KEEP IN SYNC with tsconfig.json compilerOptions.paths.
 * TypeScript cannot import from this file at type-check time, so tsconfig.json
 * paths must be maintained manually to match these aliases.
 */
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import type { Alias } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Repo root — config/aliases.ts lives one level below the root. */
const repoRoot = resolve(__dirname, '..')

/**
 * Vite/Vitest resolve.alias entries for all monorepo path aliases.
 * Use string `find` values (not RegExp) — Vite handles prefix matching.
 */
export const viteAliases: Alias[] = [
  { find: '@core', replacement: resolve(repoRoot, 'packages/core/src') },
  { find: '@adapter-null', replacement: resolve(repoRoot, 'packages/adapter-null/src') },
  { find: '@adapter-rxdb', replacement: resolve(repoRoot, 'packages/adapter-rxdb/src') },
  {
    find: '@adapter-rxdb-couchdb',
    replacement: resolve(repoRoot, 'packages/adapter-rxdb-couchdb/src'),
  },
  { find: '@adapter-dataverse', replacement: resolve(repoRoot, 'packages/adapter-dataverse/src') },
  {
    find: '@adapter-mobile-native',
    replacement: resolve(repoRoot, 'packages/adapter-mobile-native/src'),
  },
  { find: '@adapter-kms', replacement: resolve(repoRoot, 'packages/adapter-kms/src') },
  { find: '@config', replacement: resolve(repoRoot, 'config') },
]
