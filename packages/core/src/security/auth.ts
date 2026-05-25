// ── AUTH ──────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines ~7527–7681.
// renderAuth is async because isFirstRun() is async in the module version.

import { initCrypto, verifyPassword, writeVerifyToken } from './vault.js'
import { _migrateLocalStorageToIDB, isFirstRun } from './vault.js'
import {
  cacheSessionKey as _cacheSessionKey,
  loadSessionKey as _loadSessionKey,
} from './session.js'
import { setState as _setState, getState as _getState, showToast as _showToast } from '../state.js'
import { escH as _escH } from '../utils.js'
import { Icons } from '../ui/icons.js'
import { fsInit as _fsInit, fsSetHandle } from '../storage/fs.js'
import { SALT_KEY, VERIFY_KEY, VAULT_KEY } from '../constants.js'
import { _vaultMetaSet } from './vault.js'
import { totpSecondsRemaining, verifyTOTPCode } from './totp.js'
import { auditedStaticHtml, setAuditedStaticHtml } from '../render-utils.js'
import { MASTER_PASSWORD_MIN_LENGTH, validateMasterPassword } from './master-password-policy.js'
import { isWebAuthnAvailable, registerPasskey, type PasskeyCredential } from './webauthn.js'

// ── MFA IDB hooks — injected from main.ts after dbInit wires up ───────────────
type IdbLoadFn = (store: string, key: CryptoKey) => Promise<Record<string, unknown>[]>
let _idbLoadStore: IdbLoadFn | null = null
export function setAuthIDBHooks(hooks: { idbLoadStore: IdbLoadFn }): void {
  _idbLoadStore = hooks.idbLoadStore
}

// ── Passkey save hook — injected from bootstrap.ts ─────────────────────────────
// Allows the passkey-setup step shown after first-run vault creation to persist
// the credential directly with the freshly derived key (state.cryptoKey is null
// at this point — the hook bypasses the hook-based webauthn.ts helpers).
type SavePasskeyFn = (cred: PasskeyCredential, key: CryptoKey) => Promise<void>
let _savePasskeyForAuth: SavePasskeyFn | null = null
export function setAuthPasskeyHook(fn: SavePasskeyFn): void {
  _savePasskeyForAuth = fn
}

// ── Audit log hook ─────────────────────────────────────────────────────────────
let _auditLog: ((event: string, details?: Record<string, string>) => void) | null = null
export function setAuthAuditHook(
  fn: (event: string, details?: Record<string, string>) => void,
): void {
  _auditLog = fn
}
function _audit(event: string, details?: Record<string, string>): void {
  _auditLog?.(event, details)
}

// ── Brute-force lockout state (localStorage — persists across tab close to prevent bypass) ─
// NIST AC-7: lockout must survive tab close; sessionStorage is cleared on tab close and
// could be bypassed by simply reopening the browser tab.
const _LS_FAIL_COUNT = 'nexus_auth_fail_count'
const _LS_LOCKED_UNTIL = 'nexus_auth_locked_until'

function _getFailCount(): number {
  return parseInt(localStorage.getItem(_LS_FAIL_COUNT) || '0', 10) || 0
}
function _getLockedUntil(): number {
  return parseInt(localStorage.getItem(_LS_LOCKED_UNTIL) || '0', 10) || 0
}
function _setFailCount(n: number): void {
  localStorage.setItem(_LS_FAIL_COUNT, String(n))
}
function _setLockedUntil(n: number): void {
  localStorage.setItem(_LS_LOCKED_UNTIL, String(n))
}
function _resetLockout(): void {
  localStorage.removeItem(_LS_FAIL_COUNT)
  localStorage.removeItem(_LS_LOCKED_UNTIL)
}

// Exported so re-authentication surfaces (admin console, step-up prompts) share the
// same lockout state and exponential-backoff policy as the primary login flow.
export function getAuthLockedUntil(): number {
  return _getLockedUntil()
}
export function recordAuthFailure(): { count: number; lockDelay: number } {
  const newCount = _getFailCount() + 1
  _setFailCount(newCount)
  const delay = Math.min(30000, 500 * Math.pow(2, newCount - 1))
  _setLockedUntil(Date.now() + delay)
  return { count: newCount, lockDelay: delay }
}
export function resetAuthLockout(): void {
  _resetLockout()
}

export async function renderAuth(): Promise<string> {
  const fr = await isFirstRun()
  const importBtn = `
    <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,.1);text-align:center">
      <p style="font-size:.75rem;color:#475569;margin-bottom:.625rem">Have an existing vault file?</p>
      <button type="button" id="open-vault-btn" class="btn btn-secondary" style="width:100%;background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12);color:#94a3b8">
        ${Icons.Upload(14)} Open Vault File (.vault)
      </button>
      <div id="vault-loaded-msg" style="display:none;margin-top:.5rem;font-size:.75rem;color:#10b981">✓ Vault file loaded — enter your password above</div>
    </div>`

  return `<div class="auth-screen"><div class="auth-card">
    <div class="auth-logo">Task App <span>CRM</span></div>
    <div class="auth-subtitle">${fr ? 'Create your master password to get started' : 'Enter your password to unlock'}</div>
    <form id="auth-form" autocomplete="off" style="display:flex;flex-direction:column;gap:1rem">
      <div class="form-group">
        <label class="form-label" style="color:#94a3b8">Password</label>
        <div style="position:relative">
          <input class="input" type="password" id="auth-password"
            placeholder="${fr ? 'Choose a strong password' : 'Enter your password'}"
            autocomplete="${fr ? 'new-password' : 'current-password'}"
            style="background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12);color:#fff;padding-right:2.5rem"
            required minlength="${fr ? MASTER_PASSWORD_MIN_LENGTH : 1}">
          <button type="button" id="toggle-pw" style="position:absolute;right:.625rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#64748b;padding:.25rem">
            ${Icons.Eye(16)}
          </button>
        </div>
      </div>
      ${
        fr
          ? `
      <div class="form-group">
        <label class="form-label" style="color:#94a3b8">Confirm Password</label>
        <input class="input" type="password" id="auth-confirm" autocomplete="new-password"
          style="background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12);color:#fff">
      </div>
      <div style="background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:10px;padding:.875rem;font-size:.8rem;color:#a5b4fc;line-height:1.6">
        <strong style="display:block;margin-bottom:.25rem">⚠️ Important</strong>
        Your password encrypts all data with AES-256-GCM.
        <strong>There is no recovery if you forget it.</strong>
      </div>`
          : ``
      }
      <div id="auth-error" style="display:none;color:#f87171;font-size:.8rem;text-align:center;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:.5rem"></div>
      <button type="submit" id="auth-submit" class="btn btn-primary" style="width:100%;height:44px;font-size:.9375rem">
        ${Icons.Lock(18)} <span id="auth-submit-label">${fr ? 'Create Vault' : 'Unlock'}</span>
      </button>
    </form>
    ${importBtn}
    <div style="margin-top:1.25rem;text-align:center;font-size:.75rem;color:#475569">
      Encrypted locally · No server required
    </div>
  </div></div>`
}

export function bindAuth(appEl: Element, onSuccess: (key: CryptoKey) => void): void {
  let showPw = false

  // ── Open existing vault file ──────────────────────────────────────────
  document.getElementById('open-vault-btn')?.addEventListener('click', async () => {
    try {
      if (window.showOpenFilePicker) {
        // File System Access API — preferred
        const handles = await window.showOpenFilePicker({
          types: [
            { description: 'Task App Vault', accept: { 'application/octet-stream': ['.vault'] } },
          ],
          multiple: false,
        })
        const handle = handles[0]
        if (!handle) return
        const file = await handle.getFile()
        const text = await file.text()
        const payload = JSON.parse(text) as {
          v: unknown
          salt: unknown
          verify: unknown
          vault: unknown
        }
        if (payload.v !== 2) throw new Error('Unknown vault version')
        if (
          typeof payload.salt !== 'string' ||
          typeof payload.verify !== 'string' ||
          typeof payload.vault !== 'string'
        )
          throw new Error(
            'Vault file fields have unexpected types — file may be corrupted or tampered',
          )
        if (payload.salt) await _vaultMetaSet(SALT_KEY, payload.salt)
        if (payload.verify) await _vaultMetaSet(VERIFY_KEY, payload.verify)
        if (payload.vault) await _vaultMetaSet(VAULT_KEY, payload.vault)
        // Store handle for future auto-saves
        await fsSetHandle(handle)
      } else {
        // Fallback: file input for browsers without File System Access API
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.vault'
        await new Promise<void>((res) => {
          input.onchange = () => {
            res()
          }
          input.click()
        })
        const file = input.files?.[0]
        if (!file) return
        const text = await file.text()
        const payload = JSON.parse(text) as {
          v: unknown
          salt: unknown
          verify: unknown
          vault: unknown
        }
        if (payload.v !== 2) throw new Error('Unknown vault version')
        if (
          typeof payload.salt !== 'string' ||
          typeof payload.verify !== 'string' ||
          typeof payload.vault !== 'string'
        )
          throw new Error(
            'Vault file fields have unexpected types — file may be corrupted or tampered',
          )
        if (payload.salt) await _vaultMetaSet(SALT_KEY, payload.salt)
        if (payload.verify) await _vaultMetaSet(VERIFY_KEY, payload.verify)
        if (payload.vault) await _vaultMetaSet(VAULT_KEY, payload.vault)
      }

      // Vault loaded — re-render auth screen (switches from first-run to unlock mode,
      // because IDB now has SALT_KEY so isFirstRun() returns false on the re-render).
      appEl.innerHTML = auditedStaticHtml(await renderAuth())
      bindAuth(appEl, onSuccess)
      const sub = document.querySelector('.auth-subtitle')
      if (sub) sub.textContent = 'Vault loaded — enter your password to unlock'
      const loadedMsg = document.getElementById('vault-loaded-msg')
      if (loadedMsg) {
        loadedMsg.style.display = 'block'
        loadedMsg.textContent = '✓ Vault file loaded — enter your password above'
      }
      const openBtn = document.getElementById('open-vault-btn')
      if (openBtn) {
        ;(openBtn as HTMLButtonElement).textContent = '✓ Vault loaded'
        openBtn.style.borderColor = '#10b981'
        openBtn.style.color = '#10b981'
      }
      setTimeout(
        () => (document.getElementById('auth-password') as HTMLInputElement | null)?.focus(),
        100,
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errEl = document.getElementById('auth-error')
        if (errEl) {
          errEl.textContent = 'Could not read vault file: ' + (err as Error).message
          errEl.style.display = 'block'
        }
      }
    }
  })

  document.getElementById('toggle-pw')?.addEventListener('click', () => {
    showPw = !showPw
    ;['auth-password', 'auth-confirm'].forEach((id) => {
      const el = document.getElementById(id) as HTMLInputElement | null
      if (el) el.type = showPw ? 'text' : 'password'
    })
    const toggleBtn = document.getElementById('toggle-pw')
    if (toggleBtn)
      toggleBtn.innerHTML = auditedStaticHtml(showPw ? Icons.EyeOff(16) : Icons.Eye(16))
  })

  setTimeout(
    () => (document.getElementById('auth-password') as HTMLInputElement | null)?.focus(),
    100,
  )

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fr = await isFirstRun()
    const pw = (document.getElementById('auth-password') as HTMLInputElement | null)?.value || ''
    const cf = (document.getElementById('auth-confirm') as HTMLInputElement | null)?.value || ''
    const errEl = document.getElementById('auth-error')
    const btn = document.getElementById('auth-submit') as HTMLButtonElement | null
    const lbl = document.getElementById('auth-submit-label')
    const showErr = (m: string) => {
      if (errEl) {
        errEl.textContent = m
        errEl.style.display = 'block'
      }
    }
    if (errEl) errEl.style.display = 'none'
    if (fr) {
      const passwordError = validateMasterPassword(pw)
      if (passwordError) {
        showErr(passwordError)
        return
      }
      if (pw !== cf) {
        showErr('Passwords do not match.')
        return
      }
    }
    if (btn) btn.disabled = true
    if (lbl) lbl.textContent = 'Unlocking…'
    try {
      const key = await initCrypto(pw)
      if (fr) {
        await writeVerifyToken(key)
        _audit('vault_created')
        // NIST SP 800-63B-4 §5.1.7 — offer passkey enrollment immediately after vault creation.
        // Only shown on secure contexts (https://) where WebAuthn PRF is available.
        if (isWebAuthnAvailable() && _savePasskeyForAuth) {
          _showPasskeySetupStep(appEl, pw, key, onSuccess)
        } else {
          onSuccess(key)
        }
      } else {
        // Check lockout before attempting verify
        if (Date.now() < _getLockedUntil()) {
          const secs = Math.ceil((_getLockedUntil() - Date.now()) / 1000)
          showErr(`Too many failed attempts. Try again in ${secs}s.`)
          if (btn) btn.disabled = false
          if (lbl) lbl.textContent = 'Unlock'
          return
        }
        if (!(await verifyPassword(key))) {
          const newCount = _getFailCount() + 1
          _setFailCount(newCount)
          const delay = Math.min(30000, 500 * Math.pow(2, newCount - 1))
          _setLockedUntil(Date.now() + delay)
          const secs = Math.ceil(delay / 1000)
          showErr(`Incorrect password.${newCount >= 3 ? ` Next attempt allowed in ${secs}s.` : ''}`)
          if (btn) btn.disabled = false
          if (lbl) lbl.textContent = 'Unlock'
          const pwEl = document.getElementById('auth-password') as HTMLInputElement | null
          if (pwEl) {
            pwEl.value = ''
            pwEl.focus()
          }
          _audit('auth_failure', { attempts: String(newCount) })
          return
        }
        _resetLockout()
        _audit('auth_success')
        // Check MFA before calling onSuccess
        await _checkMFAStep(appEl, key, onSuccess)
      }
    } catch (_err) {
      showErr('An error occurred. Please try again.')
      if (btn) btn.disabled = false
      if (lbl) lbl.textContent = fr ? 'Create Vault' : 'Unlock'
    }
  })
}

// ── Passkey setup step — shown inline in the auth screen after first-run ────────
// Replaces the auth card HTML (still within the auth screen — appEl is the root element)
// so the user sees this before the main app loads. The step is optional; skipping sets
// no permanent flag so a future settings nudge can remind the user.

function _showPasskeySetupStep(
  appEl: Element,
  masterPassword: string,
  key: CryptoKey,
  onSuccess: (key: CryptoKey) => void,
): void {
  setAuditedStaticHtml(
    appEl,
    `<div class="auth-screen"><div class="auth-card" style="max-width:420px">
      <div class="auth-logo">Task App <span>CRM</span></div>
      <div style="font-weight:600;font-size:1rem;margin-bottom:.5rem;text-align:center">Vault created</div>
      <p style="font-size:.875rem;color:#94a3b8;margin-bottom:.75rem;text-align:center">
        Secure fast unlock with a passkey — phishing-resistant biometric authentication
        recommended by NIST SP 800-63B-4 as your primary authenticator.
      </p>
      <ul style="font-size:.8125rem;color:#94a3b8;margin:0 0 1.25rem 1.25rem;padding:0">
        <li>Touch ID, Face ID, Windows Hello, or hardware security key</li>
        <li>No password to forget or reuse</li>
        <li>Works offline — your passkey stays on this device</li>
      </ul>
      <button id="passkey-setup-btn" class="btn btn-primary" style="width:100%;margin-bottom:.75rem">
        🔑 Set up passkey (recommended)
      </button>
      <button id="passkey-skip-btn" class="btn btn-ghost" style="width:100%;font-size:.8125rem">
        Skip — I'll set up a passkey later in Settings
      </button>
      <div id="passkey-setup-error" style="display:none;color:#f87171;font-size:.8125rem;margin-top:.75rem;text-align:center"></div>
    </div></div>`,
  )

  const showSetupErr = (msg: string) => {
    const el = document.getElementById('passkey-setup-error')
    if (el) {
      el.textContent = msg
      el.style.display = 'block'
    }
  }

  document.getElementById('passkey-setup-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('passkey-setup-btn') as HTMLButtonElement | null
    const errEl = document.getElementById('passkey-setup-error')
    if (errEl) errEl.style.display = 'none'
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Setting up passkey…'
    }
    try {
      const cred = await registerPasskey(masterPassword)
      await _savePasskeyForAuth!(cred, key)
      _audit('passkey_registered', { context: 'onboarding' })
      onSuccess(key)
    } catch (err) {
      if (btn) {
        btn.disabled = false
        btn.textContent = '🔑 Set up passkey (recommended)'
      }
      const msg = (err as Error).message.includes('PRF')
        ? 'Your device does not support the PRF extension required for passkey vault protection. You can try a different authenticator or set up a passkey later in Settings.'
        : (err as Error).message || 'Passkey setup failed. You can try again in Settings.'
      showSetupErr(msg)
    }
  })

  document.getElementById('passkey-skip-btn')?.addEventListener('click', () => {
    _audit('passkey_setup_skipped', { context: 'onboarding' })
    onSuccess(key)
  })
}

// ── MFA step (shown after password is verified) ────────────────────────────────
async function _checkMFAStep(
  appEl: Element,
  key: CryptoKey,
  onSuccess: (key: CryptoKey) => void,
): Promise<void> {
  // Load TOTP config using the verified key
  let totpEnabled = false
  let totpSecret = ''
  if (_idbLoadStore) {
    try {
      const docs = await _idbLoadStore('documents', key)
      const cfg = docs.find((r) => r['id'] === '__mfa_totp__') as
        | { secret: string; enabled: boolean }
        | undefined
      if (cfg?.enabled && cfg.secret) {
        totpEnabled = true
        totpSecret = cfg.secret
      }
    } catch {
      /* non-fatal — skip MFA if we can't load */
    }
  }

  if (!totpEnabled) {
    onSuccess(key)
    return
  }

  // Show TOTP step — replace the auth card content
  _showTOTPStep(appEl, key, totpSecret, onSuccess)
}

function _showTOTPStep(
  appEl: Element,
  key: CryptoKey,
  totpSecret: string,
  onSuccess: (key: CryptoKey) => void,
): void {
  const secs = totpSecondsRemaining()
  const card = appEl.querySelector('.auth-card')
  if (!card) {
    onSuccess(key)
    return
  }

  card.innerHTML = auditedStaticHtml(`
    <div class="auth-logo">Task App <span>CRM</span></div>
    <div class="auth-subtitle">Enter your 6-digit authenticator code</div>
    <form id="totp-form" autocomplete="off" style="display:flex;flex-direction:column;gap:1rem">
      <div class="form-group">
        <label class="form-label" style="color:#94a3b8">Authenticator Code</label>
        <input class="input" type="text" id="totp-code" inputmode="numeric" pattern="[0-9]*"
          maxlength="6" placeholder="000000"
          autocomplete="one-time-code"
          style="background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12);color:#fff;font-size:1.5rem;letter-spacing:.25rem;text-align:center"
          required>
        <div style="font-size:.75rem;color:#64748b;margin-top:.375rem;text-align:center" id="totp-timer">Code refreshes in ${secs}s</div>
      </div>
      <div id="totp-error" style="display:none;color:#f87171;font-size:.8rem;text-align:center;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:.5rem"></div>
      <button type="submit" id="totp-submit" class="btn btn-primary" style="width:100%;height:44px;font-size:.9375rem">
        ${Icons.Lock(18)} <span id="totp-submit-label">Verify</span>
      </button>
    </form>
    <div style="margin-top:.875rem;text-align:center">
      <button type="button" id="totp-back" style="background:none;border:none;color:#64748b;font-size:.8rem;cursor:pointer">← Back to password</button>
    </div>`)

  // Countdown timer
  let _timerInterval: ReturnType<typeof setInterval> | null = null
  const timerEl = document.getElementById('totp-timer')
  _timerInterval = setInterval(() => {
    const s = totpSecondsRemaining()
    if (timerEl) timerEl.textContent = `Code refreshes in ${s}s`
  }, 1000)

  const cleanup = () => {
    if (_timerInterval) {
      clearInterval(_timerInterval)
      _timerInterval = null
    }
  }

  document.getElementById('totp-back')?.addEventListener('click', async () => {
    cleanup()
    appEl.innerHTML = auditedStaticHtml(await renderAuth())
    bindAuth(appEl, onSuccess)
  })

  setTimeout(() => (document.getElementById('totp-code') as HTMLInputElement | null)?.focus(), 100)

  document.getElementById('totp-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const code =
      (document.getElementById('totp-code') as HTMLInputElement | null)?.value.trim() ?? ''
    const errEl = document.getElementById('totp-error')
    const btn = document.getElementById('totp-submit') as HTMLButtonElement | null
    const lbl = document.getElementById('totp-submit-label')
    if (errEl) errEl.style.display = 'none'
    if (btn) btn.disabled = true
    if (lbl) lbl.textContent = 'Verifying…'

    try {
      const ok = await verifyTOTPCode(totpSecret, code)
      if (!ok) {
        if (errEl) {
          errEl.textContent = 'Invalid code. Please try again.'
          errEl.style.display = 'block'
        }
        if (btn) btn.disabled = false
        if (lbl) lbl.textContent = 'Verify'
        const codeEl = document.getElementById('totp-code') as HTMLInputElement | null
        if (codeEl) {
          codeEl.value = ''
          codeEl.focus()
        }
        _audit('mfa_failure')
        return
      }
      _audit('mfa_success')
      cleanup()
      onSuccess(key)
    } catch {
      if (errEl) {
        errEl.textContent = 'Verification error. Please try again.'
        errEl.style.display = 'block'
      }
      if (btn) btn.disabled = false
      if (lbl) lbl.textContent = 'Verify'
    }
  })
}

// ── Step-up authentication — RFC 9470 ─────────────────────────────────────────
// Used by admin-console.ts for high-risk operations (GDPR erase, KMS key management,
// AI allowlist, org settings) when the enterprise-web target connects to the server.

/** Server base URL injected by the enterprise-web entry point. Null in offline builds. */
let _serverUrl: string | null = null
/** Access token getter injected by the enterprise-web entry point. */
let _getAccessToken: (() => string | null) | null = null

export function setStepUpHooks(hooks: {
  serverUrl: string
  getAccessToken: () => string | null
}): void {
  _serverUrl = hooks.serverUrl
  _getAccessToken = hooks.getAccessToken
}

/**
 * Request a single-use step-up token for the given high-risk operation.
 * The caller must have completed re-authentication (password + TOTP/passkey) first.
 *
 * RFC 9470 §3 — step-up tokens are scoped to one (userId, operation) pair,
 * expire after 5 minutes, and are consumed on first use.
 */
export async function requestStepUpToken(operation: string): Promise<string> {
  if (!_serverUrl || !_getAccessToken) {
    throw new Error('Step-up hooks not configured — enterprise server required')
  }
  const serverUrl = _serverUrl
  const accessToken = _getAccessToken()
  if (!accessToken) throw new Error('No access token — please log in')

  const popup = window.open('about:blank', 'taskapp-step-up', 'width=520,height=720')
  if (!popup) throw new Error('Step-up popup was blocked')

  const resp = await fetch(`${_serverUrl}/auth/step-up/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ operation, postMessageOrigin: window.location.origin }),
  })
  if (!resp.ok) {
    popup.close()
    throw new Error(`Step-up request failed: ${resp.status}`)
  }
  const data = (await resp.json()) as { authorization_url?: string }
  const authorizationUrl = data.authorization_url
  if (!authorizationUrl) {
    popup.close()
    throw new Error('Server did not return a step-up authorization URL')
  }

  return new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => {
        cleanup()
        popup.close()
        reject(new Error('Step-up authentication timed out'))
      },
      5 * 60 * 1000,
    )

    const cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
    }

    const onMessage = (event: MessageEvent) => {
      const serverOrigin = new URL(serverUrl).origin
      if (event.origin !== serverOrigin) return
      const payload = event.data as { type?: unknown; token?: unknown }
      if (payload.type !== 'tk-step-up-token' || typeof payload.token !== 'string') return
      cleanup()
      popup.close()
      resolve(payload.token)
    }

    window.addEventListener('message', onMessage)
    popup.location.href = authorizationUrl
  })
}

/**
 * Execute fn(), retrying once with a step-up token if the server responds with
 * 401 + WWW-Authenticate: Bearer error="insufficient_user_authentication".
 *
 * RFC 9470 — challenge-response cycle:
 *   1. Try the request (no step-up token)
 *   2. If 401, prompt the user to re-authenticate → obtain step-up token
 *   3. Retry with X-Step-Up-Token header
 */
export async function performWithStepUp(
  operation: string,
  fn: (stepUpToken?: string) => Promise<Response>,
  onReauthRequired: () => Promise<void>,
): Promise<{ ok: boolean; status: number; data: unknown; error: string | null }> {
  const first = await fn(undefined)

  if (first.status !== 401) {
    if (!first.ok) {
      const errText = await first.text().catch(() => String(first.status))
      return { ok: false, status: first.status, data: null, error: errText }
    }
    const data: unknown = await first.json().catch(() => null)
    return { ok: true, status: first.status, data, error: null }
  }

  const wwwAuth = first.headers.get('WWW-Authenticate') ?? ''
  if (!wwwAuth.includes('insufficient_user_authentication')) {
    return { ok: false, status: 401, data: null, error: 'Unauthorized' }
  }

  // RFC 9470 §3 — challenge received; prompt re-auth then retry with step-up token
  try {
    await onReauthRequired()
    const stepUpToken = await requestStepUpToken(operation)
    const second = await fn(stepUpToken)
    if (!second.ok) {
      const errText = await second.text().catch(() => String(second.status))
      return { ok: false, status: second.status, data: null, error: errText }
    }
    const data: unknown = await second.json().catch(() => null)
    return { ok: true, status: second.status, data, error: null }
  } catch (err) {
    return { ok: false, status: 401, data: null, error: String(err) }
  }
}
