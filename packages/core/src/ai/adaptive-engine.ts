// ── ADAPTIVE ENGINE ────────────────────────────────────────────────────────────
// Observes user navigation and record interactions.
// Proposes layout changes to state.adaptiveSuggestions for explicit user approval.
// Never auto-applies any change — user must accept or dismiss every suggestion.

import { getState, setState } from '../state.js'
import { auditLog } from '../security/audit.js'
import { LS_PINNED_VIEWS_KEY } from '../constants.js'

type AnyRecord = Record<string, unknown>

export interface AdaptiveSuggestion {
  id: string
  type: 'pin_view' | 'reorder_sidebar' | 'add_widget' | 'focus_store'
  label: string
  description: string
  payload: unknown
  proposedAt: string
  confidence: number
}

// ── Usage observation buffers ─────────────────────────────────────────────────
const _navHistory: Array<{ view: string; ts: number }> = []
const _recordOpenHistory: Array<{ store: string; id: string; ts: number }> = []
const MAX_HISTORY = 50

export function recordNavEvent(view: string): void {
  _navHistory.push({ view, ts: Date.now() })
  if (_navHistory.length > MAX_HISTORY) _navHistory.shift()
  _analyzePatterns()
}

export function recordRecordOpen(store: string, id: string): void {
  _recordOpenHistory.push({ store, id, ts: Date.now() })
  if (_recordOpenHistory.length > MAX_HISTORY) _recordOpenHistory.shift()
}

// ── Pattern analysis ──────────────────────────────────────────────────────────
function _analyzePatterns(): void {
  if (_navHistory.length < 5) return
  const recent = _navHistory.slice(-10)
  const freq: Record<string, number> = {}
  for (const { view } of recent) freq[view] = (freq[view] ?? 0) + 1
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1])
  const top = entries[0]
  if (!top || top[1] < 4) return
  const [topView, count] = top
  const state = getState()
  const already = (state.adaptiveSuggestions as AdaptiveSuggestion[]).find(
    (s) => s.type === 'pin_view' && (s.payload as AnyRecord)['view'] === topView,
  )
  if (already) return
  _proposeSuggestion({
    type: 'pin_view',
    label: `Pin "${topView}" to top`,
    description: `You frequently visit ${topView}. Pin it for faster access.`,
    payload: { view: topView },
    confidence: Math.min(count / 10, 0.95),
  })
}

// ── Proposal helpers ───────────────────────────────────────────────────────────
function _uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function _proposeSuggestion(params: Omit<AdaptiveSuggestion, 'id' | 'proposedAt'>): void {
  const suggestion: AdaptiveSuggestion = {
    id: _uid(),
    proposedAt: new Date().toISOString(),
    ...params,
  }
  const state = getState()
  const current = state.adaptiveSuggestions as AdaptiveSuggestion[]
  setState({ adaptiveSuggestions: [...current, suggestion] })
  auditLog('adaptive_suggestion_proposed', {
    id: suggestion.id,
    type: suggestion.type,
    label: suggestion.label,
  })
}

// Public entry point for AI tool calls that propose suggestions
export function _proposeSuggestionFromAI(
  params: Omit<AdaptiveSuggestion, 'id' | 'proposedAt'>,
): AdaptiveSuggestion {
  const suggestion: AdaptiveSuggestion = {
    id: _uid(),
    proposedAt: new Date().toISOString(),
    ...params,
  }
  const state = getState()
  const current = state.adaptiveSuggestions as AdaptiveSuggestion[]
  setState({ adaptiveSuggestions: [...current, suggestion] })
  auditLog('adaptive_suggestion_proposed', {
    id: suggestion.id,
    type: suggestion.type,
    label: suggestion.label,
    source: 'ai_tool',
  })
  return suggestion
}

// ── Accept / dismiss (explicit user action required) ──────────────────────────

export function acceptSuggestion(id: string): void {
  const state = getState()
  const suggestions = state.adaptiveSuggestions as AdaptiveSuggestion[]
  const suggestion = suggestions.find((s) => s.id === id)
  if (!suggestion) return
  setState({ adaptiveSuggestions: suggestions.filter((s) => s.id !== id) })
  auditLog('adaptive_suggestion_accepted', { id, type: suggestion.type })
  // Apply accepted suggestion (only non-destructive preference changes)
  if (suggestion.type === 'pin_view') {
    const payload = suggestion.payload as AnyRecord
    const pinned = _getPinnedViews()
    if (!pinned.includes(String(payload['view']))) {
      try {
        localStorage.setItem(LS_PINNED_VIEWS_KEY, JSON.stringify([...pinned, payload['view']]))
      } catch {
        /* storage may be unavailable */
      }
    }
  }
}

export function dismissSuggestion(id: string): void {
  const state = getState()
  const suggestions = state.adaptiveSuggestions as AdaptiveSuggestion[]
  const suggestion = suggestions.find((s) => s.id === id)
  if (!suggestion) return
  setState({ adaptiveSuggestions: suggestions.filter((s) => s.id !== id) })
  auditLog('adaptive_suggestion_dismissed', {
    id,
    type: suggestion.type,
  })
}

export function getPendingSuggestions(): AdaptiveSuggestion[] {
  return getState().adaptiveSuggestions as AdaptiveSuggestion[]
}

// ── Pinned views (non-sensitive localStorage preference) ───────────────────────
function _getPinnedViews(): string[] {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(LS_PINNED_VIEWS_KEY) : null
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function getPinnedViews(): string[] {
  return _getPinnedViews()
}
