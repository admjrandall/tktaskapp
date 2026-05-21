You are implementing ALL phases of d:\techkeycrmapp\filerevamp.md for the Task App CRM monorepo.

FIRST: Read these files completely before writing a single line of code:

1. d:\techkeycrmapp\filerevamp.md — the authoritative implementation spec
2. d:\techkeycrmapp\CLAUDE.md — current codebase rules, security rules, module order

Then scan the current repo structure so you know what already exists:

- apps/_, packages/_, config/ (if any), dist/, .github/ (if any)
- package.json, pnpm-workspace.yaml, pnpm-lock.yaml

Get the current date before starting.

---

PHASES — work through in strict order. Complete each phase fully (typecheck passes,
build passes, no regressions) before starting the next. Stop and ask me if you hit
a blocker rather than working around it.

PHASE -1 — MONOREPO TOOLING BASELINE
turbo.json — tasks: build (outputs dist/**), build:offline (outputs ../../dist/offline/**),
typecheck, lint, test (depends on ^build), test:watch (cache:false, persistent:true)
tsconfig.base.json — target ES2022, module ESNext, moduleResolution Bundler, strict true,
exactOptionalPropertyTypes true, noUncheckedIndexedAccess true, noImplicitOverride true,
verbatimModuleSyntax true, isolatedModules true, skipLibCheck true,
paths: { "@config/_": ["./config/_"] }
eslint.config.mjs — ESLint v9 flat config; typescript-eslint strictTypeChecked;
eslint-plugin-security; no-restricted-syntax rule that errors on any
AssignmentExpression[left.property.name='innerHTML'] with message
"Use safe render helpers instead of raw innerHTML."
prettier.config.mjs — singleQuote: true, semi: false, printWidth: 100, tabWidth: 2
.editorconfig — indent*style=space, indent_size=2, end_of_line=lf, charset=utf-8,
trim_trailing_whitespace=true, insert_final_newline=true
.nvmrc — match the Node version in engines field of package.json or current CI version
.changeset/config.json — baseBranch: main, access: restricted, commit: false
.husky/pre-commit — runs lint-staged
.husky/commit-msg — runs commitlint (Conventional Commits)
.husky/pre-push — runs turbo run typecheck test --filter=[HEAD^1]
root package.json lint-staged — *.{ts,tsx}: [eslint --fix, prettier --write],
\_.{json,md,yaml,yml}: [prettier --write]
renovate.json — extends config:recommended; schedule every weekend;
lockFileMaintenance enabled; devDependencies automerge true;
vulnerabilityAlerts enabled automerge false;
group vite/typescript/pnpm as "build-tooling"
CONTRIBUTING.md — prerequisites (Node via .nvmrc, pnpm via corepack), setup steps
(corepack enable, pnpm install, pnpm turbo run build:offline, open dist/offline/index.html),
Conventional Commits convention with type list, PR process, changeset instructions
SECURITY.md — vulnerability disclosure process (email developer@techkeycloud.com),
out-of-scope items, response timeline, do-not-disclose policy
GITHUB: .github/CODEOWNERS, .github/PULL_REQUEST_TEMPLATE.md,
.github/ISSUE_TEMPLATE/bug_report.md, .github/ISSUE_TEMPLATE/feature_request.md
VERIFY: pnpm install && pnpm turbo run typecheck passes from clean state

PHASE 0 — FREEZE NAMING DECISIONS
Rename apps/offline → apps/offline-web
Rename apps/sync → apps/pwa-sync (it currently uses NullAdapter; note it as a placeholder)
Inside apps/offline-web create three Vite entry variants:
src/entry-no-ai.ts — sets OFFLINE_NO_AI_PROFILE, NullAdapter, calls init()
src/entry-browser-ai.ts — (port current entry.ts) OFFLINE_BROWSER_AI_PROFILE, NullAdapter
src/entry-internal-ai.ts — OFFLINE_INTERNAL_AI_PROFILE, NullAdapter; OT_AI_CONNECT_SRC at build
Add apps/offline-web/README.md — explains three sub-profiles, which HTML artifact each produces,
and the build command for each
Update all scripts in root package.json and turbo.json to reference new paths
VERIFY: pnpm run build:offline still produces dist/offline/index.html

PHASE 1 — BUILD PROFILE PACKAGE
Create config/ at repo root (NOT a pnpm workspace package — no package.json inside it)
config/build-profiles/offline-no-ai.profile.ts
config/build-profiles/offline-browser-ai.profile.ts
config/build-profiles/offline-internal-ai.profile.ts
config/build-profiles/mobile-offline.profile.ts (stub)
config/build-profiles/enterprise.profile.ts (stub — kmsRequired: true, oidcPkceRequired: true)
config/build-profiles/dataverse.profile.ts (stub)
Each profile object must include these fields typed as const:
id, displayName, allowExternalNetwork, allowCloudAI, allowOllama, allowBrowserNano,
aiMode ('none'|'browser'|'internal'|'cloud'), adapter, storage, csp, requireServer,
gdprErasureModel, kmsRequired, accessibilityTarget
config/vite/base.config.ts — shared Vite base options
Wire @config/\* path alias: update tsconfig.base.json paths AND add resolve.alias to
all Vite configs so runtime imports work
Update apps/offline-web entry files to import from @config/build-profiles/
VERIFY: pnpm run typecheck passes; pnpm run build:offline produces valid dist/

PHASE 2 — OFFLINE BUNDLE GATES
scripts/assert-bundle-size.mjs:
offline-no-ai: raw ≤ 300000, gzip ≤ 90000
offline-browser-ai: raw ≤ 320000, gzip ≤ 95000
Script reads dist/offline/index.html, computes raw length and gzipSync length,
exits 1 with clear error message if over budget
scripts/assert-offline-bundle.mjs:
Scan dist/offline/index.html for forbidden strings per profile:
Always forbidden: https://api.anthropic.com, https://api.openai.com,
https://generativelanguage.googleapis.com, @huggingface/transformers,
huggingface.co, cdn.jsdelivr.net
Forbidden in no-ai profile: /ollama/i
Exit 1 with the matched string and byte offset on any violation
Add "assert:offline-bundle": "node scripts/assert-offline-bundle.mjs" to root package.json
Add "assert:bundle-size": "node scripts/assert-bundle-size.mjs" to root package.json
.github/workflows/ci.yml — create or update with steps:
install (pnpm install --frozen-lockfile)
typecheck (pnpm turbo run typecheck)
lint (pnpm turbo run lint)
test (pnpm turbo run test)
build:offline (pnpm run build:offline)
assert:offline-bundle (pnpm run assert:offline-bundle)
assert:bundle-size (pnpm run assert:bundle-size)
.github/workflows/security.yml:
Semgrep (semgrep --config=auto)
Gitleaks (gitleaks detect)
pnpm audit
license check
.github/workflows/codeql.yml — GitHub CodeQL on schedule + PR
.github/workflows/dependency-review.yml — dependency-review-action on PR
VERIFY: run both scripts against current dist/offline/index.html; they must pass

PHASE 3 — CORE LAYERING (FILE MOVES, NO LOGIC CHANGES)
Reorganise packages/core/src/ into subdirectories:
security/ — move: crypto.ts, vault.ts, session.ts, auth.ts, mfa.ts, totp.ts,
webauthn.ts, audit.ts, sanitize.ts, trusted-types.ts
storage/ — move: db.ts, idb-data.ts, fs.ts
ai/ — already exists; leave in place
ui/ — move: components.ts, icons.ts (create folder if needed)
views/ — already exists; leave in place
platform/ — create with index.ts placeholder comment only
schemas/ — create with index.ts placeholder comment only
migrations/ — create with index.ts placeholder comment only
domain/ — create with index.ts placeholder comment only
application/ — create with index.ts placeholder comment only
Update EVERY import path in EVERY file affected by the moves
CRITICAL: trusted-types.ts must remain the FIRST import in main.ts after the move
CRITICAL: verify the module dependency order from CLAUDE.md is preserved
VERIFY: pnpm run typecheck passes with zero errors
VERIFY: pnpm run build:offline produces a working dist/offline/index.html
VERIFY: pnpm run assert:offline-bundle passes

PHASE 4 — SCHEMA VALIDATION
Install valibot as a dependency of packages/core
Verify valibot does NOT end up in package.json of any server/ or adapter that
could pull zod into the offline bundle
packages/core/src/schemas/client.schema.ts
packages/core/src/schemas/project.schema.ts
packages/core/src/schemas/task.schema.ts
packages/core/src/schemas/person.schema.ts
packages/core/src/schemas/document.schema.ts
packages/core/src/schemas/file.schema.ts
packages/core/src/schemas/audit.schema.ts
packages/core/src/schemas/import.schema.ts — validates JSON import: store names must
match known STORES/IDB_STORES from constants.ts; each record must have id:string,
createdAt:string, updatedAt:string at minimum
packages/core/src/schemas/ai-tool.schema.ts — validates every AI tool argument shape
before the tool call mutates data
Wire import.schema.ts into the JSON import flow (find where imports are parsed and
add validation before dbCreate calls; surface a typed error to the user on failure)
Wire ai-tool.schema.ts into ai-tools.ts before routeToolCall executes any mutation
VERIFY: pnpm run typecheck passes
VERIFY: pnpm run build:offline passes and assert scripts pass
VERIFY: manually confirm that importing a malformed JSON export shows a clear error

PHASE 5 — ADAPTER CONTRACT TESTING
Create tests/adapters/adapter-contract.ts — shared behavioural test suite:
create/read/update/delete/list records consistently
reject payloads that fail Valibot schema validation
preserve createdAt/updatedAt and record IDs across operations
NullAdapter: pull/push/stream/clear are all no-ops and never throw
Apply the suite to packages/adapter-null (it should already pass)
Apply the suite to packages/adapter-rxdb stub (document which tests are skipped and why)
Apply the suite to packages/adapter-dataverse stub (same)
Add tests/adapters/kms-contract.ts stub — documents required tests for KmsAdapter
(key issuance, wrapping, destruction, post-destruction unreadability, DSAR workflow)
with all tests marked .todo until KmsAdapter is implemented
VERIFY: pnpm turbo run test passes; NullAdapter contract tests are green

PHASE 6 — GDPR / PRIVACY ARCHITECTURE DESIGN
NOTE: This phase creates the architecture and documentation only.
No server-side KMS implementation yet — that requires Phase 9 (enterprise server).
packages/adapter-kms/src/index.ts — define the KmsAdapter interface:
issueKey(userId: string): Promise<KeyHandle>
wrapKey(dek: CryptoKey, kek: KeyHandle): Promise<WrappedKey>
unwrapKey(wrapped: WrappedKey, kek: KeyHandle): Promise<CryptoKey>
scheduleKeyDestruction(userId: string, destroyAt: Date): Promise<void>
getKeyStatus(userId: string): Promise<KeyStatus>
packages/adapter-kms/README.md — documents crypto-shredding mechanism,
per-user DEK/KEK hierarchy, GDPR Article 17 legal basis for key destruction = erasure,
EU DPA acceptance basis
docs/architecture/0006-gdpr-crypto-shredding.md — per-user KMS key hierarchy diagram
(ASCII), DSAR workflow (step-by-step), EU DPA legal analysis
docs/architecture/0007-identity-and-authz.md — OIDC/PKCE design, DPoP roadmap item,
OPA/Cedar policy model comparison, BOLA/IDOR control points
tests/security/gdpr-erasure.test.ts — stub tests (.todo) for:
key destruction → encrypted data unreadable
backup copy unreadability after key destruction
DSAR evidence auditability

PHASE 7 — OPENTELEMETRY (DESIGN ONLY — no server yet)
docs/architecture/0008-observability.md — OTel signal design:
required span attributes (tenant_id, user_id, request_id, trace_id),
RED metrics per service, SLO definitions (P99 < 500ms, error rate < 0.1%, uptime > 99.9%),
structured log field list (timestamp, level, service, trace_id, span_id, tenant_id,
user_id, request_id, message — no PII in logs)
No code changes to packages/core yet — OTel SDK belongs in server/ (Phase 9)

PHASE 8 — MOBILE STRUCTURE (SCAFFOLD ONLY)
NOTE: Do not install Capacitor or create iOS/Android projects.
Create apps/mobile/ scaffold:
apps/mobile/README.md — documents: Capacitor not yet implemented; what must exist
before this app target is production-capable (capacitor.config.ts, iOS ATS config,
Android NSC, adapter-mobile-native implementation, MASVS test plan)
apps/mobile/src/entry.ts — stub that imports MOBILE_OFFLINE_PROFILE and calls
a TODO comment for setStorageAdapter(new MobileNativeVaultAdapter())
packages/adapter-mobile-native/src/index.ts — define the interface only:
MobileVaultAdapter implementing the adapter-interface contract
Document: vault storage (native filesystem), backup/export, biometric unlock
packages/adapter-mobile-native/README.md — documents Capacitor dependency,
iOS ATS requirements, Android NSC requirements, MASVS acceptance criteria

PHASE 9 — ENTERPRISE FOUNDATION (SCAFFOLD ONLY — requires backend work to fill in)
NOTE: Create the server/ folder structure and stub files only.
Do NOT implement OIDC, OPA, or KMS — those require a real backend.
server/src/api/routes/.gitkeep
server/src/auth/oidc.ts — interface stub with TODO comments per Section 11.1
server/src/authorization/policy-engine.ts — interface stub per Section 11.2
server/src/kms/key-service.ts — interface stub per Section 11.3
server/src/observability/otel.ts — interface stub per Section 11.4
server/src/ai-gateway/policy-engine.ts — interface stub per Section 11.5
server/src/db/schema/.gitkeep
server/src/db/migrations/.gitkeep
server/package.json — name: @tktaskapp/server, private: true
apps/enterprise-web/src/entry.ts — stub that imports ENTERPRISE_PROFILE and
documents what adapters are required before this is production-capable

PHASE 10 — AI GOVERNANCE (DOCUMENTATION + STUB TESTS)
docs/compliance/ai-governance-policy.md — model inventory template, data boundary
rules, human approval workflow, prompt injection defence approach,
ISO 42001:2023 evidence requirements list
docs/compliance/iso42001-evidence-map.md — gap assessment table (control → current state → gap)
tests/security/ai-prompt-injection.test.ts — stub tests (.todo) covering:
task name injection, document content injection, client notes injection,
each user-controlled field that reaches AI context
tests/accessibility/keyboard-navigation.test.ts — stub
tests/accessibility/modal-focus-trap.test.ts — stub
tests/accessibility/screen-reader-labels.test.ts — stub
.github/workflows/accessibility.yml — axe-core run on dist/offline/index.html
(use @axe-core/cli; document which rules apply to a file:// artifact)

PHASE 11 — API CONTRACT AND DATABASE (DESIGN + SCAFFOLD)
docs/api/openapi.yaml — OpenAPI 3.1 skeleton with:
info (title, version, description), servers, security schemes (OIDC/PKCE bearer),
tags, and stub paths for /api/v1/clients, /api/v1/projects, /api/v1/tasks,
/api/v1/documents, /api/v1/audit, /api/v1/admin/users
docs/api/CHANGELOG.md — API version history stub
server/src/api/generated/.gitkeep — add comment: generated by openapi-typescript; do not edit
server/src/db/schema/users.ts — Drizzle table definitions: tenant_users, user_roles, user_kms_keys
server/src/db/schema/audit-events.ts — append-only audit events table
server/src/db/schema/kms-keys.ts — key lifecycle table
server/src/db/index.ts — drizzle() instance stub with TODO for connection string
Add drizzle-orm and drizzle-kit as devDependencies to server/package.json only —
confirm these do NOT appear in packages/core or any offline bundle

PHASE 12 — RELEASE MANAGEMENT
pnpm add -D @changesets/cli @changesets/changelog-github (root)
.changeset/config.json — already created in Phase -1; verify it is correct
Add "changeset": "changeset" and "version-packages": "changeset version" scripts to root package.json
.github/workflows/release-offline.yml:
trigger: push to main when .changeset/ files exist (or manual)
steps: install, typecheck, build:offline, assert-bundle, assert-csp, changeset version,
git commit version bump, publish offline artifact as GitHub Release asset,
generate SHA256SUMS, upload to release
Stamp offline artifact version at build time: in apps/offline-web vite.config.ts,
inject **APP_VERSION** from root package.json and write it to

<meta name="version" content="..."> in the built HTML
VERIFY: pnpm changeset --help works; version stamping appears in built HTML

PHASE 13 — PERFORMANCE BUDGETS
scripts/assert-bundle-size.mjs — already created in Phase 2; verify budgets are correct:
offline-no-ai: raw ≤ 300000, gzip ≤ 90000
offline-browser-ai: raw ≤ 320000, gzip ≤ 95000
offline-internal-ai: raw ≤ 320000, gzip ≤ 95000
If the current build exceeds any budget: analyse the bundle with vite-bundle-visualizer
(do not install it in prod deps — run it once, report findings, do not fix without asking me)
Add "perf:analyse": "vite-bundle-visualizer" to apps/offline-web/package.json as devDependency
Document the current sizes in a comment at the top of assert-bundle-size.mjs

PHASE 14 — INFRASTRUCTURE SCAFFOLD
Dockerfile — multi-stage: node:22-alpine builder, gcr.io/distroless/nodejs22-debian12 runtime
builder: corepack enable, pnpm install --frozen-lockfile, pnpm turbo run build:server
runtime: COPY dist and node_modules from builder, USER nonroot, EXPOSE 3000, CMD ["dist/server.js"]
docker-compose.yml — services:
server (builds from Dockerfile, ports 3000:3000, env_file .env.local)
postgres (postgres:16-alpine, volume for data, healthcheck)
otel-collector (otel/opentelemetry-collector-contrib:latest)
jaeger (jaegertracing/all-in-one:latest, ports 16686:16686 for UI)
.env.example — list all required env vars with placeholder values and comments;
never put real secrets in this file
infra/k8s/network-policy.yaml — deny-all ingress except port 3000 from load balancer;
deny-all egress except postgres, KMS endpoint, IdP, OTel collector
infra/k8s/deployment.yaml — readOnlyRootFilesystem: true, allowPrivilegeEscalation: false,
runAsNonRoot: true, liveness probe /healthz, readiness probe /readyz
Add health endpoint stubs to server/src/api/routes/health.ts:
GET /healthz → 200 { status: 'ok' }
GET /readyz → 200 { status: 'ready', db: 'connected', kms: 'connected' } (stubs for now)

---

HARD RULES — from CLAUDE.md — NEVER violate:

1. trusted-types.ts MUST be the first import in main.ts at all times
2. Never make \_dbKey (the CryptoKey) extractable
3. All user-visible strings through escH() before innerHTML interpolation
4. Never use btoa(String.fromCharCode(...array)) — use u8ToBase64() from crypto.ts
5. Never call trustedTypes.createPolicy() with an already-registered name
6. Keep the four IndexedDB databases separate and named correctly
7. IDB_STORES = ['documents', 'conversations'] — new large stores go here, not STORES
8. After every build:offline, generate-csp.mjs runs automatically (wired into build script)
9. Do not edit taskapp.html (legacy reference only)
10. Do not add Zod to any module imported by packages/core — use Valibot only in the offline bundle
11. Module import order in main.ts must follow the order in CLAUDE.md

STOP AND ASK ME BEFORE:

- Any destructive file operation (delete, overwrite existing working code)
- Any phase that requires an external service that does not exist yet
- If typecheck or build breaks and you cannot fix it in two attempts
- If a phase would require architectural decisions not already settled in filerevamp.md

After every phase: report what was done, current line count of the dist/offline/index.html,
and confirm typecheck passes. Do not start the next phase until you explicitly tell me it passed.
