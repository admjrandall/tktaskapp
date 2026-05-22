# Verifier Report — Phase 1, Week 1 (2026-05-22)

Branch: `claude/generate-offline-profile-html-CRKHK`
Covers commits: `d70ee6b` → `ce42916` (5 commits, Phase 0.5 completion + Phase 1 start)

---

## Gate results

| Gate                     | Status   | Notes                                                                                                                                                                       |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install                  | PASS     | pnpm install clean; minor pnpm version update notice only                                                                                                                   |
| typecheck                | PASS     | `tsc --noEmit` — zero errors                                                                                                                                                |
| lint                     | **FAIL** | Exit code 2 — `package.json` lint script passes `server` as a target but `eslint.config.mjs` ignores `server/**`. Pre-existing script misconfiguration, but gate is broken. |
| tests                    | **FAIL** | 8 tests failed across 2 files (see below)                                                                                                                                   |
| build:offline            | PASS     | 461.63 kB raw / 123.88 kB gzip                                                                                                                                              |
| build:sync               | PASS     | ~63 MB raw (RxDB transformers bundle — expected)                                                                                                                            |
| build:dataverse          | PASS     | Warnings: ineffective dynamic imports (non-fatal); chunk >500 kB warning                                                                                                    |
| bundle:forbidden-strings | PASS     | No forbidden strings in offline bundle                                                                                                                                      |
| bundle:size              | **FAIL** | offline-browser-ai raw 461,675 B (budget 440,000) — over by **21,675 B** (+5%); gzip 123,314 B (budget 120,000) — over by **3,314 B**                                       |
| e2e smoke                | SKIP     | No browser automation configured in this environment                                                                                                                        |
| accessibility            | SKIP     | ChromeDriver version mismatch (Chrome 148 installed, driver needs 149) — run `npx browser-driver-manager install chrome` to fix                                             |
| pnpm audit               | **WARN** | 7 vulnerabilities: **4 high**, 3 moderate (see Security section)                                                                                                            |

---

## Merge decision

**BLOCK**

Three hard failures: lint gate broken, 8 unit tests failing, bundle over size budget.
Two of the three have clear owners and are actionable before next merge.

---

## Files touched in this merge

| File                                        | Commit  | Change                                   |
| ------------------------------------------- | ------- | ---------------------------------------- |
| `packages/core/src/render-pipeline.ts`      | d70ee6b | NEW — extracted from main.ts             |
| `packages/core/src/hooks-wiring.ts`         | 6590be8 | NEW — extracted from main.ts             |
| `packages/core/src/main.ts`                 | 40671c4 | REFACTORED — slimmed to composition root |
| `packages/core/src/bootstrap.ts`            | 40671c4 | NEW — extracted from main.ts             |
| `packages/core/src/ui/design-tokens.ts`     | d4667c9 | NEW — C.4 token system                   |
| `packages/core/src/ui/primitives/avatar.ts` | d4667c9 | NEW                                      |
| `packages/core/src/ui/primitives/badge.ts`  | d4667c9 | NEW                                      |
| `packages/core/src/ui/primitives/button.ts` | d4667c9 | NEW                                      |
| `packages/core/src/ui/primitives/input.ts`  | d4667c9 | NEW                                      |
| `packages/core/src/ui/primitives/modal.ts`  | d4667c9 | NEW                                      |
| `packages/core/src/ui/primitives/index.ts`  | d4667c9 | NEW                                      |
| `packages/core/src/branding.ts`             | ce42916 | NEW — C.32 branding centralisation       |
| `packages/core/src/ui/components.ts`        | ce42916 | REBUILT — 152 lines changed              |

---

## Failing tests — detail

All 8 failures share a single root cause in `packages/core/src/views/topbar.ts:78`:

```
TypeError: Cannot read properties of undefined (reading 'charAt')
  at renderLockdownBanner (packages/core/src/views/topbar.ts:78:45)
  at renderTopbar (packages/core/src/views/topbar.ts:112:18)
```

**Root cause:** `renderLockdownBanner(level)` guards `level === 'off'` but not `level === undefined`. Test fixtures pass partial `AppState` objects without a `lockdownLevel` field, so `level` arrives as `undefined` and `level.charAt(0)` throws.

**Fix (one line, Agent A):** `if (!level || level === 'off') return ''`

**Affected test files:**

- `tests/accessibility/keyboard-navigation.test.ts` — 5 failures
- `tests/accessibility/screen-reader-labels.test.ts` — 3 failures

---

## Contract violations found

### 1. `export let` for mutable AI state — **CRITICAL** (C.9 / "No `export let` for AI mutable state")

`packages/core/src/ai/ai-settings.ts` has three `export let` bindings for mutable state:

| Line | Binding                                                |
| ---- | ------------------------------------------------------ |
| 309  | `export let _aiSecrets: Record<string, string> = {}`   |
| 378  | `export let _aiWizard: WizardState \| null = null`     |
| 428  | `export let _nanoModal: NanoModalState \| null = null` |

**Required fix (Agent B):** Move all three onto the `aiRuntime` object as `aiRuntime._aiSecrets`, `aiRuntime._aiWizard`, `aiRuntime._nanoModal`. ESM live binding via a shared object reference is the specified pattern; module-level `export let` is explicitly prohibited.

---

### 2. Audit event type desync — **HIGH** (Consistency check: "new AI event types must appear in BOTH security/audit.ts AND schemas/audit.schema.ts")

`audit.schema.ts` was updated with all C.6 event types. `audit.ts` `AuditEventType` union was NOT updated — it still only has the original 16 types plus `ai_tool_rejected`.

**Types missing from `audit.ts` (present in `audit.schema.ts`):**

```
ai_attribute_computed, ai_attribute_failed,
ai_command_executed, ai_command_rejected,
ai_chat_message,
adaptive_suggestion_proposed, adaptive_suggestion_accepted, adaptive_suggestion_dismissed,
dlp_warning_shown, dlp_action_proceeded,
lockdown_violation_blocked,
sync_pull, sync_push, sync_conflict_resolved,
extension_object_defined, extension_object_instance_created,
extension_object_instance_updated, extension_object_instance_deleted,
workspace_layout_changed, persona_selected, persona_changed
```

Additionally, `audit.schema.ts` now exports its own `AuditEventType` type (line 74: `export type AuditEventType = v.InferOutput<typeof AuditEventTypeSchema>`), which creates two competing definitions in the codebase. If both are imported the result is unpredictable at call sites.

**Required fix (Agent C):** Extend the `AuditEventType` union in `security/audit.ts` with all C.6 types. Then remove the duplicate `export type AuditEventType` from `audit.schema.ts` and replace with a type re-export: `export type { AuditEventType } from '../security/audit.js'`.

---

### 3. Commit size violations — **MEDIUM** (C.9: ≤200 lines per commit, ≤300 for Codex PRs)

| Commit    | Description                           | Lines changed                   | Status                                                                 |
| --------- | ------------------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `d4667c9` | Design-token system and UI primitives | 594 insertions                  | **OVER** — exceeds both 200 and 300 limits                             |
| `40671c4` | Bootstrap module extraction           | 362 insertions + 1001 deletions | **OVER** 200 limit (extraction; deletions offset insertions in effect) |
| `d70ee6b` | Render-pipeline extraction            | 338 insertions                  | **OVER** 200 limit                                                     |
| `6590be8` | Hooks-wiring extraction               | 175 insertions                  | PASS                                                                   |
| `ce42916` | Branding + components rebuild         | 120 ins / 76 del                | PASS                                                                   |

The Phase 0.5 extraction commits (`40671c4`, `d70ee6b`) are defensible as mechanical moves (the deletions exceed insertions), but they still violate the letter of the contract. The design-tokens commit (`d4667c9`) is a clear violation with 594 net-new lines.

**Required action (all agents):** Split large commits before next merge. `d4667c9` should be at minimum two commits: (a) `design-tokens.ts` + `primitives/index.ts`, and (b) the individual primitive files.

---

### 4. Lint script misconfiguration — **MEDIUM** (pre-existing, not introduced by this merge)

`package.json` script:

```json
"lint": "eslint packages apps config server"
```

`eslint.config.mjs` intentionally ignores `server/**` (separate tsconfig, separate lint config). ESLint exits 2 on a glob pattern that matches only ignored files. This blocks the gate on every run.

**Required fix (Agent A or C):** Either remove `server` from the root lint script, or add a `server/.eslintrc` / `server/eslint.config.mjs` that is compatible with the root config.

---

## Security — pnpm audit findings

7 vulnerabilities total (4 high, 3 moderate). All are in `server/` dependencies; offline bundle is unaffected.

| Severity | Package                                            | Issue                                            | Fix                                    |
| -------- | -------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| HIGH     | `drizzle-orm`                                      | SQL injection via improperly escaped identifiers | Upgrade to ≥0.45.2 (currently ^0.43.1) |
| HIGH     | `@opentelemetry/auto-instrumentations-node`        | Prometheus exporter DoS via malformed HTTP       | Upgrade to ≥0.75.0                     |
| HIGH     | `@opentelemetry/sdk-node`                          | Same DoS                                         | Upgrade to ≥0.217.0                    |
| HIGH     | `@opentelemetry/exporter-prometheus`               | Same DoS                                         | Upgrade to ≥0.217.0                    |
| MODERATE | `uuid` (indirect via otel → gcp-metadata → gaxios) | Buffer bounds check                              | Fixed by otel upgrade above            |
| MODERATE | (2 more moderate)                                  | —                                                | See `pnpm audit` output                |

**The drizzle-orm SQL injection is the most critical** — it affects the server's query layer directly. Agent C should upgrade `drizzle-orm` in `server/package.json` before the server is deployed to any environment.

---

## Regression risks

1. **`topbar.ts` null-deref on partial state** — any view test or future test that renders the topbar without a `lockdownLevel` field will crash. Risk is contained to tests right now; all 3 builds pass because production state always initialises `lockdownLevel: 'off'`.

2. **Dual `AuditEventType` definitions** — `audit.ts` and `audit.schema.ts` both export this type with different member sets. Import order determines which wins at a given call site. TypeScript does not warn about this. Could silently accept invalid event strings in audit log writes.

3. **Bundle size creep** — adding the design-token system and six primitive components grew the offline bundle 5% over budget. Every subsequent Phase 1 addition (personas, AI Attributes UI, canvas) will compound this. Agent A should investigate dead code elimination and possibly lazy-load the primitives module.

4. **Dataverse build `INEFFECTIVE_DYNAMIC_IMPORT` warnings** — `idb-data.ts`, `db.ts`, `state.ts`, and `fs.ts` are both dynamically imported (by AI modules) and statically imported (by bootstrap/app-lock/hooks-wiring). The dynamic imports provide no code-splitting benefit and add overhead. Not a blocker but should be resolved before the dataverse build is shipped.

5. **Phase 0.5 extraction correctness** — `bootstrap.ts`, `hooks-wiring.ts`, `render-pipeline.ts` are new and large. Typecheck passes, builds pass, but the e2e smoke test is unavailable to confirm runtime correctness of the hook wiring order. **Manual smoke test recommended before next merge.**

---

## Recommended follow-up

**Agent A (owns `views/`, `ui/`, `bootstrap.ts`):**

- [ ] Fix `renderLockdownBanner` null guard: `if (!level || level === 'off') return ''`
- [ ] Fix lint script: remove `server` from `"lint"` in `package.json` (or add server-side ESLint config)
- [ ] Split `d4667c9` design-tokens commit into ≤200-line chunks on next PR
- [ ] Investigate offline bundle size — primitives or design-tokens module may need tree-shaking review

**Agent B (owns `ai/`):**

- [ ] Move `_aiSecrets`, `_aiWizard`, `_nanoModal` off module-level `export let` onto `aiRuntime` object properties
- [ ] Verify no other `export let` in `ai/` files (run: `grep -rn "export let" packages/core/src/ai/`)

**Agent C (owns `security/audit.ts`, `server/`):**

- [ ] Extend `AuditEventType` union in `security/audit.ts` with all C.6 event types
- [ ] Remove duplicate `AuditEventType` export from `audit.schema.ts`; use re-export from `audit.ts`
- [ ] Upgrade `drizzle-orm` to ≥0.45.2 in `server/package.json` (SQL injection CVE — HIGH)
- [ ] Upgrade `@opentelemetry/auto-instrumentations-node` ≥0.75.0 and `@opentelemetry/sdk-node` ≥0.217.0

**All agents:**

- [ ] Commit size discipline: ≤200 lines per commit. Mechanical extractions may be split by moving one module at a time.

---

## Notes on skipped gates

- **e2e smoke**: Not run. Playwright is in devDependencies but no test runner is configured for the local environment. Priority: set up before Phase 1 end.
- **Accessibility audit**: ChromeDriver/Chrome version mismatch. Fix: `npx browser-driver-manager install chrome`. Run manually before next merge.
- **Lockdown variant test**: Phase 4 feature — N/A for Phase 1.
