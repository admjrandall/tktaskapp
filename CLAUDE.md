# CLAUDE.md

Task App CRM — offline-first, AES-256-GCM encrypted CRM. TypeScript monorepo (pnpm workspaces, Vite). Three delivery targets: offline-web (single HTML file, `file://`), enterprise-web (HTTPS PWA, Hono server), Dataverse (Power Platform Code App).

Get the current date before starting work. Never guess. Use `AskUserQuestion` to ask questions. Wait for answers before writing code.

## Agent operating contract

Do not take shortcuts. Do not guess when the repo, tests, package metadata, build output, or official docs can answer the question.

Do not patch symptoms. Do not remove features, validation, security controls, tests, or documentation to make an error disappear. Do not claim production readiness, FedRAMP, zero trust, or compliance without evidence.

Do not treat placeholders, stubs, mocks, TODOs, skipped checks, or untested logic as complete. Do not ignore broken tests, type errors, build failures, lint failures, security findings, or documentation drift.

Prefer correct architecture over quick patches. Use fail-closed defaults for security-sensitive configuration. Preserve delivery-target boundaries. Document incomplete, unverified, or deferred work honestly.

After two failed attempts at the same fix path: stop, explain what failed, choose a different approach or ask only for truly missing external information.

## Question and blocker policy

Do not ask questions for information discoverable from the repo, package metadata, tests, build output, or official docs.

Ask only when blocked by real external values: production domains, tenant IDs, CIDR ranges, cloud account IDs, secrets, or legal/business policy decisions.

When blocked: state what is blocked, why it cannot be safely inferred, the exact value or decision needed, and what work can continue without it.

## Current-source verification — IMPORTANT

**YOU MUST verify with current official or primary sources before making any decision involving:** security controls, compliance (FedRAMP, NIST, OWASP, CMMC, HIPAA, GDPR), authentication, cryptography, key management, audit requirements, privacy, dependency versions, framework versions, cloud services, mobile APIs, or browser API availability.

Use `WebSearch` and the `context7` MCP server (for library/framework docs) to verify. Do not rely solely on training data for these topics — guidance changes, iteration counts change, APIs are deprecated, CVEs emerge.

Source priority (highest to lowest):

1. Official government or standards body (NIST, CISA, EDPB, W3C, IETF)
2. Official framework or vendor documentation
3. Official package or repo release notes
4. Recognized security organization (OWASP, CIS, SANS)
5. Reputable secondary source — only when primary sources are unavailable

Every response on these topics must state: sources checked, version or date when available, why they apply, and anything **not** verified. If verification was not performed, you MUST state `Not verified against current sources` and explain why — do not silently present training-data guidance as current fact.

## Compliance honesty rule

Only use these statuses: `Implemented` · `Partially implemented` · `Designed` · `Not implemented` · `Not verified` · `Not applicable` · `Requires assessor/legal/security review`.

Every compliance claim must map to: requirement/control, implementation, evidence, test/validation method, and remaining gap.

## Build commands

```bash
pnpm run build:offline                # dist/offline/index.html (browser-ai profile; CSP auto-regenerated)
pnpm run build:offline:no-ai          # dist/offline-no-ai/index.html
pnpm run build:offline:internal-ai    # dist/offline-internal-ai/index.html
pnpm run build:enterprise             # dist/enterprise/ (hashed assets, PWA)
pnpm run build:mobile                 # alias for build:enterprise (Capacitor uses dist/enterprise)
pnpm run build:dataverse              # Power Apps Code App bundle
pnpm run build:all                    # all offline profiles + enterprise + dataverse
pnpm run typecheck && pnpm run lint && pnpm run test
```

Server (`cd server` first):

```bash
pnpm dev | pnpm build | pnpm start | pnpm typecheck
pnpm db:validate | pnpm db:migrate | pnpm db:seed | pnpm test
```

## Delivery targets

| Target         | Entry                                      | Adapter            | Runtime                                |
| -------------- | ------------------------------------------ | ------------------ | -------------------------------------- |
| Offline web    | `apps/offline-web/src/entry-browser-ai.ts` | `NullAdapter`      | Single HTML file, `file://`, no server |
| Enterprise web | `apps/enterprise-web/src/entry.ts`         | `RxDBAdapter`      | HTTPS PWA, OIDC/PKCE, service worker   |
| Dataverse      | `apps/dataverse/src/entry.ts`              | `DataverseAdapter` | Power Platform Code App                |

`apps/mobile/` is Capacitor native packaging only — no web entry. It uses `dist/enterprise` as its WebView source.

Use **offline-first** for the product architecture. Reserve **offline-only** / **local-only** for the offline-web build profile specifically.

## Security invariants — never bypass

These are the rules. Detailed rationale and edge cases: see imported rules files below.

**Frontend:** `escH()` before every `innerHTML` interpolation · `security/trusted-types.ts` first import in `bootstrap.ts` (two policies: `nexus-crm` and `nexus-crm-static-template`) · `_dbKey` must be `extractable: false` always · four IDB databases must stay separate (`nexus_keys_v1`, `nexus_vault_v2`, `nexus_data_v1`, `nexus_fs_v1`) · never `btoa(String.fromCharCode(...array))` — use `u8ToBase64()` · CSP hashes regenerate automatically after every offline build

**Server:** never return raw SQL errors in HTTP responses · every CRM query through `withTenant()` · every create/update/delete/suspend/erase via `writeAuditEvent()` · all secrets from env vars · high-risk routes require `requireStepUp(operation)` · revoke tokens via `AuthStateStore` on logout/suspension · use `getKmsService()` — never hardcode a KMS implementation

@.claude/rules/frontend.md
@.claude/rules/server.md
@.claude/rules/crypto.md

## Target-specific definition of done

**Offline web:** `file://` single-file build works · CSP hashes regenerated · no unintended network access · AI profile behavior correct · tested in Chrome and Edge.

**Enterprise web:** HTTPS/PWA build · OIDC/PKCE not weakened · API calls use correct auth/tenant · CORS allowlist-only · audit behavior intact.

**Server:** typecheck and tests pass · `withTenant()` on all CRM queries · deny-by-default authorization · step-up on high-risk routes · revocation and audit paths preserved.

**Mobile/Capacitor:** Capacitor WebView compatible · iOS ATS and Android NSC restrictive · native vault/biometric/network adapters not bypassed.

**Dataverse:** adapter boundary preserved · Power Platform auth not mixed with other targets.

## Documentation maintenance

After any task that changes documented facts — stores, views, build commands, architecture patterns, crypto parameters, module dependencies, or security behavior — update: `CLAUDE.md`, `TECHNICAL-REFERENCE.md`, `SECURITY.md`, `DECISIONS.md`, `CHANGELOG.md`. Do not update `agenttask.md` or `STRATEGIC-DIRECTION-FINAL.md` unless explicitly instructed. Only update what actually changed.

## Mandatory completion report

Every implementation, refactor, security, or compliance task must end with a completion report. Run `/completion-report` to scaffold it, or include manually:

- Summary · Files changed and why · Root cause · Current-source verification (security/compliance/version-sensitive work) · Tests and checks run with pass/fail results · Security and compliance impact · Remaining gaps · Safe to ship? (`Yes` / `No` / `Partially, with restrictions`)
