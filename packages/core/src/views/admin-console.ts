// ── ADMIN CONSOLE ─────────────────────────────────────────────────────────────
// Multi-tab admin UI. Role-gated: admin/owner only.
// Tabs: Overview · Users · Lockdown · AI Allowlist · Audit Log · Compliance · Integrations
// Follows renderX(state) → string / bindX(state?) → void contract.

import { escH, formatRelative } from '../utils.js'
import { LS_ADMIN_TAB_KEY, LS_COMPLIANCE_KEY_PREFIX } from '../constants.js'
import { Icons } from '../ui/icons.js'
import { getState as _getState, setState, showToast } from '../state.js'
import type { AppState, LockdownLevel } from '../state.js'
import { auditLog, loadAuditLog, verifyAuditChain } from '../security/audit.js'
import type { AuditEntry } from '../security/audit.js'
import {
  performWithStepUp,
  getAuthLockedUntil,
  recordAuthFailure,
  resetAuthLockout,
} from '../security/auth.js'
import { setAuditedStaticHtml } from '../render-utils.js'
import { loadPasskeys, authenticateWithPasskey, isWebAuthnAvailable } from '../security/webauthn.js'
import { initCrypto, verifyPassword } from '../security/vault.js'

type AnyRecord = Record<string, unknown>

// ── Active tab state (non-sensitive localStorage pref) ────────────────────────
type AdminTab =
  | 'overview'
  | 'users'
  | 'lockdown'
  | 'ai-allowlist'
  | 'audit'
  | 'compliance'
  | 'integrations'
function _activeTab(): AdminTab {
  try {
    return (localStorage.getItem(LS_ADMIN_TAB_KEY) as AdminTab | null) ?? 'overview'
  } catch {
    return 'overview'
  }
}
function _setActiveTab(tab: AdminTab): void {
  try {
    localStorage.setItem(LS_ADMIN_TAB_KEY, tab)
  } catch {
    /* */
  }
}

// ── Hook injection ─────────────────────────────────────────────────────────────
let _setLockdown: ((level: LockdownLevel) => void) | null = null
let _appRenderWorkspace: ((view: string) => void) | null = null
/** Enterprise server base URL — null in offline builds. */
let _adminServerUrl: string | null = null
/** Returns the current access token for server calls. Null in offline builds. */
let _adminGetToken: (() => string | null) | null = null

export function setAdminConsoleHooks(hooks: {
  setLockdown?: (level: LockdownLevel) => void
  appRenderWorkspace?: (view: string) => void
  /** Injected by enterprise-web entry.ts to enable server API calls. */
  serverUrl?: string
  getAccessToken?: () => string | null
}): void {
  if (hooks.setLockdown) _setLockdown = hooks.setLockdown
  if (hooks.appRenderWorkspace) _appRenderWorkspace = hooks.appRenderWorkspace
  if (hooks.serverUrl) _adminServerUrl = hooks.serverUrl
  if (hooks.getAccessToken) _adminGetToken = hooks.getAccessToken
}

/**
 * Show a re-authentication modal before issuing a step-up token.
 *
 * NIST SP 800-63B-4 §5.1.7 — phishing-resistant authenticators (passkeys) are offered
 * as the primary option when enrolled. TOTP / password is the AAL1 fallback.
 *
 * The password path actually verifies the credential against the encrypted vault token
 * via PBKDF2 re-derivation + AES-GCM decrypt — it never accepts a non-empty string as
 * sufficient proof. This is intentional: step-up is a re-authentication event.
 */
async function _showAdminReauthModal(): Promise<void> {
  // Load enrolled passkeys (requires vault key already in state — user is authenticated).
  const webAuthnAvail = isWebAuthnAvailable()
  const passkeys = webAuthnAvail ? await loadPasskeys() : []
  const hasPasskeys = passkeys.length > 0

  const passkeySection = hasPasskeys
    ? `<button class="btn btn-primary" id="admin-reauth-passkey" style="width:100%;margin-bottom:.75rem">
         🔑 Authenticate with passkey (recommended)
       </button>
       <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem">
         <div style="flex:1;height:1px;background:var(--border-subtle,#334155)"></div>
         <span style="font-size:.75rem;color:var(--text-secondary,#94a3b8)">or use master password</span>
         <div style="flex:1;height:1px;background:var(--border-subtle,#334155)"></div>
       </div>`
    : ''

  const description = hasPasskeys
    ? 'This operation requires re-authentication. Use your passkey or master password to continue.'
    : 'This operation requires you to confirm your identity. Enter your master password to continue.'

  return new Promise<void>((resolve, reject) => {
    const overlay = document.createElement('div')
    overlay.id = 'admin-reauth-overlay'
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center'
    setAuditedStaticHtml(
      overlay,
      `<div style="background:var(--bg-elevated,#1e293b);border:1px solid var(--border-subtle,#334155);border-radius:14px;padding:2rem;width:380px;max-width:90vw">
        <h3 style="font-size:1.0625rem;font-weight:600;margin-bottom:.5rem">Re-authentication required</h3>
        <p style="font-size:.875rem;color:var(--text-secondary,#94a3b8);margin-bottom:1.25rem">${description}</p>
        ${passkeySection}
        <input type="password" id="admin-reauth-pw" class="input" placeholder="Master password" style="width:100%;margin-bottom:.75rem" autocomplete="current-password">
        <div id="admin-reauth-error" style="display:none;font-size:.8125rem;color:#f87171;margin-bottom:.75rem"></div>
        <div style="display:flex;gap:.75rem;justify-content:flex-end">
          <button class="btn btn-ghost" id="admin-reauth-cancel">Cancel</button>
          <button class="btn btn-primary" id="admin-reauth-confirm">Confirm</button>
        </div>
      </div>`,
    )
    document.body.appendChild(overlay)

    const cleanup = () => {
      overlay.remove()
    }

    const showErr = (msg: string) => {
      const el = document.getElementById('admin-reauth-error')
      if (el) {
        el.textContent = msg
        el.style.display = 'block'
      }
    }

    document.getElementById('admin-reauth-cancel')?.addEventListener('click', () => {
      cleanup()
      reject(new Error('Re-authentication cancelled'))
    })

    // Passkey path — phishing-resistant, primary option (NIST SP 800-63B-4 AAL2)
    if (hasPasskeys) {
      document.getElementById('admin-reauth-passkey')?.addEventListener('click', async () => {
        const btn = document.getElementById('admin-reauth-passkey') as HTMLButtonElement | null
        if (btn) {
          btn.disabled = true
          btn.textContent = 'Authenticating…'
        }
        const errEl = document.getElementById('admin-reauth-error')
        if (errEl) errEl.style.display = 'none'

        for (const cred of passkeys) {
          try {
            await authenticateWithPasskey(cred)
            // Success — reset lockout shared with password path and resolve
            resetAuthLockout()
            auditLog('auth_success', { context: 're-auth', method: 'passkey' })
            cleanup()
            resolve()
            return
          } catch (err) {
            const name = (err as DOMException).name
            if (name === 'NotAllowedError') {
              // User explicitly cancelled or the authenticator timed out.
              // Do not try remaining credentials — that would silently re-prompt.
              if (btn) {
                btn.disabled = false
                btn.textContent = '🔑 Authenticate with passkey (recommended)'
              }
              showErr('Authentication was cancelled. Try again or use your master password.')
              return
            }
            // Any other error (e.g. credential not found on this device) — try next credential.
          }
        }

        // Exhausted all enrolled credentials without success.
        if (btn) {
          btn.disabled = false
          btn.textContent = '🔑 Authenticate with passkey (recommended)'
        }
        showErr('No matching passkey found on this device. Use your master password below.')
      })
    }

    // Password path — PBKDF2-verified (600k rounds), subject to the same exponential-backoff
    // lockout as the primary login flow (nexus_auth_fail_count / nexus_auth_locked_until).
    document.getElementById('admin-reauth-confirm')?.addEventListener('click', async () => {
      const pw =
        (document.getElementById('admin-reauth-pw') as HTMLInputElement | null)?.value ?? ''
      const errEl = document.getElementById('admin-reauth-error')
      if (errEl) errEl.style.display = 'none'

      // Check lockout BEFORE doing any crypto work — same policy as primary login.
      const lockedUntil = getAuthLockedUntil()
      if (Date.now() < lockedUntil) {
        const secs = Math.ceil((lockedUntil - Date.now()) / 1000)
        showErr(`Too many failed attempts. Try again in ${secs}s.`)
        return
      }

      if (!pw) {
        showErr('Password is required.')
        return
      }

      const confirmBtn = document.getElementById('admin-reauth-confirm') as HTMLButtonElement | null
      if (confirmBtn) {
        confirmBtn.disabled = true
        confirmBtn.textContent = 'Verifying…'
      }

      try {
        const derivedKey = await initCrypto(pw)
        const valid = await verifyPassword(derivedKey)
        if (!valid) {
          const { count, lockDelay } = recordAuthFailure()
          auditLog('auth_failure', {
            context: 're-auth',
            method: 'password',
            attempts: String(count),
          })
          const secs = Math.ceil(lockDelay / 1000)
          if (confirmBtn) {
            confirmBtn.disabled = false
            confirmBtn.textContent = 'Confirm'
          }
          const pwEl = document.getElementById('admin-reauth-pw') as HTMLInputElement | null
          if (pwEl) pwEl.value = ''
          showErr(`Incorrect password.${count >= 3 ? ` Next attempt allowed in ${secs}s.` : ''}`)
          return
        }
        resetAuthLockout()
        auditLog('auth_success', { context: 're-auth', method: 'password' })
        cleanup()
        resolve()
      } catch {
        if (confirmBtn) {
          confirmBtn.disabled = false
          confirmBtn.textContent = 'Confirm'
        }
        showErr('Verification failed. Please try again.')
      }
    })
  })
}

// ── In-view audit log cache ────────────────────────────────────────────────────
let _auditEntries: AuditEntry[] = []

// ── Tab nav ───────────────────────────────────────────────────────────────────
function _tabNav(active: AdminTab): string {
  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'lockdown', label: 'Lockdown' },
    { id: 'ai-allowlist', label: 'AI Allowlist' },
    { id: 'audit', label: 'Audit Log' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'integrations', label: 'Integrations' },
  ]
  return `<nav class="admin-tabs" role="tablist" aria-label="Admin sections">
    ${tabs.map((t) => `<button class="admin-tab${active === t.id ? ' admin-tab--active' : ''}" data-admin-tab="${t.id}" role="tab" aria-selected="${active === t.id}">${escH(t.label)}</button>`).join('')}
  </nav>`
}

// ── Overview tab ───────────────────────────────────────────────────────────────
function _renderOverview(state: AppState): string {
  const cards = [
    { label: 'Lockdown Level', value: escH(state.lockdownLevel ?? 'off'), icon: Icons.Lock(20) },
    {
      label: 'Clients',
      value: String((state.clients as AnyRecord[]).length),
      icon: Icons.Clients(20),
    },
    {
      label: 'Active Tasks',
      value: String((state.tasks as AnyRecord[]).filter((t) => t['status'] !== 'Done').length),
      icon: Icons.Tasks(20),
    },
    { label: 'Personas Active', value: state.currentPersona ? '1' : '0', icon: Icons.People(20) },
  ]
  return `<div class="admin-panel">
    <h3 class="admin-panel-title">System Overview</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-top:1rem">
      ${cards
        .map(
          (
            c,
          ) => `<div style="background:var(--bg-raised);border:1px solid var(--border-subtle);border-radius:10px;padding:1rem">
        <div style="color:var(--accent);margin-bottom:.5rem">${c.icon}</div>
        <p style="font-size:1.5rem;font-weight:700;color:var(--text-primary)">${c.value}</p>
        <p style="font-size:.8125rem;color:var(--text-secondary);margin-top:.125rem">${c.label}</p>
      </div>`,
        )
        .join('')}
    </div>
  </div>`
}

// ── Users tab ──────────────────────────────────────────────────────────────────
function _renderUsers(state: AppState): string {
  const people = state.people as AnyRecord[]
  const table = people.length
    ? `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>
          ${people
            .slice(0, 50)
            .map(
              (p) => `<tr>
            <td><strong>${escH(String(p['name'] ?? '—'))}</strong></td>
            <td style="color:var(--text-secondary)">${escH(String(p['email'] ?? '—'))}</td>
            <td><span class="badge badge-slate">${escH(String(p['role'] ?? 'member'))}</span></td>
            <td><span class="badge ${p['active'] === false ? 'badge-red' : 'badge-green'}">${p['active'] === false ? 'Suspended' : 'Active'}</span></td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`
    : `<p class="admin-empty">No people records found.</p>`
  return `<div class="admin-panel">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h3 class="admin-panel-title">Users (${escH(String(people.length))})</h3>
    </div>
    ${table}
    <div style="margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border-subtle)">
      <h4 style="font-size:.9375rem;font-weight:600;color:#dc2626;margin-bottom:.5rem">${Icons.Delete(16)} GDPR Erasure Request (Article 17)</h4>
      <p style="font-size:.8125rem;color:var(--text-secondary);margin-bottom:.875rem">Schedules crypto-shredding of all data for a user. The KMS key is destroyed at the scheduled date; encrypted data becomes permanently unreadable.</p>
      <div style="display:flex;gap:.75rem;align-items:flex-end;flex-wrap:wrap">
        <div>
          <label style="font-size:.8125rem;font-weight:500;display:block;margin-bottom:.25rem">User ID</label>
          <input class="input" id="admin-gdpr-user-id" placeholder="user-uuid" style="width:260px">
        </div>
        <div>
          <label style="font-size:.8125rem;font-weight:500;display:block;margin-bottom:.25rem">Scheduled destroy date</label>
          <input class="input" type="date" id="admin-gdpr-date" style="width:180px">
        </div>
        <button class="btn btn-danger" id="admin-gdpr-request" style="white-space:nowrap">Request Erasure</button>
      </div>
      <p id="admin-gdpr-status" style="font-size:.8125rem;margin-top:.5rem;color:var(--text-tertiary)"></p>
    </div>
  </div>`
}

// ── Lockdown tab ───────────────────────────────────────────────────────────────
function _renderLockdown(state: AppState): string {
  const current = state.lockdownLevel ?? 'off'
  const levels: { id: LockdownLevel; label: string; desc: string; badge: string }[] = [
    {
      id: 'off',
      label: 'Off',
      desc: 'No additional restrictions beyond system defaults.',
      badge: 'badge-slate',
    },
    {
      id: 'standard',
      label: 'Standard',
      desc: 'Tenant-only AI endpoints. Immutable audit log. Telemetry blocked.',
      badge: 'badge-blue',
    },
    {
      id: 'strong',
      label: 'Strong',
      desc: 'Standard + DLP warnings on copy / export / external links.',
      badge: 'badge-amber',
    },
    {
      id: 'strict',
      label: 'Strict',
      desc: 'Strong + hardware-bound keys, no clipboard. (Reserved — not yet active)',
      badge: 'badge-red',
    },
  ]
  return `<div class="admin-panel">
    <h3 class="admin-panel-title">${Icons.Lock(16)} Lockdown Level</h3>
    <p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:1rem">Controls security gates applied across client and server (C.7).</p>
    <div style="display:flex;flex-direction:column;gap:.5rem">
      ${levels
        .map((l) => {
          const active = current === l.id
          return `<label style="display:flex;align-items:flex-start;gap:.875rem;padding:.875rem 1rem;border-radius:10px;cursor:${l.id === 'strict' ? 'not-allowed' : 'pointer'};background:${active ? 'var(--accent-light,#eff6ff)' : 'var(--bg-raised)'};border:1.5px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}">
          <input type="radio" name="lockdown-level" value="${l.id}" ${active ? 'checked' : ''} ${l.id === 'strict' ? 'disabled' : ''} style="margin-top:.2rem;accent-color:var(--accent)">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="font-weight:600;font-size:.9375rem">${escH(l.label)}</span>
              ${active ? `<span class="badge ${l.badge}">Active</span>` : ''}
            </div>
            <p style="font-size:.8125rem;color:var(--text-secondary);margin-top:.25rem">${escH(l.desc)}</p>
          </div>
        </label>`
        })
        .join('')}
    </div>
  </div>`
}

// ── AI Allowlist tab ───────────────────────────────────────────────────────────
function _renderAIAllowlist(): string {
  return `<div class="admin-panel">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h3 class="admin-panel-title">${Icons.AI(16)} AI Endpoint Allowlist</h3>
      <button class="btn btn-sm btn-primary" id="admin-ai-allowlist-add">+ Add Entry</button>
    </div>
    <p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:1rem">Restrict which AI providers are permitted in this workspace. Enforced by the AI gateway policy engine.</p>
    <div id="admin-ai-allowlist-table">
      <p class="admin-empty">Connect to enterprise server to manage the AI allowlist.</p>
    </div>
  </div>`
}

// ── Audit Log tab ──────────────────────────────────────────────────────────────
function _renderAuditLog(entries: AuditEntry[]): string {
  const rows = entries.slice(0, 100)
  return `<div class="admin-panel">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h3 class="admin-panel-title">Audit Log (${escH(String(entries.length))} entries)</h3>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-sm btn-ghost" id="admin-audit-verify-chain">Verify Chain</button>
        <button class="btn btn-sm btn-ghost" id="admin-audit-export-csv">Export CSV</button>
        <button class="btn btn-sm btn-ghost" id="admin-audit-export-json">Export JSONL</button>
        <button class="btn btn-sm btn-ghost" id="admin-audit-refresh">Refresh</button>
      </div>
    </div>
    ${
      rows.length === 0
        ? '<p class="admin-empty">No audit entries found.</p>'
        : `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Time</th><th>Event</th><th>Details</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (e) => `<tr>
            <td style="white-space:nowrap;color:var(--text-secondary);font-size:.8125rem">${escH(formatRelative(e.ts))}</td>
            <td><code style="font-size:.8125rem;background:var(--bg-base);padding:.125rem .375rem;border-radius:4px">${escH(e.event)}</code></td>
            <td style="font-size:.8125rem;color:var(--text-secondary);max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(JSON.stringify(e.details))}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`
    }
  </div>`
}

// ── Compliance tab ─────────────────────────────────────────────────────────────
function _complianceEnabled(id: string): boolean {
  try {
    return localStorage.getItem(`${LS_COMPLIANCE_KEY_PREFIX}${id}`) === '1'
  } catch {
    return false
  }
}

function _renderCompliance(): string {
  const packs = [
    {
      id: 'hipaa',
      label: 'HIPAA',
      desc: 'Healthcare privacy. Enables 6-year audit retention and HIPAA field classification.',
    },
    {
      id: 'eu-ai-act',
      label: 'EU AI Act',
      desc: 'Marks AI attributes as advisory-only. Requires transparency labels on every AI output.',
    },
    {
      id: 'gdpr',
      label: 'GDPR',
      desc: 'Enables crypto-shredding erasure (Article 17) and KMS key lifecycle management.',
    },
    {
      id: 'soc2',
      label: 'SOC 2 Type II',
      desc: 'Enables append-only audit log, OTel evidence collection, and change-detection alerts.',
    },
  ]
  return `<div class="admin-panel">
    <h3 class="admin-panel-title">Compliance Packs</h3>
    <p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:1rem">Activate compliance profiles to enforce retention, AI governance, and erasure policies.</p>
    <div style="display:flex;flex-direction:column;gap:.625rem">
      ${packs
        .map((p) => {
          const on = _complianceEnabled(p.id)
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:.875rem 1rem;background:var(--bg-raised);border:1px solid ${on ? 'var(--accent)' : 'var(--border-subtle)'};border-radius:10px">
        <div>
          <p style="font-weight:600;font-size:.9375rem">${escH(p.label)}</p>
          <p style="font-size:.8125rem;color:var(--text-secondary);margin-top:.125rem">${escH(p.desc)}</p>
        </div>
        <button class="btn btn-sm ${on ? 'btn-primary' : 'btn-ghost'}" data-compliance-id="${escH(p.id)}" style="margin-left:1rem;white-space:nowrap">${on ? 'Enabled' : 'Enable'}</button>
      </div>`
        })
        .join('')}
    </div>
  </div>`
}

// ── Integrations tab ───────────────────────────────────────────────────────────
function _renderIntegrations(): string {
  return `<div class="admin-panel">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h3 class="admin-panel-title">Integrations</h3>
      <button class="btn btn-sm btn-primary" id="admin-integration-add">+ Add Integration</button>
    </div>
    <p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:1rem">Manage third-party integrations: webhooks, Dataverse, calendar sync, and custom connections.</p>
    <div id="admin-integrations-table">
      <p class="admin-empty">No integrations configured. Connect to enterprise server to manage integrations.</p>
    </div>
  </div>`
}

// ── Render ─────────────────────────────────────────────────────────────────────
export function renderAdminConsole(state: AppState): string {
  const tab = _activeTab()
  let body = ''
  switch (tab) {
    case 'overview':
      body = _renderOverview(state)
      break
    case 'users':
      body = _renderUsers(state)
      break
    case 'lockdown':
      body = _renderLockdown(state)
      break
    case 'ai-allowlist':
      body = _renderAIAllowlist()
      break
    case 'audit':
      body = _renderAuditLog(_auditEntries)
      break
    case 'compliance':
      body = _renderCompliance()
      break
    case 'integrations':
      body = _renderIntegrations()
      break
    default:
      body = _renderOverview(state)
  }
  return `<div id="admin-console" style="max-width:900px;margin:0 auto;padding:2rem 1.5rem">
    <div style="margin-bottom:1.5rem">
      <h2 style="font-size:1.25rem;font-weight:700;color:var(--text-primary)">Admin Console</h2>
      <p style="font-size:.875rem;color:var(--text-secondary);margin-top:.25rem">Visible to admin and owner roles only.</p>
    </div>
    ${_tabNav(tab)}
    <div style="margin-top:1.5rem">${body}</div>
  </div>`
}

// ── Bind ───────────────────────────────────────────────────────────────────────
export function bindAdminConsole(_state?: AppState): void {
  // Tab navigation
  document.querySelectorAll<HTMLButtonElement>('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['adminTab'] as AdminTab
      _setActiveTab(tab)
      if (tab === 'audit' && _auditEntries.length === 0) {
        loadAuditLog()
          .then((entries) => {
            _auditEntries = entries
            _appRenderWorkspace?.('admin')
          })
          .catch(() => {})
      } else {
        _appRenderWorkspace?.('admin')
      }
    })
  })

  // Lockdown level
  document.querySelectorAll<HTMLInputElement>('input[name="lockdown-level"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const level = radio.value as LockdownLevel
      _setLockdown?.(level)
      setState({ lockdownLevel: level })
      auditLog('workspace_layout_changed', { context: 'lockdown_level', level })
      showToast(`Lockdown set to ${level}`, 'success')
    })
  })

  // Audit log actions
  document.getElementById('admin-audit-refresh')?.addEventListener('click', () => {
    loadAuditLog()
      .then((entries) => {
        _auditEntries = entries
        _appRenderWorkspace?.('admin')
      })
      .catch(() => {})
  })
  document.getElementById('admin-audit-export-csv')?.addEventListener('click', () => {
    import('../security/audit.js')
      .then(({ exportAuditCSV }) => {
        exportAuditCSV()
          .then((csv) => {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
            a.download = 'audit-log.csv'
            a.click()
          })
          .catch(() => {
            showToast('Export failed', 'error')
          })
      })
      .catch(() => {})
  })
  document.getElementById('admin-audit-export-json')?.addEventListener('click', () => {
    import('../security/audit.js')
      .then(({ exportAuditJSON }) => {
        exportAuditJSON()
          .then((json) => {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([json], { type: 'application/x-ndjson' }))
            a.download = 'audit-log.jsonl'
            a.click()
          })
          .catch(() => {
            showToast('Export failed', 'error')
          })
      })
      .catch(() => {})
  })

  // Audit chain verify
  document.getElementById('admin-audit-verify-chain')?.addEventListener('click', () => {
    verifyAuditChain()
      .then(({ valid, firstBrokenAt }) => {
        if (valid) {
          showToast('Chain integrity verified — all entries intact.', 'success', 4000)
        } else {
          showToast(
            `Chain broken at entry #${firstBrokenAt ?? '?'} — possible tampering detected.`,
            'error',
            6000,
          )
        }
      })
      .catch(() => {
        showToast('Chain verification failed.', 'error')
      })
  })

  // GDPR erasure request — RFC 9470 step-up auth in enterprise mode
  document.getElementById('admin-gdpr-request')?.addEventListener('click', () => {
    const uid =
      (document.getElementById('admin-gdpr-user-id') as HTMLInputElement | null)?.value.trim() ?? ''
    const date =
      (document.getElementById('admin-gdpr-date') as HTMLInputElement | null)?.value ?? ''
    const status = document.getElementById('admin-gdpr-status')
    if (!uid) {
      if (status) status.textContent = 'User ID is required.'
      return
    }
    if (!date) {
      if (status) status.textContent = 'Scheduled destroy date is required.'
      return
    }

    const serverUrl = _adminServerUrl
    if (!serverUrl) {
      // Offline build — record locally only
      auditLog('gdpr_erasure_requested', { userId: uid, scheduledDate: date })
      if (status)
        status.textContent = `Erasure recorded locally. Connect to enterprise server to execute.`
      showToast('GDPR erasure request recorded in audit log.', 'success', 4000)
      return
    }

    // Enterprise mode — call server via RFC 9470 step-up challenge-response
    const btn = document.getElementById('admin-gdpr-request') as HTMLButtonElement | null
    if (btn) btn.disabled = true
    if (status) status.textContent = 'Requesting erasure…'

    performWithStepUp(
      'gdpr_erase',
      (stepUpToken) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${_adminGetToken?.() ?? ''}`,
        }
        if (stepUpToken) headers['X-Step-Up-Token'] = stepUpToken
        return fetch(`${serverUrl}/api/v1/admin/users/${encodeURIComponent(uid)}/erase`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ scheduledDate: date }),
        })
      },
      () => _showAdminReauthModal(),
    )
      .then((result) => {
        if (btn) btn.disabled = false
        if (result.ok) {
          auditLog('gdpr_erasure_requested', { userId: uid, scheduledDate: date })
          if (status) status.textContent = `Erasure scheduled for ${uid} on ${date}.`
          showToast('GDPR erasure scheduled.', 'success', 4000)
        } else {
          if (status) status.textContent = `Error: ${result.error ?? 'Request failed'}`
          showToast('GDPR erasure request failed.', 'error', 4000)
        }
      })
      .catch(() => {
        if (btn) btn.disabled = false
        if (status) status.textContent = 'Request failed. Check connection.'
        showToast('GDPR erasure request failed.', 'error', 4000)
      })
  })

  // Compliance pack toggles
  document.querySelectorAll<HTMLButtonElement>('[data-compliance-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['complianceId'] ?? ''
      const key = `${LS_COMPLIANCE_KEY_PREFIX}${id}`
      const wasOn = _complianceEnabled(id)
      try {
        if (wasOn) {
          localStorage.removeItem(key)
        } else {
          localStorage.setItem(key, '1')
        }
      } catch {
        /* */
      }
      auditLog('compliance_pack_changed', { pack: id, enabled: String(!wasOn) })
      _appRenderWorkspace?.('admin')
    })
  })

  // AI allowlist add button (enterprise only — shows toast in offline build)
  document.getElementById('admin-ai-allowlist-add')?.addEventListener('click', () => {
    showToast('AI allowlist management requires enterprise server connection.', 'info', 4000)
  })

  // Integration add button
  document.getElementById('admin-integration-add')?.addEventListener('click', () => {
    showToast('Integration management requires enterprise server connection.', 'info', 4000)
  })

  // Load audit log immediately when audit tab is active
  if (_activeTab() === 'audit' && _auditEntries.length === 0) {
    loadAuditLog()
      .then((entries) => {
        _auditEntries = entries
        _appRenderWorkspace?.('admin')
      })
      .catch(() => {})
  }
}
