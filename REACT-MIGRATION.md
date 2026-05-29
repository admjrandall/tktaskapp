# React Migration Plan (Phase 2)

**Task App CRM — frontend**
**Created:** 2026-05-29
**Decision of record:** ADR-M-015 (`DECISIONS.md`)
**Status:** In progress — foundation landed; build wiring + view porting pending.

This is the detailed companion to ADR-M-015 (migrate the vanilla-TS frontend to
React). It is a **multi-increment** effort; this document tracks the strategy,
the verified toolchain, and the per-step status so work can resume cleanly.

## Goal and hard constraints

- Migrate `packages/core/src/` views from vanilla-TS string-`innerHTML` rendering
  to **React** components.
- **Offline-web must keep emitting a single inlined HTML file** for `file://`
  (`vite-plugin-singlefile`). Enterprise-web and Dataverse use normal multi-asset
  builds.
- Preserve the **security invariants**: Trusted Types policies, the offline CSP
  (`require-trusted-types-for 'script'`, script-by-hash), and the adapter-injection
  boundary (ADR-M-002 — core never imports a concrete adapter).

## Verified toolchain (current sources, 2026-05-29)

| Choice                   | Version                          | Why                                                                                                                                                     |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react` / `react-dom`    | 19.2.x (latest stable, May 2026) | Trusted Types support for `dangerouslySetInnerHTML` (17.0.2+); stable concurrent renderer                                                               |
| `@vitejs/plugin-react`   | v6                               | Correct plugin for **Vite 8 / Rolldown**; uses Oxc for React Refresh. `@vitejs/plugin-react-oxc` is **deprecated** and merged into this — do not use it |
| `vite-plugin-singlefile` | 2.3.3 (already present)          | Inlines JS+CSS into one HTML; works with React                                                                                                          |
| JSX                      | `react-jsx` automatic runtime    | No `import React` needed; compatible with `verbatimModuleSyntax` + `isolatedModules`                                                                    |

Sources: [React versions](https://react.dev/versions) · [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) · [vite-plugin-react releases](https://github.com/vitejs/vite-plugin-react/releases) · [Trusted Types in React](https://dev.to/abhilashlr/a-complete-in-depth-guide-to-trusted-types-in-react-and-modern-web-apps-30id) · [W3C Trusted Types](https://www.w3.org/TR/trusted-types/).

## Current architecture (what we're replacing)

- **No framework today** — views are `renderX(state): string` functions returning
  HTML strings assigned to `#app` / `#workspace-container` `innerHTML` via
  `auditedStaticHtml()`, followed by `bindX(state)` functions that attach listeners
  with `getElementById`/`querySelectorAll`.
- **Single global store** (`state.ts`): `getState()` returns the live object;
  `setState(patch)` replaces it (`{...prev, ...patch}`) and notifies `subscribe()`
  listeners; the bootstrap subscribes once and calls `fullRender(state)` on change.
- **Trusted Types** (`security/trusted-types.ts`): two policies — `nexus-crm`
  (escaping) and `nexus-crm-static-template` (passthrough, via
  `createAuditedStaticHTML`). **Doc drift:** the `patchInnerHTML` prototype override
  described in `CLAUDE.md`/`frontend.md` exists only in the legacy `taskapp.html`,
  **not** in the monorepo — routing is by explicit `auditedStaticHtml()` wrapping.
- **CSP** (`generate-csp.mjs`): hashes inline `<script>` blocks after the offline
  build; `style-src` intentionally keeps `'unsafe-inline'` (177+ inline `style=`).

## Strategy — incremental strangler-fig

React mounts **inside** the existing shell and reads the **same store** via a
`useSyncExternalStore` bridge, so vanilla and React views coexist and stay
consistent during the transition. Order: foundation → build wiring → leaf views →
shell/router → retire the legacy pipeline.

The store contract maps onto React with zero store rewrite:
`useSyncExternalStore(subscribe, getState, getState)`.

## Foundation — landed this increment ✅

Verified by `pnpm typecheck` (now includes `.tsx`), `eslint`, and a unit test.

- `tsconfig.base.json`: `jsx: react-jsx`, `jsxImportSource: react`. `.tsx` added to
  `include` globs in `tsconfig.json` and `packages/core/tsconfig.json` (without this
  `tsc` silently skipped `.tsx` — a false pass; now genuinely typechecked).
- Deps: `react`/`react-dom` 19.2.x; dev `@types/react`, `@types/react-dom`,
  `@vitejs/plugin-react` v6.
- `packages/core/src/react/use-app-state.ts` — `useAppState()` store bridge.
- `packages/core/src/react/trusted-html.ts` — `dangerousAuditedHtml()`: routes
  React `dangerouslySetInnerHTML` through the `nexus-crm-static-template` policy so
  the offline CSP accepts it. Use only for trusted-static markup (e.g. `Icons` SVG);
  prefer plain JSX (auto-escaped) for all user data.
- `packages/core/src/react/mount.tsx` — `mountReact()` via `createRoot` + `StrictMode`.
- `packages/core/src/react/views/Reports.tsx` — **reference component** porting
  `views/reports.ts` (`renderReports`/`bindReports`): `useAppState()` for state,
  JSX for markup (no manual `escH`), `onClick` for handlers, existing CSS classes
  and `utils`/`Icons` reused.
- `tests/unit/react/trusted-html.test.ts` — 3 tests on the TT bridge (node env).

## Trusted Types & CSP — the critical risk, and the plan

1. **JSX auto-escapes** all interpolated values → most `escH()` call sites disappear
   and the XSS surface shrinks. `escH()` stays for any remaining raw-HTML path.
2. **`dangerouslySetInnerHTML`** is the only React innerHTML sink; it must receive a
   value from an allow-listed policy. Always go through `dangerousAuditedHtml()`.
3. **React + Trusted Types:** React's reconciler uses property/`createElement` paths
   (TT-safe) for normal rendering and does not register a TT policy for it. **To
   verify during build wiring:** confirm no unexpected policy name is required; if
   one is, add it to the CSP `trusted-types` allow-list (currently
   `nexus-crm nexus-crm-static-template dompurify`).
4. **CSP `script-src`:** after single-file bundling there is one inline module
   script → one hash; `generate-csp.mjs` already handles this. Confirm the React
   bundle produces no additional inline scripts.
5. **CSP `style-src`:** React inline `style={{}}` emits `style=` attributes →
   `style-src 'unsafe-inline'` must remain (it already does).

## Pending steps (not yet done — do next, in order)

- [ ] **Build wiring.** Add `@vitejs/plugin-react()` to `config/vite/base.config.ts`
      (shared) so all three targets transform `.tsx`. Re-run `pnpm run build:offline`
      and **prove the single-file `dist/offline/index.html` opens on `file://`**,
      `generate-csp.mjs` still succeeds, and the CSP/TT directives are intact. This
      is the explicit "prove the single-file build still works" gate. _(Not yet run —
      this increment delivered the foundation + plan only.)_
- [ ] **React test infra (also P0-6, #26).** Add a Vitest project with `jsdom` +
      `@testing-library/react` + `@vitejs/plugin-react` for `*.test.tsx`; exclude
      `.tsx` tests from the node-env `root-tests` project. Add a render test for
      `Reports.tsx`.
- [ ] **Host one React view in a real target.** Mount `Reports` into the workspace
      container via `mountReact()` behind the existing pipeline, proving coexistence.
- [ ] **Port leaf views** (no cross-view callbacks first): reports ✅(component) →
      time-tracker → calendar → trash → files → communications → documents → library.
- [ ] **Port the shell** (sidebar, topbar, workspace router, modals) and introduce a
      React router; replace `fullRender`/`appRenderWorkspace`.
- [ ] **Retire** `render-pipeline.ts` string rendering and per-view `renderX`/`bindX`
      once all views are migrated; update `CLAUDE.md`/`frontend.md` (and remove the
      stale `patchInnerHTML` reference).
- [ ] **Storybook:** migrate from `@storybook/html-vite` to the React framework.

## Per-view migration checklist

- [ ] `renderX` markup → JSX (delete manual `escH` on interpolated values)
- [ ] `bindX` listeners → `onClick`/`onChange` props or effects
- [ ] state arg → `useAppState()`; mutations stay via `setState`/`db` helpers
- [ ] any `innerHTML`/SVG → `dangerouslySetInnerHTML={dangerousAuditedHtml(...)}`
- [ ] cross-view hooks (`setXHooks`) → props/context
- [ ] render test (`*.test.tsx`) added
- [ ] legacy `views/x.ts` removed only after the shell routes to the React component

## Risks & rollback

- **Biggest risk:** breaking the offline single-file build / CSP. Mitigation: the
  build-wiring step is gated on a real `build:offline` + `file://` smoke test before
  any view is shipped to that target. The foundation added so far does **not** touch
  any target build, so existing builds are unaffected.
- **Bundle size:** React adds ~45 KB gzip to the inlined offline file. Acceptable;
  measure against `assert:bundle-size`.
- **Rollback:** until the shell is migrated, deleting the React mount call reverts to
  the vanilla pipeline with no data-model change (shared store).

## Not verified in this increment

- The single-file offline build has **not** been run with React yet (foundation is
  build-independent). Proving it is the first pending step above.
- React render-test infrastructure (jsdom + Testing Library) is **not** yet set up;
  only the node-env TT-bridge test runs today.
