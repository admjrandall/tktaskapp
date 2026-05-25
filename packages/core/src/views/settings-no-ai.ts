// Settings view for the no-AI offline profile.
import { escH, downloadText, formatRelative, plural } from '../utils.js'
import { Icons } from '../ui/icons.js'
import {
  LS_DENSITY_KEY,
  LS_NOTIF_PREFS_KEY,
  LS_USER_PROFILE_KEY,
  TAG_COLORS,
} from '../constants.js'
import { dbCreate, dbUpdate, dbGetAll, permanentDelete, restoreFromTrash } from '../storage/db.js'
import { getState, setState, showToast, showConfirm, reloadData, setTheme } from '../state.js'
import type { AppState } from '../state.js'
import {
  changePassword,
  exportEncryptedBackup,
  importEncryptedBackup,
  exportJSON,
  importJSON,
  initCrypto,
  verifyPassword,
} from '../security/vault.js'
import { cacheSessionKey } from '../security/session.js'
import { deploymentPolicy } from '../deployment-policy.js'
import { generateQRCodeSVG, buildOTPAuthURI, totpSecondsRemaining } from '../security/totp.js'

type AnyRecord = Record<string, unknown>

export function setSettingsAIHooks(_hooks: unknown): void {}

let _isFsReady: () => boolean = () => false
let _getFsLastSave: () => string | null = () => null
let _fsPickFile: (forceNew?: boolean) => Promise<unknown> = async () => null
let _fsWriteVault: () => Promise<void> = async () => {}
let _fsUnlink: () => Promise<void> = async () => {}

export function setSettingsFsHooks(hooks: {
  isFsReady: () => boolean
  getFsLastSave: () => string | null
  fsPickFile: (forceNew?: boolean) => Promise<unknown>
  fsWriteVault: () => Promise<void>
  fsUnlink: () => Promise<void>
}): void {
  _isFsReady = hooks.isFsReady
  _getFsLastSave = hooks.getFsLastSave
  _fsPickFile = hooks.fsPickFile
  _fsWriteVault = hooks.fsWriteVault
  _fsUnlink = hooks.fsUnlink
}

let _lockApp: () => void = () => {}
let _setLockTimeout: (mins: number) => void = () => {}
let _getLockTimeout: () => number = () => 15
let _loadAuditLog: () => Promise<
  Array<{ id: string; ts: string; event: string; details: Record<string, string>; ua: string }>
> = async () => []
let _exportAuditCSV: () => Promise<string> = async () => ''
let _exportAuditJSON: () => Promise<string> = async () => ''
let _purgeAuditLog: (days: number | null) => Promise<void> = async () => {}
let _loadMFAStatus: () => Promise<{ totpEnabled: boolean; totpSecret: string }> = async () => ({
  totpEnabled: false,
  totpSecret: '',
})
let _enableTOTP: (secret: string) => Promise<void> = async () => {}
let _disableTOTP: () => Promise<void> = async () => {}
let _generateNewTOTPSecret: () => Promise<string> = async () => ''
let _loadPasskeys: () => Promise<
  Array<{ id: string; deviceHint?: string; createdAt: string }>
> = async () => []
let _addPasskey: (pw: string) => Promise<unknown> = async () => null
let _removePasskey: (id: string) => Promise<void> = async () => {}
let _getLastActivityAt: () => number = () => Date.now()

export function setSettingsSecurityHooks(hooks: {
  lockApp: () => void
  setLockTimeout: (mins: number) => void
  getLockTimeout: () => number
  loadAuditLog: typeof _loadAuditLog
  exportAuditCSV: typeof _exportAuditCSV
  exportAuditJSON: typeof _exportAuditJSON
  purgeAuditLog: typeof _purgeAuditLog
  loadMFAStatus: typeof _loadMFAStatus
  enableTOTP: typeof _enableTOTP
  disableTOTP: typeof _disableTOTP
  generateNewTOTPSecret: typeof _generateNewTOTPSecret
  loadPasskeys: typeof _loadPasskeys
  addPasskey: typeof _addPasskey
  removePasskey: typeof _removePasskey
  getLastActivityAt: () => number
}): void {
  _lockApp = hooks.lockApp
  _setLockTimeout = hooks.setLockTimeout
  _getLockTimeout = hooks.getLockTimeout
  _loadAuditLog = hooks.loadAuditLog
  _exportAuditCSV = hooks.exportAuditCSV
  _exportAuditJSON = hooks.exportAuditJSON
  _purgeAuditLog = hooks.purgeAuditLog
  _loadMFAStatus = hooks.loadMFAStatus
  _enableTOTP = hooks.enableTOTP
  _disableTOTP = hooks.disableTOTP
  _generateNewTOTPSecret = hooks.generateNewTOTPSecret
  _loadPasskeys = hooks.loadPasskeys
  _addPasskey = hooks.addPasskey
  _removePasskey = hooks.removePasskey
  _getLastActivityAt = hooks.getLastActivityAt
}

let _settingsSection = 'general'
let _editingTagId: string | null = null
let _editTagColor = 'Slate'
let _secMFAStatus: { totpEnabled: boolean; totpSecret: string } | null = null
let _secPasskeys: Array<{ id: string; deviceHint?: string; createdAt: string }> | null = null
let _secAuditEntries: Array<{
  id: string
  ts: string
  event: string
  details: Record<string, string>
  ua: string
}> | null = null
let _secMFALoading = false
let _secPasskeysLoading = false
let _secAuditLoading = false
let _totpSetupSecret = ''
let _totpSetupStep: 'idle' | 'setup' = 'idle'
let _totpSetupTimerInterval: ReturnType<typeof setInterval> | null = null

export function setSettingsSection(s: string): void {
  _settingsSection = s
}

export function resetSecurityState(): void {
  _secMFAStatus = null
  _secPasskeys = null
  _secAuditEntries = null
  _secMFALoading = false
  _secPasskeysLoading = false
  _secAuditLoading = false
  _totpSetupSecret = ''
  _totpSetupStep = 'idle'
  if (_totpSetupTimerInterval) clearInterval(_totpSetupTimerInterval)
  _totpSetupTimerInterval = null
}

function getDensity(): string {
  return localStorage.getItem(LS_DENSITY_KEY) || 'comfortable'
}

function setDensity(d: string): void {
  localStorage.setItem(LS_DENSITY_KEY, d)
  if (d === 'comfortable') document.documentElement.removeAttribute('data-density')
  else document.documentElement.setAttribute('data-density', d)
}

function settingsShell(body: string): string {
  const sections = [
    ['profile', 'Profile'],
    ['general', 'General'],
    ['notifications', 'Notifications'],
    ['security', 'Security'],
    ['storage', 'Storage'],
    ['data', 'Data & Backup'],
    ['privacy', 'Data & Privacy'],
    ['tags', 'Tags'],
    ['recyclebin', 'Recycle Bin'],
    ['about', 'About'],
  ] as const
  const nav = sections
    .map(
      ([id, label]) =>
        `<button class="settings-nav-item ${_settingsSection === id ? 'active' : ''}" data-section="${id}">${label}</button>`,
    )
    .join('')
  return `<div class="settings-layout"><aside class="settings-sidebar">${nav}</aside><main class="settings-content">${body}</main></div>`
}

export function renderSettings(state: AppState): string {
  let body = ''

  if (_settingsSection === 'profile') {
    const profile = safeJson(localStorage.getItem(LS_USER_PROFILE_KEY), {}) as {
      displayName?: string
      initials?: string
    }
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Profile</h2>
      <div class="card" style="padding:1.25rem">
        <div class="form-group" style="margin-bottom:.75rem"><label class="form-label">Display Name</label><input class="input" id="profile-name" value="${escH(profile.displayName || '')}" placeholder="Your Name"></div>
        <div class="form-group" style="margin-bottom:.75rem"><label class="form-label">Initials</label><input class="input" id="profile-initials" value="${escH(profile.initials || '')}" maxlength="2" placeholder="AB" style="width:80px;text-transform:uppercase"></div>
        <button class="btn btn-primary btn-sm" id="profile-save">${Icons.Save(14)} Save Profile</button>
      </div>`
  } else if (_settingsSection === 'notifications') {
    const prefs = safeJson(localStorage.getItem(LS_NOTIF_PREFS_KEY), {}) as AnyRecord
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Notifications</h2>
      <div class="card" style="padding:1.25rem">
        ${notificationToggle('notif-due-dates', 'Due date reminders', 'Notify when tasks are due within 3 days', prefs.dueDateReminders !== false)}
        ${notificationToggle('notif-overdue', 'Overdue alerts', 'Notify when tasks become past their due date', prefs.overdueAlerts !== false)}
        ${notificationToggle('notif-mentions', 'Mentions', 'Notify when you are mentioned in notes or comments', prefs.mentions !== false)}
        <button class="btn btn-primary btn-sm" id="notif-prefs-save" style="margin-top:.875rem">${Icons.Save(14)} Save Preferences</button>
      </div>`
  } else if (_settingsSection === 'general') {
    const curDensity = getDensity()
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">General</h2>
      <div class="card" style="padding:1.25rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.75rem">Theme</div><div style="display:flex;gap:.75rem;flex-wrap:wrap"><button class="btn ${state.theme === 'light' ? 'btn-primary' : 'btn-secondary'}" data-theme="light">${Icons.Sun(16)} Light</button><button class="btn ${state.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" data-theme="dark">${Icons.Moon(16)} Dark</button></div></div>
      <div class="card" style="padding:1.25rem"><div style="font-weight:600;margin-bottom:.25rem">Density</div><div style="font-size:.8125rem;color:var(--text-secondary);margin-bottom:.75rem">Controls spacing and text size across list views</div><div style="display:flex;gap:.75rem;flex-wrap:wrap">${(['compact', 'comfortable'] as const).map((d) => `<button class="btn ${curDensity === d ? 'btn-primary' : 'btn-secondary'}" data-density-set="${d}" style="text-transform:capitalize">${d}</button>`).join('')}</div></div>`
  } else if (_settingsSection === 'security') {
    const lockTimeout = _getLockTimeout()
    const passkeys = _secPasskeys ?? []
    const auditEntries = (_secAuditEntries ?? []).slice(0, 25)
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Security</h2>
      <div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-weight:600;margin-bottom:.75rem">Session Lock</div>
        <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap"><button class="btn btn-secondary" id="lock-now-btn">${Icons.Lock(16)} Lock Now</button><label class="form-label" for="lock-timeout-select" style="margin:0">Auto-lock</label><select class="input" id="lock-timeout-select" style="width:auto">${[5, 10, 15, 30, 60].map((m) => `<option value="${m}" ${lockTimeout === m ? 'selected' : ''}>${m} min</option>`).join('')}<option value="0" ${lockTimeout === 0 ? 'selected' : ''}>Disabled</option></select></div>
        <div style="font-size:.75rem;color:var(--text-secondary);margin-top:.75rem">Last activity: ${formatRelative(new Date(_getLastActivityAt()).toISOString())}</div>
      </div>
      <div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-weight:600;margin-bottom:.75rem">Multi-Factor Unlock</div>
        ${renderTotp()}
        <div style="border-top:1px solid var(--border-subtle);margin-top:1rem;padding-top:1rem">
          <div style="font-weight:500;margin-bottom:.5rem">Passkeys</div>
          <button class="btn btn-secondary btn-sm" id="add-passkey-btn">${Icons.Lock(14)} Add Passkey</button>
          <div style="margin-top:.75rem;display:grid;gap:.5rem">${passkeys.length ? passkeys.map((p) => `<div style="display:flex;justify-content:space-between;gap:.75rem;align-items:center;padding:.5rem;border:1px solid var(--border-subtle);border-radius:6px"><span>${escH(p.deviceHint || 'Passkey')} · ${escH(formatRelative(p.createdAt))}</span><button class="btn btn-ghost btn-sm" data-remove-passkey="${escH(p.id)}">${Icons.Trash(14)}</button></div>`).join('') : '<div style="font-size:.8125rem;color:var(--text-secondary)">No passkeys registered.</div>'}</div>
        </div>
      </div>
      <div class="card" style="padding:1.25rem">
        <div style="font-weight:600;margin-bottom:.75rem">Audit Log</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem"><button class="btn btn-secondary btn-sm" id="audit-export-csv">Export CSV</button><button class="btn btn-secondary btn-sm" id="audit-export-json">Export JSON Lines</button><button class="btn btn-danger btn-sm" id="audit-purge-all">Purge Audit Log</button></div>
        <div style="display:grid;gap:.4rem">${auditEntries.length ? auditEntries.map((e) => `<div style="font-size:.8125rem;border-bottom:1px solid var(--border-subtle);padding:.4rem 0"><strong>${escH(e.event)}</strong> <span style="color:var(--text-secondary)">${escH(formatRelative(e.ts))}</span></div>`).join('') : '<div style="font-size:.8125rem;color:var(--text-secondary)">No audit entries loaded.</div>'}</div>
      </div>`
  } else if (_settingsSection === 'storage') {
    const ready = _isFsReady()
    const last = _getFsLastSave()
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Storage</h2>
      <div class="card" style="padding:1.25rem"><div style="font-weight:600;margin-bottom:.75rem">Vault File</div>
        <p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:1rem">${ready ? `Linked. Last save: ${escH(last ? formatRelative(last) : 'not saved yet')}` : 'Not linked. Data remains encrypted in browser storage.'}</p>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" id="fs-create-new">Create Vault File</button><button class="btn btn-secondary btn-sm" id="fs-link-existing">Link Existing</button><button class="btn btn-primary btn-sm" id="fs-save-now" ${ready ? '' : 'disabled'}>${Icons.Save(14)} Save Now</button><button class="btn btn-ghost btn-sm" id="fs-unlink" ${ready ? '' : 'disabled'}>Unlink</button></div>
      </div>`
  } else if (_settingsSection === 'data') {
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Data & Backup</h2>
      <div class="card" style="padding:1.25rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.75rem">Encrypted Backup</div><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="export-backup">${Icons.Download(14)} Export Backup</button><button class="btn btn-secondary btn-sm" id="import-backup">${Icons.Upload(14)} Import Backup</button><input type="file" id="import-backup-file" accept=".json,.taskapp" style="display:none"></div></div>
      <div class="card" style="padding:1.25rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.75rem">JSON Portability Export</div><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" id="export-json">Export JSON</button><button class="btn btn-secondary btn-sm" id="import-json">Import JSON</button><input type="file" id="import-json-file" accept=".json" style="display:none"></div></div>
      <div class="card" style="padding:1.25rem"><div style="font-weight:600;margin-bottom:.75rem">Change Password</div><div style="display:grid;gap:.75rem;max-width:420px"><input class="input" id="pw-current" type="password" placeholder="Current password"><input class="input" id="pw-new" type="password" placeholder="New password"><input class="input" id="pw-confirm" type="password" placeholder="Confirm new password"><button class="btn btn-primary btn-sm" id="change-password">${Icons.Lock(14)} Change Password</button></div></div>`
  } else if (_settingsSection === 'privacy') {
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Data & Privacy</h2>
      <div class="card" style="padding:1.25rem"><p style="line-height:1.6">This no-AI offline-web build is a local, no-server deployment. CRM data stays on this device unless you manually export or import a backup.</p><ul style="margin-top:.75rem;line-height:1.7"><li>No telemetry, analytics, or crash reports are collected.</li><li>No CRM data is transmitted to a CRM server by this artifact.</li><li>Artificial intelligence code and provider configuration are not included in this build profile.</li></ul></div>`
  } else if (_settingsSection === 'tags') {
    body = renderTags()
  } else if (_settingsSection === 'recyclebin') {
    body = renderRecycleBin()
  } else {
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">About</h2>
      <div class="card" style="padding:1.25rem"><div style="font-weight:600">${escH(deploymentPolicy.label)}</div><div style="font-size:.8125rem;color:var(--text-secondary);margin-top:.5rem">Version ${escH((globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ || 'dev')}</div><div style="font-size:.8125rem;color:var(--text-secondary);margin-top:.5rem">No-AI offline-web profile.</div></div>`
  }

  return settingsShell(body)
}

function safeJson(raw: string | null, fallback: unknown): unknown {
  try {
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function notificationToggle(id: string, title: string, desc: string, checked: boolean): string {
  return `<label style="display:flex;gap:.625rem;align-items:flex-start;padding:.5rem 0;border-bottom:1px solid var(--border-subtle);cursor:pointer"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="margin-top:.2rem"><div><div style="font-size:.875rem;font-weight:500">${title}</div><div style="font-size:.75rem;color:var(--text-secondary)">${desc}</div></div></label>`
}

function renderTotp(): string {
  if (!_secMFAStatus)
    return '<div style="font-size:.8125rem;color:var(--text-secondary)">Loading MFA status...</div>'
  if (_totpSetupStep === 'setup') {
    const uri = buildOTPAuthURI(_totpSetupSecret, 'Task App CRM', 'offline-user')
    return `<div style="display:grid;gap:.75rem"><div>${generateQRCodeSVG(uri)}</div><div class="code">${escH(_totpSetupSecret)}</div><div id="totp-setup-timer" style="font-size:.8125rem;color:var(--text-secondary)">Code refreshes in ${totpSecondsRemaining()}s</div><input class="input" id="totp-setup-code" placeholder="6-digit code" inputmode="numeric" style="max-width:180px"><div id="totp-setup-error" style="display:none;color:#b91c1c;font-size:.8125rem"></div><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="totp-setup-verify">Verify & Enable</button><button class="btn btn-secondary btn-sm" id="totp-copy-secret">Copy Secret</button><button class="btn btn-ghost btn-sm" id="totp-setup-cancel">Cancel</button></div></div>`
  }
  return _secMFAStatus.totpEnabled
    ? '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap"><span>TOTP is enabled.</span><button class="btn btn-danger btn-sm" id="totp-disable-btn">Disable TOTP</button></div>'
    : '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap"><span>TOTP is not enabled.</span><button class="btn btn-secondary btn-sm" id="totp-enable-btn">Enable TOTP</button></div>'
}

function renderTags(): string {
  const tags = dbGetAll('tags') as AnyRecord[]
  const rows = tags
    .map((tag) => {
      const color = TAG_COLORS.find((c) => c.label === tag.color) ?? {
        bg: '#e5e7eb',
        text: '#374151',
        border: '#d1d5db',
        label: 'Slate',
      }
      if (_editingTagId === String(tag.id)) {
        return `<div class="card" style="padding:.875rem"><input class="input" id="tag-edit-name" value="${escH(String(tag.name || ''))}" style="margin-bottom:.5rem"><div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.5rem">${TAG_COLORS.map((c) => `<button class="tag-color-btn-edit" data-color="${escH(c.label)}" style="width:24px;height:24px;border-radius:99px;border:2px solid ${_editTagColor === c.label ? c.text : c.border};background:${c.bg}" title="${escH(c.label)}"></button>`).join('')}</div><button class="btn btn-primary btn-sm" id="tag-edit-save">Save</button><button class="btn btn-ghost btn-sm" id="tag-edit-cancel">Cancel</button></div>`
      }
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.6rem;border-bottom:1px solid var(--border-subtle)"><span style="display:inline-flex;align-items:center;gap:.5rem"><span style="width:10px;height:10px;border-radius:99px;background:${color.bg};border:1px solid ${color.border}"></span>${escH(String(tag.name || ''))}</span><button class="btn btn-ghost btn-sm" data-edit-tag="${escH(String(tag.id))}">${Icons.Edit(14)}</button></div>`
    })
    .join('')
  return `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Tags</h2><div class="card" style="padding:1.25rem;margin-bottom:1rem"><div style="display:flex;gap:.5rem"><input class="input" id="new-tag-name" placeholder="New tag"><button class="btn btn-primary btn-sm" id="new-tag-add">${Icons.Plus(14)} Add</button></div></div><div class="card">${rows || '<div style="padding:1rem;color:var(--text-secondary)">No tags yet.</div>'}</div>`
}

function renderRecycleBin(): string {
  const items = dbGetAll('trash') as AnyRecord[]
  const rows = items
    .map(
      (item) =>
        `<div style="display:flex;justify-content:space-between;gap:.75rem;align-items:center;padding:.75rem;border-bottom:1px solid var(--border-subtle)"><div><div style="font-weight:500">${escH(String(item.name || item.title || 'Deleted item'))}</div><div style="font-size:.75rem;color:var(--text-secondary)">${escH(String(item.store || 'record'))}</div></div><div style="display:flex;gap:.4rem"><button class="btn btn-secondary btn-sm" data-rb-restore="${escH(String(item.id))}">Restore</button><button class="btn btn-danger btn-sm" data-rb-perma="${escH(String(item.id))}">Delete</button></div></div>`,
    )
    .join('')
  return `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Recycle Bin</h2><div class="card" style="padding:1.25rem;margin-bottom:1rem"><strong>${items.length}</strong> ${plural(items.length, 'item')} in recycle bin <button class="btn btn-danger btn-sm" id="recyclebin-empty" style="margin-left:.75rem" ${items.length ? '' : 'disabled'}>Empty</button></div><div class="card">${rows || '<div style="padding:1rem;color:var(--text-secondary)">Recycle bin is empty.</div>'}</div>`
}

export function bindSettings(_state: AppState): void {
  document.querySelectorAll<HTMLElement>('[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _settingsSection = (btn.dataset as DOMStringMap & { section: string }).section
      setState({ currentView: 'settings' })
    })
  })

  document.querySelectorAll<HTMLElement>('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTheme((btn.dataset as DOMStringMap & { theme: string }).theme)
    })
  })
  document.querySelectorAll<HTMLElement>('[data-density-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const density = (btn.dataset as DOMStringMap & { densitySet: 'compact' | 'comfortable' })
        .densitySet
      setDensity(density)
      showToast('Density updated', 'success')
      setState({ density })
    })
  })

  bindProfile()
  bindNotifications()
  bindSecurity()
  bindStorage()
  bindData()
  bindTags()
  bindRecycleBin()
}

function bindProfile(): void {
  document.getElementById('profile-save')?.addEventListener('click', () => {
    const name =
      (document.getElementById('profile-name') as HTMLInputElement | null)?.value?.trim() || ''
    const inits = (
      (document.getElementById('profile-initials') as HTMLInputElement | null)?.value?.trim() || ''
    )
      .toUpperCase()
      .slice(0, 2)
    localStorage.setItem(
      LS_USER_PROFILE_KEY,
      JSON.stringify({ displayName: name, initials: inits }),
    )
    showToast('Profile saved', 'success')
    setState({})
  })
}

function bindNotifications(): void {
  document.getElementById('notif-prefs-save')?.addEventListener('click', () => {
    const dueDateReminders =
      (document.getElementById('notif-due-dates') as HTMLInputElement | null)?.checked ?? true
    const overdueAlerts =
      (document.getElementById('notif-overdue') as HTMLInputElement | null)?.checked ?? true
    const mentions =
      (document.getElementById('notif-mentions') as HTMLInputElement | null)?.checked ?? true
    localStorage.setItem(
      LS_NOTIF_PREFS_KEY,
      JSON.stringify({ dueDateReminders, overdueAlerts, mentions }),
    )
    showToast('Notification preferences saved', 'success')
  })
}

function bindSecurity(): void {
  if (_settingsSection === 'security') {
    loadSecurityState()
    document.getElementById('lock-now-btn')?.addEventListener('click', () => {
      _lockApp()
    })
    document.getElementById('lock-timeout-select')?.addEventListener('change', (e) => {
      _setLockTimeout(parseInt((e.target as HTMLSelectElement).value, 10))
      showToast('Auto-lock updated', 'success')
    })
    document.getElementById('totp-enable-btn')?.addEventListener('click', async () => {
      _totpSetupSecret = await _generateNewTOTPSecret()
      _totpSetupStep = 'setup'
      setState({})
      if (_totpSetupTimerInterval) clearInterval(_totpSetupTimerInterval)
      _totpSetupTimerInterval = setInterval(() => {
        const el = document.getElementById('totp-setup-timer')
        if (el) el.textContent = `Code refreshes in ${totpSecondsRemaining()}s`
      }, 1000)
    })
    document.getElementById('totp-disable-btn')?.addEventListener('click', () => {
      showConfirm('Remove TOTP? You will no longer need a code to unlock.', async () => {
        await _disableTOTP()
        _secMFAStatus = null
        showToast('TOTP removed', 'success')
        setState({})
      })
    })
    document.getElementById('totp-setup-cancel')?.addEventListener('click', () => {
      _totpSetupSecret = ''
      _totpSetupStep = 'idle'
      setState({})
    })
    document.getElementById('totp-copy-secret')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(_totpSetupSecret)
      showToast('Secret copied', 'success')
    })
    document.getElementById('totp-setup-verify')?.addEventListener('click', async () => {
      const code =
        (document.getElementById('totp-setup-code') as HTMLInputElement | null)?.value?.trim() || ''
      const { verifyTOTPCode } = await import('../security/totp.js')
      if (!(await verifyTOTPCode(_totpSetupSecret, code))) {
        const err = document.getElementById('totp-setup-error')
        if (err) {
          err.textContent = 'Invalid code'
          err.style.display = 'block'
        }
        return
      }
      await _enableTOTP(_totpSetupSecret)
      _secMFAStatus = null
      _totpSetupSecret = ''
      _totpSetupStep = 'idle'
      showToast('TOTP enabled', 'success')
      setState({})
    })
    document.getElementById('add-passkey-btn')?.addEventListener('click', async () => {
      const pw = prompt('Enter your vault master password to register a passkey:')
      if (!pw) return
      await _addPasskey(pw)
      _secPasskeys = null
      showToast('Passkey registered', 'success')
      setState({})
    })
    document.querySelectorAll<HTMLElement>('[data-remove-passkey]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showConfirm('Remove this passkey?', async () => {
          await _removePasskey(
            (btn.dataset as DOMStringMap & { removePasskey: string }).removePasskey,
          )
          _secPasskeys = null
          setState({})
        })
      })
    })
    document.getElementById('audit-export-csv')?.addEventListener('click', async () => {
      downloadText(
        `audit-log-${new Date().toISOString().split('T')[0]}.csv`,
        await _exportAuditCSV(),
        'text/csv',
      )
    })
    document.getElementById('audit-export-json')?.addEventListener('click', async () => {
      downloadText(
        `audit-log-${new Date().toISOString().split('T')[0]}.jsonl`,
        await _exportAuditJSON(),
        'application/jsonlines',
      )
    })
    document.getElementById('audit-purge-all')?.addEventListener('click', () => {
      showConfirm('Purge all audit log entries? This cannot be undone.', async () => {
        await _purgeAuditLog(null)
        _secAuditEntries = null
        showToast('Audit log purged', 'success')
        setState({})
      })
    })
  }
}

function loadSecurityState(): void {
  const maybeRender = () => {
    setState({})
  }
  if (!_secMFAStatus && !_secMFALoading) {
    _secMFALoading = true
    _loadMFAStatus()
      .then((s) => {
        _secMFAStatus = s
        _secMFALoading = false
        maybeRender()
      })
      .catch(() => {
        _secMFALoading = false
      })
  }
  if (!_secPasskeys && !_secPasskeysLoading) {
    _secPasskeysLoading = true
    _loadPasskeys()
      .then((p) => {
        _secPasskeys = p
        _secPasskeysLoading = false
        maybeRender()
      })
      .catch(() => {
        _secPasskeysLoading = false
      })
  }
  if (!_secAuditEntries && !_secAuditLoading) {
    _secAuditLoading = true
    _loadAuditLog()
      .then((a) => {
        _secAuditEntries = a
        _secAuditLoading = false
        maybeRender()
      })
      .catch(() => {
        _secAuditLoading = false
      })
  }
}

function bindStorage(): void {
  document.getElementById('fs-create-new')?.addEventListener('click', async () => {
    const handle = await _fsPickFile(true)
    if (handle) await _fsWriteVault()
    showToast(
      handle ? 'Vault file created and linked' : 'No file selected',
      handle ? 'success' : 'error',
    )
    setState({})
  })
  document.getElementById('fs-link-existing')?.addEventListener('click', async () => {
    const handle = await _fsPickFile(false)
    if (handle) await _fsWriteVault()
    showToast(handle ? 'Vault file linked' : 'No file selected', handle ? 'success' : 'error')
    setState({})
  })
  document.getElementById('fs-save-now')?.addEventListener('click', async () => {
    await _fsWriteVault()
    showToast('Saved to vault file', 'success')
    setState({})
  })
  document.getElementById('fs-unlink')?.addEventListener('click', () => {
    showConfirm('Unlink vault file? Your data stays in IndexedDB.', async () => {
      await _fsUnlink()
      showToast('Vault file unlinked', 'success')
      setState({})
    })
  })
}

function bindData(): void {
  document.getElementById('export-backup')?.addEventListener('click', async () => {
    const key = getState().cryptoKey
    const pw = prompt('Enter a backup password:')
    if (!key || !pw) return
    const backup = await exportEncryptedBackup(key, pw)
    downloadText(`taskapp-backup-${new Date().toISOString().split('T')[0]}.taskappbak`, backup)
    showToast('Backup exported', 'success')
  })
  document
    .getElementById('import-backup')
    ?.addEventListener('click', () => document.getElementById('import-backup-file')?.click())
  document.getElementById('import-backup-file')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    const key = getState().cryptoKey
    const pw = prompt('Enter the backup password:')
    if (!file || !key || !pw) return
    await importEncryptedBackup(await file.text(), pw, key)
    reloadData()
    showToast('Backup imported', 'success')
  })
  document.getElementById('export-json')?.addEventListener('click', async () => {
    const key = getState().cryptoKey
    if (!key) return
    downloadText('taskapp-data.json', await exportJSON(key), 'application/json')
    showToast('JSON exported', 'success')
  })
  document
    .getElementById('import-json')
    ?.addEventListener('click', () => document.getElementById('import-json-file')?.click())
  document.getElementById('import-json-file')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    const key = getState().cryptoKey
    if (!file || !key) return
    await importJSON(await file.text(), key)
    reloadData()
    showToast('JSON imported', 'success')
  })
  document.getElementById('change-password')?.addEventListener('click', async () => {
    const current = (document.getElementById('pw-current') as HTMLInputElement | null)?.value || ''
    const next = (document.getElementById('pw-new') as HTMLInputElement | null)?.value || ''
    const confirm = (document.getElementById('pw-confirm') as HTMLInputElement | null)?.value || ''
    if (next !== confirm) {
      showToast('Passwords do not match', 'error')
      return
    }
    const oldKey = await initCrypto(current)
    if (!(await verifyPassword(oldKey))) {
      showToast('Current password is incorrect', 'error')
      return
    }
    const newKey = await changePassword(oldKey, next)
    await cacheSessionKey(newKey)
    setState({ cryptoKey: newKey })
    showToast('Password changed', 'success')
  })
}

function bindTags(): void {
  document.getElementById('new-tag-add')?.addEventListener('click', async () => {
    const name =
      (document.getElementById('new-tag-name') as HTMLInputElement | null)?.value?.trim() || ''
    if (!name) return
    await dbCreate('tags', { name, color: 'Slate' })
    reloadData()
  })
  document.querySelectorAll<HTMLElement>('[data-edit-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _editingTagId = (btn.dataset as DOMStringMap & { editTag: string }).editTag
      const tag = (dbGetAll('tags') as AnyRecord[]).find((t) => String(t.id) === _editingTagId)
      _editTagColor = String(tag?.color || 'Slate')
      setState({})
    })
  })
  document.getElementById('tag-edit-cancel')?.addEventListener('click', () => {
    _editingTagId = null
    setState({})
  })
  document.getElementById('tag-edit-save')?.addEventListener('click', async () => {
    const name =
      (document.getElementById('tag-edit-name') as HTMLInputElement | null)?.value?.trim() || ''
    if (!_editingTagId || !name) return
    await dbUpdate('tags', _editingTagId, { name, color: _editTagColor })
    _editingTagId = null
    reloadData()
  })
  document.querySelectorAll<HTMLElement>('.tag-color-btn-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      _editTagColor = (btn.dataset as DOMStringMap & { color: string }).color
      setState({})
    })
  })
}

function bindRecycleBin(): void {
  document.getElementById('recyclebin-empty')?.addEventListener('click', () => {
    showConfirm(
      'Permanently delete everything in the Recycle Bin? This cannot be undone.',
      async () => {
        for (const item of dbGetAll('trash') as AnyRecord[]) await permanentDelete(String(item.id))
        reloadData()
      },
    )
  })
  document.querySelectorAll<HTMLElement>('[data-rb-restore]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await restoreFromTrash((btn.dataset as DOMStringMap & { rbRestore: string }).rbRestore)
      reloadData()
    })
  })
  document.querySelectorAll<HTMLElement>('[data-rb-perma]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showConfirm('Permanently delete this item?', async () => {
        await permanentDelete((btn.dataset as DOMStringMap & { rbPerma: string }).rbPerma)
        reloadData()
      })
    })
  })
}
