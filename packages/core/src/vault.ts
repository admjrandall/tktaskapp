// ── VAULT ──────────────────────────────────────────────────────────────
// Extracted from taskapp.html ~2775–2954
// Vault meta store + load/save + initCrypto + password change + backups.
// initCrypto lives here (rather than crypto.ts) because it composes
// loadVault/saveVault/writeVerifyToken — keeping it here avoids a
// circular import with crypto.ts.

import {
  SALT_KEY, VERIFY_KEY, VAULT_KEY, VERIFY_PAYLOAD,
  KDF_VERSION_KEY, VAULT_DB_NAME, VAULT_META_STORE,
  SALT_BYTES, STORES, IDB_STORES,
} from './constants.js';
import {
  u8ToBase64, base64ToU8, aesEncrypt, aesDecrypt, deriveKey,
} from './crypto.js';
import { PBKDF2_ITERATIONS, PBKDF2_ITERATIONS_LEGACY } from './constants.js';

export function _vaultDbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(VAULT_DB_NAME, 1);
    req.onupgradeneeded = e => (e.target as IDBOpenDBRequest).result.createObjectStore(VAULT_META_STORE);
    req.onsuccess = e => res((e.target as IDBOpenDBRequest).result);
    req.onerror = () => rej(req.error);
  });
}

export async function _vaultMetaGet(k: string): Promise<unknown> {
  try {
    const db = await _vaultDbOpen();
    return await new Promise<unknown>((res, rej) => {
      const tx = db.transaction(VAULT_META_STORE, 'readonly');
      const req = tx.objectStore(VAULT_META_STORE).get(k);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
  } catch { return null; }
}

export async function _vaultMetaSet(k: string, v: unknown): Promise<void> {
  try {
    const db = await _vaultDbOpen();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(VAULT_META_STORE, 'readwrite');
      tx.objectStore(VAULT_META_STORE).put(v, k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.error(`[vault] Failed to write "${k}" to IDB:`, (e as Error)?.message);
    throw new Error(`Vault storage write failed for "${k}". Check available disk space.`);
  }
}

// ── One-time migration: localStorage → IndexedDB ───────────────────────
// Runs silently on first load after upgrade. Cleans up old localStorage
// keys once data is safely in IDB. Safe to call multiple times.
export async function _migrateLocalStorageToIDB(): Promise<void> {
  const hasIdb = await _vaultMetaGet(SALT_KEY);
  if (hasIdb) return; // already migrated
  const lsSalt   = localStorage.getItem(SALT_KEY);
  const lsVerify = localStorage.getItem(VERIFY_KEY);
  const lsVault  = localStorage.getItem(VAULT_KEY);
  const lsKdf    = localStorage.getItem(KDF_VERSION_KEY);
  if (lsSalt)   await _vaultMetaSet(SALT_KEY,        lsSalt);
  if (lsVerify) await _vaultMetaSet(VERIFY_KEY,      lsVerify);
  if (lsVault)  await _vaultMetaSet(VAULT_KEY,       lsVault);
  if (lsKdf)    await _vaultMetaSet(KDF_VERSION_KEY, lsKdf);
  localStorage.removeItem(SALT_KEY);
  localStorage.removeItem(VERIFY_KEY);
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(KDF_VERSION_KEY);
  if (lsSalt || lsVault) console.info('[vault] Migrated from localStorage to IndexedDB.');
}

// ── Salt management ────────────────────────────────────────────────────
export async function getSalt(): Promise<Uint8Array> {
  const s = await _vaultMetaGet(SALT_KEY);
  if (s) return base64ToU8(s as string);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  await _vaultMetaSet(SALT_KEY, u8ToBase64(salt));
  return salt;
}
export async function isFirstRun(): Promise<boolean> {
  return !(await _vaultMetaGet(SALT_KEY));
}

// ── Vault load/save (CRM data — stored in IndexedDB) ───────────────────
export async function loadVault(key: CryptoKey): Promise<Record<string, unknown[]>> {
  const b64 = await _vaultMetaGet(VAULT_KEY);
  if (!b64) return {};
  try {
    return (await aesDecrypt(key, b64 as string)) as Record<string, unknown[]>;
  } catch (err) {
    console.error('[vault] Decryption failed — vault may be corrupt:', (err as Error).message);
    throw new Error('Vault decryption failed. Your data may be corrupted. Do not save until resolved.');
  }
}

export async function saveVault(key: CryptoKey, data: Record<string, unknown[]>): Promise<void> {
  await _vaultMetaSet(VAULT_KEY, await aesEncrypt(key, data));
}

export async function writeVerifyToken(key: CryptoKey): Promise<void> {
  await _vaultMetaSet(VERIFY_KEY, await aesEncrypt(key, VERIFY_PAYLOAD));
}

export async function verifyPassword(key: CryptoKey): Promise<boolean> {
  const b64 = await _vaultMetaGet(VERIFY_KEY);
  if (!b64) return false;
  try {
    const decrypted = await aesDecrypt(key, b64 as string);
    if (typeof decrypted !== 'string') return false;
    // Constant-time byte comparison — prevents timing side-channel attacks.
    const enc = new TextEncoder();
    const a = enc.encode(decrypted);
    const b = enc.encode(VERIFY_PAYLOAD);
    if (a.byteLength !== b.byteLength) return false;
    let diff = 0;
    for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!;
    return diff === 0;
  } catch { return false; }
}

// ── initCrypto with PBKDF2 migration ───────────────────────────────────
// Called on unlock. If the vault was created with the old 310k iteration count,
// this transparently re-derives at 600k and re-encrypts everything on next save.
// Migration is silent — user notices no difference.
export async function initCrypto(password: string): Promise<CryptoKey> {
  const salt = await getSalt();
  const kdfVersion = await _vaultMetaGet(KDF_VERSION_KEY);
  const isLegacy = kdfVersion === '1';
  const hasVault = !!(await _vaultMetaGet(VAULT_KEY));
  const isNew = !hasVault;

  if (isNew) {
    await _vaultMetaSet(KDF_VERSION_KEY, '2');
    return deriveKey(password, salt, PBKDF2_ITERATIONS);
  }

  if (isLegacy) {
    const legacyKey = await deriveKey(password, salt, PBKDF2_ITERATIONS_LEGACY);
    const isValid = await verifyPassword(legacyKey).catch(() => false);
    if (!isValid) throw new Error('Incorrect password');
    console.info('[crypto] Migrating vault from 310k to 600k PBKDF2 iterations…');
    const vault = await loadVault(legacyKey);
    const newSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    await _vaultMetaSet(SALT_KEY, u8ToBase64(newSalt));
    const newKey = await deriveKey(password, newSalt, PBKDF2_ITERATIONS);
    await saveVault(newKey, vault);
    await writeVerifyToken(newKey);
    await _vaultMetaSet(KDF_VERSION_KEY, '2');
    console.info('[crypto] Migration complete.');
    return newKey;
  }

  if (!kdfVersion) {
    await _vaultMetaSet(KDF_VERSION_KEY, '1');
    return initCrypto(password);
  }

  return deriveKey(password, salt, PBKDF2_ITERATIONS);
}

// ── Password change ────────────────────────────────────────────────────
export async function changePassword(oldKey: CryptoKey, newPw: string): Promise<CryptoKey> {
  const vault = await loadVault(oldKey);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  await _vaultMetaSet(SALT_KEY, u8ToBase64(salt));
  const newKey = await deriveKey(newPw, salt, PBKDF2_ITERATIONS);
  await saveVault(newKey, vault);
  await writeVerifyToken(newKey);
  await _vaultMetaSet(KDF_VERSION_KEY, '2');
  return newKey;
}

// ── Backup export / import ─────────────────────────────────────────────
export async function exportEncryptedBackup(key: CryptoKey, pw: string): Promise<string> {
  const vault = await loadVault(key);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const ek = await deriveKey(pw, salt, PBKDF2_ITERATIONS);
  return JSON.stringify({
    v: 1,
    salt: u8ToBase64(salt),
    data: await aesEncrypt(ek, vault),
    ts: new Date().toISOString(),
  });
}

export async function importEncryptedBackup(
  json: string, pw: string, currentKey: CryptoKey,
): Promise<unknown> {
  const p = JSON.parse(json);
  if (p.v !== 1) throw new Error('Unknown backup version');
  const salt = base64ToU8(p.salt);
  let vault: unknown;
  let legacyKdfUsed = false;
  try {
    vault = await aesDecrypt(await deriveKey(pw, salt, PBKDF2_ITERATIONS), p.data);
  } catch {
    vault = await aesDecrypt(await deriveKey(pw, salt, PBKDF2_ITERATIONS_LEGACY), p.data);
    legacyKdfUsed = true;
  }
  if (legacyKdfUsed) {
    console.warn('[vault] importEncryptedBackup: backup used legacy 310k-iteration KDF. Consider exporting a fresh backup after this import.');
  }
  await saveVault(currentKey, vault as Record<string, unknown[]>);
  return { vault, legacyKdfUsed };
}

export async function exportJSON(key: CryptoKey): Promise<string> {
  return JSON.stringify(await loadVault(key), null, 2);
}

export async function importJSON(json: string, key: CryptoKey): Promise<unknown> {
  let v: unknown;
  try { v = JSON.parse(json); }
  catch { throw new Error('Invalid JSON — file may be corrupted'); }
  if (typeof v !== 'object' || Array.isArray(v) || v === null) {
    throw new Error('Invalid import format: expected an object');
  }
  const validStores = new Set([...STORES, ...IDB_STORES]);
  for (const [k, arr] of Object.entries(v as Record<string, unknown>)) {
    if (!validStores.has(k)) throw new Error(`Unknown store in import: "${k}"`);
    if (!Array.isArray(arr)) throw new Error(`Store "${k}" must be an array`);
  }
  // IDB-backed stores (documents, conversations) are individually encrypted in
  // nexus_data_v1 and cannot be bulk-imported through the vault blob — exclude them.
  const vaultData: Record<string, unknown[]> = {};
  const skippedIdb: string[] = [];
  for (const [k, arr] of Object.entries(v as Record<string, unknown[]>)) {
    if (STORES.includes(k)) {
      vaultData[k] = arr;
    } else {
      skippedIdb.push(k);
    }
  }
  if (skippedIdb.length > 0) {
    console.warn(`[vault] importJSON: skipped IDB-backed stores (${skippedIdb.join(', ')}) — per-record encryption prevents bulk vault import.`);
  }
  await saveVault(key, vaultData);
  return vaultData;
}
