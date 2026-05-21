// ── SESSION KEY STORE ──────────────────────────────────────────────────
// Extracted from taskapp.html ~2708–2755
// Session key via IndexedDB — non-extractable CryptoKey
// The CryptoKey object (extractable:false) is stored directly in IndexedDB.
// Unlike the old sessionStorage approach, raw key bytes never exist as a JS string.
// The IDB nexus_keys_v1 database is separate from the FS handle database.

import { KEYS_DB_NAME, SESSION_CRYPTOKEY_STORE } from '../constants.js'

// sessionStorage sentinel: set when a key is cached, cleared on explicit logout.
// Because sessionStorage is cleared when the tab is closed (but preserved on F5),
// a missing sentinel at startup means the previous session tab was closed and the
// IDB-persisted CryptoKey must be discarded before we try to use it.
const _SESSION_SENTINEL = 'nexus_session_active'

export function hasSessionSentinel(): boolean {
  return sessionStorage.getItem(_SESSION_SENTINEL) === '1'
}

function _keysDbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(KEYS_DB_NAME, 1)
    req.onupgradeneeded = (e) =>
      (e.target as IDBOpenDBRequest).result.createObjectStore(SESSION_CRYPTOKEY_STORE)
    req.onsuccess = (e) => {
      res((e.target as IDBOpenDBRequest).result)
    }
    req.onerror = () => {
      rej(req.error ?? new Error('IDB open failed'))
    }
  })
}

export async function cacheSessionKey(key: CryptoKey): Promise<void> {
  try {
    const db = await _keysDbOpen()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(SESSION_CRYPTOKEY_STORE, 'readwrite')
      tx.objectStore(SESSION_CRYPTOKEY_STORE).put(key, 'active')
      tx.oncomplete = () => {
        res()
      }
      tx.onerror = () => {
        rej(tx.error ?? new Error('IDB transaction failed'))
      }
    })
    sessionStorage.setItem(_SESSION_SENTINEL, '1')
  } catch (e) {
    console.warn('[auth] cacheSessionKey failed:', (e as Error).message)
  }
}

export async function loadSessionKey(): Promise<CryptoKey | null> {
  try {
    const db = await _keysDbOpen()
    return await new Promise<CryptoKey | null>((res, rej) => {
      const tx = db.transaction(SESSION_CRYPTOKEY_STORE, 'readonly')
      const req = tx.objectStore(SESSION_CRYPTOKEY_STORE).get('active')
      req.onsuccess = () => {
        res((req.result as CryptoKey | undefined) || null)
      }
      req.onerror = () => {
        rej(req.error ?? new Error('IDB open failed'))
      }
    })
  } catch (e) {
    console.warn('[auth] loadSessionKey failed:', (e as Error).message)
    return null
  }
}

export async function clearSessionKey(): Promise<void> {
  try {
    const db = await _keysDbOpen()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(SESSION_CRYPTOKEY_STORE, 'readwrite')
      tx.objectStore(SESSION_CRYPTOKEY_STORE).delete('active')
      tx.oncomplete = () => {
        res()
      }
      tx.onerror = () => {
        rej(tx.error ?? new Error('IDB transaction failed'))
      }
    })
  } catch (e) {
    console.warn('[auth] clearSessionKey failed:', (e as Error).message)
  }
  sessionStorage.removeItem(_SESSION_SENTINEL)
}
