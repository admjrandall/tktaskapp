# Frontend security rules

Apply whenever working in `packages/core/src/` or `apps/`. These rules are enforced by code review and must never be bypassed.

## XSS prevention — escH()

All user-visible strings must go through `escH()` from `packages/core/src/utils.ts` before interpolation into template strings used as `innerHTML`. No exceptions. The Trusted Types policy (`nexus-crm`) enforces this at the DOM boundary in browsers that support it.

## Trusted Types — load order and policy names

`security/trusted-types.ts` must remain the **first import in `bootstrap.ts`**. Two policies are registered once at module scope:

| Policy name                 | Purpose                                                    | Exported as                 |
| --------------------------- | ---------------------------------------------------------- | --------------------------- |
| `nexus-crm`                 | Escapes plain-text user data for `innerHTML`               | `_ttPolicy`                 |
| `nexus-crm-static-template` | Passes already-safe static template HTML through unchanged | `createAuditedStaticHTML()` |

Never call `trustedTypes.createPolicy()` again with either of these names — duplicate registration throws `TypeError` and breaks the app. `patchInnerHTML()` IIFE in `render-utils.ts` overrides `Element.prototype.innerHTML` so all string assignments auto-route through `createAuditedStaticHTML()`.

## IndexedDB database boundaries

The four IDB databases must remain strictly separate and never be merged:

| Database         | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `nexus_keys_v1`  | Non-extractable session `CryptoKey`                    |
| `nexus_vault_v2` | Vault metadata: salt, verify token, encrypted CRM blob |
| `nexus_data_v1`  | Individually encrypted records (`IDB_STORES`)          |
| `nexus_fs_v1`    | File System Access API handle                          |

## IDB_STORES (individually encrypted records)

`IDB_STORES` in `packages/core/src/constants.ts` currently contains 11 stores:
`documents`, `conversations`, `customFieldDefs`, `aiAttributeDefs`, `aiAttributeValues`, `extensionObjectDefs`, `extensionObjectInstances`, `workspaceLayouts`, `personaProfiles`, `automationRules`, `agentInsights`.

Any new large-content store must be added to `IDB_STORES` and routed through `_idbPutRecord` / `_idbLoadStore` in `storage/idb-data.ts`. Never add large-content stores to `STORES` (the CRM vault stores). `STORES` currently contains: `clients`, `departments`, `projects`, `tasks`, `people`, `standaloneNotes`, `tags`, `communications`, `files`, `timeEntries`, `notifications`, `trash`, `deals`, `pipelines`.

## Base64 encoding

Never use `btoa(String.fromCharCode(...array))` — this causes a `RangeError` stack overflow on Uint8Arrays larger than ~65 KB. Always use `u8ToBase64(array)` and `base64ToU8(str)` from `security/crypto.ts`. These use `Uint8Array.toBase64()` / `Uint8Array.fromBase64()` (available since September 2025) with chunked `btoa`/`atob` fallbacks.

## CSP hash regeneration

After every offline build, `generate-csp.mjs` must regenerate CSP hashes in the built file's `<meta>` CSP tag and write `dist/offline/index.sha256`. This runs automatically via the build scripts (`pnpm run build:offline`, etc.). For production offline validation, always test `dist/offline/index.html` directly — dev-server CSP hashes are not valid evidence.

## Target boundaries

Target-specific behavior belongs in thin app entry points under `apps/`. Shared business logic and UI belong in `packages/core/src/`. The core package must not import concrete adapters (`NullAdapter`, `RxDBAdapter`, `DataverseAdapter`) directly. Adapters are injected via `setAdapter()` in `storage/db.ts` before `init()` is called, from the target entry file.

## DB helpers — no direct IDB/vault access from views

All view and component code uses the helpers from `storage/db.ts`: `dbGetAll`, `dbGetById`, `dbCreate`, `dbUpdate`, `dbDelete`, `softDelete`, `restoreFromTrash`, `permanentDelete`. Never call IDB APIs or vault functions directly from views or UI components.

## Hook injection pattern

Views that need to call `appRenderWorkspace` or other functions from `bootstrap.ts`/`render-pipeline.ts` receive them via setter functions (e.g., `setFooHooks(appRenderWorkspace)`) to avoid circular imports. This pattern is wired in `hooks-wiring.ts`, which is called once from `bootstrap.ts` before the first render.

## Legacy reference file

Do not edit `taskapp.html`. It is the legacy ~7,800-line single-file reference. All active development is in the monorepo packages under `packages/core/src/` and `apps/`.
