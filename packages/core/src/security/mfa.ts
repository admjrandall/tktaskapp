// ── MFA — TOTP configuration storage (SEC-12) ─────────────────────────────────
// Stores TOTP config encrypted in nexus_data_v1 under __mfa_totp__.
// Loaded/saved via injected IDB hooks (same pattern as AI secrets).

import { verifyTOTPCode, base32Encode, generateTOTPSecret } from './totp.js'

export interface TOTPConfig {
  id: '__mfa_totp__'
  secret: string // base32-encoded secret
  enabled: boolean
  addedAt: string // ISO
  lastVerifiedAt?: string // ISO — updated on each successful verification
}

// ── Hook injection ─────────────────────────────────────────────────────────────
let _getKey: () => CryptoKey | null = () => null
let _putRecord: (store: string, rec: Record<string, unknown>) => Promise<void> = async () => {}
let _loadStore: (store: string) => Promise<Record<string, unknown>[]> = () => Promise.resolve([])

export function setMFAHooks(hooks: {
  getKey: () => CryptoKey | null
  putRecord: (store: string, rec: Record<string, unknown>) => Promise<void>
  loadStore: (store: string) => Promise<Record<string, unknown>[]>
}): void {
  _getKey = hooks.getKey
  _putRecord = hooks.putRecord
  _loadStore = hooks.loadStore
}

// ── Load / Save TOTP config ────────────────────────────────────────────────────

export async function loadTOTPConfig(): Promise<TOTPConfig | null> {
  if (!_getKey()) return null
  try {
    const records = await _loadStore('documents')
    const rec = records.find((r: Record<string, unknown>) => r['id'] === '__mfa_totp__') as
      | TOTPConfig
      | undefined
    return rec || null
  } catch {
    return null
  }
}

export async function saveTOTPConfig(cfg: TOTPConfig): Promise<void> {
  const key = _getKey()
  if (!key) throw new Error('No crypto key available')
  await _putRecord('documents', cfg as unknown as Record<string, unknown>)
}

export async function enableTOTP(secretB32: string): Promise<void> {
  const cfg: TOTPConfig = {
    id: '__mfa_totp__',
    secret: secretB32,
    enabled: true,
    addedAt: new Date().toISOString(),
  }
  await saveTOTPConfig(cfg)
}

export async function disableTOTP(): Promise<void> {
  const key = _getKey()
  if (!key) return
  // Overwrite with disabled config (don't delete — we keep the record but mark disabled)
  await _putRecord('documents', {
    id: '__mfa_totp__',
    secret: '',
    enabled: false,
    addedAt: '',
  })
}

export function generateNewTOTPSecret(): Promise<string> {
  return Promise.resolve(base32Encode(generateTOTPSecret()))
}

/**
 * Load MFA status for use during auth flow.
 */
export interface MFAStatus {
  totpEnabled: boolean
  totpSecret: string
}

export async function loadMFAStatus(): Promise<MFAStatus> {
  const cfg = await loadTOTPConfig()
  return {
    totpEnabled: cfg?.enabled === true && !!cfg.secret,
    totpSecret: cfg?.secret || '',
  }
}

/**
 * Verify a TOTP code. Returns true on match; updates lastVerifiedAt.
 */
export async function verifyMFA(userCode: string): Promise<boolean> {
  const cfg = await loadTOTPConfig()
  if (!cfg || !cfg.enabled || !cfg.secret) return false
  const ok = await verifyTOTPCode(cfg.secret, userCode)
  if (ok) {
    await saveTOTPConfig({ ...cfg, lastVerifiedAt: new Date().toISOString() })
  }
  return ok
}
