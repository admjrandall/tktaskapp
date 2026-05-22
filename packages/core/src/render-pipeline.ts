// ── Render pipeline ────────────────────────────────────────────────────────────
// Extracted from main.ts. patchInnerHTML() in trusted-types.ts routes all
// innerHTML assignments through the nexus-crm-raw Trusted Types policy.
import { getState, navigate, setState, reloadData } from './state.js'
import { dbDelete, markNotificationRead, markAllNotificationsRead } from './storage/db.js'
import { renderSidebar, renderBottomTabs, bindSidebar } from './views/sidebar.js'
import { renderTopbar, bindTopbar } from './views/topbar.js'
import { renderDashboard, bindDashboard } from './views/dashboard.js'
import { renderWorkspaceView, bindWorkspaceView } from './views/workspace.js'
import { renderCalendar, bindCalendar } from './views/calendar.js'
import { renderTimeTracker, bindTimeTracker } from './views/time-tracker.js'
import { renderCommunications, bindCommunications } from './views/communications.js'
import { renderReports, bindReports } from './views/reports.js'
import { renderTrash, bindTrash } from './views/trash.js'
import { renderSettings, bindSettings } from './views/settings.js'
import { renderLibrary, bindLibrary, renderFileViewer, bindFileViewer } from './views/library.js'
import { renderRecordModal, bindRecordModal } from './views/record-modal.js'
import { renderDocModal, bindDocModal } from './views/documents.js'
import {
  renderToast,
  renderConfirmDialog,
  bindConfirmDialog,
  renderCommandPalette,
  bindCommandPalette,
  renderNotifPanel,
  bindNotifPanel,
} from './ui/components.js'
import {
  renderAIPanel,
  bindAIPanel,
  renderAIChatWorkspace,
  bindAIChatWorkspace,
} from './ai/ai-ui.js'
import {
  renderAIWizard,
  bindAIWizard,
  renderNanoDownloadModal,
  bindNanoDownloadModal,
  _aiWizard,
} from './ai/ai-settings.js'
import type { AppState } from './state.js'

export const appEl = document.getElementById('app')!

// Phase 1 stub — rail navigation (not yet implemented)
export function appRenderRail(): void {}

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
