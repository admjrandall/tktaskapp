
You are performing a full extraction of a 7,853-line single-file HTML app (`d:\techkeycrmapp\taskapp.html`) into a TypeScript monorepo. The monorepo scaffolding (folders, tsconfig, package.json, pnpm-workspace.yaml) already exists at `d:\techkeycrmapp\`.

**Your job: read taskapp.html in its entirety and write all 16 TypeScript module files, the adapter interface, the NullAdapter, and the Vite configs.**

---

## Monorepo structure already created

```
d:\techkeycrmapp\
├── package.json          ✓ written
├── pnpm-workspace.yaml   ✓ written
├── tsconfig.json         ✓ written
├── packages/
│   ├── core/src/
│   │   ├── views/        ✓ folder exists
│   │   ├── ai/           ✓ folder exists
│   │   └── styles/       ✓ folder exists
│   ├── adapter-null/src/ ✓ folder exists
│   ├── adapter-rxdb/src/ ✓ folder exists
│   └── adapter-dataverse/src/ ✓ folder exists
├── apps/
│   ├── offline/          ✓ folder exists
│   ├── sync/public/      ✓ folder exists
│   ├── dataverse/        ✓ folder exists
│   └── mobile/           ✓ folder exists
```

---

## What to write

### 1. packages/core/src/constants.ts
Extract all constants from taskapp.html lines ~2669–2677 and ~2956–2960:
- `PBKDF2_ITERATIONS`, `PBKDF2_ITERATIONS_LEGACY`, `KDF_VERSION_KEY`
- `SALT_BYTES`, `IV_BYTES`
- `VAULT_KEY`, `SALT_KEY`, `VERIFY_KEY`, `VERIFY_PAYLOAD`
- `KEYS_DB_NAME`, `SESSION_CRYPTOKEY_STORE`
- `VAULT_DB_NAME`, `VAULT_META_STORE`
- `STORES` array, `IDB_STORES` array, `DATA_DB_NAME`
- `FS_HANDLE_DB`, `FS_HANDLE_KEY`, `FS_FILENAME`
- `PRIORITIES`, `PROJECT_STAGES`, `TASK_STATUSES`, `COMM_TYPES`
- `AVATAR_COLORS`, `TAG_COLORS`
All `export const`.

### 2. packages/core/src/crypto.ts
Extract from lines ~2681–2954:
- `u8ToBase64(u8: Uint8Array): string`
- `base64ToU8(b64: string): Uint8Array`
- `deriveKey(password: string, salt: Uint8Array, iterations?: number): Promise<CryptoKey>`
- `aesEncrypt(key: CryptoKey, data: unknown): Promise<string>`
- `aesDecrypt(key: CryptoKey, b64: string): Promise<unknown>`
- `initCrypto(password: string): Promise<CryptoKey>`
- `changePassword(oldKey: CryptoKey, newPw: string): Promise<CryptoKey>`
- `exportEncryptedBackup(key: CryptoKey, pw: string): Promise<string>`
- `importEncryptedBackup(json: string, pw: string, currentKey: CryptoKey): Promise<unknown>`
- `exportJSON(key: CryptoKey): Promise<string>`
- `importJSON(json: string, key: CryptoKey): Promise<unknown>`
Imports: constants. Note: `importJSON` references `STORES` from constants.

### 3. packages/core/src/session.ts
Extract from lines ~2712–2755:
- `_keysDbOpen(): Promise<IDBDatabase>` (internal, not exported)
- `cacheSessionKey(key: CryptoKey): Promise<void>`
- `loadSessionKey(): Promise<CryptoKey | null>`
- `clearSessionKey(): Promise<void>`
Imports: constants (KEYS_DB_NAME, SESSION_CRYPTOKEY_STORE).

### 4. packages/core/src/vault.ts
Extract from lines ~2775–2909 (everything labelled "Vault" and "Migration"):
- `_vaultDbOpen(): Promise<IDBDatabase>` (internal)
- `_vaultMetaGet(k: string): Promise<unknown>`
- `_vaultMetaSet(k: string, v: unknown): Promise<void>`
- `_migrateLocalStorageToIDB(): Promise<void>`
- `getSalt(): Promise<Uint8Array>`
- `isFirstRun(): Promise<boolean>`
- `loadVault(key: CryptoKey): Promise<Record<string, unknown[]>>`
- `saveVault(key: CryptoKey, data: Record<string, unknown[]>): Promise<void>`
- `writeVerifyToken(key: CryptoKey): Promise<void>`
- `verifyPassword(key: CryptoKey): Promise<boolean>`
Imports: constants, crypto (u8ToBase64, base64ToU8, aesEncrypt, aesDecrypt, deriveKey, PBKDF2_ITERATIONS, PBKDF2_ITERATIONS_LEGACY).
Note: `initCrypto` in the original calls `loadVault`, `saveVault`, `writeVerifyToken` — move `initCrypto` here too since vault.ts owns the vault operations.

### 5. packages/core/src/idb-data.ts
Extract from lines ~2964–3040:
- `_dataDbOpen(): Promise<IDBDatabase>` (internal)
- `_idbLoadStore(storeName: string, cryptoKey: CryptoKey): Promise<unknown[]>`
- `_idbPutRecord(storeName: string, record: {id: string; [k: string]: unknown}, cryptoKey: CryptoKey): Promise<void>`
- `_idbDeleteRecord(storeName: string, id: string): Promise<void>`
- `_idbClearStore(storeName: string): Promise<void>`
IMPORTANT refactor: pass `cryptoKey` as parameter to `_idbLoadStore` and `_idbPutRecord` — do NOT use a global `_dbKey`. This is the one structural change described in the migration plan (section 12.2.4).
Imports: constants (DATA_DB_NAME), crypto (aesEncrypt, aesDecrypt).

### 6. packages/core/src/db.ts
Extract from lines ~3042–3195:
- `let _dbKey: CryptoKey | null = null` (module-level, not exported)
- `let _dbData: Record<string, unknown[]> = {}` (module-level, not exported)
- `let _adapter: SyncAdapter | null = null` (module-level)
- `export function setAdapter(a: SyncAdapter): void`
- `dbInit(cryptoKey: CryptoKey): Promise<Record<string, unknown[]>>`
- `dbFlush(): Promise<void>`
- `_scheduleFlush(): void` (internal, exported for fs.ts hook)
- `_buildCrmPayload(): Record<string, unknown[]>` (internal, exported for adapter)
- `uid(): string`
- `nowISO(): string`
- `getStore(s: string): unknown[]`
- `dbGetAll(s: string): unknown[]`
- `dbGetById(s: string, id: string): unknown | null`
- `dbCreate(s: string, rec: Record<string, unknown>): Promise<unknown>`
- `dbUpdate(s: string, id: string, changes: Record<string, unknown>): Promise<unknown>`
- `dbDelete(s: string, id: string): Promise<boolean>`
- `softDelete(s: string, id: string): Promise<boolean>`
- `restoreFromTrash(tid: string): Promise<boolean>`
- `permanentDelete(tid: string): Promise<boolean>`
- `createNotification(title: string, body: string, type?: string, relatedId?: string | null): Promise<unknown>`
- `getUnreadNotifications(): unknown[]`
- `markNotificationRead(id: string): Promise<unknown>`
- `markAllNotificationsRead(): Promise<void>`
- `checkDueDates(): Promise<void>`
- `startTimer(taskId: string, description?: string): Promise<unknown>`
- `stopTimer(id: string): Promise<unknown | null>`
- `getRunningTimer(): unknown | null`
- `globalSearch(q: string): {store: string; id: string; label: string; icon: string}[]`
Also wire in adapter pull/push as described in section 12.4.4:
- In `dbInit`: after loading _dbData, call `_adapter?.pull(checkpoint)` and merge results
- In `dbFlush`: after `saveVault`, call `_adapter?.push(_buildCrmPayload())`
Imports: constants (STORES, IDB_STORES), vault (loadVault, saveVault, _vaultMetaGet, _vaultMetaSet), idb-data (_idbLoadStore, _idbPutRecord, _idbDeleteRecord, _idbClearStore), adapter-interface (SyncAdapter — type import only).

### 7. packages/core/src/fs.ts
Extract from lines ~3229–3361:
- Module-level state: `_fsHandle`, `_fsReady`, `_fsSaving`, `_fsLastSave`
- `_idbFsOpen()`, `_idbGet()`, `_idbSet()`, `_verifyPermission()`
- `fsWriteVault(): Promise<void>`
- `fsReadVault(handle: FileSystemFileHandle): Promise<boolean>`
- `fsPickFile(forceNew?: boolean): Promise<FileSystemFileHandle | null>`
- `fsInit(): Promise<void>`
The `saveVault` hook (lines 3357–3361): In the monorepo, implement this as a wrapper exported from fs.ts — `export function hookSaveVault()` that patches vault's saveVault after fsInit. Or better: export a `fsHookSaveVault(original: typeof saveVault)` factory. Actually simplest: re-export a patched version. See note below.
Imports: constants (FS_HANDLE_DB, FS_HANDLE_KEY, FS_FILENAME, VAULT_KEY, VERIFY_KEY, SALT_KEY), vault (_vaultMetaGet, saveVault).
NOTE on the saveVault hook: In the original, `saveVault` is reassigned to wrap itself. In the module version, export a function `hookFsIntoVault(origSaveVault: Function)` that returns a wrapped version, OR simply call `fsWriteVault` from `db.ts`'s `dbFlush` after `saveVault`. The cleanest approach: in `db.ts`'s `dbFlush`, after calling `saveVault(_dbKey, _buildCrmPayload())`, also call `fsWriteVault()` if `_fsReady`. Import `{ fsWriteVault, _fsReady }` from fs.ts in db.ts for this.

### 8. packages/core/src/state.ts
Extract from lines ~3422–3451:
- `_state` initial shape (full interface with all fields typed)
- `let _listeners: Set<(s: AppState) => void>`
- `subscribe(fn: (s: AppState) => void): () => void`
- `getState(): AppState`
- `setState(patch: Partial<AppState>): void`
- `setTheme(t: string): void`
- `initTheme(): void`
- `reloadData(): void`
- `showToast(message: string, type?: string, duration?: number): void`
- `showConfirm(message: string, onConfirm: () => void, onCancel?: (() => void) | null): void`
- `closeConfirm(): void`
- `openRecordModal(store: string, id?: string | null, defaults?: Record<string, unknown>): void`
- `closeRecordModal(): void`
- `navigate(view: string): void`
Export the `AppState` interface too.
Imports: db (dbGetAll, getRunningTimer).
Note: `navigate` calls `aiNeedsOnboarding()` and `openAIWizard()`. In the module version, these should be injected via a setter: `export function setAIHooks(needsOnboarding: () => boolean, openWizard: (step: number) => void): void` — called from main.ts after the AI modules load.

### 9. packages/core/src/utils.ts
Extract from lines ~3197–3227:
- `sanitize`, `formatDate`, `formatRelative`, `formatDuration`, `formatFileSize`
- `parseDateLocal`, `daysUntil`
- `initials`, `avatarColor`, `sortRecords`, `filterRecords`, `searchRecords`
- `debounce`, `downloadText`, `toCSV`
- `plural`, `readFileAsText`, `readFileAsBase64`, `clamp`, `escH`
All exported. No imports needed (pure functions, constants like AVATAR_COLORS can be imported from constants.ts or defined locally — import from constants).

### 10. packages/core/src/icons.ts
Extract from lines ~3364–3420 (the `Icons` object and the `ico` helper):
```ts
const ico = (p: string, s = 20, vb = '0 0 24 24'): string => ...
export const Icons = { Dashboard, Clients, ... }
```
No imports.

### 11. packages/core/src/trusted-types.ts
Extract from lines ~2616–2661 (Trusted Types policies and patchInnerHTML IIFE):
- `export const _ttPolicy: TrustedTypePolicy | null`
- `export const _rawPolicy: TrustedTypePolicy | null`
- The `patchInnerHTML` IIFE runs as a side effect on import
No imports. MUST be the first import in main.ts.

### 12. packages/core/src/components.ts
Extract from lines ~3461–3542:
- `renderToast`, `renderConfirmDialog`, `bindConfirmDialog`
- `renderAvatar`, `renderPriorityBadge`, `renderDueBadge`
- `renderSpinner`, `renderEmpty`, `renderSearchInput`, `renderViewTabs`
- `renderCommandPalette`, `bindCommandPalette`, `_cmdQuery`, `_cmdSel`, `CMD_ACTIONS`
- `getCmdItems`, `renderNotifPanel`
All exported. Imports: state, utils (escH, formatDate, formatRelative, daysUntil, initials, avatarColor), icons (Icons), db (globalSearch).

### 13. packages/core/src/views/ — one file per view

Read lines 3544–7392 to extract these views. Each file follows the pattern:
```ts
import { escH, formatDate, formatRelative, ... } from '../utils.js';
import { getState, setState, navigate, ... } from '../state.js';
import { dbGetAll, dbGetById, dbCreate, dbUpdate, dbDelete, ... } from '../db.js';
import { Icons } from '../icons.js';
import { renderAvatar, renderPriorityBadge, ... } from '../components.js';

export function renderXxx(...): string { ... }
export function bindXxx(...): void { ... }
```

Files to create:
- `views/list-grid-kanban-spatial.ts` — renderListView, bindListView, renderGridView, bindGridView, renderKanbanView, bindKanbanView, renderSpatialCanvas, bindSpatialCanvas (lines 3549–3662)
- `views/project-canvas.ts` — all pc* functions (lines 3665–4117)
- `views/record-modal.ts` — renderRecordModal, bindRecordModal (lines 4119–4224)
- `views/workspace.ts` — renderWorkspace, bindWorkspace (lines 4225–4286)
- `views/dashboard.ts` — renderDashboard, bindDashboard (lines 4287–4375)
- `views/calendar.ts` — renderCalendar, bindCalendar (lines 4376–4450ish)
- `views/time-tracker.ts` — renderTimeTracker, bindTimeTracker
- `views/reports.ts` — renderReports, bindReports
- `views/trash.ts` — renderTrash, bindTrash
- `views/settings.ts` — renderSettings, bindSettings
- `views/documents.ts` — renderDocuments, bindDocuments, DOCX export functions (lines 4655–5108)
- `views/library.ts` — renderLibrary, bindLibrary, doc modal, file viewer (lines 5110–5386)
- `views/files.ts` — renderFilesView, bindFilesView (lines 7393–7450ish)
- `views/sidebar.ts` — renderSidebar, bindSidebar (lines ~7450–7500)
- `views/topbar.ts` — renderTopbar, bindTopbar (lines ~7500–7526)

### 14. packages/core/src/ai/

- `ai-v1.ts` — extract lines 5395–6594
- `ai-v2.ts` — extract lines 6595–7392
These are large. Preserve all existing function logic exactly. Export every function.
Imports: state, db, utils, icons, components, vault.
The IIFE pattern `const _origStartAILoad = (function() { return startAILoad; })();` from ai-v2 must be preserved exactly — it's a hoisting workaround described in CLAUDE.md.

### 15. packages/core/src/auth.ts
Extract from lines ~7527–7681:
- `renderAuth`, `bindAuth`
- `_authFailCount`, `_authLockedUntil` (module-level state)
Imports: crypto (initCrypto, verifyPassword), vault (_migrateLocalStorageToIDB, isFirstRun, writeVerifyToken), session (cacheSessionKey, loadSessionKey), state (setState, getState, showToast), utils (escH), icons (Icons), fs (fsInit).

### 16. packages/core/src/main.ts
Extract from lines ~7682–7851:
```ts
import './trusted-types.js';  // MUST be first
import './styles/main.css';
import { initTheme, setState, getState, subscribe, reloadData, setAIHooks } from './state.js';
import { dbInit } from './db.js';
import { setAdapter } from './db.js';
import { fsInit } from './fs.js';
import { checkDueDates } from './db.js';
// ... all view imports
import { init as authInit, renderAuth, bindAuth } from './auth.js';
// ... etc

export function fullRender(state: AppState): void { ... }
export function appRenderWorkspace(view: string): void { ... }
export async function init(): Promise<void> { ... }
```
The `setAdapter` call goes in the app entry file (apps/offline/src/entry.ts), not here. But `init()` should call `setAdapter` only if no adapter has been set yet (default to NullAdapter) so the core works standalone.

---

## Adapter files

### packages/core/src/adapter-interface.ts
```ts
export abstract class SyncAdapter {
  async pull(checkpoint: unknown): Promise<{ records: Record<string, unknown[]>; checkpoint: unknown }> {
    return { records: {}, checkpoint: null };
  }
  async push(changes: Record<string, unknown[]>): Promise<{ conflicts: unknown[] }> {
    return { conflicts: [] };
  }
  stream(onRemoteChange: (changes: Record<string, unknown[]>) => void): () => void {
    return () => {};
  }
  async clear(): Promise<void> {}
}
```

### packages/adapter-null/src/index.ts
```ts
import { SyncAdapter } from '@core/adapter-interface.js';
export class NullAdapter extends SyncAdapter {}
```

### packages/adapter-rxdb/src/index.ts
Stub only:
```ts
import { SyncAdapter } from '@core/adapter-interface.js';
// TODO: implement RxDB sync
export class RxDBAdapter extends SyncAdapter {}
```

### packages/adapter-dataverse/src/index.ts
Stub only:
```ts
import { SyncAdapter } from '@core/adapter-interface.js';
// TODO: implement Dataverse sync
export class DataverseAdapter extends SyncAdapter {}
```

---

## App entry files

### apps/offline/index.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src {{SCRIPT_HASHES}} 'strict-dynamic'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; worker-src blob:; object-src 'none'; base-uri 'none'; trusted-types nexus-crm nexus-crm-raw; require-trusted-types-for 'script';">
  <meta http-equiv="Referrer-Policy" content="no-referrer">
  <meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()">
  <title>Task App CRM</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/entry.ts"></script>
</body>
</html>
```

### apps/offline/src/entry.ts
```ts
import { NullAdapter } from '@adapter-null/index.js';
import { setAdapter } from '@core/db.js';
import { init } from '@core/main.js';
setAdapter(new NullAdapter());
init();
```

### apps/offline/vite.config.ts
```ts
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

export default defineConfig({
  root: '.',
  plugins: [viteSingleFile()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    outDir: '../../dist/offline',
    emptyOutDir: true,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  resolve: {
    alias: {
      '@core':         path.resolve(__dirname, '../../packages/core/src'),
      '@adapter-null': path.resolve(__dirname, '../../packages/adapter-null/src'),
    },
  },
});
```

### apps/sync/index.html — same as offline but with manifest link
### apps/sync/src/entry.ts — same pattern as offline/entry.ts for now (NullAdapter until RxDB)
### apps/sync/vite.config.ts — same as offline but outDir: '../../dist/sync'

---

## CSS

### packages/core/src/styles/main.css
Copy the contents of the `<style>` block from taskapp.html (lines 29–2608). This is the full CSS. Do not edit it — copy exactly.

---

## Critical rules

1. Every function from taskapp.html that is currently global must become an **exported** TypeScript function in its module.
2. All user-visible strings remain behind `escH()` — don't change any template literals.
3. The `_dbKey` circular dependency fix (pass `cryptoKey` as parameter to `_idbLoadStore` and `_idbPutRecord`) is the only structural change to logic.
4. `trusted-types.ts` side effects (patchInnerHTML IIFE) remain — they run on import.
5. The IIFE hoisting pattern in ai-v2: `const _origStartAILoad = (function() { return startAILoad; })();` — preserve exactly, do not simplify.
6. No new logic. No refactoring beyond what's described. Copy the existing code and add `export`/`import` statements.
7. Use TypeScript `strict: true` — add type annotations where needed but don't change function logic.
8. For DOM types that aren't in standard TypeScript DOM lib (like `FileSystemFileHandle`, `TrustedTypePolicy`), add `/// <reference types="..." />` or use `unknown` casts as needed.
9. Write all files using absolute paths under `d:\techkeycrmapp\`.

## Reading strategy

Read taskapp.html in these chunks to get all the code:
- Lines 29–2612: CSS (→ styles/main.css)
- Lines 2614–3452: Block 1 (crypto, session, vault, idb-data, db, utils, fs, icons, state)
- Lines 3461–3543: Block 2 (components)
- Lines 3544–3663: Block 3 (list/grid/kanban/spatial views)
- Lines 3665–4117: Block 4 (project canvas)
- Lines 4119–4224: Block 5 (record modal)
- Lines 4225–4286: Block 6 (workspace)
- Lines 4287–4375: Block 7 (dashboard)
- Lines 4376–4653: Block 8 (calendar, time tracker, reports, trash, settings)
- Lines 4655–5108: Block 9 (documents)
- Lines 5110–5386: Block 10 (library)
- Lines 5395–6594: Block 11 (ai-v1)
- Lines 6595–7392: Block 12 (ai-v2)
- Lines 7393–7526: Block 13 (files, sidebar, topbar)
- Lines 7527–7681: Block 14 (auth)
- Lines 7682–7851: Block 15 (bootstrap/main)

Read each chunk, then immediately write the corresponding module file(s) before reading the next chunk. This keeps context manageable.

When done, report: which files were written, any TypeScript issues encountered, and whether any section of taskapp.html was too ambiguous to extract cleanly.
