// ── CRYPTO ─────────────────────────────────────────────────────────────
// Extracted from taskapp.html ~2681–2769
// PBKDF2-HMAC-SHA-256 (600,000 iterations) + AES-256-GCM
// Keys are non-extractable; never exist as JS strings.
//
// Higher-level functions that compose loadVault/saveVault (initCrypto,
// changePassword, exportEncryptedBackup, importEncryptedBackup,
// exportJSON, importJSON) live in vault.ts to avoid circular imports.

import { PBKDF2_ITERATIONS, IV_BYTES } from './constants.js';

// ── Base64 helpers (2026) ──────────────────────────────────────────────
// Uint8Array.toBase64 / fromBase64 ship in all major browsers since
// September 2025 (MDN). Chunked btoa/atob fallbacks guard older browsers.
// These replace all btoa(String.fromCharCode(...array)) calls which
// cause a RangeError stack overflow on large arrays (>~65KB).
export function u8ToBase64(u8: Uint8Array): string {
  const anyU8 = u8 as unknown as { toBase64?: () => string };
  if (typeof anyU8.toBase64 === 'function') return anyU8.toBase64();
  const CHUNK = 65536;
  let s = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(s);
}
export function base64ToU8(b64: string): Uint8Array {
  const anyU8 = Uint8Array as unknown as { fromBase64?: (b: string) => Uint8Array };
  if (typeof anyU8.fromBase64 === 'function') return anyU8.fromBase64(b64);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// TypeScript 5.7+ requires BufferSource arguments to be backed by ArrayBuffer
// (not SharedArrayBuffer). The WebCrypto API accepts any Uint8Array at runtime;
// this helper performs the structural cast without copying.
const bs = (u: Uint8Array | ArrayBuffer): BufferSource => u as unknown as BufferSource;

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey(
    'raw', bs(enc.encode(password)), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  // extractable: false — key bytes never leave WebCrypto subsystem.
  // Reload persistence handled via non-extractable CryptoKey stored in IndexedDB (see cacheSessionKey).
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── AES-GCM encrypt / decrypt ──────────────────────────────────────────
export async function aesEncrypt(key: CryptoKey, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bs(iv) },
    key,
    bs(new TextEncoder().encode(JSON.stringify(data)))
  );
  const r = new Uint8Array(IV_BYTES + ct.byteLength);
  r.set(iv, 0);
  r.set(new Uint8Array(ct), IV_BYTES);
  return u8ToBase64(r);
}
export async function aesDecrypt(key: CryptoKey, b64: string): Promise<unknown> {
  const bytes = base64ToU8(b64);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bs(bytes.slice(0, IV_BYTES)) },
    key,
    bs(bytes.slice(IV_BYTES))
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
