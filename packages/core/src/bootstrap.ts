// ── Bootstrap ─────────────────────────────────────────────────────────────────
// trusted-types.ts MUST be the first import so policies exist before render helpers run.
import './security/trusted-types.js'
import './styles/main.css'

import {
  initTheme,
  initDensity,
  setState,
  getState,
  subscribe,
  reloadData,
  navigate,
  setAIHooks,
} from './state.js'
import { dbInit, checkDueDates, getAdapter, getStore, setDbAuditHook } from './storage/db.js'
import { _migrateLocalStorageToIDB, verifyPassword } from './security/vault.js'
import {
  loadSessionKey,
  cacheSessionKey,
  clearSessionKey,
  hasSessionSentinel,
} from './security/session.js'
import { auditLog, setAuditHooks, flushAuditBuffer } from './security/audit.js'
import {
  setAuthIDBHooks,
  setAuthAuditHook,
  setAuthPasskeyHook,
  renderAuth,
  bindAuth,
} from './security/auth.js'
import { setMFAHooks } from './security/mfa.js'
import { setWebAuthnHooks } from './security/webauthn.js'
import { fsInit } from './storage/fs.js'
import { _idbLoadStore, _idbPutRecord } from './storage/idb-data.js'
import { aiRuntime, setActiveConversation, startAILoad } from './ai/ai-runtime.js'
import { aiSecretsRefresh, closeAIWizard } from './ai/ai-settings.js'
import { aiPrefs, saveAIPrefs } from './ai/ai-prefs.js'
import { isAITierAllowed } from './deployment-policy.js'
import { wireHooks } from './hooks-wiring.js'
import { auditedStaticHtml } from './render-utils.js'
import { appEl, appRenderWorkspace, fullRender } from './render-pipeline.js'
import { setOnAuthSuccess, _resetIdleTimer } from './app-lock.js'
import { renderToast } from './ui/components.js'
import { saveDocument, closeDocumentEditor, _docOpenId } from './views/documents.js'

// ── Global error boundary (OWASP A10) ─────────────────────────────────────────
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

// ── init ──────────────────────────────────────────────────────────────────────
export async function init(): Promise<void> {
  initTheme()
  initDensity()

  // File integrity self-check (non-blocking, skipped on file:// — fetch blocked by CORS)
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

  wireHooks()

  auditLog('session_start', { protocol: location.protocol })

  setAuthIDBHooks({
    idbLoadStore: (store, key) => _idbLoadStore(store, key) as Promise<Record<string, unknown>[]>,
  })
  setAuthAuditHook((event, details) => {
    auditLog(event as Parameters<typeof auditLog>[0], details)
  })
  // Allows the passkey-setup step (shown after first-run vault creation) to persist
  // the passkey credential using the freshly derived vault key — before state.cryptoKey
  // is set and before dbInit() is called by afterUnlock. The IDB data store is already
  // open at this point (opened during _dataDbOpen() before the auth screen renders).
  setAuthPasskeyHook(async (cred, key) => {
    await _idbPutRecord('documents', { id: '__mfa_passkeys__', credentials: [cred] }, key)
  })

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

    setAuditHooks({
      getKey: () => key,
      putRecord: (store, rec) =>
        _idbPutRecord(store, rec as { id: string } & Record<string, unknown>, key),
      loadStore: (store) => _idbLoadStore(store, key) as Promise<Record<string, unknown>[]>,
    })
    flushAuditBuffer()
    auditLog('auth_success')

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
    _resetIdleTimer()

    getAdapter()?.stream((changes) => {
      for (const [store, recs] of Object.entries(changes)) {
        const target = getStore(store) as Array<Record<string, unknown>>
        for (const rec of recs as Array<Record<string, unknown>>) {
          const idx = target.findIndex((x) => x['id'] === rec['id'])
          if (idx === -1) {
            target.push(rec)
          } else {
            const existing = target[idx]
            if (existing && (rec['updatedAt'] as string) > (existing['updatedAt'] as string)) {
              target[idx] = rec
            }
          }
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
          if (newToast) {
            toastEl.insertAdjacentHTML('afterend', auditedStaticHtml(newToast))
          }
          toastEl.remove()
        } else if (newToast) {
          appEl.insertAdjacentHTML('beforeend', auditedStaticHtml(newToast))
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
        if (aiRuntime._aiWizard?.['open']) {
          if (aiRuntime._aiWizard['pullProgress']) return
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

  setOnAuthSuccess(afterUnlock)

  // Discard IDB-persisted key if tab was closed (sentinel absent = fresh session, not F5).
  if (!hasSessionSentinel()) {
    await clearSessionKey().catch(() => {})
  }

  const cached = await loadSessionKey()
  if (cached && (await verifyPassword(cached).catch(() => false))) {
    await afterUnlock(cached)
    return
  }

  appEl.innerHTML = auditedStaticHtml(await renderAuth())
  bindAuth(appEl, async (key) => {
    await cacheSessionKey(key)
    await afterUnlock(key)
  })
}

// Re-export navigate so that external callers who imported it from main.ts still work.
export { navigate, setAIHooks, setDbAuditHook }
