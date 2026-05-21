# Backend Implementation Prompt — Task App CRM Server

## What You Are Doing

You are implementing the complete server backend for **Task App CRM**, a TypeScript monorepo at `d:\techkeycrmapp`. The server layer exists as a design scaffold with partial utility implementations but **cannot run** — it has no HTTP server, no route handlers, and no CRM database schema. Your job is to complete it end-to-end.

Get the current date before starting. Use 2026 production-ready best practices throughout. Do not take shortcuts.

---

## Read These Files First — Required Before Writing Any Code

Read every one of these files in full before touching anything:

- `server/package.json`
- `server/src/db/index.ts`
- `server/src/db/schema/users.ts`
- `server/src/db/schema/audit-events.ts`
- `server/src/db/schema/kms-keys.ts`
- `server/src/db/schema/index.ts`
- `server/src/db/migrations/0001_rls_policies.sql`
- `server/src/auth/oidc.ts`
- `server/src/authorization/policy-engine.ts`
- `server/src/kms/key-service.ts`
- `server/src/observability/otel.ts`
- `server/src/middleware/cors.ts`
- `server/src/api/routes/health.ts`
- `server/src/ai-gateway/policy-engine.ts`
- `server/src/types/vendor.d.ts`
- `docs/api/openapi.yaml`
- `packages/core/src/constants.ts`
- `packages/core/src/schemas/index.ts`
- `packages/core/src/schemas/client.schema.ts`
- `packages/core/src/schemas/project.schema.ts`
- `packages/core/src/schemas/task.schema.ts`
- `packages/core/src/schemas/person.schema.ts`
- `packages/core/src/schemas/document.schema.ts`
- `packages/core/src/schemas/file.schema.ts`
- `infra/k8s/deployment.yaml`
- `infra/k8s/network-policy.yaml`

---

## What Already Exists — Do Not Recreate

These are complete and correct. Build on them, do not replace:

- `server/src/db/index.ts` — Drizzle `db` instance, `checkDbHealth()`, `closeDb()` ✓
- `server/src/db/schema/users.ts` — `tenantUsers`, `userKmsKeys` tables ✓
- `server/src/db/schema/audit-events.ts` — `auditEvents` table ✓
- `server/src/db/schema/kms-keys.ts` — `kmsKeyLifecycle` table ✓
- `server/src/db/migrate.ts` — Drizzle migration runner ✓
- `server/src/auth/oidc.ts` — `validateEntraIdToken()`, JWKS cache, all types ✓
- `server/src/authorization/policy-engine.ts` — `evaluate()`, role matrix, `PolicyRequest`/`PolicyDecision` types ✓
- `server/src/kms/key-service.ts` — `KeyService` interface, `AzureKeyVaultKeyService` ✓
- `server/src/observability/otel.ts` — `OtelService` interface, `OtelServiceImpl`, SDK init ✓
- `server/src/middleware/cors.ts` — `corsHeaders()`, `corsPreflight()` ✓
- `server/src/api/routes/health.ts` — `handleHealthz()`, `handleReadyz()`, `HttpContext` interface ✓
- `server/src/ai-gateway/policy-engine.ts` — `evaluateAiGatewayRequest()` ✓
- `server/src/types/vendor.d.ts` — ambient type declarations ✓

---

## Architecture Decisions (Non-Negotiable)

- **HTTP framework**: Hono v4 with `@hono/node-server`
- **Database ORM**: Drizzle ORM (already chosen) with PostgreSQL (`pg`)
- **Authorization policy engine**: Open Policy Agent (OPA). Run OPA in-process via `@open-policy-agent/opa-wasm` for local dev; in production k8s, also support the OPA sidecar REST pattern. OPA is a CNCF Graduated project and the 2026 standard for policy-as-code.
- **All secrets from environment variables only** — never hardcoded
- **Multi-tenant**: Every CRM entity has a `tenantId` column with Row-Level Security via PostgreSQL RLS. Tenant is derived from the JWT `tid` claim.
- **Audit log**: Every mutating operation (POST/PATCH/DELETE) writes to `auditEvents`
- **TypeScript strict mode** throughout — `noImplicitAny: true`, `strictNullChecks: true`

---

## Task List — Implement in This Order

### 1. Update `server/package.json`

Replace the `dependencies` and `devDependencies` sections and `scripts`. Required runtime dependencies:

```json
{
  "dependencies": {
    "hono": "^4",
    "@hono/node-server": "^1",
    "drizzle-orm": "^0.44",
    "pg": "^8",
    "@azure/identity": "^4",
    "@azure/keyvault-keys": "^4",
    "@opentelemetry/sdk-node": "^0.57",
    "@opentelemetry/auto-instrumentations-node": "^0.57",
    "@opentelemetry/exporter-trace-otlp-http": "^0.57",
    "@opentelemetry/api": "^1",
    "@open-policy-agent/opa-wasm": "^1",
    "jose": "^5",
    "zod": "^3"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31",
    "@types/pg": "^8",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^2"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json --noEmit && esbuild src/index.ts --bundle --platform=node --target=node22 --outfile=dist/server.js",
    "start": "node dist/server.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/db/seed.ts",
    "test": "vitest run"
  }
}
```

### 2. Create `server/drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
})
```

### 3. Create CRM Entity Database Schemas

Create one file per entity under `server/src/db/schema/`. Follow the exact same pattern as `users.ts` — use `pgTable`, `pgEnum`, `text`, `timestamp`, `boolean`, `integer`, `jsonb` from `drizzle-orm/pg-core`. Every table must have:

- `id` — `text('id').primaryKey()` (UUID generated by the client, passed in)
- `tenantId` — `text('tenant_id').notNull()` — for RLS
- `createdAt` — `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
- `updatedAt` — `timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()`

Create these files:

**`server/src/db/schema/clients.ts`**
Fields: `id`, `tenantId`, `name` (notNull), `contactName`, `email`, `phone`, `website`, `stage` (enum: Prospect|Active|Inactive|Churned, default Prospect), `description`, `createdAt`, `updatedAt`

**`server/src/db/schema/departments.ts`**
Fields: `id`, `tenantId`, `name` (notNull), `description`, `createdAt`, `updatedAt`

**`server/src/db/schema/projects.ts`**
Fields: `id`, `tenantId`, `name` (notNull), `stage` (enum: Planning|Active|On Hold|Completed|Cancelled, default Planning), `priority` (enum: Low|Medium|High|Critical, default Medium), `dueDate` (text, ISO8601), `description`, `clientId` (text, FK reference to clients.id nullable), `ownerId` (text, FK to users.id nullable), `createdAt`, `updatedAt`

**`server/src/db/schema/tasks.ts`**
Fields: `id`, `tenantId`, `title` (notNull), `status` (enum: Todo|In Progress|Blocked|Done, default Todo), `priority` (enum: Low|Medium|High|Critical, default Medium), `dueDate` (text, ISO8601), `description`, `projectId` (FK to projects.id nullable), `assigneeId` (FK to users.id nullable), `parentId` (FK to tasks.id nullable — subtasks), `createdAt`, `updatedAt`

**`server/src/db/schema/people.ts`**
Fields: `id`, `tenantId`, `name` (notNull), `role`, `email`, `phone`, `departmentId` (FK to departments.id nullable), `clientId` (FK to clients.id nullable), `createdAt`, `updatedAt`

**`server/src/db/schema/tags.ts`**
Fields: `id`, `tenantId`, `name` (notNull), `color` (text, hex color), `createdAt`, `updatedAt`

**`server/src/db/schema/communications.ts`** (activity log — calls, emails, meetings)
Fields: `id`, `tenantId`, `type` (enum: call|email|meeting|note, notNull), `subject` (notNull), `body`, `occurredAt` (timestamp notNull), `durationMinutes` (integer), `relatedStore` (text — which entity: clients|projects|people|tasks), `relatedId` (text — the entity id), `personId` (FK to people.id nullable), `clientId` (FK to clients.id nullable), `createdBy` (FK to users.id notNull), `createdAt`, `updatedAt`

**`server/src/db/schema/time-entries.ts`**
Fields: `id`, `tenantId`, `taskId` (FK to tasks.id nullable), `userId` (FK to users.id notNull), `description`, `startedAt` (timestamp notNull), `endedAt` (timestamp nullable — null means running), `durationSeconds` (integer nullable — computed on stop), `createdAt`, `updatedAt`

**`server/src/db/schema/notifications.ts`**
Fields: `id`, `tenantId`, `userId` (FK to users.id notNull — recipient), `title` (notNull), `body`, `type` (enum: info|warning|due_soon|overdue|mention, default info), `relatedStore` (text nullable), `relatedId` (text nullable), `read` (boolean notNull default false), `createdAt`, `updatedAt`

**`server/src/db/schema/files.ts`**
Fields: `id`, `tenantId`, `name` (notNull), `url` (text nullable — external URL), `mimeType`, `sizeBytes` (integer), `relatedStore` (text), `relatedId` (text), `uploadedBy` (FK to users.id nullable), `addedAt` (timestamp notNull defaultNow), `createdAt`, `updatedAt`

**`server/src/db/schema/documents.ts`**
Fields: `id`, `tenantId`, `title` (notNull), `body` (text — markdown/rich text), `excerpt` (text — first 200 chars of body, updated on save), `linkedStore` (text nullable), `linkedId` (text nullable), `section` (text nullable), `pinned` (boolean default false), `createdBy` (FK to users.id nullable), `tagIds` (jsonb — array of tag id strings), `createdAt`, `updatedAt`

**`server/src/db/schema/standalone-notes.ts`**
Fields: `id`, `tenantId`, `body` (notNull), `clientId` (FK nullable), `projectId` (FK nullable), `taskId` (FK nullable), `personId` (FK nullable), `createdBy` (FK to users.id nullable), `createdAt`, `updatedAt`

**`server/src/db/schema/conversations.ts`** (AI chat sessions)
Fields: `id`, `tenantId`, `userId` (FK to users.id notNull), `title` (text notNull default 'New Conversation'), `messages` (jsonb notNull default '[]' — array of `{role: 'user'|'assistant', content: string, timestamp: string}`), `model` (text nullable — which AI model was used), `createdAt`, `updatedAt`

### 4. Update `server/src/db/schema/index.ts`

Export all new schemas from the index file alongside the existing ones.

### 5. Create a New Migration

After creating all schemas, run `pnpm db:generate` from the `server/` directory to generate the Drizzle migration file. Then create a second migration SQL file `server/drizzle/0002_crm_entities.sql` that applies RLS policies to all new tables using the same pattern as `0001_rls_policies.sql` — each table needs:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id = current_setting('app.tenant_id')::text);
```

Also add the append-only DB trigger for `kms_key_lifecycle` in this migration:

```sql
CREATE OR REPLACE FUNCTION prevent_kms_key_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'kms_key_lifecycle is append-only';
END;
$$;
CREATE TRIGGER kms_key_lifecycle_append_only
  BEFORE UPDATE OR DELETE ON kms_key_lifecycle
  FOR EACH ROW EXECUTE FUNCTION prevent_kms_key_update();
```

### 6. Complete the Seed Script `server/src/db/seed.ts`

Replace the stub with a real seed that creates:

- One test tenant (tenantId: `'dev-tenant-1'`)
- One admin user (email: `admin@dev.local`, role: `admin`)
- Sample data: 2 clients, 1 department, 3 projects, 5 tasks, 2 people, 2 tags
- Uses `db.insert()` with Drizzle ORM — follow the pattern in `server/src/db/index.ts`
- Idempotent: check if data already exists before inserting (use `ON CONFLICT DO NOTHING`)

### 7. Create OPA Policy Files and Loader

**Create `server/policies/crm.rego`:**

```rego
package crm

import future.keywords.if
import future.keywords.in

# Default deny
default allow = false

# Admins can do anything
allow if {
    input.role == "admin"
}

# Editors can read, create, update — not delete users or erase records
allow if {
    input.role == "editor"
    input.action in {"read", "create", "update"}
}

# Viewers can only read
allow if {
    input.role == "viewer"
    input.action == "read"
}

# Tenant isolation — every request must match the token tenant
deny_cross_tenant if {
    input.resourceTenantId != null
    input.resourceTenantId != input.tenantId
}

# Admins only: user management and erasure
allow if {
    input.role == "admin"
    input.action in {"suspend_user", "erase_user", "manage_users"}
}
```

**Create `server/src/middleware/opa.ts`:**

Load the OPA WASM bundle at startup using `@open-policy-agent/opa-wasm`. Export an `evaluatePolicy(input: PolicyInput): Promise<boolean>` function and a Hono middleware `opaMiddleware` that calls it with `{ role, action, tenantId, resourceTenantId }`. Deny with 403 if OPA returns false or throws.

Pattern: load the policy WASM once at module init (lazy, memoized). The policy input comes from the Hono context variables set by the auth middleware (see task 8).

Also support a REST fallback: if `OPA_URL` env var is set, call `POST ${OPA_URL}/v1/data/crm/allow` instead of WASM — this is the production sidecar pattern.

### 8. Complete OIDC — Create `server/src/auth/oidc-service.ts`

Implement `OidcServiceImpl` that satisfies the `OidcService` interface defined in `server/src/auth/oidc.ts`. Implementation must:

- Use the authorization code + PKCE flow (RFC 7636)
- `buildAuthorizationUrl(tenantId, redirectUri, state, codeChallenge)` — constructs the Entra ID authorize URL with `response_type=code`, `scope=openid profile email offline_access`, PKCE params
- `exchangeCode(tenantId, code, codeVerifier, redirectUri)` — POSTs to Entra ID token endpoint, returns `TokenResponse`
- `refreshAccessToken(tenantId, refreshToken)` — POSTs to token endpoint with `grant_type=refresh_token`
- `revokeToken(token)` — POSTs to revocation endpoint
- Token validation reuses `validateEntraIdToken()` from `oidc.ts`
- Refresh token rotation: every refresh response replaces the old refresh token
- No SAML, no SCIM — those are explicitly out of scope for this implementation

Also create `server/src/auth/middleware.ts` — a Hono middleware that:

1. Extracts `Authorization: Bearer <token>` header
2. Calls `validateEntraIdToken(token)` from `oidc.ts`
3. On success: sets `c.set('userId', claims.sub)`, `c.set('tenantId', claims.tid)`, `c.set('role', claims.roles?.[0] ?? 'viewer')` in Hono context
4. On failure: returns 401 JSON `{ error: 'Unauthorized' }`

### 9. Create OTel Request Middleware `server/src/observability/middleware.ts`

A Hono middleware that:

- Creates a root span per request using `@opentelemetry/api` `trace.getTracer('crm-server').startActiveSpan()`
- Attaches `http.method`, `http.route`, `http.status_code`, `tenant.id` as span attributes
- Records span errors on 5xx responses
- Injects trace ID into response header `X-Trace-Id`
- On span end: calls `OtelServiceImpl.recordRequest()` with method, route, status, durationMs

### 10. Create Service Layer

Create one file per entity under `server/src/services/`. Each service file exports a class (e.g., `ClientsService`) with methods: `list(tenantId, filters)`, `getById(tenantId, id)`, `create(tenantId, userId, data)`, `update(tenantId, id, changes)`, `delete(tenantId, id)`.

All methods:

- Accept `tenantId` as first param — always filter by it
- Set `SET LOCAL app.tenant_id = '${tenantId}'` before each query using `db.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`)` so PostgreSQL RLS applies
- Use Drizzle ORM `db.select()`, `db.insert()`, `db.update()`, `db.delete()`
- Write an audit event via `db.insert(auditEvents)` on create, update, delete — include: `eventType`, `userId`, `tenantId`, `resourceType`, `resourceId`, `timestamp`, `details` (JSON)
- Return plain objects (not Drizzle result types) — use `type` aliases matching the OpenAPI schema shapes

Create services for: `ClientsService`, `ProjectsService`, `TasksService`, `PeopleService`, `DepartmentsService`, `CommunicationsService`, `TagsService`, `TimeEntriesService`, `NotificationsService`, `FilesService`, `DocumentsService`, `StandaloneNotesService`, `ConversationsService`

### 11. Create Route Handlers

Create one file per entity under `server/src/api/routes/`. Each file exports a Hono `Router` (using `new Hono()`) with standard REST routes. Wire the router in the main entry (task 12).

Standard CRUD routes per entity (adjust where semantically appropriate):

```
GET    /api/v1/{entity}           — list (filter by tenantId from JWT)
POST   /api/v1/{entity}           — create
GET    /api/v1/{entity}/:id       — get by id (validate tenantId matches)
PATCH  /api/v1/{entity}/:id       — update (validate tenantId)
DELETE /api/v1/{entity}/:id       — delete (validate tenantId)
```

Additional routes:

- `GET /api/v1/audit` — query audit log (admin only)
- `GET /api/v1/audit/export` — export as NDJSON (admin only)
- `POST /api/v1/admin/users/:id/suspend` — suspend user (admin only)
- `POST /api/v1/admin/users/:id/erase` — trigger GDPR erasure (admin only)
- `GET /api/v1/admin/users` — list users (admin only)
- `GET /api/v1/conversations/:id/messages` — get messages for a conversation
- `POST /api/v1/conversations/:id/messages` — append a message

Each route handler must:

1. Call the appropriate `*Service` method
2. Return JSON with appropriate HTTP status (200/201/204/400/403/404/500)
3. Validate request body with Zod (create schemas matching the OpenAPI spec shapes)
4. Pass through the OPA middleware result — if role check fails, 403
5. On error: log via `OtelServiceImpl`, return `{ error: string }` — never leak stack traces

### 12. Create `server/src/index.ts` — Main Entry Point

This is the Hono server entry. Wire everything together:

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
// import all route modules, middleware, OTel init, etc.

// 1. Initialize OTel FIRST (before anything else — must instrument imports)
// 2. Create Hono app
// 3. Apply global middleware in order:
//    a. CORS (using corsHeaders/corsPreflight from middleware/cors.ts)
//    b. OTel request span middleware
//    c. Auth middleware (JWT validation → sets userId, tenantId, role on context)
//    d. OPA policy middleware (reads role/action from context, evaluates policy)
// 4. Mount health routes WITHOUT auth middleware (public):
//    app.get('/healthz', handleHealthz)
//    app.get('/readyz', handleReadyz)
// 5. Mount all CRM routes under /api/v1 WITH auth+OPA
// 6. Global error handler — catches unhandled errors, logs span error, returns 500
// 7. serve({ fetch: app.fetch, port: Number(process.env['PORT'] ?? 3000) })
// 8. Graceful shutdown: on SIGTERM, drain in-flight requests, close DB pool, flush OTel
```

### 13. Create `server/src/kms/erasure-workflow.ts`

GDPR Article 17 erasure workflow. Exports `runErasureWorkflow(userId: string, tenantId: string, requestedBy: string): Promise<ErasureResult>`.

Steps:

1. Check `LegalHoldService.isUserOnHold(userId)` — if yes, throw `LegalHoldActiveError`
2. Call `KeyService.scheduleKeyDestruction(keyHandle, effectiveAt: Date)` where `effectiveAt = now()` (immediate for erasure requests)
3. Soft-delete all user records across all CRM tables (set `deletedAt` timestamp — add this column to all entity tables in the schema)
4. Write an audit event: `event_type: 'gdpr_erasure_requested'`
5. Return `{ userId, status: 'scheduled', effectiveAt, auditEventId }`

### 14. Create `server/src/kms/legal-hold.ts`

Exports `LegalHoldService` class with:

- `placeHold(userId, tenantId, reason, expiresAt?)` — insert a row into a new `legalHolds` table (create the Drizzle schema for it: id, userId, tenantId, reason, placedAt, expiresAt, liftedAt, placedBy)
- `liftHold(holdId, liftedBy)` — set `liftedAt = now()`
- `isUserOnHold(userId)` — returns true if any active hold exists (liftedAt is null, expiresAt is null or in future)

Add the `legalHolds` Drizzle schema to `server/src/db/schema/legal-holds.ts` and export it from the index.

### 15. Create `server/src/kms/destruction-scheduler.ts`

A worker that polls the `kmsKeyLifecycle` table every 60 seconds for rows where `event = 'SCHEDULE_DESTRUCTION'` and `effectiveAt <= NOW()` and no subsequent `DESTROYED` event exists for the same `keyId`. For each match:

1. Call `KeyService.destroyKey(keyHandle)` — the Azure KV implementation in `key-service.ts`
2. Write a `DESTROYED` event row to `kmsKeyLifecycle`
3. Write an audit event

Export `startDestructionScheduler(): NodeJS.Timeout` and `stopDestructionScheduler(timer)`. Wire into `server/src/index.ts` startup/shutdown.

### 16. Complete `server/src/observability/otel.ts` — Real Span Management

The existing implementation has placeholder span logic. Add to `OtelServiceImpl`:

- `getTracer()` — returns `trace.getTracer('crm-server', pkg.version)` from `@opentelemetry/api`
- `startSpan(name, attributes)` — calls `tracer.startActiveSpan(name)`
- `recordDbQuery(operation, table, durationMs)` — creates a child span with `db.operation`, `db.table` attributes
- `recordKmsCall(operation, durationMs)` — creates a child span with `kms.operation` attribute
- Fix the hardcoded `'unknown'` trace ID (line ~207) — use `trace.getActiveSpan()?.spanContext().traceId ?? 'none'`

Add `server/src/observability/metrics.ts` — RED metrics using `@opentelemetry/api` `metrics.getMeter()`:

- Request counter (`crm.requests.total`) with labels: method, route, status
- Request duration histogram (`crm.requests.duration_ms`) with labels: method, route
- Active connections gauge (`crm.connections.active`)

### 17. AI Gateway — Make In-Memory State Production-Aware

In `server/src/ai-gateway/policy-engine.ts`:

- Add a comment block (or implement if Redis is available) noting that `rateLimitMap` and `budgetMap` are in-memory and will reset on pod restart. For single-instance deployments this is acceptable. For multi-instance, set `AI_GATEWAY_REDIS_URL` env var and implement Redis-backed rate limiting using `ioredis` — make this conditional: if env var is set, use Redis; otherwise keep Map.
- Make the monthly budget per-tenant configurable via env: `AI_GATEWAY_MONTHLY_BUDGET_TOKENS` (default: 1_000_000).
- The fire-and-forget audit log write should catch and log errors explicitly.

---

## Global Constraints — Non-Negotiable

1. **Never log raw SQL errors** to HTTP responses — always return generic `{ error: 'Internal server error' }` at the API layer.
2. **Never skip tenant isolation** — every DB query must include `tenantId` in the WHERE clause or rely on RLS being set.
3. **Every mutating endpoint writes an audit event** — create, update, delete, suspend, erase.
4. **All secrets from environment variables** — `DATABASE_URL`, `AZURE_KV_URL`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ALLOWED_ORIGINS`, `PORT`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OPA_URL` (optional).
5. **Zod validation on all request bodies** — return 400 with Zod error details on validation failure.
6. **TypeScript strict mode** — no `any`, no `@ts-ignore` unless the external type is genuinely missing and vendored in `vendor.d.ts`.
7. **Graceful shutdown** — drain in-flight requests, close DB pool, flush OTel spans on SIGTERM.
8. Do not edit files in `packages/core/src/` — that is the frontend package.
9. Do not edit `taskapp.html` — legacy reference only.
10. After completing implementation, run `pnpm typecheck` from the repo root to verify TypeScript compiles cleanly.

---

## Environment Variables Required (document in `server/.env.example`)

```
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/taskapp
AZURE_KV_URL=https://your-vault.vault.azure.net
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ALLOWED_ORIGINS=http://localhost:5173
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OPA_URL=                        # optional — if set, uses OPA REST sidecar; otherwise uses WASM
AI_GATEWAY_MONTHLY_BUDGET_TOKENS=1000000
AI_GATEWAY_REDIS_URL=           # optional — if set, uses Redis for rate limiting
```

---

## Documentation to Update After Implementation

After implementation is complete, update these files to reflect actual changes:

- `CLAUDE.md` — add server entry point, HTTP framework, OPA, new packages
- `TECHNICAL-REFERENCE.md` — server architecture section
- `CHANGELOG.md` — new version entry
