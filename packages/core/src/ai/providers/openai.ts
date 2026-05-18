// ── OPENAI (GPT) PROVIDER ─────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;
type Message   = { role: string; content: string };

export interface OpenAICallOpts {
  key:      string;
  model:    string;
  system:   string;
  history:  Message[];
  onToken?: (text: string) => void;
  signal?:  AbortSignal;
}

async function readSSEStream(resp: Response, onLine: (data: string) => void, signal?: AbortSignal): Promise<void> {
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 240)}`);
  }
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') onLine(payload);
      }
    }
  }
}

export async function callOpenAI(opts: OpenAICallOpts): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const { key, model, system, history, onToken, signal } = opts;
  const messages = [
    { role: 'system', content: system },
    ...history.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
  ];

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, messages, max_completion_tokens: 2048, stream: true, stream_options: { include_usage: true } }),
    signal: signal ?? null,
  });

  let full = '', usageIn = 0, usageOut = 0;
  await readSSEStream(resp, (data) => {
    try {
      const j = JSON.parse(data) as AnyRecord;
      const delta = ((j['choices'] as AnyRecord[])?.[0]?.['delta'] as AnyRecord)?.['content'];
      if (delta) { full += delta; onToken?.(full); }
      if (j['usage']) {
        usageIn  = Number((j['usage'] as AnyRecord)['prompt_tokens']     || 0);
        usageOut = Number((j['usage'] as AnyRecord)['completion_tokens'] || 0);
      }
    } catch { /* malformed chunk */ }
  }, signal);

  return { text: full, tokensIn: usageIn, tokensOut: usageOut };
}

export async function testOpenAIKey(key: string, modelId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: modelId, max_completion_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 401) return { ok: false, error: 'invalid key' };
    if (r.status === 429) return { ok: false, error: 'rate limited' };
    return { ok: r.ok };
  } catch (e) {
    if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') return { ok: false, error: 'no network' };
    return { ok: false, error: (e as Error)?.message || 'failed' };
  }
}
