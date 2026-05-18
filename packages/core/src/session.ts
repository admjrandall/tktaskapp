// ── SESSION KEY STORE ──────────────────────────────────────────────────
// Extracted from taskapp.html ~2708–2755
// Session key via IndexedDB — non-extractable CryptoKey
// The CryptoKey object (extractable:false) is stored directly in IndexedDB.
// Unlike the old sessionStorage approach, raw key bytes never exist as a JS string.
// The IDB nexus_keys_v1 database is separate from the FS handle database.

import { KEYS_DB_NAME, SESSION_CRYPTOKEY_STORE } from './constants.js';

function _keysDbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(KEYS_DB_NAME, 1);
    req.onupgradeneeded = e => (e.target as IDBOpenDBRequest).result.createObjectStore(SESSION_CRYPTOKEY_STORE);
    req.onsuccess = e => res((e.target as IDBOpenDBRequest).result);
    req.onerror = () => rej(req.error);
  });
}

export async function cacheSessionKey(key: CryptoKey): Promise<void> {
  try {
    const db = await _keysDbOpen();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(SESSION_CRYPTOKEY_STORE, 'readwrite');
      tx.objectStore(SESSION_CRYPTOKEY_STORE).put(key, 'active');
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('[auth] cacheSessionKey failed:', (e as Error).message); }
}

export async function loadSessionKey(): Promise<CryptoKey | null> {
  try {
    const db = await _keysDbOpen();
    return await new Promise<CryptoKey | null>((res, rej) => {
      const tx = db.transaction(SESSION_CRYPTOKEY_STORE, 'readonly');
      const req = tx.objectStore(SESSION_CRYPTOKEY_STORE).get('active');
      req.onsuccess = () => res((req.result as CryptoKey | undefined) || null);
      req.onerror = () => rej(req.error);
    });
  } catch (e) { console.warn('[auth] loadSessionKey failed:', (e as Error).message); return null; }
}

export async function clearSessionKey(): Promise<void> {
  try {
    const db = await _keysDbOpen();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(SESSION_CRYPTOKEY_STORE, 'readwrite');
      tx.objectStore(SESSION_CRYPTOKEY_STORE).delete('active');
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('[auth] clearSessionKey failed:', (e as Error).message); }
}
