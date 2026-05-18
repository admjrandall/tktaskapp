// ── DATABASE ───────────────────────────────────────────────────────────
// Extracted from taskapp.html ~3042–3195
// In-memory store backed by:
//   • encrypted blob in nexus_vault_v2 (for CRM tables in STORES)
//   • per-record encrypted documents in nexus_data_v1 (for IDB_STORES)
// Adapter pull/push (sync layer) is wired into dbInit / dbFlush so the
// core works standalone when the NullAdapter is used.

import { STORES, IDB_STORES } from './constants.js';
import {
  loadVault, saveVault,
} from './vault.js';
import {
  _idbLoadStore, _idbPutRecord, _idbDeleteRecord, _idbClearStore,
} from './idb-data.js';
import type { SyncAdapter } from './adapter-interface.js';
import { parseDateLocal } from './utils.js';

// fs.ts hook — imported lazily inside dbFlush to avoid circular import.
// fs.ts depends on vault meta getters; db.ts depends on fs only for the
// post-flush disk write notification.

let _dbKey: CryptoKey | null = null;
let _dbData: Record<string, unknown[]> = {};
let _adapter: SyncAdapter | null = null;
const INTERNAL_DOCUMENT_IDS = new Set(['__ai_secrets__']);

export function setAdapter(a: SyncAdapter): void {
  _adapter = a;
}
export function getAdapter(): SyncAdapter | null {
  return _adapter;
}

// ── DB initialization ────────────────────────────────────────────────
export async function dbInit(cryptoKey: CryptoKey): Promise<Record<string, unknown[]>> {
  _dbKey = cryptoKey;
  // Load CRM data from IDB vault
  _dbData = await loadVault(_dbKey);
  STORES.forEach(s => { if (!_dbData[s]) _dbData[s] = []; });
  // Load large-content stores from IndexedDB
  _dbData.documents = (await _idbLoadStore('documents', _dbKey))
    .filter(r => !INTERNAL_DOCUMENT_IDS.has(String((r as { id?: string } | null)?.id || '')));
  _dbData.conversations = await _idbLoadStore('conversations', _dbKey);

  // Adapter pull (sync). Default NullAdapter returns empty records — no-op.
  if (_adapter) {
    try {
      const { records } = await _adapter.pull(null);
      for (const [k, arr] of Object.entries(records || {})) {
        if (!Array.isArray(arr)) continue;
        const target = (_dbData[k] || (_dbData[k] = []));
        const byId = new Map(target.map(r => [(r as { id: string }).id, r]));
        for (const rec of arr) byId.set((rec as { id: string }).id, rec);
        _dbData[k] = Array.from(byId.values());
      }
    } catch (e) {
      console.warn('[db] adapter.pull failed:', (e as Error).message);
    }
  }
  return _dbData;
}

// Flush CRM data to IndexedDB vault.
// _debouncedFlush coalesces rapid consecutive writes (e.g. bulk import,
// rapid field edits) into a single encrypt+write operation.
export async function dbFlush(): Promise<void> {
  if (!_dbKey) return;
  const payload = _buildCrmPayload();
  await saveVault(_dbKey, payload);

  // Adapter push (fire-and-forget — failures shouldn't block local save).
  if (_adapter) {
    _adapter.push(payload).catch(e =>
      console.warn('[db] adapter.push failed:', (e as Error).message)
    );
  }

  // Disk file mirror (Chrome/Edge File System Access). Loaded lazily so
  // we don't import fs.ts at module-evaluation time (circular avoidance).
  try {
    const fs = await import('./fs.js');
    if (fs.isFsReady()) setTimeout(() => fs.fsWriteVault(), 300);
  } catch { /* fs module not available — silently skip */ }
}

let _flushTimer: ReturnType<typeof setTimeout> | null = null;
export function _scheduleFlush(): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    dbFlush().catch(e => console.error('[db] flush failed:', (e as Error)?.message));
  }, 300);
}

// Flush immediately before the page unloads so in-flight debounced
// writes are not lost on tab close.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; dbFlush(); }
  });
}

// Build only the CRM stores object (excludes IDB-backed stores)
export function _buildCrmPayload(): Record<string, unknown[]> {
  const payload: Record<string, unknown[]> = {};
  STORES.forEach(s => { payload[s] = _dbData[s] || []; });
  return payload;
}

// ── Core DB helpers ──────────────────────────────────────────────────
export function uid(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(9));
  return ts + Array.from(rand, b => b.toString(36).padStart(2, '0')).join('');
}
export function nowISO(): string { return new Date().toISOString(); }

export function getStore(s: string): unknown[] {
  if (!_dbData[s]) _dbData[s] = [];
  return _dbData[s]!;
}
export function dbGetAll(s: string): unknown[] {
  const rows = getStore(s);
  if (s === 'documents') return rows.filter(r => !INTERNAL_DOCUMENT_IDS.has(String((r as { id?: string } | null)?.id || '')));
  return [...rows];
}
export function dbGetById(s: string, id: string): unknown | null {
  return (getStore(s) as Array<{ id: string }>).find(r => r.id === id) || null;
}

export async function dbCreate(s: string, rec: Record<string, unknown>): Promise<unknown> {
  const item = { ...rec, id: uid(), createdAt: nowISO(), updatedAt: nowISO() };
  getStore(s).push(item);
  if (IDB_STORES.includes(s)) {
    if (_dbKey) await _idbPutRecord(s, item as { id: string }, _dbKey);
  } else {
    _scheduleFlush();
  }
  return item;
}

export async function dbUpdate(s: string, id: string, changes: Record<string, unknown>): Promise<unknown> {
  const arr = getStore(s) as Array<{ id: string; [k: string]: unknown }>;
  const idx = arr.findIndex(r => r.id === id);
  if (idx === -1) throw new Error('Not found');
  const up = { ...arr[idx], ...changes, updatedAt: nowISO() } as { id: string; [k: string]: unknown };
  arr[idx] = up;
  if (IDB_STORES.includes(s)) {
    if (_dbKey) await _idbPutRecord(s, up, _dbKey);
  } else {
    _scheduleFlush();
  }
  return up;
}

export async function dbDelete(s: string, id: string): Promise<boolean> {
  const arr = getStore(s) as Array<{ id: string }>;
  const idx = arr.findIndex(r => r.id === id);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  if (IDB_STORES.includes(s)) {
    await _idbDeleteRecord(s, id);
  } else {
    _scheduleFlush();
  }
  return true;
}

export async function softDelete(s: string, id: string): Promise<boolean> {
  const rec = dbGetById(s, id) as Record<string, unknown> | null;
  if (!rec) return false;
  await dbCreate('trash', { ...rec, _store: s, deletedAt: nowISO() });
  await dbDelete(s, id);
  return true;
}

export async function restoreFromTrash(tid: string): Promise<boolean> {
  const item = dbGetById('trash', tid) as (Record<string, unknown> & { _store: string }) | null;
  if (!item) return false;
  const { _store, deletedAt: _deletedAt, ...rec } = item;
  void _deletedAt;
  await dbCreate(_store, rec);
  await dbDelete('trash', tid);
  return true;
}

export async function permanentDelete(tid: string): Promise<boolean> {
  return dbDelete('trash', tid);
}

export async function createNotification(
  title: string, body: string, type = 'info', relatedId: string | null = null,
): Promise<unknown> {
  return dbCreate('notifications', { title, body, type, relatedId, read: false });
}

export function getUnreadNotifications(): unknown[] {
  return (getStore('notifications') as Array<{ read: boolean; createdAt: string }>)
    .filter(n => !n.read)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function markNotificationRead(id: string): Promise<unknown> {
  return dbUpdate('notifications', id, { read: true });
}

export async function markAllNotificationsRead(): Promise<void> {
  for (const n of getUnreadNotifications() as Array<{ id: string }>) {
    await dbUpdate('notifications', n.id, { read: true });
  }
}

export async function checkDueDates(): Promise<void> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  type Task = { id: string; title: string; status?: string; done?: boolean; dueDate?: string };
  const tasks = (getStore('tasks') as Task[]).filter(t => t.status !== 'Done' && !t.done && t.dueDate);
  for (const t of tasks) {
    const due = parseDateLocal(t.dueDate!) || new Date(t.dueDate!);
    due.setHours(0, 0, 0, 0);
    const nid = 'due_' + t.id;
    if ((getStore('notifications') as Array<{ relatedId?: string }>).find(n => n.relatedId === nid)) continue;
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) await createNotification('Task Overdue', `"${t.title}" was due ${t.dueDate}`, 'error', nid);
    else if (diff === 0) await createNotification('Due Today', `"${t.title}" is due today`, 'warning', nid);
    else if (diff <= 3) await createNotification('Due Soon', `"${t.title}" is due in ${diff} day${diff === 1 ? '' : 's'}`, 'info', nid);
  }
}

export async function startTimer(taskId: string, description = ''): Promise<unknown> {
  type Entry = { id: string; running: boolean };
  const running = (getStore('timeEntries') as Entry[]).find(e => e.running);
  if (running) await dbUpdate('timeEntries', running.id, { running: false, endedAt: nowISO() });
  return dbCreate('timeEntries', {
    taskId, description, startedAt: nowISO(), endedAt: null, running: true, duration: 0,
  });
}

export async function stopTimer(id: string): Promise<unknown | null> {
  type Entry = { running: boolean; startedAt: string };
  const e = dbGetById('timeEntries', id) as Entry | null;
  if (!e || !e.running) return null;
  return dbUpdate('timeEntries', id, {
    running: false,
    endedAt: nowISO(),
    duration: Math.floor((Date.now() - new Date(e.startedAt).getTime()) / 1000),
  });
}

export function getRunningTimer(): unknown | null {
  return (getStore('timeEntries') as Array<{ running: boolean }>).find(e => e.running) || null;
}

export function globalSearch(q: string): { store: string; id: string; label: string; icon: string }[] {
  if (!q || q.length < 2) return [];
  const lq = q.toLowerCase();
  const results: { store: string; id: string; label: string; icon: string }[] = [];
  const SEARCH_FIELDS: Record<string, string[]> = {
    clients: ['name', 'contactName', 'email', 'phone', 'description'],
    departments: ['name', 'description'],
    projects: ['name', 'description'],
    tasks: ['title', 'description'],
    people: ['name', 'email', 'role'],
    standaloneNotes: ['body'],
    documents: ['title', 'excerpt'],
  };
  const ss = (store: string, labelFn: (r: Record<string, unknown>) => string, icon: string) => {
    const fields = SEARCH_FIELDS[store] || ['name'];
    (getStore(store) as Array<Record<string, unknown> & { id: string }>).forEach(r => {
      if (fields.some(f => String(r[f] || '').toLowerCase().includes(lq))) {
        results.push({ store, id: r.id, label: labelFn(r), icon });
      }
    });
  };
  ss('clients', r => (r.name as string) || 'Client', '🏢');
  ss('departments', r => (r.name as string) || 'Dept', '🏛️');
  ss('projects', r => (r.name as string) || 'Project', '📁');
  ss('tasks', r => (r.title as string) || 'Task', '✅');
  ss('people', r => (r.name as string) || 'Person', '👤');
  ss('documents', r => (r.title as string) || 'Document', '📄');
  return results.slice(0, 20);
}

// Internal accessors for other modules (e.g. fs.ts, ai/*) that need raw state.
export function _getDbKey(): CryptoKey | null { return _dbKey; }
export function _getDbData(): Record<string, unknown[]> { return _dbData; }
export function _setDbData(d: Record<string, unknown[]>): void { _dbData = d; }
export { _idbClearStore };
