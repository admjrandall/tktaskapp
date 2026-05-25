# Server security rules

Apply whenever working in `server/src/`. These rules are enforced in code review and must never be bypassed.

## Query isolation — withTenant()

Every CRM database query must go through `withTenant(tenantId, fn)` from `server/src/services/base.ts`. This wraps a Drizzle transaction that sets both `SET LOCAL app.tenant_id` and `SET LOCAL app.org_id` before executing the query function. Row-level security policies on all CRM tables enforce these session variables. Never query CRM tables without `withTenant()` active.

## Audit trail — writeAuditEvent()

Every create, update, delete, suspend, and erase operation must write an audit event via `writeAuditEvent(input)` from `server/src/services/base.ts`. Audit events are hash-chained (each record includes a SHA-256 digest of the previous event). Skipping an audit write breaks chain integrity.

## HTTP response safety

Never return raw SQL errors, stack traces, query strings, or internal state in HTTP responses. Always return `{ error: 'Internal server error' }` with a 500 status. Log the real error via `otel.log()`.

## Request validation

Validate all request bodies with Valibot schemas before use. Schemas live in `server/src/schemas/index.ts`. Use `safeParseV()` helper; return 400 with error details on failure. Never trust raw `c.req.json()` output for CRM writes.

## Secrets

All secrets come from environment variables (see `server/.env.example`). Never hardcode credentials, API keys, or signing secrets. Never commit `.env` files.

## Step-up authentication (RFC 9470)

High-risk operations require `requireStepUp(operation)` middleware from `server/src/auth/step-up.ts`. Never remove or bypass this middleware. Operations and the routes that protect them:

| Operation                                            | Route                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `gdpr_erase`                                         | `POST /api/v1/admin/users/:id/erase`                                    |
| `ai_provider_configure`                              | `POST /api/v1/admin/ai-allowlist`, `PUT /api/v1/admin/ai-allowlist/:id` |
| `admin_user_change`                                  | `POST /api/v1/admin/integrations`                                       |
| `org_settings_change`                                | `PUT /api/v1/admin/org-settings`                                        |
| `data_export`, `legal_hold_change`, `kms_key_manage` | applicable admin routes                                                 |

Step-up tokens are single-use, 5-minute TTL, operation-scoped. Never use them as session tokens.

## Token revocation

Access token revocation must write to `AuthStateStore` (Redis primary, memory fallback) on explicit logout or admin suspension. Never just discard the token. The revocation check in `authMiddleware` happens before JWT validation. In production (`NODE_ENV=production`), if the revocation store is unreachable the request must fail closed (401).

## KMS operations

Use `getKmsService()` from `server/src/kms/key-service.ts` for all KMS operations. Never hardcode `AzureKeyVaultKeyService` or `AwsKmsKeyService` directly. The factory reads `KMS_PROVIDER` env var (default: `azure`).

## Authorization (OPA)

OPA evaluation uses a three-tier fallback: REST sidecar (`OPA_URL` env var) → WASM (`policies/crm.wasm`) → in-process TypeScript fallback in `middleware/opa.ts`. Cross-tenant access is always denied before role evaluation. Default is deny.

## Database migrations

Production schema changes must be committed SQL migrations in `server/drizzle/`. Do not use `drizzle-kit push` or ad-hoc schema changes against production. Migrations are applied via `pnpm db:migrate`.

## Package boundaries

Server code must not edit files in `packages/core/src/`. Frontend and server are separate packages. Do not create cross-package dependencies from `server/` into the frontend monorepo packages.

## Middleware stack (order matters)

`server/src/index.ts` applies middleware in this order: CORS → security headers → connection tracking → OTel spans → auth (`/api/v1/*`) → lockdown → routes. Do not reorder or skip layers.
