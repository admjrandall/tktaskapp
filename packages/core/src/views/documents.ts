// ── DOCUMENTS ─────────────────────────────────────────────────────────────────

import { escH, formatRelative, formatFileSize, readFileAsBase64, downloadText } from '../utils.js';
import { Icons } from '../icons.js';
import { renderEmpty } from '../components.js';
import { dbGetAll, dbGetById, dbCreate, dbUpdate, dbDelete, softDelete, nowISO } from '../db.js';
import { getState, setState, showToast, showConfirm, reloadData } from '../state.js';
import type { AppState } from '../state.js';

type AnyRecord = Record<string, unknown>;

let _docView = 'grid';
export let _docOpenId: string | null = null;
let _docEditorActive = false;
let _docShowVersions = false;
let _docDirty = false;
export function setDocOpenId(id: string | null): void { _docOpenId = id; }
export function setDocDirty(v: boolean): void { _docDirty = v; }
export function setDocEditorActive(v: boolean): void { _docEditorActive = v; }
export function getDocDirty(): boolean { return _docDirty; }
let _docAutoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _docSearchQuery = '';
let _docActiveTab = 'write';

// ── AI state ─────────────────────────────────────────────────────────────────
let _isAIReady: () => boolean = () => false;
export function setDocsAIHooks(isAIReady: () => boolean, _aiHistory: AnyRecord[]): void {
  _isAIReady = isAIReady;
  void _aiHistory;
}

// AI streaming hooks — injected from main.ts to avoid circular imports
type StreamFn = (opts: { system: string; prompt: string; onToken: (t: string) => void; signal: AbortSignal }) => Promise<string>;
let _streamAI: StreamFn | null = null;
export function setDocsStreamHook(fn: StreamFn): void { _streamAI = fn; }

// ── Forward hooks from main.ts ────────────────────────────────────────────────
let _appRenderWorkspace: (view: string) => void = () => {};
export function setDocsHooks(appRenderWorkspace: (view: string) => void, _fullRender: (state: AppState) => void): void {
  _appRenderWorkspace = appRenderWorkspace;
  void _fullRender;
}

// ── Inline AI toolbar state ───────────────────────────────────────────────────
let _inlineAIAbort: AbortController | null = null;
let _savedRange: Range | null = null; // saved selection before toolbar opens

// ── AI Edit modal state ───────────────────────────────────────────────────────
let _aiEditModalOpen = false;
let _aiEditAbort: AbortController | null = null;
let _aiStreaming = false;

// ── List view ─────────────────────────────────────────────────────────────────

export function renderDocuments(state: AppState): string {
  const docs = ((state.documents || []) as AnyRecord[])
    .filter(d => !_docSearchQuery || String(d.title || '').toLowerCase().includes(_docSearchQuery.toLowerCase()) || String(d.excerpt || '').toLowerCase().includes(_docSearchQuery.toLowerCase()))
    .sort((a, b) => new Date(String(b.updatedAt || '')).getTime() - new Date(String(a.updatedAt || '')).getTime());

  const docCards = docs.length ? docs.map(d => {
    const isAI = d.createdBy === 'ai';
    const versions = d.versions as AnyRecord[] | undefined;
    const modifiedByAI = versions?.some((v: AnyRecord) => v.savedBy === 'ai') && d.createdBy !== 'ai';
    let badge = '';
    if (isAI) badge = `<span class="doc-ai-badge">⚡ AI</span>`;
    else if (modifiedByAI) badge = `<span class="doc-ai-badge" style="background:rgba(245,158,11,.15);color:#b45309">⚡ AI · Edited</span>`;
    const linkedLabel = d.linkedStore && d.linkedId ? (() => {
      const rec = dbGetById(String(d.linkedStore), String(d.linkedId)) as AnyRecord | null;
      return rec ? `<span style="color:var(--accent)">${escH(String(rec.name || rec.title || d.linkedId || ''))}</span>` : '';
    })() : '';
    return `<div class="doc-card" data-docid="${d.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
        <span class="doc-card-title">${escH(String(d.title || 'Untitled'))}</span>
        ${badge}
      </div>
      <p class="doc-card-excerpt">${escH((String(d.excerpt || '') || String(d.content || '').replace(/<[^>]*>/g, '') || '').slice(0, 120))}</p>
      <div class="doc-card-meta">
        <span>${formatRelative(String(d.updatedAt || ''))}</span>
        ${linkedLabel ? `<span>·</span>${linkedLabel}` : ''}
        ${versions && versions.length > 1 ? `<span>·</span><span>${versions.length} versions</span>` : ''}
      </div>
    </div>`;
  }).join('') : `<div style="grid-column:1/-1">${renderEmpty(Icons.Doc(48), 'No documents yet', 'Create your first document or ask the AI to write one.', `<button class="btn btn-primary" id="doc-new-btn-empty">${Icons.Plus(14)} New Document</button>`)}</div>`;

  return `<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div class="doc-list-header">
      <span style="font-weight:600">${Icons.Doc(18)}&nbsp;Documents</span>
      <div style="position:relative;display:flex;align-items:center">
        <span style="position:absolute;left:.625rem;color:var(--text-tertiary);pointer-events:none">${Icons.Search(14)}</span>
        <input class="input" id="doc-search" value="${escH(_docSearchQuery)}" placeholder="Search documents…" style="padding-left:2rem;width:200px;height:34px">
      </div>
      <div style="margin-left:auto;display:flex;gap:.5rem">
        <button class="btn btn-primary btn-sm" id="doc-new-btn">${Icons.Plus(14)} New Document</button>
      </div>
    </div>
    <div class="workspace-body">
      <div class="doc-grid">${docCards}</div>
    </div>
  </div>`;
}

export function bindDocuments(): void {
  document.getElementById('doc-new-btn')?.addEventListener('click', () => openDocumentEditor(null));
  document.getElementById('doc-new-btn-empty')?.addEventListener('click', () => openDocumentEditor(null));
  document.getElementById('doc-search')?.addEventListener('input', (e) => {
    _docSearchQuery = (e.target as HTMLInputElement).value;
    _appRenderWorkspace('library');
  });
  document.querySelectorAll<HTMLElement>('[data-docid]').forEach(card => {
    card.addEventListener('click', () => openDocumentEditor((card.dataset as DOMStringMap & { docid: string }).docid));
  });
}

// ── Editor ────────────────────────────────────────────────────────────────────

export function openDocumentEditor(docId: string | null): void {
  _docOpenId = docId;
  _docEditorActive = true;
  _docShowVersions = false;
  _docDirty = false;
  _appRenderWorkspace('documents');
}

export function renderDocumentEditor(state: AppState): string {
  const doc = _docOpenId ? dbGetById('documents', _docOpenId) as AnyRecord | null : null;
  const title = String(doc?.title || '');
  const content = String(doc?.content || '');
  const versions = (doc?.versions as AnyRecord[]) || [];
  const isAI = doc?.createdBy === 'ai';
  const docFiles = _docOpenId ? (dbGetAll('files') as AnyRecord[]).filter(f => f.relatedStore === 'documents' && f.relatedId === _docOpenId) : [];

  const fileIcons: Record<string, string> = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊', ppt: '📋', pptx: '📋', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', zip: '🗜️', txt: '📃', mp4: '🎬', mp3: '🎵' };
  const getFileIcon = (name: string) => { const ext = (name || '').split('.').pop()!.toLowerCase(); return fileIcons[ext] || '📎'; };

  const linkableStores = ['clients', 'projects', 'tasks', 'people'];
  const linkSelect = `<select class="select" id="doc-link-store" style="height:32px;width:120px;font-size:.8rem"><option value="">No CRM link</option>${linkableStores.map(s => `<option value="${s}" ${doc?.linkedStore === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select>`;
  const linkedRecordOptions = doc?.linkedStore ? (dbGetAll(String(doc.linkedStore)) as AnyRecord[]).map(r => `<option value="${r.id}" ${r.id === doc.linkedId ? 'selected' : ''}>${escH(String(r.name || r.title || r.id || ''))}</option>`).join('') : '';
  const linkRecordSelect = doc?.linkedStore ? `<select class="select" id="doc-link-id" style="height:32px;width:160px;font-size:.8rem"><option value="">Select ${doc.linkedStore}…</option>${linkedRecordOptions}</select>` : '';

  const versionPanel = _docShowVersions ? `<div class="doc-version-panel"><div style="padding:.625rem .75rem;border-bottom:1px solid var(--border-subtle);font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary)">Version History</div><div style="flex:1;overflow-y:auto">${versions.slice().reverse().map((v: AnyRecord, i: number) => `<div class="doc-version-item ${i === 0 ? 'current' : ''}" data-veridx="${versions.length - 1 - i}"><div style="font-size:.8rem;font-weight:500">${i === 0 ? 'Current' : 'Version ' + (versions.length - i)}</div><div style="font-size:.7rem;color:var(--text-tertiary)">${formatRelative(String(v.savedAt || ''))} · ${v.savedBy === 'ai' ? '⚡ AI' : 'You'}</div></div>`).join('')}</div></div>` : '';

  const filesBody = `<div style="padding:1.25rem;max-width:800px;margin:0 auto"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><span style="font-weight:600;color:var(--text-primary)">Attached Files</span><label class="btn btn-primary btn-sm" style="cursor:pointer">${Icons.Upload(14)} Upload File<input type="file" id="doc-file-upload" multiple accept="*/*" style="display:none"></label></div><div id="doc-file-dropzone" style="border:2px dashed var(--border-default);border-radius:var(--radius-lg);padding:2rem;text-align:center;color:var(--text-tertiary);margin-bottom:1rem;transition:all var(--transition)">${Icons.Upload(32)}<div style="margin-top:.5rem;font-size:.875rem">Drop files here or click Upload</div><div style="font-size:.75rem;margin-top:.25rem">PDF, Word, Excel, images and more</div></div><div id="doc-files-list">${docFiles.length ? docFiles.map(f => `<div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);margin-bottom:.5rem"><span style="font-size:1.5rem;flex-shrink:0">${getFileIcon(String(f.name || ''))}</span><div style="flex:1;min-width:0"><div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(f.name || ''))}</div><div style="font-size:.75rem;color:var(--text-tertiary)">${f.size ? formatFileSize(Number(f.size)) : ''} · ${formatRelative(String(f.addedAt || ''))}</div></div>${f.dataUrl ? `<a href="${f.dataUrl}" download="${escH(String(f.name || ''))}" class="btn btn-secondary btn-sm">${Icons.Download(14)}</a>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-del-file="${f.id}" style="color:var(--priority-high)">${Icons.Delete(14)}</button></div>`).join('') : '<p style="text-align:center;color:var(--text-tertiary);font-size:.875rem;padding:1rem 0">No files attached yet</p>'}</div></div>`;

  const tabs = `<div style="display:flex;gap:0;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface);flex-shrink:0;padding:0 1rem"><button class="detail-tab ${_docActiveTab === 'write' ? 'active' : ''}" id="doc-tab-write">✏️ Write</button><button class="detail-tab ${_docActiveTab === 'files' ? 'active' : ''}" id="doc-tab-files">📎 Files ${docFiles.length ? `<span style="background:var(--accent);color:#fff;font-size:.6rem;padding:.1rem .35rem;border-radius:999px;margin-left:.25rem">${docFiles.length}</span>` : ''}</button></div>`;

  const writeTab = `<div style="display:flex;flex:1;overflow:hidden;position:relative" id="doc-write-tab"><div class="doc-content-area" style="flex:1" id="doc-content-area-wrap"><div class="doc-content-editable" id="doc-editor" contenteditable="true" spellcheck="true">${content}</div></div>${versionPanel}</div>`;

  const aiEditBtn = _isAIReady()
    ? `<button class="btn btn-ghost btn-sm" id="doc-ai-edit-btn" title="AI Edit — rewrite this document with AI">${Icons.AI(14)} AI Edit</button>`
    : `<button class="btn btn-ghost btn-sm" id="doc-ai-edit-btn" title="Connect AI first in Settings" style="opacity:.5;cursor:default">${Icons.AI(14)} AI Edit</button>`;

  const streamingStop = _aiStreaming ? `<button class="btn btn-danger btn-sm" id="doc-ai-stop-btn">⏹ Stop</button>` : '';

  return `<div class="doc-editor-layout">
    <div class="doc-editor-topbar">
      <button class="btn btn-ghost btn-sm" id="doc-back-btn">${Icons.ChevronLeft(16)} Docs</button>
      <input class="doc-title-input" id="doc-title" placeholder="Document title…" value="${escH(title)}" maxlength="200">
      <div style="display:flex;gap:.375rem;align-items:center;margin-left:auto;flex-wrap:wrap">
        ${isAI ? `<span class="doc-ai-badge">⚡ AI</span>` : ''}
        ${linkSelect}
        ${linkRecordSelect}
        ${versions.length > 0 ? `<button class="btn btn-ghost btn-sm" id="doc-versions-btn" title="Version history">${Icons.Clock(14)} ${versions.length}</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="doc-export-md">${Icons.Download(14)} .md</button>
        <button class="btn btn-ghost btn-sm" id="doc-export-pdf">${Icons.Download(14)} .pdf</button>
        <button class="btn btn-ghost btn-sm" id="doc-export-docx">${Icons.Download(14)} .docx</button>
        ${aiEditBtn}
        ${streamingStop}
        ${_docOpenId ? `<button class="btn btn-danger btn-sm" id="doc-delete-btn">${Icons.Trash(14)}</button>` : ''}
        <button class="btn btn-primary btn-sm" id="doc-save-btn" ${!_docDirty ? 'disabled' : ''}>${Icons.Save(14)} Save</button>
      </div>
    </div>
    <div class="doc-editor-toolbar" id="doc-toolbar" style="${_docActiveTab === 'files' ? 'display:none' : ''}">
      <button class="doc-toolbar-btn" data-cmd="bold" title="Bold"><strong>B</strong></button>
      <button class="doc-toolbar-btn" data-cmd="italic" title="Italic"><em>I</em></button>
      <button class="doc-toolbar-btn" data-cmd="underline" title="Underline"><u>U</u></button>
      <div class="doc-toolbar-sep"></div>
      <button class="doc-toolbar-btn" data-cmd="formatBlock" data-val="h1" title="Heading 1" style="font-size:.75rem;font-weight:700;width:auto;padding:0 .375rem">H1</button>
      <button class="doc-toolbar-btn" data-cmd="formatBlock" data-val="h2" title="Heading 2" style="font-size:.75rem;font-weight:600;width:auto;padding:0 .375rem">H2</button>
      <button class="doc-toolbar-btn" data-cmd="formatBlock" data-val="h3" title="Heading 3" style="font-size:.75rem;font-weight:500;width:auto;padding:0 .375rem">H3</button>
      <button class="doc-toolbar-btn" data-cmd="formatBlock" data-val="p" title="Paragraph" style="font-size:.8rem;width:auto;padding:0 .375rem">¶</button>
      <div class="doc-toolbar-sep"></div>
      <button class="doc-toolbar-btn" data-cmd="insertUnorderedList" title="Bullet list">≡</button>
      <button class="doc-toolbar-btn" data-cmd="insertOrderedList" title="Numbered list">1.</button>
      <div class="doc-toolbar-sep"></div>
      <button class="doc-toolbar-btn" data-cmd="outdent" title="Outdent">←</button>
      <button class="doc-toolbar-btn" data-cmd="indent" title="Indent">→</button>
      <div class="doc-toolbar-sep"></div>
      <button class="doc-toolbar-btn" data-cmd="createLink" title="Insert link">🔗</button>
      <button class="doc-toolbar-btn" data-cmd="removeFormat" title="Clear formatting" style="font-size:.7rem;width:auto;padding:0 .375rem">Clear</button>
    </div>
    ${tabs}
    ${_docActiveTab === 'write' ? writeTab : `<div style="flex:1;overflow-y:auto">${filesBody}</div>`}
    ${_aiEditModalOpen ? _renderAIEditModal() : ''}
  </div>`;
}

// ── AI Edit Modal (whole-document rewrite) ────────────────────────────────────

function _renderAIEditModal(): string {
  return `<div class="doc-ai-edit-overlay" id="doc-ai-edit-overlay">
    <div class="doc-ai-edit-modal" id="doc-ai-edit-modal">
      <div class="doc-ai-edit-modal-header">
        <span style="font-weight:600;display:flex;align-items:center;gap:.5rem">${Icons.AI(16)} AI Document Writer</span>
        <button class="btn btn-ghost btn-icon btn-sm" id="doc-ai-edit-close">${Icons.Close()}</button>
      </div>
      <div class="doc-ai-edit-modal-body">
        <p style="font-size:.875rem;color:var(--text-secondary);margin:0 0 .75rem">Describe what you want the AI to write or how to transform this document. The editor will be replaced with the AI's output as it streams.</p>
        <textarea class="input doc-ai-edit-textarea" id="doc-ai-edit-input" placeholder="e.g. Rewrite this as a formal business proposal… / Write a project brief about… / Summarise and shorten this document…" rows="4" autofocus></textarea>
      </div>
      <div class="doc-ai-edit-modal-footer">
        <button class="btn btn-ghost btn-sm" id="doc-ai-edit-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="doc-ai-edit-write">${Icons.AI(14)} Write</button>
      </div>
    </div>
  </div>`;
}

function _bindAIEditModal(editor: HTMLElement | null, titleInput: HTMLInputElement | null, markDirty: () => void): void {
  const close = () => { _aiEditModalOpen = false; _reRenderDocModal(); };

  document.getElementById('doc-ai-edit-close')?.addEventListener('click', close);
  document.getElementById('doc-ai-edit-cancel')?.addEventListener('click', close);
  document.getElementById('doc-ai-edit-overlay')?.addEventListener('click', e => {
    if ((e.target as HTMLElement).id === 'doc-ai-edit-overlay') close();
  });

  const writeBtn = document.getElementById('doc-ai-edit-write') as HTMLButtonElement | null;
  const input = document.getElementById('doc-ai-edit-input') as HTMLTextAreaElement | null;

  // Submit on Ctrl+Enter
  input?.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); writeBtn?.click(); }
  });

  writeBtn?.addEventListener('click', async () => {
    if (!_streamAI || !editor) return;
    const instruction = input?.value?.trim();
    if (!instruction) { showToast('Enter an instruction first', 'error'); return; }

    const docTitle = titleInput?.value?.trim() || 'Untitled';
    const currentContent = editor.innerText?.slice(0, 3000) || '';

    // Close modal, save version snapshot, then stream
    _aiEditModalOpen = false;
    _aiStreaming = true;
    _reRenderDocModal();

    // Save version snapshot before AI overwrites
    if (_docOpenId) {
      const existing = dbGetById('documents', _docOpenId) as AnyRecord | null;
      if (existing) {
        const snap = { content: editor.innerHTML, savedAt: nowISO(), savedBy: 'human' };
        const versions = [...((existing.versions as AnyRecord[]) || []), snap].slice(-20);
        await dbUpdate('documents', _docOpenId, { versions });
      }
    }

    editor.innerHTML = '';
    editor.setAttribute('contenteditable', 'false');

    const system = `You are a professional document writer. The user is editing a document titled "${escPlain(docTitle)}". Write well-structured content using clear paragraphs, headings where appropriate, and professional language. Return only the document body content — no preamble, no "Here is your document:", just the content itself. Use simple HTML: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>.`;
    const prompt = currentContent
      ? `Current document content:\n${currentContent}\n\nInstruction: ${instruction}`
      : `Document title: ${docTitle}\n\nInstruction: ${instruction}`;

    _aiEditAbort = new AbortController();
    let accumulated = '';

    try {
      await _streamAI({
        system,
        prompt,
        signal: _aiEditAbort.signal,
        onToken: (full: string) => {
          accumulated = full;
          editor.innerHTML = _mdToHtml(full);
          // scroll to bottom as content grows
          const wrap = editor.closest('.doc-content-area') as HTMLElement | null;
          if (wrap) wrap.scrollTop = wrap.scrollHeight;
        },
      });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') showToast('AI write failed — check AI settings', 'error');
    } finally {
      _aiStreaming = false;
      _aiEditAbort = null;
      editor.setAttribute('contenteditable', 'true');
      if (accumulated) markDirty();
      // Re-render topbar to remove Stop button
      _reRenderDocModal();
    }
  });
}

// ── Inline AI selection toolbar ───────────────────────────────────────────────

const _INLINE_ACTIONS = [
  { id: 'rewrite',   label: '✏️ Rewrite',   needsInput: true,  inputPlaceholder: 'Rewrite instruction…' },
  { id: 'improve',   label: '✨ Improve',    needsInput: false, inputPlaceholder: '' },
  { id: 'expand',    label: '📝 Expand',     needsInput: false, inputPlaceholder: '' },
  { id: 'summarise', label: '📋 Summarise',  needsInput: false, inputPlaceholder: '' },
  { id: 'translate', label: '🌐 Translate',  needsInput: true,  inputPlaceholder: 'Target language…' },
  { id: 'table',     label: '📊 Table',      needsInput: false, inputPlaceholder: '' },
  { id: 'formal',    label: '🎩 Make Formal', needsInput: false, inputPlaceholder: '' },
  { id: 'shorter',   label: '✂️ Shorten',    needsInput: false, inputPlaceholder: '' },
] as const;

type InlineActionId = typeof _INLINE_ACTIONS[number]['id'];

// Build prompt for each inline action
function _inlinePrompt(actionId: InlineActionId, selectedText: string, instruction: string): { system: string; prompt: string } {
  const system = 'You are a professional writing assistant. Return only the revised text — no preamble, no explanation, no quotes. Preserve formatting intent.';
  const base = `Selected text:\n"""\n${selectedText}\n"""`;
  const prompts: Record<InlineActionId, string> = {
    rewrite:   `${base}\n\nRewrite the selected text following this instruction: ${instruction}`,
    improve:   `${base}\n\nImprove the clarity, grammar, and flow of the selected text. Keep the same meaning and approximate length.`,
    expand:    `${base}\n\nExpand the selected text with more detail, examples, or explanation. Keep the same style and tone.`,
    summarise: `${base}\n\nSummarise the selected text concisely in 1–3 sentences.`,
    translate: `${base}\n\nTranslate the selected text into ${instruction || 'Spanish'}. Return only the translation.`,
    table:     `${base}\n\nConvert the selected text into a well-structured HTML table using <table>, <thead>, <th>, <tbody>, <tr>, <td> tags. Return only the table HTML.`,
    formal:    `${base}\n\nRewrite the selected text in a formal, professional tone. Keep the same meaning.`,
    shorter:   `${base}\n\nMake the selected text shorter and more concise. Preserve the key meaning.`,
  };
  return { system, prompt: prompts[actionId] };
}

function _showInlineToolbar(editor: HTMLElement, markDirty: () => void): void {
  _removeInlineToolbar();

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  const selectedText = sel.toString().trim();
  if (selectedText.length < 2) return;

  // Save selection range for later restoration
  _savedRange = range.cloneRange();

  const rect = range.getBoundingClientRect();

  const toolbar = document.createElement('div');
  toolbar.id = 'doc-inline-ai-toolbar';
  toolbar.className = 'doc-inline-ai-toolbar';

  toolbar.innerHTML = `
    <div class="doc-inline-ai-actions" id="doc-inline-ai-actions">
      ${_INLINE_ACTIONS.map(a => `<button class="doc-inline-ai-btn" data-action="${a.id}" title="${a.label}">${a.label}</button>`).join('')}
    </div>
    <div class="doc-inline-ai-input-row" id="doc-inline-ai-input-row" style="display:none">
      <input class="input doc-inline-ai-input" id="doc-inline-ai-input" placeholder="" style="height:28px;font-size:.8rem;flex:1">
      <button class="btn btn-primary btn-sm" id="doc-inline-ai-go">Go</button>
      <button class="btn btn-ghost btn-sm" id="doc-inline-ai-back">←</button>
    </div>
    <div class="doc-inline-ai-preview" id="doc-inline-ai-preview" style="display:none">
      <div class="doc-inline-ai-preview-content" id="doc-inline-ai-preview-content"></div>
      <div class="doc-inline-ai-preview-actions">
        <button class="btn btn-primary btn-sm" id="doc-inline-replace">Replace</button>
        <button class="btn btn-secondary btn-sm" id="doc-inline-insert-below">Insert Below</button>
        <button class="btn btn-ghost btn-sm" id="doc-inline-regenerate">↻ Regenerate</button>
        <button class="btn btn-ghost btn-sm" id="doc-inline-discard">Discard</button>
      </div>
    </div>
  `;

  // Attach to the content area wrapper so position is relative to it
  const wrap = editor.closest('.doc-content-area') as HTMLElement | null;
  if (!wrap) return;
  // Content area needs position:relative for absolute child
  wrap.style.position = 'relative';
  wrap.appendChild(toolbar);
  const wrapRect = wrap.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const margin = 12;
  const minLeft = wrap.scrollLeft + margin;
  const maxLeft = wrap.scrollLeft + Math.max(margin, wrap.clientWidth - toolbarRect.width - margin);
  const selectedLeft = rect.left - wrapRect.left + wrap.scrollLeft;
  const selectedTop = rect.top - wrapRect.top + wrap.scrollTop;
  const selectedBottom = rect.bottom - wrapRect.top + wrap.scrollTop;
  const left = Math.min(Math.max(selectedLeft, minLeft), maxLeft);
  const topAbove = selectedTop - toolbarRect.height - 10;
  const topBelow = selectedBottom + 10;
  const top = topAbove >= wrap.scrollTop + margin ? topAbove : topBelow;
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;

  let _currentAction: InlineActionId | null = null;
  let _lastPreview = '';

  const runAction = async (actionId: InlineActionId, instruction: string) => {
    if (!_streamAI) { showToast('Connect AI first in Settings → AI', 'error'); return; }
    _currentAction = actionId;

    const actionsRow = document.getElementById('doc-inline-ai-actions');
    const inputRow = document.getElementById('doc-inline-ai-input-row');
    const previewEl = document.getElementById('doc-inline-ai-preview');
    const previewContent = document.getElementById('doc-inline-ai-preview-content');
    if (actionsRow) actionsRow.style.display = 'none';
    if (inputRow) inputRow.style.display = 'none';
    if (previewEl) { previewEl.style.display = 'flex'; }
    if (previewContent) previewContent.innerHTML = '<span style="color:var(--text-tertiary);font-size:.8rem">Writing…</span>';

    _inlineAIAbort = new AbortController();
    const { system, prompt } = _inlinePrompt(actionId, selectedText, instruction);

    try {
      let accumulated = '';
      await _streamAI({
        system, prompt,
        signal: _inlineAIAbort.signal,
        onToken: (full: string) => {
          accumulated = full;
          _lastPreview = full;
          if (previewContent) previewContent.innerHTML = _mdToHtml(full);
        },
      });
      _lastPreview = accumulated;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        if (previewContent) previewContent.innerHTML += '<br><em style="font-size:.75rem;color:var(--text-tertiary)">Stopped</em>';
      } else {
        showToast('AI failed — check AI settings', 'error');
        _removeInlineToolbar();
      }
    } finally {
      _inlineAIAbort = null;
    }
  };

  // Bind action buttons
  toolbar.querySelectorAll<HTMLElement>('[data-action]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const actionId = btn.dataset['action'] as InlineActionId;
      const action = _INLINE_ACTIONS.find(a => a.id === actionId);
      if (!action) return;

      if (action.needsInput) {
        const actionsRow = document.getElementById('doc-inline-ai-actions');
        const inputRow = document.getElementById('doc-inline-ai-input-row');
        const inputEl = document.getElementById('doc-inline-ai-input') as HTMLInputElement | null;
        if (actionsRow) actionsRow.style.display = 'none';
        if (inputRow) inputRow.style.display = 'flex';
        if (inputEl) { inputEl.placeholder = action.inputPlaceholder; inputEl.focus(); }
        _currentAction = actionId;

        document.getElementById('doc-inline-ai-go')?.addEventListener('mousedown', ev => {
          ev.preventDefault();
          runAction(actionId, inputEl?.value?.trim() || '');
        });
        inputEl?.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); runAction(actionId, inputEl.value.trim()); }
        });
        document.getElementById('doc-inline-ai-back')?.addEventListener('mousedown', ev => {
          ev.preventDefault();
          if (actionsRow) actionsRow.style.display = 'flex';
          if (inputRow) inputRow.style.display = 'none';
        });
      } else {
        runAction(actionId, '');
      }
    });
  });

  // Preview action buttons
  document.getElementById('doc-inline-replace')?.addEventListener('mousedown', e => {
    e.preventDefault();
    if (!_savedRange || !_lastPreview) return;
    const sel2 = window.getSelection();
    if (sel2) { sel2.removeAllRanges(); sel2.addRange(_savedRange); }
    document.execCommand('insertHTML', false, _mdToHtml(_lastPreview));
    markDirty();
    _removeInlineToolbar();
  });

  document.getElementById('doc-inline-insert-below')?.addEventListener('mousedown', e => {
    e.preventDefault();
    if (!_savedRange || !_lastPreview) return;
    const sel2 = window.getSelection();
    if (sel2) { sel2.removeAllRanges(); sel2.addRange(_savedRange); }
    // Move to end of selection, then insert paragraph + content
    const endRange = _savedRange.cloneRange();
    endRange.collapse(false);
    sel2?.removeAllRanges();
    sel2?.addRange(endRange);
    document.execCommand('insertHTML', false, `<br>${_mdToHtml(_lastPreview)}`);
    markDirty();
    _removeInlineToolbar();
  });

  document.getElementById('doc-inline-regenerate')?.addEventListener('mousedown', e => {
    e.preventDefault();
    if (_currentAction) runAction(_currentAction, document.getElementById('doc-inline-ai-input') ? (document.getElementById('doc-inline-ai-input') as HTMLInputElement).value : '');
  });

  document.getElementById('doc-inline-discard')?.addEventListener('mousedown', e => {
    e.preventDefault();
    _removeInlineToolbar();
    // Restore selection
    if (_savedRange) {
      const sel2 = window.getSelection();
      if (sel2) { sel2.removeAllRanges(); sel2.addRange(_savedRange); }
    }
  });
}

function _removeInlineToolbar(): void {
  document.getElementById('doc-inline-ai-toolbar')?.remove();
  if (_inlineAIAbort) { _inlineAIAbort.abort(); _inlineAIAbort = null; }
}

// ── Bind editor ───────────────────────────────────────────────────────────────

export function bindDocumentEditor(): void {
  const editor = document.getElementById('doc-editor') as HTMLElement | null;
  const titleInput = document.getElementById('doc-title') as HTMLInputElement | null;
  const saveBtn = document.getElementById('doc-save-btn') as HTMLButtonElement | null;

  document.getElementById('doc-content-area-wrap')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) editor?.focus(); });
  if (!_docOpenId) setTimeout(() => editor?.focus(), 50);

  const markDirty = () => {
    if (!_docDirty) { _docDirty = true; if (saveBtn) saveBtn.disabled = false; }
    if (_docAutoSaveTimer) clearTimeout(_docAutoSaveTimer);
    _docAutoSaveTimer = setTimeout(saveDocument, 3000);
  };

  editor?.addEventListener('input', markDirty);
  titleInput?.addEventListener('input', markDirty);

  // ── Inline AI toolbar on selection ──────────────────────────────────────────
  if (_isAIReady() && editor) {
    let _selectionTimer: ReturnType<typeof setTimeout> | null = null;
    editor.addEventListener('mouseup', () => {
      if (_selectionTimer) clearTimeout(_selectionTimer);
      _selectionTimer = setTimeout(() => _showInlineToolbar(editor, markDirty), 200);
    });
    editor.addEventListener('keyup', (e) => {
      if (e.shiftKey) {
        if (_selectionTimer) clearTimeout(_selectionTimer);
        _selectionTimer = setTimeout(() => _showInlineToolbar(editor, markDirty), 200);
      }
    });
    // Hide toolbar when clicking outside
    document.addEventListener('mousedown', (e) => {
      const tb = document.getElementById('doc-inline-ai-toolbar');
      if (tb && !tb.contains(e.target as Node) && e.target !== editor) {
        _removeInlineToolbar();
      }
    }, { capture: true });
  }

  document.getElementById('doc-tab-write')?.addEventListener('click', () => { _docActiveTab = 'write'; _reRenderDocModal(); });
  document.getElementById('doc-tab-files')?.addEventListener('click', () => { _docActiveTab = 'files'; _reRenderDocModal(); });

  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      const cmd = (btn.dataset as DOMStringMap & { cmd: string }).cmd;
      const val = (btn.dataset as DOMStringMap & { val?: string }).val || null;
      if (cmd === 'createLink') { const url = prompt('Enter URL:', 'https://'); if (url) document.execCommand('createLink', false, url); }
      else document.execCommand(cmd, false, val ?? undefined);
      markDirty();
    });
  });

  saveBtn?.addEventListener('click', saveDocument);

  document.getElementById('doc-back-btn')?.addEventListener('click', async () => {
    if (_docDirty) await saveDocument();
    _docActiveTab = 'write';
    closeDocumentEditor();
  });

  document.getElementById('doc-delete-btn')?.addEventListener('click', () => {
    if (!_docOpenId) return;
    showConfirm('Delete this document? It will be moved to the Recycle Bin.', async () => {
      await softDelete('documents', _docOpenId!);
      reloadData(); showToast('Document moved to Recycle Bin', 'success');
      _docActiveTab = 'write'; closeDocumentEditor();
    });
  });

  document.getElementById('doc-versions-btn')?.addEventListener('click', () => { _docShowVersions = !_docShowVersions; _reRenderDocModal(); });

  document.querySelectorAll<HTMLElement>('[data-veridx]').forEach(item => {
    item.addEventListener('click', async () => {
      const doc = dbGetById('documents', _docOpenId!) as AnyRecord | null; if (!doc) return;
      const versionIdx = parseInt((item.dataset as DOMStringMap & { veridx: string }).veridx);
      const ver = (doc.versions as AnyRecord[])[versionIdx]; if (!ver) return;
      showConfirm(`Restore this version from ${formatRelative(String(ver.savedAt || ''))}?`, async () => {
        if (editor) editor.innerHTML = String(ver.content || ''); markDirty(); showToast('Version loaded — click Save to apply', 'info');
      });
    });
  });

  document.getElementById('doc-link-store')?.addEventListener('change', (e) => {
    markDirty();
    const doc = _docOpenId ? dbGetById('documents', _docOpenId) as AnyRecord | null : null;
    if (doc) { doc.linkedStore = (e.target as HTMLSelectElement).value || null; doc.linkedId = null; }
    _reRenderDocModal();
  });
  document.getElementById('doc-link-id')?.addEventListener('change', () => markDirty());

  const handleFiles = async (files: File[]) => {
    const MAX_SIZE = 10 * 1024 * 1024;
    for (const file of files) {
      if (file.size > MAX_SIZE) { showToast(`${file.name} is over 10MB — skipped`, 'error'); continue; }
      try {
        if (!_docOpenId) await saveDocument();
        const dataUrl = await readFileAsBase64(file);
        await dbCreate('files', { name: file.name, size: file.size, type: file.type, dataUrl, relatedStore: 'documents', relatedId: _docOpenId, addedAt: nowISO() });
        reloadData(); showToast(`${file.name} attached`, 'success'); _reRenderDocModal();
      } catch (_e) { showToast(`Failed to attach ${file.name}`, 'error'); }
    }
  };

  const fileInput = document.getElementById('doc-file-upload') as HTMLInputElement | null;
  fileInput?.addEventListener('change', async e => { await handleFiles(Array.from((e.target as HTMLInputElement).files || [])); (e.target as HTMLInputElement).value = ''; });

  const dropzone = document.getElementById('doc-file-dropzone');
  dropzone?.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); (dropzone as HTMLElement).style.borderColor = 'var(--accent)'; (dropzone as HTMLElement).style.background = 'var(--accent-light)'; });
  dropzone?.addEventListener('dragleave', () => { (dropzone as HTMLElement).style.borderColor = ''; (dropzone as HTMLElement).style.background = ''; });
  dropzone?.addEventListener('drop', async (e: DragEvent) => { e.preventDefault(); (dropzone as HTMLElement).style.borderColor = ''; (dropzone as HTMLElement).style.background = ''; await handleFiles(Array.from(e.dataTransfer?.files || [])); });

  document.querySelectorAll<HTMLElement>('[data-del-file]').forEach(btn => {
    btn.addEventListener('click', () => showConfirm('Remove this file?', async () => { await dbDelete('files', (btn.dataset as DOMStringMap & { delFile: string }).delFile); reloadData(); _reRenderDocModal(); }));
  });

  // ── Export handlers ─────────────────────────────────────────────────────────
  document.getElementById('doc-export-md')?.addEventListener('click', () => {
    const doc = _docOpenId ? dbGetById('documents', _docOpenId) as AnyRecord | null : null;
    const t = titleInput?.value || String(doc?.title || 'document');
    const html = editor?.innerHTML || String(doc?.content || '');
    const md = html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
    downloadText(`${t}.md`, `# ${t}\n\n${md}`, 'text/markdown');
    showToast('Exported as .md', 'success');
  });

  document.getElementById('doc-export-pdf')?.addEventListener('click', () => {
    const doc = _docOpenId ? dbGetById('documents', _docOpenId) as AnyRecord | null : null;
    const t = titleInput?.value || String(doc?.title || 'document');
    const bodyContent = editor?.innerHTML || String(doc?.content || '');
    const printWin = window.open('', '_blank');
    if (!printWin) { showToast('Allow popups to export PDF', 'error'); return; }
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escH(t)}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;line-height:1.7;color:#111}h1,h2,h3{margin-top:1.5rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.5rem}@media print{body{margin:0}}</style></head><body><h1>${escH(t)}</h1>${bodyContent}</body></html>`);
    printWin.document.close(); printWin.focus(); setTimeout(() => { printWin.print(); printWin.close(); }, 500);
    showToast('Print dialog opened — save as PDF', 'info');
  });

  document.getElementById('doc-export-docx')?.addEventListener('click', async () => {
    const doc = _docOpenId ? dbGetById('documents', _docOpenId) as AnyRecord | null : null;
    const t = titleInput?.value || String(doc?.title || 'document');
    const html = editor?.innerHTML || String(doc?.content || '');
    try {
      showToast('Building .docx…', 'info');
      const blob = await buildDocxBlob(t, html);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${t.replace(/[\\/:*?"<>|]/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showToast('Exported as .docx', 'success');
    } catch (e) {
      console.error('DOCX export failed:', e);
      showToast('DOCX export failed — try PDF instead', 'error');
    }
  });

  // ── AI Edit button ──────────────────────────────────────────────────────────
  document.getElementById('doc-ai-edit-btn')?.addEventListener('click', () => {
    if (!_isAIReady()) { showToast('Connect AI first in Settings → AI', 'error'); return; }
    _aiEditModalOpen = true;
    _reRenderDocModal();
    // After re-render, bind the modal
    _bindAIEditModal(
      document.getElementById('doc-editor') as HTMLElement | null,
      document.getElementById('doc-title') as HTMLInputElement | null,
      markDirty,
    );
  });

  document.getElementById('doc-ai-stop-btn')?.addEventListener('click', () => {
    if (_aiEditAbort) { _aiEditAbort.abort(); }
  });

  // Bind AI Edit modal if already open (re-render case)
  if (_aiEditModalOpen) {
    _bindAIEditModal(editor, titleInput, markDirty);
  }
}

// ── Save / close ──────────────────────────────────────────────────────────────

export async function saveDocument(): Promise<void> {
  if (_docAutoSaveTimer) clearTimeout(_docAutoSaveTimer);
  const editor = document.getElementById('doc-editor') as HTMLElement | null;
  const titleInput = document.getElementById('doc-title') as HTMLInputElement | null;
  if (!editor) return;

  const content = editor.innerHTML;
  const title = titleInput?.value?.trim() || 'Untitled';
  const excerpt = editor.innerText?.slice(0, 200) || '';
  const linkedStore = (document.getElementById('doc-link-store') as HTMLSelectElement | null)?.value || null;
  const linkedId = (document.getElementById('doc-link-id') as HTMLSelectElement | null)?.value || null;
  const versionEntry: AnyRecord = { content, savedAt: nowISO(), savedBy: 'human' };

  if (_docOpenId) {
    const existing = dbGetById('documents', _docOpenId) as AnyRecord | null;
    const versions = [...((existing?.versions as AnyRecord[]) || []), versionEntry].slice(-20);
    await dbUpdate('documents', _docOpenId, { title, content, excerpt, linkedStore, linkedId, versions });
  } else {
    const doc = await dbCreate('documents', { title, content, excerpt, createdBy: 'human', linkedStore, linkedId, versions: [versionEntry] }) as AnyRecord;
    _docOpenId = String(doc.id);
  }

  _docDirty = false;
  reloadData();
  const saveBtn = document.getElementById('doc-save-btn') as HTMLButtonElement | null;
  if (saveBtn) saveBtn.disabled = true;
  showToast('Document saved', 'success');
}

export function closeDocumentEditor(): void {
  _removeInlineToolbar();
  if (_aiEditAbort) { _aiEditAbort.abort(); _aiEditAbort = null; }
  _aiEditModalOpen = false;
  _aiStreaming = false;
  _docEditorActive = false;
  _docOpenId = null;
  _docDirty = false;
  setState({ docModal: false });
}

function _reRenderDocModal(): void {
  const backdrop = document.getElementById('doc-modal-backdrop');
  if (!backdrop) return;
  const newHtml = renderDocModal(getState());
  const tmp = document.createElement('div');
  tmp.innerHTML = newHtml;
  const newEl = tmp.firstElementChild;
  if (newEl) { backdrop.replaceWith(newEl); bindDocModal(); }
}

export function renderDocModal(state: AppState): string {
  if (!state.docModal) return '';
  const inner = renderDocumentEditor(state);
  return `<div class="doc-modal-backdrop" id="doc-modal-backdrop"><div class="doc-modal">${inner}</div></div>`;
}

export function bindDocModal(): void {
  document.getElementById('doc-modal-backdrop')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'doc-modal-backdrop') {
      if (_docDirty) { saveDocument().then(() => closeDocumentEditor()); } else closeDocumentEditor();
    }
  });
  bindDocumentEditor();
}

// ── Utility: plain text escape (for AI prompts, not innerHTML) ────────────────
function escPlain(s: string): string {
  return s.replace(/[\\"]/g, c => '\\' + c);
}

// ── Minimal markdown/HTML pass-through for AI output ─────────────────────────
// AI output may be markdown or HTML — convert markdown to HTML for preview
function _mdToHtml(md: string): string {
  // If the content already looks like HTML, return as-is
  if (/<(p|h[1-3]|ul|ol|table)\b/i.test(md)) return md;
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^(?!<[h|u|o|l|p])(.+)/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '');
}

// ── Production DOCX export (OOXML ZIP) ───────────────────────────────────────

async function buildDocxBlob(title: string, htmlContent: string): Promise<Blob> {
  const ooxml = htmlToOoxml(title, htmlContent);
  const zip = buildZip(ooxml);
  return new Blob([zip.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ── HTML → OOXML converter ────────────────────────────────────────────────────

interface OoxmlPart {
  contentTypes: string;
  relsMain: string;
  docRels: string;
  document: string;
  styles: string;
  numbering: string;
  hasHyperlinks: boolean;
}

function htmlToOoxml(title: string, html: string): OoxmlPart {
  // Parse into a DOM for clean traversal
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.querySelector('div')!;

  const hyperlinks: { id: string; url: string }[] = [];
  let hlinkCounter = 0;

  function getOrAddHyperlink(url: string): string {
    const existing = hyperlinks.find(h => h.url === url);
    if (existing) return existing.id;
    const id = `rId${hlinkCounter + 10}`;
    hlinkCounter++;
    hyperlinks.push({ id, url });
    return id;
  }

  function xmlEsc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function nodeToRuns(node: Node, bold = false, italic = false, underline = false): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text) return '';
      const rPr = [
        bold ? '<w:b/><w:bCs/>' : '',
        italic ? '<w:i/><w:iCs/>' : '',
        underline ? '<w:u w:val="single"/>' : '',
      ].join('');
      // Split on spaces preserving them with xml:space="preserve"
      return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') return '<w:r><w:br/></w:r>';
    if (tag === 'strong' || tag === 'b') return childRuns(el, true, italic, underline);
    if (tag === 'em' || tag === 'i') return childRuns(el, bold, true, underline);
    if (tag === 'u') return childRuns(el, bold, italic, true);
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      const rId = href ? getOrAddHyperlink(href) : '';
      const innerRuns = childRuns(el, bold, italic, true); // hyperlinks are underlined
      if (!rId) return innerRuns;
      return `<w:hyperlink r:id="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${innerRuns}</w:hyperlink>`;
    }
    if (tag === 'span') return childRuns(el, bold, italic, underline);
    // Block elements nested inside inline context — just get their text
    return childRuns(el, bold, italic, underline);
  }

  function childRuns(el: Element, bold: boolean, italic: boolean, underline: boolean): string {
    return Array.from(el.childNodes).map(n => nodeToRuns(n, bold, italic, underline)).join('');
  }



  function nodeToParas(node: Node, listLevel = 0, listType: 'ul' | 'ol' | null = null): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').trim();
      return t ? `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r></w:p>` : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1') {
      const runs = childRuns(el, false, false, false);
      return `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/></w:pPr>${runs}</w:p>`;
    }
    if (tag === 'h2') {
      const runs = childRuns(el, false, false, false);
      return `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="200" w:after="80"/></w:pPr>${runs}</w:p>`;
    }
    if (tag === 'h3') {
      const runs = childRuns(el, false, false, false);
      return `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="160" w:after="60"/></w:pPr>${runs}</w:p>`;
    }
    if (tag === 'p' || tag === 'div') {
      const runs = childRuns(el, false, false, false);
      if (!runs.trim()) return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;
      return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs}</w:p>`;
    }
    if (tag === 'ul') {
      return Array.from(el.children).map(li => {
        const runs = childRuns(li, false, false, false);
        return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${listLevel}"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/></w:pPr>${runs}</w:p>`;
      }).join('');
    }
    if (tag === 'ol') {
      return Array.from(el.children).map(li => {
        const runs = childRuns(li, false, false, false);
        return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${listLevel}"/><w:numId w:val="2"/></w:numPr><w:spacing w:after="60"/></w:pPr>${runs}</w:p>`;
      }).join('');
    }
    if (tag === 'li') {
      const runs = childRuns(el, false, false, false);
      const numId = listType === 'ol' ? '2' : '1';
      return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${listLevel}"/><w:numId w:val="${numId}"/></w:numPr><w:spacing w:after="60"/></w:pPr>${runs}</w:p>`;
    }
    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'));
      const tableRows = rows.map((row, rowIdx) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        const isHeader = rowIdx === 0 || row.closest('thead') !== null;
        const cellsXml = cells.map(cell => {
          const paras = Array.from(cell.childNodes).map(n => {
            const runs = nodeToRuns(n, isHeader, false, false);
            return runs ? `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>${runs}</w:p>` : '';
          }).filter(Boolean).join('') || '<w:p><w:r><w:t/></w:r></w:p>';
          const shading = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
          return `<w:tc><w:tcPr>${shading}<w:tcBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/></w:tcBorders><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="115" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="115" w:type="dxa"/></w:tcMar></w:tcPr>${paras}</w:tc>`;
        }).join('');
        return `<w:tr>${cellsXml}</w:tr>`;
      }).join('');
      return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders></w:tblPr><w:tblGrid/>${tableRows}</w:tbl>`;
    }
    if (tag === 'br') return `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`;
    if (tag === 'hr') return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>`;
    if (tag === 'blockquote') {
      const runs = childRuns(el, false, true, false);
      return `<w:p><w:pPr><w:ind w:left="720"/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:i/><w:iCs/><w:color w:val="666666"/></w:rPr></w:r>${runs}</w:p>`;
    }
    // Unknown block — recurse children
    return Array.from(el.childNodes).map(n => nodeToParas(n)).join('');
  }

  // Title paragraph
  const titlePara = `<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:after="240"/></w:pPr><w:r><w:t>${xmlEsc(title)}</w:t></w:r></w:p>`;

  const bodyParas = Array.from(root.childNodes).map(n => nodeToParas(n)).join('') ||
    `<w:p><w:r><w:t/></w:r></w:p>`;

  // numbering.xml for lists
  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1080" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1080" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  mc:Ignorable="w14 wp14"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <w:body>
    ${titlePara}
    ${bodyParas}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:after="240"/><w:jc w:val="left"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:sz w:val="52"/><w:szCs w:val="52"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="80"/><w:keepNext/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:outlineLvl w:val="2"/><w:spacing w:before="160" w:after="60"/><w:keepNext/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="1F3864"/><w:i/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:ind w:left="720"/></w:pPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/>
    <w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders></w:tblPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableNormal"><w:name w:val="Normal Table"/></w:style>
  <w:style w:type="character" w:styleId="Hyperlink">
    <w:name w:val="Hyperlink"/>
    <w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>
  </w:style>
</w:styles>`;

  // Build relationship entries for hyperlinks
  const hyperlinkRels = hyperlinks.map(h =>
    `<Relationship Id="${h.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEsc(h.url)}" TargetMode="External"/>`
  ).join('\n  ');

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  ${hyperlinkRels}
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const relsMain = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return {
    contentTypes,
    relsMain,
    docRels,
    document: documentXml,
    styles: stylesXml,
    numbering: numberingXml,
    hasHyperlinks: hyperlinks.length > 0,
  };
}

// ── Minimal ZIP builder (STORED mode — no compression) ───────────────────────
// PKZIP STORED: valid per spec, Word accepts it, no DEFLATE needed in browser.

function buildZip(parts: OoxmlPart): Uint8Array {
  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: enc(parts.contentTypes) },
    { name: '_rels/.rels',         data: enc(parts.relsMain) },
    { name: 'word/document.xml',   data: enc(parts.document) },
    { name: 'word/styles.xml',     data: enc(parts.styles) },
    { name: 'word/numbering.xml',  data: enc(parts.numbering) },
    { name: 'word/_rels/document.xml.rels', data: enc(parts.docRels) },
  ];

  function enc(s: string): Uint8Array {
    return new TextEncoder().encode(s);
  }

  // CRC-32 table
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(data: Uint8Array): number {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.byteLength; i++) {
      crc = crcTable[(crc ^ view.getUint8(i)) & 0xFF]! ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u16le(n: number): Uint8Array { return new Uint8Array([(n & 0xFF), ((n >> 8) & 0xFF)]); }
  function u32le(n: number): Uint8Array { return new Uint8Array([(n & 0xFF), ((n >> 8) & 0xFF), ((n >> 16) & 0xFF), ((n >> 24) & 0xFF)]); }

  function dosDatetime(): { date: number; time: number } {
    const d = new Date();
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    return { date, time };
  }

  const { date: dosDate, time: dosTime } = dosDatetime();
  const localHeaders: { offset: number; nameBytes: Uint8Array; crc: number; size: number }[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header
    const lh = concat([
      new Uint8Array([0x50, 0x4B, 0x03, 0x04]), // signature
      u16le(20),           // version needed
      u16le(0),            // general purpose bit flag
      u16le(0),            // compression method: STORED
      u16le(dosTime),
      u16le(dosDate),
      u32le(crc),
      u32le(size),         // compressed size = uncompressed (STORED)
      u32le(size),
      u16le(nameBytes.length),
      u16le(0),            // extra field length
      nameBytes,
    ]);

    localHeaders.push({ offset, nameBytes, crc, size });
    chunks.push(lh);
    chunks.push(file.data);
    offset += lh.length + size;
  }

  const cdirStart = offset;
  const cdirEntries: Uint8Array[] = [];

  for (let i = 0; i < files.length; i++) {
    const { offset: localOffset, nameBytes, crc, size } = localHeaders[i]!;
    const cd = concat([
      new Uint8Array([0x50, 0x4B, 0x01, 0x02]), // central dir signature
      u16le(20),           // version made by
      u16le(20),           // version needed
      u16le(0),            // flag
      u16le(0),            // compression: STORED
      u16le(dosTime),
      u16le(dosDate),
      u32le(crc),
      u32le(size),
      u32le(size),
      u16le(nameBytes.length),
      u16le(0),            // extra
      u16le(0),            // comment
      u16le(0),            // disk start
      u16le(0),            // internal attr
      u32le(0),            // external attr
      u32le(localOffset),
      nameBytes,
    ]);
    cdirEntries.push(cd);
    offset += cd.length;
  }

  const cdirSize = offset - cdirStart;
  const eocd = concat([
    new Uint8Array([0x50, 0x4B, 0x05, 0x06]), // end of central dir
    u16le(0),              // disk number
    u16le(0),              // disk with central dir
    u16le(files.length),
    u16le(files.length),
    u32le(cdirSize),
    u32le(cdirStart),
    u16le(0),              // comment length
  ]);

  return concat([...chunks, ...cdirEntries, eocd]);
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}
