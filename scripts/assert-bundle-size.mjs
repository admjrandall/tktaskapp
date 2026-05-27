// Last measured bundle sizes — update this comment after offline profile builds.
// offline-browser-ai:  raw 475,932 B (~465 kB)  gzip 128,422 B (~125 kB)  (as of 2026-05-25)
// offline-no-ai:       raw 342,572 B (~335 kB)  gzip 92,679 B  (~91 kB)   (as of 2026-05-25)
// offline-internal-ai: raw 478,719 B (~468 kB)  gzip 129,288 B (~126 kB)  (as of 2026-05-25)
//
// Bundle size budgets — update these only for deliberate, reviewed growth.
// Run the analyser to identify top contributors before shrinking:
//   pnpm --filter @tktaskapp/offline-web run perf:analyse
// Budgets below are hard gates against future growth. The no-AI profile budget was
// established after verifying provider code was absent from the artifact; the
// internal profile budget is aligned with browser-ai plus private endpoint support.

import { readFileSync } from 'fs'
import { gzipSync } from 'zlib'
import { resolve, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const rel = (p) => relative(root, p)

const PROFILES = [
  {
    name: 'offline-no-ai',
    path: resolve(root, 'dist/offline-no-ai/index.html'),
    maxRaw: 350_000,
    maxGzip: 95_000,
  },
  {
    name: 'offline-browser-ai',
    path: resolve(root, 'dist/offline/index.html'),
    // Budget raised from 470 KB / 125 KB to 480 KB / 130 KB for the
    // 2026-05-23 production-readiness remediation: explicit Trusted Types
    // helpers, offline master-password screening, and security gate evidence.
    // Run perf:analyse before attempting to reduce:
    //   pnpm --filter @tktaskapp/offline-web run perf:analyse
    maxRaw: 480_000,
    maxGzip: 130_000,
  },
  {
    name: 'offline-internal-ai',
    path: resolve(root, 'dist/offline-internal-ai/index.html'),
    maxRaw: 485_000,
    maxGzip: 132_000,
  },
]

let failed = false

for (const profile of PROFILES) {
  let content
  try {
    content = readFileSync(profile.path)
  } catch {
    // Artifact not built — skip without failing (only assert what exists)
    console.log('⏭  ' + profile.name + ': artifact not found at ' + rel(profile.path) + ' — skipped')
    continue
  }

  const rawBytes = content.length
  const gzipBytes = gzipSync(content).length
  const rawOk = rawBytes <= profile.maxRaw
  const gzipOk = gzipBytes <= profile.maxGzip

  const rawStatus = rawOk ? '✅' : '❌'
  const gzipStatus = gzipOk ? '✅' : '❌'

  const statusLine = rawStatus + gzipStatus + ' ' + profile.name
  const rawLine = '   raw:  ' + rawBytes.toLocaleString() + ' bytes (budget ' + profile.maxRaw.toLocaleString() + ')'
  const gzipLine = '   gzip: ' + gzipBytes.toLocaleString() + ' bytes (budget ' + profile.maxGzip.toLocaleString() + ')'
  console.log(statusLine)
  console.log(rawLine)
  console.log(gzipLine)

  if (!rawOk) {
    console.error('   RAW OVER BUDGET by ' + (rawBytes - profile.maxRaw).toLocaleString() + ' bytes')
    failed = true
  }
  if (!gzipOk) {
    console.error('   GZIP OVER BUDGET by ' + (gzipBytes - profile.maxGzip).toLocaleString() + ' bytes')
    failed = true
  }
}

if (failed) {
  console.error('\n❌ Bundle size check FAILED — see above for details.')
  process.exit(1)
} else {
  console.log('\n✅ All bundle size checks passed.')
}
