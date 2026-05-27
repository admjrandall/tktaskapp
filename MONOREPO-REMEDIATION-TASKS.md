# Monorepo Remediation Tasks — Task App CRM
**Date:** 2026-05-27  
**Scope:** 19 items identified in the pnpm + Turborepo audit.  
**How to use:** Open a new Claude Code session, paste the **Session Starting Prompt** at the top of this file first, then paste the individual task prompt. Complete tasks in priority order — Critical items unblock everything below them.

---

## Session Starting Prompt

Paste this at the start of every new session before any task prompt:

```
You are working on Task App CRM — an offline-first, AES-256-GCM encrypted CRM.
It is a TypeScript monorepo using pnpm 11 workspaces + Turborepo 2.9.

Repo root: /home/user/tktaskapp
Branch: claude/dazzling-edison-5mQPZ  ← all changes go here

Key facts about the current state:
- packages/* (core, adapter-null, adapter-rxdb, adapter-rxdb-couchdb, adapter-dataverse,
  adapter-mobile-native, adapter-kms) have tsconfig.json with composite:true but NO package.json
- apps/enterprise-web and apps/dataverse have vite.config.ts but NO package.json
- apps/offline-web and server ARE proper workspace packages (have package.json)
- Most builds bypass Turborepo (root scripts call vite directly)
- turbo.json is missing tasks for enterprise, dataverse, and offline profile variants
- Path aliases (@core/*, @adapter-*/*, @config/*) are duplicated in tsconfig.json,
  vitest.config.ts, and each vite.config.ts

Security invariants that must never be broken:
- escH() before every innerHTML interpolation
- security/trusted-types.ts must be first import in bootstrap.ts
- _dbKey must always be extractable: false
- All server CRM queries through withTenant()
- All mutations via writeAuditEvent()
- High-risk routes require requireStepUp()

Before writing any code: read the files you are about to change.
After completing the task: run pnpm typecheck && pnpm lint && pnpm test and fix any failures.
Commit to branch claude/dazzling-edison-5mQPZ and push.
```

---

## CRITICAL — Complete in Order (Each Unblocks the Next)

---

### Task 1 — Add `package.json` to all `packages/*` workspace packages

**Priority:** Critical  
**Effort:** High  
**Unblocks:** Tasks 2, 3, 6, 8, 11, 17

**Context:**  
The seven packages under `packages/` have `tsconfig.json` with `composite: true` but no `package.json`. This means pnpm does not recognise them as workspace packages, Turborepo cannot run per-package tasks on them, and no `workspace:*` protocol dependency declarations are possible. The `pnpm-workspace.yaml` entry `packages/*` is currently a no-op for all seven packages.

**Packages to fix:**
- `packages/core`
- `packages/adapter-null`
- `packages/adapter-rxdb`
- `packages/adapter-rxdb-couchdb`
- `packages/adapter-dataverse`
- `packages/adapter-mobile-native`
- `packages/adapter-kms`

**Files to read before starting:**
- `/home/user/tktaskapp/pnpm-workspace.yaml`
- `/home/user/tktaskapp/apps/offline-web/package.json` (use as template for app-style)
- `/home/user/tktaskapp/package.json` (root — check existing deps to avoid duplication)
- Each `packages/*/tsconfig.json`

**Task Prompt:**
```
Task 1 of 19 — Add package.json to all packages/* workspace packages.

Read the files listed above before writing anything.

For each of the 7 packages under packages/ (core, adapter-null, adapter-rxdb,
adapter-rxdb-couchdb, adapter-dataverse, adapter-mobile-native, adapter-kms),
create a package.json with these properties:

  name:        "@tktaskapp/<folder-name>"   e.g. "@tktaskapp/core"
  version:     "0.0.0"
  private:     true
  type:        "module"
  main:        "./dist/index.js"
  types:       "./dist/index.d.ts"
  exports:
    ".":
      import:  "./dist/index.js"
      types:   "./dist/index.d.ts"
  scripts:
    build:     "tsc --build"
    typecheck: "tsc --noEmit"
    lint:      "eslint src"
  devDependencies: {}   (leave empty — shared deps live at root)

Do NOT move any dependencies from the root package.json into individual packages yet
— that is a separate task (Task 11, pnpm catalogs).

After creating all 7 files:
1. Run: pnpm install   (pnpm will now detect and link the new workspace packages)
2. Verify: pnpm ls --depth 0  (all 7 packages should appear)
3. Run: pnpm typecheck && pnpm lint
4. Fix any failures before committing.
5. Commit message: "chore: add package.json to all packages/* workspace members"
```

**Success criteria:**
- `pnpm ls` shows all 7 packages
- `pnpm typecheck` still passes
- No new lint errors

---

### Task 2 — Add `package.json` to `apps/enterprise-web`, `apps/dataverse`, and `apps/mobile`

**Priority:** Critical  
**Effort:** Medium  
**Depends on:** Task 1 complete  
**Unblocks:** Task 3

**Context:**  
`apps/enterprise-web` and `apps/dataverse` have `vite.config.ts` but no `package.json`. Turborepo requires `package.json` to discover a package. Without it these apps cannot be build targets in the Turbo graph. `apps/mobile` has Capacitor config but also no `package.json`.

**Files to read before starting:**
- `/home/user/tktaskapp/apps/offline-web/package.json`
- `/home/user/tktaskapp/apps/enterprise-web/vite.config.ts`
- `/home/user/tktaskapp/apps/dataverse/vite.config.ts`
- `/home/user/tktaskapp/apps/mobile/capacitor.config.ts`

**Task Prompt:**
```
Task 2 of 19 — Add package.json to apps/enterprise-web, apps/dataverse, apps/mobile.

Read the files listed above before writing anything.

Create package.json for each app:

apps/enterprise-web/package.json:
  name:     "@tktaskapp/enterprise-web"
  version:  "0.0.0"
  private:  true
  type:     "module"
  scripts:
    build:     "vite build"
    typecheck: "tsc --noEmit"
    lint:      "eslint src"
  devDependencies: {}

apps/dataverse/package.json:
  name:     "@tktaskapp/dataverse"
  version:  "0.0.0"
  private:  true
  type:     "module"
  scripts:
    build:     "vite build"
    typecheck: "tsc --noEmit"
    lint:      "eslint src"
  devDependencies: {}

apps/mobile/package.json:
  name:     "@tktaskapp/mobile"
  version:  "0.0.0"
  private:  true
  type:     "module"
  scripts:
    sync:  "cap sync"
    open:  "cap open ios"
  devDependencies: {}

After creating files:
1. Run: pnpm install
2. Verify: pnpm ls --depth 0  (new apps should appear)
3. Run: pnpm typecheck && pnpm lint
4. Fix any failures.
5. Commit message: "chore: add package.json to enterprise-web, dataverse, mobile apps"
```

**Success criteria:**
- `pnpm ls` shows the three new app packages
- Existing builds (`pnpm run build:offline`, `pnpm run build:enterprise`) still work

---

### Task 3 — Wire all builds through Turborepo and fix `turbo.json`

**Priority:** Critical  
**Effort:** Medium  
**Depends on:** Tasks 1 and 2 complete  
**Unblocks:** All caching benefits

**Context:**  
The root `package.json` scripts call Vite directly, bypassing Turborepo entirely. The `turbo.json` is missing tasks for `build:enterprise`, `build:dataverse`, `build:offline:no-ai`, `build:offline:internal-ai`. Without these tasks, Turborepo provides zero caching for these builds. The `outputs` field is also missing from several tasks, which means Turborepo caches only logs — not build artifacts.

**Files to read before starting:**
- `/home/user/tktaskapp/turbo.json`
- `/home/user/tktaskapp/package.json` (root scripts)
- `/home/user/tktaskapp/apps/offline-web/package.json`
- `/home/user/tktaskapp/apps/enterprise-web/package.json` (created in Task 2)
- `/home/user/tktaskapp/apps/dataverse/package.json` (created in Task 2)

**Task Prompt:**
```
Task 3 of 19 — Wire all builds through Turborepo and fix turbo.json.

Read the files listed above before writing anything.

Step 1 — Update turbo.json to add missing tasks and fix outputs:

The current turbo.json is missing tasks for the enterprise, dataverse, and
offline variant builds. It also has missing or incorrect outputs on existing tasks.

Add or update these tasks in turbo.json:

"build:offline": {
  "description": "Build offline single-file bundle (browser-ai profile) and regenerate CSP hashes",
  "dependsOn": ["^build"],
  "inputs": ["src/**", "vite.config.ts", "tsconfig.json", "../../config/**"],
  "outputs": ["../../dist/offline/**"]
}

"build:offline:no-ai": {
  "description": "Build offline single-file bundle (no-ai profile) and regenerate CSP hashes",
  "dependsOn": ["^build"],
  "inputs": ["src/**", "vite.no-ai.config.ts", "tsconfig.json", "../../config/**"],
  "outputs": ["../../dist/offline-no-ai/**"]
}

"build:offline:internal-ai": {
  "description": "Build offline single-file bundle (internal-ai profile) and regenerate CSP hashes",
  "dependsOn": ["^build"],
  "inputs": ["src/**", "vite.internal-ai.config.ts", "tsconfig.json", "../../config/**"],
  "outputs": ["../../dist/offline-internal-ai/**"]
}

"build:enterprise": {
  "description": "Build enterprise PWA bundle for HTTPS deployment",
  "dependsOn": ["^build"],
  "inputs": ["src/**", "vite.config.ts", "tsconfig.json", "../../config/**"],
  "outputs": ["../../dist/enterprise/**"]
}

"build:dataverse": {
  "description": "Build Power Platform Code App bundle (flat naming, no hashes)",
  "dependsOn": ["^build"],
  "inputs": ["src/**", "vite.config.ts", "tsconfig.json", "../../config/**"],
  "outputs": ["../../dist/dataverse/**"]
}

Also fix the existing "build" task — ensure outputs is "dist/**".

Step 2 — Add the matching scripts to each app package.json:

apps/offline-web/package.json:   already has "build": "vite build" — add:
  "build:offline": "vite build --config vite.config.ts"
  "build:offline:no-ai": "vite build --config vite.no-ai.config.ts && node ../../scripts/normalize-offline-profile-output.mjs ../../dist/offline-no-ai && node ../../generate-csp.mjs ../../dist/offline-no-ai/index.html"
  "build:offline:internal-ai": "vite build --config vite.internal-ai.config.ts && node ../../scripts/normalize-offline-profile-output.mjs ../../dist/offline-internal-ai && node ../../generate-csp.mjs ../../dist/offline-internal-ai/index.html"

apps/enterprise-web/package.json: "build": "vite build"
apps/dataverse/package.json:      "build": "vite build"

Step 3 — Update root package.json build scripts to use turbo run:

Change:
  "build:offline":           current direct vite call
  "build:offline:no-ai":     current direct vite call
  "build:offline:internal-ai": current direct vite call
  "build:enterprise":        current direct vite call
  "build:dataverse":         current direct vite call
  "build:all":               current sequential pnpm run calls

To:
  "build:offline":             "turbo run build:offline --filter=@tktaskapp/offline-web"
  "build:offline:no-ai":       "turbo run build:offline:no-ai --filter=@tktaskapp/offline-web"
  "build:offline:internal-ai": "turbo run build:offline:internal-ai --filter=@tktaskapp/offline-web"
  "build:enterprise":          "turbo run build:enterprise --filter=@tktaskapp/enterprise-web"
  "build:dataverse":           "turbo run build:dataverse --filter=@tktaskapp/dataverse"
  "build:all":                 "turbo run build:offline build:offline:no-ai build:offline:internal-ai build:enterprise build:dataverse"

IMPORTANT: Do not change the behaviour of generate-csp.mjs — it must still run
after every offline variant build. Verify this is preserved in the scripts.

After changes:
1. Run: pnpm run build:offline    (should invoke turbo, complete, show cache miss)
2. Run: pnpm run build:offline    (second run should show cache hit)
3. Run: pnpm run build:enterprise
4. Run: pnpm typecheck && pnpm lint
5. Commit message: "feat: wire all builds through Turborepo with correct task inputs/outputs"
```

**Success criteria:**
- Second run of any build shows `>>> FULL TURBO` (cache hit)
- `dist/offline/index.html` still contains valid CSP hashes after cached and uncached builds
- `pnpm run build:all` completes without error

---

### Task 4 — Fix `turbo.json` `typecheck` task dependency

**Priority:** Critical (but small)  
**Effort:** Low  
**Depends on:** Task 3 complete

**Context:**  
`typecheck` in `turbo.json` has `"dependsOn": ["^build"]` — it waits for upstream packages to build before typechecking. This is wrong: typecheck only needs upstream typecheck to pass, or can run independently. Requiring a full build before typecheck slows the pipeline unnecessarily.

**Files to read before starting:**
- `/home/user/tktaskapp/turbo.json`

**Task Prompt:**
```
Task 4 of 19 — Fix typecheck task dependency in turbo.json.

Read turbo.json before changing it.

Change the "typecheck" task from:
  "dependsOn": ["^build"]
To:
  "dependsOn": ["^typecheck"]

Also change "//#typecheck" (root task) to confirm it has:
  "dependsOn": []

This allows typecheck to run in parallel with builds rather than waiting for them.

Run: pnpm typecheck   — must still pass after the change.
Commit message: "fix: typecheck turbo task should depend on ^typecheck not ^build"
```

---

## SIGNIFICANT — Complete After Criticals

---

### Task 5 — Wire TypeScript project references in root `tsconfig.json`

**Priority:** Significant  
**Effort:** Medium  
**Depends on:** Task 1 complete (packages have tsconfig.json with composite:true)

**Context:**  
Every package `tsconfig.json` already has `composite: true` and `declarationMap: true` — the prerequisites for TypeScript project references are in place. But the root `tsconfig.json` has no `references` array. Without it, `tsc --build` from the root doesn't do incremental compilation, IDEs fall back to path aliases for cross-package navigation, and the 10x incremental build speed of project references is not realised.

**Files to read before starting:**
- `/home/user/tktaskapp/tsconfig.json`
- `/home/user/tktaskapp/tsconfig.base.json`
- All `packages/*/tsconfig.json`
- All `apps/*/tsconfig.json` (if they exist)
- `/home/user/tktaskapp/server/tsconfig.json`

**Task Prompt:**
```
Task 5 of 19 — Wire TypeScript project references in root tsconfig.json.

Read all the files listed above before changing anything.

Step 1 — Add a "references" array to the root tsconfig.json pointing to all
packages and apps that have composite:true in their tsconfig.json:

{
  "references": [
    { "path": "packages/core" },
    { "path": "packages/adapter-null" },
    { "path": "packages/adapter-rxdb" },
    { "path": "packages/adapter-rxdb-couchdb" },
    { "path": "packages/adapter-dataverse" },
    { "path": "packages/adapter-mobile-native" },
    { "path": "packages/adapter-kms" },
    { "path": "apps/offline-web" },
    { "path": "apps/enterprise-web" },
    { "path": "apps/dataverse" }
  ]
}

Do NOT add server — it has its own tsconfig and is a separate compilation unit.

Step 2 — Each package that is referenced by another package must itself declare
references to its dependencies. Check each packages/*/tsconfig.json:
- packages/adapter-rxdb references packages/core? If core types are used, add reference.
- packages/adapter-null references packages/core? Same check.
- apps/* reference packages/core and the relevant adapter? Add references.

Only add a reference if the package actually imports from the other.
Do NOT guess — read the actual import statements in each package's src/index.ts
or entry file to determine real dependencies.

Step 3 — Add "composite": true to the root tsconfig.json compilerOptions if not present.

After changes:
1. Run: pnpm typecheck   (must pass — this uses tsc --noEmit, not --build)
2. Run: npx tsc --build tsconfig.json   (incremental build — must complete without error)
3. Commit message: "feat: wire TypeScript project references in root tsconfig.json"
```

**Success criteria:**
- `npx tsc --build` completes without error
- Second run of `npx tsc --build` completes faster (incremental)
- `pnpm typecheck` still passes

---

### Task 6 — Add `tsconfig.json` to `packages/adapter-rxdb-couchdb`

**Priority:** Significant  
**Effort:** Low  
**Depends on:** Task 1 complete

**Context:**  
Every other adapter package has a `tsconfig.json` with `composite: true`. `adapter-rxdb-couchdb` is the only one missing it. Without it the package cannot participate in TypeScript project references and cannot be independently compiled.

**Files to read before starting:**
- `/home/user/tktaskapp/packages/adapter-null/tsconfig.json` (use as template)
- `/home/user/tktaskapp/packages/adapter-rxdb-couchdb/` (list contents to understand what exists)

**Task Prompt:**
```
Task 6 of 19 — Add tsconfig.json to packages/adapter-rxdb-couchdb.

Read packages/adapter-null/tsconfig.json — use it as the exact template.
List the contents of packages/adapter-rxdb-couchdb/ to confirm what exists.

Create packages/adapter-rxdb-couchdb/tsconfig.json by copying the structure
from adapter-null/tsconfig.json exactly (extends ../../tsconfig.base.json,
composite: true, declarationMap: true, outDir: dist, include: ["src/**/*.ts"]).

Then check whether adapter-rxdb-couchdb imports from packages/core or packages/adapter-rxdb.
If it does, add the appropriate references array to the new tsconfig.json.

Run: pnpm typecheck   — must still pass.
Commit message: "fix: add missing tsconfig.json to adapter-rxdb-couchdb"
```

---

### Task 7 — Consolidate path alias definitions into a single shared config

**Priority:** Significant  
**Effort:** Medium

**Context:**  
The same alias map (`@core/*`, `@adapter-rxdb/*`, `@adapter-null/*`, `@adapter-dataverse/*`, `@adapter-mobile-native/*`, `@config/*`) is defined independently in three places: `tsconfig.json` `compilerOptions.paths`, `vitest.config.ts` `resolve.alias`, and each `apps/*/vite.config.ts` `resolve.alias`. Any change requires updating all three. The correct pattern is a single shared file consumed by all three.

**Files to read before starting:**
- `/home/user/tktaskapp/tsconfig.json`
- `/home/user/tktaskapp/vitest.config.ts`
- `/home/user/tktaskapp/apps/offline-web/vite.config.ts`
- `/home/user/tktaskapp/apps/enterprise-web/vite.config.ts`
- `/home/user/tktaskapp/apps/dataverse/vite.config.ts`
- `/home/user/tktaskapp/config/vite/base.config.ts`

**Task Prompt:**
```
Task 7 of 19 — Consolidate path alias definitions into a single shared config.

Read all files listed above before writing anything.

Step 1 — Create /home/user/tktaskapp/config/aliases.ts:

This file exports two things:
1. tsconfigPaths — the paths object for tsconfig.json (string[] values with /* suffix)
2. viteAliases — an array of { find, replacement } objects for Vite/Vitest resolve.alias

Use path.resolve and fileURLToPath to make all paths absolute and platform-safe.
Base the paths on import.meta.url or __dirname as appropriate for ESM.

The aliases to define (matching what currently exists across all three locations):
  @core        → packages/core/src
  @adapter-null → packages/adapter-null/src
  @adapter-rxdb → packages/adapter-rxdb/src
  @adapter-rxdb-couchdb → packages/adapter-rxdb-couchdb/src
  @adapter-dataverse → packages/adapter-dataverse/src
  @adapter-mobile-native → packages/adapter-mobile-native/src
  @adapter-kms → packages/adapter-kms/src
  @config      → config

Step 2 — Update vitest.config.ts to import viteAliases from config/aliases.ts
and use it in resolve.alias, replacing the current inline definitions.

Step 3 — Update each app vite.config.ts to import viteAliases from config/aliases.ts
(adjust path as needed). Each app uses only the subset it needs — but importing the full
map causes no harm (unused aliases are ignored by Vite).

Step 4 — The tsconfig.json paths cannot import from a TS file at type-check time,
so keep the paths in tsconfig.json as-is. Add a comment noting they must be kept
in sync with config/aliases.ts.

After changes:
1. Run: pnpm run build:offline   — bundle must complete correctly
2. Run: pnpm run build:enterprise
3. Run: pnpm typecheck && pnpm test
4. Commit message: "refactor: consolidate path alias definitions into config/aliases.ts"
```

---

## MODERATE — Complete After Significants

---

### Task 8 — Configure Turborepo remote caching (self-hosted, S3-backed)

**Priority:** Moderate  
**Effort:** High  
**Depends on:** Task 3 complete

**Context:**  
Turborepo currently uses only local caching. For a codebase with 3 offline build profiles, enterprise, dataverse, and a server build, remote caching would eliminate repeated full rebuilds in CI. Given the security posture of this project (AES-256-GCM CRM, compliance-adjacent), Vercel's hosted remote cache is not appropriate. The self-hosted `turborepo-remote-cache` package (ducktors/turborepo-remote-cache) with an S3 backend is the correct choice — Mercari Engineering validated this pattern in February 2026 and reported 50% CI time reduction.

**Files to read before starting:**
- `/home/user/tktaskapp/turbo.json`
- `/home/user/tktaskapp/.github/workflows/` (if exists — check CI config)
- `/home/user/tktaskapp/docker-compose.yml`

**Task Prompt:**
```
Task 8 of 19 — Configure Turborepo remote caching (self-hosted, S3-backed).

Read the files listed above before writing anything.

This task configures the infrastructure and Turbo settings for a self-hosted
remote cache. It does NOT provision actual AWS resources — that requires real
credentials which are external values.

Step 1 — Add remote cache configuration to turbo.json:

In turbo.json, add at the top level:
{
  "remoteCache": {
    "enabled": true,
    "signature": true
  }
}

The "signature": true setting cryptographically signs cache artifacts —
important for a security-sensitive codebase.

Step 2 — Document the required environment variables by creating
/home/user/tktaskapp/docs/remote-cache-setup.md with:

- TURBO_TOKEN    — API token for the self-hosted cache server
- TURBO_TEAM     — team identifier (e.g. "tktaskapp")
- TURBO_API      — URL of the self-hosted cache server (e.g. https://cache.internal.example.com)
- Instructions for deploying ducktors/turborepo-remote-cache to Docker/K8s with S3 backend
- Reference: https://github.com/ducktors/turborepo-remote-cache
- Note that TURBO_REMOTE_CACHE_SIGNATURE_KEY must be set on the cache server
  for artifact signing to work

Step 3 — If a GitHub Actions workflow file exists in .github/workflows/, add the
three env vars (TURBO_TOKEN, TURBO_TEAM, TURBO_API) as documented references
(using ${{ secrets.TURBO_TOKEN }} syntax) so CI is ready once the server is provisioned.
Do not hardcode any values.

Step 4 — Add TURBO_TOKEN, TURBO_TEAM, TURBO_API to server/.env.example and root .env.example
with placeholder values and comments explaining their purpose.

Run: pnpm typecheck && pnpm lint
Commit message: "feat: configure Turborepo self-hosted remote cache with S3 backend"
```

---

### Task 9 — Add `projectService: true` to ESLint parser options

**Priority:** Moderate  
**Effort:** Low

**Context:**  
The `eslint.config.mjs` uses `typescript-eslint` with `strict-type-checked` rules, which is correct. However, `parserOptions.projectService` is not set. This option (stable in 2025, 2026 best practice) makes the TypeScript ESLint parser use TypeScript's own incremental project service for type information — giving approximately 10x faster typed linting in large monorepos with project references.

**Files to read before starting:**
- `/home/user/tktaskapp/eslint.config.mjs`
- `/home/user/tktaskapp/tsconfig.json`

**Task Prompt:**
```
Task 9 of 19 — Add projectService: true to ESLint parser options.

Read eslint.config.mjs and tsconfig.json before changing anything.

In eslint.config.mjs, find the TypeScript parser configuration block.
It currently sets parserOptions with a project or projectFolders property.

Add to the languageOptions.parserOptions object:
  projectService: true,
  tsconfigRootDir: import.meta.dirname,

If there is an existing "project" or "projectFolders" property, replace it
with the projectService approach — they are mutually exclusive.

The typescript-eslint docs (https://typescript-eslint.io/packages/parser/#projectservice)
confirm projectService is the recommended approach for monorepos as of 2025+.

After the change:
1. Run: pnpm lint   — must produce the same errors/warnings as before (no new issues)
2. Measure approximate lint time before and after if possible (time pnpm lint)
3. Commit message: "perf: use ESLint projectService for faster typed linting in monorepo"
```

---

### Task 10 — Enable ESLint on `vite.config.ts` files

**Priority:** Moderate  
**Effort:** Low

**Context:**  
`eslint.config.mjs` currently ignores all `**/vite.config.ts` files. These files define `__APP_VERSION__`, chunk strategies, alias maps, CSP-relevant build output paths, and Trusted Types configuration. For a security-sensitive application, these files should be linted.

**Files to read before starting:**
- `/home/user/tktaskapp/eslint.config.mjs`
- `/home/user/tktaskapp/apps/offline-web/vite.config.ts`
- `/home/user/tktaskapp/apps/enterprise-web/vite.config.ts`
- `/home/user/tktaskapp/apps/dataverse/vite.config.ts`
- `/home/user/tktaskapp/config/vite/base.config.ts`

**Task Prompt:**
```
Task 10 of 19 — Enable ESLint on vite.config.ts files.

Read all listed files before changing anything.

Step 1 — Remove **/vite.config.ts from the eslint.config.mjs ignores array.

Step 2 — Run: pnpm lint
Note every new lint error or warning that appears from the vite config files.

Step 3 — Fix each error. Common issues in vite config files:
- Unsafe type assertions: add explicit types
- Any-typed variables: annotate or cast properly
- Unused imports: remove
Do NOT suppress errors with eslint-disable comments unless there is a documented
reason (e.g. a Vite API quirk). Fix the underlying issue instead.

Step 4 — If any of the vite.config.ts files use innerHTML or other DOM APIs
(unlikely but check), verify they comply with the escH() and Trusted Types rules.

Run: pnpm lint && pnpm typecheck   — both must pass.
Commit message: "fix: enable ESLint on vite.config.ts files and fix resulting issues"
```

---

### Task 11 — Adopt pnpm workspace catalogs for shared dependencies

**Priority:** Moderate  
**Effort:** Medium  
**Depends on:** Task 1 complete (packages have package.json)

**Context:**  
pnpm catalogs (stable since pnpm 9, fully supported in pnpm 11) define dependency version ranges once in `pnpm-workspace.yaml` and reference them with `"catalog:"` in `package.json` files. With packages now having their own `package.json` (after Task 1), version drift between packages becomes a maintenance risk. Catalogs eliminate this by centralising version declarations.

**Files to read before starting:**
- `/home/user/tktaskapp/pnpm-workspace.yaml`
- `/home/user/tktaskapp/package.json` (root devDependencies — source of truth for versions)
- All `packages/*/package.json` (created in Task 1)
- `/home/user/tktaskapp/server/package.json`
- pnpm catalogs documentation: https://pnpm.io/catalogs

**Task Prompt:**
```
Task 11 of 19 — Adopt pnpm workspace catalogs for shared dev dependencies.

Read all listed files before changing anything.
Also fetch and read the pnpm catalogs documentation at https://pnpm.io/catalogs
before proceeding — do not rely on training data for the exact syntax.

Step 1 — Add a "default" catalog to pnpm-workspace.yaml.

The catalog should include the dev dependencies that are shared across multiple
packages. At minimum include:
  typescript, vitest, eslint, typescript-eslint, prettier, vite

Get the exact current versions from the root package.json devDependencies.
Do not guess versions — read them from the file.

Format (as documented at pnpm.io/catalogs):
catalogs:
  default:
    typescript: <exact version from root package.json>
    vitest: <exact version>
    ...

Step 2 — In any package.json (server, offline-web, or new package package.json files
from Task 1) that declares these as devDependencies, replace the version with "catalog:".

Step 3 — Run: pnpm install   (pnpm will validate all catalog: references resolve correctly)

Step 4 — Run: pnpm typecheck && pnpm lint && pnpm test   — all must pass.

Step 5 — Commit message: "chore: adopt pnpm workspace catalogs for shared dev dependencies"
```

---

### Task 12 — Reconcile `pnpm allowBuilds: esbuild: false` vs actual esbuild usage

**Priority:** Moderate  
**Effort:** Low

**Context:**  
`pnpm-workspace.yaml` sets `allowBuilds: esbuild: false`, which prevents esbuild's native binary from running its install script. However, `package.json` has `pnpm.overrides: esbuild: ^0.28.0` and `server/package.json` depends on esbuild directly and uses it in the build script. esbuild requires native binaries to function at full speed — the `allowBuilds: false` restriction means it silently falls back to a slower mode or fails in some environments.

**Files to read before starting:**
- `/home/user/tktaskapp/pnpm-workspace.yaml`
- `/home/user/tktaskapp/package.json`
- `/home/user/tktaskapp/server/package.json`

**Task Prompt:**
```
Task 12 of 19 — Reconcile pnpm allowBuilds: esbuild: false vs actual esbuild usage.

Read all listed files before changing anything.

This is a security vs functionality tradeoff that requires a deliberate decision:

Option A (security-first): Keep allowBuilds: esbuild: false
  - esbuild will use a pure-JS fallback (slower builds)
  - Add a comment in pnpm-workspace.yaml explaining why this is intentional
  - Document in DECISIONS.md that esbuild native binary is intentionally disabled
    as a supply-chain security measure, and that the JS fallback is accepted

Option B (functionality): Allow esbuild native binary
  - Change allowBuilds: esbuild: false to esbuild: true (or remove the entry)
  - This allows the native binary used in server/build scripts to work at full speed
  - Pin the esbuild version tightly (already done via pnpm.overrides: ^0.28.0)

Examine the server build scripts — does the build actually fail or produce warnings
currently? Run: cd server && pnpm build   and observe the output.

If the build succeeds without native binary warnings: document Option A as intentional.
If the build fails or warns about native binary: implement Option B.

Either way, the result must be:
  - Consistent (pnpm-workspace.yaml and package.json agree)
  - Documented (DECISIONS.md explains the choice)
  - Server build passes: cd server && pnpm build

Commit message: "fix: reconcile esbuild allowBuilds setting with documented decision"
```

---

### Task 13 — Migrate Vitest to `test.projects` pattern

**Priority:** Moderate  
**Effort:** Medium  
**Depends on:** Tasks 1 and 2 complete (packages/apps have package.json)

**Context:**  
Vitest deprecated the `workspace` configuration in favour of `test.projects` (documented at vitest.dev/guide/projects). The current `vitest.config.ts` uses a single root config covering `tests/**/*.ts` and manually specifies coverage include paths. The `test.projects` pattern allows each package to declare its own test environment (`jsdom` for UI packages, `node` for server/adapters) and Vitest runs them in parallel.

**Files to read before starting:**
- `/home/user/tktaskapp/vitest.config.ts`
- Vitest projects documentation: https://vitest.dev/guide/projects
- `/home/user/tktaskapp/packages/core/` (check what tests exist)
- `/home/user/tktaskapp/server/package.json` (check server test script)

**Task Prompt:**
```
Task 13 of 19 — Migrate Vitest to test.projects pattern.

Read vitest.config.ts and fetch https://vitest.dev/guide/projects before changing
anything. Do not rely on training data for the exact API — the docs are authoritative.

Step 1 — Create /home/user/tktaskapp/vitest.shared.ts:

Export a sharedConfig object containing the settings that should apply to all projects:
  globals: true
  hookTimeout: 30_000
  coverage settings (Istanbul provider, 80% thresholds, current include/exclude paths)

Step 2 — Update the root vitest.config.ts to use test.projects:

import { defineConfig } from 'vitest/config'
import { sharedConfig } from './vitest.shared'

export default defineConfig({
  test: {
    ...sharedConfig,
    projects: [
      'packages/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'server/vitest.config.ts',
    ]
  }
})

Step 3 — Create a vitest.config.ts for each package/app that has tests.
Check which packages/apps currently have test files before creating configs.
Each package config imports from vitest.shared.ts and sets its own environment:
  - packages/core: environment: 'jsdom' (UI/DOM code)
  - server: environment: 'node'
  - adapters: environment: 'node'

IMPORTANT: Per Vitest docs, individual project configs cannot extend the root
vitest.config.ts when using projects (it would create a circular projects reference).
This is why vitest.shared.ts exists as a separate file — import from there, not root.

Step 4 — Run: pnpm test   — must pass with the same test results as before.
Step 5 — Run: pnpm typecheck   — must pass.
Commit message: "feat: migrate Vitest to test.projects pattern (workspaces deprecated)"
```

---

## MINOR — Improvements and Future-Proofing

---

### Task 14 — Add Turborepo task descriptions (2.8+ feature)

**Priority:** Minor  
**Effort:** Low

**Context:**  
Turborepo 2.8 (January 2026) added a `description` field to task definitions. Descriptions are used by AI agents for context and appear in `turbo query` output. For this security-sensitive codebase, task descriptions also serve as lightweight documentation of what each build produces.

**Files to read before starting:**
- `/home/user/tktaskapp/turbo.json`

**Task Prompt:**
```
Task 14 of 19 — Add task descriptions to all turbo.json tasks.

Read turbo.json before changing it.

Add a "description" string to every task in turbo.json. Each description should
explain WHAT the task produces and any security-relevant behaviour.

Guidelines:
- build:offline: mention CSP hash regeneration
- build:offline:no-ai / internal-ai: mention which AI profile
- build:enterprise: mention PWA and HTTPS deployment target
- build:dataverse: mention Power Platform Code App and flat naming
- build:server: mention esbuild dual-bundle output
- typecheck: keep brief
- test: mention coverage thresholds
- lint: mention security-extended rules

Do not add descriptions longer than one sentence.

Run: pnpm typecheck   (turbo.json changes don't affect TS, but verify nothing broke)
Run: turbo run build:offline --dry   (verify turbo parses the updated config)
Commit message: "docs: add task descriptions to turbo.json for agent context"
```

---

### Task 15 — Document and script the mobile Capacitor build

**Priority:** Minor  
**Effort:** Low

**Context:**  
`apps/mobile/` has Capacitor config but no build scripts beyond `cap sync` and `cap open ios` (added in Task 2). There is no documented process for producing an iOS IPA or Android APK. The current `build:mobile` root script is just an alias for `build:enterprise`, which only prepares the WebView source — it does not produce a native binary.

**Files to read before starting:**
- `/home/user/tktaskapp/apps/mobile/capacitor.config.ts`
- `/home/user/tktaskapp/apps/mobile/package.json` (created in Task 2)
- `/home/user/tktaskapp/TECHNICAL-REFERENCE.md`

**Task Prompt:**
```
Task 15 of 19 — Document and script the mobile Capacitor build.

Read the listed files before writing anything.

Step 1 — Update apps/mobile/package.json scripts to reflect the full Capacitor
build pipeline:

  "prebuild": "pnpm --filter @tktaskapp/enterprise-web run build"
  "sync":     "cap sync"
  "open:ios": "cap open ios"
  "open:android": "cap open android"

The prebuild script ensures the enterprise-web WebView source is built before
Capacitor copies it into the native project.

Step 2 — Update the root package.json "build:mobile" script:
  Current: "build:mobile": "pnpm run build:enterprise"
  New:     "build:mobile": "turbo run build --filter=@tktaskapp/mobile..."

  Actually — because Capacitor's native build (Xcode/Gradle) is not scriptable
  from Node, the root build:mobile should only do the WebView preparation:
  "build:mobile": "pnpm --filter @tktaskapp/enterprise-web run build && pnpm --filter @tktaskapp/mobile run sync"

Step 3 — Add a section to TECHNICAL-REFERENCE.md under a "Mobile Build" heading
documenting:
  - What pnpm run build:mobile does (prepares WebView + syncs to native project)
  - What is NOT automated (Xcode Archive / Gradle assembleRelease — done in IDE or separate CI)
  - Capacitor version and which Capacitor plugins are used
  - iOS ATS and Android NSC security requirements (reference existing SECURITY.md if covered there)

Run: pnpm run build:mobile   — must complete without error.
Commit message: "feat: document and script mobile Capacitor build pipeline"
```

---

### Task 16 — Verify `.turbo` is in `.gitignore`

**Priority:** Minor  
**Effort:** Low

**Context:**  
Turborepo writes its local cache to `.turbo/` directories inside each package. These should never be committed. This is a quick verification and fix task.

**Files to read before starting:**
- `/home/user/tktaskapp/.gitignore`

**Task Prompt:**
```
Task 16 of 19 — Verify .turbo directories are in .gitignore.

Read .gitignore.

Check that the following patterns are present:
  .turbo
  **/.turbo

If either is missing, add them.

Also verify these standard Turborepo ignores are present:
  dist
  **/dist
  .env
  .env.*
  !.env.example

Do not remove any existing gitignore entries.

Run: git status   — confirm no .turbo directories are tracked.
If any .turbo directories appear as untracked/tracked, add them to .gitignore
and run: git rm -r --cached .turbo   (if tracked)

Commit message: "chore: ensure .turbo cache directories are gitignored"
```

---

### Task 17 — Add OpenTelemetry task metrics to Turborepo (experimental)

**Priority:** Minor  
**Effort:** Low  
**Depends on:** Task 3 complete

**Context:**  
Turborepo 2.9 added experimental OpenTelemetry support (`--otel-trace-endpoint` flag) and structured JSON logging (`--log-file`). The server already has a full OTel stack. Enabling Turbo's task metrics allows build duration, cache hit rates, and task dependency chains to flow into the same observability backend — useful for tracking CI performance over time.

**Files to read before starting:**
- `/home/user/tktaskapp/turbo.json`
- `/home/user/tktaskapp/package.json` (root scripts)
- `/home/user/tktaskapp/.github/workflows/` (if CI workflow exists)
- Turborepo 2.9 release notes: https://turbo.build/blog/turbo-2-9

**Task Prompt:**
```
Task 17 of 19 — Configure Turborepo OpenTelemetry task metrics (experimental).

Fetch and read https://turbo.build/blog/turbo-2-9 and the relevant OTel docs
section before making any changes. This feature is marked experimental in 2.9 —
verify the current flag names from the official docs, do not guess.

Step 1 — Add TURBO_TELEMETRY_DISABLED=1 to .env.example with a comment explaining
it disables Turborepo's anonymous usage telemetry (separate from OTel task metrics).

Step 2 — Add TURBO_OTEL_TRACE_ENDPOINT to .env.example and server/.env.example
with a placeholder value and comment: the OTLP HTTP endpoint for task span export.

Step 3 — If a GitHub Actions workflow exists in .github/workflows/, update the
turbo run commands to add the OTel flag when TURBO_OTEL_TRACE_ENDPOINT is set:
  turbo run build --otel-trace-endpoint=$TURBO_OTEL_TRACE_ENDPOINT

  Do this only if the flag name is confirmed from the official Turborepo 2.9 docs.
  If the docs show a different flag name, use that exact name.

Step 4 — Document in docs/ or TECHNICAL-REFERENCE.md:
  - What the OTel integration sends (task spans: name, duration, status, cache hit/miss)
  - That it is experimental and requires the --otel-trace-endpoint flag
  - That it feeds into the same OTLP backend as the server

Run: pnpm typecheck && pnpm lint
Commit message: "feat: configure Turborepo OTel task metrics (experimental, 2.9)"
```

---

### Task 18 — Enable Turborepo Git worktree cache sharing

**Priority:** Minor  
**Effort:** Low  
**Depends on:** Task 3 complete

**Context:**  
Turborepo 2.8 (January 2026) added Git worktree support, which shares the local Turborepo cache across Git worktrees. This is directly relevant for AI agent sessions (like Claude Code on the web) that may work in parallel on different branches — each branch/worktree can benefit from cache hits on unchanged packages from other branches.

**Files to read before starting:**
- `/home/user/tktaskapp/turbo.json`
- Turborepo 2.8 release notes: https://turbo.build/blog/turbo-2-8

**Task Prompt:**
```
Task 18 of 19 — Enable Turborepo Git worktree cache sharing.

Fetch and read https://turbo.build/blog/turbo-2-8 before making changes.
Confirm the exact configuration option for worktree cache sharing — do not guess.

Based on what the official docs say:
1. If worktree cache sharing requires a turbo.json config change, make it.
2. If it requires a flag on the turbo run command, add it to the relevant
   root package.json build scripts.
3. If it is automatic in 2.8+ (no config needed), document that in
   TECHNICAL-REFERENCE.md with a note that Turbo 2.8+ is required.

In all cases, add a note to TECHNICAL-REFERENCE.md explaining:
  - What Git worktree cache sharing does
  - That it benefits parallel AI agent sessions on different branches
  - The minimum Turborepo version required (2.8)

Run: pnpm typecheck
Commit message: "feat: enable Turborepo Git worktree cache sharing (2.8+)"
```

---

### Task 19 — Move non-workspace root directories into proper locations

**Priority:** Minor  
**Effort:** Medium

**Context:**  
Several directories sit at the repo root that don't belong in Turborepo's workspace graph and add noise: `verifier/`, `_bmad/`, `originalfiles/`, `Coremdfiles/`. Turborepo discovers packages by reading `pnpm-workspace.yaml` — these directories aren't in the graph, but their presence creates confusion and some (like `verifier/`) appear to be proper tools that should be workspace packages under `tools/` or `packages/`.

**Files to read before starting:**
- `/home/user/tktaskapp/verifier/` (list contents)
- `/home/user/tktaskapp/_bmad/` (list contents)
- `/home/user/tktaskapp/pnpm-workspace.yaml`
- `/home/user/tktaskapp/.gitignore`

**Task Prompt:**
```
Task 19 of 19 — Tidy non-workspace root directories.

List the contents of verifier/, _bmad/, originalfiles/, Coremdfiles/ before
touching anything. Understand what each contains.

Step 1 — verifier/:
If verifier/ contains TypeScript source and tests, it is a proper tool package.
  - Move it to tools/verifier/
  - Add a package.json: name "@tktaskapp/verifier", private: true, with appropriate scripts
  - Add "tools/*" to pnpm-workspace.yaml packages list
  - Add a turbo.json task for "verify" if appropriate
  If verifier/ contains only scripts or docs, leave it at root but add it to
  the eslint ignores if it is not TypeScript.

Step 2 — _bmad/:
This is BMAD agent configuration. It is not a workspace package.
  - Verify it is not imported by any source file (grep for _bmad imports)
  - Add _bmad/ to .gitignore if it contains generated/local agent state
  - Or leave as-is and add a comment in TECHNICAL-REFERENCE.md explaining its purpose

Step 3 — originalfiles/ and Coremdfiles/:
These appear to be reference/archive directories from the initial extraction.
  - Verify they are not imported by any source file
  - Confirm they are in .gitignore or explicitly excluded from turbo/eslint/ts
  - Add to eslint ignores and tsconfig exclude if not already present
  - Document in TECHNICAL-REFERENCE.md what these directories contain and why they exist

Step 4 — Update pnpm-workspace.yaml if tools/ was added.

Run: pnpm install && pnpm typecheck && pnpm lint
Commit message: "chore: tidy non-workspace root directories and document their purpose"
```

---

## Completion Checklist

| # | Task | Priority | Status |
|---|---|---|---|
| 1 | Add `package.json` to all `packages/*` | Critical | [ ] |
| 2 | Add `package.json` to `apps/enterprise-web`, `apps/dataverse`, `apps/mobile` | Critical | [ ] |
| 3 | Wire all builds through Turborepo, fix `turbo.json` tasks and outputs | Critical | [ ] |
| 4 | Fix `typecheck` task dependency (`^build` → `^typecheck`) | Critical | [ ] |
| 5 | Wire TypeScript project references in root `tsconfig.json` | Significant | [ ] |
| 6 | Add `tsconfig.json` to `adapter-rxdb-couchdb` | Significant | [ ] |
| 7 | Consolidate path alias definitions into `config/aliases.ts` | Significant | [ ] |
| 8 | Configure Turborepo remote caching (self-hosted S3) | Moderate | [ ] |
| 9 | Add `projectService: true` to ESLint parser options | Moderate | [ ] |
| 10 | Enable ESLint on `vite.config.ts` files | Moderate | [ ] |
| 11 | Adopt pnpm workspace catalogs for shared dependencies | Moderate | [ ] |
| 12 | Reconcile `allowBuilds: esbuild: false` vs actual usage | Moderate | [ ] |
| 13 | Migrate Vitest to `test.projects` pattern | Moderate | [ ] |
| 14 | Add Turborepo task descriptions (2.8+ feature) | Minor | [ ] |
| 15 | Document and script mobile Capacitor build | Minor | [ ] |
| 16 | Verify `.turbo` is in `.gitignore` | Minor | [ ] |
| 17 | Add Turborepo OTel task metrics (experimental, 2.9) | Minor | [ ] |
| 18 | Enable Git worktree cache sharing | Minor | [ ] |
| 19 | Move non-workspace root directories into proper locations | Minor | [ ] |

---

## Reference Sources (verified May 2026)

- Turborepo 2.8 release: https://turbo.build/blog/turbo-2-8
- Turborepo 2.9 release: https://turbo.build/blog/turbo-2-9
- Turborepo configuring tasks: https://turborepo.dev/docs/crafting-your-repository/configuring-tasks
- pnpm catalogs: https://pnpm.io/catalogs
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- typescript-eslint projectService: https://typescript-eslint.io/packages/parser/#projectservice
- Vitest projects: https://vitest.dev/guide/projects
- turborepo-remote-cache (self-hosted): https://github.com/ducktors/turborepo-remote-cache
- Mercari remote cache case study: https://engineering.mercari.com/en/blog/entry/20260216-turborepo-remote-cache-accelerating-ci-to-move-fast/
