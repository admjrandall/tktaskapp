// ── SETTINGS ──────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 4445–4652.

import { escH, readFileAsText, downloadText, plural, formatRelative, initials, avatarColor } from '../utils.js';
import { Icons } from '../icons.js';
import { dbCreate, softDelete, dbGetAll, permanentDelete, restoreFromTrash, getAdapter } from '../db.js';
import {
  getState, setState, showToast, showConfirm, reloadData, setTheme,
} from '../state.js';
import type { AppState } from '../state.js';
import { changePassword, exportEncryptedBackup, importEncryptedBackup, exportJSON, importJSON, initCrypto, verifyPassword } from '../vault.js';
import { cacheSessionKey, clearSessionKey } from '../session.js';
import { _idbClearStore } from '../idb-data.js';
import { _vaultDbOpen } from '../vault.js';
import { VAULT_META_STORE, TAG_COLORS } from '../constants.js';
import { assertLocalAIEndpointAllowed, deploymentPolicy, isAITierAllowed, isOTOnlyMode } from '../deployment-policy.js';
import { isWebAuthnAvailable } from '../webauthn.js';
import { generateQRCodeSVG, buildOTPAuthURI, totpSecondsRemaining } from '../totp.js';

type AnyRecord = Record<string, unknown>;

// AI hooks — injected by main.ts
let _aiPrefs: AnyRecord = {};
let _getAIReady: () => boolean = () => false;
let _getAILoadStarted: () => boolean = () => false;
let _getAISecrets: () => AnyRecord = () => ({});
let BROWSER_MODELS: { id: string; label: string; size: string; desc: string }[] = [];
let CLOUD_PROVIDERS: Record<string, { label: string; models: { id: string; label: string; priceIn: number; priceOut: number }[] }> = {};

let _openAIWizard: (step: number) => void = () => {};
let _saveAIPrefs: (prefs: AnyRecord) => void = () => {};
let _resetAIConnection: () => Promise<void> = async () => {};
let _startAILoad: () => void = () => {};
let _probeOllama: (url: string) => Promise<{ state: string; version?: string; models?: unknown[] }> = async () => ({ state: 'down' });
let _testCloudKey: (prov: string, key: string) => Promise<{ ok: boolean; error?: string }> = async () => ({ ok: false });
let _aiSecretsLoad: () => Promise<AnyRecord> = async () => ({});
let _aiSecretsSave: (s: AnyRecord) => Promise<void> = async () => {};
let _aiSecretsWipe: () => Promise<void> = async () => {};
let _aiHistory: AnyRecord[] = [];
let _pendingAction: unknown = null;
let _aiCurrentMonthKey: () => string = () => '';
let _aiWizard: AnyRecord = {};
let _appRenderWorkspace: (view: string) => void = () => {};
let _fullRender: (state: AppState) => void = () => {};

export function setSettingsAIHooks(hooks: {
  aiPrefs: AnyRecord;
  getAIReady: () => boolean;
  getAILoadStarted: () => boolean;
  getAISecrets: () => AnyRecord;
  browserModels: typeof BROWSER_MODELS;
  cloudProviders: typeof CLOUD_PROVIDERS;
  openAIWizard: typeof _openAIWizard;
  saveAIPrefs: typeof _saveAIPrefs;
  resetAIConnection: typeof _resetAIConnection;
  startAILoad: typeof _startAILoad;
  probeOllama: typeof _probeOllama;
  testCloudKey: typeof _testCloudKey;
  aiSecretsLoad: typeof _aiSecretsLoad;
  aiSecretsSave: typeof _aiSecretsSave;
  aiSecretsWipe: typeof _aiSecretsWipe;
  aiHistory: AnyRecord[];
  pendingAction: unknown;
  aiCurrentMonthKey: typeof _aiCurrentMonthKey;
  aiWizard: AnyRecord;
  appRenderWorkspace: typeof _appRenderWorkspace;
  fullRender: typeof _fullRender;
}): void {
  _aiPrefs = hooks.aiPrefs;
  _getAIReady = hooks.getAIReady;
  _getAILoadStarted = hooks.getAILoadStarted;
  _getAISecrets = hooks.getAISecrets;
  BROWSER_MODELS = hooks.browserModels;
  CLOUD_PROVIDERS = hooks.cloudProviders;
  _openAIWizard = hooks.openAIWizard;
  _saveAIPrefs = hooks.saveAIPrefs;
  _resetAIConnection = hooks.resetAIConnection;
  _startAILoad = hooks.startAILoad;
  _probeOllama = hooks.probeOllama;
  _testCloudKey = hooks.testCloudKey;
  _aiSecretsLoad = hooks.aiSecretsLoad;
  _aiSecretsSave = hooks.aiSecretsSave;
  _aiSecretsWipe = hooks.aiSecretsWipe;
  _aiHistory = hooks.aiHistory;
  _pendingAction = hooks.pendingAction;
  _aiCurrentMonthKey = hooks.aiCurrentMonthKey;
  _aiWizard = hooks.aiWizard;
  _appRenderWorkspace = hooks.appRenderWorkspace;
  _fullRender = hooks.fullRender;
}

// FS hooks — injected by main.ts
let _isFsReady: () => boolean = () => false;
let _getFsLastSave: () => string | null = () => null;
let _fsPickFile: (forceNew?: boolean) => Promise<unknown> = async () => null;
let _fsWriteVault: () => Promise<void> = async () => {};
let _fsUnlink: () => Promise<void> = async () => {};

export function setSettingsFsHooks(hooks: {
  isFsReady: () => boolean;
  getFsLastSave: () => string | null;
  fsPickFile: (forceNew?: boolean) => Promise<unknown>;
  fsWriteVault: () => Promise<void>;
  fsUnlink: () => Promise<void>;
}): void {
  _isFsReady = hooks.isFsReady;
  _getFsLastSave = hooks.getFsLastSave;
  _fsPickFile = hooks.fsPickFile;
  _fsWriteVault = hooks.fsWriteVault;
  _fsUnlink = hooks.fsUnlink;
}

// Security hooks — injected by main.ts
let _lockApp: () => void = () => {};
let _setLockTimeout: (mins: number) => void = () => {};
let _getLockTimeout: () => number = () => 15;
let _loadAuditLog: () => Promise<Array<{ id: string; ts: string; event: string; details: Record<string, string>; ua: string }>> = async () => [];
let _exportAuditCSV: () => Promise<string> = async () => '';
let _exportAuditJSON: () => Promise<string> = async () => '';
let _purgeAuditLog: (days: number | null) => Promise<void> = async () => {};
let _loadMFAStatus: () => Promise<{ totpEnabled: boolean; totpSecret: string }> = async () => ({ totpEnabled: false, totpSecret: '' });
let _enableTOTP: (secret: string) => Promise<void> = async () => {};
let _disableTOTP: () => Promise<void> = async () => {};
let _generateNewTOTPSecret: () => Promise<string> = async () => '';
let _loadPasskeys: () => Promise<Array<{ id: string; deviceHint?: string; createdAt: string }>> = async () => [];
let _addPasskey: (pw: string) => Promise<unknown> = async () => null;
let _removePasskey: (id: string) => Promise<void> = async () => {};
let _getLastActivityAt: () => number = () => Date.now();

export function setSettingsSecurityHooks(hooks: {
  lockApp: () => void;
  setLockTimeout: (mins: number) => void;
  getLockTimeout: () => number;
  loadAuditLog: typeof _loadAuditLog;
  exportAuditCSV: typeof _exportAuditCSV;
  exportAuditJSON: typeof _exportAuditJSON;
  purgeAuditLog: typeof _purgeAuditLog;
  loadMFAStatus: typeof _loadMFAStatus;
  enableTOTP: typeof _enableTOTP;
  disableTOTP: typeof _disableTOTP;
  generateNewTOTPSecret: typeof _generateNewTOTPSecret;
  loadPasskeys: typeof _loadPasskeys;
  addPasskey: typeof _addPasskey;
  removePasskey: typeof _removePasskey;
  getLastActivityAt: () => number;
}): void {
  _lockApp = hooks.lockApp;
  _setLockTimeout = hooks.setLockTimeout;
  _getLockTimeout = hooks.getLockTimeout;
  _loadAuditLog = hooks.loadAuditLog;
  _exportAuditCSV = hooks.exportAuditCSV;
  _exportAuditJSON = hooks.exportAuditJSON;
  _purgeAuditLog = hooks.purgeAuditLog;
  _loadMFAStatus = hooks.loadMFAStatus;
  _enableTOTP = hooks.enableTOTP;
  _disableTOTP = hooks.disableTOTP;
  _generateNewTOTPSecret = hooks.generateNewTOTPSecret;
  _loadPasskeys = hooks.loadPasskeys;
  _addPasskey = hooks.addPasskey;
  _removePasskey = hooks.removePasskey;
  _getLastActivityAt = hooks.getLastActivityAt;
}

// Async security state — loaded lazily when section is rendered
let _secMFAStatus: { totpEnabled: boolean; totpSecret: string } | null = null;
let _secPasskeys: Array<{ id: string; deviceHint?: string; createdAt: string }> | null = null;
let _secAuditEntries: Array<{ id: string; ts: string; event: string; details: Record<string, string>; ua: string }> | null = null;
// In-flight flags prevent duplicate concurrent loads that cause re-render cascades
let _secMFALoading = false;
let _secPasskeysLoading = false;
let _secAuditLoading = false;
let _secAuditFilter = '';
let _secAuditPage = 0;
const AUDIT_PAGE_SIZE = 50;
// TOTP setup wizard state
let _totpSetupSecret = '';
let _totpSetupStep: 'idle' | 'setup' | 'verify' = 'idle';
let _totpSetupTimerInterval: ReturnType<typeof setInterval> | null = null;

let _settingsSection = 'general';
export function setSettingsSection(s: string): void { _settingsSection = s; }

// Reset security state when leaving security section
export function resetSecurityState(): void {
  _secMFAStatus = null;
  _secPasskeys = null;
  _secAuditEntries = null;
  _secMFALoading = false;
  _secPasskeysLoading = false;
  _secAuditLoading = false;
  _totpSetupSecret = '';
  _totpSetupStep = 'idle';
  _secAuditPage = 0;
}

export function renderSettings(state: AppState): string {
  const secs = [
    { id: 'general',    label: 'General' },
    { id: 'ai',         label: 'AI' },
    { id: 'security',   label: 'Security' },
    { id: 'storage',    label: 'Storage' },
    { id: 'data',       label: 'Data & Backup' },
    { id: 'tags',       label: 'Tags' },
    { id: 'recyclebin', label: 'Recycle Bin' },
    { id: 'about',      label: 'About' },
  ];
  const nav = secs.map(s => `<button class="settings-nav-item ${_settingsSection === s.id ? 'active' : ''}" data-section="${s.id}">${s.label}</button>`).join('');
  let body = '';

  if (_settingsSection === 'general') {
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">General</h2><div class="card" style="padding:1.25rem"><div style="font-weight:600;margin-bottom:.75rem">Appearance</div><div style="display:flex;gap:.75rem"><button class="btn ${state.theme === 'light' ? 'btn-primary' : 'btn-secondary'}" data-theme="light">${Icons.Sun(16)} Light</button><button class="btn ${state.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" data-theme="dark">${Icons.Moon(16)} Dark</button></div></div>`;
  } else if (_settingsSection === 'ai') {
    const p = _aiPrefs;
    const aiReady = _getAIReady();
    const aiLoadStarted = _getAILoadStarted();
    const aiSecrets = _getAISecrets();
    const tier = p.tier as string;
    const cp = (CLOUD_PROVIDERS as Record<string, { label: string; models: { id: string; label: string; priceIn: number; priceOut: number }[] }>);
    const tierLabel = tier === 'browser' ? 'In-browser' : tier === 'ollama' ? (isOTOnlyMode() ? 'Local/Internal AI Server' : 'Ollama') : tier === 'cloud' ? `Cloud · ${cp[(p.cloud as AnyRecord)?.provider as string]?.label || ''}` : 'Not configured';
    const modelLabel = (() => {
      if (tier === 'browser') return BROWSER_MODELS.find(m => m.id === (p.browser as AnyRecord)?.modelId)?.label || '';
      if (tier === 'ollama') return String((p.ollama as AnyRecord)?.modelId || '');
      if (tier === 'cloud' && (p.cloud as AnyRecord)?.provider) return cp[(p.cloud as AnyRecord).provider as string]?.models.find(m => m.id === ((p.cloud as AnyRecord).modelByProvider as Record<string,string>)[(p.cloud as AnyRecord).provider as string])?.label || '';
      return '';
    })();
    const statusDot = aiReady ? '#10b981' : (aiLoadStarted ? '#f59e0b' : '#94a3b8');
    const statusText = aiReady ? 'Running' : (aiLoadStarted ? 'Loading…' : 'Idle');
    const cost = (p.cloud as AnyRecord)?.usage as AnyRecord || {};
    const monthlyCost = `$${((cost.estCostUsd as number) || 0).toFixed(4)}`;
    let tierPanel = '';
    if (tier && !isAITierAllowed(tier)) {
      tierPanel = `<div class="card" style="padding:1rem;margin-bottom:1rem;border-color:#fecaca;color:#991b1b">The saved AI tier is not allowed in the ${escH(deploymentPolicy.label)} build. Change AI setup to select an approved local/internal endpoint.</div>`;
    } else if (tier === 'browser') {
      tierPanel = `<div class="card" style="padding:1rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.625rem">In-browser model</div>${BROWSER_MODELS.map(m => `<label style="display:flex;gap:.625rem;align-items:flex-start;padding:.5rem .625rem;border:1px solid ${(p.browser as AnyRecord)?.modelId===m.id?'var(--accent)':'var(--border-subtle)'};border-radius:var(--radius-sm);margin-bottom:.375rem;cursor:pointer;background:${(p.browser as AnyRecord)?.modelId===m.id?'var(--bg-base)':'transparent'}"><input type="radio" name="ai-browser-model" value="${escH(m.id)}" ${(p.browser as AnyRecord)?.modelId===m.id?'checked':''} style="margin-top:.25rem"><div style="flex:1"><div style="font-weight:600;font-size:.8125rem">${escH(m.label)} <span style="font-size:.7rem;color:var(--text-tertiary);font-weight:500">${escH(m.size)}</span>${((p.browser as AnyRecord)?.weightsCached as Record<string,boolean>)?.[m.id]?' <span style="font-size:.65rem;color:#10b981;font-weight:600">CACHED</span>':''}</div><div style="font-size:.7rem;color:var(--text-secondary);margin-top:.125rem">${escH(m.desc)}</div></div></label>`).join('')}<div style="display:flex;gap:.5rem;margin-top:.625rem"><button class="btn btn-secondary btn-sm" id="ai-clear-cache">${Icons.Trash(14)} Clear cached weights</button></div></div>`;
    } else if (tier === 'ollama') {
      tierPanel = `<div class="card" style="padding:1rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.625rem">${isOTOnlyMode() ? 'Local/Internal AI Server' : 'Ollama'}</div><div class="form-group" style="margin-bottom:.5rem"><label class="form-label">URL</label><input class="input" id="ai-ollama-url" value="${escH(String((p.ollama as AnyRecord)?.url || ''))}" placeholder="http://localhost:11434 or https://ai-server.internal"></div><div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.625rem"><button class="btn btn-secondary btn-sm" id="ai-ollama-probe">${Icons.Refresh(14)} Test connection</button><button class="btn btn-secondary btn-sm" id="ai-ollama-browse">${Icons.Plus(14)} Browse models</button></div><div style="font-size:.75rem;color:var(--text-tertiary);line-height:1.5">Current model: <code>${escH(String((p.ollama as AnyRecord)?.modelId || 'none'))}</code>${isOTOnlyMode() ? '<br>Cloud AI and internet model downloads are disabled in this build.' : ''}</div></div>`;
    } else if (tier === 'cloud') {
      const prov = (p.cloud as AnyRecord)?.provider as string;
      const def = cp[prov];
      tierPanel = `<div class="card" style="padding:1rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.625rem">${escH(def?.label || 'Cloud')}</div><div style="font-size:.8125rem;margin-bottom:.5rem">API key: ${aiSecrets[prov] ? '<span style="color:#10b981;font-weight:600">✓ Set</span>' : '<span style="color:#dc2626;font-weight:600">Not set</span>'}</div><div class="form-group" style="margin-bottom:.5rem"><label class="form-label">Model</label><select class="input" id="ai-cloud-model">${def?.models.map(m => `<option value="${escH(m.id)}" ${((p.cloud as AnyRecord).modelByProvider as Record<string,string>)[prov]===m.id?'selected':''}>${escH(m.label)} — $${m.priceIn}/$${m.priceOut} per MTok</option>`).join('') || ''}</select></div><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" id="ai-cloud-replace-key">${Icons.Edit(14)} Replace key</button>${aiSecrets[prov] ? `<button class="btn btn-secondary btn-sm" id="ai-cloud-remove-key">${Icons.Trash(14)} Remove key</button>` : ''}<button class="btn btn-secondary btn-sm" id="ai-cloud-test">Test</button></div><div style="margin-top:.75rem;padding-top:.625rem;border-top:1px solid var(--border-subtle);font-size:.75rem;color:var(--text-secondary)">This month (${escH(String(cost.monthKey || _aiCurrentMonthKey()))}): ${cost.tokensIn} in / ${cost.tokensOut} out · est. <strong>${monthlyCost}</strong></div></div>`;
    }
    if (isOTOnlyMode()) {
      const nanoEnabled = !!(p.hasCompletedOnboarding) && p.tier === 'browser';
      const nanoStatusText = aiReady ? 'Running' : (aiLoadStarted ? 'Loading…' : nanoEnabled ? 'Not loaded' : 'Disabled');
      body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:.5rem">AI</h2>
        <div style="font-size:.875rem;color:var(--text-secondary);margin-bottom:1rem">Chrome Built-in AI (Gemini Nano) is the only available AI engine in this offline build. All inference runs locally — no data leaves this device.</div>
        <div class="card" style="padding:1rem;margin-bottom:1rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">
          <span style="width:10px;height:10px;border-radius:50%;background:${statusDot};flex-shrink:0"></span>
          <div style="flex:1;min-width:200px"><div style="font-weight:600">Gemini Nano</div><div style="font-size:.75rem;color:var(--text-secondary)">${escH(nanoStatusText)}</div></div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            ${nanoEnabled
              ? `${!aiReady ? `<button class="btn btn-primary btn-sm" id="ai-reconnect">${Icons.Refresh(14)} Load Nano</button>` : ''}<button class="btn btn-secondary btn-sm" id="ai-disable-nano">Disable AI</button>`
              : `<button class="btn btn-primary btn-sm" id="ai-enable-nano">Enable AI (Nano)</button>`}
          </div>
        </div>
        <div class="card" style="padding:1rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.625rem">Behaviour</div><label style="display:flex;gap:.5rem;align-items:flex-start;font-size:.8125rem;cursor:pointer"><input type="checkbox" id="ai-auto-apply" ${p.autoApplyCreates ? 'checked' : ''}><span>Auto-apply AI actions without confirmation <span style="color:var(--text-tertiary)">(off by default)</span></span></label><div style="margin-top:.625rem"><button class="btn btn-secondary btn-sm" id="ai-clear-history">${Icons.Trash(14)} Clear chat history</button></div></div>
        <div class="card" style="padding:1rem;border-color:#fecaca"><div style="font-weight:600;margin-bottom:.5rem;color:#dc2626">Danger zone</div><button class="btn btn-secondary btn-sm" id="ai-reset-setup" style="color:#dc2626">Reset AI setup</button></div>`;
    } else {
      const aiIntro = 'AI is opt-in. Pick how it runs and which model to use.';
      body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:.5rem">AI</h2><div style="font-size:.875rem;color:var(--text-secondary);margin-bottom:1rem">${aiIntro}</div><div class="card" style="padding:1rem;margin-bottom:1rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap"><span style="width:10px;height:10px;border-radius:50%;background:${statusDot};flex-shrink:0"></span><div style="flex:1;min-width:200px"><div style="font-weight:600">${escH(tierLabel)}</div><div style="font-size:.75rem;color:var(--text-secondary)">${escH(modelLabel)} · ${escH(statusText)}</div></div><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="ai-open-wizard">${Icons.Settings(14)} Change AI setup</button>${p.hasCompletedOnboarding ? `<button class="btn btn-secondary btn-sm" id="ai-reconnect">${Icons.Refresh(14)} Reconnect</button>` : ''}</div></div>${tierPanel}<div class="card" style="padding:1rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.625rem">Behaviour</div><label style="display:flex;gap:.5rem;align-items:flex-start;font-size:.8125rem;cursor:pointer"><input type="checkbox" id="ai-auto-apply" ${p.autoApplyCreates ? 'checked' : ''}><span>Auto-apply AI actions without confirmation <span style="color:var(--text-tertiary)">(off by default)</span></span></label><div style="margin-top:.625rem"><button class="btn btn-secondary btn-sm" id="ai-clear-history">${Icons.Trash(14)} Clear chat history</button></div></div><div class="card" style="padding:1rem;border-color:#fecaca"><div style="font-weight:600;margin-bottom:.5rem;color:#dc2626">Danger zone</div><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" id="ai-forget-keys" style="color:#dc2626">Forget all API keys</button><button class="btn btn-secondary btn-sm" id="ai-reset-setup" style="color:#dc2626">Reset AI setup</button></div></div>`;
    }
  } else if (_settingsSection === 'security') {
    const lockTimeoutMins = _getLockTimeout();
    const lastActivity = _getLastActivityAt();
    const lastActivityStr = lastActivity ? new Date(lastActivity).toLocaleTimeString() : 'N/A';

    // ── Section 1: Session Security ──────────────────────────────────────────
    const sessionSection = `<div class="card" style="padding:1.25rem;margin-bottom:1rem">
      <div style="font-weight:600;margin-bottom:.75rem">Session Security</div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label class="form-label">Auto-lock after idle</label>
        <select class="input" id="lock-timeout-select" style="width:auto">
          <option value="0"  ${lockTimeoutMins===0?'selected':''}>Off</option>
          <option value="5"  ${lockTimeoutMins===5?'selected':''}>5 minutes</option>
          <option value="10" ${lockTimeoutMins===10?'selected':''}>10 minutes</option>
          <option value="15" ${lockTimeoutMins===15?'selected':''}>15 minutes (default)</option>
          <option value="30" ${lockTimeoutMins===30?'selected':''}>30 minutes</option>
          <option value="60" ${lockTimeoutMins===60?'selected':''}>60 minutes</option>
        </select>
      </div>
      <div style="font-size:.75rem;color:var(--text-tertiary);margin-bottom:.75rem">Last activity: ${escH(lastActivityStr)}</div>
      <button class="btn btn-secondary btn-sm" id="lock-now-btn">${Icons.Lock(14)} Lock Now</button>
    </div>`;

    // ── Section 2: Change Password ────────────────────────────────────────────
    const passwordSection = `<div class="card" style="padding:1.25rem;margin-bottom:1rem">
      <div style="font-weight:600;margin-bottom:.75rem">Change Password</div>
      <div style="display:flex;flex-direction:column;gap:.75rem">
        <div class="form-group"><label class="form-label">Current Password</label><input class="input" type="password" id="pw-current"></div>
        <div class="form-group"><label class="form-label">New Password</label><input class="input" type="password" id="pw-new"></div>
        <div class="form-group"><label class="form-label">Confirm New</label><input class="input" type="password" id="pw-confirm"></div>
        <button class="btn btn-primary" id="change-pw-btn">Change Password</button>
      </div>
    </div>`;

    // ── Section 3: MFA ────────────────────────────────────────────────────────
    const mfaStatus = _secMFAStatus;
    let totpSection = '';
    if (!mfaStatus) {
      // Not yet loaded — show loading state + trigger async load
      totpSection = `<div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-weight:600;margin-bottom:.75rem">Two-Factor Authentication (TOTP)</div>
        <div style="font-size:.875rem;color:var(--text-secondary)" id="totp-loading">Loading…</div>
      </div>`;
    } else if (_totpSetupStep === 'setup') {
      // TOTP setup wizard — show QR code + secret
      const otpauthURI = buildOTPAuthURI(_totpSetupSecret, 'vault');
      const qrSVG = generateQRCodeSVG(otpauthURI);
      const secs = totpSecondsRemaining();
      totpSection = `<div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-weight:600;margin-bottom:.75rem">Set Up Authenticator</div>
        <div style="font-size:.875rem;color:var(--text-secondary);margin-bottom:1rem">Scan the QR code with Microsoft Authenticator, Google Authenticator, Authy, or 1Password.</div>
        ${qrSVG ? `<div style="background:#fff;padding:.75rem;display:inline-block;border-radius:8px;margin-bottom:1rem">${qrSVG}</div><br>` : ''}
        <div style="margin-bottom:.75rem">
          <div style="font-size:.75rem;color:var(--text-tertiary);margin-bottom:.25rem">Manual entry — Secret key:</div>
          <code style="font-size:.8125rem;word-break:break-all;background:var(--bg-base);padding:.375rem .625rem;border-radius:6px;display:block">${escH(_totpSetupSecret)}</code>
          <button class="btn btn-secondary btn-sm" id="totp-copy-secret" style="margin-top:.375rem">${Icons.Edit(12)} Copy Secret</button>
        </div>
        <div style="font-size:.75rem;color:var(--text-tertiary);margin-bottom:.5rem">
          <a href="${escH(otpauthURI)}" style="color:var(--accent);word-break:break-all;font-size:.7rem">Open in authenticator app</a>
        </div>
        <div style="border-top:1px solid var(--border-subtle);padding-top:.875rem;margin-top:.5rem">
          <div style="font-weight:600;margin-bottom:.5rem;font-size:.875rem">Step 2: Verify code</div>
          <div style="font-size:.75rem;color:var(--text-tertiary);margin-bottom:.5rem" id="totp-setup-timer">Code refreshes in ${secs}s</div>
          <div style="display:flex;gap:.5rem;align-items:center">
            <input class="input" type="text" id="totp-setup-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000"
              style="width:140px;font-size:1.25rem;letter-spacing:.2rem;text-align:center" autocomplete="one-time-code">
            <button class="btn btn-primary btn-sm" id="totp-setup-verify">Verify &amp; Enable</button>
          </div>
          <div id="totp-setup-error" style="display:none;color:#f87171;font-size:.8rem;margin-top:.375rem"></div>
        </div>
        <button class="btn btn-secondary btn-sm" id="totp-setup-cancel" style="margin-top:.75rem">Cancel</button>
      </div>`;
    } else {
      const isEnabled = mfaStatus.totpEnabled;
      totpSection = `<div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-weight:600;margin-bottom:.75rem">Two-Factor Authentication (TOTP)</div>
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
          <span style="font-size:.8125rem;font-weight:600;color:${isEnabled ? '#10b981' : '#94a3b8'}">${isEnabled ? '✓ Enabled' : 'Disabled'}</span>
        </div>
        <div style="display:flex;gap:.5rem">
          ${isEnabled
            ? `<button class="btn btn-secondary btn-sm" id="totp-disable-btn" style="color:#dc2626">Remove TOTP</button>`
            : `<button class="btn btn-primary btn-sm" id="totp-enable-btn">Enable TOTP</button>`}
        </div>
      </div>`;
    }

    // WebAuthn passkeys section (only when available)
    let passkeySection = '';
    if (isWebAuthnAvailable()) {
      const passkeys = _secPasskeys || [];
      const passkeyList = passkeys.length
        ? passkeys.map(p => `<div style="display:flex;align-items:center;gap:.625rem;padding:.375rem 0;border-bottom:1px solid var(--border-subtle)">
            <div style="flex:1">
              <div style="font-size:.8125rem;font-weight:500">${escH(p.deviceHint || 'Passkey')}</div>
              <div style="font-size:.7rem;color:var(--text-tertiary)">${formatRelative(p.createdAt)}</div>
            </div>
            <button class="btn btn-ghost btn-icon btn-sm" style="color:#dc2626" data-remove-passkey="${escH(p.id)}">${Icons.Delete(14)}</button>
          </div>`).join('')
        : `<p style="font-size:.875rem;color:var(--text-tertiary)">No passkeys registered</p>`;

      passkeySection = `<div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-weight:600;margin-bottom:.75rem">Passkeys (WebAuthn)</div>
        <div style="font-size:.8125rem;color:var(--text-secondary);margin-bottom:.75rem">Sign in with Touch ID, Face ID, or Windows Hello. Passkeys use the WebAuthn PRF extension to protect your vault.</div>
        ${passkeyList}
        <button class="btn btn-secondary btn-sm" id="add-passkey-btn" style="margin-top:.625rem">Add Passkey</button>
      </div>`;
    }

    // ── Section 4: Audit Log ──────────────────────────────────────────────────
    const auditEntries = _secAuditEntries;
    let auditSection = '';
    if (!auditEntries) {
      auditSection = `<div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-weight:600;margin-bottom:.75rem">Audit Log</div>
        <div style="font-size:.875rem;color:var(--text-secondary)" id="audit-loading">Loading…</div>
      </div>`;
    } else {
      const filtered = _secAuditFilter
        ? auditEntries.filter(e => e.event.includes(_secAuditFilter))
        : auditEntries;
      const paged = filtered.slice(_secAuditPage * AUDIT_PAGE_SIZE, (_secAuditPage + 1) * AUDIT_PAGE_SIZE);
      const totalPages = Math.ceil(filtered.length / AUDIT_PAGE_SIZE);
      const purge = localStorage.getItem('taskapp_audit_purge_days') || '90';
      const rows = paged.map(e => `<tr>
        <td style="padding:.375rem .5rem;font-size:.75rem;white-space:nowrap;color:var(--text-secondary)">${escH(new Date(e.ts).toLocaleString())}</td>
        <td style="padding:.375rem .5rem;font-size:.75rem;font-weight:500">${escH(e.event)}</td>
        <td style="padding:.375rem .5rem;font-size:.7rem;color:var(--text-tertiary);max-width:200px;overflow:hidden;text-overflow:ellipsis">${escH(JSON.stringify(e.details))}</td>
      </tr>`).join('');

      auditSection = `<div class="card" style="padding:1.25rem;margin-bottom:1rem">
        <div style="font-weight:600;margin-bottom:.75rem">Audit Log <span style="font-weight:400;font-size:.8125rem;color:var(--text-secondary)">(${filtered.length} events)</span></div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.75rem">
          <select class="input" id="audit-filter-select" style="width:auto;height:32px;font-size:.8125rem">
            <option value="" ${!_secAuditFilter?'selected':''}>All events</option>
            <option value="auth" ${_secAuditFilter==='auth'?'selected':''}>Auth events</option>
            <option value="mfa" ${_secAuditFilter==='mfa'?'selected':''}>MFA events</option>
            <option value="app_lock" ${_secAuditFilter==='app_lock'?'selected':''}>Lock events</option>
            <option value="vault" ${_secAuditFilter==='vault'?'selected':''}>Vault events</option>
            <option value="ai" ${_secAuditFilter==='ai'?'selected':''}>AI events</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="audit-export-csv">Export CSV</button>
          <button class="btn btn-secondary btn-sm" id="audit-export-json">Export JSON</button>
        </div>
        ${rows ? `<div style="overflow-x:auto;margin-bottom:.75rem"><table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:.375rem .5rem;font-size:.75rem;color:var(--text-tertiary);border-bottom:1px solid var(--border-subtle)">Time</th>
            <th style="text-align:left;padding:.375rem .5rem;font-size:.75rem;color:var(--text-tertiary);border-bottom:1px solid var(--border-subtle)">Event</th>
            <th style="text-align:left;padding:.375rem .5rem;font-size:.75rem;color:var(--text-tertiary);border-bottom:1px solid var(--border-subtle)">Details</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : `<p style="font-size:.875rem;color:var(--text-tertiary)">No events match the filter</p>`}
        ${totalPages > 1 ? `<div style="display:flex;gap:.5rem;align-items:center;font-size:.8125rem">
          <button class="btn btn-ghost btn-sm" id="audit-prev" ${_secAuditPage===0?'disabled':''}>← Prev</button>
          <span style="color:var(--text-secondary)">Page ${_secAuditPage+1} of ${totalPages}</span>
          <button class="btn btn-ghost btn-sm" id="audit-next" ${_secAuditPage>=totalPages-1?'disabled':''}>Next →</button>
        </div>` : ''}
        <div style="border-top:1px solid var(--border-subtle);padding-top:.75rem;margin-top:.75rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
          <label class="form-label" style="margin:0">Auto-purge:</label>
          <select class="input" id="audit-purge-days" style="width:auto;height:32px;font-size:.8125rem">
            <option value="0"   ${purge==='0'?'selected':''}>Never</option>
            <option value="30"  ${purge==='30'?'selected':''}>30 days</option>
            <option value="90"  ${purge==='90'?'selected':''}>90 days (default)</option>
            <option value="365" ${purge==='365'?'selected':''}>1 year</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="audit-purge-all" style="color:#dc2626">Purge All</button>
        </div>
      </div>`;
    }

    // ── Danger Zone ───────────────────────────────────────────────────────────
    const dangerSection = `<div class="card" style="padding:1.25rem;border-color:#fecaca">
      <div style="font-weight:600;margin-bottom:.5rem;color:#dc2626">Danger Zone</div>
      <p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:.75rem">Permanently erase all data and reset the app.</p>
      <button class="btn btn-danger" id="reset-app-btn">Reset App</button>
    </div>`;

    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Security</h2>${sessionSection}${passwordSection}${totpSection}${passkeySection}${auditSection}${dangerSection}`;
  } else if (_settingsSection === 'storage') {
    const hasFsApi = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
    const fsReady = _isFsReady();
    const fsLastSave = _getFsLastSave();
    if (!hasFsApi) {
      body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Storage</h2>
        <div class="card" style="padding:1.25rem">
          <div style="font-weight:600;margin-bottom:.5rem">Vault File</div>
          <p style="font-size:.875rem;color:var(--text-secondary)">Vault file backup is only available in Chrome and Edge (File System Access API). Your data is still safely encrypted in IndexedDB.</p>
        </div>`;
    } else {
      const statusColor = fsReady ? '#22c55e' : '#f59e0b';
      const statusText = fsReady ? '✓ Linked' : '⚠ No file linked';
      const lastSaveText = fsReady && fsLastSave ? `Last saved ${new Date(fsLastSave).toLocaleTimeString()}` : '';
      body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Storage</h2>
        <div class="card" style="padding:1.25rem;margin-bottom:1rem">
          <div style="font-weight:600;margin-bottom:.875rem">Vault File</div>
          <div style="display:flex;align-items:center;gap:.625rem;margin-bottom:1rem">
            <span style="font-size:.8125rem;font-weight:600;color:${statusColor}">${statusText}</span>
            ${lastSaveText ? `<span style="font-size:.75rem;color:var(--text-tertiary)">${escH(lastSaveText)}</span>` : ''}
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            ${fsReady
              ? `<button class="btn btn-primary btn-sm" id="fs-save-now">${Icons.Save(14)} Save Now</button>
                 <button class="btn btn-secondary btn-sm" id="fs-link-existing">${Icons.Upload(14)} Link different file</button>
                 <button class="btn btn-secondary btn-sm" id="fs-unlink" style="color:#dc2626">Unlink</button>`
              : `<button class="btn btn-primary btn-sm" id="fs-create-new">${Icons.Save(14)} Create vault file</button>
                 <button class="btn btn-secondary btn-sm" id="fs-link-existing">${Icons.Upload(14)} Link existing file</button>`}
          </div>
        </div>
        <div class="card" style="padding:1.25rem">
          <div style="font-weight:600;margin-bottom:.5rem">How it works</div>
          <p style="font-size:.875rem;color:var(--text-secondary);line-height:1.6;margin:0">Your encrypted data lives in IndexedDB. Linking a vault file adds a second copy on disk that survives browser cache clearing. The file is written automatically after every change. Only Chrome and Edge support this feature.</p>
        </div>`;
    }
  } else if (_settingsSection === 'data') {
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Data & Backup</h2><div class="card" style="padding:1.25rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.5rem">Export Encrypted Backup</div><div class="form-group" style="margin-bottom:.75rem"><label class="form-label">Backup Password</label><input class="input" type="password" id="backup-pw"></div><button class="btn btn-primary" id="export-encrypted">${Icons.Download(14)} Export .taskappbak</button></div><div class="card" style="padding:1.25rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.5rem">Export JSON</div><button class="btn btn-secondary" id="export-json">${Icons.Download(14)} Export JSON</button></div><div class="card" style="padding:1.25rem"><div style="font-weight:600;margin-bottom:.5rem">Import Backup</div><div class="form-group" style="margin-bottom:.75rem"><label class="form-label">Backup Password (if .taskappbak)</label><input class="input" type="password" id="import-pw"></div><label class="btn btn-secondary" style="cursor:pointer">${Icons.Upload(14)} Choose File<input type="file" id="import-file" accept=".taskappbak,.json" style="display:none"></label></div>`;
  } else if (_settingsSection === 'tags') {
    const { tags } = state; const tArr = tags as AnyRecord[];
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Tags</h2><div class="card" style="padding:1.25rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.75rem">Create Tag</div><div style="display:flex;flex-direction:column;gap:.75rem"><div class="form-group"><label class="form-label">Name</label><input class="input" id="tag-name" placeholder="Tag name…"></div><div class="form-group"><label class="form-label">Color</label><div style="display:flex;gap:.5rem;flex-wrap:wrap">${TAG_COLORS.map(c => `<button class="tag-color-btn" data-color="${c.label}" style="width:28px;height:28px;border-radius:50%;background:${c.bg};border:2px solid ${c.border};cursor:pointer" title="${c.label}"></button>`).join('')}</div></div><button class="btn btn-primary" id="create-tag-btn">${Icons.Plus(14)} Create</button></div></div><div class="card" style="padding:1.25rem">${tArr.length ? tArr.map(t => { const c = TAG_COLORS.find(c => c.label === t.color) || TAG_COLORS[7]!; return `<div style="display:flex;align-items:center;gap:.625rem;padding:.375rem 0;border-bottom:1px solid var(--border-subtle)"><span style="background:${c.bg};color:${c.text};border:1px solid ${c.border};padding:.2rem .625rem;border-radius:999px;font-size:.75rem">${escH(String(t.name || ''))}</span><button class="btn btn-ghost btn-icon btn-sm" style="margin-left:auto;color:#dc2626" data-del-tag="${t.id}">${Icons.Delete(14)}</button></div>`; }).join('') : '<p style="font-size:.875rem;color:var(--text-tertiary)">No tags yet</p>'}</div>`;
  } else if (_settingsSection === 'recyclebin') {
    const tArr = (state.trash as AnyRecord[]);
    const emptyBtn = tArr.length > 0 ? `<button class="btn btn-danger btn-sm" id="recyclebin-empty">Empty Recycle Bin</button>` : '';
    const items = tArr.length
      ? tArr.map(r => {
          const name = escH(String(r.name || r.title || 'Untitled'));
          const [bg, fg] = avatarColor(String(r.name || r.title || 'Untitled'));
          return `<div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 0;border-bottom:1px solid var(--border-subtle)">
            <div class="avatar avatar-sm" style="background:${bg};color:${fg}">${initials(String(r.name || r.title || 'Untitled'))}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
              <div style="font-size:.75rem;color:var(--text-tertiary)">${escH(String(r._store || ''))} · ${formatRelative(String(r.deletedAt || ''))}</div>
            </div>
            <button class="btn btn-secondary btn-sm" data-rb-restore="${r.id}">Restore</button>
            <button class="btn btn-danger btn-sm" data-rb-perma="${r.id}">Delete</button>
          </div>`;
        }).join('')
      : `<p style="font-size:.875rem;color:var(--text-tertiary);text-align:center;padding:2rem 0">Recycle Bin is empty</p>`;
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Recycle Bin</h2>
      <div class="card" style="padding:1.25rem;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:.875rem;color:var(--text-secondary)">${plural(tArr.length, 'item')}</span>
        ${emptyBtn}
      </div>
      <div class="card" style="padding:.25rem 1.25rem">${items}</div>`;
  } else {
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">About</h2>
      <div class="card" style="padding:1.5rem;text-align:center;margin-bottom:1rem">
        <div style="font-size:2rem;font-weight:700;letter-spacing:-.04em;margin-bottom:.25rem">taskapp <span style="color:var(--accent)">CRM</span></div>
        <div style="color:var(--text-tertiary);font-size:.875rem;margin-bottom:1rem">v2.0 · Offline · Encrypted</div>
        <div style="font-size:.8rem;color:var(--text-secondary);line-height:1.8">
          <div>Vanilla JS · No dependencies</div>
          ${isOTOnlyMode() ? '<div>AI: Gemini Nano (Chrome Built-in AI)</div>' : '<div>AI: Gemma 4 E4B via Transformers.js</div>'}
          <div>Encryption: AES-256-GCM (Web Crypto)</div>
        </div>
      </div>
      <div class="card" style="padding:1.25rem">
        <div style="font-weight:600;margin-bottom:.75rem">Privacy Notice</div>
        <div style="font-size:.875rem;color:var(--text-secondary);line-height:1.7">
          <p style="margin:0 0 .625rem">Task App CRM is a fully <strong>offline, local-only</strong> application. All data you enter is stored exclusively in your browser's IndexedDB, encrypted with AES-256-GCM using a key derived from your master password (PBKDF2-HMAC-SHA-256, 600,000 iterations).</p>
          <p style="margin:0 0 .625rem"><strong>No data is transmitted to any server.</strong> No telemetry, analytics, crash reports, or usage data is collected or sent anywhere.</p>
          <p style="margin:0 0 .625rem">If you use the optional AI features with a local Ollama server or cloud AI provider, queries are sent to that endpoint only. Queries are not logged by this application except in the encrypted audit log you control.</p>
          <p style="margin:0 0 .625rem">Your data is protected by your master password and lives entirely on your device. Clearing browser data or using a different browser will result in data loss unless you have linked a vault file or exported a backup.</p>
          <p style="margin:0"><strong>Your rights (GDPR/CCPA):</strong> You have full control — export, import, or permanently delete all your data at any time from Settings → Data &amp; Backup and Settings → Security → Danger Zone.</p>
        </div>
      </div>`;
  }
  return `<div style="display:flex;flex-direction:column;height:100%"><div class="workspace-toolbar"><span style="font-weight:600">Settings</span></div><div style="flex:1;display:flex;overflow:hidden"><div style="padding:1rem .75rem;border-right:1px solid var(--border-subtle);background:var(--bg-base);flex-shrink:0"><div class="settings-nav">${nav}</div></div><div style="flex:1;overflow-y:auto;padding:1.5rem">${body}</div></div></div>`;
}

async function requireReauth(): Promise<boolean> {
  return new Promise(resolve => {
    showConfirm(
      '<div style="margin-bottom:.75rem;font-weight:600">Re-enter your master password to continue</div>' +
      '<input class="input" type="password" id="reauth-pw" placeholder="Master password" autocomplete="current-password" style="width:100%;margin-top:.25rem">',
      async () => {
        const pw = (document.getElementById('reauth-pw') as HTMLInputElement | null)?.value || '';
        if (!pw) { resolve(false); return; }
        try {
          const key = await initCrypto(pw);
          const ok = await verifyPassword(key);
          resolve(ok);
          if (!ok) showToast('Incorrect password', 'error');
        } catch { resolve(false); showToast('Incorrect password', 'error'); }
      },
      () => resolve(false),
    );
  });
}

export function bindSettings(state: AppState): void {
  const _state = getState();
  document.querySelectorAll<HTMLElement>('[data-section]').forEach(btn => btn.addEventListener('click', () => { _settingsSection = (btn.dataset as DOMStringMap & { section: string }).section; _appRenderWorkspace('settings'); }));
  document.querySelectorAll<HTMLElement>('[data-theme]').forEach(btn => btn.addEventListener('click', () => setTheme((btn.dataset as DOMStringMap & { theme: string }).theme)));

  document.getElementById('change-pw-btn')?.addEventListener('click', async () => {
    const cur = (document.getElementById('pw-current') as HTMLInputElement | null)?.value;
    const nw = (document.getElementById('pw-new') as HTMLInputElement | null)?.value;
    const cf = (document.getElementById('pw-confirm') as HTMLInputElement | null)?.value;
    if (!cur || !nw || !cf) { showToast('All fields required', 'error'); return; }
    if (nw !== cf) { showToast('Passwords do not match', 'error'); return; }
    if (nw.length < 8) { showToast('Min 8 characters', 'error'); return; }
    try {
      const newKey = await changePassword(_state.cryptoKey!, nw);
      await cacheSessionKey(newKey); setState({ cryptoKey: newKey }); showToast('Password changed', 'success');
    } catch { showToast('Failed', 'error'); }
  });

  document.getElementById('reset-app-btn')?.addEventListener('click', () => showConfirm('Delete ALL data and reset?', async () => {
    // Wipe cloud API keys from memory and IDB before clearing other state.
    await _aiSecretsWipe().catch(() => {});
    localStorage.clear(); sessionStorage.clear();
    await clearSessionKey().catch(() => {});
    await _idbClearStore('documents').catch(() => {});
    await _idbClearStore('conversations').catch(() => {});
    try {
      const db = await _vaultDbOpen();
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(VAULT_META_STORE, 'readwrite');
        tx.objectStore(VAULT_META_STORE).clear();
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch { /* best effort */ }
    await getAdapter()?.clear().catch(() => {});
    location.reload();
  }));

  document.getElementById('export-encrypted')?.addEventListener('click', async () => {
    const pw = (document.getElementById('backup-pw') as HTMLInputElement | null)?.value;
    if (!pw) { showToast('Enter backup password', 'error'); return; }
    if (!(await requireReauth())) return;
    try { const b = await exportEncryptedBackup(_state.cryptoKey!, pw); downloadText(`taskapp-backup-${new Date().toISOString().split('T')[0]}.taskappbak`, b); showToast('Backup exported', 'success'); } catch { showToast('Export failed', 'error'); }
  });
  document.getElementById('export-json')?.addEventListener('click', async () => {
    if (!(await requireReauth())) return;
    try { const j = await exportJSON(_state.cryptoKey!); downloadText('taskapp-data.json', j, 'application/json'); showToast('JSON exported', 'success'); } catch { showToast('Export failed', 'error'); }
  });
  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const file = ((e.target as HTMLInputElement).files || [])[0]; if (!file) return;
    const pw = (document.getElementById('import-pw') as HTMLInputElement | null)?.value;
    const text = await readFileAsText(file);
    try {
      if (file.name.endsWith('.taskappbak')) {
        if (!pw) { showToast('Enter backup password', 'error'); return; }
        const result = await importEncryptedBackup(text, pw, _state.cryptoKey!);
        reloadData(); showToast('Imported successfully', 'success');
        if ((result as { legacyKdfUsed?: boolean })?.legacyKdfUsed) {
          setTimeout(() => showToast('⚠️ Backup used older encryption (310k iterations). Export a fresh backup to upgrade it.', 'info', 8000), 1500);
        }
      } else { await importJSON(text, _state.cryptoKey!); reloadData(); showToast('Imported successfully', 'success'); }
    } catch { showToast('Import failed — wrong password?', 'error'); }
  });

  let _tc = 'Slate';
  document.querySelectorAll<HTMLElement>('.tag-color-btn').forEach(btn => {
    btn.addEventListener('click', () => { _tc = (btn.dataset as DOMStringMap & { color: string }).color; document.querySelectorAll<HTMLElement>('.tag-color-btn').forEach(b => b.style.outline = ''); btn.style.outline = `2px solid ${TAG_COLORS.find(c => c.label === _tc)?.text || '#000'}`; });
  });
  document.getElementById('create-tag-btn')?.addEventListener('click', async () => {
    const name = (document.getElementById('tag-name') as HTMLInputElement | null)?.value?.trim();
    if (!name) { showToast('Enter a tag name', 'error'); return; }
    await dbCreate('tags', { name, color: _tc }); reloadData(); showToast('Tag created', 'success'); _appRenderWorkspace('settings');
  });
  document.querySelectorAll<HTMLElement>('[data-del-tag]').forEach(btn => btn.addEventListener('click', () => showConfirm('Delete tag?', async () => { await softDelete('tags', (btn.dataset as DOMStringMap & { delTag: string }).delTag); reloadData(); _appRenderWorkspace('settings'); })));

  // Storage bindings
  document.getElementById('fs-create-new')?.addEventListener('click', async () => {
    const handle = await _fsPickFile(true);
    if (handle) { await _fsWriteVault(); showToast('Vault file created and linked', 'success'); _appRenderWorkspace('settings'); }
    else { showToast('No file selected', 'error'); }
  });
  document.getElementById('fs-link-existing')?.addEventListener('click', async () => {
    const handle = await _fsPickFile(false);
    if (handle) { await _fsWriteVault(); showToast('Vault file linked', 'success'); _appRenderWorkspace('settings'); }
    else { showToast('No file selected', 'error'); }
  });
  document.getElementById('fs-save-now')?.addEventListener('click', async () => {
    await _fsWriteVault(); showToast('Saved to vault file', 'success'); _appRenderWorkspace('settings');
  });
  document.getElementById('fs-unlink')?.addEventListener('click', () => showConfirm(
    'Unlink vault file? Your data stays in IndexedDB.',
    async () => { await _fsUnlink(); showToast('Vault file unlinked', 'success'); _appRenderWorkspace('settings'); }
  ));

  // Recycle Bin bindings
  document.getElementById('recyclebin-empty')?.addEventListener('click', () =>
    showConfirm('Permanently delete everything in the Recycle Bin? This cannot be undone.', async () => {
      for (const i of dbGetAll('trash') as AnyRecord[]) await permanentDelete(String(i.id));
      reloadData(); showToast('Recycle Bin emptied', 'success'); _appRenderWorkspace('settings');
    })
  );
  document.querySelectorAll<HTMLElement>('[data-rb-restore]').forEach(btn =>
    btn.addEventListener('click', async () => {
      await restoreFromTrash((btn.dataset as DOMStringMap & { rbRestore: string }).rbRestore);
      reloadData(); showToast('Restored', 'success'); _appRenderWorkspace('settings');
    })
  );
  document.querySelectorAll<HTMLElement>('[data-rb-perma]').forEach(btn =>
    btn.addEventListener('click', () =>
      showConfirm('Permanently delete this item?', async () => {
        await permanentDelete((btn.dataset as DOMStringMap & { rbPerma: string }).rbPerma);
        reloadData(); showToast('Deleted', 'success'); _appRenderWorkspace('settings');
      })
    )
  );

  // AI settings bindings
  document.getElementById('ai-open-wizard')?.addEventListener('click', () => { _openAIWizard((_aiPrefs.tier as string) ? 2 : 1); });
  // Nano-only (OT mode) bindings
  document.getElementById('ai-enable-nano')?.addEventListener('click', () => _openAIWizard(1));
  document.getElementById('ai-disable-nano')?.addEventListener('click', async () => {
    _aiPrefs.hasCompletedOnboarding = false; _aiPrefs.tier = null; _saveAIPrefs(_aiPrefs);
    await _resetAIConnection(); showToast('AI disabled', 'success'); _appRenderWorkspace('settings');
  });
  if (isOTOnlyMode()) {
    document.getElementById('ai-reconnect')?.addEventListener('click', () => _startAILoad());
  } else {
    document.getElementById('ai-reconnect')?.addEventListener('click', async () => {
      const url = (document.getElementById('ai-ollama-url') as HTMLInputElement | null)?.value?.trim();
      if (url) (_aiPrefs.ollama as AnyRecord).url = url;
      if ((_aiPrefs.tier as string) === 'ollama') {
        try { assertLocalAIEndpointAllowed(String((_aiPrefs.ollama as AnyRecord).url || '')); }
        catch (e) { showToast((e as Error).message, 'error', 6000); return; }
      }
      _saveAIPrefs(_aiPrefs); await _resetAIConnection(); _appRenderWorkspace('settings'); _startAILoad();
    });
  }
  document.querySelectorAll<HTMLInputElement>('input[name="ai-browser-model"]').forEach(el => el.addEventListener('change', async () => {
    (_aiPrefs.browser as AnyRecord).modelId = el.value; _saveAIPrefs(_aiPrefs); await _resetAIConnection(); _startAILoad();
    showToast(`Switched to ${BROWSER_MODELS.find(m => m.id === el.value)?.label || el.value}`, 'success');
  }));
  document.getElementById('ai-clear-cache')?.addEventListener('click', async () => {
    try {
      if (window.caches) { const keys = await caches.keys(); for (const k of keys) if (/transformers|huggingface/i.test(k)) await caches.delete(k); }
      (_aiPrefs.browser as AnyRecord).weightsCached = { 'gemma-e2b': false, 'gemma-e4b': false };
      _saveAIPrefs(_aiPrefs); showToast('Cached weights cleared (reload page to free memory)', 'success');
    } catch (e) { showToast('Clear failed: ' + ((e as Error)?.message || ''), 'error'); }
    _appRenderWorkspace('settings');
  });
  document.getElementById('ai-ollama-probe')?.addEventListener('click', async () => {
    const url = (document.getElementById('ai-ollama-url') as HTMLInputElement | null)?.value?.trim();
    if (url) { (_aiPrefs.ollama as AnyRecord).url = url; _saveAIPrefs(_aiPrefs); }
    try { assertLocalAIEndpointAllowed(String((_aiPrefs.ollama as AnyRecord)?.url || '')); }
    catch (e) { showToast((e as Error).message, 'error', 6000); return; }
    const r = await _probeOllama(String((_aiPrefs.ollama as AnyRecord)?.url || ''));
    const msg = r.state === 'ok' ? `Reachable (Ollama ${r.version || ''}, ${r.models?.length || 0} models)` : r.state === 'cors' ? 'CORS-blocked — set OLLAMA_ORIGINS and restart Ollama' : r.state === 'down' ? 'Not running' : 'Bad URL';
    showToast(msg, r.state === 'ok' ? 'success' : 'error', 5000);
  });
  document.getElementById('ai-ollama-browse')?.addEventListener('click', () => { _openAIWizard(3); _aiWizard.tier = 'ollama'; _fullRender(getState()); });
  document.getElementById('ai-cloud-model')?.addEventListener('change', (e) => {
    if ((_aiPrefs.cloud as AnyRecord)?.provider) {
      ((_aiPrefs.cloud as AnyRecord).modelByProvider as Record<string,string>)[(_aiPrefs.cloud as AnyRecord).provider as string] = (e.target as HTMLSelectElement).value;
      _saveAIPrefs(_aiPrefs); showToast('Model updated', 'success');
    }
  });
  document.getElementById('ai-cloud-replace-key')?.addEventListener('click', () => { _openAIWizard(3); _aiWizard.tier = 'cloud'; _aiWizard.draft = { cloudProvider: (_aiPrefs.cloud as AnyRecord)?.provider }; _fullRender(getState()); });
  document.getElementById('ai-cloud-remove-key')?.addEventListener('click', () => showConfirm('Remove API key for this provider?', async () => {
    const secrets = await _aiSecretsLoad(); delete secrets[String((_aiPrefs.cloud as AnyRecord)?.provider || '')];
    await _aiSecretsSave(secrets); showToast('Key removed', 'success'); _appRenderWorkspace('settings');
  }));
  document.getElementById('ai-cloud-test')?.addEventListener('click', async () => {
    const prov = String((_aiPrefs.cloud as AnyRecord)?.provider || ''); const k = _getAISecrets()[prov];
    if (!k) { showToast('No key set', 'error'); return; }
    showToast('Testing…', 'info');
    const r = await _testCloudKey(prov, String(k)); showToast(r.ok ? 'Key valid' : ('Failed: ' + (r.error || 'unknown')), r.ok ? 'success' : 'error', 5000);
  });
  document.getElementById('ai-auto-apply')?.addEventListener('change', (e) => { _aiPrefs.autoApplyCreates = !!(e.target as HTMLInputElement).checked; _saveAIPrefs(_aiPrefs); });
  document.getElementById('ai-clear-history')?.addEventListener('click', () => { _aiHistory.length = 0; _pendingAction = null; showToast('Chat history cleared', 'success'); });
  document.getElementById('ai-forget-keys')?.addEventListener('click', () => showConfirm('Forget all stored API keys? Cloud AI will stop working until you add them again.', async () => {
    await _aiSecretsWipe(); showToast('All API keys forgotten', 'success'); _appRenderWorkspace('settings');
  }));
  document.getElementById('ai-reset-setup')?.addEventListener('click', () => showConfirm('Reset AI setup? You will be walked through the wizard again. Chat history is preserved.', async () => {
    _aiPrefs.hasCompletedOnboarding = false; _aiPrefs.tier = null; _saveAIPrefs(_aiPrefs); await _resetAIConnection(); showToast('AI setup reset', 'success'); _appRenderWorkspace('settings');
  }));

  // ── Security section bindings ─────────────────────────────────────────────────
  if (_settingsSection === 'security') {
    // Lazy-load async security state — in-flight flags prevent duplicate concurrent loads
    // that would cause re-render cascades and freeze the tab.
    const _allLoaded = () => !!_secMFAStatus && !!_secPasskeys && !!_secAuditEntries;
    const _maybeRender = () => { if (_allLoaded()) _appRenderWorkspace('settings'); };
    if (!_secMFAStatus && !_secMFALoading) {
      _secMFALoading = true;
      _loadMFAStatus().then(status => {
        _secMFAStatus = status; _secMFALoading = false; _maybeRender();
      }).catch(() => { _secMFALoading = false; });
    }
    if (!_secPasskeys && !_secPasskeysLoading) {
      _secPasskeysLoading = true;
      _loadPasskeys().then(keys => {
        _secPasskeys = keys; _secPasskeysLoading = false; _maybeRender();
      }).catch(() => { _secPasskeysLoading = false; });
    }
    if (!_secAuditEntries && !_secAuditLoading) {
      _secAuditLoading = true;
      _loadAuditLog().then(entries => {
        _secAuditEntries = entries; _secAuditLoading = false; _maybeRender();
      }).catch(() => { _secAuditLoading = false; });
    }

    // Session lock controls
    document.getElementById('lock-now-btn')?.addEventListener('click', () => _lockApp());
    document.getElementById('lock-timeout-select')?.addEventListener('change', (e) => {
      const mins = parseInt((e.target as HTMLSelectElement).value, 10);
      _setLockTimeout(mins);
      showToast(mins > 0 ? `Auto-lock set to ${mins} minutes` : 'Auto-lock disabled', 'success');
    });

    // TOTP bindings
    document.getElementById('totp-enable-btn')?.addEventListener('click', async () => {
      _totpSetupSecret = await _generateNewTOTPSecret();
      _totpSetupStep = 'setup';
      _appRenderWorkspace('settings');
      // Start countdown timer
      const startTimer = () => {
        const timerEl = document.getElementById('totp-setup-timer');
        if (timerEl) timerEl.textContent = `Code refreshes in ${totpSecondsRemaining()}s`;
      };
      if (_totpSetupTimerInterval) clearInterval(_totpSetupTimerInterval);
      _totpSetupTimerInterval = setInterval(startTimer, 1000);
    });

    document.getElementById('totp-disable-btn')?.addEventListener('click', () =>
      showConfirm('Remove TOTP? You will no longer need a code to unlock.', async () => {
        await _disableTOTP();
        _secMFAStatus = null;
        showToast('TOTP removed', 'success');
        _appRenderWorkspace('settings');
      })
    );

    document.getElementById('totp-setup-cancel')?.addEventListener('click', () => {
      _totpSetupStep = 'idle';
      _totpSetupSecret = '';
      if (_totpSetupTimerInterval) { clearInterval(_totpSetupTimerInterval); _totpSetupTimerInterval = null; }
      _appRenderWorkspace('settings');
    });

    document.getElementById('totp-copy-secret')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(_totpSetupSecret);
        showToast('Secret copied to clipboard', 'success');
      } catch { showToast('Copy failed — select the text manually', 'error'); }
    });

    document.getElementById('totp-setup-verify')?.addEventListener('click', async () => {
      const code = (document.getElementById('totp-setup-code') as HTMLInputElement | null)?.value?.trim() || '';
      const errEl = document.getElementById('totp-setup-error');
      if (!code) { if (errEl) { errEl.textContent = 'Enter the 6-digit code'; errEl.style.display = 'block'; } return; }
      const { verifyTOTPCode: verifyCb } = await import('../totp.js');
      const ok = await verifyCb(_totpSetupSecret, code);
      if (!ok) {
        if (errEl) { errEl.textContent = 'Invalid code — check your authenticator app and try again'; errEl.style.display = 'block'; }
        return;
      }
      await _enableTOTP(_totpSetupSecret);
      _secMFAStatus = null;
      _totpSetupStep = 'idle';
      _totpSetupSecret = '';
      if (_totpSetupTimerInterval) { clearInterval(_totpSetupTimerInterval); _totpSetupTimerInterval = null; }
      showToast('TOTP enabled — keep your secret backed up!', 'success');
      _appRenderWorkspace('settings');
    });

    // Passkey bindings
    document.getElementById('add-passkey-btn')?.addEventListener('click', async () => {
      const pw = prompt('Enter your vault master password to register a passkey:');
      if (!pw) return;
      try {
        await _addPasskey(pw);
        _secPasskeys = null;
        showToast('Passkey registered', 'success');
        _appRenderWorkspace('settings');
      } catch (e) { showToast((e as Error).message, 'error', 6000); }
    });

    document.querySelectorAll<HTMLElement>('[data-remove-passkey]').forEach(btn =>
      btn.addEventListener('click', () => showConfirm('Remove this passkey?', async () => {
        const id = (btn.dataset as DOMStringMap & { removePasskey: string }).removePasskey;
        await _removePasskey(id);
        _secPasskeys = null;
        showToast('Passkey removed', 'success');
        _appRenderWorkspace('settings');
      }))
    );

    // Audit log bindings
    document.getElementById('audit-filter-select')?.addEventListener('change', (e) => {
      _secAuditFilter = (e.target as HTMLSelectElement).value;
      _secAuditPage = 0;
      _appRenderWorkspace('settings');
    });
    document.getElementById('audit-prev')?.addEventListener('click', () => {
      if (_secAuditPage > 0) { _secAuditPage--; _appRenderWorkspace('settings'); }
    });
    document.getElementById('audit-next')?.addEventListener('click', () => {
      _secAuditPage++;
      _appRenderWorkspace('settings');
    });
    document.getElementById('audit-export-csv')?.addEventListener('click', async () => {
      try {
        const csv = await _exportAuditCSV();
        downloadText(`audit-log-${new Date().toISOString().split('T')[0]}.csv`, csv, 'text/csv');
        showToast('Audit log exported as CSV', 'success');
      } catch { showToast('Export failed', 'error'); }
    });
    document.getElementById('audit-export-json')?.addEventListener('click', async () => {
      try {
        const json = await _exportAuditJSON();
        downloadText(`audit-log-${new Date().toISOString().split('T')[0]}.jsonl`, json, 'application/jsonlines');
        showToast('Audit log exported as JSON Lines', 'success');
      } catch { showToast('Export failed', 'error'); }
    });
    document.getElementById('audit-purge-days')?.addEventListener('change', (e) => {
      const days = (e.target as HTMLSelectElement).value;
      localStorage.setItem('taskapp_audit_purge_days', days);
      showToast('Auto-purge setting saved', 'success');
    });
    document.getElementById('audit-purge-all')?.addEventListener('click', () =>
      showConfirm('Purge all audit log entries? This cannot be undone.', async () => {
        await _purgeAuditLog(null);
        _secAuditEntries = null;
        showToast('Audit log purged', 'success');
        _appRenderWorkspace('settings');
      })
    );
  } else {
    // Reset security state when leaving the section
    if (_secMFAStatus || _secPasskeys || _secAuditEntries) {
      // Keep state cached — only reset when explicitly changing sections
    }
  }
}
