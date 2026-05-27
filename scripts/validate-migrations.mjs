import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const rel = (p) => relative(root, p)
const migrationsDir = join(root, 'server', 'drizzle')
const staleDir = join(root, 'server', 'src', 'db', 'migrations')
const journalPath = join(migrationsDir, 'meta', '_journal.json')

const errors = []

function fail(message) {
  errors.push(message)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`Unable to read valid JSON at ${rel(path)}: ${error.message}`)
    return null
  }
}

if (!existsSync(migrationsDir) || !statSync(migrationsDir).isDirectory()) {
  fail(`Missing committed migration directory: ${rel(migrationsDir)}`)
}

if (!existsSync(journalPath)) {
  fail(`Missing Drizzle migration journal: ${rel(journalPath)}`)
}

const staleSqlFiles = existsSync(staleDir)
  ? readdirSync(staleDir).filter((name) => name.endsWith('.sql'))
  : []
if (staleSqlFiles.length > 0) {
  fail(
    `Stale SQL files found in ${rel(staleDir)}. Production migrations must live only in server/drizzle: ${staleSqlFiles.join(', ')}`,
  )
}

const sqlFiles = existsSync(migrationsDir)
  ? readdirSync(migrationsDir)
      .filter((name) => /^\d{4}_[a-z0-9_ -]+\.sql$/i.test(name))
      .sort()
  : []

if (sqlFiles.length === 0) {
  fail('No committed SQL migrations found in server/drizzle')
}

const journal = existsSync(journalPath) ? readJson(journalPath) : null
const entries = Array.isArray(journal?.entries) ? journal.entries : []

if (journal && entries.length === 0) {
  fail('Migration journal has no entries')
}

const journalFiles = entries.map((entry) => `${entry.tag}.sql`).sort()
const missingFromJournal = sqlFiles.filter((file) => !journalFiles.includes(file))
const missingFromDisk = journalFiles.filter((file) => !sqlFiles.includes(file))

if (missingFromJournal.length > 0) {
  fail(`SQL migrations missing from journal: ${missingFromJournal.join(', ')}`)
}

if (missingFromDisk.length > 0) {
  fail(`Journal entries missing SQL files: ${missingFromDisk.join(', ')}`)
}

const seenPrefixes = new Set()
const seenTags = new Set()

for (const [index, file] of sqlFiles.entries()) {
  const expectedPrefix = String(index + 1).padStart(4, '0')
  const actualPrefix = file.slice(0, 4)
  if (actualPrefix !== expectedPrefix) {
    fail(`Migration ${file} is out of sequence; expected prefix ${expectedPrefix}`)
  }
  if (seenPrefixes.has(actualPrefix)) fail(`Duplicate migration prefix ${actualPrefix}`)
  seenPrefixes.add(actualPrefix)

  const contents = readFileSync(join(migrationsDir, file), 'utf8')
  if (contents.trim().length === 0) fail(`Migration ${file} is empty`)
  if (/\{\{[^}]+\}\}|\$\{[^}]+\}|TODO|FIXME|changeme|replace-with/i.test(contents)) {
    fail(`Migration ${file} contains unresolved placeholder or TODO text`)
  }
}

for (const entry of entries) {
  if (!Number.isInteger(entry.idx) || entry.idx < 1) {
    fail(`Journal entry ${JSON.stringify(entry)} has invalid idx`)
  }
  if (typeof entry.tag !== 'string' || !entry.tag) {
    fail(`Journal entry ${JSON.stringify(entry)} has invalid tag`)
    continue
  }
  if (seenTags.has(entry.tag)) fail(`Duplicate journal tag ${entry.tag}`)
  seenTags.add(entry.tag)
  const expectedPrefix = String(entry.idx).padStart(4, '0')
  if (!basename(entry.tag).startsWith(`${expectedPrefix}_`)) {
    fail(`Journal tag ${entry.tag} does not match idx ${entry.idx}`)
  }
}

if (errors.length > 0) {
  console.error('Migration validation failed:')
  for (const error of errors) console.error('- ' + error)
  process.exit(1)
}

const summary = 'Migration validation passed: ' + String(sqlFiles.length) + ' committed SQL migrations'
console.log(summary)
