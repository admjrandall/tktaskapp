// ── React bridge to the existing global store ─────────────────────────────────
//
// `state.ts` already exposes the exact contract React's `useSyncExternalStore`
// expects: `subscribe(fn)` (returns an unsubscribe) and `getState()` (returns a
// fresh object reference on every `setState`, so React's Object.is snapshot check
// re-renders correctly). This lets React components read the live app state during
// the migration WITHOUT rewriting the store — the vanilla render pipeline and React
// components observe the same single source of truth.

import { useSyncExternalStore } from 'react'
import { getState, subscribe } from '../state.js'
import type { AppState } from '../state.js'

/**
 * Subscribe a component to the full application state. Re-renders on every
 * `setState`. `getState` is used for both the client and server snapshot — the
 * store is browser-only, but providing it as the server snapshot keeps the hook
 * safe under any future SSR/prerender of the enterprise target.
 */
export function useAppState(): AppState {
  return useSyncExternalStore(
    (onStoreChange) =>
      subscribe(() => {
        onStoreChange()
      }),
    getState,
    getState,
  )
}
