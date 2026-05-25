// Concrete vault adapter — Capacitor Filesystem (iOS / Android).
// Vault is written to the platform private app directory (excluded from cloud backup).
// Atomic write: temp file → rename, so a crash mid-write leaves the prior vault intact.
// The caller always passes AES-256-GCM ciphertext — this adapter never inspects the payload.

import { Filesystem, Directory } from '@capacitor/filesystem'
import { MobileVaultAdapter, type VaultReadResult } from './mobile-vault-adapter.js'

const VAULT_DIR = 'taskapp-vault'
const VAULT_FILE = 'vault.enc'
const VAULT_TEMP = 'vault.enc.tmp'

// Uint8Array.toBase64 ships in all major browsers since Sep 2025; chunked btoa
// fallback guards older runtimes. Never use btoa(String.fromCharCode(...array)) —
// it causes a RangeError stack overflow on large vault blobs (> ~65 KB).
function u8ToB64(data: Uint8Array): string {
  const anyU8 = data as unknown as { toBase64?: () => string }
  if (typeof anyU8.toBase64 === 'function') return anyU8.toBase64()
  const CHUNK = 65536
  let s = ''
  for (let i = 0; i < data.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, data.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(s)
}

function b64ToU8(b64: string): Uint8Array {
  const anyU8 = Uint8Array as unknown as { fromBase64?: (b: string) => Uint8Array }
  if (typeof anyU8.fromBase64 === 'function') return anyU8.fromBase64(b64)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export class CapacitorVaultAdapter extends MobileVaultAdapter {
  override async readVault(): Promise<VaultReadResult | null> {
    try {
      const result = await Filesystem.readFile({
        path: `${VAULT_DIR}/${VAULT_FILE}`,
        directory: Directory.Data,
      })
      const raw =
        typeof result.data === 'string'
          ? b64ToU8(result.data)
          : new Uint8Array(await result.data.arrayBuffer())
      const stat = await Filesystem.stat({
        path: `${VAULT_DIR}/${VAULT_FILE}`,
        directory: Directory.Data,
      })
      return { data: raw, modifiedAt: new Date(stat.mtime).toISOString() }
    } catch {
      return null
    }
  }

  override async writeVault(data: Uint8Array): Promise<void> {
    const b64 = u8ToB64(data)
    await Filesystem.writeFile({
      path: `${VAULT_DIR}/${VAULT_TEMP}`,
      data: b64,
      directory: Directory.Data,
      recursive: true,
    })
    await Filesystem.rename({
      from: `${VAULT_DIR}/${VAULT_TEMP}`,
      directory: Directory.Data,
      to: `${VAULT_DIR}/${VAULT_FILE}`,
      toDirectory: Directory.Data,
    })
  }

  override async deleteVault(): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `${VAULT_DIR}/${VAULT_FILE}`,
        directory: Directory.Data,
      })
    } catch {
      // Not found is acceptable
    }
  }

  override async vaultExists(): Promise<boolean> {
    try {
      await Filesystem.stat({
        path: `${VAULT_DIR}/${VAULT_FILE}`,
        directory: Directory.Data,
      })
      return true
    } catch {
      return false
    }
  }

  override getVaultDirectory(): string {
    return VAULT_DIR
  }
}
