// ── OLLAMA PROVIDER ───────────────────────────────────────────────────────────
// Stateless — all configuration passed as parameters or read from aiPrefs.
// No dependency on ai-runtime (avoids circular imports).

import { aiPrefs } from '../ai-prefs.js';
import { assertLocalAIEndpointAllowed } from '../../deployment-policy.js';

type AnyRecord = Record<string, unknown>;
type Message   = { role: string; content: string };

// ── Connection verification ────────────────────────────────────────────────────

export async function loadOllama(updateTxt: (msg: string) => void): Promise<void> {
  const { url, modelId } = aiPrefs.ollama;
  assertLocalAIEndpointAllowed(url);
  updateTxt(`Checking Ollama at ${url}…`);
  const ping = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (!ping.ok) throw new Error(`Ollama responded ${ping.status}`);
  const tags = await ping.json() as { models?: Array<{ name: string }> };
  const models = (tags.models || []).map(m => m.name);
  const hasModel = models.some(m => m === modelId || m.startsWith(modelId.split(':')[0] + ':'));
  if (!hasModel) throw new Error(`Model "${modelId}" not installed. Run: ollama pull ${modelId}`);
  updateTxt(`Testing ${modelId}…`);
  const test = await fetch(`${url}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'hi' }], stream: false }),
    signal: AbortSignal.timeout(30000),
  });
  if (!test.ok) throw new Error(`Ollama chat test failed: ${test.status}`);
}

// ── Inference ──────────────────────────────────────────────────────────────────

export async function callOllama(
  systemPrompt: string,
  history: Message[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { url, modelId } = aiPrefs.ollama;
  const messages = [{ role: 'system', content: systemPrompt }, ...history];
  const resp = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, messages, stream: true }),
    signal: signal ?? null,
  });
  if (!resp.ok) throw new Error(`Ollama error ${resp.status}: ${await resp.text()}`);
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value, { stream: true }).split('\n').filter(Boolean)) {
      try {
        const json = JSON.parse(line) as AnyRecord;
        full += ((json['message'] as AnyRecord)?.['content'] as string) || '';
        onToken(full);
        if (json['done']) break;
      } catch { /* non-JSON chunk */ }
    }
  }
  return full.trim();
}

// ── Model list ─────────────────────────────────────────────────────────────────

export async function fetchOllamaModels(
  url: string,
  existingCache: AnyRecord[] | null = null,
  force = false,
): Promise<AnyRecord[]> {
  if (!force && existingCache) return existingCache;
  try {
    const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const data = await resp.json() as { models?: Array<{ name: string; size?: number }> };
    return (data.models || []).map(m => ({
      id: 'ollama:' + m.name, backend: 'ollama', model: m.name, label: m.name,
      size: m.size ? `${(m.size / 1e9).toFixed(1)}GB` : '',
    }));
  } catch { return []; }
}

// ── Wizard helpers ─────────────────────────────────────────────────────────────

export async function probeOllama(
  url: string,
): Promise<{ state: string; version?: string; models?: string[]; error?: string }> {
  const u = (url || '').replace(/\/$/, '');
  let parsed: URL;
  try { parsed = new URL(u); } catch { return { state: 'badurl' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { state: 'badurl' };
  try {
    const r = await fetch(u + '/api/version', { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { state: 'down', error: 'HTTP ' + r.status };
    const v = await r.json().catch(() => ({})) as AnyRecord;
    let models: string[] = [];
    try {
      const t = await fetch(u + '/api/tags', { signal: AbortSignal.timeout(2000) });
      if (t.ok) {
        const d = await t.json() as AnyRecord;
        models = ((d['models'] || []) as AnyRecord[]).map(m => String(m['name']));
      }
    } catch { /* model list optional */ }
    return { state: 'ok', version: String(v['version'] || '?'), models };
  } catch (e) {
    try {
      await fetch(u + '/api/version', { mode: 'no-cors', signal: AbortSignal.timeout(2000) });
      return { state: 'cors' };
    } catch { return { state: 'down', error: (e as Error)?.message || 'unreachable' }; }
  }
}

export async function pullOllamaModel(
  tag: string,
  url: string,
  onProgress: (p: AnyRecord) => void,
  signal?: AbortSignal,
): Promise<void> {
  const u = (url || '').replace(/\/$/, '');
  try { const p = new URL(u); if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error('bad protocol'); } catch { throw new Error('Invalid Ollama URL'); }
  const resp = await fetch(u + '/api/pull', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: tag, stream: true }), signal: signal ?? null,
  });
  if (!resp.ok) throw new Error(`pull failed: HTTP ${resp.status}`);
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line) as AnyRecord;
        if (j['error']) throw new Error(String(j['error']));
        onProgress(j);
        if (j['status'] === 'success') return;
      } catch (e) {
        if ((e as Error)?.message && !(e as Error).message.startsWith('Unexpected')) throw e;
      }
    }
  }
}

export async function deleteOllamaModel(tag: string, url: string): Promise<void> {
  const u = (url || '').replace(/\/$/, '');
  try { const p = new URL(u); if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error('bad protocol'); } catch { throw new Error('Invalid Ollama URL'); }
  const r = await fetch(u + '/api/delete', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: tag }),
  });
  if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
}
