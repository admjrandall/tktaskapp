// ── AI UI — chat panel, workspace, model picker, message flow ─────────────────
// Owns all rendering and event binding for the AI surfaces.
// Imports: ai-runtime (state + callBackend), ai-tools (executor + routing),
//          ai-settings (wizard guard). Nothing in ai-runtime or ai-tools
//          imports from here — no circular deps.

import { escH, formatRelative } from '../utils.js'
import { Icons } from '../ui/icons.js'
import { getState, setState, navigate, showConfirm, showToast as _showToast } from '../state.js'
import type { AppState as _AppState } from '../state.js'
import { patchInnerHTML } from '../render-utils.js'
import { isAITierAllowed, isOTOnlyMode } from '../deployment-policy.js'
import {
  aiRuntime,
  STATIC_MODELS,
  modelChipLabel,
  backendSubtitle,
  backendLabel,
  activeModelId,
  preferredModelId,
  fetchOllamaModels,
  selectModel,
  startAILoad,
  callBackend,
  setActiveConversation,
  saveConversationMessages,
} from './ai-runtime.js'
import { aiPrefs } from './ai-prefs.js'
import {
  buildSystemPrompt,
  handleModelOutput,
  applyPendingAction,
  setAIToolsHooks,
  extractToolCall,
} from './ai-tools.js'
import {
  aiNeedsOnboarding as _aiNeedsOnboarding,
  openNanoDownloadModal,
  isNanoModalOpen,
} from './ai-settings.js'

type _AnyRecord = Record<string, unknown>

// ── Hook injection ─────────────────────────────────────────────────────────────
let _appRenderWorkspace: (view: string) => void = () => {}
let _setSettingsSection: (s: string) => void = () => {}
let _openAIWizard: (step?: number) => void = () => {}

export function setAIUIHooks(hooks: {
  appRenderWorkspace: (view: string) => void
  setSettingsSection: (s: string) => void
  openAIWizard: (step?: number) => void
}): void {
  _appRenderWorkspace = hooks.appRenderWorkspace
  _setSettingsSection = hooks.setSettingsSection
  _openAIWizard = hooks.openAIWizard
}

// Wire the SCHEMAS and UI callbacks into ai-tools. Called once at init by
// main.ts after SCHEMAS are available.
export function setAIUISchemas(
  schemas: Record<string, { fields: Array<{ key: string; type: string; store?: string }> }>,
): void {
  setAIToolsHooks({
    SCHEMAS: schemas,
    streamToBubble,
    finalRender: (ctx) => {
      finalRender(ctx)
    },
  })
}

// ── Streaming bubble helper ────────────────────────────────────────────────────
const _TOOL_STREAM_LABELS: Record<string, string> = {
  query_records: 'Searching records…',
  count_records: 'Counting records…',
  summarize_record: 'Summarizing record…',
  answer_question: 'Looking up information…',
  create_record: 'Preparing to create…',
  update_record: 'Preparing to update…',
  delete_record: 'Preparing to delete…',
  navigate: 'Navigating…',
  list_files: 'Listing files…',
  get_running_timer: 'Checking timer…',
  start_timer: 'Preparing timer action…',
  log_communication: 'Preparing log entry…',
  attach_file: 'Preparing attachment…',
}

export function streamToBubble(text: string): void {
  let displayHtml: string
  const jsonIdx = text.indexOf('{"tool"')
  if (jsonIdx >= 0) {
    const prose = text.slice(0, jsonIdx).trimEnd()
    const tc = extractToolCall(text)
    const toolName = tc ? String(tc['tool']) : ''
    const label = _TOOL_STREAM_LABELS[toolName] ?? 'Working…'
    displayHtml =
      (prose ? escH(prose) + '<br>' : '') +
      `<span style="font-style:italic;opacity:.65">${escH(label)}</span>`
  } else if (text.trimStart().startsWith('{')) {
    displayHtml = `<span style="font-style:italic;opacity:.65">Working…</span>`
  } else {
    displayHtml = escH(text)
  }
  const html =
    displayHtml +
    '<span class="spinner" style="width:10px;height:10px;margin-left:4px;vertical-align:middle"></span>'
  document.querySelectorAll('[id^="streaming-bubble"]').forEach((el) => {
    el.innerHTML = patchInnerHTML(html)
  })
}

// ── Status render ──────────────────────────────────────────────────────────────
export function renderModelChip(): string {
  if (!aiRuntime.ready) return ''
  const chip = modelChipLabel()
  if (!chip) return ''
  return `<span title="${escH(backendSubtitle())}" style="display:inline-flex;align-items:center;gap:.375rem;padding:.25rem .625rem;border-radius:999px;background:var(--bg-base);border:1px solid var(--border-subtle);font-size:.75rem;font-weight:500;color:var(--text-secondary);white-space:nowrap"><span style="width:6px;height:6px;border-radius:50%;background:#10b981;flex-shrink:0"></span>${escH(chip)}</span>`
}

export function renderAIStatus(): string {
  if (aiRuntime.ready)
    return `<span class="ai-status"><span class="ai-pulse"></span> ${backendLabel()}</span>`
  if (aiRuntime.loadStarted) {
    const extra =
      aiRuntime.backend === 'webllm' && aiRuntime.webllmLoadProgress > 0
        ? ` ${Math.round(aiRuntime.webllmLoadProgress * 100)}%`
        : ''
    return `<span class="ai-status"><span class="ai-pulse loading"></span> Loading…${extra}</span>`
  }
  return `<span class="ai-status"><span class="ai-pulse" style="background:var(--border-default);animation:none"></span> Not loaded</span>`
}

// ── Panel & workspace renderers ───────────────────────────────────────────────
export function renderAIPanel(open: boolean): string {
  if (!open || getState().currentView === 'ai') return ''
  return `<div class="panel open" id="ai-panel">
    <div class="panel-header">
      <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;min-width:0">
        <span style="font-weight:600">Task App AI</span>
        ${aiRuntime.ready ? renderModelChip() : `<div style="width:8px;height:8px;border-radius:50%;background:${aiRuntime.loadStarted ? '#f59e0b' : '#64748b'};flex-shrink:0${aiRuntime.loadStarted ? ';animation:pulse 2s infinite' : ''}"></div>${renderAIStatus()}`}
      </div>
      <div style="display:flex;gap:.375rem">
        <button class="btn btn-ghost btn-icon btn-sm" id="ai-expand-btn" title="Full chat">${Icons.ExternalLink(16)}</button>
        <button class="btn btn-ghost btn-icon btn-sm" id="ai-panel-close">${Icons.Close(18)}</button>
      </div>
    </div>
    <div class="panel-body" style="display:flex;flex-direction:column">${renderChatBody(true)}</div>
  </div>`
}

function renderConversationSidebar(): string {
  const state = getState()
  const convs = (
    state.conversations as Array<{
      id: string
      title?: string
      updatedAt?: string
      createdAt?: string
    }>
  )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || '').getTime() -
        new Date(a.updatedAt || a.createdAt || '').getTime(),
    )

  const items = convs.length
    ? convs
        .map((c) => {
          const isActive = c.id === state.activeConversationId
          const title = c.title || 'New Conversation'
          const displayTitle = title.length > 40 ? title.slice(0, 40) + '…' : title
          return `<div class="conv-item${isActive ? ' active' : ''}" data-conv-id="${escH(c.id)}" style="display:flex;align-items:center;gap:.375rem;padding:.5rem .625rem;border-radius:var(--radius-sm);cursor:pointer;${isActive ? 'background:var(--bg-base);font-weight:600;' : ''}margin-bottom:.125rem">
          <div style="flex:1;min-width:0">
            <div style="font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" data-conv-title="${escH(c.id)}">${escH(displayTitle)}</div>
            <div style="font-size:.7rem;color:var(--text-tertiary);margin-top:.125rem">${formatRelative(c.updatedAt || c.createdAt)}</div>
          </div>
          <button class="btn btn-ghost btn-icon" style="width:20px;height:20px;flex-shrink:0;font-size:.7rem;color:var(--text-tertiary)" data-conv-del="${escH(c.id)}" title="Delete conversation" aria-label="Delete conversation">×</button>
        </div>`
        })
        .join('')
    : `<p style="font-size:.8rem;color:var(--text-tertiary);padding:.5rem .625rem;line-height:1.5">No past conversations. Start chatting to create one.</p>`

  return `<div style="width:220px;flex-shrink:0;border-right:1px solid var(--border-subtle);display:flex;flex-direction:column;overflow:hidden">
    <div style="padding:.625rem .625rem .5rem;border-bottom:1px solid var(--border-subtle)">
      <button class="btn btn-primary btn-sm" style="width:100%" id="ai-new-conv">${Icons.Plus(14)} New Conversation</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:.375rem .375rem">${items}</div>
  </div>`
}

export function renderAIChatWorkspace(): string {
  return `<div style="display:flex;flex-direction:column;height:100%">
    <div class="workspace-toolbar" style="justify-content:space-between">
      <div style="display:flex;align-items:center;gap:.625rem;flex-wrap:wrap"><span style="font-weight:600">AI Chat</span>${renderModelChip()}${!aiRuntime.ready ? renderAIStatus() : ''}</div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary btn-sm" id="ai-clear">Clear</button>
        ${!aiRuntime.ready && !aiRuntime.loadStarted && aiPrefs.hasCompletedOnboarding ? `<button class="btn btn-primary btn-sm" id="ai-load-btn">Connect AI</button>` : ''}
        ${!aiPrefs.hasCompletedOnboarding ? `<button class="btn btn-primary btn-sm" id="ai-open-wizard-toolbar">Set up AI</button>` : ''}
      </div>
    </div>
    <div style="flex:1;display:flex;overflow:hidden">${renderConversationSidebar()}<div style="flex:1;overflow:hidden;display:flex;flex-direction:column">${renderChatBody(false)}</div></div>
  </div>`
}

export function renderChatBody(compact: boolean): string {
  const ns = compact ? 'panel' : 'ws'
  const id = (name: string) => `${name}-${ns}`
  const msgs = aiRuntime.history
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const isU = m.role === 'user'
      return `<div class="chat-message ${isU ? 'user' : 'assistant'}">${!isU ? `<div class="avatar avatar-sm" style="background:var(--indigo-600);color:#fff;flex-shrink:0">N</div>` : ''}<div class="chat-bubble">${escH(m.content)}</div></div>`
    })
    .join('')

  const pendingUI = aiRuntime.pendingAction
    ? `
    <div class="chat-message assistant">
      <div class="avatar avatar-sm" style="background:#f59e0b;color:#fff;flex-shrink:0">!</div>
      <div class="chat-bubble" style="background:#fef3c7;border-color:#fcd34d;color:#78350f;max-width:90%">
        <div style="font-weight:600;margin-bottom:.375rem">Apply this action?</div>
        <div style="font-size:.8125rem;line-height:1.5;margin-bottom:.625rem;white-space:pre-wrap">${escH(aiRuntime.pendingAction.summary)}</div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-primary btn-sm" id="${id('ai-action-yes')}">Yes, apply</button>
          <button class="btn btn-secondary btn-sm" id="${id('ai-action-no')}">No, cancel</button>
        </div>
      </div>
    </div>`
    : ''

  const notLoadedUI = !aiRuntime.ready
    ? `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center">
      ${
        aiRuntime.loadStarted
          ? `
        <div style="display:flex;flex-direction:column;align-items:center;gap:.75rem">
          <div class="spinner" style="width:48px;height:48px;border-width:4px"></div>
          <div style="font-weight:600;font-size:1rem">Connecting AI…</div>
          <div id="ai-progress-text" style="font-size:.875rem;color:var(--text-secondary);max-width:340px;line-height:1.5">Starting…</div>
          ${aiPrefs.tier === 'browser' ? `<div style="font-size:.75rem;color:var(--text-tertiary);max-width:300px;line-height:1.5">${aiPrefs.browser?.modelId === 'nano' ? 'Connecting to Gemini Nano. First run may take several minutes while Chrome downloads the model (~4 GB).' : `First run downloads ${aiPrefs.browser?.modelId === 'gemma-e4b' ? '~1.5GB' : '~500MB'}. Subsequent loads are instant from cache.`}</div>` : ''}
        </div>`
          : `
        <div style="max-width:360px">
          <div style="font-weight:600;font-size:1rem;margin-bottom:.5rem">Task App AI</div>
          ${
            aiPrefs.hasCompletedOnboarding
              ? `
            <div style="font-size:.8rem;color:var(--text-secondary);line-height:1.6;margin-bottom:1.25rem">
              ${isOTOnlyMode() ? 'Gemini Nano is not running. Click below to load it.' : 'Your AI is set up but not running. Click below to connect, or change setup in Settings.'}
            </div>
            <button class="btn btn-primary" id="ai-load-btn${compact ? '-panel' : ''}" style="width:100%;margin-bottom:.625rem">${isOTOnlyMode() ? 'Load Gemini Nano' : 'Connect AI'}</button>
            ${!isOTOnlyMode() ? `<button class="btn btn-secondary" id="ai-settings-btn${compact ? '-panel' : ''}" style="width:100%">AI Settings</button>` : ''}
          `
              : `
            <div style="font-size:.8rem;color:var(--text-secondary);line-height:1.6;margin-bottom:1.25rem">
              ${isOTOnlyMode() ? 'Chrome Built-in AI (Gemini Nano) is available in this offline build. Enable it to start chatting.' : 'AI is opt-in. Pick how it runs (in-browser, Ollama, or cloud) and which model to use.'}
            </div>
            <button class="btn btn-primary" id="ai-open-wizard-empty${compact ? '-panel' : ''}" style="width:100%">${isOTOnlyMode() ? 'Enable Gemini Nano' : 'Set up AI'}</button>
          `
          }
        </div>`
      }
    </div>`
    : ''

  const suggests =
    aiRuntime.ready && aiRuntime.history.length === 0 && !aiRuntime.pendingAction
      ? `
    <div style="padding:1rem;display:flex;flex-direction:column;gap:.5rem">
      <div style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary);margin-bottom:.25rem">Try</div>
      ${[
        'Create a task named Task 1 due Friday',
        'How many overdue tasks?',
        'Show all active clients',
        'Start a timer on Task 1',
        'Open the Projects view',
      ]
        .map(
          (s) =>
            `<button class="btn btn-secondary btn-sm" style="text-align:left;justify-content:flex-start" data-suggest="${escH(s)}">${escH(s)}</button>`,
        )
        .join('')}
    </div>`
      : ''

  return `<div style="display:flex;flex-direction:column;flex:1;overflow:hidden">
    <div class="chat-messages" id="${id('chat-messages')}">
      ${notLoadedUI}${suggests}${msgs}${pendingUI}
      ${aiRuntime.streaming ? `<div class="chat-message assistant"><div class="avatar avatar-sm" style="background:var(--indigo-600);color:#fff;flex-shrink:0">N</div><div class="chat-bubble" id="${id('streaming-bubble')}"><span class="thinking"><span class="thinking-dots"><span></span><span></span><span></span></span>Thinking…${aiPrefs.tier === 'browser' ? '<span style="display:block;font-size:.75rem;color:var(--text-tertiary);margin-top:.375rem">Built-in AI can take 10–30 s on first use</span>' : ''}</span></div></div>` : ''}
    </div>
    <div class="chat-input-card">
      <textarea class="chat-input-flat" id="${id('chat-input')}" placeholder="${aiRuntime.ready ? 'Ask Task App AI…' : 'Connect AI first'}" rows="1" ${!aiRuntime.ready || aiRuntime.pendingAction ? 'disabled' : ''}></textarea>
      <div class="chat-input-bar">
        <div style="flex:1"></div>
        ${renderModelPicker(ns)}
        <button class="btn btn-primary btn-icon btn-sm" id="${id('chat-send')}" ${!aiRuntime.ready || aiRuntime.streaming || aiRuntime.pendingAction ? 'disabled' : ''}>${Icons.Send()}</button>
      </div>
    </div>
  </div>`
}

// ── Model picker ───────────────────────────────────────────────────────────────
export function renderModelPicker(ns: string): string {
  const open = aiRuntime.modelPickerOpen === ns
  const label = aiRuntime.ready ? modelChipLabel() : aiRuntime.loadStarted ? 'Loading…' : 'No model'
  const dot = aiRuntime.ready ? '#10b981' : aiRuntime.loadStarted ? '#f59e0b' : '#64748b'
  return `<div style="position:relative">
    <button type="button" class="model-picker-btn" id="model-picker-${ns}" ${aiRuntime.streaming ? 'disabled' : ''}>
      <span style="width:6px;height:6px;border-radius:50%;background:${dot};flex-shrink:0"></span>
      <span style="font-size:.75rem;font-weight:500">${escH(label || 'Choose model')}</span>
      <span style="font-size:.7rem;opacity:.7">▾</span>
    </button>
    ${open ? renderModelDropdown(ns) : ''}
  </div>`
}

function renderModelDropdown(ns: string): string {
  const active = activeModelId()
  const pref = preferredModelId()
  const ollamaList = aiRuntime.ollamaModelsCache || []
  const sections = [
    ...(isAITierAllowed('browser')
      ? [
          { title: 'Chrome Built-in', items: STATIC_MODELS.filter((m) => m.backend === 'nano') },
          {
            title: 'In-browser (WebGPU)',
            items: STATIC_MODELS.filter((m) => m.backend === 'webllm'),
          },
        ]
      : []),
    ...(isAITierAllowed('ollama')
      ? [
          {
            title: ollamaList.length
              ? `Local/Internal AI (${ollamaList.length})`
              : 'Local/Internal AI (not detected)',
            items: ollamaList as typeof STATIC_MODELS,
          },
        ]
      : []),
  ]
  const items = sections
    .map((sec) => {
      if (!sec.items.length) {
        return `<div style="padding:.375rem .75rem;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary);font-weight:600">${escH(sec.title)}</div>
      <div style="padding:.25rem .75rem .5rem;font-size:.75rem;color:var(--text-tertiary);font-style:italic">Run "ollama serve" to enumerate</div>`
      }
      return (
        `<div style="padding:.5rem .75rem .25rem;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary);font-weight:600">${escH(sec.title)}</div>` +
        sec.items
          .map((m) => {
            const isActive = m.id === active
            const isPref = m.id === pref && !isActive
            return `<button type="button" class="model-option" data-model-id="${escH(m.id)}" style="${isActive ? 'background:var(--bg-base);' : ''}">
          <div style="display:flex;flex-direction:column;align-items:flex-start;gap:.125rem;flex:1;min-width:0">
            <div style="font-size:.8125rem;font-weight:500;color:var(--text-primary)">${escH(m.label)}${isActive ? ' <span style="font-size:.7rem;color:#10b981;font-weight:600;margin-left:.25rem">● running</span>' : isPref ? ' <span style="font-size:.7rem;color:var(--text-tertiary);margin-left:.25rem">saved</span>' : ''}</div>
            ${m.size ? `<div style="font-size:.7rem;color:var(--text-tertiary)">${escH(m.size)}</div>` : ''}
          </div>
        </button>`
          })
          .join('')
      )
    })
    .join('')
  return `<div class="model-dropdown" id="model-dropdown-${ns}">${items}</div>`
}

// ── Bind functions ─────────────────────────────────────────────────────────────

// Prevents double-triggering openNanoDownloadModal during async availability check
let _autoNanoTriggering = false

function ctxId(name: string, ctx: string): HTMLElement | null {
  const ns = ctx === 'panel' ? 'panel' : 'ws'
  return document.getElementById(`${name}-${ns}`) || document.getElementById(name)
}

export function bindAIPanel(): void {
  document.getElementById('ai-panel-close')?.addEventListener('click', () => {
    setState({ aiPanelOpen: false })
  })
  document.getElementById('ai-expand-btn')?.addEventListener('click', () => {
    setState({ aiPanelOpen: false, currentView: 'ai' })
  })
  document.getElementById('ai-load-btn-panel')?.addEventListener('click', () => {
    if (isOTOnlyMode()) _openAIWizard(1)
    else void startAILoad()
  })
  document.getElementById('ai-settings-btn-panel')?.addEventListener('click', () => {
    _setSettingsSection('ai')
    setState({ aiPanelOpen: false, currentView: 'settings' })
  })
  document.getElementById('ai-open-wizard-empty-panel')?.addEventListener('click', () => {
    _openAIWizard(1)
  })
  document.querySelectorAll<HTMLElement>('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('[data-suggest]').forEach((b) => {
        b.disabled = true
        b.style.opacity = '.5'
      })
      void sendAIMessage((btn.dataset as DOMStringMap & { suggest: string }).suggest, 'panel')
    })
  })
  bindActionButtons('panel')
  bindChatInput('panel')
}

export function bindAIChatWorkspace(): void {
  // In OT mode, auto-open the Nano modal when AI is enabled but not yet loaded.
  // Fires each time the user navigates to the AI view, so they are never silently stuck.
  if (
    isOTOnlyMode() &&
    aiPrefs.hasCompletedOnboarding &&
    aiPrefs.tier === 'browser' &&
    !aiRuntime.ready &&
    !aiRuntime.loadStarted &&
    !isNanoModalOpen() &&
    !_autoNanoTriggering
  ) {
    _autoNanoTriggering = true
    void openNanoDownloadModal().finally(() => {
      _autoNanoTriggering = false
    })
  }

  // ── Conversation sidebar bindings ──────────────────────────────────────
  document.getElementById('ai-new-conv')?.addEventListener('click', async () => {
    const { dbCreate } = await import('../storage/db.js')
    const rec = (await dbCreate('conversations', {
      title: 'New Conversation',
      messages: [],
    })) as { id: string }
    const { getState: gs, setState: ss, reloadData } = await import('../state.js')
    const state = gs()
    ss({ conversations: [...state.conversations, rec], activeConversationId: rec.id })
    reloadData()
    setActiveConversation(rec.id)
    _appRenderWorkspace('ai')
  })

  document.querySelectorAll<HTMLElement>('[data-conv-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-conv-del]')) return
      const id = (el.dataset as DOMStringMap & { convId: string }).convId
      setState({ activeConversationId: id })
      setActiveConversation(id)
      _appRenderWorkspace('ai')
    })
  })

  document.querySelectorAll<HTMLElement>('[data-conv-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = (btn.dataset as DOMStringMap & { convDel: string }).convDel
      showConfirm('Delete this conversation?', async () => {
        const { _idbDeleteRecord } = await import('../storage/idb-data.js')
        await _idbDeleteRecord('conversations', id)
        const { getState: gs, setState: ss } = await import('../state.js')
        const state = gs()
        const remaining = (state.conversations as Array<{ id: string }>).filter((c) => c.id !== id)
        const nextId = remaining.length > 0 ? remaining[0]!.id : null
        ss({ conversations: remaining, activeConversationId: nextId })
        if (aiRuntime.conversationId === id) {
          setActiveConversation(nextId)
        }
        _appRenderWorkspace('ai')
      })
    })
  })

  // Inline rename on double-click
  document.querySelectorAll<HTMLElement>('[data-conv-title]').forEach((el) => {
    el.addEventListener('dblclick', () => {
      const convId = (el.dataset as DOMStringMap & { convTitle: string }).convTitle
      const oldText = el.textContent || ''
      const input = document.createElement('input')
      input.value = oldText.replace(/…$/, '')
      input.style.cssText =
        'font-size:.8125rem;width:100%;border:1px solid var(--accent);border-radius:4px;padding:0 .25rem;background:var(--bg-surface)'
      el.replaceWith(input)
      input.focus()
      input.select()
      const save = async () => {
        const newTitle = input.value.trim() || 'New Conversation'
        const { _idbPutRecord } = await import('../storage/idb-data.js')
        const { _getDbKey } = await import('../storage/db.js')
        const { getState: gs, setState: ss } = await import('../state.js')
        const key = _getDbKey()
        const state = gs()
        const convs = state.conversations as Array<{ id: string; [k: string]: unknown }>
        const conv = convs.find((c) => c.id === convId)
        if (conv && key) {
          conv.title = newTitle
          conv.updatedAt = new Date().toISOString()
          await _idbPutRecord('conversations', conv, key)
          ss({ conversations: [...convs] })
        }
        _appRenderWorkspace('ai')
      }
      input.addEventListener('blur', () => void save())
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault()
          void save()
        }
        if (ev.key === 'Escape') _appRenderWorkspace('ai')
      })
    })
  })

  document.getElementById('ai-load-btn')?.addEventListener('click', () => {
    if (isOTOnlyMode()) _openAIWizard(1)
    else void startAILoad()
  })
  document.getElementById('ai-settings-btn')?.addEventListener('click', () => {
    _setSettingsSection('ai')
    navigate('settings')
  })
  document.getElementById('ai-open-wizard-empty')?.addEventListener('click', () => {
    _openAIWizard(1)
  })
  document.getElementById('ai-open-wizard-toolbar')?.addEventListener('click', () => {
    _openAIWizard(1)
  })
  document.getElementById('ai-clear')?.addEventListener('click', () => {
    aiRuntime.history = []
    aiRuntime.pendingAction = null
    _appRenderWorkspace('ai')
  })
  document.querySelectorAll<HTMLElement>('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('[data-suggest]').forEach((b) => {
        b.disabled = true
        b.style.opacity = '.5'
      })
      void sendAIMessage((btn.dataset as DOMStringMap & { suggest: string }).suggest, 'workspace')
    })
  })
  bindActionButtons('workspace')
  bindChatInput('workspace')
}

function bindActionButtons(ctx: string): void {
  ctxId('ai-action-yes', ctx)?.addEventListener('click', () => applyPendingAction(true, ctx))
  ctxId('ai-action-no', ctx)?.addEventListener('click', () => applyPendingAction(false, ctx))
}

function bindChatInput(ctx: string): void {
  const input = ctxId('chat-input', ctx) as HTMLTextAreaElement | null
  const send = ctxId('chat-send', ctx)
  const doSend = () => {
    const t = input?.value?.trim()
    if (!t || !aiRuntime.ready || aiRuntime.streaming) return
    if (input) {
      input.value = ''
      input.style.height = ''
    }
    void sendAIMessage(t, ctx)
  }
  send?.addEventListener('click', doSend)
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend()
    }
  })
  input?.addEventListener('input', () => {
    if (input) {
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 140) + 'px'
    }
  })
  bindModelPicker(ctx)
}

function bindModelPicker(ctx: string): void {
  const ns = ctx === 'panel' ? 'panel' : 'ws'
  const btn = document.getElementById(`model-picker-${ns}`)
  btn?.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (aiRuntime.modelPickerOpen === ns) {
      aiRuntime.modelPickerOpen = null
      rerenderChatInputArea(ctx)
      return
    }
    aiRuntime.modelPickerOpen = ns
    rerenderChatInputArea(ctx)
    if (!aiRuntime.ollamaModelsCache) {
      await fetchOllamaModels(true)
      if (aiRuntime.modelPickerOpen === ns) rerenderChatInputArea(ctx)
    }
    setTimeout(() => {
      const closeFn = (ev: Event) => {
        const target = ev.target as HTMLElement
        if (!target.closest(`#model-dropdown-${ns}`) && !target.closest(`#model-picker-${ns}`)) {
          aiRuntime.modelPickerOpen = null
          document.removeEventListener('click', closeFn)
          rerenderChatInputArea(ctx)
        }
      }
      document.addEventListener('click', closeFn)
    }, 0)
  })
  document.querySelectorAll<HTMLElement>(`#model-dropdown-${ns} [data-model-id]`).forEach((opt) => {
    opt.addEventListener('click', async (e) => {
      e.stopPropagation()
      const modelId = (opt.dataset as DOMStringMap & { modelId: string }).modelId
      const entry =
        STATIC_MODELS.find((m) => m.id === modelId) ||
        ((aiRuntime.ollamaModelsCache || []).find((m) => m['id'] === modelId) as
          | (typeof STATIC_MODELS)[0]
          | undefined)
      if (!entry) return
      aiRuntime.modelPickerOpen = null
      await selectModel(entry)
    })
  })
}

function rerenderChatInputArea(ctx: string): void {
  if (ctx === 'panel') {
    const pb = document.querySelector('#ai-panel .panel-body')
    if (pb) {
      const oldInput = ctxId('chat-input', 'panel') as HTMLTextAreaElement | null
      const val = oldInput?.value || ''
      pb.innerHTML = patchInnerHTML(renderChatBody(true))
      bindAIPanel()
      const newInput = ctxId('chat-input', 'panel') as HTMLTextAreaElement | null
      if (newInput) {
        newInput.value = val
        newInput.focus()
      }
    }
  } else {
    const oldInput = ctxId('chat-input', 'workspace') as HTMLTextAreaElement | null
    const val = oldInput?.value || ''
    _appRenderWorkspace('ai')
    const newInput = ctxId('chat-input', 'workspace') as HTMLTextAreaElement | null
    if (newInput) {
      newInput.value = val
      newInput.focus()
    }
  }
}

// ── Chat helpers ───────────────────────────────────────────────────────────────
function finalRender(ctx: string): void {
  if (ctx === 'panel') {
    const pb = document.querySelector('#ai-panel .panel-body')
    if (pb) {
      pb.innerHTML = patchInnerHTML(renderChatBody(true))
      bindAIPanel()
    }
  } else {
    _appRenderWorkspace('ai')
  }
}

function refreshChat(ctx: string): void {
  if (ctx === 'panel') {
    const pb = document.querySelector('#ai-panel .panel-body')
    if (pb) {
      pb.innerHTML = patchInnerHTML(renderChatBody(true))
      bindAIPanel()
    }
  } else {
    const msgs = ctxId('chat-messages', 'workspace')
    if (msgs && !aiRuntime.streaming) {
      _appRenderWorkspace('ai')
    } else if (msgs && aiRuntime.streaming) {
      const userMsg = aiRuntime.history[aiRuntime.history.length - 1]
      if (userMsg?.role === 'user') {
        msgs.innerHTML = patchInnerHTML(
          msgs.innerHTML +
            `<div class="chat-message user"><div class="chat-bubble">${escH(userMsg.content)}</div></div>
        <div class="chat-message assistant"><div class="avatar avatar-sm" style="background:var(--indigo-600);color:#fff;flex-shrink:0">N</div><div class="chat-bubble" id="streaming-bubble-ws"><span class="thinking"><span class="thinking-dots"><span></span><span></span><span></span></span>Thinking…</span></div></div>`,
        )
        msgs.scrollTop = msgs.scrollHeight
      }
    }
  }
}

function scrollChatBottom(): void {
  setTimeout(() => {
    document.querySelectorAll('[id^="chat-messages"]').forEach((el) => {
      el.scrollTop = el.scrollHeight
    })
  }, 50)
}

// ── Send message ───────────────────────────────────────────────────────────────
export async function sendAIMessage(text: string, ctx: string): Promise<void> {
  if (aiRuntime.streaming || aiRuntime.pendingAction) return
  aiRuntime.streaming = true
  aiRuntime.history.push({ role: 'user', content: text })
  refreshChat(ctx)
  scrollChatBottom()
  try {
    if (!aiRuntime.ready) {
      aiRuntime.history.push({
        role: 'assistant',
        content: 'AI not connected yet. Click "Connect AI" to get started.',
      })
    } else {
      aiRuntime.abortController = new AbortController()
      const raw = await callBackend(
        buildSystemPrompt(),
        aiRuntime.history,
        streamToBubble,
        aiRuntime.abortController.signal,
      )
      await handleModelOutput(raw, ctx)
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      console.error('[AI]', err)
      aiRuntime.history.push({ role: 'assistant', content: `Error: ${(err as Error).message}` })
    }
  }
  aiRuntime.streaming = false
  aiRuntime.abortController = null
  // Persist conversation to IDB after every assistant reply
  void saveConversationMessages()
  finalRender(ctx)
  scrollChatBottom()
}
