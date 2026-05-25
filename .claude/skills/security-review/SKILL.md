---
name: security-review
description: Run a security review of changed code in Task App CRM. Checks frontend invariants, server rules, crypto correctness, and delivery-target boundaries.
---

Perform a security review of the code changes in the current branch or the files specified in $ARGUMENTS. Work through each checklist section. Report findings with file:line references and severity (Critical / High / Medium / Low / Info).

## Frontend checks (`packages/core/src/`, `apps/`)

- [ ] Every `innerHTML` assignment uses `escH()` or `createAuditedStaticHTML()`. Search for raw string interpolation into innerHTML that bypasses these.
- [ ] `security/trusted-types.ts` is the first import in `bootstrap.ts`. Has this import order been disturbed?
- [ ] No new call to `trustedTypes.createPolicy()` with `nexus-crm` or `nexus-crm-static-template` — duplicate registration throws TypeError.
- [ ] `_dbKey` (`CryptoKey`) is never returned as a string, never serialized, and created with `extractable: false`.
- [ ] No new IDB store added to `STORES` that should be in `IDB_STORES` (large content stores belong in `IDB_STORES` and route through `_idbPutRecord` / `_idbLoadStore`).
- [ ] No use of `btoa(String.fromCharCode(...array))` — must use `u8ToBase64()` from `security/crypto.ts`.
- [ ] No concrete adapter import (`NullAdapter`, `RxDBAdapter`, `DataverseAdapter`) inside `packages/core/src/`.
- [ ] No cross-target pollution: offline-profile code must not reference `RxDBAdapter`, OIDC, or server API paths; enterprise-web entry must not reference `NullAdapter`.
- [ ] AI build profile boundaries respected: offline browser-ai profile must not add Ollama or cloud AI access; offline no-ai profile must have zero AI code; internal-ai profile must not add public cloud providers.

## Server checks (`server/src/`)

- [ ] Every new service method that queries CRM tables calls `withTenant()`. No raw DB queries without tenant isolation.
- [ ] Every new create/update/delete/suspend/erase route or service method calls `writeAuditEvent()`.
- [ ] No raw SQL errors, stack traces, or internal error detail returned in HTTP response bodies.
- [ ] All request bodies validated with Valibot schemas via `safeParseV()` before use.
- [ ] No hardcoded credentials, API keys, or secrets — all from env vars.
- [ ] High-risk routes use `requireStepUp(operation)` middleware. New admin routes: does the operation warrant step-up? If yes, is it wired?
- [ ] Access token revocation writes to `AuthStateStore` on logout/suspension — token is not just discarded.
- [ ] `getKmsService()` used for KMS operations — no direct instantiation of `AzureKeyVaultKeyService` or `AwsKmsKeyService`.
- [ ] New routes follow the middleware stack order: auth → lockdown → OPA → route handler.
- [ ] No server code editing files in `packages/core/src/`.

## Crypto checks

- [ ] PBKDF2 iterations remain at 600,000. No code lowers this value.
- [ ] AES-GCM IVs are randomly generated per call via `crypto.getRandomValues()`. No static or reused IVs.
- [ ] New key derivation uses `deriveKey()` from `security/crypto.ts` — not a custom PBKDF2 call.
- [ ] No change to `extractable` flag on `CryptoKey` derivation or import — must remain `false`.
- [ ] If IDB database names changed: migration path exists for existing user data.

## Dependency and build checks

- [ ] No new dependency added to the offline-web bundle that makes network requests (violates offline CSP).
- [ ] No new `console.log` or debug output left in production code paths.
- [ ] TypeScript type errors: `pnpm run typecheck` passes.
- [ ] After any offline build change: `pnpm run build:offline` produces a valid single-file output and `generate-csp.mjs` ran.

## Finding report

For each finding:

```
[SEVERITY] file:line — description — recommendation
```

Severity guide:

- **Critical**: exploitable XSS, authentication bypass, key extraction, cross-tenant data access
- **High**: missing audit event, step-up bypass, token not revoked on logout, extractable crypto key
- **Medium**: missing input validation, raw error detail in response, IDB store boundary violation
- **Low**: missing escH() on a non-dangerous path, minor policy gap
- **Info**: style/pattern inconsistency, non-security improvement suggestion
