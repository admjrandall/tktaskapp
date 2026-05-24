// Last measured bundle sizes — update this comment after each build:offline run.
// offline-browser-ai:  raw 474,176 B (~463 kB)  gzip 127,271 B (~124 kB)  (as of 2026-05-23)
// offline-no-ai:       not built                                            (as of 2026-05-20)
// offline-internal-ai: not built                                            (as of 2026-05-20)
//
// Bundle size budgets — update these if you deliberately grow the bundle.
// offline-browser-ai is OVER budget (raw +101 kB, gzip +18 kB) since Phase 13.
// History:
//   Phase 3 introduced the raw overage (~52 KB above budget).
//   Phase 4 added valibot 1.4.0 + 9 schema files (~48 KB raw more, bringing total to 372707).
//   Phase 12 version-stamping + toolchain churn added a further ~49 KB (now 421687).
// Run the analyser to identify top contributors before shrinking:
//   pnpm --filter @tktaskapp/offline-web run perf:analyse
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
    maxRaw: 440_000,
    maxGzip: 120_000,
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
