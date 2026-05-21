// ── AI RUNTIME ────────────────────────────────────────────────────────────────
// Single owner of all mutable AI state.
// Provides connectAI / disconnectAI / callBackend.
// Providers are stateless and receive everything they need as parameters.

import { showToast } from '../state.js'
import type { AppState } from '../state.js'
import {
  assertLocalAIEndpointAllowed,
  isAITierAllowed,
  allowedAITiers,
} from '../deployment-policy.js'
import { aiPrefs, saveAIPrefs, syncAIPrefsLegacy } from './ai-prefs.js'
import type { WebLLMPipeline } from './providers/browser-transformers.js'
import { loadNano, callNano, destroyNanoSession } from './providers/browser-nano.js'
import { loadWebLLM, callWebLLM } from './providers/browser-transformers.js'
import {
  loadOllama,
  callOllama,
  fetchOllamaModels as _fetchOllamaModels,
} from './providers/ollama.js'
import { callAnthropic } from './providers/anthropic.js'
import { callOpenAI } from './providers/openai.js'
import { callGoogle } from './providers/google.js'

type AnyRecord = Record<string, unknown>
type Message = { role: string; content: string }

// ── Runtime state object ───────────────────────────────────────────────────────
// A plain mutable object so any importing module can read live values.
// Only ai-runtime.ts and ai-ui.ts (for streaming flag + history + pendingAction)
// should write to this object.
export const aiRuntime = {
  ready: false,
  loadStarted: false,
  backend: null as string | null,
  streaming: false,
  nanoSession: null as AnyRecord | null,
  webllmPipeline: null as WebLLMPipeline | null,
  webllmLoadProgress: 0,
  abortController: null as AbortController | null,
  history: [] as Message[],
  pendingAction: null as { tool: string; args: AnyRecord; summary: string } | null,
  ollamaModelsCache: null as AnyRecord[] | null,
  modelPickerOpen: null as string | null,
  downloadProgress: null as { loaded: number; total: number } | null,
}

// ── Hook injection ─────────────────────────────────────────────────────────────
// appRenderWorkspace is injected by main.ts to avoid circular imports.
let _appRenderWorkspace: (view: string) => void = () => {}
let _fullRender: (state: AppState) => void = () => {}

export function setRuntimeHooks(hooks: {
  appRenderWorkspace: (view: string) => void
  fullRender: (state: AppState) => void
}): void {
  _appRenderWorkspace = hooks.appRenderWorkspace
  _fullRender = hooks.fullRender
}

// Cloud secrets injected by ai-settings.ts on unlock
let _getSecrets: () => Record<string, string> = () => ({})
export function setRuntimeSecretsGetter(fn: () => Record<string, string>): void {
  _getSecrets = fn
}

// buildSystemPrompt injected by ai-tools.ts (ai-tools imports ai-runtime, not vice versa)
let _buildSystemPrompt: () => string = () => ''
export function setRuntimePromptBuilder(fn: () => string): void {
  _buildSystemPrompt = fn
}

// cost tracking injected by ai-settings.ts
let _trackUsage: (
  prov: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
) => void = () => {}
export function setRuntimeUsageTracker(fn: typeof _trackUsage): void {
  _trackUsage = fn
}

// ── Model catalog helpers ──────────────────────────────────────────────────────
export const STATIC_MODELS: Array<{
  id: string
  backend: string
  model: string | null
  label: string
  size: string
}> = [
  { id: 'nano', backend: 'nano', model: null, label: 'Gemini Nano', size: 'built-in' },
  ...(__OT_ONLY_BUILD__
    ? []
    : [
        {
          id: 'webllm-e2b',
          backend: 'webllm',
          model: 'onnx-community/gemma-4-E2B-it-ONNX',
          label: 'Gemma 4 E2B',
          size: '~500MB',
        },
        {
          id: 'webllm-e4b',
          backend: 'webllm',
          model: 'onnx-community/gemma-4-E4B-it-ONNX',
          label: 'Gemma 4 E4B',
          size: '~1.5GB',
        },
      ]),
]

export function activeModelId(): string | null {
  if (!aiRuntime.backend) return null
  if (aiRuntime.backend === 'nano') return 'nano'
  if (aiRuntime.backend === 'webllm') {
    const hit = STATIC_MODELS.find(
      (m) => m.id === `webllm-${aiPrefs.browser.modelId.replace(/^gemma-/, '')}`,
    )
    return hit ? hit.id : 'webllm-custom'
  }
  if (aiRuntime.backend === 'ollama') return 'ollama:' + aiPrefs.ollama.modelId
  return null
}

export function preferredModelId(): string | null {
  const tier = aiPrefs.tier
  if (tier === 'browser' && aiPrefs.browser.modelId === 'nano') return 'nano'
  if (tier === 'browser') {
    const hit = STATIC_MODELS.find(
      (m) => m.id === `webllm-${aiPrefs.browser.modelId.replace(/^gemma-/, '')}`,
    )
    return hit ? hit.id : 'webllm-custom'
  }
  if (tier === 'ollama') return 'ollama:' + aiPrefs.ollama.modelId
  return null
}

export function modelChipLabel(): string {
  const tier = aiPrefs.tier
  if (tier === 'cloud') {
    const prov = aiPrefs.cloud.provider
    if (!prov) return 'Cloud'
    // CLOUD_PROVIDERS is in ai-settings.ts — we use a late-bound getter to avoid circular
    return _getCloudModelLabel(prov) || prov
  }
  if (aiRuntime.backend === 'ollama') return aiPrefs.ollama.modelId
  if (aiRuntime.backend === 'webllm') {
    if (aiPrefs.browser.modelId === 'gemma-e2b') return 'Gemma 4 E2B'
    if (aiPrefs.browser.modelId === 'gemma-e4b') return 'Gemma 4 E4B'
    return aiPrefs.browser.modelId
  }
  if (aiRuntime.backend === 'nano') return 'Gemini Nano'
  return ''
}

export function backendSubtitle(): string {
  if (aiPrefs.tier === 'cloud') {
    const prov = aiPrefs.cloud.provider ?? ''
    return `${_getCloudProviderLabel(prov)} · API`
  }
  if (aiRuntime.backend === 'ollama') return 'Ollama · local server'
  if (aiRuntime.backend === 'webllm') return 'In-browser · WebGPU'
  if (aiRuntime.backend === 'nano') return 'Chrome Built-in AI'
  return ''
}

export function backendLabel(): string {
  const chip = modelChipLabel()
  const sub = backendSubtitle()
  if (chip && sub) return `${chip} · ${sub}`
  return chip || sub || 'AI'
}

// Cloud label getters injected by ai-settings.ts to avoid circular import
let _getCloudModelLabel: (prov: string) => string = () => ''
let _getCloudProviderLabel: (prov: string) => string = () => ''
export function setRuntimeCloudLabelGetters(
  modelLabel: (prov: string) => string,
  providerLabel: (prov: string) => string,
): void {
  _getCloudModelLabel = modelLabel
  _getCloudProviderLabel = providerLabel
}

export async function fetchOllamaModels(force = false): Promise<AnyRecord[]> {
  const result = await _fetchOllamaModels(aiPrefs.ollama.url, aiRuntime.ollamaModelsCache, force)
  aiRuntime.ollamaModelsCache = result
  return result
}

export async function selectModel(entry: (typeof STATIC_MODELS)[0]): Promise<void> {
  if ((entry.backend === 'nano' || entry.backend === 'webllm') && !isAITierAllowed('browser')) {
    showToast('This build allows only local/internal AI server models.', 'error', 5000)
    return
  }
  if (entry.backend === 'ollama' && !isAITierAllowed('ollama')) {
    showToast('Ollama/local AI is not allowed in this build.', 'error', 5000)
    return
  }
  const { getState } = await import('../state.js')
  const wasOnAIView = getState().currentView === 'ai'
  if (entry.backend === 'nano') {
    aiPrefs.tier = 'browser'
    aiPrefs.browser.modelId = 'nano'
  } else if (entry.backend === 'webllm') {
    aiPrefs.tier = 'browser'
    aiPrefs.browser.modelId = /E4B/i.test(entry.model || '') ? 'gemma-e4b' : 'gemma-e2b'
  } else if (entry.backend === 'ollama' && entry.model) {
    aiPrefs.tier = 'ollama'
    aiPrefs.ollama.modelId = entry.model
  }
  syncAIPrefsLegacy(aiPrefs)
  saveAIPrefs(aiPrefs)
  const savedHistory = aiRuntime.history.slice()
  await disconnectAI()
  aiRuntime.history = savedHistory
  aiRuntime.modelPickerOpen = null
  aiRuntime.loadStarted = true
  if (wasOnAIView) _appRenderWorkspace('ai')
  else _fullRender(getState())
  const progressEl = document.getElementById('ai-progress-text')
  if (progressEl) progressEl.textContent = `Switching to ${entry.label}…`
  aiRuntime.loadStarted = false
  await startAILoad()
}

// ── Connect / disconnect ───────────────────────────────────────────────────────

export async function startAILoad(): Promise<void> {
  if (aiRuntime.loadStarted) return
  aiRuntime.loadStarted = true
  try {
    const { getState } = await import('../state.js')
    _appRenderWorkspace(getState().currentView)
  } catch {
    /* view not ready */
  }
  await new Promise<void>((r) =>
    requestAnimationFrame(() => {
      r()
    }),
  )

  const updateTxt = (msg: string) => {
    const el = document.getElementById('ai-progress-text')
    if (el) el.textContent = msg
  }
  updateTxt('Starting…')

  // tier-based dispatch (cloud needs secrets preloaded by caller)
  const tier = aiPrefs.tier
  try {
    if (!isAITierAllowed(tier)) {
      const allowed = allowedAITiers()
      const hint = allowed.includes('browser')
        ? 'Open Settings → AI to set up Gemini Nano.'
        : allowed.includes('ollama')
          ? 'Open Settings → AI to configure Ollama.'
          : 'Open Settings → AI to configure an AI provider.'
      throw new Error(`AI tier "${tier ?? 'none'}" is not allowed in this build. ${hint}`)
    }
    if (tier === 'browser') {
      const modelId = aiPrefs.browser.modelId
      if (modelId === 'nano') {
        const onProgress = (loaded: number, total: number) => {
          aiRuntime.downloadProgress = { loaded, total }
        }
        aiRuntime.nanoSession = await loadNano(updateTxt, _buildSystemPrompt(), onProgress)
        aiRuntime.downloadProgress = null
        aiRuntime.backend = 'nano'
      } else {
        const onProgress = (pct: number) => {
          aiRuntime.webllmLoadProgress = pct
        }
        aiRuntime.webllmPipeline = await loadWebLLM(updateTxt, onProgress, modelId)
        aiRuntime.backend = 'webllm'
      }
    } else if (tier === 'ollama') {
      assertLocalAIEndpointAllowed(aiPrefs.ollama.url)
      await loadOllama(updateTxt)
      aiRuntime.backend = 'ollama'
    } else if (tier === 'cloud') {
      const secrets = _getSecrets()
      const prov = aiPrefs.cloud.provider
      if (!prov) throw new Error('No cloud provider selected')
      if (!secrets[prov]) throw new Error(`No API key for ${prov} — open Settings → AI to add one`)
      aiRuntime.backend = 'cloud'
    } else {
      throw new Error('No AI tier selected — open Settings → AI to configure')
    }
    aiRuntime.ready = true
    aiRuntime.loadStarted = false
    showToast(`AI ready — ${backendLabel()}`, 'success')
  } catch (e) {
    console.warn('[AI] load failed:', (e as Error)?.message)
    aiRuntime.loadStarted = false
    aiRuntime.downloadProgress = null
    aiRuntime.history.push({
      role: 'assistant',
      content: `Could not connect to AI.\n\n• ${(e as Error)?.message}\n\nFix in Settings → AI.`,
    })
    showToast('AI failed to connect — see chat', 'error', 6000)
  }

  try {
    const { getState } = await import('../state.js')
    const _state = getState()
    // If the AI panel is open it lives outside #workspace-container and won't
    // reflect the new ready state unless we do a full re-render.
    if (_state.aiPanelOpen) {
      _fullRender(_state)
    } else {
      _appRenderWorkspace(_state.currentView)
    }
  } catch {
    /* view not ready */
  }
}

export async function disconnectAI(): Promise<void> {
  aiRuntime.ready = false
  aiRuntime.loadStarted = false
  aiRuntime.backend = null
  destroyNanoSession(aiRuntime.nanoSession)
  aiRuntime.nanoSession = null
  aiRuntime.webllmPipeline = null
  aiRuntime.webllmLoadProgress = 0
  aiRuntime.pendingAction = null
  aiRuntime.history = []
  if (aiRuntime.abortController) {
    try {
      aiRuntime.abortController.abort()
    } catch {
      /* already aborted */
    }
    aiRuntime.abortController = null
  }
}

// Alias for callers that use the old name
export { disconnectAI as resetAIConnection }

// ── Backend dispatch ───────────────────────────────────────────────────────────

export async function callBackend(
  systemPrompt: string,
  history: Message[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const backend = aiRuntime.backend
  if (backend === 'nano') {
    if (!aiRuntime.nanoSession) throw new Error('Nano session not initialized')
    const { text, session } = await callNano(aiRuntime.nanoSession, systemPrompt, history, onToken)
    aiRuntime.nanoSession = session // session may have been recreated if system prompt changed
    return text
  }
  if (backend === 'webllm') {
    if (!aiRuntime.webllmPipeline) throw new Error('WebLLM pipeline not loaded')
    return callWebLLM(aiRuntime.webllmPipeline, systemPrompt, history, onToken)
  }
  if (backend === 'ollama') {
    assertLocalAIEndpointAllowed(aiPrefs.ollama.url)
    return callOllama(systemPrompt, history, onToken, signal)
  }
  if (backend === 'cloud') {
    return callCloud(systemPrompt, history, onToken, signal)
  }
  throw new Error('No AI backend connected')
}

async function callCloud(
  systemPrompt: string,
  history: Message[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const prov = aiPrefs.cloud.provider
  if (!prov) throw new Error('No cloud provider selected')
  const model = aiPrefs.cloud.modelByProvider[prov] ?? ''
  const secrets = _getSecrets()
  const key = secrets[prov]
  if (!key) throw new Error(`No API key for ${prov}. Open Settings → AI to add one.`)

  const signalOpt = signal !== undefined ? { signal } : {}
  if (prov === 'anthropic') {
    const { text, tokensIn, tokensOut } = await callAnthropic({
      key,
      model,
      system: systemPrompt,
      history,
      onToken,
      ...signalOpt,
    })
    _trackUsage('anthropic', model, tokensIn, tokensOut)
    return text
  }
  if (prov === 'openai') {
    const { text, tokensIn, tokensOut } = await callOpenAI({
      key,
      model,
      system: systemPrompt,
      history,
      onToken,
      ...signalOpt,
    })
    _trackUsage('openai', model, tokensIn, tokensOut)
    return text
  }
  if (prov === 'google') {
    const { text, tokensIn, tokensOut } = await callGoogle({
      key,
      model,
      system: systemPrompt,
      history,
      onToken,
      ...signalOpt,
    })
    _trackUsage('google', model, tokensIn, tokensOut)
    return text
  }
  throw new Error(`Unknown provider: ${prov}`)
}
