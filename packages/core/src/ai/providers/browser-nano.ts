// ── CHROME / EDGE BUILT-IN AI PROVIDER ────────────────────────────────────────
// Uses the browser Prompt API (window.LanguageModel).
// Chrome 148+ uses Gemini Nano; Edge 148+ uses Phi-4-mini. Same API surface.
// Stateless — sessions are owned by ai-runtime.ts and passed in as parameters.

type AnyRecord = Record<string, unknown>;
type Message   = { role: string; content: string };

function getNanoAPI(): AnyRecord | undefined {
  const w = window as unknown as AnyRecord;
  return (w['LanguageModel'] ?? (w['ai'] as AnyRecord | undefined)?.['languageModel']) as AnyRecord | undefined;
}

// ── Connection ─────────────────────────────────────────────────────────────────

export async function loadNano(
  updateTxt: (msg: string) => void,
  systemPrompt: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<AnyRecord> {
  updateTxt('Checking built-in AI…');
  const api = getNanoAPI();
  if (!api) throw new Error('LanguageModel API not found. Enable chrome://flags/#prompt-api-for-gemini-nano (Chrome) or the equivalent edge://flags entry (Edge), then relaunch.');

  const opts = { expectedOutputs: [{ type: 'text', languages: ['en'] }] };
  let avail: string;
  try {
    avail = await (api['availability'] as (o: AnyRecord) => Promise<string>)(opts);
  } catch {
    avail = 'unavailable';
  }
  if (avail === 'unavailable') throw new Error('Built-in AI is not available on this device. Ensure Chrome/Edge 127+ with hardware acceleration enabled and the Prompt API flag active.');

  if (avail === 'downloadable' || avail === 'downloading') {
    updateTxt('Waiting for browser to download AI model (~4 GB)…');
  } else {
    updateTxt('Connecting to built-in AI…');
  }

  // Single create() handles download (if needed) + session creation.
  // The monitor callback surfaces real download progress via the downloadprogress
  // event (Chrome/Edge 127+). If the browser does not support monitor, the
  // parameter is silently ignored and onProgress is never called.
  const session = await (api['create'] as (o: AnyRecord) => Promise<AnyRecord>)({
    ...opts,
    initialPrompts: [{ role: 'system', content: systemPrompt }],
    monitor: (m: AnyRecord) => {
      try {
        (m['addEventListener'] as (type: string, handler: (e: AnyRecord) => void) => void)(
          'downloadprogress',
          (e: AnyRecord) => {
            const loaded = Number(e['loaded'] ?? 0);
            const total  = Number(e['total']  ?? 0);
            if (total > 0) onProgress?.(loaded, total);
          },
        );
      } catch { /* monitor not supported — progress stays indeterminate */ }
    },
  });
  session['_sysPrompt'] = systemPrompt;

  updateTxt('Verifying built-in AI…');
  const test = await (session['prompt'] as (m: string) => Promise<string>)('Reply with one word: ready');
  if (!test) throw new Error('Model returned empty response');
  return session;
}

// ── Inference ──────────────────────────────────────────────────────────────────

export async function callNano(
  session: AnyRecord,
  systemPrompt: string,
  history: Message[],
  onToken: (text: string) => void,
): Promise<{ text: string; session: AnyRecord }> {
  // Recreate session if system prompt changed
  let activeSession = session;
  if (session['_sysPrompt'] !== systemPrompt) {
    const api = getNanoAPI();
    if (!api) throw new Error('LanguageModel API not available');
    activeSession = await (api['create'] as (o: AnyRecord) => Promise<AnyRecord>)({
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      initialPrompts: [{ role: 'system', content: systemPrompt }],
    });
    activeSession['_sysPrompt'] = systemPrompt;
  }

  const lastUserMsg = history[history.length - 1]?.content || '';
  let response = '';
  try {
    const stream = (activeSession['promptStreaming'] as (m: string) => AsyncIterable<string>)(lastUserMsg);
    for await (const chunk of stream) {
      if (typeof chunk !== 'string') continue;
      response = chunk.startsWith(response) && chunk.length >= response.length ? chunk : response + chunk;
      onToken(response);
    }
  } catch (e) {
    console.warn('[AI] Nano streaming failed, fallback:', (e as Error).message);
    response = await (activeSession['prompt'] as (m: string) => Promise<string>)(lastUserMsg);
    onToken(response);
  }
  return { text: (typeof response === 'string' ? response : '').trim(), session: activeSession };
}

export function destroyNanoSession(session: AnyRecord | null): void {
  if (!session) return;
  try { (session['destroy'] as (() => void) | undefined)?.(); } catch { /* already destroyed */ }
}
