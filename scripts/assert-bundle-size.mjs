// Bundle size budgets — update these if you deliberately grow the bundle.
// Current measured sizes (2026-05-19, browser-ai profile, after Phase 4):
//   raw:  372707 bytes  ← OVER the 320000 budget by 52707 bytes
//   gzip: 100653 bytes  ← OVER the 95000 budget by 5653 bytes
//
// The raw overage (~52 KB) predates Phase 4 and is tracked from Phase 3.
// The gzip overage (~5.6 KB) appeared in Phase 4 (valibot 1.4.0 + 9 schema files).
// Run vite-bundle-visualizer before shrinking:
//   node_modules/.bin/vite-bundle-visualizer  (add as devDep to apps/offline-web if needed)
// Do NOT reduce the budget or fix the overage without discussing with the team first.

import { readFileSync } from 'fs'
import { gzipSync } from 'zlib'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const PROFILES = [
  {
    name: 'offline-no-ai',
    path: resolve(root, 'dist/offline-no-ai/index.html'),
    maxRaw: 300_000,
    maxGzip: 90_000,
  },
  {
    name: 'offline-browser-ai',
    path: resolve(root, 'dist/offline/index.html'),
    maxRaw: 320_000,
    maxGzip: 95_000,
  },
  {
    name: 'offline-internal-ai',
    path: resolve(root, 'dist/offline-internal-ai/index.html'),
    maxRaw: 320_000,
    maxGzip: 95_000,
  },
]

let failed = false

for (const profile of PROFILES) {
  let content
  try {
    content = readFileSync(profile.path)
  } catch {
    // Artifact not built — skip without failing (only assert what exists)
    console.log(`⏭  ${profile.name}: artifact not found at ${profile.path} — skipped`)
    continue
  }

  const rawBytes = content.length
  const gzipBytes = gzipSync(content).length
  const rawOk = rawBytes <= profile.maxRaw
  const gzipOk = gzipBytes <= profile.maxGzip

  const rawStatus = rawOk ? '✅' : '❌'
  const gzipStatus = gzipOk ? '✅' : '❌'

  console.log(`${rawStatus}${gzipStatus} ${profile.name}`)
  console.log(`   raw:  ${rawBytes.toLocaleString()} bytes (budget ${profile.maxRaw.toLocaleString()})`)
  console.log(`   gzip: ${gzipBytes.toLocaleString()} bytes (budget ${profile.maxGzip.toLocaleString()})`)

  if (!rawOk) {
    console.error(
      `   RAW OVER BUDGET by ${(rawBytes - profile.maxRaw).toLocaleString()} bytes`,
    )
    failed = true
  }
  if (!gzipOk) {
    console.error(
      `   GZIP OVER BUDGET by ${(gzipBytes - profile.maxGzip).toLocaleString()} bytes`,
    )
    failed = true
  }
}

if (failed) {
  console.error('\n❌ Bundle size check FAILED — see above for details.')
  process.exit(1)
} else {
  console.log('\n✅ All bundle size checks passed.')
}
