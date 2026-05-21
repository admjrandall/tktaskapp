// ── RECORD MODAL ──────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 4119–4224.

import { escH, sanitize, formatRelative, formatFileSize, readFileAsBase64 } from '../utils.js'
import { sanitizeDataUrl } from '../security/sanitize.js'
import {
  dbGetAll,
  dbGetById,
  dbCreate,
  dbUpdate,
  dbDelete,
  softDelete,
  nowISO,
} from '../storage/db.js'
import { getState, showToast, showConfirm, closeRecordModal, reloadData } from '../state.js'
import { Icons } from '../ui/icons.js'
import { renderPriorityBadge, trapFocus } from '../ui/components.js'
import { PRIORITIES, PROJECT_STAGES, TASK_STATUSES, TAG_COLORS, COMM_TYPES } from '../constants.js'
import { openProjectCanvas, _pcFromCanvas, setPcFromCanvas } from './project-canvas.js'

// circular-safe: set by main.ts after both modules load
let _appRenderWorkspace: (view: string) => void = () => {}
export function setRecordModalHooks(appRenderWorkspace: (view: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace
}

type AnyRecord = Record<string, unknown>
type FieldDef = {
  key: string
  label: string
  type: string
  required?: boolean
  options?: string[]
  store?: string
}
type SchemaDef = { label: string; fields: FieldDef[] }

const SCHEMAS: Record<string, SchemaDef> = {
  clients: {
    label: 'Client',
    fields: [
      { key: 'name', label: 'Company Name', type: 'text', required: true },
      { key: 'contactName', label: 'Contact Name', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'website', label: 'Website', type: 'url' },
      {
        key: 'stage',
        label: 'Status',
        type: 'select',
        options: ['Prospect', 'Active', 'Inactive', 'Churned'],
      },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  departments: {
    label: 'Department',
    fields: [
      { key: 'name', label: 'Department Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  projects: {
    label: 'Project',
    fields: [
      { key: 'name', label: 'Project Name', type: 'text', required: true },
      { key: 'stage', label: 'Stage', type: 'select', options: PROJECT_STAGES },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { key: 'dueDate', label: 'Due Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'clientId', label: 'Client', type: 'relation', store: 'clients' },
      { key: 'ownerId', label: 'Owner', type: 'relation', store: 'people' },
    ],
  },
  tasks: {
    label: 'Task',
    fields: [
      { key: 'title', label: 'Task Title', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'select', options: TASK_STATUSES },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { key: 'dueDate', label: 'Due Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'projectId', label: 'Project', type: 'relation', store: 'projects' },
      { key: 'assigneeId', label: 'Assignee', type: 'relation', store: 'people' },
      { key: 'parentId', label: 'Parent Task', type: 'relation', store: 'tasks' },
    ],
  },
  people: {
    label: 'Person',
    fields: [
      { key: 'name', label: 'Full Name', type: 'text', required: true },
      { key: 'role', label: 'Role/Title', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'departmentId', label: 'Department', type: 'relation', store: 'departments' },
      { key: 'clientId', label: 'Client', type: 'relation', store: 'clients' },
    ],
  },
  standaloneNotes: {
    label: 'Note',
    fields: [
      { key: 'body', label: 'Note', type: 'textarea', required: true },
      { key: 'clientId', label: 'Client', type: 'relation', store: 'clients' },
      { key: 'projectId', label: 'Project', type: 'relation', store: 'projects' },
      { key: 'taskId', label: 'Task', type: 'relation', store: 'tasks' },
      { key: 'personId', label: 'Person', type: 'relation', store: 'people' },
    ],
  },
  communications: {
    label: 'Communication',
    fields: [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: COMM_TYPES,
        required: true,
      },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'body', label: 'Notes', type: 'textarea' },
      { key: 'occurredAt', label: 'Date/Time', type: 'datetime-local', required: true },
      { key: 'durationMinutes', label: 'Duration (minutes)', type: 'number' },
      { key: 'personId', label: 'Person', type: 'relation', store: 'people' },
      { key: 'clientId', label: 'Client', type: 'relation', store: 'clients' },
    ],
  },
}

const FILE_ICONS: Record<string, string> = {
  pdf: '📄',
  doc: '📝',
  docx: '📝',
  xls: '📊',
  xlsx: '📊',
  csv: '📊',
  ppt: '📋',
  pptx: '📋',
  png: '🖼️',
  jpg: '🖼️',
  jpeg: '🖼️',
  gif: '🖼️',
  webp: '🖼️',
  zip: '🗜️',
  txt: '📃',
  mp4: '🎬',
  mp3: '🎵',
}
function getFileIcon(name: string): string {
  const ext = (name || '').split('.').pop()!.toLowerCase()
  return FILE_ICONS[ext] || '📎'
}

function renderModalFileRow(f: AnyRecord): string {
  const safeUrl = sanitizeDataUrl(f.dataUrl)
  return `<div style="display:flex;align-items:center;gap:.5rem;padding:.5rem;background:var(--bg-base);border-radius:var(--radius-md);margin-bottom:.375rem"><span style="font-size:1.1rem">${getFileIcon(String(f.name || ''))}</span><div style="flex:1;min-width:0"><div style="font-size:.8rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(f.name || ''))}</div><div style="font-size:.7rem;color:var(--text-tertiary)">${f.size ? formatFileSize(Number(f.size)) : ''}</div></div>${safeUrl ? `<a href="${escH(safeUrl)}" download="${escH(String(f.name || ''))}" class="btn btn-ghost btn-icon btn-sm">${Icons.Download(12)}</a>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-modal-del-file="${f.id}" style="color:var(--priority-high)">${Icons.Delete(12)}</button></div>`
}

export function getSCHEMAS(): Record<
  string,
  { fields: Array<{ key: string; type: string; store?: string }> }
> {
  return SCHEMAS
}

export function renderRecordModal(
  config: { store: string; id: string | null; defaults?: AnyRecord } | null,
): string {
  if (!config) return ''
  const { store, id, defaults = {} } = config
  const schema = SCHEMAS[store]
  if (!schema) return ''
  const record = id ? (dbGetById(store, id) as AnyRecord | null) : null
  const data = record || defaults
  const allTags = dbGetAll('tags') as AnyRecord[]
  const recTags = Array.isArray(data.tagIds) ? (data.tagIds as string[]) : []

  const fields = schema.fields
    .map((f) => {
      const val = data[f.key] ?? ''
      if (f.type === 'textarea')
        return `<div class="form-group" style="grid-column:1/-1"><label class="form-label">${f.label}${f.required ? ' <span style="color:#ef4444">*</span>' : ''}</label><textarea class="textarea" name="${f.key}" rows="3">${escH(String(val))}</textarea></div>`
      if (f.type === 'select') {
        const opts = (f.options || [])
          .map((o) => `<option value="${o}"${o === val ? ' selected' : ''}>${o}</option>`)
          .join('')
        return `<div class="form-group"><label class="form-label">${f.label}</label><select class="select" name="${f.key}"><option value="">— None —</option>${opts}</select></div>`
      }
      if (f.type === 'relation') {
        const rel = dbGetAll(f.store!) as AnyRecord[]
        const opts = rel
          .map(
            (r) =>
              `<option value="${r.id}"${r.id === val ? ' selected' : ''}>${escH(String(r.name || r.title || r.id || ''))}</option>`,
          )
          .join('')
        return `<div class="form-group"><label class="form-label">${f.label}</label><select class="select" name="${f.key}"><option value="">— None —</option>${opts}</select></div>`
      }
      return `<div class="form-group"><label class="form-label">${f.label}${f.required ? ' <span style="color:#ef4444">*</span>' : ''}</label><input class="input" type="${f.type}" name="${f.key}" value="${escH(String(val))}"${f.required ? ' required' : ''}></div>`
    })
    .join('')

  const tagHTML = allTags
    .map((t) => {
      const c = TAG_COLORS.find((c) => c.label === t.color) || TAG_COLORS[7]!
      return `<label style="display:inline-flex;align-items:center;gap:.375rem;cursor:pointer;padding:.25rem .5rem;border-radius:999px;font-size:.75rem;font-weight:500;background:${c.bg};color:${c.text};border:1.5px solid ${recTags.includes(String(t.id)) ? c.text : c.border}"><input type="checkbox" name="tagIds" value="${t.id}"${recTags.includes(String(t.id)) ? ' checked' : ''} style="width:12px;height:12px"> ${escH(String(t.name || ''))}</label>`
    })
    .join('')

  const notes = Array.isArray(data.notes) ? (data.notes as AnyRecord[]) : []
  const isProjectMobile = store === 'projects' && window.innerWidth < 1024
  const backdropClass = isProjectMobile
    ? 'modal-backdrop modal-backdrop-fullscreen'
    : 'modal-backdrop'
  const modalClass = isProjectMobile ? 'modal modal-lg modal-fullscreen' : 'modal modal-lg'

  const filesSection = id
    ? (() => {
        const recFiles = (dbGetAll('files') as AnyRecord[]).filter(
          (f) => f.relatedStore === store && f.relatedId === id,
        )
        return `<div style="margin-top:1.25rem;border-top:1px solid var(--border-subtle);padding-top:1rem"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem"><div style="font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary)">Files ${recFiles.length ? '(' + recFiles.length + ')' : ''}</div><label class="btn btn-secondary btn-sm" style="cursor:pointer">${Icons.Upload(12)} Attach<input type="file" id="modal-file-upload" multiple accept="*/*" style="display:none"></label></div><div id="modal-files-list">${recFiles.length ? recFiles.map(renderModalFileRow).join('') : '<p style="font-size:.8rem;color:var(--text-tertiary)">No files attached</p>'}</div></div>`
      })()
    : ''

  const notesSection =
    store !== 'standaloneNotes'
      ? `<div style="margin-top:1.25rem;border-top:1px solid var(--border-subtle);padding-top:1rem"><div style="font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary);margin-bottom:.5rem">Notes</div><div id="notes-list">${
          notes
            .slice(0, 5)
            .map(
              (n) =>
                `<div style="padding:.625rem;background:var(--bg-base);border-radius:var(--radius-md);margin-bottom:.5rem"><div style="font-size:.8rem;line-height:1.5">${escH(String(n.text || ''))}</div><div style="font-size:.7rem;color:var(--text-tertiary);margin-top:.2rem">${formatRelative(String(n.date || ''))}</div></div>`,
            )
            .join('') || '<p style="font-size:.8rem;color:var(--text-tertiary)">No notes</p>'
        }</div><div style="display:flex;gap:.5rem;margin-top:.5rem"><textarea class="textarea" id="new-note" placeholder="Add a note…" rows="2" style="font-size:.8rem;flex:1"></textarea><button class="btn btn-secondary btn-sm" id="add-note-btn" style="align-self:flex-end">${Icons.Plus(14)}</button></div></div>`
      : ''

  return `<div class="${backdropClass}" id="record-modal-backdrop"><div class="${modalClass}" role="dialog" aria-modal="true" aria-labelledby="modal-title-lbl"><div class="modal-header"><span class="modal-title" id="modal-title-lbl">${id ? 'Edit' : 'New'} ${schema.label}</span><button class="btn btn-ghost btn-icon" id="modal-close">${Icons.Close()}</button></div><div class="modal-body"><form id="record-form" autocomplete="off"><div style="display:grid;grid-template-columns:1fr 1fr;gap:.875rem">${fields}</div>${allTags.length ? `<div class="form-group" style="margin-top:1rem"><label class="form-label">Tags</label><div style="display:flex;flex-wrap:wrap;gap:.375rem;margin-top:.25rem">${tagHTML}</div></div>` : ''}</form>${notesSection}${filesSection}</div><div class="modal-footer">${id ? `<button class="btn btn-danger" id="delete-record-btn" style="margin-right:auto">${Icons.Trash(14)} Delete</button>` : ''}<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn btn-primary" id="modal-save">${Icons.Save(14)} ${id ? 'Save' : 'Create'}</button></div></div></div>`
}

let _pendingNotes: AnyRecord[] = []

export function bindRecordModal(config: {
  store: string
  id: string | null
  defaults?: AnyRecord
}): void {
  const { store, id, defaults = {} } = config
  const schema = SCHEMAS[store]
  if (!schema) return
  const record = id ? (dbGetById(store, id) as AnyRecord | null) : null
  _pendingNotes = Array.isArray(record?.notes) ? [...(record.notes as AnyRecord[])] : []

  let _releaseTrap: (() => void) | null = null
  const handleEsc = (e: KeyboardEvent) => {
    // Defer to confirm dialog's ESC handler when it is open
    if (e.key === 'Escape' && !document.getElementById('confirm-backdrop')) close()
  }

  const close = () => {
    _releaseTrap?.()
    document.removeEventListener('keydown', handleEsc)
    closeRecordModal()
  }

  document.getElementById('modal-close')?.addEventListener('click', close)
  document.getElementById('modal-cancel')?.addEventListener('click', close)
  document.getElementById('record-modal-backdrop')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'record-modal-backdrop') close()
  })

  const modalEl = document.querySelector<HTMLElement>('.modal[role="dialog"]')
  if (modalEl) _releaseTrap = trapFocus(modalEl)
  document.addEventListener('keydown', handleEsc)

  document.getElementById('add-note-btn')?.addEventListener('click', () => {
    const ta = document.getElementById('new-note') as HTMLTextAreaElement | null
    const text = ta?.value?.trim()
    if (!text) return
    const note: AnyRecord = { id: Date.now().toString(36), text, date: new Date().toISOString() }
    _pendingNotes.push(note)
    const list = document.getElementById('notes-list')
    if (list)
      list.innerHTML += `<div style="padding:.625rem;background:var(--bg-base);border-radius:var(--radius-md);margin-bottom:.5rem"><div style="font-size:.8rem;line-height:1.5">${escH(text)}</div><div style="font-size:.7rem;color:var(--text-tertiary);margin-top:.2rem">just now</div></div>`
    if (ta) ta.value = ''
  })

  document.getElementById('delete-record-btn')?.addEventListener('click', () => {
    showConfirm(`Delete this ${schema.label}? It will be moved to the Recycle Bin.`, async () => {
      await softDelete(store, id!)
      reloadData()
      showToast(`${schema.label} moved to Recycle Bin`, 'success')
      close()
    })
  })

  // Modal file upload
  if (id) {
    const handleModalFiles = async (files: File[]) => {
      const MAX_SIZE = 10 * 1024 * 1024
      for (const file of files) {
        if (file.size > MAX_SIZE) {
          showToast(`${file.name} is over 10MB — skipped`, 'error')
          continue
        }
        try {
          const dataUrl = await readFileAsBase64(file)
          await dbCreate('files', {
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl,
            relatedStore: store,
            relatedId: id,
            addedAt: nowISO(),
          })
          reloadData()
          showToast(`${file.name} attached`, 'success')
          const recFiles = (dbGetAll('files') as AnyRecord[]).filter(
            (f) => f.relatedStore === store && f.relatedId === id,
          )
          const listEl = document.getElementById('modal-files-list')
          if (listEl)
            listEl.innerHTML = recFiles.length
              ? recFiles.map(renderModalFileRow).join('')
              : '<p style="font-size:.8rem;color:var(--text-tertiary)">No files attached</p>'
          document.querySelectorAll<HTMLElement>('[data-modal-del-file]').forEach((btn) => {
            btn.addEventListener('click', () => {
              showConfirm('Remove this file?', async () => {
                await dbDelete(
                  'files',
                  (btn.dataset as DOMStringMap & { modalDelFile: string }).modalDelFile,
                )
                reloadData()
                btn.closest('div[style]')?.remove()
              })
            })
          })
        } catch (_e) {
          showToast(`Failed to attach ${file.name}`, 'error')
        }
      }
    }
    const fileInput = document.getElementById('modal-file-upload') as HTMLInputElement | null
    fileInput?.addEventListener('change', async (e) => {
      await handleModalFiles(Array.from((e.target as HTMLInputElement).files || []))
      ;(e.target as HTMLInputElement).value = ''
    })
    document.querySelectorAll<HTMLElement>('[data-modal-del-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showConfirm('Remove this file?', async () => {
          await dbDelete(
            'files',
            (btn.dataset as DOMStringMap & { modalDelFile: string }).modalDelFile,
          )
          reloadData()
          _appRenderWorkspace(getState().currentView)
        })
      })
    })
  }

  document.getElementById('modal-save')?.addEventListener('click', async () => {
    const form = document.getElementById('record-form') as HTMLFormElement | null
    if (!form) return
    const fd: AnyRecord = {}
    schema.fields.forEach((f) => {
      if (f.type === 'multirelation') {
        const sel = form.querySelector<HTMLSelectElement>(`[name="${f.key}"]`)
        fd[f.key] = sel ? [...sel.selectedOptions].map((o) => o.value) : []
      } else {
        const el = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          `[name="${f.key}"]`,
        )
        fd[f.key] = el ? sanitize(el.value) : ''
      }
    })
    fd.tagIds = [...form.querySelectorAll<HTMLInputElement>('[name="tagIds"]:checked')].map(
      (c) => c.value,
    )
    fd.notes = _pendingNotes
    for (const f of schema.fields) {
      if (f.required && !fd[f.key]) {
        showToast(`${f.label} is required`, 'error')
        return
      }
    }
    try {
      if (record) {
        await dbUpdate(store, id!, fd)
        showToast(`${schema.label} updated`, 'success')
      } else {
        if (store === 'standaloneNotes') fd.createdAt = new Date().toISOString()
        await dbCreate(store, fd)
        showToast(`${schema.label} created`, 'success')
      }
      reloadData()
      close()
    } catch (err) {
      showToast(`Failed: ${(err as Error).message}`, 'error')
    }
  })

  // If modal was opened from canvas resize, watch for window expanding back
  if (_pcFromCanvas && store === 'projects' && id) {
    setPcFromCanvas(false)
    const _modalResizeHandler = () => {
      if (window.innerWidth >= 1024) {
        window.removeEventListener('resize', _modalResizeHandler)
        closeRecordModal()
        openProjectCanvas(id)
      }
    }
    window.addEventListener('resize', _modalResizeHandler)
  }
}
