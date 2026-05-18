// ── SETTINGS ──────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 4445–4652.

import { escH, readFileAsText, downloadText, plural, formatRelative, initials, avatarColor } from '../utils.js';
import { Icons } from '../icons.js';
import { dbCreate, softDelete, dbGetAll, permanentDelete, restoreFromTrash, getAdapter } from '../db.js';
import {
  getState, setState, showToast, showConfirm, reloadData, setTheme,
} from '../state.js';
import type { AppState } from '../state.js';
import { changePassword, exportEncryptedBackup, importEncryptedBackup, exportJSON, importJSON } from '../vault.js';
import { cacheSessionKey, clearSessionKey } from '../session.js';
import { _idbClearStore } from '../idb-data.js';
import { _vaultDbOpen } from '../vault.js';
import { VAULT_META_STORE, TAG_COLORS } from '../constants.js';
import { assertLocalAIEndpointAllowed, deploymentPolicy, isAITierAllowed, isOTOnlyMode } from '../deployment-policy.js';

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

let _settingsSection = 'general';
export function setSettingsSection(s: string): void { _settingsSection = s; }

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
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">Security</h2><div class="card" style="padding:1.25rem;margin-bottom:1rem"><div style="font-weight:600;margin-bottom:.75rem">Change Password</div><div style="display:flex;flex-direction:column;gap:.75rem"><div class="form-group"><label class="form-label">Current Password</label><input class="input" type="password" id="pw-current"></div><div class="form-group"><label class="form-label">New Password</label><input class="input" type="password" id="pw-new"></div><div class="form-group"><label class="form-label">Confirm New</label><input class="input" type="password" id="pw-confirm"></div><button class="btn btn-primary" id="change-pw-btn">Change Password</button></div></div><div class="card" style="padding:1.25rem;border-color:#fecaca"><div style="font-weight:600;margin-bottom:.5rem;color:#dc2626">Danger Zone</div><p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:.75rem">Permanently erase all data and reset the app.</p><button class="btn btn-danger" id="reset-app-btn">Reset App</button></div>`;
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
    body = `<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1.25rem">About</h2><div class="card" style="padding:1.5rem;text-align:center"><div style="font-size:2rem;font-weight:700;letter-spacing:-.04em;margin-bottom:.25rem">taskapp <span style="color:var(--accent)">CRM</span></div><div style="color:var(--text-tertiary);font-size:.875rem;margin-bottom:1rem">v2.0 · Offline · Encrypted</div><div style="font-size:.8rem;color:var(--text-secondary);line-height:1.8"><div>Vanilla JS · No dependencies</div>${isOTOnlyMode() ? '<div>AI: Gemini Nano (Chrome Built-in AI)</div>' : '<div>AI: Gemma 4 E4B via Transformers.js</div>'}<div>Encryption: AES-256-GCM (Web Crypto)</div></div></div>`;
  }
  return `<div style="display:flex;flex-direction:column;height:100%"><div class="workspace-toolbar"><span style="font-weight:600">Settings</span></div><div style="flex:1;display:flex;overflow:hidden"><div style="padding:1rem .75rem;border-right:1px solid var(--border-subtle);background:var(--bg-base);flex-shrink:0"><div class="settings-nav">${nav}</div></div><div style="flex:1;overflow-y:auto;padding:1.5rem;max-width:640px">${body}</div></div></div>`;
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
    try { const b = await exportEncryptedBackup(_state.cryptoKey!, pw); downloadText(`taskapp-backup-${new Date().toISOString().split('T')[0]}.taskappbak`, b); showToast('Backup exported', 'success'); } catch { showToast('Export failed', 'error'); }
  });
  document.getElementById('export-json')?.addEventListener('click', async () => {
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
}
