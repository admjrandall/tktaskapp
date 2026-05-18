// ── CHROME BUILT-IN AI (GEMINI NANO) PROVIDER ────────────────────────────────
// Uses the Chrome Prompt API (window.LanguageModel / window.ai.languageModel).
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
): Promise<AnyRecord> {
  updateTxt('Checking Chrome Built-in AI (Gemini Nano)…');
  const api = getNanoAPI();
  if (!api) throw new Error('LanguageModel API not found. Enable chrome://flags/#prompt-api-for-gemini-nano');

  const opts = { expectedOutputs: [{ type: 'text', languages: ['en'] }] };
  const avail = await (api['availability'] as (o: AnyRecord) => Promise<string>)(opts);
  if (avail === 'unavailable') throw new Error('Gemini Nano not available on this device');

  if (avail === 'downloadable' || avail === 'downloading') {
    updateTxt('Downloading Gemini Nano (~4GB, one-time)…');
    (api['create'] as (o: AnyRecord) => Promise<unknown>)(opts).catch(() => { /* background download */ });
    let attempts = 0;
    await new Promise<void>((resolve, reject) => {
      const poll = setInterval(async () => {
        attempts++;
        const status = await (api['availability'] as (o: AnyRecord) => Promise<string>)(opts).catch(() => 'unavailable');
        updateTxt(`Downloading Gemini Nano… ${Math.round(attempts * 5 / 60)} min`);
        if (status === 'available' || status === 'readily') { clearInterval(poll); resolve(); }
        else if (status === 'unavailable' || attempts >= 120) { clearInterval(poll); reject(new Error('Download timed out')); }
      }, 5000);
    });
  }

  updateTxt('Connecting to Gemini Nano…');
  const session = await (api['create'] as (o: AnyRecord) => Promise<AnyRecord>)({
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
    initialPrompts: [{ role: 'system', content: systemPrompt }],
  });
  session['_sysPrompt'] = systemPrompt;

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
