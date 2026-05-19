// ── AI PREFERENCES — schema, defaults, load/save, migration ──────────────────
// Single source of truth for persisted AI configuration.
// No dependency on runtime state or UI — safe to import anywhere.

type AnyRecord = Record<string, unknown>;

export const AI_PREFS_KEY_V1 = 'taskapp_ai_prefs_v1';
export const AI_PREFS_KEY    = 'taskapp_ai_prefs_v2';

const CURRENT_CLOUD_MODEL_BY_PROVIDER: Record<string, string> = {
  anthropic: 'claude-3-5-haiku-latest',
  openai:    'gpt-5-mini',
  google:    'gemini-3-flash-preview',
};

export const AI_DEFAULT_PREFS = {
  schemaVersion: 2,
  hasCompletedOnboarding: false,
  tier: null as string | null,
  browser: {
    modelId: 'gemma-e2b',
    dtype: 'q4f16',
    device: 'webgpu',
    weightsCached: { 'gemma-e2b': false, 'gemma-e4b': false } as Record<string, boolean>,
  },
  ollama: {
    url: 'http://localhost:11434',
    modelId: 'qwen2.5:3b',
    pulledCatalogIds: [] as string[],
  },
  cloud: {
    provider: null as string | null,
    modelByProvider: {
      ...CURRENT_CLOUD_MODEL_BY_PROVIDER,
    } as Record<string, string>,
    usage: { tokensIn: 0, tokensOut: 0, estCostUsd: 0, monthKey: '' },
  },
  autoApplyCreates: false,
  nanoDisclaimerAcknowledged: false,
  // Legacy mirror fields — kept in sync by syncAIPrefsLegacy() for old callsites
  backend: null as string | null,
  ollamaUrl: '',
  ollamaModel: '',
  webllmModel: '',
};

export type AIPrefs = typeof AI_DEFAULT_PREFS;

export function migrateAIPrefsV1toV2(v1: AnyRecord): AIPrefs {
  const out: AIPrefs = JSON.parse(JSON.stringify(AI_DEFAULT_PREFS));
  out.autoApplyCreates = !!v1.autoApplyCreates;
  if (v1.backend === 'nano') { out.tier = 'browser'; out.browser.modelId = 'nano'; }
  else if (v1.backend === 'webllm') {
    out.tier = 'browser';
    out.browser.modelId = /E4B/i.test(String(v1.webllmModel || '')) ? 'gemma-e4b' : 'gemma-e2b';
  } else if (v1.backend === 'ollama') {
    out.tier = 'ollama';
    if (v1.ollamaUrl) out.ollama.url = String(v1.ollamaUrl);
    if (v1.ollamaModel) out.ollama.modelId = String(v1.ollamaModel);
  }
  out.hasCompletedOnboarding = !!(v1.backend && v1.backend !== 'auto');
  return out;
}

export function loadAIPrefs(): AIPrefs {
  try {
    const v2raw = localStorage.getItem(AI_PREFS_KEY);
    if (v2raw) {
      const parsed = JSON.parse(v2raw) as Partial<AIPrefs>;
      const merged = {
        ...AI_DEFAULT_PREFS, ...parsed,
        browser: { ...AI_DEFAULT_PREFS.browser, ...(parsed.browser || {}),
                   weightsCached: { ...AI_DEFAULT_PREFS.browser.weightsCached, ...((parsed.browser || {}).weightsCached || {}) } },
        ollama:  { ...AI_DEFAULT_PREFS.ollama,  ...(parsed.ollama  || {}) },
        cloud:   { ...AI_DEFAULT_PREFS.cloud,   ...(parsed.cloud   || {}),
                   modelByProvider: { ...AI_DEFAULT_PREFS.cloud.modelByProvider, ...((parsed.cloud || {}).modelByProvider || {}) },
                   usage: { ...AI_DEFAULT_PREFS.cloud.usage, ...((parsed.cloud || {}).usage || {}) } },
      } as AIPrefs;
      for (const [provider, fallback] of Object.entries(CURRENT_CLOUD_MODEL_BY_PROVIDER)) {
        if (!merged.cloud.modelByProvider[provider] || isRetiredCloudModel(provider, merged.cloud.modelByProvider[provider]!)) {
          merged.cloud.modelByProvider[provider] = fallback;
        }
      }
      return merged;
    }
    const v1raw = localStorage.getItem(AI_PREFS_KEY_V1);
    if (v1raw) {
      const v2 = migrateAIPrefsV1toV2(JSON.parse(v1raw) as AnyRecord);
      localStorage.setItem(AI_PREFS_KEY, JSON.stringify(v2));
      return v2;
    }
  } catch (e) { console.warn('[AI] prefs load failed, using defaults:', (e as Error)?.message); }
  return JSON.parse(JSON.stringify(AI_DEFAULT_PREFS)) as AIPrefs;
}

function isRetiredCloudModel(provider: string, modelId: string): boolean {
  const retired: Record<string, Set<string>> = {
    anthropic: new Set(['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5']),
    openai:    new Set(['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini']),
    google:    new Set(['gemini-3.1-pro', 'gemini-3-flash', 'gemini-3.1-flash-lite']),
  };
  return retired[provider]?.has(modelId) ?? false;
}

export function saveAIPrefs(p: AIPrefs): void {
  const { backend: _b, ollamaUrl: _u, ollamaModel: _m, webllmModel: _w, ...rest } = p;
  localStorage.setItem(AI_PREFS_KEY, JSON.stringify(rest));
}

// Keeps legacy flat fields (backend/ollamaUrl/ollamaModel/webllmModel) in sync
// with the structured fields. Called after any tier/model change.
export function syncAIPrefsLegacy(p: AIPrefs): AIPrefs {
  p.backend = p.tier === 'browser' ? (p.browser?.modelId === 'nano' ? 'nano' : 'webllm')
            : p.tier === 'ollama' ? 'ollama'
            : p.tier === 'cloud'  ? 'cloud' : null;
  p.ollamaUrl   = p.ollama?.url     || 'http://localhost:11434';
  p.ollamaModel = p.ollama?.modelId || '';
  p.webllmModel = p.browser?.modelId === 'gemma-e4b'
    ? 'onnx-community/gemma-4-E4B-it-ONNX'
    : 'onnx-community/gemma-4-E2B-it-ONNX';
  return p;
}

// Module-level singleton — mutated in place by callers
export const aiPrefs: AIPrefs = syncAIPrefsLegacy(loadAIPrefs());
