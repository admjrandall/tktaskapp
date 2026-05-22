// ── VOICE INPUT ────────────────────────────────────────────────────────────────
// Web Speech API wrapper for voice-to-text CRM entry.
// HIPAA gate: never activates for HIPAA-classified fields.
// Lockdown gate: blocked when lockdownLevel is 'strong' or 'strict'.

import { getState } from './state.js'
import { auditLog } from './security/audit.js'

export type VoiceInputStatus = 'idle' | 'listening' | 'error' | 'unsupported'

// ── Minimal Web Speech API types (not in standard TS lib) ─────────────────────
interface SpeechRecognitionResult {
  readonly 0: { readonly transcript: string }
}
interface SpeechRecognitionResultList {
  readonly 0: SpeechRecognitionResult | undefined
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance
}

// All mutable voice state lives on this single object (C.9 ESM binding rule).
export const voiceRuntime = {
  status: 'idle' as VoiceInputStatus,
  transcript: '',
  errorMessage: '',
  recognition: null as SpeechRecognitionInstance | null,
}

// ── Subscribers ────────────────────────────────────────────────────────────────
const _listeners = new Set<() => void>()

export function subscribeVoiceStatus(fn: () => void): () => void {
  _listeners.add(fn)
  return () => void _listeners.delete(fn)
}

function _notify(): void {
  for (const fn of _listeners) fn()
}

// ── Feature detection ──────────────────────────────────────────────────────────
function _getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

export function isVoiceInputSupported(): boolean {
  return _getSpeechRecognitionCtor() !== null
}

// ── HIPAA-classified field IDs ─────────────────────────────────────────────────
// These fields must never be filled via microphone to prevent accidental leakage.
export const HIPAA_FIELD_IDS = new Set([
  'ssn',
  'dob',
  'dateOfBirth',
  'medicalRecord',
  'diagnosis',
  'insurance',
  'healthPlan',
  'patientId',
])

export function isHipaaField(fieldId: string): boolean {
  return HIPAA_FIELD_IDS.has(fieldId)
}

// ── Policy checks ──────────────────────────────────────────────────────────────
function _isVoiceAllowed(): boolean {
  const { lockdownLevel } = getState()
  return lockdownLevel !== 'strong' && lockdownLevel !== 'strict'
}

// ── Start / stop ───────────────────────────────────────────────────────────────
export function startVoiceInput(
  fieldId: string,
  onResult: (transcript: string) => void,
  onError?: (msg: string) => void,
): void {
  const Ctor = _getSpeechRecognitionCtor()
  if (!Ctor) {
    voiceRuntime.status = 'unsupported'
    voiceRuntime.errorMessage = 'Speech recognition not supported in this browser.'
    _notify()
    return
  }
  if (!_isVoiceAllowed()) {
    voiceRuntime.status = 'error'
    voiceRuntime.errorMessage = 'Voice input is disabled in lockdown mode.'
    auditLog('lockdown_violation_blocked', { context: 'voice_input', fieldId })
    _notify()
    onError?.('Voice input disabled by lockdown policy.')
    return
  }
  if (isHipaaField(fieldId)) {
    voiceRuntime.status = 'error'
    voiceRuntime.errorMessage = 'Voice input is not allowed for HIPAA-classified fields.'
    _notify()
    onError?.('HIPAA field — voice input disabled.')
    return
  }
  if (voiceRuntime.recognition) stopVoiceInput()

  const recognition = new Ctor()
  recognition.lang = 'en-US'
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const transcript = event.results[0]?.[0]?.transcript ?? ''
    voiceRuntime.transcript = transcript
    voiceRuntime.status = 'idle'
    voiceRuntime.recognition = null
    _notify()
    onResult(transcript)
  }

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    voiceRuntime.status = 'error'
    voiceRuntime.errorMessage = event.error
    voiceRuntime.recognition = null
    _notify()
    onError?.(event.error)
  }

  recognition.onend = () => {
    if (voiceRuntime.status === 'listening') {
      voiceRuntime.status = 'idle'
      voiceRuntime.recognition = null
      _notify()
    }
  }

  voiceRuntime.recognition = recognition
  voiceRuntime.status = 'listening'
  voiceRuntime.transcript = ''
  voiceRuntime.errorMessage = ''
  _notify()
  recognition.start()
}

export function stopVoiceInput(): void {
  if (voiceRuntime.recognition) {
    try {
      voiceRuntime.recognition.stop()
    } catch {
      /* already stopped */
    }
    voiceRuntime.recognition = null
  }
  voiceRuntime.status = 'idle'
  _notify()
}

// ── Mic button HTML helper ─────────────────────────────────────────────────────
export function renderMicButton(fieldId: string): string {
  if (!isVoiceInputSupported()) return ''
  const blocked = !_isVoiceAllowed() || isHipaaField(fieldId)
  const listening = voiceRuntime.status === 'listening'
  const label = listening ? 'Stop recording' : 'Start voice input'
  return [
    `<button type="button"`,
    `  class="mic-btn${listening ? ' mic-btn--active' : ''}${blocked ? ' mic-btn--disabled' : ''}"`,
    `  data-voice-field="${fieldId}"`,
    `  aria-label="${label}"`,
    blocked ? '  disabled title="Voice input disabled"' : '',
    `>`,
    listening ? '&#9209;' : '&#127908;',
    `</button>`,
  ]
    .filter(Boolean)
    .join('\n')
}
