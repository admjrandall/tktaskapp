// ── FILE SYSTEM PERSISTENCE ────────────────────────────────────────────
// Extracted from taskapp.html ~3229–3361
// Dual-save: IndexedDB vault (primary) + disk file (survives cache clear).
// Uses File System Access API (Chrome/Edge) with IndexedDB handle storage.
// NOTE: uses separate DB (nexus_fs_v1) from the keys DB (nexus_keys_v1)
//       and the data DB (nexus_data_v1) — no cross-contamination.
//
// The saveVault wrap-and-call-fsWriteVault hook in the original is implemented
// in db.ts (dbFlush dynamically imports this module and calls fsWriteVault
// after the vault save completes) — see db.ts ~end of dbFlush.

import {
  FS_HANDLE_DB, FS_HANDLE_KEY, FS_FILENAME,
  SALT_KEY, VERIFY_KEY, VAULT_KEY,
} from './constants.js';
import { _vaultMetaGet, _vaultMetaSet } from './vault.js';

// Permissive DOM types for File System Access (TS DOM lib coverage is incomplete).
type FSPermissionState = 'granted' | 'denied' | 'prompt';
interface FSPermDescriptor { mode?: 'read' | 'readwrite' }
interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write: (data: string | ArrayBuffer | Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
  queryPermission(opts: FSPermDescriptor): Promise<FSPermissionState>;
  requestPermission(opts: FSPermDescriptor): Promise<FSPermissionState>;
}
declare global {
  interface Window {
    showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>;
  }
}

let _fsHandle: FileSystemFileHandle | null = null;
let _fsReady = false;
let _fsSaving = false;
let _fsLastSave: string | null = null;

export function isFsReady(): boolean { return _fsReady && !!_fsHandle; }
export function getFsHandle(): FileSystemFileHandle | null { return _fsHandle; }
export function getFsLastSave(): string | null { return _fsLastSave; }

function _idbFsOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(FS_HANDLE_DB, 1);
    req.onupgradeneeded = e => (e.target as IDBOpenDBRequest).result.createObjectStore('handles');
    req.onsuccess = e => res((e.target as IDBOpenDBRequest).result);
    req.onerror = () => rej(req.error);
  });
}
async function _idbGet(key: string): Promise<unknown> {
  const db = await _idbFsOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function _idbSet(key: string, val: unknown): Promise<void> {
  const db = await _idbFsOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function _verifyPermission(handle: FileSystemFileHandle, write = true): Promise<boolean> {
  const opts: FSPermDescriptor = { mode: write ? 'readwrite' : 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

export async function fsWriteVault(): Promise<void> {
  if (!_fsHandle || _fsSaving) return;
  _fsSaving = true;
  try {
    const ok = await _verifyPermission(_fsHandle, true);
    if (!ok) { _fsSaving = false; return; }
    const payload = {
      v: 2,
      ts: new Date().toISOString(),
      salt:   (await _vaultMetaGet(SALT_KEY))   || '',
      verify: (await _vaultMetaGet(VERIFY_KEY)) || '',
      vault:  (await _vaultMetaGet(VAULT_KEY))  || '',
    };
    const writable = await _fsHandle.createWritable();
    await writable.write(JSON.stringify(payload));
    await writable.close();
    _fsLastSave = payload.ts;
    _fsSaving = false;
  } catch (err) {
    _fsSaving = false;
    console.warn('[FS] Write failed:', (err as Error).message);
  }
}

export async function fsReadVault(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const file = await handle.getFile();
    const text = await file.text();
    const payload = JSON.parse(text);
    if (payload.v !== 2) throw new Error('Unknown file version');
    if (typeof payload.salt !== 'string' || typeof payload.verify !== 'string' || typeof payload.vault !== 'string')
      throw new Error('Vault file fields have unexpected types');
    if (payload.salt)   await _vaultMetaSet(SALT_KEY,   payload.salt);
    if (payload.verify) await _vaultMetaSet(VERIFY_KEY, payload.verify);
    if (payload.vault)  await _vaultMetaSet(VAULT_KEY,  payload.vault);
    return true;
  } catch (err) {
    console.warn('[FS] Read failed:', (err as Error).message);
    return false;
  }
}

export async function fsPickFile(forceNew = false): Promise<FileSystemFileHandle | null> {
  try {
    if (!forceNew) {
      const picker = window.showOpenFilePicker;
      if (!picker) return null;
      const [picked] = await picker({
        types: [{ description: 'Nexus Vault', accept: { 'application/octet-stream': ['.vault'] } }],
        multiple: false,
      });
      _fsHandle = picked || null;
    } else {
      const picker = window.showSaveFilePicker;
      if (!picker) return null;
      _fsHandle = await picker({
        suggestedName: FS_FILENAME,
        types: [{ description: 'Nexus Vault', accept: { 'application/octet-stream': ['.vault'] } }],
      });
    }
    if (_fsHandle) await _idbSet(FS_HANDLE_KEY, _fsHandle);
    _fsReady = !!_fsHandle;
    return _fsHandle;
  } catch { return null; }
}

export async function fsUnlink(): Promise<void> {
  _fsHandle = null;
  _fsReady = false;
  _fsLastSave = null;
  const db = await _idbFsOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete(FS_HANDLE_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function fsSetHandle(handle: FileSystemFileHandle): Promise<void> {
  _fsHandle = handle;
  await _idbSet(FS_HANDLE_KEY, handle);
  _fsReady = true;
}

export async function fsInit(): Promise<void> {
  if (!window.showSaveFilePicker) return;
  try {
    const stored = await _idbGet(FS_HANDLE_KEY) as FileSystemFileHandle | null;
    if (stored) {
      _fsHandle = stored;
      const hasLocal = !!(await _vaultMetaGet(VAULT_KEY));
      if (!hasLocal) {
        const ok = await _verifyPermission(_fsHandle, false);
        if (ok) {
          const recovered = await fsReadVault(_fsHandle);
          if (recovered) console.info('[FS] Data recovered from disk file after cache clear');
        }
      }
      const canWrite = await _verifyPermission(_fsHandle, true).catch(() => false);
      _fsReady = canWrite;
    }
  } catch (err) {
    console.warn('[FS] Init failed:', (err as Error).message);
  }
}
