import { existsSync, readdirSync, renameSync } from 'fs'
import { basename, join } from 'path'

const dir = process.argv[2]
if (!dir) {
  console.error('Usage: node scripts/normalize-offline-profile-output.mjs <dist-dir>')
  process.exit(1)
}

const target = join(dir, 'index.html')
if (existsSync(target)) process.exit(0)

const htmlFiles = readdirSync(dir).filter((name) => /^index\..+\.html$/u.test(name))
if (htmlFiles.length !== 1) {
  console.error('Expected exactly one profile HTML file in ' + basename(dir) + '; found ' + String(htmlFiles.length))
  process.exit(1)
}

renameSync(join(dir, htmlFiles[0]), target)
