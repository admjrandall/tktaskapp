// Cross-module hook wiring for the no-AI offline profile.
// This intentionally excludes AI runtime/settings modules from the bundle.
import { appRenderWorkspace, fullRender } from './render-pipeline.js'
import { LS_LOCK_TIMEOUT_KEY } from './constants.js'
import { lockApp, setLockTimeout, _lastActivityAt } from './app-lock.js'
import { setTheme, showConfirm, setState, showToast } from './state.js'
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
import { setAIHooks } from './state.js'
import { setOnboardingHooks } from './views/onboarding.js'
import { setAdminConsoleHooks } from './views/admin-console.js'
import { setCanvasHooks } from './views/workspace-canvas.js'
import { setTopbarHooks } from './views/topbar.js'
import { setSidebarFsHooks } from './views/sidebar.js'
import {
  setSettingsFsHooks,
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

const aiDisabled = (): boolean => false
const openDisabledAI = (): void => {
  showToast('This build does not include AI features.', 'info')
}

export function wireHooks(): void {
  setDbAuditHook((event, details) => {
    auditLog(event as Parameters<typeof auditLog>[0], details)
  })

  setAIHooks(aiDisabled, openDisabledAI)

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

  setTopbarHooks({ aiNeedsOnboarding: aiDisabled, openAIWizard: openDisabledAI, setTheme, lockApp })
  setSidebarFsHooks({ getFsReady: isFsReady, getFsLastSave })
  setSettingsFsHooks({ isFsReady, getFsLastSave, fsPickFile, fsWriteVault, fsUnlink })

  setDashHooks(appRenderWorkspace)
  setDashAIHooks(aiDisabled, openDisabledAI)
  setWorkspaceHooks(appRenderWorkspace)
  setCalendarHooks(appRenderWorkspace)
  setPCHooks(appRenderWorkspace)
  setRecordModalHooks(appRenderWorkspace)
  setFilesHooks({ appRenderWorkspace })
  setDocsHooks(appRenderWorkspace, fullRender)
  setDocsAIHooks(aiDisabled, [])
  setDocsStreamHook(() => {
    return Promise.reject(new Error('This build does not include AI features.'))
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
  setComponentsAIHooks(aiDisabled, openDisabledAI)

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

  void getSCHEMAS()
  setSettingsSection('general')
}
