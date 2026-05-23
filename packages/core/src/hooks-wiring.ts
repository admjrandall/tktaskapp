// ── Cross-module hook wiring ────────────────────────────────────────────────────
// All setXHooks() calls that wire modules together. Called once from init() before
// the first render, after all modules are loaded.
import { appRenderWorkspace, fullRender } from './render-pipeline.js'
import { LS_LOCK_TIMEOUT_KEY } from './constants.js'
import { lockApp, setLockTimeout, _lastActivityAt } from './app-lock.js'
import { setTheme, showConfirm, setState } from './state.js'
import { setDbAuditHook, _getDbKey, softDelete } from './storage/db.js'
import { _idbLoadStore, _idbPutRecord, _idbDeleteRecord } from './storage/idb-data.js'
import { isFsReady, getFsLastSave, fsPickFile, fsWriteVault, fsUnlink } from './storage/fs.js'
import {
  auditLog,
  loadAuditLog,
  exportAuditCSV,
  exportAuditJSON,
  purgeAuditLog,
} from './security/audit.js'
import { loadMFAStatus, enableTOTP, disableTOTP, generateNewTOTPSecret } from './security/mfa.js'
import { loadPasskeys, addPasskey, removePasskey } from './security/webauthn.js'
import {
  aiRuntime,
  setRuntimeHooks,
  startAILoad,
  disconnectAI as resetAIConnection,
  callBackend,
} from './ai/ai-runtime.js'
import { setAIUIHooks, setAIUISchemas } from './ai/ai-ui.js'
import {
  openAIWizard,
  aiNeedsOnboarding,
  setAIV2IDBHooks,
  setAISettingsHooks,
  aiSecretsSave,
  aiSecretsLoad,
  aiSecretsWipe,
  BROWSER_MODELS,
  CLOUD_PROVIDERS,
  probeOllama,
  testCloudKey,
  aiCurrentMonthKey,
} from './ai/ai-settings.js'
import { aiPrefs, saveAIPrefs } from './ai/ai-prefs.js'
import { setAIHooks } from './state.js'
import { setOnboardingHooks } from './views/onboarding.js'
import { setAdminConsoleHooks } from './views/admin-console.js'
import { setCanvasHooks } from './views/workspace-canvas.js'
import { setTopbarHooks } from './views/topbar.js'
import { setSidebarFsHooks } from './views/sidebar.js'
import {
  setSettingsFsHooks,
  setSettingsAIHooks,
  setSettingsSection,
  setSettingsSecurityHooks,
} from './views/settings.js'
import { setDashHooks, setDashAIHooks } from './views/dashboard.js'
import { setWorkspaceHooks } from './views/workspace.js'
import { setCalendarHooks } from './views/calendar.js'
import { setPCHooks } from './views/project-canvas.js'
import { setRecordModalHooks, getSCHEMAS } from './views/record-modal.js'
import { setFilesHooks } from './views/files.js'
import {
  setDocsHooks,
  setDocsAIHooks,
  setDocsStreamHook,
  setDocOpenId,
  setDocDirty,
  setDocEditorActive,
} from './views/documents.js'
import { setLibraryHooks, setLibraryDocHooks } from './views/library.js'
import { setCommunicationsHooks } from './views/communications.js'
import { setComponentsAIHooks } from './ui/components.js'

export function wireHooks(): void {
  setDbAuditHook((event, details) => {
    auditLog(event as Parameters<typeof auditLog>[0], details)
  })

  setAIHooks(aiNeedsOnboarding, openAIWizard)
  setRuntimeHooks({ appRenderWorkspace, fullRender })
  setAIUIHooks({ appRenderWorkspace, setSettingsSection, openAIWizard })
  setAIUISchemas(getSCHEMAS())
  setAISettingsHooks({ fullRender })

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

  setOnboardingHooks((id) => {
    setState({ currentPersona: id })
  })
  setAdminConsoleHooks({
    setLockdown: (level) => {
      setState({ lockdownLevel: level })
    },
    appRenderWorkspace,
  })
  setCanvasHooks(appRenderWorkspace)

  setTopbarHooks({ aiNeedsOnboarding, openAIWizard, setTheme, lockApp })
  setSidebarFsHooks({ getFsReady: isFsReady, getFsLastSave })
  setSettingsFsHooks({ isFsReady, getFsLastSave, fsPickFile, fsWriteVault, fsUnlink })

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
  setLibraryDocHooks({ setDocOpenId, setDocDirty, setDocEditorActive })

  setCommunicationsHooks(appRenderWorkspace)
  setComponentsAIHooks(aiNeedsOnboarding, openAIWizard)

  setSettingsSecurityHooks({
    lockApp: () => {
      lockApp('manual').catch(console.error)
    },
    setLockTimeout,
    getLockTimeout: () => {
      const raw = localStorage.getItem(LS_LOCK_TIMEOUT_KEY)
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

  setSettingsAIHooks({
    aiPrefs,
    getAIReady: () => aiRuntime.ready,
    getAILoadStarted: () => aiRuntime.loadStarted,
    getAISecrets: () => aiRuntime._aiSecrets,
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
    aiWizard: aiRuntime._aiWizard ?? {},
    appRenderWorkspace,
    fullRender,
  })
}
