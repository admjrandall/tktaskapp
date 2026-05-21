// ── IndexedDB for Documents + Conversations ────────────────────────────
// Extracted from taskapp.html ~2964–3040
// STRUCTURAL CHANGE (migration plan §12.2.4): cryptoKey is now passed as
// a parameter rather than read from a global `_dbKey`. This removes a
// hidden cross-module dependency.

import { DATA_DB_NAME } from '../constants.js'
import { aesEncrypt, aesDecrypt } from '../security/crypto.js'

function _dataDbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DATA_DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('documents'))
        db.createObjectStore('documents', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('conversations'))
        db.createObjectStore('conversations', { keyPath: 'id' })
    }
    req.onsuccess = (e) => {
      res((e.target as IDBOpenDBRequest).result)
    }
    req.onerror = () => {
      rej(req.error ?? new Error('IDB open failed'))
    }
  })
}

// Load all records from an IDB store (each record is individually encrypted)
export async function _idbLoadStore(storeName: string, cryptoKey: CryptoKey): Promise<unknown[]> {
  try {
    const db = await _dataDbOpen()
    const records = await new Promise<Array<{ id: string; enc: string }>>((res, rej) => {
      const tx = db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).getAll()
      req.onsuccess = () => {
        res(req.result as Array<{ id: string; enc: string }>)
      }
      req.onerror = () => {
        rej(req.error ?? new Error('IDB open failed'))
      }
    })
    const decrypted = await Promise.all(
      records.map(async (r) => {
        try {
          return await aesDecrypt(cryptoKey, r.enc)
        } catch {
          console.warn(`[idb] Failed to decrypt ${storeName}/${r.id}`)
          return null
        }
      }),
    )
    return decrypted.filter(Boolean)
  } catch (e) {
    console.warn(`[idb] Could not load ${storeName}:`, (e as Error).message)
    return []
  }
}

// Write a single record to IDB (encrypted)
export async function _idbPutRecord(
  storeName: string,
  record: { id: string; [k: string]: unknown },
  cryptoKey: CryptoKey,
): Promise<void> {
  try {
    const enc = await aesEncrypt(cryptoKey, record)
    const db = await _dataDbOpen()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).put({ id: record.id, enc })
      tx.oncomplete = () => {
        res()
      }
      tx.onerror = () => {
        rej(tx.error ?? new Error('IDB transaction failed'))
      }
    })
  } catch (e) {
    console.warn(`[idb] Write failed for ${storeName}/${record.id}:`, (e as Error).message)
  }
}

// Delete a single record from IDB
export async function _idbDeleteRecord(storeName: string, id: string): Promise<void> {
  try {
    const db = await _dataDbOpen()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).delete(id)
      tx.oncomplete = () => {
        res()
      }
      tx.onerror = () => {
        rej(tx.error ?? new Error('IDB transaction failed'))
      }
    })
  } catch (e) {
    console.warn(`[idb] Delete failed for ${storeName}/${id}:`, (e as Error).message)
  }
}

// Clear all records from a specific IDB store (used by reset-app)
export async function _idbClearStore(storeName: string): Promise<void> {
  try {
    const db = await _dataDbOpen()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).clear()
      tx.oncomplete = () => {
        res()
      }
      tx.onerror = () => {
        rej(tx.error ?? new Error('IDB transaction failed'))
      }
    })
  } catch (e) {
    console.warn(`[idb] Clear failed for ${storeName}:`, (e as Error).message)
  }
}
