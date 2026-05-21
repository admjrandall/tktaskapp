#!/usr/bin/env node
/**
 * generate-csp.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this script after EVERY edit to taskapp.html to keep the Content
 * Security Policy hashes current.
 *
 * Usage:
 *   node generate-csp.mjs                    # defaults to taskapp.html
 *   node generate-csp.mjs my-other-file.html # explicit target
 *
 * What it does:
 *   1. Reads the HTML file.
 *   2. Finds every real <script>…</script> inline block (skips src= scripts).
 *   3. SHA-256 hashes each block's text content (byte-exact, no trim).
 *   4. Replaces the existing script hashes inside the CSP <meta> tag.
 *   5. Writes the file back in place.
 *   6. Computes a SHA-256 hash of the final file and writes a .sha256 file.
 *
 * NOTE: style-src uses 'unsafe-inline' only — no style hashes.
 * When CSP style-src contains hashes, 'unsafe-inline' is ignored by the
 * browser spec, which breaks the 177+ inline style= attributes throughout
 * the app. Script hashes are safe to combine with 'strict-dynamic'.
 *
 * NOTE: frame-ancestors is NOT in the CSP meta tag — it is ignored by
 * browsers when delivered via <meta> (only works in HTTP headers).
 *
 * Requirements: Node.js 18+ (uses built-in crypto — no npm install needed).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';

// ── Config ──────────────────────────────────────────────────────────────────
const ALGO = 'sha256';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute a CSP-formatted hash for a string of inline code.
 * The hash is over the UTF-8 bytes of the content, exactly as the browser
 * computes it — no trimming, no normalisation.
 *
 * @param {string} content - Raw text content of the block (between tags).
 * @returns {string}  e.g. 'sha256-abc123…='
 */
function cspHash(content) {
  const digest = createHash(ALGO)
    .update(content, 'utf8')
    .digest('base64');
  return `'${ALGO}-${digest}'`;
}

/**
 * Extract the inner text of every inline <tag>…</tag> block where the
 * opening tag does NOT contain a src= or href= attribute (those are
 * external resources, not inline blocks, and don't need hashing).
 *
 * @param {string} html  - Full HTML source.
 * @param {string} tag   - 'script' or 'style'.
 * @returns {string[]}   - Array of inner-text strings.
 */
function extractInlineBlocks(html, tag) {
  // Matches <tag ...> ... </tag> where the opening tag has no src/href.
  // Uses a non-greedy match so nested template-string <style> text
  // inside a JS string literal is not confused for a real style block.
  const re = new RegExp(
    `<${tag}(?![^>]*\\s(?:src|href)=)[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'gi'
  );
  const blocks = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    // Only include blocks that have actual content (skip empty tags).
    if (m[1].length > 0) {
      blocks.push(m[1]);
    }
  }
  return blocks;
}

/**
 * Replace the placeholder tokens inside the CSP meta content attribute.
 *
 * @param {string} html           - Full HTML source.
 * @param {string} scriptHashes   - Space-joined hash list for script-src.
 * @param {string} styleHashes    - Space-joined hash list for style-src.
 * @returns {string}              - Updated HTML.
 */
function injectHashes(html, scriptHashes) {
  // Replace existing script hashes OR the {{SCRIPT_HASHES}} placeholder.
  // After resetPlaceholders runs, the tag has {{SCRIPT_HASHES}} ready to replace.
  if (html.includes('{{SCRIPT_HASHES}}')) {
    return html.replace('{{SCRIPT_HASHES}}', scriptHashes);
  }
  // Fallback: replace inline hashes directly (should not normally reach here)
  return html.replace(
    /(script-src\s+)((?:'[^']*'\s*)*)/,
    (_, pre) => `${pre}${scriptHashes} `
  );
}

/**
 * Reset script-src hashes back to a placeholder before recomputing.
 * Makes the script idempotent — safe to run multiple times.
 */
function resetPlaceholders(html) {
  return html.replace(
    /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*?)(")/i,
    (_, open, policy, close) => {
      // Collapse only hash/nonce tokens (or the placeholder) back to the placeholder.
      // Static keyword tokens ('wasm-unsafe-eval', 'strict-dynamic', 'self', etc.)
      // are NOT matched here — they survive the reset and remain in the directive.
      // Handles both a fresh build ({{SCRIPT_HASHES}} literal) and a re-run (actual hashes).
      policy = policy.replace(
        /script-src\s+(?:(?:'(?:sha(?:256|384|512)|nonce)-[^']*'|\{\{SCRIPT_HASHES\}\})\s*)*/,
        "script-src {{SCRIPT_HASHES}} "
      );
      return open + policy + close;
    }
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

const targetFile = resolve(process.argv[2] ?? 'taskapp.html');

console.log(`\n🔐 CSP Hash Generator`);
console.log(`   Target : ${targetFile}`);
console.log(`   Algorithm: ${ALGO.toUpperCase()}\n`);

// 1. Read file
let html;
try {
  html = readFileSync(targetFile, 'utf8');
} catch (err) {
  console.error(`❌ Could not read file: ${err.message}`);
  process.exit(1);
}

// 2. Verify the CSP meta tag exists
if (!html.includes('Content-Security-Policy')) {
  console.error('❌ No Content-Security-Policy meta tag found in the file.');
  console.error('   Add the CSP meta tag with {{SCRIPT_HASHES}} and {{STYLE_HASHES}} placeholders first.');
  process.exit(1);
}

// 2b. Verify that the {{APP_VERSION}} build-var placeholder was replaced by Vite.
//     If it is still present the build pipeline is broken and the wrong version
//     will be shown in the app UI. Fail fast before the CSP hash is updated.
if (html.includes('{{APP_VERSION}}')) {
  console.error('❌ ERROR: {{APP_VERSION}} placeholder was not replaced in build output.');
  console.error('   Check vite.config.ts → transformIndexHtml and ensure the root package.json has a "version" field.');
  process.exit(1);
}

// 3. Reset placeholders (makes script idempotent across multiple runs)
html = resetPlaceholders(html);

// 4. Extract inline script blocks — AFTER reset so the CSP tag itself is not hashed
const scriptBlocks = extractInlineBlocks(html, 'script');

console.log(`   Found ${scriptBlocks.length} inline <script> block(s)`);
console.log(`   NOTE: style-src uses 'unsafe-inline' only — no style hashes\n`);

// 5. Compute script hashes
const scriptHashes = scriptBlocks.map(cspHash).join(' ');

// 6. Inject into CSP meta tag
html = injectHashes(html, scriptHashes);

// 7. Verify placeholder was replaced (sanity check)
if (html.includes('{{SCRIPT_HASHES}}')) {
  console.error('❌ Placeholder replacement failed — the CSP meta tag may be malformed.');
  process.exit(1);
}

// 8. Write back
try {
  writeFileSync(targetFile, html, 'utf8');
} catch (err) {
  console.error(`❌ Could not write file: ${err.message}`);
  process.exit(1);
}

// 9. Compute file integrity hash of the FINAL written file
//    This hash covers the complete file bytes as they exist on disk —
//    the same content the browser loads. It is used by the startup
//    self-check inside the app to detect tampering.
const finalBytes = readFileSync(targetFile);
const fileIntegrityHash = createHash('sha256').update(finalBytes).digest('hex');
const shaFilePath = targetFile.replace(/\.html$/i, '') + '.sha256';

try {
  writeFileSync(shaFilePath, fileIntegrityHash + '\n', 'utf8');
} catch (err) {
  console.error(`❌ Could not write .sha256 file: ${err.message}`);
  process.exit(1);
}

console.log(`✅ CSP updated successfully.\n`);
console.log(`   Script hashes (${scriptBlocks.length}):`);
scriptBlocks.forEach((_, i) => {
  const h = cspHash(scriptBlocks[i]);
  console.log(`     [${String(i + 1).padStart(2)}] ${h}`);
});
console.log(`\n   File integrity SHA-256:`);
console.log(`     ${fileIntegrityHash}`);
console.log(`     Written to: ${shaFilePath}`);
console.log(`\n   Run again after any edit to taskapp.html.\n`);
