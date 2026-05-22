// ── App lock + idle detection (SEC-01, NIST AC-11) ────────────────────────────
import { getState, setState } from './state.js'
import { cacheSessionKey, clearSessionKey } from './security/session.js'
import { clearDbState } from './storage/db.js'
import { fsUnlink } from './storage/fs.js'
import { auditLog } from './security/audit.js'
import { renderAuth, bindAuth } from './security/auth.js'
import { disconnectAI as resetAIConnection } from './ai/ai-runtime.js'
import { aiSecretsWipe } from './ai/ai-settings.js'

let _lockTimeoutMs = (() => {
  const raw = localStorage.getItem('taskapp_lock_timeout')
  const mins = raw !== null ? parseInt(raw, 10) : 15
  return mins > 0 ? mins * 60 * 1000 : 0
})()
let _idleTimer: ReturnType<typeof setTimeout> | null = null
export let _lastActivityAt = Date.now()

// Injected by bootstrap — allows lockApp to re-show auth with the same afterUnlock handler.
let _onAuthSuccess: ((key: CryptoKey) => Promise<void>) | null = null

export function setOnAuthSuccess(fn: (key: CryptoKey) => Promise<void>): void {
  _onAuthSuccess = fn
}

export function setLockTimeout(minutes: number): void {
  localStorage.setItem('taskapp_lock_timeout', String(minutes))
  _lockTimeoutMs = minutes > 0 ? minutes * 60 * 1000 : 0
  _resetIdleTimer()
}

export function _resetIdleTimer(): void {
  if (_idleTimer) {
    clearTimeout(_idleTimer)
    _idleTimer = null
  }
  if (!_lockTimeoutMs || !getState().authed) return
  _lastActivityAt = Date.now()
  _idleTimer = setTimeout(() => {
    lockApp('idle_timeout').catch(console.error)
  }, _lockTimeoutMs)
}

export async function lockApp(reason = 'manual'): Promise<void> {
  auditLog('app_locked', { reason })
  clearDbState()
  await clearSessionKey().catch(() => {})
  // Clear FS handle so the next user on a shared device cannot write to this vault (H3).
  await fsUnlink().catch(() => {})
  try {
    void resetAIConnection()
  } catch {
    /* non-fatal */
  }
  try {
    await aiSecretsWipe()
  } catch {
    /* non-fatal */
  }
  if (_idleTimer) {
    clearTimeout(_idleTimer)
    _idleTimer = null
  }
  setState({ authed: false, cryptoKey: null })
  const el = document.getElementById('app')
  if (!el) return
  el.innerHTML = await renderAuth()
  const handler = _onAuthSuccess
  bindAuth(el, async (key) => {
    await cacheSessionKey(key)
    if (handler) await handler(key)
  })
}
