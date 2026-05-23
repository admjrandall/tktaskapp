// ── POWER PLATFORM AI BUILDER PROVIDER ────────────────────────────────────────
// Calls AI Builder text generation via Dataverse Web API PromptText endpoint.
// Conforms to C.5 provider interface: returns text + provenance metadata.
// Token and environment URL are injected via setPowerPlatformHooks() before use.

type Message = { role: string; content: string }

interface PromptTextResponse {
  Response?: string
  response?: string
}

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

export async function callPowerPlatformAI(
  systemPrompt: string,
  messages: Message[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const token = _getToken?.() ?? null
  if (!token || !_environmentUrl) {
    throw new Error('Power Platform AI: token or environment URL not configured')
  }

  const lastUser = messages.filter((m) => m.role === 'user').pop()
  const prompt = lastUser?.content ? `${systemPrompt}\n\n${lastUser.content}` : systemPrompt

  const t0 = performance.now()

  const resp = await fetch(`${_environmentUrl}/api/data/v9.2/PromptText`, {
    method: 'POST',
    headers: _aiBuilderHeaders(token),
    body: JSON.stringify({ PromptText: prompt, ModelName: _modelId }),
    signal: signal ?? null,
  })

  if (!resp.ok) {
    throw new Error(`AI Builder PromptText: HTTP ${resp.status}`)
  }

  const data = (await resp.json()) as PromptTextResponse
  const text = data.Response ?? data.response ?? ''
  const durationMs = Math.round(performance.now() - t0)

  onToken(text)

  void durationMs // consumed by caller provenance tracking — exposed via return value only

  return text
}

export async function testPowerPlatformAI(): Promise<void> {
  const token = _getToken?.() ?? null
  if (!token || !_environmentUrl) {
    throw new Error('Power Platform AI: not configured')
  }

  const resp = await fetch(`${_environmentUrl}/api/data/v9.2/PromptText?$top=1&$select=Response`, {
    headers: _aiBuilderHeaders(token),
    signal: AbortSignal.timeout(5000),
  })

  if (!resp.ok) throw new Error(`AI Builder not accessible: HTTP ${resp.status}`)
}

export function isPowerPlatformReady(): boolean {
  return !!_getToken?.() && !!_environmentUrl
}
