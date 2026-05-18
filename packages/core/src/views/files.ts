// ── FILES VIEW ────────────────────────────────────────────────────────────────
// Extracted from taskapp.html lines 7393–7475.

import { escH, formatRelative, formatFileSize, readFileAsBase64 } from '../utils.js';
import { Icons } from '../icons.js';
import { renderEmpty } from '../components.js';
import { dbGetAll, dbGetById, dbCreate, dbDelete, nowISO } from '../db.js';
import { reloadData, showToast, showConfirm } from '../state.js';
import type { AppState } from '../state.js';

type AnyRecord = Record<string, unknown>;

// ── Hook injection ────────────────────────────────────────────────────────────
let _appRenderWorkspace: (view: string) => void = () => {};

export function setFilesHooks(hooks: { appRenderWorkspace: (view: string) => void }): void {
  _appRenderWorkspace = hooks.appRenderWorkspace;
}

// ── Module state ──────────────────────────────────────────────────────────────
let _filesSearch = '';
let _filesFilter = 'all';

// ── File type helpers ─────────────────────────────────────────────────────────
const FILE_ICONS: Record<string, string> = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊',
  ppt: '📋', pptx: '📋', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
  webp: '🖼️', zip: '🗜️', txt: '📃', mp4: '🎬', mp3: '🎵',
};

export function getFileIcon(name: string): string {
  const ext = (name || '').split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] || '📎';
}

export function getFileCategory(name: string): string {
  const ext = (name || '').split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return 'PDF';
  if (['doc', 'docx'].includes(ext)) return 'Word';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Spreadsheet';
  if (['ppt', 'pptx'].includes(ext)) return 'Presentation';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'Image';
  if (['mp4', 'mp3', 'wav'].includes(ext)) return 'Media';
  return 'Other';
}

// ── View renderer ─────────────────────────────────────────────────────────────
export function renderFilesView(_state: AppState): string {
  let files = dbGetAll('files') as AnyRecord[];
  if (_filesSearch) files = files.filter(f => String(f.name || '').toLowerCase().includes(_filesSearch.toLowerCase()));
  if (_filesFilter !== 'all') files = files.filter(f => getFileCategory(String(f.name || '')) === _filesFilter);
  files = files.sort((a, b) => new Date(String(b.addedAt || '')).getTime() - new Date(String(a.addedAt || '')).getTime());

  const categories = ['all', 'PDF', 'Word', 'Spreadsheet', 'Presentation', 'Image', 'Media', 'Other'];
  const filterBtns = categories.map(c =>
    `<button class="btn btn-sm ${_filesFilter === c ? 'btn-primary' : 'btn-secondary'}" data-file-filter="${c}">${c === 'all' ? 'All Files' : c}</button>`
  ).join('');

  const totalSize = files.reduce((s, f) => s + (Number(f.size) || 0), 0);

  const fileCards = files.length ? files.map(f => {
    const recId = f.relatedId ? String(f.relatedId) : null;
    const recStore = f.relatedStore ? String(f.relatedStore) : null;
    const rec = (recId && recStore) ? dbGetById(recStore, recId) as AnyRecord | null : null;
    const recLabel = rec
      ? `<span style="font-size:.7rem;color:var(--accent);flex-shrink:0">${escH(recStore!)}: ${escH(String(rec.name || rec.title || ''))}</span>`
      : '';
    const name = String(f.name || '');
    const dataUrl = f.dataUrl ? String(f.dataUrl) : '';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
    return `<div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-xl);overflow:hidden;display:flex;flex-direction:column;transition:all var(--transition);box-shadow:var(--shadow-sm)">
      ${isImage && dataUrl
        ? `<div style="height:120px;background:var(--bg-base);overflow:hidden;display:flex;align-items:center;justify-content:center"><img src="${dataUrl}" style="max-height:120px;max-width:100%;object-fit:cover;width:100%"></div>`
        : `<div style="height:80px;background:var(--bg-base);display:flex;align-items:center;justify-content:center;font-size:2.5rem">${getFileIcon(name)}</div>`}
      <div style="padding:.875rem;flex:1;display:flex;flex-direction:column;gap:.375rem">
        <div style="font-weight:600;font-size:.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escH(name)}">${escH(name)}</div>
        <div style="font-size:.75rem;color:var(--text-tertiary);display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <span>${f.size ? formatFileSize(Number(f.size)) : 'Unknown size'}</span>
          <span>·</span><span>${formatRelative(String(f.addedAt || ''))}</span>
        </div>
        ${recLabel}
        <div style="display:flex;gap:.375rem;margin-top:.5rem">
          ${dataUrl ? `<a href="${dataUrl}" download="${escH(name)}" class="btn btn-secondary btn-sm" style="flex:1;justify-content:center">${Icons.Download(14)} Download</a>` : ''}
          <button class="btn btn-ghost btn-icon btn-sm" data-del-global-file="${f.id}" style="color:var(--priority-high)">${Icons.Delete(14)}</button>
        </div>
      </div>
    </div>`;
  }).join('') : `<div style="grid-column:1/-1">${renderEmpty(Icons.Files(48), 'No files yet', 'Attach files to any project, task, client, or document.')}</div>`;

  return `<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div class="doc-list-header" style="flex-wrap:wrap;gap:.625rem">
      <span style="font-weight:600">${Icons.Files(18)}&nbsp;Files</span>
      <div style="position:relative;display:flex;align-items:center">
        <span style="position:absolute;left:.625rem;color:var(--text-tertiary);pointer-events:none">${Icons.Search(14)}</span>
        <input class="input" id="files-search" value="${escH(_filesSearch)}" placeholder="Search files…" style="padding-left:2rem;width:180px;height:34px">
      </div>
      <div style="display:flex;gap:.375rem;flex-wrap:wrap">${filterBtns}</div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:.75rem">
        <span style="font-size:.8rem;color:var(--text-tertiary)">${files.length} file${files.length === 1 ? '' : 's'} · ${formatFileSize(totalSize)}</span>
        <label class="btn btn-primary btn-sm" style="cursor:pointer">
          ${Icons.Upload(14)} Upload
          <input type="file" id="global-file-upload" multiple accept="*/*" style="display:none">
        </label>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:1.25rem">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem">${fileCards}</div>
    </div>
  </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────
export function bindFilesView(): void {
  document.getElementById('files-search')?.addEventListener('input', e => {
    _filesSearch = (e.target as HTMLInputElement).value;
    _appRenderWorkspace('files');
  });

  document.querySelectorAll<HTMLElement>('[data-file-filter]').forEach(btn =>
    btn.addEventListener('click', () => {
      _filesFilter = (btn.dataset as DOMStringMap & { fileFilter: string }).fileFilter;
      _appRenderWorkspace('files');
    })
  );

  document.querySelectorAll<HTMLElement>('[data-del-global-file]').forEach(btn =>
    btn.addEventListener('click', () => {
      const fileId = (btn.dataset as DOMStringMap & { delGlobalFile: string }).delGlobalFile;
      showConfirm('Delete this file permanently?', async () => {
        await dbDelete('files', fileId);
        reloadData();
        _appRenderWorkspace('files');
        showToast('File deleted', 'success');
      });
    })
  );

  document.getElementById('global-file-upload')?.addEventListener('change', async e => {
    const MAX_SIZE = 10 * 1024 * 1024;
    const input = e.target as HTMLInputElement;
    for (const file of Array.from(input.files || [])) {
      if (file.size > MAX_SIZE) { showToast(`${file.name} is over 10MB — skipped`, 'error'); continue; }
      try {
        const dataUrl = await readFileAsBase64(file);
        await dbCreate('files', {
          name: file.name, size: file.size, type: file.type,
          dataUrl, relatedStore: null, relatedId: null, addedAt: nowISO(),
        });
        reloadData();
        showToast(`${file.name} uploaded`, 'success');
      } catch { showToast(`Failed to upload ${file.name}`, 'error'); }
    }
    input.value = '';
    _appRenderWorkspace('files');
  });
}
