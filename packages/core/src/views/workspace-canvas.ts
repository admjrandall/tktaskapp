// ── WORKSPACE CANVAS ─────────────────────────────────────────────────────────
// Generic spatial canvas that extends the dashboard.ts canvas pattern.
// Any view can render canvas blocks. Drag, resize, and persist to a named layout key.

import { escH } from '../utils.js'
import { LS_CANVAS_KEY_PREFIX } from '../constants.js'

export interface CanvasBlock {
  id: string
  x: number
  y: number
  w: number
  h: number
  z?: number
  type?: string
  title?: string
  body?: string
}

export interface CanvasOptions {
  layoutKey: string
  defaults: Record<string, Omit<CanvasBlock, 'id'>>
  editable?: boolean
  minW?: number
  minH?: number
}

let _appRenderWorkspace: (view: string) => void = () => {}
export function setCanvasHooks(appRenderWorkspace: (view: string) => void): void {
  _appRenderWorkspace = appRenderWorkspace
}

// Per-canvas state (keyed by layoutKey)
const _canvasLayouts: Record<string, Record<string, CanvasBlock>> = {}
const _canvasEdit: Record<string, boolean> = {}
let _canvasZ = 100
const _canvasZMap: Record<string, number> = {}

function getLayout(key: string, defaults: CanvasOptions['defaults']): Record<string, CanvasBlock> {
  if (!_canvasLayouts[key]) {
    try {
      const raw = localStorage.getItem(`${LS_CANVAS_KEY_PREFIX}${key}`)
      _canvasLayouts[key] = raw
        ? (JSON.parse(raw) as Record<string, CanvasBlock>)
        : buildDefaults(key, defaults)
    } catch {
      _canvasLayouts[key] = buildDefaults(key, defaults)
    }
  }
  return _canvasLayouts[key]
}

function buildDefaults(
  key: string,
  defaults: CanvasOptions['defaults'],
): Record<string, CanvasBlock> {
  const layout: Record<string, CanvasBlock> = {}
  for (const [id, v] of Object.entries(defaults)) {
    layout[id] = { id, ...v }
  }
  _canvasLayouts[key] = layout
  return layout
}

function saveLayout(key: string): void {
  localStorage.setItem(`${LS_CANVAS_KEY_PREFIX}${key}`, JSON.stringify(_canvasLayouts[key]))
}

export function renderCanvasBlock(block: CanvasBlock, editable: boolean): string {
  const z = _canvasZMap[block.id] ?? block.z ?? 1
  return `<div
    class="canvas-block"
    id="cb-${escH(block.id)}"
    data-block="${escH(block.id)}"
    style="position:absolute;left:${block.x}px;top:${block.y}px;width:${block.w}px;height:${block.h}px;z-index:${z};background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;display:flex;flex-direction:column"
  >
    ${block.title ? `<div class="canvas-block-header" data-drag="${escH(block.id)}" style="padding:.5rem .75rem;font-size:.8125rem;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;cursor:${editable ? 'grab' : 'default'};user-select:none">${escH(block.title)}${editable ? `<div style="display:flex;gap:.25rem"><button class="btn btn-ghost btn-icon btn-sm" data-block-toggle="${escH(block.id)}" title="Toggle" style="width:20px;height:20px;padding:0">⊟</button></div>` : ''}</div>` : ''}
    <div class="canvas-block-body" style="flex:1;overflow:auto;padding:.75rem" id="cb-body-${escH(block.id)}">${block.body ?? ''}</div>
    ${editable ? `<div data-resize="${escH(block.id)}" style="position:absolute;bottom:0;right:0;width:16px;height:16px;cursor:se-resize;opacity:.4;background:linear-gradient(135deg,transparent 50%,var(--border-strong) 50%)"></div>` : ''}
  </div>`
}

export function renderCanvas(blocks: CanvasBlock[], opts: CanvasOptions): string {
  const edit = _canvasEdit[opts.layoutKey] ?? false
  const editBtn = `<button class="btn btn-secondary btn-sm" id="canvas-edit-toggle" style="position:absolute;top:1rem;right:1rem;z-index:50">${edit ? 'Done' : 'Edit Layout'}</button>`
  const resetBtn = edit
    ? `<button class="btn btn-ghost btn-sm" id="canvas-reset" style="position:absolute;top:1rem;right:7rem;z-index:50">Reset</button>`
    : ''
  const blocksHtml = blocks.map((b) => renderCanvasBlock(b, edit)).join('')
  return `<div class="workspace-canvas" id="workspace-canvas-${escH(opts.layoutKey)}" style="position:relative;width:100%;min-height:calc(100vh - 56px);overflow:auto;background:var(--bg-base)" data-layout-key="${escH(opts.layoutKey)}">
    ${editBtn}${resetBtn}
    ${blocksHtml}
  </div>`
}

export function bindCanvas(opts: CanvasOptions): void {
  const L = getLayout(opts.layoutKey, opts.defaults)
  const minW = opts.minW ?? 160
  const minH = opts.minH ?? 120

  document.getElementById('canvas-edit-toggle')?.addEventListener('click', () => {
    _canvasEdit[opts.layoutKey] = !(_canvasEdit[opts.layoutKey] ?? false)
    saveLayout(opts.layoutKey)
    _appRenderWorkspace(opts.layoutKey)
  })

  document.getElementById('canvas-reset')?.addEventListener('click', () => {
    _canvasLayouts[opts.layoutKey] = buildDefaults(opts.layoutKey, opts.defaults)
    saveLayout(opts.layoutKey)
    _appRenderWorkspace(opts.layoutKey)
  })

  if (!(_canvasEdit[opts.layoutKey] ?? false)) return

  // Drag
  document.querySelectorAll<HTMLElement>('[data-drag]').forEach((handle) => {
    const blockId = handle.dataset['drag']!
    let startX = 0,
      startY = 0,
      origX = 0,
      origY = 0

    const onMove = (e: MouseEvent) => {
      const block = document.getElementById(`cb-${blockId}`)
      if (!block) return
      const nx = origX + e.clientX - startX
      const ny = origY + e.clientY - startY
      block.style.left = `${nx}px`
      block.style.top = `${ny}px`
    }
    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (!L[blockId]) return
      L[blockId].x = origX + e.clientX - startX
      L[blockId].y = origY + e.clientY - startY
      saveLayout(opts.layoutKey)
    }
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const block = L[blockId]
      if (!block) return
      startX = e.clientX
      startY = e.clientY
      origX = block.x
      origY = block.y
      _canvasZMap[blockId] = ++_canvasZ
      document.getElementById(`cb-${blockId}`)!.style.zIndex = String(_canvasZ)
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  })

  // Resize
  document.querySelectorAll<HTMLElement>('[data-resize]').forEach((handle) => {
    const blockId = handle.dataset['resize']!
    let startX = 0,
      startY = 0,
      origW = 0,
      origH = 0

    const onMove = (e: MouseEvent) => {
      const block = document.getElementById(`cb-${blockId}`)
      if (!block) return
      const nw = Math.max(minW, origW + e.clientX - startX)
      const nh = Math.max(minH, origH + e.clientY - startY)
      block.style.width = `${nw}px`
      block.style.height = `${nh}px`
    }
    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (!L[blockId]) return
      L[blockId].w = Math.max(minW, origW + e.clientX - startX)
      L[blockId].h = Math.max(minH, origH + e.clientY - startY)
      saveLayout(opts.layoutKey)
    }
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const block = L[blockId]
      if (!block) return
      startX = e.clientX
      startY = e.clientY
      origW = block.w
      origH = block.h
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  })
}

export function getCanvasBlocks(opts: CanvasOptions): CanvasBlock[] {
  const L = getLayout(opts.layoutKey, opts.defaults)
  return Object.values(L)
}
