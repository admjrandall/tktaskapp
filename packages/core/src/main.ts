// ── Composition root ──────────────────────────────────────────────────────────
// main.ts is a thin entry point. All logic has moved to:
//   bootstrap.ts     — init() flow and afterUnlock closure
//   render-pipeline.ts — fullRender(), appRenderWorkspace()
//   hooks-wiring.ts  — all setXHooks() cross-module wires
//   app-lock.ts      — lockApp(), _resetIdleTimer(), idle detection
//
// trusted-types.ts is the first import inside bootstrap.ts.
export { init } from './bootstrap.js'

// Re-export symbols that entry files or tests may import from @core/main.js
export { appRenderWorkspace, fullRender, appEl } from './render-pipeline.js'
export { lockApp, setLockTimeout, _resetIdleTimer, _lastActivityAt } from './app-lock.js'
export { wireHooks } from './hooks-wiring.js'
