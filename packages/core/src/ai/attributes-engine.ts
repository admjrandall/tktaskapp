// ── AI ATTRIBUTES ENGINE ──────────────────────────────────────────────────────
// Compute scheduler for AI-derived attributes on CRM records.
// Uses requestIdleCallback for background scheduling.
// Enforces: HIPAA field skip, lockdown gating, EU AI Act provenance recording.

import { getState, setState } from '../state.js'
import { auditLog } from '../security/audit.js'

type AnyRecord = Record<string, unknown>

export interface AIAttributeDef {
  id: string
  entityType: string
  fieldKey: string
  label: string
  prompt: string
  dataSources: Array<{ kind: 'field' | 'relation' | 'communications' | 'history'; path: string }>
  model: { tier: 'browser' | 'ollama' | 'cloud' | 'powerplatform'; preferredModelId?: string }
  refreshInterval: 'on_change' | 'daily' | 'weekly' | 'manual'
  hipaaClassified: boolean
  euAiActScope: 'operational' | 'decision-support'
  createdAt: string
  updatedAt: string
}

export interface AIAttributeValue {
  defId: string
  recordId: string
  entityType: string
  value: string | number | boolean | null
  provenance: {
    provider: string
    modelId: string
    computedAt: string
    computeDurationMs: number
    confidence: number | null
    inputDataHashes: string[]
    promptHash: string
  }
  errorState?: { message: string; lastAttemptAt: string }
}

// ── Hook injection — callBackend from ai-runtime (injected to avoid circular) ──
let _callBackend: (
  system: string,
  history: Array<{ role: string; content: string }>,
  onToken: (t: string) => void,
) => Promise<string> = async () => ''
let _getActiveBackend: () => string | null = () => null
let _getActiveModelId: () => string = () => 'unknown'

export function setAttributeEngineHooks(hooks: {
  callBackend: typeof _callBackend
  getActiveBackend: () => string | null
  getActiveModelId: () => string
}): void {
  _callBackend = hooks.callBackend
  _getActiveBackend = hooks.getActiveBackend
  _getActiveModelId = hooks.getActiveModelId
}

// ── In-memory cache: `${defId}:${recordId}` → AIAttributeValue ────────────────
const _cache = new Map<string, AIAttributeValue>()

export function getCachedValue(defId: string, recordId: string): AIAttributeValue | null {
  return _cache.get(`${defId}:${recordId}`) ?? null
}

function _setCached(val: AIAttributeValue): void {
  _cache.set(`${val.defId}:${val.recordId}`, val)
  const state = getState()
  const existing = state.aiAttributeValues as unknown[] as AIAttributeValue[]
  const idx = existing.findIndex((v) => v.defId === val.defId && v.recordId === val.recordId)
  const updated: AIAttributeValue[] =
    idx >= 0 ? [...existing.slice(0, idx), val, ...existing.slice(idx + 1)] : [...existing, val]
  setState({ aiAttributeValues: updated as unknown as Record<string, unknown>[] })
}

// ── SHA-256 helper ─────────────────────────────────────────────────────────────
async function _sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Lockdown check ─────────────────────────────────────────────────────────────
function _isComputeAllowed(def: AIAttributeDef): boolean {
  const { lockdownLevel } = getState()
  if ((lockdownLevel === 'strong' || lockdownLevel === 'strict') && def.model.tier === 'cloud') {
    return false
  }
  return true
}

// ── Data source collector ──────────────────────────────────────────────────────
function _collectInputs(def: AIAttributeDef, record: AnyRecord): string[] {
  const inputs: string[] = []
  for (const src of def.dataSources) {
    if (src.kind === 'field') {
      const val = src.path.split('.').reduce<unknown>((obj, k) => (obj as AnyRecord)?.[k], record)
      if (val !== undefined && val !== null) inputs.push(String(val).slice(0, 500))
    }
  }
  return inputs
}

// ── Core compute ───────────────────────────────────────────────────────────────
export async function computeAttribute(
  def: AIAttributeDef,
  record: AnyRecord,
): Promise<AIAttributeValue> {
  const recordId = String(record['id'] ?? '')
  const now = new Date().toISOString()

  // HIPAA gate — never send classified fields to AI
  if (def.hipaaClassified) {
    return {
      defId: def.id,
      recordId,
      entityType: def.entityType,
      value: null,
      provenance: {
        provider: 'skipped',
        modelId: 'n/a',
        computedAt: now,
        computeDurationMs: 0,
        confidence: null,
        inputDataHashes: [],
        promptHash: '',
      },
      errorState: { message: 'HIPAA field — compute skipped', lastAttemptAt: now },
    }
  }

  // Lockdown gate
  if (!_isComputeAllowed(def)) {
    auditLog('lockdown_violation_blocked', {
      context: 'ai_attribute',
      defId: def.id,
      tier: def.model.tier,
    })
    throw new Error(`AI Attribute compute blocked by lockdown (cloud tier not allowed)`)
  }

  const inputs = _collectInputs(def, record)
  const inputDataHashes = await Promise.all(inputs.map(_sha256))
  const resolvedPrompt = `${def.prompt}\n\nData:\n${inputs.join('\n\n')}`
  const promptHash = await _sha256(resolvedPrompt)
  const backend = _getActiveBackend()
  if (!backend) throw new Error('No AI backend connected — cannot compute attribute')

  const t0 = performance.now()
  let rawText = ''
  try {
    rawText = await _callBackend(
      'You are a data analyst. Extract or infer the requested value from the provided data. ' +
        'Respond with ONLY the value — no explanation, no JSON wrapper.',
      [{ role: 'user', content: resolvedPrompt }],
      () => {},
    )
  } catch (e) {
    const dMs = Math.round(performance.now() - t0)
    const errVal: AIAttributeValue = {
      defId: def.id,
      recordId,
      entityType: def.entityType,
      value: null,
      provenance: {
        provider: backend,
        modelId: _getActiveModelId(),
        computedAt: new Date().toISOString(),
        computeDurationMs: dMs,
        confidence: null,
        inputDataHashes,
        promptHash,
      },
      errorState: { message: (e as Error).message, lastAttemptAt: new Date().toISOString() },
    }
    auditLog('ai_attribute_failed', {
      defId: def.id,
      recordId,
      error: (e as Error).message,
    })
    _setCached(errVal)
    return errVal
  }

  const durationMs = Math.round(performance.now() - t0)
  const value = rawText.trim().slice(0, 1000)
  const result: AIAttributeValue = {
    defId: def.id,
    recordId,
    entityType: def.entityType,
    value,
    provenance: {
      provider: backend,
      modelId: _getActiveModelId(),
      computedAt: new Date().toISOString(),
      computeDurationMs: durationMs,
      confidence: null,
      inputDataHashes,
      promptHash,
    },
  }
  _setCached(result)
  auditLog('ai_attribute_computed', {
    defId: def.id,
    recordId,
    entityType: def.entityType,
    provider: backend,
    modelId: _getActiveModelId(),
    durationMs: String(durationMs),
  })
  return result
}

// ── Background compute queue ───────────────────────────────────────────────────
interface QueueEntry {
  def: AIAttributeDef
  record: AnyRecord
  retries: number
}

const _queue = new Map<string, QueueEntry>()
let _schedulerRunning = false

export function scheduleAttributeCompute(def: AIAttributeDef, record: AnyRecord): void {
  const key = `${def.id}:${String(record['id'] ?? '')}`
  if (_queue.has(key)) return
  _queue.set(key, { def, record, retries: 0 })
  if (!_schedulerRunning) _drainQueue()
}

function _drainQueue(): void {
  if (_queue.size === 0) {
    _schedulerRunning = false
    return
  }
  _schedulerRunning = true
  const ric =
    typeof requestIdleCallback !== 'undefined'
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 16)
  ric(async () => {
    const entry = _queue.entries().next()
    if (entry.done) {
      _schedulerRunning = false
      return
    }
    const [key, qe] = entry.value
    _queue.delete(key)
    try {
      await computeAttribute(qe.def, qe.record)
    } catch {
      if (qe.retries < 2) _queue.set(key, { ...qe, retries: qe.retries + 1 })
    }
    _drainQueue()
  })
}

export function startAttributeScheduler(): void {
  _schedulerRunning = false
  _drainQueue()
}
