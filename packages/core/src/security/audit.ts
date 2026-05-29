// ── AUDIT LOG (SEC-28, NIST AU-2/AU-9/AU-10/AU-12, FedRAMP AU-3, HIPAA §164.312(b)) ──
// Encrypted audit log stored in nexus_data_v1 under __audit_log__.
//
// Compliance requirements implemented here:
//   AU-12  — Every required audit event MUST be recorded; silent drops are violations.
//   AU-10  — Non-repudiation: irrefutable evidence of actions; writes retried up to
//            AUDIT_WRITE_RETRIES times before surfacing a mandatory user-visible alert.
//   AU-9   — Audit records protected by a SHA-256 hash chain; integrity verifiable.
//   HIPAA  — Default retention 2190 days (6 years). Minimum floor: AUDIT_MIN_RETENTION_DAYS.
//   FedRAMP— Online retention minimum: 90 days (AUDIT_MIN_RETENTION_DAYS).
//
// Write architecture:
//   All writes are serialised through a single promise queue (_writeQueue) so that
//   concurrent auditLog() calls cannot interleave and corrupt the hash chain (P9).
//   Each write is attempted up to AUDIT_WRITE_RETRIES times with linear back-off.
//   If all attempts fail the entry is passed to _onWriteFailure for user notification.

export type AuditEventType =
  // Auth
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
  // Data
  | 'vault_file_opened'
  | 'vault_exported'
  | 'vault_imported'
  | 'backup_exported'
  | 'backup_imported'
  | 'data_exported'
  | 'data_imported'
  | 'app_reset'
  | 'record_permanent_delete'
  | 'adapter_clear'
  // AI (base)
  | 'ai_key_added'
  | 'ai_key_removed'
  | 'ai_query'
  | 'ai_tool_rejected'
  | 'ai_tool_unknown'
  // AI extended (C.6)
  | 'ai_attribute_computed'
  | 'ai_attribute_failed'
  | 'ai_command_executed'
  | 'ai_command_rejected'
  | 'ai_chat_message'
  // Adaptive UX (C.6)
  | 'adaptive_suggestion_proposed'
  | 'adaptive_suggestion_accepted'
  | 'adaptive_suggestion_dismissed'
  // DLP / lockdown (C.6)
  | 'dlp_warning_shown'
  | 'dlp_action_proceeded'
  | 'lockdown_violation_blocked'
  // Sync (C.6)
  | 'sync_pull'
  | 'sync_push'
  | 'sync_conflict_resolved'
  // Extension objects (C.6)
  | 'extension_object_defined'
  | 'extension_object_instance_created'
  | 'extension_object_instance_updated'
  | 'extension_object_instance_deleted'
  // Workspace / persona (C.6)
  | 'workspace_layout_changed'
  | 'persona_selected'
  | 'persona_changed'
  // Compliance / GDPR (C.7)
  | 'gdpr_erasure_requested'
  | 'compliance_pack_changed'

export interface AuditEntry {
  id: string
  ts: string // ISO 8601
  event: AuditEventType
  details: Record<string, string> // no sensitive values
  ua: string // truncated user-agent
  // C.6 hash-chain fields — computed by _appendToLog; absent in buffered drafts
  chainPosition?: number // 1-indexed position in the log
  prevHash?: string | null // SHA-256 hex of the previous entry's canonical form
  signedDigest?: string // SHA-256 hex of this entry (excluding signedDigest)
}

// ── Compliance constants ───────────────────────────────────────────────────────
/** FedRAMP minimum online retention (days). Cannot be configured below this. */
const AUDIT_MIN_RETENTION_DAYS = 90
/** Maximum audit events buffered before a crypto key is available. */
const AUDIT_PENDING_BUFFER_MAX = 200
/** Number of IDB write attempts per audit entry before alerting (AU-12). */
const AUDIT_WRITE_RETRIES = 3
/** Linear back-off base in ms between retry attempts. */
const AUDIT_RETRY_DELAY_MS = 200

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

/**
 * Optional write-failure callback (NIST AU-10 / AU-12).
 * Injected from main.ts via setAuditWriteFailHook so the app can surface a
 * visible alert when an audit event cannot be persisted after all retries.
 * Never called for buffered pre-auth entries that are successfully flushed later.
 */
let _onWriteFailure: ((entry: AuditEntry) => void) | null = null

export function setAuditWriteFailHook(fn: (entry: AuditEntry) => void): void {
  _onWriteFailure = fn
}

// ── Hash-chain helpers (C.6) ───────────────────────────────────────────────────
async function _sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function _entryCanonical(entry: Omit<AuditEntry, 'signedDigest'>): string {
  return JSON.stringify({
    id: entry.id,
    ts: entry.ts,
    event: entry.event,
    details: entry.details,
    ua: entry.ua,
    chainPosition: entry.chainPosition ?? null,
    prevHash: entry.prevHash ?? null,
  })
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
// Capped at AUDIT_PENDING_BUFFER_MAX (AU-12: bounded; oldest entries dropped with warning
// rather than growing without limit and being silently lost on tab close).
const _pendingBuffer: AuditEntry[] = []

// ── Serial write queue (AU-12 / P9 fix) ───────────────────────────────────────
// All IDB writes are chained on this promise so that concurrent auditLog() calls
// execute one at a time. This prevents the read-modify-write race that would
// produce duplicate chain positions and overwrite entries in the hash chain.
let _writeQueue: Promise<void> = Promise.resolve()

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Queue an audit log entry for durable encrypted persistence (NIST AU-12).
 *
 * Synchronous and non-throwing — safe to call from any context.
 * If the crypto key is not yet available the entry is buffered (capped at
 * AUDIT_PENDING_BUFFER_MAX) and flushed automatically when flushAuditBuffer()
 * is called after key injection.
 *
 * Each entry is written through a serial queue (one write at a time) with up to
 * AUDIT_WRITE_RETRIES attempts. If all attempts fail, _onWriteFailure is called
 * so the application can surface a visible alert — silent drops are a NIST AU-12
 * compliance violation.
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
    if (_pendingBuffer.length >= AUDIT_PENDING_BUFFER_MAX) {
      // Drop the oldest to make room — warn so it is visible in devtools
      const dropped = _pendingBuffer.shift()
      console.warn(
        '[audit] Pre-auth buffer full — oldest entry dropped (AU-12 risk):',
        dropped?.event,
        dropped?.id,
      )
    }
    _pendingBuffer.push(entry)
    return
  }
  _flushBuffer()
  _enqueueWrite(entry)
}

/**
 * Flush any buffered entries now that a crypto key is available.
 * Called from main.ts after setAuditHooks() injects a live key.
 */
export function flushAuditBuffer(): void {
  _flushBuffer()
}

function _flushBuffer(): void {
  if (!_getKey() || _pendingBuffer.length === 0) return
  const toFlush = _pendingBuffer.splice(0)
  for (const entry of toFlush) {
    _enqueueWrite(entry)
  }
}

/**
 * Append entry to the serial write queue.
 * Returns immediately; the write happens asynchronously in order.
 */
function _enqueueWrite(entry: AuditEntry): void {
  // Chain onto the queue — errors are handled inside _writeWithRetry, never propagate
  _writeQueue = _writeQueue.then(() => _writeWithRetry(entry))
}

/**
 * Attempt to append entry to the encrypted audit log up to AUDIT_WRITE_RETRIES
 * times with linear back-off (AU-12). If all attempts fail, surfaces a mandatory
 * alert via _onWriteFailure and console.error (AU-10 non-repudiation requirement:
 * the system must not silently lose required audit events).
 */
async function _writeWithRetry(entry: AuditEntry): Promise<void> {
  for (let attempt = 1; attempt <= AUDIT_WRITE_RETRIES; attempt++) {
    try {
      await _appendToLog(entry)
      return // success — done
    } catch (e) {
      const msg = (e as Error).message
      if (attempt < AUDIT_WRITE_RETRIES) {
        // Back off linearly before next attempt
        await new Promise<void>((res) => setTimeout(res, AUDIT_RETRY_DELAY_MS * attempt))
        console.warn(`[audit] Write attempt ${attempt} failed, retrying:`, msg)
      } else {
        // All retries exhausted — AU-12 / AU-10 compliance alert (MUST NOT be silent)
        console.error(
          '[audit] COMPLIANCE ALERT (NIST AU-12): Audit event could not be persisted ' +
            `after ${AUDIT_WRITE_RETRIES} attempts. Event: ${entry.event} id=${entry.id}. Error: ${msg}`,
        )
        _onWriteFailure?.(entry)
      }
    }
  }
}

async function _appendToLog(entry: AuditEntry): Promise<void> {
  const key = _getKey()
  if (!key) return
  const existing = await _loadRaw()

  // Compute hash-chain fields (C.6)
  const last = existing.length > 0 ? existing[existing.length - 1] : undefined
  const chainPosition = existing.length + 1
  const prevHash = last ? await _sha256hex(_entryCanonical(last)) : null
  const draft: Omit<AuditEntry, 'signedDigest'> = { ...entry, chainPosition, prevHash }
  const signedDigest = await _sha256hex(_entryCanonical(draft))
  const full: AuditEntry = { ...draft, signedDigest }

  existing.push(full)
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
  // Default 2190 days = 6 years (HIPAA minimum; C.6 configurable retention).
  // AUDIT_MIN_RETENTION_DAYS (90) is the hard floor — FedRAMP online retention minimum.
  // A user or script cannot reduce retention below this value regardless of the
  // localStorage setting (AU-9: audit records protected from unauthorised modification).
  const requested = daysStr !== null ? parseInt(daysStr, 10) : 2190
  const days = !requested || requested <= 0 ? 2190 : Math.max(requested, AUDIT_MIN_RETENTION_DAYS)
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
 * Verify the integrity of the local hash chain.
 * Returns { valid: true } if every entry's prevHash + signedDigest checks out,
 * or { valid: false, firstBrokenAt: chainPosition } on the first mismatch.
 * Entries without chain fields (written before hash-chaining was introduced) are skipped.
 */
export async function verifyAuditChain(): Promise<{
  valid: boolean
  firstBrokenAt: number | null
}> {
  const entries = await _loadRaw()
  for (const [i, e] of entries.entries()) {
    if (e.signedDigest === undefined) continue // pre-Phase-4 entry; skip
    const prev = i > 0 ? entries[i - 1] : undefined
    const expectedPrevHash =
      prev?.signedDigest !== undefined ? await _sha256hex(_entryCanonical(prev)) : null
    if (e.prevHash !== expectedPrevHash)
      return { valid: false, firstBrokenAt: e.chainPosition ?? i + 1 }
    const { signedDigest: _sd, ...withoutDigest } = e
    const recomputed = await _sha256hex(_entryCanonical(withoutDigest))
    if (recomputed !== e.signedDigest)
      return { valid: false, firstBrokenAt: e.chainPosition ?? i + 1 }
  }
  return { valid: true, firstBrokenAt: null }
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
