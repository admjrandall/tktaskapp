// Scans dist/offline/index.html for strings that must never appear in the offline bundle.
// Add new forbidden strings here as AI providers or external dependencies are added.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

/** Strings forbidden in ALL offline profiles. */
const ALWAYS_FORBIDDEN = [
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
  '@huggingface/transformers',
  'huggingface.co',
  'cdn.jsdelivr.net',
]

/**
 * Per-profile additional forbidden patterns.
 * Key: artifact path relative to repo root.
 * Value: array of forbidden strings/regexes for that profile.
 */
const PROFILE_FORBIDDEN = {
  'dist/offline/index.html': [],           // browser-ai: Ollama allowed at runtime via window.LanguageModel check
  'dist/offline-no-ai/index.html': [/ollama/i],
  'dist/offline-internal-ai/index.html': [],
}

let anyFailed = false

for (const [relPath, extraForbidden] of Object.entries(PROFILE_FORBIDDEN)) {
  const artifactPath = resolve(root, relPath)
  let content
  try {
    content = readFileSync(artifactPath, 'utf8')
  } catch {
    console.log(`⏭  ${relPath}: artifact not found — skipped`)
    continue
  }

  const forbidden = [...ALWAYS_FORBIDDEN, ...extraForbidden]
  let profileFailed = false

  for (const pattern of forbidden) {
    const isRegex = pattern instanceof RegExp
    const match = isRegex ? pattern.exec(content) : null
    const found = isRegex ? match !== null : content.includes(pattern)

    if (found) {
      const byteOffset = isRegex
        ? match !== null ? content.indexOf(match[0]) : -1
        : content.indexOf(pattern)
      const displayPattern = isRegex ? pattern.toString() : `"${pattern}"`
      console.error(`❌ ${relPath}`)
      console.error(`   Forbidden pattern ${displayPattern} found at byte offset ${byteOffset}`)
      profileFailed = true
      anyFailed = true
    }
  }

  if (!profileFailed) {
    console.log(`✅ ${relPath} — no forbidden strings found`)
  }
}

if (anyFailed) {
  console.error('\n❌ Offline bundle assertion FAILED — forbidden content detected.')
  process.exit(1)
} else {
  console.log('\n✅ All offline bundle assertions passed.')
}
