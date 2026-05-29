// ── React host — strangler-fig bridge into the legacy render pipeline ─────────
//
// During the migration (ADR-M-015, REACT-MIGRATION.md) a subset of workspace
// views is rendered by React while the rest stay on the vanilla string pipeline.
// The legacy `fullRender` rewrites `#app` innerHTML on every `setState`, so a
// React subtree mounted inside it is detached on the next render. This module
// owns the React root's lifecycle so that contract is respected: it mounts into
// the freshly created mount point and unmounts the previous root first.
//
// Each migrated view emits a stable empty mount point (`REACT_MOUNT_ID`) from the
// legacy pipeline instead of an HTML string; `syncReactView()` is then called
// after the DOM is (re)written to reconcile the React root with the current view.

import { createElement } from 'react'
import type { ReactNode } from 'react'
import { mountReact } from './mount.js'
import { Reports } from './views/Reports.js'

/** Workspace views migrated to React, keyed by the pipeline `view` id. */
const REACT_VIEWS: Record<string, () => ReactNode> = {
  reports: () => createElement(Reports),
}

/** `id` of the empty mount point the legacy pipeline emits for a React view. */
export const REACT_MOUNT_ID = 'react-view-root'

/** True if `view` is rendered by React rather than the vanilla string pipeline. */
export function isReactView(view: string): boolean {
  return view in REACT_VIEWS
}

/** Static empty mount point emitted by the legacy pipeline for a React view. */
export function reactMountHtml(): string {
  return `<div id="${REACT_MOUNT_ID}" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`
}

let _unmount: (() => void) | null = null
let _mountedEl: HTMLElement | null = null

/**
 * Reconcile the React host with the current view after the legacy pipeline has
 * (re)written the DOM. Mounts the migrated component into the freshly created
 * mount point, tearing down any previous root first. No-op (and tears down) when
 * the current view is not a React view. Returns true if a React view is mounted.
 *
 * NOTE (transitional): because `fullRender` replaces `#app` innerHTML on every
 * `setState`, the mount point is a new DOM node each render, so React is
 * remounted. That is correct (if not optimal) for the stateless reference view
 * and disappears once the shell itself is migrated and `fullRender` retired.
 */
export function syncReactView(view: string): boolean {
  const factory = REACT_VIEWS[view]
  const el = factory ? document.getElementById(REACT_MOUNT_ID) : null
  if (!factory || !el) {
    teardownReactView()
    return false
  }
  if (_mountedEl === el && _unmount) return true // already mounted to this node
  teardownReactView()
  _unmount = mountReact(el, factory())
  _mountedEl = el
  return true
}

/** Unmount the active React root, if any. Safe to call when nothing is mounted. */
export function teardownReactView(): void {
  if (_unmount) {
    _unmount()
    _unmount = null
  }
  _mountedEl = null
}
