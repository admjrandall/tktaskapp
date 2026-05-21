// ── APP BOOTSTRAP ─────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines ~7682–7851.
// MUST import trusted-types.js first — it patches innerHTML via a side-effect IIFE.
import './security/trusted-types.js'
import './styles/main.css'

import { _rawPolicy } from './security/trusted-types.js'
import {
  initTheme,
  initDensity,
  setState,
  getState,
  subscribe,
  reloadData,
  navigate,
  setAIHooks,
  showConfirm,
  showToast as _showToast,
  setTheme,
} from './state.js'
import type { AppState } from './state.js'
import {
  dbInit,
  dbDelete,
  checkDueDates,
  markNotificationRead,
  markAllNotificationsRead,
  softDelete,
  getAdapter,
  getStore,
  clearDbState,
  setDbAuditHook,
} from './storage/db.js'
import { _migrateLocalStorageToIDB, verifyPassword } from './security/vault.js'
import {
  loadSessionKey,
  cacheSessionKey,
  clearSessionKey,
  hasSessionSentinel,
} from './security/session.js'
import {
  auditLog,
  setAuditHooks,
  flushAuditBuffer,
  loadAuditLog,
  exportAuditCSV,
  exportAuditJSON,
  purgeAuditLog,
} from './security/audit.js'
import { setAuthIDBHooks, setAuthAuditHook } from './security/auth.js'
import {
  setMFAHooks,
  loadMFAStatus,
  enableTOTP,
  disableTOTP,
  generateNewTOTPSecret,
} from './security/mfa.js'
import { setWebAuthnHooks, loadPasskeys, addPasskey, removePasskey } from './security/webauthn.js'
import {
  fsInit,
  isFsReady,
  getFsLastSave,
  fsPickFile,
  fsWriteVault,
  fsUnlink,
} from './storage/fs.js'

// ── View imports ──────────────────────────────────────────────────────────────
import { renderSidebar, renderBottomTabs, bindSidebar, setSidebarFsHooks } from './views/sidebar.js'
import { renderTopbar, bindTopbar, setTopbarHooks } from './views/topbar.js'
import { renderDashboard, bindDashboard, setDashHooks, setDashAIHooks } from './views/dashboard.js'
import { renderWorkspaceView, bindWorkspaceView, setWorkspaceHooks } from './views/workspace.js'
import { renderCalendar, bindCalendar, setCalendarHooks } from './views/calendar.js'
import { renderTimeTracker, bindTimeTracker } from './views/time-tracker.js'
import {
  renderCommunications,
  bindCommunications,
  setCommunicationsHooks,
} from './views/communications.js'
import { renderReports, bindReports } from './views/reports.js'
import { renderTrash, bindTrash } from './views/trash.js'
import {
  renderSettings,
  bindSettings,
  setSettingsAIHooks,
  setSettingsFsHooks,
  setSettingsSection,
  setSettingsSecurityHooks,
} from './views/settings.js'
import {
  renderLibrary,
  bindLibrary,
  setLibraryHooks,
  setLibraryDocHooks,
  renderFileViewer,
  bindFileViewer,
} from './views/library.js'
import {
  setDocsHooks,
  setDocsAIHooks,
  setDocsStreamHook,
  saveDocument,
  closeDocumentEditor,
  renderDocModal,
  bindDocModal,
  _docOpenId,
  setDocOpenId,
  setDocDirty,
  setDocEditorActive,
} from './views/documents.js'
import {
  getSCHEMAS,
  renderRecordModal,
  bindRecordModal,
  setRecordModalHooks,
} from './views/record-modal.js'
import { setPCHooks } from './views/project-canvas.js'
import { setFilesHooks } from './views/files.js'

// ── Component imports ─────────────────────────────────────────────────────────
import {
  renderToast,
  renderConfirmDialog,
  bindConfirmDialog,
  renderCommandPalette,
  bindCommandPalette,
  renderNotifPanel,
  bindNotifPanel,
  setComponentsAIHooks,
} from './ui/components.js'

// ── AI imports ────────────────────────────────────────────────────────────────
import {
  aiRuntime,
  setRuntimeHooks,
  startAILoad,
  disconnectAI as resetAIConnection,
  callBackend,
  setActiveConversation,
} from './ai/ai-runtime.js'
import {
  renderAIPanel,
  bindAIPanel,
  renderAIChatWorkspace,
  bindAIChatWorkspace,
  setAIUIHooks,
  setAIUISchemas,
} from './ai/ai-ui.js'
import {
  renderAIWizard,
  bindAIWizard,
  openAIWizard,
  closeAIWizard,
  aiNeedsOnboarding,
  renderNanoDownloadModal,
  bindNanoDownloadModal,
  _aiWizard,
  _aiSecrets,
  setAIV2IDBHooks,
  setAISettingsHooks,
  aiSecretsLoad,
  aiSecretsSave,
  aiSecretsWipe,
  aiSecretsRefresh,
  BROWSER_MODELS,
  CLOUD_PROVIDERS,
  probeOllama,
  testCloudKey,
  aiCurrentMonthKey,
} from './ai/ai-settings.js'
import { aiPrefs, saveAIPrefs } from './ai/ai-prefs.js'
import { _idbLoadStore, _idbPutRecord, _idbDeleteRecord } from './storage/idb-data.js'
import { _getDbKey } from './storage/db.js'
import { isAITierAllowed } from './deployment-policy.js'

// ── Auth import ───────────────────────────────────────────────────────────────
import { renderAuth, bindAuth } from './security/auth.js'

// ── App lock + idle detection (SEC-01, NIST AC-11) ────────────────────────────
let _lockTimeoutMs = (() => {
  const raw = localStorage.getItem('taskapp_lock_timeout')
  const mins = raw !== null ? parseInt(raw, 10) : 15
  return mins > 0 ? mins * 60 * 1000 : 0
})()
let _idleTimer: ReturnType<typeof setTimeout> | null = null
export let _lastActivityAt = Date.now()

// Callback set during init — allows lockApp to re-show auth with same afterUnlock handler
let _onAuthSuccess: ((key: CryptoKey) => Promise<void>) | null = null

export function setLockTimeout(minutes: number): void {
  localStorage.setItem('taskapp_lock_timeout', String(minutes))
  _lockTimeoutMs = minutes > 0 ? minutes * 60 * 1000 : 0
  _resetIdleTimer()
}

export function _resetIdleTimer(): void {
  if (_idleTimer) {
    clearTimeout(_idleTimer)
    _idleTimer = null
  }
  if (!_lockTimeoutMs || !getState().authed) return
  _lastActivityAt = Date.now()
  _idleTimer = setTimeout(() => {
    lockApp('idle_timeout').catch(console.error)
  }, _lockTimeoutMs)
}

export async function lockApp(reason = 'manual'): Promise<void> {
  auditLog('app_locked', { reason })
  // Clear in-memory decrypted data
  clearDbState()
  await clearSessionKey().catch(() => {})
  // Clear File System Access handle so the next user on a shared device cannot
  // write to the previous user's vault file (H3 — FS handle cleared on logout).
  await fsUnlink().catch(() => {})
  // Disconnect AI
  try {
    void resetAIConnection()
  } catch {
    /* non-fatal */
  }
  try {
    await aiSecretsWipe()
  } catch {
    /* non-fatal */
  }
  // Clear idle timer
  if (_idleTimer) {
    clearTimeout(_idleTimer)
    _idleTimer = null
  }
  // Reset auth state
  setState({ authed: false, cryptoKey: null })
  // Show auth screen (use the app element — it must be in DOM at this point)
  const el = document.getElementById('app')
  if (!el) return
  el.innerHTML = await renderAuth()
  const handler = _onAuthSuccess
  bindAuth(el, async (key) => {
    await cacheSessionKey(key)
    if (handler) await handler(key)
  })
}

// ── App root element ──────────────────────────────────────────────────────────
const appEl = document.getElementById('app')!

// ── Global error boundary (OWASP A10 — unhandled-rejection / window.error) ───
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
  console.error('[unhandledrejection]', err.name, err.message)
  setState({
    toast: {
      id: Date.now(),
      message: 'An unexpected error occurred. Please reload.',
      type: 'error',
    },
  })
  event.preventDefault()
})

window.addEventListener('error', (event) => {
  console.error('[window.error]', event.message, event.filename, event.lineno)
  setState({
    toast: {
      id: Date.now(),
      message: 'An unexpected error occurred. Please reload.',
      type: 'error',
    },
  })
})

// ── appRenderWorkspace ────────────────────────────────────────────────────────
export function appRenderWorkspace(view: string): void {
  const state = getState()
  if (state.currentView !== view) {
    navigate(view)
    return
  }
  const container = document.getElementById('workspace-container')
  if (!container) {
    fullRender(state)
    return
  }

  let html = ''
  switch (view) {
    case 'dashboard':
      html = renderDashboard(state)
      break
    case 'clients':
    case 'departments':
    case 'projects':
    case 'tasks':
    case 'people':
    case 'standaloneNotes':
      html = renderWorkspaceView(view)
      break
    case 'calendar':
      html = renderCalendar(state)
      break
    case 'time':
      html = renderTimeTracker(state)
      break
    case 'communications':
      html = renderCommunications(state)
      break
    case 'reports':
      html = renderReports(state)
      break
    case 'ai':
      html = renderAIChatWorkspace()
      break
    case 'library':
      html = renderLibrary(state)
      break
    case 'settings':
      html = renderSettings(state)
      break
    case 'trash':
      html = renderTrash(state)
      break
    default:
      return
  }
  container.innerHTML = html

  switch (view) {
    case 'dashboard':
      bindDashboard(state)
      break
    case 'clients':
    case 'departments':
    case 'projects':
    case 'tasks':
    case 'people':
    case 'standaloneNotes':
      bindWorkspaceView(view)
      break
    case 'calendar':
      bindCalendar()
      break
    case 'time':
      bindTimeTracker()
      break
    case 'communications':
      bindCommunications(state)
      break
    case 'reports':
      bindReports(state)
      break
    case 'ai':
      bindAIChatWorkspace()
      break
    case 'library':
      bindLibrary()
      break
    case 'settings':
      bindSettings(state)
      break
    case 'trash':
      bindTrash()
      break
  }
}

// ── fullRender ────────────────────────────────────────────────────────────────
export function fullRender(state: AppState): void {
  const {
    currentView,
    aiPanelOpen,
    commandOpen,
    notifPanelOpen,
    toast,
    confirmDialog,
    recordModal,
    docModal,
    fileViewer,
  } = state

  let wsHtml = ''
  switch (currentView) {
    case 'dashboard':
      wsHtml = renderDashboard(state)
      break
    case 'clients':
    case 'departments':
    case 'projects':
    case 'tasks':
    case 'people':
    case 'standaloneNotes':
      wsHtml = renderWorkspaceView(currentView)
      break
    case 'calendar':
      wsHtml = renderCalendar(state)
      break
    case 'time':
      wsHtml = renderTimeTracker(state)
      break
    case 'communications':
      wsHtml = renderCommunications(state)
      break
    case 'reports':
      wsHtml = renderReports(state)
      break
    case 'ai':
      wsHtml = renderAIChatWorkspace()
      break
    case 'library':
      wsHtml = renderLibrary(state)
      break
    case 'settings':
      wsHtml = renderSettings(state)
      break
    case 'trash':
      wsHtml = renderTrash(state)
      break
    default:
      wsHtml = `<div style="padding:2rem">Unknown view</div>`
  }

  const notifHTML = notifPanelOpen
    ? `<div style="position:relative;height:0;z-index:200"><div style="position:absolute;right:1.25rem;top:0">${renderNotifPanel(state.notifications as unknown as Array<{ id: string }>, true)}</div></div>`
    : ''

  try {
    appEl.innerHTML = [
      renderSidebar(state),
      `<div class="main-content">`,
      renderTopbar(state),
      notifHTML,
      `<div style="flex:1;overflow:hidden;display:flex;flex-direction:column" id="workspace-container">`,
      wsHtml,
      `</div></div>`,
      renderBottomTabs(state),
      renderAIPanel(aiPanelOpen),
      commandOpen ? renderCommandPalette(commandOpen) : '',
      confirmDialog
        ? renderConfirmDialog(
            confirmDialog as unknown as {
              message: string
              onConfirm: () => void
              onCancel?: () => void
            },
          )
        : '',
      recordModal ? renderRecordModal(recordModal) : '',
      _aiWizard?.open ? renderAIWizard() : renderNanoDownloadModal(),
      docModal ? renderDocModal(state) : '',
      fileViewer ? renderFileViewer(fileViewer as string | null) : '',
      toast ? renderToast(toast) : '',
    ].join('')
  } catch (err) {
    console.error('[render error]', err)
    appEl.innerHTML = '<div style="padding:2rem;color:red">Render error — please reload.</div>'
  }

  try {
    bindSidebar()
    bindTopbar(state)

    switch (currentView) {
      case 'dashboard':
        bindDashboard(state)
        break
      case 'clients':
      case 'departments':
      case 'projects':
      case 'tasks':
      case 'people':
      case 'standaloneNotes':
        bindWorkspaceView(currentView)
        break
      case 'calendar':
        bindCalendar()
        break
      case 'time':
        bindTimeTracker()
        break
      case 'communications':
        bindCommunications(state)
        break
      case 'reports':
        bindReports(state)
        break
      case 'ai':
        bindAIChatWorkspace()
        break
      case 'library':
        bindLibrary()
        break
      case 'settings':
        bindSettings(state)
        break
      case 'trash':
        bindTrash()
        break
    }

    if (docModal) bindDocModal()
    if (fileViewer) bindFileViewer()
    if (commandOpen) bindCommandPalette()
    if (confirmDialog)
      bindConfirmDialog(
        confirmDialog as unknown as {
          message: string
          onConfirm: () => void
          onCancel?: () => void
        },
      )
    if (recordModal) bindRecordModal(recordModal)
    if (aiPanelOpen) bindAIPanel()
    if (_aiWizard?.open) {
      try {
        bindAIWizard()
      } catch (e) {
        console.warn('[AI wizard] bind:', (e as Error).message)
      }
    }
    bindNanoDownloadModal()
  } catch (bindErr) {
    console.error('[bind error]', bindErr)
    setState({
      toast: { id: Date.now(), message: 'UI error — please reload.', type: 'error' },
    })
  }

  if (notifPanelOpen) {
    document.getElementById('mark-all-read')?.addEventListener('click', async () => {
      await markAllNotificationsRead()
      reloadData()
    })
    document.querySelectorAll<HTMLElement>('.notif-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = (el.dataset as DOMStringMap & { notif?: string }).notif
        if (id) {
          await markNotificationRead(id)
          reloadData()
        }
      })
    })
    bindNotifPanel(
      async (id) => {
        await dbDelete('notifications', id)
        reloadData()
      },
      async () => {
        const notifs = getState().notifications as Array<{ id: string }>
        for (const n of notifs) await dbDelete('notifications', n.id)
        reloadData()
      },
    )
    setTimeout(() => {
      document.addEventListener('click', function cn(e) {
        const t = e.target as HTMLElement | null
        if (!t?.closest('#notif-panel') && !t?.closest('#notif-btn')) {
          setState({ notifPanelOpen: false })
          document.removeEventListener('click', cn)
        }
      })
    }, 0)
  }
}

// ── Wire all hooks ────────────────────────────────────────────────────────────
function _wireHooks(): void {
  // Audit hook for db-layer destructive operations (permanentDelete, adapter.clear).
  setDbAuditHook((event, details) => {
    auditLog(event as Parameters<typeof auditLog>[0], details)
  })

  // AI state/nav hooks into state.ts
  setAIHooks(aiNeedsOnboarding, openAIWizard)

  // AI runtime hooks (appRenderWorkspace + fullRender)
  setRuntimeHooks({ appRenderWorkspace, fullRender })

  // AI UI hooks (render/bind surfaces + schemas)
  setAIUIHooks({ appRenderWorkspace, setSettingsSection, openAIWizard })
  setAIUISchemas(getSCHEMAS())

  // AI settings hooks
  setAISettingsHooks({ fullRender })

  // AI IDB hooks (encrypted secrets store)
  setAIV2IDBHooks({
    idbLoadStore: (store: string) => {
      const key = _getDbKey()
      if (!key) return Promise.resolve([])
      return _idbLoadStore(store, key) as Promise<Record<string, unknown>[]>
    },
    idbPutRecord: (store: string, rec: Record<string, unknown>) => {
      const key = _getDbKey()
      if (!key) return Promise.resolve()
      return _idbPutRecord(store, rec as { id: string } & Record<string, unknown>, key)
    },
    idbDeleteRecord: (store: string, id: string) => _idbDeleteRecord(store, id),
    dbKeyGetter: () => _getDbKey(),
  })

  // Topbar hooks
  setTopbarHooks({ aiNeedsOnboarding, openAIWizard, setTheme, lockApp })

  // Sidebar FS status hooks (badge on logo mark)
  setSidebarFsHooks({ getFsReady: isFsReady, getFsLastSave })

  // Settings Storage hooks
  setSettingsFsHooks({
    isFsReady,
    getFsLastSave,
    fsPickFile: fsPickFile,
    fsWriteVault,
    fsUnlink,
  })

  // View hooks
  setDashHooks(appRenderWorkspace)
  setDashAIHooks(aiNeedsOnboarding, openAIWizard)
  setWorkspaceHooks(appRenderWorkspace)
  setCalendarHooks(appRenderWorkspace)
  setPCHooks(appRenderWorkspace)
  setRecordModalHooks(appRenderWorkspace)
  setFilesHooks({ appRenderWorkspace })
  setDocsHooks(appRenderWorkspace, fullRender)
  setDocsAIHooks(() => aiRuntime.ready, aiRuntime.history)
  setDocsStreamHook(async ({ system, prompt, onToken, signal }) => {
    if (!aiRuntime.ready) throw new Error('No AI backend ready — open Settings → AI')
    return callBackend(system, [{ role: 'user', content: prompt }], onToken, signal)
  })

  setLibraryHooks({
    appRenderWorkspace,
    confirmAction: (msg: string, fn: () => Promise<void>) => {
      showConfirm(msg, () => {
        fn().catch(console.error)
      })
    },
    dbSoftDelete: (store: string, id: string) => softDelete(store, id).then(() => undefined),
  })
  setLibraryDocHooks({
    setDocOpenId,
    setDocDirty,
    setDocEditorActive,
  })
  // Communications view hooks
  setCommunicationsHooks(appRenderWorkspace)

  // Components AI hooks (for command palette AI nav guard)
  setComponentsAIHooks(aiNeedsOnboarding, openAIWizard)

  // Settings Security hooks
  setSettingsSecurityHooks({
    lockApp: () => {
      lockApp('manual').catch(console.error)
    },
    setLockTimeout,
    getLockTimeout: () => {
      const raw = localStorage.getItem('taskapp_lock_timeout')
      return raw !== null ? parseInt(raw, 10) : 15
    },
    loadAuditLog,
    exportAuditCSV,
    exportAuditJSON,
    purgeAuditLog,
    loadMFAStatus,
    enableTOTP,
    disableTOTP,
    generateNewTOTPSecret,
    loadPasskeys,
    addPasskey: (pw: string) => addPasskey(pw),
    removePasskey,
    getLastActivityAt: () => _lastActivityAt,
  })

  // Settings AI hooks
  setSettingsAIHooks({
    aiPrefs: aiPrefs,
    getAIReady: () => aiRuntime.ready,
    getAILoadStarted: () => aiRuntime.loadStarted,
    getAISecrets: () => _aiSecrets,
    browserModels: BROWSER_MODELS,
    cloudProviders: CLOUD_PROVIDERS,
    openAIWizard,
    saveAIPrefs: saveAIPrefs as unknown as (p: Record<string, unknown>) => void,
    resetAIConnection,
    startAILoad,
    probeOllama,
    testCloudKey,
    aiSecretsLoad,
    aiSecretsSave: aiSecretsSave as unknown as (s: Record<string, unknown>) => Promise<void>,
    aiSecretsWipe,
    aiHistory: aiRuntime.history,
    pendingAction: aiRuntime.pendingAction,
    aiCurrentMonthKey,
    aiWizard: (_aiWizard ?? {}) as Record<string, unknown>,
    appRenderWorkspace,
    fullRender,
  })
}

// ── init ──────────────────────────────────────────────────────────────────────
export async function init(): Promise<void> {
  initTheme()
  initDensity()

  // File integrity self-check (non-blocking, skipped on file:// origins)
  void (async function checkFileIntegrity() {
    try {
      if (location.protocol === 'file:') {
        console.info(
          '[integrity] Self-check skipped: running from file:// (fetch blocked by browser CORS policy).',
        )
        return
      }
      const url = document.location.href.replace(/[?#].*$/, '')
      const shaUrl = url.replace(/\.html$/i, '') + '.sha256'
      const [shaRes, fileRes] = await Promise.all([
        fetch(shaUrl, { cache: 'no-store' }),
        fetch(url, { cache: 'no-store' }),
      ])
      if (!shaRes.ok) {
        console.warn(
          '[integrity] .sha256 file not found — run generate-csp.mjs to enable tamper detection.',
        )
        return
      }
      const expectedHex = (await shaRes.text()).trim()
      const fileBytes = await fileRes.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes)
      const actualHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      if (actualHex !== expectedHex) {
        console.error(
          '[integrity] ⚠️ FILE HASH MISMATCH — taskapp.html may have been tampered with!',
        )
        const banner = document.createElement('div')
        banner.setAttribute('role', 'alert')
        banner.style.cssText =
          'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;font:700 14px/1 system-ui,sans-serif;padding:10px 16px;text-align:center;letter-spacing:.02em'
        banner.textContent =
          '⚠️ INTEGRITY WARNING: This file may have been modified since it was last verified. Run generate-csp.mjs to update, or verify the source.'
        document.body.prepend(banner)
      } else {
        console.info('[integrity] ✓ File integrity verified.')
      }
    } catch (e) {
      console.warn('[integrity] Self-check skipped:', (e as Error).message)
    }
  })()

  // Request persistent storage once per session (silently skipped on file:// — browser never grants it there)
  if (location.protocol !== 'file:') {
    void navigator.storage.persist().then((granted) => {
      if (granted) console.info('[storage] Persistent storage granted.')
      else
        console.info(
          '[storage] Persistent storage not granted — data protected by encryption regardless.',
        )
    })
  }

  await _migrateLocalStorageToIDB()
  await fsInit()

  // Wire all cross-module hooks before first render
  _wireHooks()

  // Log session start (pre-auth — buffered until key available)
  auditLog('session_start', { protocol: location.protocol })

  // Wire auth IDB hooks so TOTP can be checked during login
  setAuthIDBHooks({
    idbLoadStore: (store, key) => _idbLoadStore(store, key) as Promise<Record<string, unknown>[]>,
  })
  // Wire audit events from auth module
  setAuthAuditHook((event, details) => {
    auditLog(event as Parameters<typeof auditLog>[0], details)
  })

  // Idle activity event listeners (passive, capture phase)
  const _activityEvents = [
    'pointermove',
    'pointerdown',
    'keydown',
    'touchstart',
    'wheel',
    'scroll',
  ] as const
  const _onActivity = () => {
    if (getState().authed) _resetIdleTimer()
  }
  for (const ev of _activityEvents) {
    window.addEventListener(ev, _onActivity, { passive: true, capture: true })
  }

  const afterUnlock = async (key: CryptoKey): Promise<void> => {
    await dbInit(key)

    // Wire audit hooks (need key to encrypt/decrypt)
    setAuditHooks({
      getKey: () => key,
      putRecord: (store, rec) =>
        _idbPutRecord(store, rec as { id: string } & Record<string, unknown>, key),
      loadStore: (store) => _idbLoadStore(store, key) as Promise<Record<string, unknown>[]>,
    })
    flushAuditBuffer() // flush any pre-auth events (session_start)
    auditLog('auth_success')

    // Wire MFA/passkey/webauthn IDB hooks
    const _mfaHooks = {
      getKey: () => key,
      putRecord: (store: string, rec: Record<string, unknown>) =>
        _idbPutRecord(store, rec as { id: string } & Record<string, unknown>, key),
      loadStore: (store: string) => _idbLoadStore(store, key) as Promise<Record<string, unknown>[]>,
    }
    setMFAHooks(_mfaHooks)
    setWebAuthnHooks(_mfaHooks)

    setState({ authed: true, cryptoKey: key })
    reloadData()

    // Load conversations from IDB and set active conversation
    try {
      const convs = (await _idbLoadStore('conversations', key)) as Array<Record<string, unknown>>
      const sorted = [...convs].sort(
        (a, b) =>
          new Date((b.updatedAt as string) || (b.createdAt as string) || '').getTime() -
          new Date((a.updatedAt as string) || (a.createdAt as string) || '').getTime(),
      )
      setState({ conversations: convs })
      const latest = sorted[0]
      if (latest?.id) {
        setState({ activeConversationId: latest.id as string })
        setActiveConversation(latest.id as string)
      }
    } catch (e) {
      console.warn('[conversations] load failed:', (e as Error).message)
    }

    try {
      await checkDueDates()
      reloadData()
    } catch {
      /* non-fatal */
    }
    try {
      if (typeof aiSecretsRefresh === 'function') await aiSecretsRefresh()
    } catch (e) {
      console.warn('[AI] secrets refresh failed:', (e as Error).message)
    }
    fullRender(getState())

    // Start idle timer after unlock
    _resetIdleTimer()

    // Wire adapter stream — NullAdapter returns a no-op unsubscribe immediately.
    getAdapter()?.stream((changes) => {
      for (const [store, recs] of Object.entries(changes)) {
        const target = getStore(store) as Array<Record<string, unknown>>
        for (const rec of recs as Array<Record<string, unknown>>) {
          const idx = target.findIndex((x) => x['id'] === rec['id'])
          if (idx === -1) target.push(rec)
          else if ((rec['updatedAt'] as string) > (target[idx]!['updatedAt'] as string))
            target[idx] = rec
        }
      }
      reloadData()
    })

    let _prevState = getState()
    subscribe((state) => {
      const skipKeys = new Set(['timerElapsed', 'toast'])
      const changedKeys = Object.keys(state).filter(
        (k) =>
          (state as unknown as Record<string, unknown>)[k] !==
          (_prevState as unknown as Record<string, unknown>)[k],
      )
      const onlyEphemeral = changedKeys.length > 0 && changedKeys.every((k) => skipKeys.has(k))

      if (onlyEphemeral) {
        const toastEl = document.querySelector('.toast-container')
        const newToast = state.toast ? renderToast(state.toast) : ''
        if (toastEl) {
          if (newToast && _rawPolicy) {
            toastEl.insertAdjacentHTML('afterend', _rawPolicy.createHTML(newToast))
          }
          toastEl.remove()
        } else if (newToast && _rawPolicy) {
          appEl.insertAdjacentHTML('beforeend', _rawPolicy.createHTML(newToast))
        }
        _prevState = state
        return
      }

      if (state.recordModal && _prevState.recordModal === state.recordModal) {
        const modalEl = document.getElementById('record-modal-backdrop')
        if (modalEl) {
          const container = document.getElementById('workspace-container')
          if (container && state.currentView) appRenderWorkspace(state.currentView)
          _prevState = state
          return
        }
      }

      _prevState = state
      fullRender(state)
    })

    document.addEventListener('keydown', (e) => {
      const m = e.metaKey || e.ctrlKey
      if (m && e.key === 'k') {
        e.preventDefault()
        setState({ commandOpen: true })
      }
      if (e.key === 'Escape') {
        const s = getState()
        if (_aiWizard?.open) {
          if ((_aiWizard as unknown as Record<string, unknown>).pullProgress) return
          closeAIWizard()
          return
        }
        if (s.commandOpen) setState({ commandOpen: false })
        else if (s.docModal) {
          const openId = _docOpenId
          if (openId) {
            void saveDocument().then(() => {
              closeDocumentEditor()
            })
          } else {
            closeDocumentEditor()
          }
        } else if (s.fileViewer) setState({ fileViewer: null })
        else if (s.aiPanelOpen) setState({ aiPanelOpen: false })
        else if (s.recordModal) setState({ recordModal: null })
        else if (s.notifPanelOpen) setState({ notifPanelOpen: false })
      }
    })

    setInterval(async () => {
      try {
        await checkDueDates()
        reloadData()
      } catch {
        /* non-fatal */
      }
    }, 60000)

    // Auto-reconnect AI if onboarding was completed with an allowed tier.
    // If the saved tier is no longer allowed in this build profile (e.g. 'ollama'
    // saved from a previous session but now running an OT-only build), silently
    // clear the tier so the user isn't shown a confusing error on startup.
    if (aiPrefs.hasCompletedOnboarding && aiPrefs.tier && !isAITierAllowed(aiPrefs.tier)) {
      aiPrefs.tier = null
      saveAIPrefs(aiPrefs)
    }
    if (aiPrefs.hasCompletedOnboarding && aiPrefs.tier && isAITierAllowed(aiPrefs.tier)) {
      if (aiPrefs.tier === 'cloud') {
        setTimeout(async () => {
          try {
            await aiSecretsRefresh()
            await startAILoad()
          } catch (e) {
            console.warn('[AI] cloud auto-reconnect failed:', (e as Error).message)
          }
        }, 500)
      } else {
        setTimeout(() => {
          startAILoad().catch((e: unknown) => {
            console.warn('[AI] auto-reconnect failed:', (e as Error).message)
          })
        }, 500)
      }
    }
  }

  // Store afterUnlock so lockApp() can re-show auth with the same handler
  _onAuthSuccess = afterUnlock

  // Discard the IDB-persisted key if the tab was closed between sessions.
  // sessionStorage is cleared on tab close but preserved across F5 reloads,
  // so a missing sentinel means this is a fresh session, not a page refresh.
  if (!hasSessionSentinel()) {
    await clearSessionKey().catch(() => {})
  }

  // Try session-cached key first (survives F5, clears on tab close)
  const cached = await loadSessionKey()
  if (cached && (await verifyPassword(cached).catch(() => false))) {
    await afterUnlock(cached)
    return
  }

  // No cached key — show auth screen
  appEl.innerHTML = await renderAuth()
  bindAuth(appEl, async (key) => {
    await cacheSessionKey(key)
    await afterUnlock(key)
  })
}
