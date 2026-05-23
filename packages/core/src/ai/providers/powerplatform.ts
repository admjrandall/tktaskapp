// ── POWER PLATFORM AI BUILDER PROVIDER ────────────────────────────────────────
// Calls AI Builder text generation via Dataverse Web API PromptText endpoint.
// Conforms to C.5 provider interface: returns text + provenance metadata.
// Token and environment URL are injected via setPowerPlatformHooks() before use.
// Falls back to window.LanguageModel (browser AI) if AI Builder is unavailable.

export interface AIProviderResult {
  text: string
  tokensIn: number
  tokensOut: number
  provenance: {
    modelId: string
    computeDurationMs: number
    confidence?: number
  }
}

type Message = { role: string; content: string }

interface PromptTextResponse {
  Response?: string
  response?: string
  InputTokenCount?: number
  OutputTokenCount?: number
}

// Window shape for the browser Prompt API (Chrome Gemini Nano / Edge Phi-4-mini)
type LanguageModelSession = { prompt(text: string): Promise<string> }
type LanguageModelAPI = {
  create(opts?: { systemPrompt?: string }): Promise<LanguageModelSession>
}
type PPWindow = Window & { LanguageModel?: LanguageModelAPI }

let _getToken: (() => string | null) | null = null
let _environmentUrl = ''
let _modelId = 'ai-builder-gpt-4o'

export function setPowerPlatformHooks(
  getToken: () => string | null,
  environmentUrl: string,
  modelId?: string,
): void {
  _getToken = getToken
  _environmentUrl = environmentUrl
  if (modelId) _modelId = modelId
}

function _aiBuilderHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
  }
}

async function _browserAIFallback(
  systemPrompt: string,
  userPrompt: string,
  onToken: (text: string) => void,
): Promise<AIProviderResult> {
  const lm = (window as PPWindow).LanguageModel
  if (!lm)
    throw new Error(
      'Power Platform AI Builder unavailable and browser AI (LanguageModel) is not present',
    )
  const t0 = performance.now()
  const session = await lm.create({ systemPrompt })
  const text = await session.prompt(userPrompt)
  const durationMs = Math.round(performance.now() - t0)
  onToken(text)
  return {
    text,
    tokensIn: 0,
    tokensOut: 0,
    provenance: { modelId: 'browser-built-in', computeDurationMs: durationMs },
  }
}

export async function callPowerPlatformAI(
  systemPrompt: string,
  messages: Message[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<AIProviderResult> {
  const token = _getToken?.() ?? null
  const lastUser = messages.filter((m) => m.role === 'user').pop()
  const userPrompt = lastUser?.content ?? ''
  const fullPrompt = userPrompt ? `${systemPrompt}\n\n${userPrompt}` : systemPrompt

  // No token / env — go straight to browser AI fallback
  if (!token || !_environmentUrl) {
    return _browserAIFallback(systemPrompt, userPrompt || systemPrompt, onToken)
  }

  const t0 = performance.now()
  let resp: Response
  try {
    resp = await fetch(`${_environmentUrl}/api/data/v9.2/PromptText`, {
      method: 'POST',
      headers: _aiBuilderHeaders(token),
      body: JSON.stringify({ PromptText: fullPrompt, ModelName: _modelId }),
      signal: signal ?? null,
    })
  } catch {
    // Network-level failure — fall back to browser AI
    return _browserAIFallback(systemPrompt, userPrompt || systemPrompt, onToken)
  }

  if (!resp.ok) {
    // AI Builder returned an error — fall back to browser AI
    return _browserAIFallback(systemPrompt, userPrompt || systemPrompt, onToken)
  }

  const data = (await resp.json()) as PromptTextResponse
  const text = data.Response ?? data.response ?? ''
  const durationMs = Math.round(performance.now() - t0)

  onToken(text)

  return {
    text,
    tokensIn: data.InputTokenCount ?? 0,
    tokensOut: data.OutputTokenCount ?? 0,
    provenance: { modelId: _modelId, computeDurationMs: durationMs },
  }
}

export async function testPowerPlatformAI(): Promise<void> {
  const token = _getToken?.() ?? null
  if (!token || !_environmentUrl) {
    throw new Error('Power Platform AI: not configured')
  }
  const resp = await fetch(`${_environmentUrl}/api/data/v9.2/PromptText?$top=1&$select=Response`, {
    headers: _aiBuilderHeaders(token),
    signal: AbortSignal.timeout(5_000),
  })
  if (!resp.ok) throw new Error(`AI Builder not accessible: HTTP ${resp.status}`)
}

export function isPowerPlatformReady(): boolean {
  return !!_getToken?.() && !!_environmentUrl
}
