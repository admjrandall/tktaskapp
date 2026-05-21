// ── AUDIT LOG (SEC-28, NIST AU-2/AU-12, FedRAMP AU-3) ─────────────────────────
// Encrypted audit log stored in nexus_data_v1 under __audit_log__.
// Fire-and-forget writes; async reads for display/export.

export type AuditEventType =
  | 'session_start'
  | 'auth_success'
  | 'auth_failure'
  | 'auth_locked'
  | 'auth_unlocked'
  | 'mfa_success'
  | 'mfa_failure'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'passkey_registered'
  | 'passkey_removed'
  | 'app_locked'
  | 'app_unlocked'
  | 'password_changed'
  | 'vault_file_opened'
  | 'vault_exported'
  | 'vault_imported'
  | 'backup_exported'
  | 'backup_imported'
  | 'data_exported'
  | 'data_imported'
  | 'app_reset'
  | 'ai_key_added'
  | 'ai_key_removed'
  | 'ai_query'
  | 'ai_tool_rejected'
  | 'record_permanent_delete'
  | 'adapter_clear'

export interface AuditEntry {
  id: string
  ts: string // ISO 8601
  event: AuditEventType
  details: Record<string, string> // no sensitive values
  ua: string // truncated user-agent
}

// ── Hook injection ─────────────────────────────────────────────────────────────
let _getKey: () => CryptoKey | null = () => null
let _putRecord: (store: string, rec: Record<string, unknown>) => Promise<void> = () =>
  Promise.resolve()
let _loadStore: (store: string) => Promise<Record<string, unknown>[]> = () => Promise.resolve([])

export function setAuditHooks(hooks: {
  getKey: () => CryptoKey | null
  putRecord: (store: string, rec: Record<string, unknown>) => Promise<void>
  loadStore: (store: string) => Promise<Record<string, unknown>[]>
}): void {
  _getKey = hooks.getKey
  _putRecord = hooks.putRecord
  _loadStore = hooks.loadStore
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function _uid(): string {
  const ts = Date.now().toString(36)
  const rand = crypto.getRandomValues(new Uint8Array(6))
  return ts + Array.from(rand, (b) => b.toString(36).padStart(2, '0')).join('')
}

function _ua(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  return (navigator.userAgent || 'unknown').slice(0, 120)
}

// ── In-memory buffer for writes before key is available ───────────────────────
const _pendingBuffer: AuditEntry[] = []

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget audit log entry. Never throws.
 */
export function auditLog(event: AuditEventType, details: Record<string, string> = {}): void {
  const entry: AuditEntry = {
    id: _uid(),
    ts: new Date().toISOString(),
    event,
    details,
    ua: _ua(),
  }
  // If key not available yet, buffer and flush later
  if (!_getKey()) {
    _pendingBuffer.push(entry)
    return
  }
  _flushBuffer()
  _writeEntry(entry)
}

/**
 * Flush any buffered entries now that a key is available.
 */
export function flushAuditBuffer(): void {
  _flushBuffer()
}

function _flushBuffer(): void {
  if (!_getKey() || _pendingBuffer.length === 0) return
  const toFlush = _pendingBuffer.splice(0)
  for (const entry of toFlush) {
    _writeEntry(entry)
  }
}

function _writeEntry(entry: AuditEntry): void {
  // Fire-and-forget — read-modify-write the audit log array
  _appendToLog(entry).catch((e: unknown) => {
    console.warn('[audit] write failed:', (e as Error).message)
  })
}

async function _appendToLog(entry: AuditEntry): Promise<void> {
  const key = _getKey()
  if (!key) return
  const existing = await _loadRaw()
  existing.push(entry)
  // Apply auto-purge
  const purged = _applyAutoPurge(existing)
  await _putRecord('documents', {
    id: '__audit_log__',
    entries: purged,
  })
}

async function _loadRaw(): Promise<AuditEntry[]> {
  const key = _getKey()
  if (!key) return []
  try {
    const records = await _loadStore('documents')
    const logRec = records.find((r: Record<string, unknown>) => r['id'] === '__audit_log__')
    if (!logRec) return []
    const entries = logRec['entries']
    if (!Array.isArray(entries)) return []
    return entries as AuditEntry[]
  } catch (e) {
    console.warn('[audit] load failed:', (e as Error).message)
    return []
  }
}

function _applyAutoPurge(entries: AuditEntry[]): AuditEntry[] {
  const daysStr =
    typeof localStorage !== 'undefined' ? localStorage.getItem('taskapp_audit_purge_days') : null
  const days = daysStr !== null ? parseInt(daysStr, 10) : 90
  if (!days || days <= 0) return entries
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return entries.filter((e) => new Date(e.ts) >= cutoff)
}

/**
 * Load all audit entries, sorted newest-first.
 */
export async function loadAuditLog(): Promise<AuditEntry[]> {
  const entries = await _loadRaw()
  return entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
}

/**
 * Export audit log as CSV string.
 */
export async function exportAuditCSV(): Promise<string> {
  const entries = await loadAuditLog()
  const header = 'id,ts,event,details,ua'
  const rows = entries.map((e) =>
    [
      e.id,
      e.ts,
      e.event,
      JSON.stringify(e.details).replace(/"/g, '""'),
      (e.ua || '').replace(/"/g, '""'),
    ]
      .map((v) => `"${v}"`)
      .join(','),
  )
  return [header, ...rows].join('\n')
}

/**
 * Export audit log as JSON Lines format.
 */
export async function exportAuditJSON(): Promise<string> {
  const entries = await loadAuditLog()
  return entries.map((e) => JSON.stringify(e)).join('\n')
}

/**
 * Purge audit log entries older than the given number of days.
 * Pass null to clear all entries.
 */
export async function purgeAuditLog(olderThanDays: number | null): Promise<void> {
  const key = _getKey()
  if (!key) return
  let entries: AuditEntry[] = []
  if (olderThanDays !== null) {
    const all = await _loadRaw()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - olderThanDays)
    entries = all.filter((e) => new Date(e.ts) >= cutoff)
  }
  await _putRecord('documents', {
    id: '__audit_log__',
    entries,
  })
}
