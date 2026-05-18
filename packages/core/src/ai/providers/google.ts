// ── GOOGLE (GEMINI) PROVIDER ──────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;
type Message   = { role: string; content: string };

export interface GoogleCallOpts {
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

export async function callGoogle(opts: GoogleCallOpts): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const { key, model, system, history, onToken, signal } = opts;
  const contents = history
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

  const resp = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: system }] } }),
    signal: signal ?? null,
  });

  let full = '', usageIn = 0, usageOut = 0;
  await readSSEStream(resp, (data) => {
    try {
      const j = JSON.parse(data) as AnyRecord;
      const cand0 = (j['candidates'] as AnyRecord[] | undefined)?.[0] as AnyRecord | undefined;
      const t = ((cand0?.['content'] as AnyRecord | undefined)?.['parts'] as AnyRecord[] | undefined)?.[0]?.['text'];
      if (t) { full += t; onToken?.(full); }
      if (j['usageMetadata']) {
        usageIn  = Number((j['usageMetadata'] as AnyRecord)['promptTokenCount']     || usageIn);
        usageOut = Number((j['usageMetadata'] as AnyRecord)['candidatesTokenCount'] || usageOut);
      }
    } catch { /* malformed chunk */ }
  }, signal);

  return { text: full, tokensIn: usageIn, tokensOut: usageOut };
}

export async function testGoogleKey(key: string, modelId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (r.status === 400 || r.status === 403) return { ok: false, error: 'invalid key' };
    if (r.status === 429) return { ok: false, error: 'rate limited' };
    return { ok: r.ok };
  } catch (e) {
    if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') return { ok: false, error: 'no network' };
    return { ok: false, error: (e as Error)?.message || 'failed' };
  }
}
