/**
 * Server-side LLM client — thin fetch wrappers for Anthropic, OpenAI, Google.
 *
 * Provider selection priority:
 *   1. If the model ID maps to a known provider and the API key env var is set → use it.
 *   2. If AI_PROVIDER env var is set → use that provider's key regardless of model.
 *   3. No key available → throws LlmUnconfiguredError (caller returns HTTP 501).
 *
 * All calls go through the AI gateway policy engine first (rate limit, budget, PII).
 * This module only handles the network call and response extraction.
 */

// ── Error types ────────────────────────────────────────────────────────────────

export class LlmUnconfiguredError extends Error {
  readonly statusCode = 501
  constructor(model: string) {
    super(
      `No API key configured for model '${model}'. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY.`,
    )
    this.name = 'LlmUnconfiguredError'
  }
}

export class LlmApiError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
  ) {
    super(`${provider} API error ${status}: ${message}`)
    this.name = 'LlmApiError'
  }
}

// ── Provider routing ───────────────────────────────────────────────────────────

type Provider = 'anthropic' | 'openai' | 'google'

const _MODEL_PROVIDER_MAP = new Map<string, Provider>([
  ['claude-opus-4-7', 'anthropic'],
  ['claude-sonnet-4-6', 'anthropic'],
  ['claude-haiku-4-5-20251001', 'anthropic'],
  ['gpt-4o', 'openai'],
  ['gpt-4o-mini', 'openai'],
  ['gemini-1.5-pro', 'google'],
  ['gemini-1.5-flash', 'google'],
  ['gemini-2.0-flash', 'google'],
])

function _resolveProvider(model: string): Provider {
  const fromMap = _MODEL_PROVIDER_MAP.get(model)
  if (fromMap) return fromMap
  const envOverride = process.env['AI_PROVIDER']
  if (envOverride === 'anthropic' || envOverride === 'openai' || envOverride === 'google') {
    return envOverride
  }
  // Infer from model name prefix
  if (model.startsWith('claude')) return 'anthropic'
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai'
  if (model.startsWith('gemini')) return 'google'
  return 'anthropic' // default to most capable
}

// ── Request/response types ─────────────────────────────────────────────────────

export interface LlmRequest {
  model: string
  systemPrompt?: string
  userMessage: string
  /** Max tokens in the completion. Default: 1024 */
  maxTokens?: number
  /** Temperature 0–1. Default: 0 (deterministic for attribute compute) */
  temperature?: number
}

export interface LlmResponse {
  provider: Provider
  model: string
  content: string
  inputTokens: number
  outputTokens: number
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function _callAnthropic(req: LlmRequest): Promise<LlmResponse> {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) throw new LlmUnconfiguredError(req.model)

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? 1024,
    temperature: req.temperature ?? 0,
    messages: [{ role: 'user', content: req.userMessage }],
  }
  if (req.systemPrompt) body['system'] = req.systemPrompt

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new LlmApiError('anthropic', resp.status, text)
  }

  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  const content = data.content?.find((b) => b.type === 'text')?.text ?? ''
  return {
    provider: 'anthropic',
    model: req.model,
    content,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  }
}

// ── OpenAI ─────────────────────────────────────────────────────────────────────

async function _callOpenAI(req: LlmRequest): Promise<LlmResponse> {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) throw new LlmUnconfiguredError(req.model)

  const messages: Array<{ role: string; content: string }> = []
  if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt })
  messages.push({ role: 'user', content: req.userMessage })

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new LlmApiError('openai', resp.status, text)
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const content = data.choices?.[0]?.message?.content ?? ''
  return {
    provider: 'openai',
    model: req.model,
    content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  }
}

// ── Google Gemini ─────────────────────────────────────────────────────────────

async function _callGoogle(req: LlmRequest): Promise<LlmResponse> {
  const apiKey = process.env['GOOGLE_AI_API_KEY']
  if (!apiKey) throw new LlmUnconfiguredError(req.model)

  const parts: Array<{ text: string }> = [{ text: req.userMessage }]
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0,
    },
  }
  if (req.systemPrompt) {
    body['systemInstruction'] = { parts: [{ text: req.systemPrompt }] }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent?key=${apiKey}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new LlmApiError('google', resp.status, text)
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return {
    provider: 'google',
    model: req.model,
    content,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Call the appropriate LLM provider for the given model.
 * Throws LlmUnconfiguredError (501) if no API key is available.
 * Throws LlmApiError on provider HTTP errors.
 */
export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  const provider = _resolveProvider(req.model)
  switch (provider) {
    case 'anthropic':
      return _callAnthropic(req)
    case 'openai':
      return _callOpenAI(req)
    case 'google':
      return _callGoogle(req)
  }
}
