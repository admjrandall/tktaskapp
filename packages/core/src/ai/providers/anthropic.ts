// ── ANTHROPIC (CLAUDE) PROVIDER ───────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;
type Message   = { role: string; content: string };

export interface AnthropicCallOpts {
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

export async function callAnthropic(opts: AnthropicCallOpts): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const { key, model, system, history, onToken, signal } = opts;
  const messages = history
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 2048, system, messages, stream: true }),
    signal: signal ?? null,
  });

  let full = '', usageIn = 0, usageOut = 0;
  await readSSEStream(resp, (data) => {
    try {
      const j = JSON.parse(data) as AnyRecord;
      if (j['type'] === 'content_block_delta' && (j['delta'] as AnyRecord)?.['text']) {
        full += (j['delta'] as AnyRecord)['text'];
        onToken?.(full);
      }
      if (j['type'] === 'message_start' && (j['message'] as AnyRecord)?.['usage'])
        usageIn = Number(((j['message'] as AnyRecord)?.['usage'] as AnyRecord)?.['input_tokens'] || 0);
      if (j['type'] === 'message_delta' && (j['usage'] as AnyRecord)?.['output_tokens'])
        usageOut = Number((j['usage'] as AnyRecord)['output_tokens']);
    } catch { /* malformed chunk */ }
  }, signal);

  return { text: full, tokensIn: usageIn, tokensOut: usageOut };
}

export async function testAnthropicKey(key: string, modelId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'invalid key' };
    if (r.status === 429) return { ok: false, error: 'rate limited' };
    return { ok: r.ok };
  } catch (e) {
    if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') return { ok: false, error: 'no network' };
    return { ok: false, error: (e as Error)?.message || 'failed' };
  }
}
