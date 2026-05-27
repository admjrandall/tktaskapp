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

| Operation               | Route                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `gdpr_erase`            | `POST /api/v1/admin/users/:id/erase`                                                                           |
| `user_suspend`          | `POST /api/v1/admin/users/:id/suspend`                                                                         |
| `ai_provider_configure` | `POST /api/v1/admin/ai-allowlist`, `DELETE /api/v1/admin/ai-allowlist/:id`                                     |
| `org_settings_change`   | `PATCH /api/v1/admin/org-settings`, `POST /api/v1/admin/integrations`, `DELETE /api/v1/admin/integrations/:id` |
| `data_export`           | `GET /api/v1/audit/export`                                                                                     |
| `legal_hold_change`     | `POST /api/v1/admin/legal-holds`, `DELETE /api/v1/admin/legal-holds/:holdId`                                   |
| `kms_key_manage`        | `POST /api/v1/admin/kms/keys/:userId/finalize-destruction`                                                     |

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

## New route checklist — run before every PR that adds a server route

When adding or modifying any route in `server/src/api/routes/`:

- [ ] All CRM table queries wrapped in `withTenant()` — no bare Drizzle calls
- [ ] Every create / update / delete / suspend / erase calls `writeAuditEvent()` before returning
- [ ] Request body validated with Valibot `safeParseV()` — no raw `c.req.json()` for writes
- [ ] High-risk operation? Add `requireStepUp(operation)` middleware and add to the table above
- [ ] Error paths return `{ error: 'Internal server error' }` — no SQL text, stack traces, or query strings in the response body
- [ ] New route uses `authMiddleware` if it accesses tenant data

**Automated coverage:** Bearer scans for missing auth checks and sensitive data in responses. Semgrep (`p/owasp-top-ten`) covers injection and missing validation patterns. The `gap-auditor` agent checks `withTenant` / `writeAuditEvent` coverage on demand.

## ASVS 5.0.0 chapter mapping

| Rule in this file                    | ASVS 5.0.0 chapter                      |
| ------------------------------------ | --------------------------------------- |
| withTenant() on all CRM queries      | V8 Authorization, V14 Data Protection   |
| writeAuditEvent() on mutations       | V16 Security Logging and Error Handling |
| HTTP response safety (no raw errors) | V16 §16.5.1                             |
| Request validation — Valibot         | V2 Validation and Business Logic        |
| Secrets from env vars only           | V13 Configuration                       |
| requireStepUp() on high-risk routes  | V6 Authentication, V8 Authorization     |
| Token revocation — AuthStateStore    | V7 Session Management                   |
| KMS via getKmsService()              | V11 Cryptography                        |
| OPA authorization                    | V8 Authorization                        |
| Middleware order                     | V15 Secure Coding and Architecture      |

Reference: [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) — target Level 2 for the enterprise-web and server delivery targets.
