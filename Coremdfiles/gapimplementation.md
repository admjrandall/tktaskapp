# Gap Implementation — Task App CRM

**Created:** 2026-05-20  
**Purpose:** Self-contained prompt and implementation spec for a new Claude Code session.  
**How to use:** Paste or open this file at the start of a new session. Read it completely before writing a single line of code.

---

## BEFORE YOU START

Read these files in full before touching anything:

1. `d:\techkeycrmapp\CLAUDE.md` — codebase rules, security rules, module import order, architecture patterns
2. `d:\techkeycrmapp\filerevamp.md` — original 14-phase spec (all prior phases are COMPLETE — do not redo them)
3. `d:\techkeycrmapp\filerevampprompt.md` — phase-by-phase implementation prompt that was executed

Then confirm the current build passes:

```powershell
pnpm run build:offline
pnpm run typecheck
node scripts/assert-bundle-size.mjs
node scripts/assert-offline-bundle.mjs
```

If any of these fail, stop and report — do not proceed.

---

## CONTEXT: WHAT HAS ALREADY BEEN DONE

All 14 phases of `filerevampprompt.md` have been executed. The monorepo scaffold is complete:

- Phases -1 through 3: Tooling, naming, build profiles, core layer reorganisation — **all done**
- Phase 4: Valibot schemas created — **partially wired** (see Group B gaps)
- Phases 5–14: Adapter contracts, GDPR architecture, OTel design, mobile scaffold, enterprise scaffold, AI governance docs, API contract, release management, performance budgets, infrastructure scaffold — **all stubbed as intended by spec**

The **active offline build works**. `dist/offline/index.html` builds and opens in Chrome/Edge.

---

## WHAT THIS SESSION MUST IMPLEMENT

Thirty-two specific gaps were identified in a full audit (2026-05-20). They are grouped into 6 ordered phases. **Work through them in strict order. Do not start the next group until the current one passes typecheck and build.**

After every group: run `pnpm run typecheck && pnpm run build:offline && node scripts/assert-bundle-size.mjs && node scripts/assert-offline-bundle.mjs`. All four must pass before continuing.

---

## ARCHITECTURAL DECISIONS (DO NOT RE-ASK)

These were decided by the user on 2026-05-20:

| Decision                      | Choice                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| Cloud KMS provider            | **Azure Key Vault**                                                 |
| Identity provider             | **Microsoft Entra ID** (OIDC/PKCE; DPoP on roadmap)                 |
| DB multi-tenancy model        | **Shared schema + `org_id` column + PostgreSQL Row-Level Security** |
| RxDB replication backend      | **CouchDB / PouchDB protocol** (RxDB native replication plugin)     |
| Drizzle table style           | `pgTable()` definitions; identity columns (not serial)              |
| Accessibility CI mode         | **Audit mode** — report violations, do NOT fail the build yet       |
| TypeScript Project References | **Yes** — add `composite: true` + `references[]` to all packages    |

---

## GROUP A — MISSING FILES (10 items)

These files do not exist at all. Create them exactly as specified.

---

### A1 — `config/vite/base.config.ts`

Shared Vite configuration imported by all `apps/*/vite.config.ts` files.

```typescript
// config/vite/base.config.ts
import type { UserConfig } from 'vite'

export const baseConfig: UserConfig = {
  build: {
    target: 'es2022',
    minify: 'esbuild',
    reportCompressedSize: true,
  },
  resolve: {
    alias: {
      '@config': new URL('../../config', import.meta.url).pathname,
    },
  },
}
```

After creating this file, update each `apps/*/vite.config.ts` to spread `baseConfig` rather than duplicating options. Do not remove any app-specific options — only extract what is already duplicated.

---

### A2 — `.github/CODEOWNERS`

```
# Global fallback
*                           @techkeycloud/core-team

# Security-sensitive paths — require security team review on any PR
packages/core/src/security/ @techkeycloud/security-team @techkeycloud/core-team
server/src/auth/            @techkeycloud/security-team
server/src/kms/             @techkeycloud/security-team
packages/adapter-kms/       @techkeycloud/security-team
infra/                      @techkeycloud/security-team @techkeycloud/devops-team

# Server / API — require backend team review
server/                     @techkeycloud/backend-team
docs/api/                   @techkeycloud/backend-team

# CI/CD workflows — require devops team review
.github/workflows/          @techkeycloud/devops-team

# Compliance documentation — require security and legal review
docs/compliance/            @techkeycloud/security-team
docs/architecture/          @techkeycloud/core-team

# Adapter packages
packages/adapter-rxdb/      @techkeycloud/core-team
packages/adapter-dataverse/ @techkeycloud/core-team
packages/adapter-mobile-native/ @techkeycloud/core-team
```

---

### A3 — `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## Summary

<!-- What does this PR do? One paragraph. -->

## Type of change

- [ ] Bug fix
- [ ] New feature / enhancement
- [ ] Refactoring (no behaviour change)
- [ ] Documentation
- [ ] Infrastructure / CI
- [ ] Security fix

## Checklist

### All PRs

- [ ] `pnpm run typecheck` passes with zero errors
- [ ] `pnpm run build:offline` produces a valid `dist/offline/index.html`
- [ ] `node scripts/assert-bundle-size.mjs` passes (no budget overrun)
- [ ] `node scripts/assert-offline-bundle.mjs` passes (no forbidden strings)
- [ ] A changeset has been added (`pnpm changeset`) if this changes published behaviour
- [ ] All user-visible strings go through `escH()` before `innerHTML` interpolation

### Security-sensitive changes (crypto, auth, storage, AI)

- [ ] `trusted-types.ts` remains the first import in `main.ts`
- [ ] `_dbKey` (CryptoKey) is never made extractable
- [ ] No new `trustedTypes.createPolicy()` calls with already-registered names
- [ ] No `btoa(String.fromCharCode(...array))` — use `u8ToBase64()` from `crypto.ts`
- [ ] The four IndexedDB databases remain separate and correctly named
- [ ] New large-content stores added to `IDB_STORES`, not `STORES`

### Server / API changes

- [ ] OpenAPI spec updated in `docs/api/openapi.yaml`
- [ ] Drizzle schema changes have a corresponding migration file
- [ ] RLS policies applied to any new tables with `org_id`

## Testing

<!-- Describe how you tested this change. -->

## Screenshots (if UI change)

<!-- Before / After screenshots or screen recording. -->
```

---

### A4 — `.github/ISSUE_TEMPLATE/bug_report.md`

```markdown
---
name: Bug report
about: Something is broken or behaving unexpectedly
title: '[Bug] '
labels: bug
assignees: ''
---

## Describe the bug

<!-- A clear description of what the bug is. -->

## Steps to reproduce

1. Open `dist/offline/index.html` in Chrome / Edge
2. ...
3. See error

## Expected behaviour

<!-- What you expected to happen. -->

## Actual behaviour

<!-- What actually happened. Include any error messages from the browser console. -->

## Environment

- Browser and version:
- OS:
- App version (check `<meta name="version">` in the HTML):
- Built-in AI enabled? Yes / No
- Vault file linked? Yes / No

## Additional context

<!-- Stack traces, screenshots, reproduction files. -->
```

---

### A5 — `.github/ISSUE_TEMPLATE/feature_request.md`

```markdown
---
name: Feature request
about: Suggest a new feature or enhancement
title: '[Feature] '
labels: enhancement
assignees: ''
---

## Problem statement

<!-- What problem does this feature solve? Who is affected? -->

## Proposed solution

<!-- Describe the feature. How should it work? -->

## Alternatives considered

<!-- What other approaches did you consider and why did you rule them out? -->

## Acceptance criteria

<!-- How will we know this feature is done? Bullet list of verifiable conditions. -->

## Additional context

<!-- Mockups, references, related issues. -->
```

---

### A6 — `packages/adapter-kms/README.md`

Write this README for the KmsAdapter package. It must cover:

1. **Purpose** — abstract interface for per-user DEK/KEK key hierarchy; enables GDPR Article 17 erasure via crypto-shredding
2. **Crypto-shredding mechanism** — how destroying a KEK renders all data encrypted with the corresponding DEK permanently unreadable without modifying any data records
3. **Key hierarchy diagram** (ASCII):
   ```
   Master KEK (Azure Key Vault — tenant-level)
       └─ Per-User KEK (Azure Key Vault — user-level, scheduleKeyDestruction erases this)
              └─ Per-Record DEK (AES-256-GCM — wrapped by Per-User KEK)
                     └─ Encrypted user data (IDB / Postgres)
   ```
4. **GDPR Article 17 legal basis** — key destruction = erasure; cite EDPB Guidelines on right to erasure; note EU DPA acceptance basis
5. **DSAR workflow** — step-by-step: (1) receive erasure request, (2) call `scheduleKeyDestruction(userId, destroyAt)`, (3) after `destroyAt` elapses (min 24h for Azure KV soft-delete), (4) call `getKeyStatus` to confirm `DESTROYED`, (5) log to audit trail with evidence
6. **Interface reference** — copy the TypeScript interface from `packages/adapter-kms/src/index.ts`
7. **Azure Key Vault implementation notes** — managed identity auth, EU region (`eastus2` / `northeurope`), soft-delete enabled, purge protection enabled, FIPS 140-2 Level 2

---

### A7 — `packages/adapter-mobile-native/README.md`

Write this README covering:

1. **Status** — not yet implemented; Capacitor must be installed before this package is usable
2. **Prerequisites before this is production-capable:**
   - Capacitor `>=6.0` installed in `apps/mobile/`
   - iOS project generated (`npx cap add ios`)
   - Android project generated (`npx cap add android`)
   - iOS ATS (App Transport Security) configured for vault endpoints
   - Android NSC (Network Security Config) configured
   - `MobileNativeVaultAdapter` implemented against the `adapter-interface` contract
3. **Vault storage approach** — native filesystem (iOS: Documents directory with `NSFileProtectionComplete`; Android: encrypted internal storage)
4. **Biometric unlock** — Capacitor Biometric Auth plugin wraps the per-user master password; PRF passkeys preferred where available
5. **MASVS acceptance criteria** — MASVS-STORAGE-1 (data stored securely), MASVS-CRYPTO-1 (strong crypto), MASVS-AUTH-1 (biometric), MASVS-NETWORK-1 (pinning), MASVS-PLATFORM-1 (no sensitive data in logs/pasteboard)
6. **Interface reference** — copy the TypeScript interface from `packages/adapter-mobile-native/src/mobile-vault-adapter.ts`

---

### A8 — `tests/security/bola-idor.test.ts`

Create a stub test file. All tests must be marked `.todo`. Cover:

```typescript
import { describe, it } from 'vitest'

describe('BOLA / IDOR controls', () => {
  describe('Horizontal privilege escalation', () => {
    it.todo('user A cannot read user B record by guessing ID')
    it.todo('user A cannot update user B record by crafting a PATCH request')
    it.todo('user A cannot delete user B record')
    it.todo('soft-deleted records are not accessible by other users in same org')
  })

  describe('Vertical privilege escalation', () => {
    it.todo('viewer-role user cannot create records')
    it.todo('viewer-role user cannot delete records')
    it.todo('editor-role user cannot access admin-only endpoints')
    it.todo('admin of org A cannot access any data in org B')
  })

  describe('Cross-tenant isolation (RLS)', () => {
    it.todo('direct DB query without RLS policy bypasses are impossible via API')
    it.todo('org_id is never accepted from client-supplied request body')
    it.todo('org_id is always derived from the authenticated JWT claims')
  })

  describe('Mass assignment', () => {
    it.todo('org_id field is stripped from all client-supplied payloads')
    it.todo('role field is stripped from client-supplied payloads')
    it.todo('createdAt / updatedAt cannot be spoofed by client')
  })
})
```

---

### A9 — `infra/k8s/network-policy.yaml`

```yaml
# Kubernetes NetworkPolicy for Task App CRM server
# Deny-all ingress/egress by default; allow only required traffic.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: tktaskapp-server
  namespace: tktaskapp
spec:
  podSelector:
    matchLabels:
      app: tktaskapp-server
  policyTypes:
    - Ingress
    - Egress

  ingress:
    # Allow traffic on port 3000 from the load balancer / ingress controller only
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000

  egress:
    # PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432

    # Azure Key Vault (HTTPS)
    # Replace <vault-name> with actual vault hostname in your environment
    - to: []
      ports:
        - protocol: TCP
          port: 443
      # Note: Azure Key Vault DNS resolution requires DNS egress (port 53) and
      # HTTPS egress to *.vault.azure.net. Use a NetworkPolicy-aware CNI
      # (e.g. Calico, Cilium) with FQDN-based policies in production.

    # Microsoft Entra ID (OIDC token validation)
    - to: []
      ports:
        - protocol: TCP
          port: 443
      # login.microsoftonline.com — use FQDN policy in production CNI

    # OpenTelemetry Collector
    - to:
        - podSelector:
            matchLabels:
              app: otel-collector
      ports:
        - protocol: TCP
          port: 4317 # gRPC
        - protocol: TCP
          port: 4318 # HTTP

    # DNS resolution (required for Azure / Entra ID hostnames)
    - to: []
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

---

### A10 — `perf:analyse` script in `apps/offline-web/package.json`

Read `apps/offline-web/package.json`. Add to `devDependencies`:

```json
"vite-bundle-visualizer": "^1.2.0"
```

Add to `scripts`:

```json
"perf:analyse": "vite-bundle-visualizer"
```

Do not change any other scripts or dependencies.

---

## GROUP B — INCOMPLETE WIRING (4 items)

These files already exist. The changes are surgical — do not refactor surrounding code.

---

### B1 — Wire `import.schema.ts` into the JSON import flow

**Find:** The function in `packages/core/src/views/` (likely `settings.ts` or a dedicated import handler) that parses a user-supplied JSON export and calls `dbCreate` for each record.

**Add:** Before any `dbCreate` call, validate the parsed object against the import schema from `packages/core/src/schemas/import.schema.ts`. If validation fails, surface a typed error to the user (use the existing toast/error system — do not add a new one). Do not proceed with any `dbCreate` calls if the top-level schema validation fails.

The `import.schema.ts` already validates:

- Store names match known `STORES` / `IDB_STORES` from `constants.ts`
- Each record has `id: string`, `createdAt: string`, `updatedAt: string`

**Pattern to follow:**

```typescript
import * as v from 'valibot'
import { ImportSchema } from '../schemas/import.schema.ts'

const result = v.safeParse(ImportSchema, parsed)
if (!result.success) {
  // surface error using existing toast mechanism
  showToast(`Import failed: ${result.issues[0].message}`)
  return
}
// proceed with result.output
```

---

### B2 — Wire `ai-tool.schema.ts` into `routeToolCall`

**Find:** `routeToolCall` in `packages/core/src/ai/ai-tools.ts`.

**Add:** At the top of `routeToolCall`, before any data mutation, validate the incoming tool arguments against the corresponding schema exported from `packages/core/src/schemas/ai-tool.schema.ts`.

If validation fails: do not execute the mutation. Return a structured error string to the AI (so the model can see its call was rejected and why). Log to audit trail if audit hooks are available.

**Pattern:**

```typescript
import * as v from 'valibot'
import { toolSchemas } from '../schemas/ai-tool.schema.ts'

const schema = toolSchemas[toolName]
if (schema) {
  const result = v.safeParse(schema, args)
  if (!result.success) {
    return `Tool call rejected: argument validation failed — ${result.issues[0].message}`
  }
  args = result.output // use the parsed (coerced) output
}
```

---

### B3 — `<meta name="version">` in `apps/offline-web/index.html`

**Read** `apps/offline-web/index.html`.

**Find** the `<head>` section.

**Add** (if not already present):

```html
<meta name="version" content="{{APP_VERSION}}" />
```

The `apps/offline-web/vite.config.ts` already replaces `{{APP_VERSION}}` during `transformIndexHtml`. This tag just needs to exist in the source template for the replacement to land in the built output.

**Verify** after `pnpm run build:offline`: `dist/offline/index.html` must contain `<meta name="version" content="` followed by a semver string, not the literal placeholder.

---

### B4 — `scripts/assert-bundle-size.mjs` — add internal-ai budget + header comment

**Read** `scripts/assert-bundle-size.mjs`.

**Add** a budget entry for `offline-internal-ai` (raw ≤ 320000, gzip ≤ 95000). Look at how `offline-browser-ai` is defined and follow the same pattern.

**Add** at the very top of the file (after any shebang/use strict, before imports), a comment block documenting the last known built sizes:

```js
// Last measured bundle sizes — update this comment after each build:offline run.
// offline-browser-ai:  raw ??? kB  gzip ??? kB  (as of 2026-05-20)
// offline-no-ai:       raw ??? kB  gzip ??? kB  (as of 2026-05-20)
// offline-internal-ai: raw ??? kB  gzip ??? kB  (as of 2026-05-20)
```

Run `pnpm run build:offline` first, measure the actual sizes (the script itself outputs them), then fill in the real numbers.

---

## GROUP D — SERVER / DB STUBS (10 items)

**Important context:** `server/` is NOT a pnpm workspace package by design (see DECISIONS.md). Do not add it to `pnpm-workspace.yaml`. TypeScript interface stubs in `server/src/` are type-checked by the root `tsconfig.json` include glob. All Drizzle work stays in `server/package.json` as devDependencies only — never in `packages/core` or any offline bundle.

---

### D1 — `server/src/db/schema/users.ts` — real Drizzle pgTable definitions

Replace the current TypeScript interface stubs with real Drizzle `pgTable()` definitions. Use shared-schema + `org_id` for multi-tenancy. Apply RLS policies as SQL comments (actual `ALTER TABLE` / `CREATE POLICY` statements go in a migration file — see D4).

```typescript
import { pgTable, uuid, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'editor', 'viewer'])

export const tenantUsers = pgTable('tenant_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(), // RLS key
  externalId: text('external_id').notNull().unique(), // Entra ID object ID
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: userRoleEnum('role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete
})

export const userKmsKeys = pgTable('user_kms_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => tenantUsers.id),
  keyVaultUri: text('key_vault_uri').notNull(), // Azure Key Vault key URL
  keyVersion: text('key_version').notNull(),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | SCHEDULED_DESTRUCTION | DESTROYED
  destroyAt: timestamp('destroy_at', { withTimezone: true }),
  destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// RLS: ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
// RLS: CREATE POLICY tenant_isolation ON tenant_users USING (org_id = current_setting('app.org_id')::uuid);
// RLS: Same pattern for user_kms_keys.
// These statements belong in server/src/db/migrations/0001_rls_policies.sql
```

---

### D2 — `server/src/db/schema/audit-events.ts` — real Drizzle table

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(), // RLS key
  userId: uuid('user_id'), // null for system events
  action: text('action').notNull(), // e.g. 'record.create', 'auth.login'
  resource: text('resource'), // e.g. 'tasks/abc-123'
  outcome: text('outcome').notNull(), // 'success' | 'failure'
  metadata: jsonb('metadata'), // structured context; no PII
  traceId: text('trace_id'), // OTel trace correlation
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Append-only: application role must NOT have UPDATE or DELETE on this table.
// GRANT INSERT, SELECT ON audit_events TO tktaskapp_app;
// Retention: records older than 7 years should be archived, not deleted (compliance).
// RLS: ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
// RLS: CREATE POLICY tenant_isolation ON audit_events USING (org_id = current_setting('app.org_id')::uuid);
```

---

### D3 — `server/src/db/schema/kms-keys.ts` — real Drizzle table

```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const kmsKeyLifecycle = pgTable('kms_key_lifecycle', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  keyVaultUri: text('key_vault_uri').notNull(),
  keyVersion: text('key_version').notNull(),
  event: text('event').notNull(), // 'ISSUED' | 'ROTATED' | 'SCHEDULE_DESTRUCTION' | 'DESTROYED'
  requestedBy: uuid('requested_by'), // userId of requester
  requestedReason: text('requested_reason'), // GDPR erasure request ID or note
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Append-only: INSERT only; no UPDATE or DELETE. Enforced by DB role grants + trigger.
// TODO(Phase 9+): Create a DB trigger that raises an exception on UPDATE/DELETE attempts.
// TODO(Phase 9+): Create a destruction-scheduler.ts worker that polls for rows where
//   event='SCHEDULE_DESTRUCTION' and effectiveAt <= NOW(), then calls Azure Key Vault
//   to initiate key destruction and inserts a 'DESTROYED' row.
// RLS: ALTER TABLE kms_key_lifecycle ENABLE ROW LEVEL SECURITY;
// RLS: CREATE POLICY tenant_isolation ON kms_key_lifecycle USING (org_id = current_setting('app.org_id')::uuid);
```

---

### D4 — `server/src/db/index.ts` — real Drizzle instance

Replace the stub with a real `drizzle()` instance. Keep the connection string as an env var (never hard-code). Add `migrate.ts` and `seed.ts` stubs.

```typescript
// server/src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema/index.ts'

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: true } : false,
})

export const db = drizzle(pool, { schema })

export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}
```

Create `server/src/db/schema/index.ts` that re-exports all tables:

```typescript
export * from './users.ts'
export * from './audit-events.ts'
export * from './kms-keys.ts'
```

Create `server/src/db/migrate.ts` stub:

```typescript
// TODO: Run Drizzle migrations against DATABASE_URL
// Usage: node -r tsx/register server/src/db/migrate.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
const db = drizzle(pool)
await migrate(db, { migrationsFolder: './drizzle' })
await pool.end()
```

Create `server/src/db/seed.ts` stub:

```typescript
// TODO: Seed development data for local testing
// Usage: node -r tsx/register server/src/db/seed.ts
console.warn('Seed script not yet implemented.')
```

---

### D5 — `server/src/auth/oidc.ts` — Microsoft Entra ID OIDC/PKCE

Replace the interface stub with a concrete implementation using **Microsoft Entra ID**. Use `@azure/msal-node` or a standards-based OIDC library (`openid-client`). The implementation must:

1. Validate JWT tokens issued by `https://login.microsoftonline.com/{tenantId}/v2.0`
2. Verify signature against JWKS endpoint
3. Verify `aud` claim matches the app's client ID
4. Extract `oid` (object ID) as `externalId` for the `tenant_users` table
5. Extract `tid` (tenant ID) and map to `orgId`
6. Set `app.org_id` on the PostgreSQL session (for RLS): `SET LOCAL app.org_id = '...'`
7. Cache JWKS with a 24-hour TTL (not per-request fetching)

Add interfaces:

```typescript
export interface AuthenticatedContext {
  userId: string // tenant_users.id (internal UUID)
  orgId: string // org UUID derived from Entra tenant ID
  externalId: string // Entra object ID (oid claim)
  email: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
}
```

Document DPoP as a roadmap item (RFC 9449) — not implemented yet but noted in comments.

Add to `server/package.json` devDependencies (check for latest versions):

- `openid-client` or `@azure/msal-node`
- `jose` (for JWT verification if using openid-client)

---

### D6 — `server/src/authorization/policy-engine.ts` — OPA-compatible policy engine

Replace the interface stub with a concrete implementation. For this phase, implement a **TypeScript-native policy engine** (not a full OPA deployment — that is a Phase 9+ concern). The engine evaluates rules against the `AuthenticatedContext`.

```typescript
export interface PolicyDecision {
  allowed: boolean
  reason?: string
}

export interface PolicyRequest {
  context: AuthenticatedContext
  action: string // e.g. 'tasks:create', 'admin:delete-user'
  resource?: string // e.g. 'tasks/abc-123'
  resourceOrgId?: string
}

export function evaluate(request: PolicyRequest): PolicyDecision {
  // Deny cross-tenant access always — org_id from context must match resource org
  if (request.resourceOrgId && request.resourceOrgId !== request.context.orgId) {
    return { allowed: false, reason: 'Cross-tenant access denied' }
  }

  // Role-based action matrix
  const adminActions = ['admin:delete-user', 'admin:manage-keys', 'admin:view-audit']
  const editorActions = [
    'tasks:create',
    'tasks:update',
    'tasks:delete',
    'records:create',
    'records:update',
  ]
  const viewerActions = ['tasks:read', 'records:read']

  if (adminActions.includes(request.action)) {
    return { allowed: ['owner', 'admin'].includes(request.context.role) }
  }
  if (editorActions.includes(request.action)) {
    return { allowed: ['owner', 'admin', 'editor'].includes(request.context.role) }
  }
  if (viewerActions.includes(request.action)) {
    return { allowed: true }
  }

  return { allowed: false, reason: `Unknown action: ${request.action}` }
}
```

---

### D7 — `server/src/kms/key-service.ts` — Azure Key Vault implementation

Replace the interface stub with a concrete **Azure Key Vault** implementation using `@azure/keyvault-keys` and `@azure/identity` (DefaultAzureCredential — supports managed identity in AKS, local dev with az CLI).

Implement each method:

- `issueKey(userId)` — create a new RSA-HSM or EC key in Azure Key Vault; record event `'ISSUED'` in `kms_key_lifecycle`
- `wrapKey(dek, kek)` — use Azure Key Vault `wrapKey` operation (RSA-OAEP or AES-KW); DEK never leaves Node memory unwrapped
- `unwrapKey(wrapped, kek)` — use Azure Key Vault `unwrapKey` operation
- `scheduleKeyDestruction(userId, destroyAt)` — record event `'SCHEDULE_DESTRUCTION'` in `kms_key_lifecycle`; schedule the actual Azure KV key deletion for `destroyAt` (note: Azure KV enforces 24h soft-delete minimum; purge after that)
- `getKeyStatus(userId)` — query `kms_key_lifecycle` for latest event for this user; return typed `KeyStatus`

Add to `server/package.json` devDependencies:

- `@azure/keyvault-keys`
- `@azure/identity`

Key naming convention: `tktaskapp-user-{userId}` in the vault.

---

### D8 — `server/src/observability/otel.ts` — OpenTelemetry SDK wiring

Replace the interface stub with a concrete OTel SDK setup. Import from `@opentelemetry/sdk-node`.

Required span attributes on every span:

- `tenant.id` (= `orgId`)
- `user.id` (= internal userId, not Entra ID)
- `request.id` (UUID per HTTP request)
- `trace_id` (auto from OTel context)

Structured JSON log fields (every log line):

```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error",
  "service": "tktaskapp-server",
  "trace_id": "...",
  "span_id": "...",
  "tenant_id": "...",
  "user_id": "...",
  "request_id": "...",
  "message": "..."
}
```

**No PII in logs** — never log email addresses, names, or record content. Log IDs and actions only.

SLO targets (document in comments, not enforced by code):

- P99 latency < 500ms
- Error rate < 0.1%
- Uptime > 99.9%

Exporter: OTLP gRPC to `process.env['OTEL_EXPORTER_OTLP_ENDPOINT']` (defaults to `http://localhost:4317`).

Add to `server/package.json` devDependencies:

- `@opentelemetry/sdk-node`
- `@opentelemetry/auto-instrumentations-node`
- `@opentelemetry/exporter-trace-otlp-grpc`
- `@opentelemetry/exporter-metrics-otlp-grpc`

---

### D9 — `server/src/ai-gateway/policy-engine.ts` — AI gateway policy

Replace the interface stub with a concrete implementation enforcing:

1. **Per-tenant AI budget** — read limit from tenant config; reject if monthly token spend exceeds budget
2. **Per-user rate limiting** — max N requests per minute per user (sliding window in Redis or in-memory Map for Phase 9)
3. **Prompt screening** — reject prompts containing PII patterns (email regex, credit card regex, NI/SSN patterns) before sending to AI backend
4. **Model allowlist** — only models in `CLOUD_PROVIDERS` config may be called; reject unknown model IDs
5. **Audit logging** — every AI call (approved or rejected) is logged to `audit_events` with action `'ai.call'`

```typescript
export interface AiGatewayRequest {
  context: AuthenticatedContext
  model: string
  promptTokenEstimate: number
  systemPrompt?: string
  userMessage: string
}

export interface AiGatewayDecision {
  allowed: boolean
  reason?: string
  sanitisedMessage?: string // message after PII scrubbing
}
```

---

### D10 — `server/src/api/routes/health.ts` — real health probes

Replace the hardcoded stub responses with real probes.

```typescript
// GET /healthz — liveness (is the process alive?)
// Returns 200 immediately. Never fails unless the process is dead.

// GET /readyz — readiness (is the process ready to serve traffic?)
// Checks:
//   1. DB: call checkDbHealth() from db/index.ts
//   2. Azure KMS: attempt a lightweight GetKey call on a known sentinel key
// Returns 200 { status: 'ready', db: 'connected', kms: 'connected' }
// Returns 503 { status: 'not_ready', db: '...', kms: '...' } on any failure
// Timeout: each probe must complete within 3000ms or be treated as failed
```

---

## GROUP F — 2026 BEST PRACTICE GAPS (4 items)

---

### F1 — TypeScript Project References

**Goal:** True type-boundary enforcement between packages via `tsc --build`.

For each package that has a `tsconfig.json` (check `packages/core`, `packages/adapter-null`, `packages/adapter-rxdb`, `packages/adapter-dataverse`, `packages/adapter-kms`, `packages/adapter-mobile-native`):

Add to its `tsconfig.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "declarationMap": true
  }
}
```

In the **root `tsconfig.json`**, add a `references` array pointing to each package:

```json
{
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/adapter-null" },
    { "path": "./packages/adapter-rxdb" },
    { "path": "./packages/adapter-dataverse" },
    { "path": "./packages/adapter-kms" },
    { "path": "./packages/adapter-mobile-native" }
  ]
}
```

**Verify:** `pnpm run typecheck` still passes. The build must not regress.

---

### F2 — OWASP A10: Global error boundary

**Find:** `packages/core/src/main.ts` — the app entry point where `init()` is defined and the first render occurs.

**Add** at module scope (before `init()` is called from any entry file):

```typescript
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
  // Do not log sensitive data. Log the error type and message only.
  console.error('[unhandledrejection]', err.name, err.message)
  // Surface to user via the existing toast system
  setState({ toast: { message: 'An unexpected error occurred. Please reload.', type: 'error' } })
  event.preventDefault() // prevent default browser error reporting
})

window.addEventListener('error', (event) => {
  console.error('[window.error]', event.message, event.filename, event.lineno)
  setState({ toast: { message: 'An unexpected error occurred. Please reload.', type: 'error' } })
})
```

**Also wrap** the `fullRender()` call in `main.ts` in a try/catch so a render crash does not leave the user with a blank screen:

```typescript
try {
  fullRender(getState())
} catch (err) {
  console.error('[render error]', err)
  appEl.innerHTML = '<div style="padding:2rem;color:red">Render error — please reload.</div>'
}
```

Follow all CLAUDE.md security rules: use `escH()` for any user data in the fallback HTML, or use only safe literal strings as above.

---

### F3 — GDPR transparency UI (Articles 12–14)

**Find:** `packages/core/src/views/settings.ts` — the settings view.

**Add** a new section to the settings UI: **"Data & Privacy"**.

The section must show the user:

1. **What is stored locally:**
   - AES-256-GCM encrypted vault in IndexedDB (`nexus_vault_v2`) — CRM records
   - Session key in IndexedDB (`nexus_keys_v1`) — cleared on tab close
   - Individual encrypted records in IndexedDB (`nexus_data_v1`) — documents, conversations
   - File System handle in IndexedDB (`nexus_fs_v1`) — optional .vault disk file
   - Non-sensitive preferences in `localStorage` — theme, AI prefs, dashboard layout

2. **What is NOT sent anywhere** (offline profile): all data stays on this device; no cloud sync; AI uses only on-device models (Gemini Nano / Phi-4-mini)

3. **Your rights:** Export all data (JSON), delete all data (existing functions), disconnect vault file (existing function)

4. **Data controller:** The individual running this app on their own device (self-sovereign data)

Use the existing render/bind pattern from CLAUDE.md. All strings through `escH()`. This is a read-only informational section — no new DB calls needed.

---

### F4 — Drizzle RLS policies

Create a new file `server/src/db/migrations/0001_rls_policies.sql`:

```sql
-- Row-Level Security policies for Task App CRM
-- Run after initial schema creation (drizzle-kit push or migration).
-- These policies enforce tenant isolation at the database level.

-- tenant_users
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_users
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tenant_insert ON tenant_users
  FOR INSERT WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- user_kms_keys
ALTER TABLE user_kms_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_kms_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_kms_keys
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- audit_events
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audit_events
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tenant_insert ON audit_events
  FOR INSERT WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- kms_key_lifecycle
ALTER TABLE kms_key_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE kms_key_lifecycle FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON kms_key_lifecycle
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- Application role: grant minimum privileges only
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_users TO tktaskapp_app;
-- GRANT SELECT, INSERT ON audit_events TO tktaskapp_app;   -- no UPDATE/DELETE
-- GRANT SELECT, INSERT ON kms_key_lifecycle TO tktaskapp_app;  -- no UPDATE/DELETE
-- GRANT SELECT, INSERT ON user_kms_keys TO tktaskapp_app;
```

Update `server/src/db/index.ts` to set `app.org_id` on every connection before executing any query:

```typescript
// Middleware to set org_id for RLS on every request
export async function setOrgContext(client: PoolClient, orgId: string): Promise<void> {
  await client.query(`SET LOCAL app.org_id = '${orgId}'`)
  // Note: parameterised SET LOCAL is not supported in pg; orgId must be validated
  // as a UUID before this call to prevent injection. Never pass raw user input here.
}
```

---

## ACCESSIBILITY CI — real axe-core run

**File:** `.github/workflows/accessibility.yml`

Replace the current stub `echo` step with a real axe-core run:

```yaml
- name: Install @axe-core/cli
  run: npm install -g @axe-core/cli

- name: Serve dist/offline/index.html
  run: npx serve dist/offline -p 8080 &
  # axe-core/cli requires an HTTP URL, not file://

- name: Wait for server
  run: npx wait-on http://localhost:8080 --timeout 15000

- name: Run axe-core accessibility audit (WCAG 2.2 AA — audit mode)
  run: |
    axe http://localhost:8080 \
      --tags wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa \
      --reporter json \
      --save axe-results.json || true
    # '|| true' keeps build green in audit mode — violations are reported, not blocking

- name: Upload axe results
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: axe-accessibility-report
    path: axe-results.json
```

Add `serve` and `wait-on` to root devDependencies if not already present.

---

## RXDB ADAPTER (implement after Groups A, B, D, F are done)

**Target:** CouchDB / PouchDB replication protocol using RxDB's native replication plugin.

### R1 — `packages/adapter-rxdb/src/index.ts`

Implement the four-method `AdapterInterface` contract from `packages/core/src/adapter-interface.ts` using RxDB's `replicateCouchDB()` or `replicateRxCollection()`.

Key requirements:

- `pull(checkpoint)` — fetch changes since checkpoint from CouchDB `_changes` feed
- `push(changes)` — write local changes to CouchDB; handle conflicts using last-write-wins (with `updatedAt` timestamp comparison)
- `stream(onRemoteChange)` — subscribe to CouchDB `_changes?feed=eventsource`; return unsubscribe fn
- `clear()` — remove all local RxDB documents (used on vault wipe)

Configuration (passed to the adapter constructor):

```typescript
export interface RxDBAdapterConfig {
  couchDbUrl: string // e.g. 'http://localhost:5984/tktaskapp'
  dbName: string // RxDB database name
  authHeader?: string // e.g. 'Basic ...' or 'Bearer ...'
}
```

Encryption: documents are AES-256-GCM encrypted by the core before reaching the adapter. The adapter treats payloads as opaque blobs — it does NOT encrypt or decrypt.

### R2 — `apps/pwa-sync/src/entry.ts`

Replace `NullAdapter` with `RxDBAdapter`:

```typescript
import { RxDBAdapter } from '@tktaskapp/adapter-rxdb'
import { setAdapter } from '@tktaskapp/core/storage/db'
import { init } from '@tktaskapp/core/main'

const adapter = new RxDBAdapter({
  couchDbUrl: import.meta.env['VITE_COUCHDB_URL'] ?? 'http://localhost:5984/tktaskapp',
  dbName: 'tktaskapp',
})

setAdapter(adapter)
init()
```

Add `VITE_COUCHDB_URL` to `.env.example` with placeholder value and comment.

---

## HARD RULES — NEVER VIOLATE

From CLAUDE.md — these apply to every file in this implementation:

1. `trusted-types.ts` MUST be the first import in `main.ts` at all times
2. Never make `_dbKey` (the CryptoKey) extractable
3. All user-visible strings through `escH()` before `innerHTML` interpolation
4. Never use `btoa(String.fromCharCode(...array))` — use `u8ToBase64()` from `crypto.ts`
5. Never call `trustedTypes.createPolicy()` with an already-registered name
6. Keep the four IndexedDB databases separate and named correctly
7. `IDB_STORES = ['documents', 'conversations']` — new large stores go here, not `STORES`
8. After every `build:offline`, `generate-csp.mjs` runs automatically
9. Do not edit `taskapp.html` (legacy reference only)
10. Do not add Zod to any module imported by `packages/core` — use Valibot only
11. Module import order in `main.ts` must follow the order in CLAUDE.md
12. Server-side packages (`drizzle-orm`, `@azure/*`, `openid-client`) must NEVER appear in `packages/core` or any offline bundle

---

## STOP AND ASK BEFORE:

- Any destructive file operation (delete, overwrite working code without reading it first)
- Any `npm install` / `pnpm add` that adds a dependency to `packages/core` or the offline build
- If `pnpm run typecheck` or `pnpm run build:offline` breaks and you cannot fix it in two attempts
- If a phase requires architectural decisions not covered by this document

---

## VERIFICATION CHECKLIST — run after every group

```powershell
pnpm run typecheck
pnpm run build:offline
node scripts/assert-bundle-size.mjs
node scripts/assert-offline-bundle.mjs
```

All four must pass with zero errors before starting the next group. Report the output to the user before continuing.
