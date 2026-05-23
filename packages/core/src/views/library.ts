// ── LIBRARY (docs + files unified view) ───────────────────────────────────────
// Extracted from taskapp.html lines 5110–5386.

import { escH, formatRelative, formatFileSize } from '../utils.js'
import { sanitizeDataUrl } from '../security/sanitize.js'
import { Icons } from '../ui/icons.js'
import {
  dbGetAll as _dbGetAll,
  dbGetById,
  dbCreate,
  dbUpdate,
  dbDelete as _dbDelete,
  nowISO,
} from '../storage/db.js'
import { setState, reloadData, showToast } from '../state.js'
import type { AppState } from '../state.js'

type AnyRecord = Record<string, unknown>

// ── Module state ──────────────────────────────────────────────────────────────
let _libSection = 'all'
let _libTag = ''
let _libSearch = ''

// ── Hook injection (appRenderWorkspace, fullRender, confirmAction, dbSoftDelete) ──
let _appRenderWorkspace: (view: string) => void = () => {}
let _confirmAction: (msg: string, fn: () => Promise<void>) => void = () => {}
let _dbSoftDelete: (store: string, id: string) => Promise<void> = async () => {}

export function setLibraryHooks(hooks: {
  appRenderWorkspace: (view: string) => void
  confirmAction: (msg: string, fn: () => Promise<void>) => void
  dbSoftDelete: (store: string, id: string) => Promise<void>
}): void {
  _appRenderWorkspace = hooks.appRenderWorkspace
  _confirmAction = hooks.confirmAction
  _dbSoftDelete = hooks.dbSoftDelete
}

// ── Section / tag helpers ─────────────────────────────────────────────────────
function _libSections(docs: AnyRecord[]): string[] {
  const s = new Set<string>()
  ;(docs || []).forEach((d) => {
    if (d.section) s.add(String(d.section))
  })
  return [...s].sort()
}

function _libTags(docs: AnyRecord[]): string[] {
  const t = new Set<string>()
  ;(docs || []).forEach((d) => {
    ;((d.tags as string[] | undefined) || []).forEach((tag) => t.add(tag))
  })
  return [...t].sort()
}

// ── Card renderers ────────────────────────────────────────────────────────────
function _renderDocCard(d: AnyRecord): string {
  const pinned = d.pinned ? `<span class="doc-pin-icon" title="Pinned">📌</span>` : ''
  const sectionChip = d.section
    ? `<span class="doc-section-chip">${escH(String(d.section))}</span>`
    : ''
  const tagChips = ((d.tags as string[] | undefined) || [])
    .map((t) => `<span class="doc-tag-chip">${escH(t)}</span>`)
    .join('')
  return `<div class="lib-card lib-card-doc" data-doc-id="${d.id}">
    <div class="lib-card-header">
      <span class="lib-type-badge lib-type-doc">Doc</span>${pinned}
      <span class="lib-card-title">${escH(String(d.title || 'Untitled'))}</span>
    </div>
    <div class="lib-card-excerpt">${escH(String(d.excerpt || '').slice(0, 120))}</div>
    <div class="lib-card-meta">${sectionChip}${tagChips}</div>
    <div class="lib-card-footer">
      <span>${formatRelative(String(d.updatedAt || d.createdAt || ''))}</span>
      <div class="lib-card-actions">
        <button class="btn btn-ghost btn-sm lib-doc-edit" data-doc-id="${d.id}" title="Edit">${Icons.Edit(14)}</button>
        <button class="btn btn-ghost btn-sm lib-doc-pin" data-doc-id="${d.id}" title="${d.pinned ? 'Unpin' : 'Pin'}">${d.pinned ? '📌' : '📍'}</button>
        <button class="btn btn-ghost btn-sm lib-doc-delete" data-doc-id="${d.id}" title="Delete">${Icons.Trash(14)}</button>
      </div>
    </div>
  </div>`
}

function _renderFileCard(f: AnyRecord): string {
  const ext =
    String(f.name || '')
      .split('.')
      .pop()
      ?.toUpperCase() ?? 'FILE'
  return `<div class="lib-card lib-card-file" data-file-id="${f.id}">
    <div class="lib-card-header">
      <span class="lib-type-badge lib-type-file">${escH(ext)}</span>
      <span class="lib-card-title">${escH(String(f.name || 'Unnamed'))}</span>
    </div>
    <div class="lib-card-excerpt" style="color:var(--text-tertiary)">${f.size ? formatFileSize(Number(f.size)) : '—'}</div>
    <div class="lib-card-footer">
      <span>${formatRelative(String(f.addedAt || f.createdAt || ''))}</span>
      <div class="lib-card-actions">
        <button class="btn btn-ghost btn-sm lib-file-view" data-file-id="${f.id}" title="View">${Icons.Eye ? Icons.Eye(14) : '👁'}</button>
        ${
          f.dataUrl
            ? (() => {
                const su = sanitizeDataUrl(f.dataUrl)
                return su
                  ? `<a class="btn btn-ghost btn-sm" href="${escH(su)}" download="${escH(String(f.name))}" title="Download">${Icons.Download(14)}</a>`
                  : ''
              })()
            : ''
        }
        <button class="btn btn-ghost btn-sm lib-file-delete" data-file-id="${f.id}" title="Delete">${Icons.Trash(14)}</button>
      </div>
    </div>
  </div>`
}

// ── Main view renderer ────────────────────────────────────────────────────────
export function renderLibrary(state: AppState): string {
  const docs = (state.documents || []) as AnyRecord[]
  const files = (state.files || []) as AnyRecord[]

  const sections = _libSections(docs)
  const tags = _libTags(docs)
  const q = _libSearch.toLowerCase()

  const filteredDocs = docs.filter((d) => {
    if (_libSection !== 'all' && d.section !== _libSection) return false
    if (_libTag && !((d.tags as string[] | undefined) || []).includes(_libTag)) return false
    if (
      q &&
      !String(d.title || '')
        .toLowerCase()
        .includes(q) &&
      !String(d.excerpt || '')
        .toLowerCase()
        .includes(q)
    )
      return false
    return true
  })

  const filteredFiles = files.filter((f) => {
    if (_libSection !== 'all') return false
    if (_libTag) return false
    if (
      q &&
      !String(f.name || '')
        .toLowerCase()
        .includes(q)
    )
      return false
    return true
  })

  const pinnedDocs = filteredDocs.filter((d) => d.pinned)
  const unpinnedDocs = filteredDocs.filter((d) => !d.pinned)

  const sectionNav = ['all', ...sections]
    .map(
      (s) =>
        `<button class="lib-section-btn ${_libSection === s ? 'active' : ''}" data-section="${s}">${s === 'all' ? 'All' : escH(s)}</button>`,
    )
    .join('')

  const tagNav = tags
    .map(
      (t) =>
        `<button class="lib-tag-btn ${_libTag === t ? 'active' : ''}" data-tag="${t}">${escH(t)}</button>`,
    )
    .join('')

  const pinnedRow = pinnedDocs.length
    ? `<div class="doc-pinned-row"><div class="doc-pinned-label">Pinned</div><div class="lib-grid">${pinnedDocs.map(_renderDocCard).join('')}</div></div>`
    : ''

  const allItems = [...unpinnedDocs.map(_renderDocCard), ...filteredFiles.map(_renderFileCard)]
  const gridHtml = allItems.length
    ? allItems.join('')
    : `<div class="lib-empty">No items match your filters.</div>`

  return `<div class="workspace-view" id="library-view">
    <div class="workspace-view-header">
      <h1 class="workspace-view-title">Library</h1>
      <div style="display:flex;gap:.5rem;align-items:center">
        <div class="dropdown" id="lib-new-dropdown" style="position:relative">
          <button class="btn btn-primary btn-sm" id="lib-new-btn">New ▾</button>
          <div class="dropdown-menu" id="lib-new-menu" style="display:none;position:absolute;right:0;top:110%;min-width:140px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-md);z-index:100">
            <button class="dropdown-item" id="lib-new-doc">📄 New Doc</button>
            <label class="dropdown-item" id="lib-upload-label" style="cursor:pointer">📎 Upload File<input type="file" id="lib-file-input" multiple style="display:none"></label>
          </div>
        </div>
      </div>
    </div>
    <div class="doc-filter-bar">
      <input class="search-input" id="lib-search" placeholder="Search library…" value="${escH(_libSearch)}" style="flex:1;min-width:0">
      <div class="lib-section-nav">${sectionNav}</div>
      ${tagNav ? `<div class="lib-tag-nav">${tagNav}</div>` : ''}
    </div>
    ${pinnedRow}
    <div class="lib-grid" id="lib-main-grid">${gridHtml}</div>
  </div>`
}

export function bindLibrary(): void {
  document.getElementById('lib-search')?.addEventListener('input', (e) => {
    _libSearch = (e.target as HTMLInputElement).value
    _appRenderWorkspace('library')
  })

  document.querySelectorAll<HTMLElement>('.lib-section-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _libSection = (btn.dataset as DOMStringMap & { section: string }).section
      _appRenderWorkspace('library')
    })
  })

  document.querySelectorAll<HTMLElement>('.lib-tag-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = (btn.dataset as DOMStringMap & { tag: string }).tag
      _libTag = _libTag === tag ? '' : tag
      _appRenderWorkspace('library')
    })
  })

  document.getElementById('lib-new-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    const menu = document.getElementById('lib-new-menu')
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none'
  })
  document.addEventListener(
    'click',
    () => {
      const m = document.getElementById('lib-new-menu')
      if (m) m.style.display = 'none'
    },
    { once: true },
  )

  document.getElementById('lib-new-doc')?.addEventListener('click', () => {
    openDocumentEditor(null)
  })

  document.getElementById('lib-file-input')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement
    const flist = Array.from(input.files || [])
    for (const file of flist) {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => {
          res(r.result as string)
        }
        r.onerror = rej
        r.readAsDataURL(file)
      })
      await dbCreate('files', {
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
        addedAt: nowISO(),
      })
    }
    input.value = ''
    reloadData()
    _appRenderWorkspace('library')
    showToast(`${flist.length} file${flist.length > 1 ? 's' : ''} uploaded`, 'success')
  })

  document.querySelectorAll<HTMLElement>('.lib-doc-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      openDocumentEditor((btn.dataset as DOMStringMap & { docId: string }).docId)
    })
  })
  document.querySelectorAll<HTMLElement>('.lib-card-doc').forEach((card) => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      openDocumentEditor((card.dataset as DOMStringMap & { docId: string }).docId)
    })
  })
  document.querySelectorAll<HTMLElement>('.lib-doc-pin').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const docId = (btn.dataset as DOMStringMap & { docId: string }).docId
      const d = dbGetById('documents', docId) as AnyRecord | null
      if (d) {
        await dbUpdate('documents', String(d.id), { pinned: !d.pinned })
        reloadData()
        _appRenderWorkspace('library')
      }
    })
  })
  document.querySelectorAll<HTMLElement>('.lib-doc-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const docId = (btn.dataset as DOMStringMap & { docId: string }).docId
      _confirmAction('Delete document?', async () => {
        await _dbSoftDelete('documents', docId)
        reloadData()
        _appRenderWorkspace('library')
      })
    })
  })

  document.querySelectorAll<HTMLElement>('.lib-file-view').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      openFileViewer((btn.dataset as DOMStringMap & { fileId: string }).fileId)
    })
  })
  document.querySelectorAll<HTMLElement>('.lib-card-file').forEach((card) => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, a')) return
      openFileViewer((card.dataset as DOMStringMap & { fileId: string }).fileId)
    })
  })
  document.querySelectorAll<HTMLElement>('.lib-file-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const fileId = (btn.dataset as DOMStringMap & { fileId: string }).fileId
      _confirmAction('Delete file?', async () => {
        await _dbSoftDelete('files', fileId)
        reloadData()
        _appRenderWorkspace('library')
      })
    })
  })
}

// ── Doc modal (full-screen editor overlay) ────────────────────────────────────
// These re-export the doc editor open/close so library can control the modal lifecycle.
// The actual editor state (_docOpenId, _docDirty, _docEditorActive) lives in documents.ts.

let _setDocOpenId: (id: string | null) => void = () => {}
let _setDocDirty: (v: boolean) => void = () => {}
let _setDocEditorActive: (v: boolean) => void = () => {}

export function setLibraryDocHooks(hooks: {
  setDocOpenId: (id: string | null) => void
  setDocDirty: (v: boolean) => void
  setDocEditorActive: (v: boolean) => void
}): void {
  _setDocOpenId = hooks.setDocOpenId
  _setDocDirty = hooks.setDocDirty
  _setDocEditorActive = hooks.setDocEditorActive
}

export function openDocumentEditor(docId: string | null): void {
  _setDocOpenId(docId)
  _setDocDirty(false)
  _setDocEditorActive(true)
  setState({ docModal: true })
}

export function closeDocumentEditor(): void {
  _setDocEditorActive(false)
  _setDocOpenId(null)
  _setDocDirty(false)
  setState({ docModal: false })
}

// ── File viewer modal ─────────────────────────────────────────────────────────
const _TEXT_EXTS_VIEWER = new Set([
  'txt',
  'md',
  'html',
  'htm',
  'css',
  'js',
  'ts',
  'jsx',
  'tsx',
  'json',
  'xml',
  'csv',
  'yaml',
  'yml',
  'sh',
  'py',
  'rb',
  'go',
  'rs',
  'c',
  'cpp',
  'h',
  'java',
  'sql',
  'log',
])
const _IMAGE_EXTS_VIEWER = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

function _getFileExtV(name: string): string {
  return (name || '').split('.').pop()?.toLowerCase() ?? ''
}
function _isTextFileV(name: string): boolean {
  return _TEXT_EXTS_VIEWER.has(_getFileExtV(name))
}
function _isImageFileV(name: string): boolean {
  return _IMAGE_EXTS_VIEWER.has(_getFileExtV(name))
}
function _isPdfFileV(name: string): boolean {
  return _getFileExtV(name) === 'pdf'
}

export function openFileViewer(fileId: string): void {
  const f = dbGetById('files', fileId)
  if (!f) return
  setState({ fileViewer: fileId })
}

export function renderFileViewer(fileId: string | null): string {
  if (!fileId) return ''
  const f = dbGetById('files', fileId) as AnyRecord | null
  if (!f) return ''
  const name = String(f.name || '')
  const dataUrl = sanitizeDataUrl(f.dataUrl)
  let body = ''
  if (_isImageFileV(name) && dataUrl) {
    body = `<img src="${escH(dataUrl)}" alt="${escH(name)}" style="max-width:100%;max-height:100%;object-fit:contain">`
  } else if (_isPdfFileV(name) && dataUrl) {
    body = `<embed src="${escH(dataUrl)}" type="application/pdf" style="width:100%;height:100%;border:none">`
  } else if (_isTextFileV(name) && dataUrl) {
    let raw = ''
    try {
      raw = dataUrl.includes(',') ? atob(dataUrl.split(',')[1] ?? '') : ''
    } catch {
      /* unsupported encoding */
    }
    body = `<pre class="file-code-pre" style="margin:0;padding:1.5rem;overflow:auto;white-space:pre-wrap;word-break:break-all;font-family:monospace;font-size:.875rem;line-height:1.6;flex:1">${escH(raw)}</pre>`
  } else {
    body = `<div style="padding:2rem;text-align:center;color:var(--text-tertiary)">
      <p style="font-size:1rem;margin-bottom:1rem">Preview not available for this file type</p>
      ${dataUrl ? `<a href="${escH(dataUrl)}" download="${escH(name)}" class="btn btn-primary">${Icons.Download(14)} Download</a>` : ''}
    </div>`
  }
  return `<div class="file-viewer-backdrop" id="file-viewer-backdrop">
    <div class="file-viewer-modal">
      <div class="file-viewer-header">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(name)}</div>
          <div style="font-size:.75rem;color:var(--text-tertiary)">${f.size ? formatFileSize(Number(f.size)) : ''} · Added ${formatRelative(String(f.addedAt || ''))}</div>
        </div>
        ${dataUrl ? `<a href="${escH(dataUrl)}" download="${escH(name)}" class="btn btn-secondary btn-sm">${Icons.Download(14)} Download</a>` : ''}
        <button class="btn btn-ghost btn-icon" id="file-viewer-close">${Icons.Close()}</button>
      </div>
      <div class="file-viewer-body">${body}</div>
    </div>
  </div>`
}

export function bindFileViewer(): void {
  document.getElementById('file-viewer-close')?.addEventListener('click', () => {
    setState({ fileViewer: null })
  })
  document.getElementById('file-viewer-backdrop')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'file-viewer-backdrop') setState({ fileViewer: null })
  })
}
