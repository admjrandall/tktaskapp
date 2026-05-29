// ── React mount helper ────────────────────────────────────────────────────────
//
// Demonstrates the React entry pattern for the migration. During the transition a
// target entry file can mount a migrated React subtree into a container managed by
// the legacy render pipeline; once the shell is migrated, the whole app mounts here.
//
// The adapter-injection boundary (ADR-M-002) is unchanged: entry files still call
// `setAdapter()` before any render. React never imports a concrete adapter.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'

export function mountReact(container: HTMLElement, node: ReactNode): () => void {
  const root = createRoot(container)
  root.render(<StrictMode>{node}</StrictMode>)
  return () => {
    root.unmount()
  }
}
