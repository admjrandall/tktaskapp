// Concrete backup/export adapter — Capacitor (iOS / Android).
// Uses the Web Share API Level 2 (available in Capacitor WebViews via the platform share sheet)
// for export, and a hidden <input type="file"> for import.
// The dry-run parser validates the vault JSON envelope without touching the live vault.
//
// Platform notes:
//   iOS 15+:   Web Share API with files → UIActivityViewController
//   Android:   Web Share API with files → Android Intent ACTION_SEND
//   Fallback:  @capacitor/filesystem → Directory.Documents (user-visible)
//
// MASVS-STORAGE-1: no plaintext data is ever written to Documents or shared via the share sheet.
// The caller always passes AES-256-GCM ciphertext — this adapter never inspects the payload.

import { Filesystem, Directory } from '@capacitor/filesystem'
import {
  MobileBackupAdapter,
  type BackupImportResult,
  type DryRunResult,
} from './mobile-backup-adapter.js'

// Vault JSON envelope fields (schema v2 — see storage/vault.ts)
interface VaultEnvelope {
  v: number
  salt?: string
  verify?: string
  vault?: string
  createdAt?: string
}

function _u8ToB64(data: Uint8Array): string {
  const anyU8 = data as unknown as { toBase64?: () => string }
  if (typeof anyU8.toBase64 === 'function') return anyU8.toBase64()
  const CHUNK = 65536
  let s = ''
  for (let i = 0; i < data.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, data.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(s)
}

export class CapacitorBackupAdapter extends MobileBackupAdapter {
  // ── Export ──────────────────────────────────────────────────────────────────

  override async exportVault(data: Uint8Array, suggestedFilename: string): Promise<void> {
    await this._shareBytes(data, suggestedFilename, 'application/octet-stream')
  }

  override async exportAuditLog(data: Uint8Array, suggestedFilename: string): Promise<void> {
    // Determine MIME type from filename extension (.csv or .jsonl)
    const mime = suggestedFilename.endsWith('.csv') ? 'text/csv' : 'application/x-ndjson'
    await this._shareBytes(data, suggestedFilename, mime)
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  override importVault(): Promise<BackupImportResult | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.vault,application/octet-stream'
      input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
      document.body.appendChild(input)

      const cleanup = () => {
        try {
          document.body.removeChild(input)
        } catch {
          // already removed
        }
      }

      input.addEventListener('change', async () => {
        const file = input.files?.[0] ?? null
        cleanup()
        if (!file) {
          resolve(null)
          return
        }
        try {
          const buffer = await file.arrayBuffer()
          resolve({
            data: new Uint8Array(buffer),
            filename: file.name,
            importedAt: new Date().toISOString(),
          })
        } catch {
          resolve(null)
        }
      })

      // iOS Safari fires 'cancel' on the input when the user dismisses without picking.
      // Standard browsers (and Capacitor WebView) also fire 'cancel' since Chrome 113+.
      input.addEventListener('cancel', () => {
        cleanup()
        resolve(null)
      })

      input.click()
    })
  }

  // ── Dry-run import ──────────────────────────────────────────────────────────

  override dryRunImport(data: Uint8Array): Promise<DryRunResult> {
    return new Promise((resolve, reject) => {
      if (data.length === 0) {
        reject(new Error('Empty backup file — not a valid vault.'))
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(new TextDecoder().decode(data))
      } catch {
        reject(new Error('Backup file is not valid JSON — not a Task App CRM vault.'))
        return
      }

      if (typeof parsed !== 'object' || parsed === null) {
        reject(new Error('Unexpected vault format — root must be a JSON object.'))
        return
      }

      const env = parsed as Partial<VaultEnvelope>

      if (typeof env.v !== 'number') {
        reject(new Error("Missing 'v' schema version field — not a valid Task App CRM vault."))
        return
      }
      if (!env.vault && !env.salt) {
        reject(new Error("Missing 'vault' or 'salt' field — not a valid Task App CRM vault."))
        return
      }

      resolve({
        schemaVersion: env.v,
        recordCounts: {},
        vaultCreatedAt:
          typeof env.createdAt === 'string' ? env.createdAt : new Date().toISOString(),
      })
    })
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async _shareBytes(data: Uint8Array, filename: string, mimeType: string): Promise<void> {
    // Primary path: Web Share API Level 2 (files) — Capacitor bridges to native share sheet.
    // Available on iOS 15+ and Android via WebView. `navigator.canShare` guards older devices.
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      const file = new File(
        [data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer],
        filename,
        { type: mimeType },
      )
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
        return
      }
    }

    // Fallback: write to the user-visible Documents directory.
    // On iOS, Documents is visible via Files app. On Android, it maps to external storage.
    // This fallback is intentionally not the primary path because it leaves a persistent file.
    const b64 = _u8ToB64(data)
    await Filesystem.writeFile({
      path: filename,
      data: b64,
      directory: Directory.Documents,
      recursive: false,
    })
    // Surface the save location to the caller via rejection so the UI can inform the user.
    throw new Error(
      `Web Share API unavailable — file saved to Documents/${filename}. ` +
        'Open the Files app to find it.',
    )
  }
}
