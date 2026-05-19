// ── AI SETTINGS — wizard, encrypted secrets, catalogs, cost tracking ──────────
// Owns the first-run wizard, Settings → AI re-entry, encrypted key store,
// cloud/browser/Ollama model catalogs, and monthly usage tracking.
// No circular dependency with ai-ui.ts — all rendering hooks are injected.

import { escH } from '../utils.js';
import { Icons } from '../icons.js';
import { nowISO } from '../db.js';
import { getState, setState, navigate, showToast } from '../state.js';
import type { AppState } from '../state.js';
import {
  allowedAITiers,
  assertLocalAIEndpointAllowed,
  deploymentPolicy,
  isAITierAllowed,
  isOTOnlyMode,
} from '../deployment-policy.js';
import { aiPrefs, saveAIPrefs, syncAIPrefsLegacy } from './ai-prefs.js';
import type { AIPrefs } from './ai-prefs.js';
import {
  aiRuntime,
  startAILoad, disconnectAI,
  setRuntimeSecretsGetter, setRuntimeUsageTracker, setRuntimeCloudLabelGetters,
} from './ai-runtime.js';
import { probeOllama, pullOllamaModel, deleteOllamaModel } from './providers/ollama.js';
import { testAnthropicKey } from './providers/anthropic.js';
import { testOpenAIKey    } from './providers/openai.js';
import { testGoogleKey    } from './providers/google.js';

type AnyRecord = Record<string, unknown>;

// ── Model catalogs ─────────────────────────────────────────────────────────────
export const BROWSER_MODELS = __OT_ONLY_BUILD__ ? [
  { id: 'nano', label: 'Gemini Nano', size: '~4 GB (Chrome-managed)', desc: 'Chrome Built-in AI. Requires Chrome 127+ with the Prompt API flag enabled.', hf: '' },
] : [
  { id: 'nano',      label: 'Gemini Nano', size: '~4 GB (Chrome-managed)', desc: 'Chrome Built-in AI. Requires Chrome 127+ with prompt-api flag.', hf: '' },
  { id: 'gemma-e2b', label: 'Gemma 4 E2B', size: '~500 MB download',       desc: 'Default in-browser model. Good quality, runs on most WebGPU laptops.', hf: 'onnx-community/gemma-4-E2B-it-ONNX' },
  { id: 'gemma-e4b', label: 'Gemma 4 E4B', size: '~1.5 GB download',       desc: 'Higher quality. Needs ~4 GB VRAM.', hf: 'onnx-community/gemma-4-E4B-it-ONNX' },
];

export const OLLAMA_CATALOG = [
  { id: 'oll-qwen25-3b',       tag: 'qwen2.5:3b',          size: '1.9 GB', ram: '8 GB',  why: 'Default. Strong tool-calling, fast.' },
  { id: 'oll-llama32-3b',      tag: 'llama3.2:3b',         size: '2.0 GB', ram: '8 GB',  why: 'Familiar Meta model, solid general chat.' },
  { id: 'oll-gemma3-1b',       tag: 'gemma3:1b',           size: '815 MB', ram: '4 GB',  why: 'For low-end hardware or quick trials.' },
  { id: 'oll-llama32-1b',      tag: 'llama3.2:1b',         size: '1.3 GB', ram: '4 GB',  why: 'Snappiest option, weaker reasoning.' },
  { id: 'oll-gemma3-4b',       tag: 'gemma3:4b-it-q4_K_M', size: '3.3 GB', ram: '8 GB',  why: 'Best small Google model.' },
  { id: 'oll-qwen25-7b',       tag: 'qwen2.5:7b',          size: '4.7 GB', ram: '16 GB', why: 'Step-up reasoning, multilingual.' },
  { id: 'oll-llama31-8b',      tag: 'llama3.1:8b',         size: '4.7 GB', ram: '16 GB', why: 'Strong all-rounder.' },
  { id: 'oll-qwen25-coder-7b', tag: 'qwen2.5-coder:7b',    size: '4.7 GB', ram: '16 GB', why: 'Code-heavy work.' },
  { id: 'oll-deepseek-r1-7b',  tag: 'deepseek-r1:7b',      size: '4.7 GB', ram: '16 GB', why: 'Best small local reasoner.' },
  { id: 'oll-mistral-7b',      tag: 'mistral:7b',          size: '4.1 GB', ram: '16 GB', why: 'Balanced general-purpose.' },
];

export const CLOUD_PROVIDERS: Record<string, {
  label: string;
  keyPattern: RegExp;
  keyHelpUrl: string;
  models: Array<{ id: string; label: string; priceIn: number; priceOut: number; note: string }>;
}> = __OT_ONLY_BUILD__ ? {} : {
  anthropic: {
    label: 'Anthropic (Claude)',
    keyPattern: /^sk-ant-/,
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1',   priceIn: 15.00, priceOut: 75.00, note: 'Flagship reasoning and coding.' },
      { id: 'claude-sonnet-4-20250514',  label: 'Claude Sonnet 4',   priceIn:  3.00, priceOut: 15.00, note: 'Production workhorse.' },
      { id: 'claude-3-5-haiku-latest',   label: 'Claude Haiku 3.5',  priceIn:  0.80, priceOut:  4.00, note: 'Fast & cheap.' },
    ],
  },
  openai: {
    label: 'OpenAI (GPT)',
    keyPattern: /^sk-/,
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.2',  label: 'GPT-5.2',  priceIn: 1.75, priceOut: 14.00, note: 'Current flagship.' },
      { id: 'gpt-5',    label: 'GPT-5',    priceIn: 1.25, priceOut: 10.00, note: 'General reasoning.' },
      { id: 'gpt-5-mini', label: 'GPT-5 Mini', priceIn: 0.25, priceOut: 2.00, note: 'Cost-effective production default.' },
    ],
  },
  google: {
    label: 'Google (Gemini)',
    keyPattern: /^AIza/,
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-3-pro-preview',   label: 'Gemini 3 Pro Preview',   priceIn: 2.00, priceOut: 12.00, note: 'Preview flagship reasoning.' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', priceIn: 0.50, priceOut:  3.00, note: 'Current Flash default.' },
    ],
  },
};

// Wire cloud label getters into ai-runtime so modelChipLabel/backendSubtitle work
setRuntimeCloudLabelGetters(
  (prov) => {
    const m = CLOUD_PROVIDERS[prov]?.models.find(x => x.id === aiPrefs.cloud.modelByProvider[prov]);
    return m?.label || '';
  },
  (prov) => CLOUD_PROVIDERS[prov]?.label || 'Cloud',
);

// ── Unified testCloudKey ───────────────────────────────────────────────────────
export async function testCloudKey(provider: string, key: string): Promise<{ ok: boolean; error?: string }> {
  const modelId = CLOUD_PROVIDERS[provider]?.models.slice(-1)[0]?.id;
  if (!modelId) return { ok: false, error: 'no model' };
  if (provider === 'anthropic') return testAnthropicKey(key, modelId);
  if (provider === 'openai')    return testOpenAIKey(key, modelId);
  if (provider === 'google')    return testGoogleKey(key, modelId);
  return { ok: false, error: 'unknown provider' };
}

// Re-export probe/pull for convenience (settings.ts + wizard use these)
export { probeOllama, pullOllamaModel, deleteOllamaModel };

// ── Encrypted secrets store ────────────────────────────────────────────────────
const AI_SECRETS_IDB_KEY = '__ai_secrets__';

let _idbLoadStore:    (store: string) => Promise<AnyRecord[]>                     = async () => [];
let _idbPutRecord:    (store: string, rec: AnyRecord) => Promise<void>            = async () => {};
let _idbDeleteRecord: (store: string, id: string) => Promise<void>                = async () => {};
let _dbKeyGetter:     () => unknown                                               = () => null;

export function setAIV2IDBHooks(hooks: {
  idbLoadStore:    (store: string) => Promise<AnyRecord[]>;
  idbPutRecord:    (store: string, rec: AnyRecord) => Promise<void>;
  idbDeleteRecord: (store: string, id: string) => Promise<void>;
  dbKeyGetter:     () => unknown;
}): void {
  _idbLoadStore    = hooks.idbLoadStore;
  _idbPutRecord    = hooks.idbPutRecord;
  _idbDeleteRecord = hooks.idbDeleteRecord;
  _dbKeyGetter     = hooks.dbKeyGetter;
}

export async function aiSecretsLoad(): Promise<Record<string, string>> {
  try {
    const all = await _idbLoadStore('documents');
    const rec = all.find(r => r && r['id'] === AI_SECRETS_IDB_KEY);
    return ((rec?.['secrets'] as Record<string, string>) || {});
  } catch { return {}; }
}

export async function aiSecretsSave(obj: Record<string, string>): Promise<void> {
  if (!_dbKeyGetter()) throw new Error('Vault is locked');
  await _idbPutRecord('documents', { id: AI_SECRETS_IDB_KEY, secrets: obj || {}, updatedAt: nowISO() });
  _aiSecrets = { ...(obj || {}) };
}

export async function aiSecretsWipe(): Promise<void> {
  try { await _idbDeleteRecord('documents', AI_SECRETS_IDB_KEY); } catch { /* already gone */ }
  _aiSecrets = {};
}

export let _aiSecrets: Record<string, string> = {};

export async function aiSecretsRefresh(): Promise<Record<string, string>> {
  _aiSecrets = await aiSecretsLoad();
  return _aiSecrets;
}

// Wire secrets getter into ai-runtime so cloud calls can read keys
setRuntimeSecretsGetter(() => _aiSecrets);

// ── Cost tracking ──────────────────────────────────────────────────────────────
export function aiCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function aiTrackUsage(provider: string, modelId: string, tokensIn: number, tokensOut: number): void {
  const m = aiCurrentMonthKey();
  if (aiPrefs.cloud.usage.monthKey !== m) {
    aiPrefs.cloud.usage = { tokensIn: 0, tokensOut: 0, estCostUsd: 0, monthKey: m };
  }
  const provDef  = CLOUD_PROVIDERS[provider];
  const modelDef = provDef?.models.find(x => x.id === modelId);
  if (modelDef) {
    aiPrefs.cloud.usage.estCostUsd +=
      (tokensIn  || 0) * modelDef.priceIn  / 1e6 +
      (tokensOut || 0) * modelDef.priceOut / 1e6;
  }
  aiPrefs.cloud.usage.tokensIn  += (tokensIn  || 0);
  aiPrefs.cloud.usage.tokensOut += (tokensOut || 0);
  saveAIPrefs(aiPrefs);
}

setRuntimeUsageTracker(aiTrackUsage);

// ── Guard ──────────────────────────────────────────────────────────────────────
export function aiNeedsOnboarding(): boolean {
  return !aiPrefs.hasCompletedOnboarding || !isAITierAllowed(aiPrefs.tier);
}

// ── Hook injection ─────────────────────────────────────────────────────────────
let _fullRender: (state: AppState) => void = () => {};
export function setAISettingsHooks(hooks: { fullRender: (state: AppState) => void }): void {
  _fullRender = hooks.fullRender;
}

// ── Wizard state ───────────────────────────────────────────────────────────────
export interface WizardState {
  open:          boolean;
  step:          number;
  tier:          string | null;
  draft: {
    tier:                  string | null;
    browserModelId:        string;
    ollamaUrl:             string;
    ollamaModelId:         string;
    cloudProvider:         string | null;
    cloudModelByProvider:  Record<string, string>;
    autoApplyCreates:      boolean;
  };
  testResult:     AnyRecord | null;
  pullProgress:   AnyRecord | null;
  cloudKeyInputs: Record<string, string>;
}

export let _aiWizard: WizardState | null = null;

export function openAIWizard(step = 1): void {
  if (__OT_ONLY_BUILD__) {
    openNanoDownloadModal().catch(e => console.warn('[AI] nano modal:', e));
    return;
  }
  const tiers = allowedAITiers();
  const initialTier = isAITierAllowed(aiPrefs.tier) ? aiPrefs.tier : (tiers[0] || null);
  _aiWizard = {
    open: true, step,
    tier: initialTier,
    draft: JSON.parse(JSON.stringify({
      tier:                 initialTier,
      browserModelId:       aiPrefs.browser.modelId,
      ollamaUrl:            aiPrefs.ollama.url,
      ollamaModelId:        aiPrefs.ollama.modelId,
      cloudProvider:        aiPrefs.cloud.provider,
      cloudModelByProvider: { ...aiPrefs.cloud.modelByProvider },
      autoApplyCreates:     aiPrefs.autoApplyCreates,
    })),
    testResult:     null,
    pullProgress:   null,
    cloudKeyInputs: {},
  };
  _fullRender(getState() as AppState);
}

export function closeAIWizard(): void {
  if (__OT_ONLY_BUILD__) { closeNanoDownloadModal(); return; }
  _aiWizard = null;
  _fullRender(getState() as AppState);
}

// ── Nano download modal (OT/offline profile only) ─────────────────────────────
interface NanoModalState {
  open:    boolean;
  phase:   'disclaimer' | 'downloading' | 'error';
  elapsed: number;
  error:   string | null;
}

export let _nanoModal: NanoModalState | null = null;
let _nanoModalTimer:   ReturnType<typeof setInterval> | null = null;
let _nanoModalPending  = false; // synchronous guard against double-trigger during async availability check

export function isNanoModalOpen(): boolean { return _nanoModal !== null || _nanoModalPending; }

function _getNanoAPI(): Record<string, unknown> | undefined {
  const w = window as unknown as Record<string, unknown>;
  return (w['LanguageModel'] ?? (w['ai'] as Record<string, unknown> | undefined)?.['languageModel']) as Record<string, unknown> | undefined;
}

function _setNanoPrefs(): void {
  aiPrefs.tier = 'browser';
  aiPrefs.browser.modelId = 'nano';
  aiPrefs.hasCompletedOnboarding = true;
  syncAIPrefsLegacy(aiPrefs);
  saveAIPrefs(aiPrefs);
}

function _startNanoDownload(): void {
  if (_nanoModalTimer) clearInterval(_nanoModalTimer);
  startAILoad().catch(() => {});
  let _loadObserved = false;
  _nanoModalTimer = setInterval(() => {
    if (!_nanoModal) { clearInterval(_nanoModalTimer!); _nanoModalTimer = null; return; }
    if (aiRuntime.loadStarted) _loadObserved = true;

    if (aiRuntime.ready) {
      clearInterval(_nanoModalTimer!); _nanoModalTimer = null;
      _nanoModal = null;
      navigate('ai');
      _fullRender(getState() as AppState);
      return;
    }

    if (_loadObserved && !aiRuntime.loadStarted) {
      clearInterval(_nanoModalTimer!); _nanoModalTimer = null;
      if (_nanoModal) {
        _nanoModal.phase = 'error';
        _nanoModal.error = 'Built-in AI failed to initialize. Ensure the Prompt API flag is enabled (chrome://flags/#prompt-api-for-gemini-nano in Chrome, or edge://flags in Edge) and try again.';
        _fullRender(getState() as AppState);
      }
      return;
    }

    // Partial DOM update — avoid a full re-render on every tick
    _nanoModal.elapsed += 2;
    const progress = aiRuntime.downloadProgress;
    const pct = progress && progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : null;

    const elapsedEl = document.getElementById('nano-modal-elapsed');
    if (elapsedEl) {
      const mins = Math.floor(_nanoModal.elapsed / 60);
      const secs = _nanoModal.elapsed % 60;
      elapsedEl.textContent = mins > 0 ? `${mins}m ${secs}s elapsed` : `${secs}s elapsed`;
    }
    const barEl = document.getElementById('nano-modal-progress-bar') as HTMLElement | null;
    const pctEl = document.getElementById('nano-modal-progress-pct');
    if (barEl) barEl.style.width = pct !== null ? `${pct}%` : '100%'; // 100% = indeterminate pulse
    if (pctEl) pctEl.textContent = pct !== null ? `${pct}%` : '';
  }, 2000);
}

export async function openNanoDownloadModal(): Promise<void> {
  if (_nanoModalPending || _nanoModal) return; // already open or opening
  _nanoModalPending = true;
  try {
    const api = _getNanoAPI();
    if (!api) {
      _nanoModal = { open: true, phase: 'error', elapsed: 0,
        error: 'Built-in AI (Prompt API) is not available in this browser. In Chrome, open chrome://flags/#prompt-api-for-gemini-nano and enable the flag, then relaunch. In Edge, open edge://flags and search for the Prompt API flag.' };
      _fullRender(getState() as AppState);
      return;
    }

    let avail: string;
    try {
      avail = await (api['availability'] as (o: unknown) => Promise<string>)({ expectedOutputs: [{ type: 'text', languages: ['en'] }] });
    } catch { avail = 'unavailable'; }

    if (avail === 'unavailable') {
      _nanoModal = { open: true, phase: 'error', elapsed: 0,
        error: 'Built-in AI is not available on this device. Ensure Chrome/Edge 127+ with hardware acceleration enabled and the Prompt API flag active.' };
      _fullRender(getState() as AppState);
      return;
    }

    if (avail === 'readily' || avail === 'available') {
      // Model already downloaded — set prefs, navigate to AI view, let the
      // workspace connecting spinner handle feedback. No modal needed.
      _setNanoPrefs();
      navigate('ai');
      startAILoad().catch(() => {});
      return;
    }

    // Model needs downloading ('downloadable' | 'downloading').
    // Show disclaimer only on first-ever acknowledgement; skip it after that.
    _setNanoPrefs();
    if (!aiPrefs.nanoDisclaimerAcknowledged) {
      _nanoModal = { open: true, phase: 'disclaimer', elapsed: 0, error: null };
    } else {
      _nanoModal = { open: true, phase: 'downloading', elapsed: 0, error: null };
      _startNanoDownload();
    }
    _fullRender(getState() as AppState);
  } finally {
    _nanoModalPending = false;
  }
}

export function closeNanoDownloadModal(): void {
  if (_nanoModalTimer) { clearInterval(_nanoModalTimer); _nanoModalTimer = null; }
  _nanoModal = null;
  _fullRender(getState() as AppState);
}

export function renderNanoDownloadModal(): string {
  if (!_nanoModal) return '';
  const m = _nanoModal;
  const disclaimer = `<p style="font-size:.875rem;color:var(--text-secondary);line-height:1.65;margin:0 0 .875rem">Your browser's built-in AI (Gemini Nano on Chrome, Phi-4-mini on Edge) requires a <strong>one-time local model download (~4 GB)</strong> managed entirely by the browser and stored on this device. All inference runs locally — no data is ever transmitted externally.</p>`;
  let body = '';
  let footer = '';

  if (m.phase === 'disclaimer') {
    body = `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .75rem">Built-in AI — First-time Setup</h3>${disclaimer}`;
    footer = `<button class="btn btn-secondary btn-sm" id="nano-modal-close">Not now</button><button class="btn btn-primary btn-sm" id="nano-modal-enable">Enable AI</button>`;
  } else if (m.phase === 'downloading') {
    body = `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .75rem">Downloading AI model…</h3>
      ${disclaimer}
      <div style="display:flex;align-items:center;gap:.875rem;padding:.75rem;background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
        <div class="spinner" style="width:28px;height:28px;border-width:3px;flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.875rem;font-weight:600">Browser is managing the download (~4 GB)</div>
          <div style="margin-top:.5rem;background:var(--border-subtle);border-radius:999px;height:6px;overflow:hidden">
            <div id="nano-modal-progress-bar" style="height:100%;background:var(--accent);border-radius:999px;width:0%;transition:width .6s ease"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--text-tertiary);margin-top:.25rem">
            <span id="nano-modal-elapsed">0s elapsed</span>
            <span id="nano-modal-progress-pct"></span>
          </div>
        </div>
      </div>
      <p style="font-size:.75rem;color:var(--text-tertiary);margin:.625rem 0 0;line-height:1.5">You may continue using Task App while the download runs.</p>`;
    footer = `<button class="btn btn-secondary btn-sm" id="nano-modal-close">Close (continues in background)</button>`;
  } else {
    body = `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .75rem">Built-in AI — Not Available</h3>
      <div class="card" style="padding:.875rem;border-color:#fecaca;background:#fef2f2;color:#991b1b;font-size:.8125rem;line-height:1.6">${escH(m.error || 'Unknown error')}</div>`;
    footer = `<button class="btn btn-secondary btn-sm" id="nano-modal-close">Close</button>`;
  }

  return `<div class="modal-backdrop" id="nano-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1.5rem">
    <div class="card" style="max-width:520px;width:100%;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-xl);overflow:hidden;box-shadow:var(--shadow-lg)">
      <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:.625rem;background:var(--bg-base)">
        ${Icons.AI(20)}<span style="font-weight:600">Task App AI</span>
      </div>
      <div style="padding:1.25rem 1.5rem">${body}</div>
      <div style="padding:.875rem 1.25rem;border-top:1px solid var(--border-subtle);display:flex;justify-content:flex-end;gap:.5rem;background:var(--bg-base)">${footer}</div>
    </div>
  </div>`;
}

export function bindNanoDownloadModal(): void {
  if (!_nanoModal) return;
  const m = _nanoModal;
  document.getElementById('nano-modal-close')?.addEventListener('click', closeNanoDownloadModal);
  document.getElementById('nano-modal-backdrop')?.addEventListener('click', e => {
    if ((e.target as HTMLElement).id === 'nano-modal-backdrop') closeNanoDownloadModal();
  });
  document.getElementById('nano-modal-enable')?.addEventListener('click', () => {
    // Mark disclaimer permanently acknowledged — won't show again even after disable/re-enable
    aiPrefs.nanoDisclaimerAcknowledged = true;
    saveAIPrefs(aiPrefs);
    m.phase = 'downloading';
    m.elapsed = 0;
    _fullRender(getState() as AppState);
    _startNanoDownload();
  });
}

// ── OS / CORS helpers ──────────────────────────────────────────────────────────
function _osHint(): string {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'win';
  if (ua.includes('linux')) return 'linux';
  return 'other';
}

function _corsBlock(os: string): { title: string; cmd: string; after: string } {
  const origin = location.protocol === 'file:' ? 'null' : location.origin;
  if (os === 'mac') return { title: 'macOS', cmd: `launchctl setenv OLLAMA_ORIGINS "${origin}"`, after: 'Then quit Ollama from the menu bar (Cmd+Q) and relaunch.' };
  if (os === 'win') return { title: 'Windows', cmd: `setx OLLAMA_ORIGINS "${origin}"`, after: 'Then right-click the Ollama tray icon → Quit, and relaunch Ollama.' };
  if (os === 'linux') return { title: 'Linux (systemd)', cmd: `sudo systemctl edit ollama.service\n# Add: Environment="OLLAMA_ORIGINS=${origin}"\nsudo systemctl daemon-reload && sudo systemctl restart ollama`, after: '' };
  return { title: 'Other', cmd: `OLLAMA_ORIGINS="${origin}" ollama serve`, after: 'Set the env var, then run ollama serve.' };
}

// ── Wizard renderer ───────────────────────────────────────────────────────────
export function renderAIWizard(): string {
  if (!_aiWizard) return '';
  const w = _aiWizard;
  let body = '';
  if (w.step === 1) body = renderWizardStep1();
  else if (w.step === 2) body = renderWizardStep2();
  else if (w.step === 3) {
    if (!isAITierAllowed(w.tier)) body = `<div class="card" style="padding:1rem;border-color:#fecaca;color:#991b1b">This AI tier is not allowed in the ${escH(deploymentPolicy.label)} build.</div>`;
    else if (w.tier === 'browser') body = renderWizardStep3Browser();
    else if (w.tier === 'ollama') body = renderWizardStep3Ollama();
    else if (w.tier === 'cloud')  body = renderWizardStep3Cloud();
  } else if (w.step === 4) body = renderWizardStep4();
  const back = w.step > 1 ? `<button class="btn btn-secondary btn-sm" id="aiw-back">← Back</button>` : `<span></span>`;
  return `<div class="modal-backdrop" id="aiw-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1.5rem">
    <div class="card" style="max-width:780px;width:100%;max-height:90vh;display:flex;flex-direction:column;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-xl);overflow:hidden;box-shadow:var(--shadow-lg)">
      <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;background:var(--bg-base)">
        <div style="display:flex;align-items:center;gap:.625rem">
          ${Icons.AI(20)}
          <div><div style="font-weight:600">Set up Task App AI</div><div style="font-size:.75rem;color:var(--text-tertiary)">Step ${w.step} of 4</div></div>
        </div>
        <button class="btn btn-ghost btn-icon btn-sm" id="aiw-close" title="Close">${Icons.Close(18)}</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:1.25rem 1.5rem">${body}</div>
      <div style="padding:.875rem 1.25rem;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;background:var(--bg-base);gap:.5rem">
        ${back}
        <div style="display:flex;gap:.5rem">${renderWizardActions()}</div>
      </div>
    </div>
  </div>`;
}

function renderWizardActions(): string {
  const w = _aiWizard!;
  if (w.step === 1) return `<button class="btn btn-secondary btn-sm" id="aiw-notnow">Not now</button><button class="btn btn-primary btn-sm" id="aiw-continue">Continue</button>`;
  if (w.step === 2) return `<span style="font-size:.75rem;color:var(--text-tertiary)">Pick a tier to continue</span>`;
  if (w.step === 3) {
    const tierAllowed = isAITierAllowed(w.tier);
    const canNext = tierAllowed && ((w.tier === 'browser' && !!w.draft.browserModelId)
                 || (w.tier === 'ollama'  && !!w.draft.ollamaModelId && w.testResult?.['state'] === 'ok')
                 || (w.tier === 'cloud'   && !!w.draft.cloudProvider && !!_aiSecrets[w.draft.cloudProvider!]));
    return `<button class="btn btn-primary btn-sm" id="aiw-next" ${canNext ? '' : 'disabled'}>Next →</button>`;
  }
  if (w.step === 4) return `<button class="btn btn-primary btn-sm" id="aiw-finish">Start chatting</button>`;
  return '';
}

function renderWizardStep1(): string {
  if (isOTOnlyMode()) {
    return `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .25rem">OT-only AI is local</h3>
    <p style="font-size:.875rem;color:var(--text-secondary);margin:0 0 1rem;line-height:1.5">This offline build only connects to an Ollama-compatible AI server on this device or an approved internal network endpoint. Cloud AI, browser model downloads, and internet model pulls are disabled.</p>
    <div style="border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;font-size:.8125rem">
      <div style="display:grid;grid-template-columns:150px 1fr;border-bottom:1px solid var(--border-subtle)"><div style="padding:.625rem .75rem;color:var(--text-tertiary);background:var(--bg-base)">Allowed</div><div style="padding:.625rem .75rem">Ollama-compatible <code>/api/chat</code> endpoints on localhost or internal LAN hosts</div></div>
      <div style="display:grid;grid-template-columns:150px 1fr;border-bottom:1px solid var(--border-subtle)"><div style="padding:.625rem .75rem;color:var(--text-tertiary);background:var(--bg-base)">Blocked</div><div style="padding:.625rem .75rem">Cloud providers, Hugging Face model downloads, and public AI URLs</div></div>
      <div style="display:grid;grid-template-columns:150px 1fr"><div style="padding:.625rem .75rem;color:var(--text-tertiary);background:var(--bg-base)">CSP</div><div style="padding:.625rem .75rem">LAN endpoints must be included in the offline build's <code>OT_AI_CONNECT_SRC</code> allowlist</div></div>
    </div>`;
  }
  return `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .25rem">Task App AI is opt-in</h3>
    <p style="font-size:.875rem;color:var(--text-secondary);margin:0 0 1rem;line-height:1.5">Pick how the AI runs. Each option has different privacy, cost, and quality trade-offs.</p>
    <div style="overflow-x:auto;border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
      <table style="width:100%;border-collapse:collapse;font-size:.8125rem">
        <thead><tr style="background:var(--bg-base)">
          <th style="text-align:left;padding:.625rem .75rem;font-weight:600">&nbsp;</th>
          <th style="text-align:left;padding:.625rem .75rem;font-weight:600">In-browser</th>
          <th style="text-align:left;padding:.625rem .75rem;font-weight:600">Ollama</th>
          <th style="text-align:left;padding:.625rem .75rem;font-weight:600">Cloud</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:.5rem .75rem;color:var(--text-tertiary)">Where data goes</td><td style="padding:.5rem .75rem">This device only</td><td style="padding:.5rem .75rem">This device only</td><td style="padding:.5rem .75rem">Sent to provider</td></tr>
          <tr style="background:var(--bg-base)"><td style="padding:.5rem .75rem;color:var(--text-tertiary)">Network</td><td style="padding:.5rem .75rem">First download only</td><td style="padding:.5rem .75rem">Never (after install)</td><td style="padding:.5rem .75rem">Every message</td></tr>
          <tr><td style="padding:.5rem .75rem;color:var(--text-tertiary)">Cost</td><td style="padding:.5rem .75rem">Free</td><td style="padding:.5rem .75rem">Free</td><td style="padding:.5rem .75rem">Per-token</td></tr>
          <tr style="background:var(--bg-base)"><td style="padding:.5rem .75rem;color:var(--text-tertiary)">Quality</td><td style="padding:.5rem .75rem">Small models</td><td style="padding:.5rem .75rem">Mid-size</td><td style="padding:.5rem .75rem">Frontier</td></tr>
          <tr><td style="padding:.5rem .75rem;color:var(--text-tertiary)">Hardware</td><td style="padding:.5rem .75rem">WebGPU + ~2 GB RAM</td><td style="padding:.5rem .75rem">~4–8 GB RAM</td><td style="padding:.5rem .75rem">Any</td></tr>
          <tr style="background:var(--bg-base)"><td style="padding:.5rem .75rem;color:var(--text-tertiary)">Setup</td><td style="padding:.5rem .75rem">~1 min</td><td style="padding:.5rem .75rem">~5–10 min</td><td style="padding:.5rem .75rem">~2 min</td></tr>
        </tbody>
      </table>
    </div>
    <p style="font-size:.75rem;color:var(--text-tertiary);margin-top:.875rem;line-height:1.5">You can change this any time in Settings → AI. AI is fully optional — nothing else in Task App CRM depends on it.</p>`;
}

function renderWizardStep2(): string {
  const w = _aiWizard!;
  const card = (tier: string, title: string, tag: string, pros: string[], cons: string[]) => `
    <div class="aiw-tier-card" data-aiw-tier="${tier}" style="border:2px solid ${w.tier===tier?'var(--accent)':'var(--border-subtle)'};border-radius:var(--radius-md);padding:1rem;cursor:pointer;background:${w.tier===tier?'var(--bg-base)':'transparent'};transition:all var(--transition);display:flex;flex-direction:column;gap:.5rem">
      <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-weight:600">${title}</span><span style="font-size:.65rem;background:var(--accent);color:#fff;padding:.125rem .5rem;border-radius:999px;text-transform:uppercase;letter-spacing:.04em">${tag}</span></div>
      <ul style="font-size:.75rem;color:var(--text-secondary);margin:0;padding-left:1.25rem;line-height:1.6">${pros.map(p=>`<li>${escH(p)}</li>`).join('')}</ul>
      <div style="font-size:.7rem;color:var(--text-tertiary);font-style:italic">Trade-offs: ${cons.join(' · ')}</div>
    </div>`;
  const cards: string[] = [];
  if (isAITierAllowed('browser')) cards.push(card('browser','In-browser','Try it', ['No install, works offline after one download','Fully private','Gemma 4 or Gemini Nano'], ['Smaller models','Needs WebGPU']));
  if (isAITierAllowed('ollama')) cards.push(card('ollama', isOTOnlyMode() ? 'Local/Internal AI Server' : 'Ollama', isOTOnlyMode() ? 'OT allowed' : 'Power user', ['Local or internal LAN endpoint','No cloud provider account','Ollama-compatible API'], isOTOnlyMode() ? ['Endpoint must be allowlisted in CSP','Models must be provisioned outside the app'] : ['Install + one-time CORS config']));
  if (isAITierAllowed('cloud')) cards.push(card('cloud','Cloud','Best quality', ['Claude / GPT / Gemini frontier quality','No hardware needs','Fastest responses'], ['Data leaves device','Pay per token','API key required']));
  return `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .25rem">Choose how AI runs</h3>
    <p style="font-size:.875rem;color:var(--text-secondary);margin:0 0 1rem;line-height:1.5">Pick one. You can change later in Settings.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem">
      ${cards.join('')}
    </div>`;
}

function renderWizardStep3Browser(): string {
  const w = _aiWizard!;
  const hasWebGPU = ('gpu' in navigator);
  const hasNano = !!((window as unknown as AnyRecord)['LanguageModel'] ?? ((window as unknown as AnyRecord)['ai'] as AnyRecord | undefined)?.['languageModel']);
  if (!hasWebGPU && !hasNano) {
    return `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .5rem">WebGPU not available</h3>
      <div class="card" style="padding:.875rem;border-color:#fcd34d;background:#fef3c7;color:#78350f;font-size:.8125rem;line-height:1.6">Your browser doesn't expose WebGPU or Chrome Built-in AI. Use Chrome or Edge on a supported device, or pick a different tier (Ollama / Cloud).</div>`;
  }
  const visibleModels = hasWebGPU ? BROWSER_MODELS : BROWSER_MODELS.filter(m => m.id === 'nano');
  if (!hasWebGPU && w.draft.browserModelId !== 'nano') w.draft.browserModelId = 'nano';
  const opt = (id: string, m: typeof BROWSER_MODELS[0]) => `<div class="aiw-bm" data-aiw-bm="${id}" style="border:2px solid ${w.draft.browserModelId===id?'var(--accent)':'var(--border-subtle)'};border-radius:var(--radius-md);padding:.75rem 1rem;cursor:pointer;display:flex;gap:.75rem;align-items:flex-start;background:${w.draft.browserModelId===id?'var(--bg-base)':'transparent'}">
    <div style="flex-shrink:0;width:18px;height:18px;border:2px solid ${w.draft.browserModelId===id?'var(--accent)':'var(--border-default)'};border-radius:50%;margin-top:.125rem">${w.draft.browserModelId===id?`<div style="width:10px;height:10px;border-radius:50%;background:var(--accent);margin:2px"></div>`:''}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:.5rem;font-weight:600;font-size:.875rem">${escH(m.label)}<span style="font-size:.7rem;color:var(--text-tertiary);font-weight:500">${escH(m.size)}</span></div>
      <div style="font-size:.75rem;color:var(--text-secondary);margin-top:.25rem;line-height:1.5">${escH(m.desc)}</div>
    </div>
  </div>`;
  return `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .5rem">Pick an in-browser model</h3>
    <p style="font-size:.8125rem;color:var(--text-secondary);margin:0 0 .875rem;line-height:1.5">${hasWebGPU ? 'Model weights are downloaded once and cached in your browser. Subsequent loads are instant and work offline.' : 'WebGPU is unavailable, but Chrome Built-in AI can still run Gemini Nano when your browser supports it.'}</p>
    <div style="display:flex;flex-direction:column;gap:.5rem">${visibleModels.map(m => opt(m.id, m)).join('')}</div>`;
}

function renderWizardStep3Ollama(): string {
  const w = _aiWizard!;
  const os   = _osHint();
  const cors = _corsBlock(os);
  const probe = w.testResult as { state: string; version?: string; models?: string[] } | null;
  const allowPull = deploymentPolicy.ai.allowOllamaModelPull;
  const probeChip = (() => {
    if (!probe) return `<span style="font-size:.75rem;color:var(--text-tertiary)">Not tested</span>`;
    if (probe.state === 'ok')   return `<span style="font-size:.75rem;color:#10b981;font-weight:600">✓ Reachable (Ollama ${escH(probe.version || '')}, ${probe.models?.length || 0} models)</span>`;
    if (probe.state === 'cors') return `<span style="font-size:.75rem;color:#f59e0b;font-weight:600">⚠ CORS-blocked — complete step 2 and restart Ollama</span>`;
    if (probe.state === 'down') return `<span style="font-size:.75rem;color:#dc2626;font-weight:600">✗ Not running — start Ollama from your menu/tray</span>`;
    if (probe.state === 'badurl') return `<span style="font-size:.75rem;color:#dc2626;font-weight:600">✗ Bad URL</span>`;
    return '';
  })();
  const pulled  = new Set((probe?.models) || []);
  const fileNote = location.protocol === 'file:' ? `<div style="font-size:.75rem;color:#78350f;background:#fef3c7;padding:.5rem .625rem;border-radius:var(--radius-sm);margin-top:.5rem">You opened this app via <code>file://</code>. Use <code>OLLAMA_ORIGINS=null</code> (literal string) or serve the file through a local web server.</div>` : '';
  const installText = isOTOnlyMode()
    ? 'Install and preload models outside this app, or point the URL below at an already-approved internal Ollama-compatible server.'
    : 'Install Ollama from your approved software source, then start the local service before testing the connection.';
  return `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .25rem">Set up local/internal AI</h3>
    <p style="font-size:.8125rem;color:var(--text-secondary);margin:0 0 1rem;line-height:1.5">Use an Ollama-compatible server on this device or an approved internal LAN endpoint. The app calls <code>/api/tags</code>, <code>/api/version</code>, and <code>/api/chat</code>.</p>

    <details open style="margin-bottom:.625rem;border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:.625rem .75rem">
      <summary style="font-weight:600;cursor:pointer;font-size:.875rem">1. Provision the AI server</summary>
      <div style="margin-top:.5rem;font-size:.8125rem;line-height:1.6">${installText}</div>
    </details>

    <details open style="margin-bottom:.625rem;border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:.625rem .75rem">
      <summary style="font-weight:600;cursor:pointer;font-size:.875rem">2. Allow this app to talk to Ollama (${cors.title})</summary>
      <div style="margin-top:.5rem;font-size:.8125rem;line-height:1.6">
        <p style="margin:0 0 .5rem">Ollama blocks cross-origin browser requests by default. Allow this app's origin only, then restart Ollama:</p>
        <pre style="background:var(--bg-base);padding:.625rem;border-radius:var(--radius-sm);overflow-x:auto;font-size:.75rem;margin:0">${escH(cors.cmd)}</pre>
        ${cors.after ? `<p style="margin:.5rem 0 0;color:var(--text-secondary)">${escH(cors.after)}</p>` : ''}
        ${fileNote}
      </div>
    </details>

    <details open style="margin-bottom:.625rem;border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:.625rem .75rem">
      <summary style="font-weight:600;cursor:pointer;font-size:.875rem">3. Test connection</summary>
      <div style="margin-top:.5rem;font-size:.8125rem">
        <div class="form-group" style="margin-bottom:.5rem"><label class="form-label">URL</label><input class="input" id="aiw-ollama-url" value="${escH(w.draft.ollamaUrl)}" placeholder="http://localhost:11434 or https://ai-server.internal"></div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" id="aiw-ollama-test">Test connection</button>${probeChip}</div>
        ${isOTOnlyMode() ? `<div style="font-size:.75rem;color:var(--text-tertiary);margin-top:.5rem;line-height:1.5">For LAN endpoints, rebuild the offline profile with <code>OT_AI_CONNECT_SRC</code> containing this origin, or the browser CSP will block the request.</div>` : ''}
      </div>
    </details>

    <details ${probe?.state==='ok'?'open':''} style="border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:.625rem .75rem">
      <summary style="font-weight:600;cursor:pointer;font-size:.875rem">4. Pick a model</summary>
      <div style="margin-top:.5rem;font-size:.8125rem">
        ${probe?.state==='ok' ? `<div style="display:flex;flex-direction:column;gap:.375rem;max-height:300px;overflow-y:auto">${OLLAMA_CATALOG.map(m => {
          const isPulled = pulled.has(m.tag);
          const selected = w.draft.ollamaModelId === m.tag;
          const progress = (w.pullProgress?.['tag'] === m.tag) ? w.pullProgress : null;
          const right = progress
            ? `<div style="font-size:.7rem;color:var(--text-tertiary);min-width:120px;text-align:right">${escH(String(progress['status'] || ''))} ${progress['total'] ? `${Math.round(100*(Number(progress['completed'])||0)/Number(progress['total']))}%` : ''}</div>`
            : isPulled
              ? `<button class="btn ${selected?'btn-primary':'btn-secondary'} btn-sm" data-aiw-ollama-use="${escH(m.tag)}">${selected?'✓ Selected':'Use'}</button>`
              : allowPull
                ? `<button class="btn btn-secondary btn-sm" data-aiw-ollama-pull="${escH(m.tag)}">${Icons.Download(14)} Pull (${escH(m.size)})</button>`
                : `<span style="font-size:.7rem;color:var(--text-tertiary);min-width:120px;text-align:right">Not installed</span>`;
          return `<div style="display:flex;gap:.625rem;align-items:center;padding:.5rem .625rem;border:1px solid var(--border-subtle);border-radius:var(--radius-sm)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.8125rem">${escH(m.tag)} <span style="font-size:.7rem;color:var(--text-tertiary);font-weight:500">· ${escH(m.size)} · ${escH(m.ram)}</span></div>
              <div style="font-size:.7rem;color:var(--text-secondary);margin-top:.125rem">${escH(m.why)}</div>
            </div>
            ${right}
          </div>`;
        }).join('')}</div>
        ${allowPull ? `<div style="display:flex;gap:.5rem;margin-top:.625rem;align-items:center">
          <input class="input" id="aiw-ollama-other" placeholder="Or any tag, e.g. mistral-nemo:12b" style="flex:1;font-size:.8rem">
          <button class="btn btn-secondary btn-sm" id="aiw-ollama-other-pull">${Icons.Download(14)} Pull</button>
        </div>` : `<div style="font-size:.75rem;color:var(--text-tertiary);margin-top:.625rem;line-height:1.5">Model pulls are disabled in this build. Preload approved models on the local/internal AI server, then select one from the detected list.</div>`}` : `<div style="color:var(--text-tertiary);font-style:italic">Complete step 3 first.</div>`}
      </div>
    </details>`;
}

function renderWizardStep3Cloud(): string {
  const w   = _aiWizard!;
  const prov = w.draft.cloudProvider;
  const seg = `<div style="display:inline-flex;border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;margin-bottom:.875rem">
    ${Object.keys(CLOUD_PROVIDERS).map(p => `<button class="aiw-cprov" data-aiw-cprov="${p}" style="padding:.5rem .875rem;border:none;background:${p===prov?'var(--accent)':'transparent'};color:${p===prov?'#fff':'var(--text-primary)'};font-weight:500;font-size:.8125rem;cursor:pointer">${escH(CLOUD_PROVIDERS[p]?.label ?? p)}</button>`).join('')}
  </div>`;
  let panel = '';
  if (prov) {
    const def = CLOUD_PROVIDERS[prov];
    if (!def) return panel;
    const draftKey = w.cloudKeyInputs[prov] ?? '';
    const hasKey   = !!_aiSecrets[prov];
    const tr = w.testResult && (w.testResult as AnyRecord)['provider'] === prov ? w.testResult as AnyRecord : null;
    const modelRow = (m: typeof def.models[0]) => `<div class="aiw-cmodel" data-aiw-cmodel="${escH(m.id)}" style="border:1px solid ${w.draft.cloudModelByProvider[prov]===m.id?'var(--accent)':'var(--border-subtle)'};border-radius:var(--radius-sm);padding:.5rem .625rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:.5rem;background:${w.draft.cloudModelByProvider[prov]===m.id?'var(--bg-base)':'transparent'}">
      <div><div style="font-weight:600;font-size:.8125rem">${escH(m.label)}</div><div style="font-size:.7rem;color:var(--text-tertiary)">${escH(m.note)}</div></div>
      <div style="font-size:.7rem;color:var(--text-tertiary);text-align:right">$${m.priceIn.toFixed(2)} in<br>$${m.priceOut.toFixed(2)} out</div>
    </div>`;
    panel = `<div class="card" style="padding:1rem;display:flex;flex-direction:column;gap:.75rem">
      <div class="form-group">
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:center">API key <a href="${def.keyHelpUrl}" target="_blank" rel="noopener" style="font-weight:normal;font-size:.7rem;color:var(--accent)">Get a key →</a></label>
        <div style="display:flex;gap:.375rem"><input class="input" id="aiw-cloud-key" type="password" placeholder="${hasKey ? '•••••• (saved — paste to replace)' : 'Paste your API key'}" autocomplete="off" value="${escH(draftKey)}" style="flex:1"><button class="btn btn-secondary btn-sm" id="aiw-cloud-toggle-key" title="Show/hide">👁</button><button class="btn btn-primary btn-sm" id="aiw-cloud-save-key" ${draftKey?'':'disabled'}>Save</button></div>
        ${tr ? `<div style="margin-top:.5rem;font-size:.75rem;color:${tr['ok']?'#10b981':'#dc2626'};font-weight:600">${tr['ok']?'✓ Key valid':'✗ ' + escH(String(tr['error'] || 'failed'))}</div>` : ''}
      </div>
      <div>
        <div style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-tertiary);margin-bottom:.5rem">Model</div>
        <div style="display:flex;flex-direction:column;gap:.375rem">${def.models.map(modelRow).join('')}</div>
      </div>
      <div style="font-size:.7rem;color:var(--text-tertiary);background:var(--bg-base);padding:.5rem .625rem;border-radius:var(--radius-sm);line-height:1.5">${hasKey?'Your key is encrypted inside the app vault. It is not stored in plain text and is wiped when the vault locks.':'Keys live inside the app vault (AES-encrypted with your account password). They are wiped from memory when you log out.'}</div>
      ${hasKey?`<button class="btn btn-secondary btn-sm" id="aiw-cloud-test">Test key</button>`:''}
    </div>`;
  }
  return `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .5rem">Connect a cloud provider</h3>
    <p style="font-size:.8125rem;color:var(--text-secondary);margin:0 0 .5rem;line-height:1.5">Bring your own API key. Task App never sees or stores it on a server.</p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:var(--radius-sm);padding:.5rem .75rem;font-size:.75rem;color:#78350f;line-height:1.6;margin-bottom:.875rem">
      <strong>Data notice:</strong> When you ask AI questions about your CRM data (e.g. "list my overdue tasks"), record names and summaries are included in the prompt sent to the cloud provider. No encrypted vault data is transmitted — only plaintext summaries built at query time.
    </div>
    ${seg}${panel}`;
}

function renderWizardStep4(): string {
  const w = _aiWizard!;
  const tierLabel = w.tier === 'browser' ? 'In-browser' : w.tier === 'ollama' ? (isOTOnlyMode() ? 'Local/Internal AI Server' : 'Ollama') : w.tier === 'cloud' ? `Cloud (${CLOUD_PROVIDERS[w.draft.cloudProvider!]?.label || ''})` : '';
  let modelLabel = '';
  if (w.tier === 'browser') modelLabel = BROWSER_MODELS.find(m => m.id === w.draft.browserModelId)?.label || '';
  else if (w.tier === 'ollama') modelLabel = w.draft.ollamaModelId;
  else if (w.tier === 'cloud' && w.draft.cloudProvider) modelLabel = CLOUD_PROVIDERS[w.draft.cloudProvider]?.models.find(m => m.id === w.draft.cloudModelByProvider[w.draft.cloudProvider!])?.label || '';
  return `<h3 style="font-size:1.125rem;font-weight:600;margin:0 0 .5rem">All set</h3>
    <div class="card" style="padding:1rem;margin:.75rem 0">
      <div style="font-size:.75rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.375rem">Your AI</div>
      <div style="font-size:1rem;font-weight:600">${escH(tierLabel)}</div>
      <div style="font-size:.8125rem;color:var(--text-secondary);margin-top:.125rem">${escH(modelLabel)}</div>
    </div>
    <label style="display:flex;align-items:flex-start;gap:.5rem;font-size:.8125rem;cursor:pointer">
      <input type="checkbox" id="aiw-confirm-creates" ${w.draft.autoApplyCreates?'':'checked'}>
      <span>Always ask me before AI creates or modifies records. <span style="color:var(--text-tertiary)">(Recommended)</span></span>
    </label>`;
}

// ── Wizard event binding ───────────────────────────────────────────────────────
export function bindAIWizard(): void {
  if (!_aiWizard) return;
  const w = _aiWizard;

  document.getElementById('aiw-close')?.addEventListener('click', closeAIWizard);
  document.getElementById('aiw-backdrop')?.addEventListener('click', e => {
    if ((e.target as HTMLElement).id === 'aiw-backdrop' && w.step !== 3) closeAIWizard();
  });
  document.getElementById('aiw-back')?.addEventListener('click', () => { w.step = Math.max(1, w.step - 1); _fullRender(getState() as AppState); });
  document.getElementById('aiw-notnow')?.addEventListener('click', closeAIWizard);
  document.getElementById('aiw-continue')?.addEventListener('click', () => { w.step = 2; _fullRender(getState() as AppState); });

  document.querySelectorAll<HTMLElement>('[data-aiw-tier]').forEach(el => el.addEventListener('click', () => {
    w.tier = (el.dataset as DOMStringMap & { aiwTier: string }).aiwTier;
    if (!isAITierAllowed(w.tier)) {
      showToast('This AI tier is disabled in this build.', 'error', 5000);
      return;
    }
    w.draft.tier = w.tier;
    w.step = 3; w.testResult = null;
    _fullRender(getState() as AppState);
  }));

  document.querySelectorAll<HTMLElement>('[data-aiw-bm]').forEach(el => el.addEventListener('click', () => {
    w.draft.browserModelId = (el.dataset as DOMStringMap & { aiwBm: string }).aiwBm;
    _fullRender(getState() as AppState);
  }));

  document.getElementById('aiw-ollama-test')?.addEventListener('click', async () => {
    const url = (document.getElementById('aiw-ollama-url') as HTMLInputElement | null)?.value?.trim();
    if (url) w.draft.ollamaUrl = url;
    try { assertLocalAIEndpointAllowed(w.draft.ollamaUrl); }
    catch (e) {
      w.testResult = { state: 'badurl', error: (e as Error).message };
      showToast((e as Error).message, 'error', 6000);
      _fullRender(getState() as AppState);
      return;
    }
    aiPrefs.ollama.url = w.draft.ollamaUrl;
    w.testResult = await probeOllama(w.draft.ollamaUrl) as AnyRecord;
    _fullRender(getState() as AppState);
  });

  document.querySelectorAll<HTMLElement>('[data-aiw-ollama-use]').forEach(el => el.addEventListener('click', () => {
    w.draft.ollamaModelId = (el.dataset as DOMStringMap & { aiwOllamaUse: string }).aiwOllamaUse;
    _fullRender(getState() as AppState);
  }));

  const startPull = async (tag: string) => {
    if (!deploymentPolicy.ai.allowOllamaModelPull) {
      showToast('Model pulls are disabled in this offline build.', 'error', 5000);
      return;
    }
    if (!tag) return;
    w.pullProgress = { tag, status: 'starting', completed: 0, total: 0 };
    _fullRender(getState() as AppState);
    try {
      await pullOllamaModel(tag, w.draft.ollamaUrl, (p) => { w.pullProgress = { tag, ...p }; _fullRender(getState() as AppState); });
      w.testResult = await probeOllama(w.draft.ollamaUrl) as AnyRecord;
      w.draft.ollamaModelId = tag;
      w.pullProgress = null;
      showToast(`Pulled ${tag}`, 'success');
    } catch (e) {
      w.pullProgress = null;
      showToast(`Pull failed: ${(e as Error)?.message || e}`, 'error', 6000);
    }
    _fullRender(getState() as AppState);
  };

  document.querySelectorAll<HTMLElement>('[data-aiw-ollama-pull]').forEach(el =>
    el.addEventListener('click', () => startPull((el.dataset as DOMStringMap & { aiwOllamaPull: string }).aiwOllamaPull))
  );
  document.getElementById('aiw-ollama-other-pull')?.addEventListener('click', () => {
    const v = (document.getElementById('aiw-ollama-other') as HTMLInputElement | null)?.value?.trim();
    if (v) startPull(v); else showToast('Enter a model tag', 'error');
  });

  document.querySelectorAll<HTMLElement>('[data-aiw-cprov]').forEach(el => el.addEventListener('click', () => {
    w.draft.cloudProvider = (el.dataset as DOMStringMap & { aiwCprov: string }).aiwCprov;
    w.testResult = null;
    _fullRender(getState() as AppState);
  }));

  const keyInput = document.getElementById('aiw-cloud-key') as HTMLInputElement | null;
  if (keyInput) {
    keyInput.addEventListener('input', () => {
      if (w.draft.cloudProvider) w.cloudKeyInputs[w.draft.cloudProvider] = keyInput.value;
      document.getElementById('aiw-cloud-save-key')?.toggleAttribute('disabled', !keyInput.value);
    });
  }
  document.getElementById('aiw-cloud-toggle-key')?.addEventListener('click', () => {
    if (keyInput) keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('aiw-cloud-save-key')?.addEventListener('click', async () => {
    const prov = w.draft.cloudProvider;
    if (!prov) return;
    const k = (w.cloudKeyInputs[prov] || '').trim();
    if (!k) return;
    const provDef = CLOUD_PROVIDERS[prov];
    if (provDef?.keyPattern && !provDef.keyPattern.test(k)) {
      showToast(`Invalid ${escH(provDef.label)} key format — check the key and try again`, 'error', 6000);
      return;
    }
    try {
      const secrets = await aiSecretsLoad();
      secrets[prov] = k;
      await aiSecretsSave(secrets);
      _aiSecrets = secrets;
      w.cloudKeyInputs[prov] = '';
      showToast('Key saved (encrypted)', 'success');
    } catch (e) { showToast('Failed to save: ' + ((e as Error)?.message || ''), 'error'); }
    _fullRender(getState() as AppState);
  });

  document.querySelectorAll<HTMLElement>('[data-aiw-cmodel]').forEach(el => el.addEventListener('click', () => {
    if (w.draft.cloudProvider) w.draft.cloudModelByProvider[w.draft.cloudProvider] = (el.dataset as DOMStringMap & { aiwCmodel: string }).aiwCmodel;
    _fullRender(getState() as AppState);
  }));

  document.getElementById('aiw-cloud-test')?.addEventListener('click', async () => {
    const prov = w.draft.cloudProvider;
    if (!prov) return;
    const k = _aiSecrets[prov];
    if (!k) return;
    w.testResult = { provider: prov, ok: false, error: 'testing…' };
    _fullRender(getState() as AppState);
    const r = await testCloudKey(prov, k);
    w.testResult = { provider: prov, ...r };
    _fullRender(getState() as AppState);
  });

  document.getElementById('aiw-next')?.addEventListener('click', () => { w.step = 4; _fullRender(getState() as AppState); });

  document.getElementById('aiw-finish')?.addEventListener('click', async () => {
    if (!isAITierAllowed(w.tier)) {
      showToast('This AI tier is disabled in this build.', 'error', 5000);
      return;
    }
    aiPrefs.tier = w.tier;
    if (w.tier === 'browser') aiPrefs.browser.modelId = w.draft.browserModelId;
    if (w.tier === 'ollama') {
      try { assertLocalAIEndpointAllowed(w.draft.ollamaUrl); }
      catch (e) { showToast((e as Error).message, 'error', 6000); return; }
      aiPrefs.ollama.url     = w.draft.ollamaUrl;
      aiPrefs.ollama.modelId = w.draft.ollamaModelId;
      if (w.draft.ollamaModelId && !aiPrefs.ollama.pulledCatalogIds.includes(w.draft.ollamaModelId))
        aiPrefs.ollama.pulledCatalogIds.push(w.draft.ollamaModelId);
    }
    if (w.tier === 'cloud') {
      aiPrefs.cloud.provider         = w.draft.cloudProvider;
      aiPrefs.cloud.modelByProvider  = w.draft.cloudModelByProvider;
    }
    const cb = document.getElementById('aiw-confirm-creates') as HTMLInputElement | null;
    aiPrefs.autoApplyCreates     = !(cb?.checked);
    aiPrefs.hasCompletedOnboarding = true;
    syncAIPrefsLegacy(aiPrefs);
    saveAIPrefs(aiPrefs);
    _aiWizard = null;
    setState({ aiPanelOpen: false });
    navigate('ai');
    try { await disconnectAI(); await startAILoad(); } catch (e) {
      console.warn('[AI] startAILoad after wizard:', (e as Error)?.message);
    }
  });
}
