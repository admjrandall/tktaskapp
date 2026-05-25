# Task App CRM — Remediation Plan

**Generated:** 2026-05-25
**Auditor:** Automated gap analysis (Claude Code + web-verified standards)
**Codebase state:** `master` branch, commit `6e7e0a9`

---

## How to use this document

This file is the authoritative implementation backlog produced by a full codebase gap
analysis. Every issue has been traced to an exact file and line. Standards citations have
been verified against their 2025–2026 source documents, not training-data assumptions.

**To start a new session working through this plan, copy the prompt in §0 verbatim.**

---

## §0 — Session Starter Prompt

> Copy the block below and paste it as your first message in a new Claude Code session.
> The agent will orient itself, verify the current state of each issue against the live
> code, and begin implementing the highest-severity items first.

```
You are continuing work on the Task App CRM monorepo at D:\techkeycrmapp.

Read CLAUDE.md in full before doing anything else — it is the authoritative guide for
this codebase (architecture, security rules, build commands, module dependency order).

Then read REMEDIATION-PLAN.md. This document contains a prioritised backlog of all
known gaps, bugs, and missing implementations found by a gap analysis on 2026-05-25.
Every issue includes the exact file and line number.

Work through the plan in severity order: CRITICAL first, then MODERATE, then LOW.
Within each severity band, work in the sprint order defined in §8.

Before implementing any item:
1. Read the cited file(s) to confirm the issue still exists (code may have changed).
2. Check the "Standards & compliance" references in each item so your implementation
   meets the stated requirement — do not rely solely on training data for security
   controls, crypto parameters, or compliance obligations.
3. Use the AskUserQuestion tool if you are unsure about an external value
   (a production CIDR, a tenant ID, a KMS key alias, etc.).
4. After implementing each item, mark it complete by appending ✅ DONE [date] to its
   heading in REMEDIATION-PLAN.md, then run the relevant test command to confirm no
   regressions before moving to the next item.

Do not fix multiple items in a single commit. One commit per item, with a concise
message that references the item ID (e.g. "fix(C-1): add 0001_rls_policies.sql").

Start with C-1 — the missing RLS migration. Read server/drizzle/ and
server/src/db/schema/users.ts first to confirm the current state, then implement.
```

---

## §1 — Standards & Compliance References

All security controls in this plan are anchored to the following documents.
Do not implement a control without first verifying it meets the cited standard.

| Standard        | Current version                                           | Key requirement for this codebase                                                                                                           |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| OWASP Top 10    | 2025 (A01–A10)                                            | A01 Broken Access Control (RLS gaps); A02 Security Misconfiguration; A07 Authentication Failures; A10 Mishandling of Exceptional Conditions |
| NIST SP 800-63B | **SP 800-63B-4** (supersedes 800-63B, withdrawn Aug 2025) | AAL2 = phishing-resistant MFA; passkeys (FIDO2) now mandatory for AAL2+                                                                     |
| GDPR Article 17 | EDPB Guidelines 02/2025                                   | Crypto-shredding (key destruction) is a valid erasure method when encryption is state-of-the-art and keys are securely destroyed            |
| RFC 9470        | Final (IETF)                                              | OAuth 2.0 Step Up Authentication Challenge Protocol — `WWW-Authenticate: Bearer error="insufficient_user_authentication"`                   |
| RFC 9700        | Final (IETF)                                              | Best Current Practice for OAuth 2.0 Security — token binding, revocation, PKCE requirements                                                 |
| MASVS           | 2.0                                                       | Mobile Application Verification Standard — MASVS-STORAGE-1 (native secure storage), MASVS-CRYPTO-1                                          |
| PostgreSQL RLS  | n/a                                                       | `FORCE ROW LEVEL SECURITY` must be set; app role must not be table owner; index on `tenant_id` / `org_id` required for performance          |

---

## §2 — CRITICAL Issues

These items are either active security vulnerabilities or broken user flows that block
production use. Implement before any MODERATE or LOW items.

---

### C-1 — Missing `0001_rls_policies.sql`: RLS not enforced on `tenant_users` and `user_kms_keys` ✅ DONE 2026-05-25

**Severity:** CRITICAL — active tenant-isolation vulnerability
**OWASP:** A01:2025 Broken Access Control
**Standard:** PostgreSQL RLS best practice; AWS Prescriptive Guidance on multi-tenant RLS

#### What is broken

Migration sequence jumps from nothing to `0002_crm_entities.sql`. The schema file
`server/src/db/schema/users.ts` contains this comment (lines 32–35):

```
// RLS: ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
// RLS: CREATE POLICY tenant_isolation ON tenant_users USING ...
// These statements belong in server/src/db/migrations/0001_rls_policies.sql
```

The migration file was **never created**. `0002_crm_entities.sql` correctly enables RLS
on all CRM entity tables, but `tenant_users` and `user_kms_keys` — the two most sensitive
tables — have **zero row-level security active**. Any authenticated user from one tenant
can read another tenant's users and KMS key records.

`FORCE ROW LEVEL SECURITY` is also missing from the existing CRM entity policies, which
means the application role (if it is the table owner) bypasses all policies silently.

#### Files to read first

- `server/src/db/schema/users.ts` — confirm RLS comment still present
- `server/drizzle/0002_crm_entities.sql` — see the correct RLS pattern to follow
- `server/drizzle/meta/_journal.json` — confirm journal starts at `0002`

#### Implementation

**Step 1 — Create `server/drizzle/0001_rls_policies.sql`**

```sql
-- 0001_rls_policies.sql
-- Row-level security for user-scoped tables.
-- Must run before 0002_crm_entities.sql populates dependent FK rows.

-- ── tenant_users ──────────────────────────────────────────────────────────────
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_users
  AS RESTRICTIVE
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- ── user_kms_keys ─────────────────────────────────────────────────────────────
ALTER TABLE user_kms_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_kms_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_kms_keys
  AS RESTRICTIVE
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- ── Index coverage (required for O(1) RLS filter) ────────────────────────────
-- If these indexes don't already exist from the baseline schema, create them:
CREATE INDEX IF NOT EXISTS idx_tenant_users_org_id ON tenant_users (org_id);
CREATE INDEX IF NOT EXISTS idx_user_kms_keys_org_id ON user_kms_keys (org_id);
```

> **Why `AS RESTRICTIVE`?** A restrictive policy combines with AND against all other
> policies — the row is only visible if it passes this policy AND at least one permissive
> policy. Use it for blanket tenant-isolation rules that must always apply regardless of
> any future permissive grants. See [Postgres RLS best practices — permit.io](https://www.permit.io/blog/postgres-rls-implementation-guide).

**Step 2 — Update `server/drizzle/meta/_journal.json`**

Add `0001` as the first entry before `0002`. The journal `entries` array must be in
numeric order. Run `pnpm db:generate` after editing to regenerate the snapshot if Drizzle
reports a schema drift.

**Step 3 — Add `FORCE ROW LEVEL SECURITY` to `0002_crm_entities.sql` (or a patch migration)**

Check every `ALTER TABLE <entity> ENABLE ROW LEVEL SECURITY` line in `0002_crm_entities.sql`.
Add `ALTER TABLE <entity> FORCE ROW LEVEL SECURITY` immediately after each one so the app
role cannot bypass policies even if it happens to own the tables.

**Step 4 — Verify**

```bash
cd server
pnpm db:migrate   # apply 0001 then re-apply 0002+ idempotently
# In psql:
# SELECT tablename, rowsecurity, forcerls FROM pg_tables
#   WHERE schemaname = 'public'
#   AND tablename IN ('tenant_users', 'user_kms_keys', 'clients', 'tasks');
# All should show rowsecurity=t and forcerls=t.
```

**Step 5 — Add regression test**

Create `tests/security/server-rls-coverage.test.ts`. Test that:

- Querying `tenant_users` without `SET LOCAL app.org_id` returns zero rows (not an error)
- Querying with an `org_id` set returns only that tenant's rows
- Cross-tenant access returns zero rows, not a 403

---

### C-2 — Step-up auth client wiring is missing — all admin operations silently fail ✅ DONE 2026-05-25

**Severity:** CRITICAL — broken user flow; admin UI cannot complete any high-risk operation
**Standard:** RFC 9470 §3 (step-up challenge protocol); NIST SP 800-63B-4 AAL2/AAL3
**File:** `server/src/auth/routes.ts:261` (explicit TODO), `packages/core/src/security/auth.ts`

#### What is broken

The server correctly:

1. Issues step-up tokens at `POST /auth/step-up` (`server/src/auth/step-up.ts`)
2. Protects five admin routes with `requireStepUp(operation)` middleware

The client **never**:

- Calls `POST /auth/step-up` to obtain a step-up token
- Attaches `X-Step-Up-Token` to protected requests
- Handles the `HTTP 401 + WWW-Authenticate: Bearer error="insufficient_user_authentication"` challenge

Result: every admin operation (GDPR erase, KMS key management, AI allowlist, org settings)
returns a silent `401` with no recovery path shown to the user.

#### Implementation

**Step 1 — Add `requestStepUpToken()` to `packages/core/src/security/auth.ts`**

```typescript
/**
 * RFC 9470 Step-Up Authentication Challenge Protocol.
 * Called when a protected route responds with 401 + insufficient_user_authentication.
 *
 * Flow:
 *   1. Re-authenticate the user (password + TOTP/passkey if enrolled)
 *   2. POST to /auth/step-up with Bearer token + reAuthToken
 *   3. Return the single-use step-up token (TTL: 5 min, operation-scoped)
 */
export async function requestStepUpToken(
  operation: string,
  serverUrl: string,
  accessToken: string,
  reAuthToken: string,
): Promise<string> {
  const resp = await fetch(`${serverUrl}/auth/step-up`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ operation, reAuthToken }),
  })
  if (!resp.ok) throw new Error(`Step-up request failed: ${resp.status}`)
  const { step_up_token } = (await resp.json()) as { step_up_token: string }
  return step_up_token
}
```

**Step 2 — Add a `performWithStepUp()` wrapper**

Place this in `packages/core/src/security/auth.ts` as well. It handles the full
challenge-response cycle so callers don't need to understand RFC 9470:

```typescript
/**
 * Execute fn(stepUpToken) — retrying once with a fresh step-up token if
 * the initial attempt returns 401 insufficient_user_authentication.
 */
export async function performWithStepUp<T>(
  fn: (stepUpToken: string | undefined) => Promise<{ status: number; data: T }>,
  getStepUpToken: () => Promise<string>, // injected from auth flow
): Promise<T> {
  const first = await fn(undefined)
  if (first.status !== 401) return first.data
  // Parse WWW-Authenticate header to confirm it's a step-up challenge
  const token = await getStepUpToken()
  const second = await fn(token)
  if (second.status !== 200 && second.status !== 201) {
    throw new Error(`Step-up operation failed: ${second.status}`)
  }
  return second.data
}
```

**Step 3 — Wire into `packages/core/src/views/admin-console.ts`**

For each high-risk action (GDPR erase, key management), replace the direct `fetch` call
with `performWithStepUp(...)`. Show a re-authentication modal (`renderReauthModal` —
already present in `packages/core/src/security/auth.ts`) before obtaining the step-up
token.

**Step 4 — Test**

Add to `tests/security/server-auth.test.ts`:

- `POST /auth/step-up` with valid Bearer returns `{ step_up_token, operation, expires_in: 300 }`
- Protected route without `X-Step-Up-Token` returns `401` with correct `WWW-Authenticate` header
- Protected route with valid token returns `200`
- Protected route with consumed (already-used) token returns `401`
- Protected route with expired token returns `401`

---

### C-3 — Mobile native adapters are fully abstract with zero concrete implementations ✅ DONE 2026-05-25 (C-3c gap closed 2026-05-25)

> **Post-audit note (2026-05-25):** C-3a (`CapacitorVaultAdapter`) and C-3b (`CapacitorBiometricAdapter`) were complete. C-3c (`CapacitorBackupAdapter`) was absent despite C-3 being marked done. `capacitor-backup-adapter.ts` was created: Web Share API Level 2 (primary export path) + `@capacitor/filesystem` Documents fallback, hidden `<input type="file">` for import, synchronous JSON envelope validation for dry-run. 4 Vitest tests added (dryRunImport, in-process only — device-gated export/import tests remain `.todo`).

**Severity:** CRITICAL for Phase 8 mobile delivery; must not ship without this
**Standard:** MASVS 2.0 MASVS-STORAGE-1 (encrypted native storage), MASVS-CRYPTO-1
**Files:** `packages/adapter-mobile-native/src/mobile-vault-adapter.ts`, `mobile-backup-adapter.ts`, `biometric-unlock-adapter.ts`

#### What is broken

All three are `abstract` classes. `apps/mobile/` (Capacitor) uses `dist/enterprise` as its
WebView source. Without concrete adapter implementations, biometric unlock, vault
persistence, and backup/export are all broken on native iOS and Android.

#### Implementation

**Step 1 — Install dependencies in `apps/mobile/`**

```bash
# In apps/mobile/ or wherever Capacitor is configured
pnpm add @capacitor/filesystem @capacitor-community/biometric-auth
```

Per Capacitor security docs, use `@capacitor/filesystem` with `Directory.Data` (private
app directory, excluded from iCloud/Google Drive) for vault storage, and
`@capacitor-community/biometric-auth` version ≥ 9.0.0 (Capacitor 7 compatible, released
April 2025) for biometric.

**Step 2 — Create `packages/adapter-mobile-native/src/capacitor-vault-adapter.ts`**

Extend `MobileVaultAdapter`. Key requirements from MASVS-STORAGE-1:

- Write to `Directory.Data` (not `Directory.Documents` — Documents is iCloud-synced on iOS)
- Write to a temp file then rename (atomic write)
- Never pass plaintext data — the caller always encrypts before calling `writeVault()`
- `getVaultDirectory()` must not reveal tenant or user identity in the returned path

```typescript
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { MobileVaultAdapter, type VaultReadResult } from './mobile-vault-adapter.js'

export class CapacitorVaultAdapter extends MobileVaultAdapter {
  private static readonly VAULT_DIR = 'taskapp-vault'
  private static readonly VAULT_FILE = 'vault.enc'
  private static readonly VAULT_TEMP = 'vault.enc.tmp'

  override async readVault(): Promise<VaultReadResult | null> {
    try {
      const result = await Filesystem.readFile({
        path: `${CapacitorVaultAdapter.VAULT_DIR}/${CapacitorVaultAdapter.VAULT_FILE}`,
        directory: Directory.Data,
      })
      const raw =
        typeof result.data === 'string'
          ? Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))
          : new Uint8Array(await (result.data as Blob).arrayBuffer())
      const stat = await Filesystem.stat({
        path: `${CapacitorVaultAdapter.VAULT_DIR}/${CapacitorVaultAdapter.VAULT_FILE}`,
        directory: Directory.Data,
      })
      return { data: raw, modifiedAt: new Date(stat.mtime).toISOString() }
    } catch {
      return null
    }
  }

  override async writeVault(data: Uint8Array): Promise<void> {
    const b64 = btoa(String.fromCharCode(...data))
    // Write to temp then rename — atomic on the Capacitor bridge
    await Filesystem.writeFile({
      path: `${CapacitorVaultAdapter.VAULT_DIR}/${CapacitorVaultAdapter.VAULT_TEMP}`,
      data: b64,
      directory: Directory.Data,
      recursive: true,
    })
    await Filesystem.rename({
      from: `${CapacitorVaultAdapter.VAULT_DIR}/${CapacitorVaultAdapter.VAULT_TEMP}`,
      to: `${CapacitorVaultAdapter.VAULT_DIR}/${CapacitorVaultAdapter.VAULT_FILE}`,
      toDirectory: Directory.Data,
    })
  }

  override async deleteVault(): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `${CapacitorVaultAdapter.VAULT_DIR}/${CapacitorVaultAdapter.VAULT_FILE}`,
        directory: Directory.Data,
      })
    } catch {
      /* not found is fine */
    }
  }

  override async vaultExists(): Promise<boolean> {
    try {
      await Filesystem.stat({
        path: `${CapacitorVaultAdapter.VAULT_DIR}/${CapacitorVaultAdapter.VAULT_FILE}`,
        directory: Directory.Data,
      })
      return true
    } catch {
      return false
    }
  }

  override getVaultDirectory(): string {
    return CapacitorVaultAdapter.VAULT_DIR
  }
}
```

**Step 3 — Create `CapacitorBiometricAdapter`**

Extend `BiometricUnlockAdapter`. MASVS-CRYPTO-1 and NIST SP 800-63B-4 AAL2 requirements:

- Store only the **wrapped** (AES-256-KW encrypted) master key — never the raw key or password
- On Android: `setInvalidatedByBiometricEnrollment(true)` — enrollment change wipes the key
- On iOS: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — never synced to iCloud

```typescript
import { BiometricAuth, BiometryType } from '@capacitor-community/biometric-auth'
import {
  BiometricUnlockAdapter,
  type BiometricAvailability,
  type BiometricPromptOptions,
} from './biometric-unlock-adapter.js'
// For Keychain/Keystore storage, use @aparajita/capacitor-secure-storage
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

const BIOMETRIC_KEY_ALIAS = 'taskapp.vault.wrappedkey'

export class CapacitorBiometricAdapter extends BiometricUnlockAdapter {
  override async isAvailable(): Promise<BiometricAvailability> {
    const result = await BiometricAuth.checkBiometry()
    return {
      available: result.isAvailable,
      biometricType: mapBiometryType(result.biometryType),
      enrolled: result.isAvailable,
      reason: result.reason,
    }
  }

  override async storeWrappedKey(wrappedKey: Uint8Array): Promise<void> {
    const b64 = btoa(String.fromCharCode(...wrappedKey))
    await SecureStorage.set({ key: BIOMETRIC_KEY_ALIAS, value: b64 })
  }

  override async retrieveWrappedKey(prompt: BiometricPromptOptions): Promise<Uint8Array> {
    await BiometricAuth.authenticate({
      reason: prompt.description ?? prompt.title,
      title: prompt.title,
      cancelTitle: prompt.cancelButtonText,
    })
    const result = await SecureStorage.get({ key: BIOMETRIC_KEY_ALIAS })
    if (!result?.value) throw new Error('No wrapped key stored')
    return Uint8Array.from(atob(result.value), (c) => c.charCodeAt(0))
  }

  override async deleteWrappedKey(): Promise<void> {
    try {
      await SecureStorage.remove({ key: BIOMETRIC_KEY_ALIAS })
    } catch {
      /* ok */
    }
  }

  override async hasStoredKey(): Promise<boolean> {
    try {
      const result = await SecureStorage.get({ key: BIOMETRIC_KEY_ALIAS })
      return !!result?.value
    } catch {
      return false
    }
  }
}

function mapBiometryType(t: BiometryType): 'touchId' | 'faceId' | 'fingerprint' | 'iris' | 'none' {
  switch (t) {
    case BiometryType.touchId:
      return 'touchId'
    case BiometryType.faceId:
      return 'faceId'
    case BiometryType.fingerprintAuthentication:
      return 'fingerprint'
    case BiometryType.irisAuthentication:
      return 'iris'
    default:
      return 'none'
  }
}
```

**Step 4 — Wire into `apps/enterprise-web/src/entry.ts`**

```typescript
import { Capacitor } from '@capacitor/core'

if (Capacitor.isNativePlatform()) {
  const { CapacitorVaultAdapter } =
    await import('../../../packages/adapter-mobile-native/src/capacitor-vault-adapter.js')
  // register with the vault subsystem — exact wiring depends on how auth.ts
  // currently loads vault persistence; follow the existing hook pattern
  registerNativeVaultAdapter(new CapacitorVaultAdapter())
}
```

**Step 5 — Update `it.todo()` tests in `tests/adapters/mobile-adapter.test.ts`**

The atomic-write test (line 33) can now be implemented using the `CapacitorVaultAdapter`
with a mocked `Filesystem` that throws mid-write. Lines 51, 55 are legitimately
device-only — annotate them as `// requires Xcode Organizer / adb verification` and move
them to a `tests/e2e/mobile/` Playwright-Mobile suite.

---

### C-4 — Zero unit tests for 16 server-side service files ✅ DONE 2026-05-25

**Severity:** CRITICAL for production confidence
**Standard:** OWASP A10:2025 Mishandling of Exceptional Conditions; NIST audit trail integrity
**Files:** All 16 files in `server/src/services/`

#### What is broken

The service layer (`withTenant`, `writeAuditEvent`, pagination, soft-delete) has no direct
test coverage. A regression in `base.ts` would corrupt audit trails or silently skip tenant
isolation for all CRM operations without any test catching it.

#### Implementation

**Step 1 — Create `tests/unit/services/base.service.test.ts`**

The most critical file to test. Cover:

- `withTenant()` sets `app.tenant_id` and `app.org_id` before calling `fn`
- `withTenant()` rolls back the transaction if `fn` throws
- `writeAuditEvent()` inserts a row with the correct `eventType`, `resourceType`, `resourceId`
- `paginationValues()` clamps page/pageSize to valid ranges

Use an in-memory Drizzle setup (sqlite in-memory or pg-mem) or mock the `db` export:

```typescript
// tests/unit/services/base.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecute, mockInsert } = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue(undefined),
  mockInsert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'audit-1' }]) }),
  }),
}))

vi.mock('../../server/src/db/index.js', () => ({
  db: {
    transaction: vi.fn((fn) => fn({ execute: mockExecute, insert: mockInsert })),
  },
}))

// Import AFTER mock is wired
const { withTenant, writeAuditEvent, paginationValues } =
  await import('../../server/src/services/base.js')

describe('withTenant', () => {
  it('sets app.tenant_id and app.org_id before calling fn', async () => {
    await withTenant('tenant-123', async (tx) => {
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          /* SET LOCAL */
        }),
      )
    })
  })

  it('propagates errors from fn without swallowing them', async () => {
    await expect(
      withTenant('t1', async () => {
        throw new Error('db error')
      }),
    ).rejects.toThrow('db error')
  })
})

describe('paginationValues', () => {
  it('defaults to page=1, pageSize=20', () => {
    const r = paginationValues({})
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(20)
  })

  it('clamps pageSize to 100 maximum', () => {
    const r = paginationValues({ pageSize: 500 })
    expect(r.pageSize).toBeLessThanOrEqual(100)
  })
})
```

**Step 2 — Create `tests/unit/services/clients.service.test.ts`**

Cover `list()`, `getById()`, `create()` (verify audit event emitted), `update()`, `delete()`
(verify soft-delete writes to trash), `restore()`.

**Step 3 — Create `tests/unit/services/tasks.service.test.ts`**

Same pattern. Also cover the overdue/due-today filter logic which has the highest business
logic complexity.

**Step 4 — Create `tests/unit/services/audit.service.test.ts`**

Cover `appendOnly` enforcement: verify that `writeAuditEvent` cannot overwrite or update
an existing audit row (only INSERT is permitted — see `0006_audit_append_only.sql`).

**Step 5 — Add coverage thresholds to `vitest.config.ts`**

Per Vitest 3.x best practices (verified 2026):

```typescript
// In vitest.config.ts, add:
coverage: {
  provider: 'istanbul',  // more accurate branch coverage than v8 for ternary expressions
  include: ['server/src/**/*.ts', 'packages/core/src/security/**/*.ts', 'packages/core/src/storage/**/*.ts'],
  exclude: ['**/*.d.ts', '**/node_modules/**', 'server/src/db/schema/**'],
  thresholds: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
  reportsDirectory: './coverage',
},
```

---

## §3 — MODERATE Issues

Implement after all CRITICAL items are complete and green.

---

### M-1 — Placeholder architecture directories contain only stub comments ✅ DONE 2026-05-25

**Severity:** MODERATE — misleading to new contributors; import graph has dead entries
**Files:**

- `packages/core/src/application/index.ts:1`
- `packages/core/src/domain/index.ts:1`
- `packages/core/src/migrations/index.ts:1`
- `packages/core/src/platform/index.ts:1`

#### Implementation

Two acceptable outcomes — choose one based on Phase 1 timeline:

**Option A (Phase 1 imminent):** Define the minimal public contracts so callers can import
from them without getting empty modules. For example, `domain/index.ts` should export
at minimum the core value-object types (e.g. `TenantId`, `UserId`) that the application
layer and services use, even if the full domain model comes later.

**Option B (Phase 1 is months away):** Remove the directories from the package exports in
`packages/core/package.json` and update CLAUDE.md to reflect that these are future-phase
work. A developer importing from a non-existent export gets a build error (good) instead
of silently importing nothing (bad).

Do not leave them as-is either way — one-line placeholder comments in exported modules
violate the production-readiness standard in CLAUDE.md.

---

### M-2 — `ai-tools.ts` default case throws uncaught runtime error ✅ DONE 2026-05-25

**Severity:** MODERATE — crashes the AI panel on unknown tool calls
**OWASP:** A10:2025 Mishandling of Exceptional Conditions
**File:** `packages/core/src/ai/ai-tools.ts:645`

#### What is broken

```typescript
default:
  throw new Error(`Tool not implemented: ${tool}`)
```

If the AI model emits a tool name that is in the schema but missing a `case`, the app
throws synchronously inside `routeToolCall()`, which is called from an async message loop.
The error propagates up, terminates the streaming session, and leaves the UI in a broken
state with no user-visible error message.

#### Implementation

Replace the `default` throw with a graceful fallback:

```typescript
default: {
  // Log to audit trail so the tool gap is discoverable without crashing the session.
  const { writeAuditEvent } = await import('../security/audit.js')
  writeAuditEvent({ eventType: 'ai.tool.unknown', metadata: { tool, args } })
  return {
    error: 'unsupported_tool',
    tool,
    message: `Tool '${tool}' is not available in this build. Try rephrasing your request.`,
  }
}
```

Then ensure `handleModelOutput()` (the caller) surfaces `result.error` to the chat UI as
a system message rather than silently discarding it.

---

### M-3 — E2E Playwright tests have no CI integration ✅ DONE 2026-05-25

**Severity:** MODERATE — accessibility regressions can ship undetected
**Files:** `tests/e2e/accessibility/*.spec.ts`, `playwright.config.ts`

#### Implementation

**Step 1 — Create `.github/workflows/e2e.yml`** (or equivalent for your CI platform)

```yaml
name: E2E Accessibility
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build:offline
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test tests/e2e/
        env:
          PLAYWRIGHT_BASE_URL: file://${{ github.workspace }}/dist/offline/index.html
```

**Step 2 — Verify `playwright.config.ts` uses `PLAYWRIGHT_BASE_URL`**

The config should read `process.env.PLAYWRIGHT_BASE_URL ?? 'file://...'` as its
`baseURL` so the CI job above works without hardcoding a path.

---

### M-4 — `it.todo()` mobile tests have no offline equivalent for atomic-write invariant ✅ DONE 2026-05-25

**Severity:** MODERATE — data corruption risk if vault write is interrupted
**File:** `tests/adapters/mobile-adapter.test.ts:33`

#### Implementation

After C-3 is implemented, replace the `it.todo` on line 33 with a real test using a
mocked Filesystem that throws after writing the temp file but before the rename:

```typescript
it('writeVault() is atomic — a crash mid-rename leaves the previous vault intact', async () => {
  const adapter = new CapacitorVaultAdapter()
  const original = new Uint8Array([0xca, 0xfe])
  await adapter.writeVault(original)

  // Simulate crash after temp write but before rename
  vi.spyOn(Filesystem, 'rename').mockRejectedValueOnce(new Error('simulated crash'))

  await expect(adapter.writeVault(new Uint8Array([0xde, 0xad]))).rejects.toThrow()
  // Previous vault must still be readable
  const result = await adapter.readVault()
  expect(result?.data).toEqual(original)
})
```

Lines 51, 55, 59 (`it.todo` for platform-filesystem isolation and share sheet) are
legitimately device-gated — move them to `tests/e2e/mobile/platform-security.spec.ts`
with a skip guard: `test.skip(!process.env.MOBILE_DEVICE_CONNECTED, 'requires physical device')`.

---

### M-5 — `DataverseNotImplementedError` is dead code — exported but never thrown ✅ DONE 2026-05-25

**Severity:** MODERATE — misleads readers about adapter completeness
**File:** `packages/adapter-dataverse/src/index.ts:198–206`

#### Implementation

The `DataverseAdapter` is fully implemented. Remove the `DataverseNotImplementedError`
class entirely and remove its import from `tests/adapters/dataverse-adapter.test.ts`.
If a future partial implementation is expected, re-introduce the class at that time with
a specific method name tied to the unimplemented method.

---

### M-6 — No tests for KMS erasure workflow and destruction scheduler ✅ DONE 2026-05-25

**Severity:** MODERATE — GDPR Article 17 compliance is untested server-side
**Standard:** EDPB Guidelines 02/2025 on crypto-shredding as valid erasure
**Files:** `server/src/kms/erasure-workflow.ts`, `server/src/kms/destruction-scheduler.ts`, `server/src/kms/legal-hold.ts`

#### What is missing

`tests/security/gdpr-erasure.test.ts` covers the client-side crypto-shredding mechanics
only. The server-side workflow — retention hold check, KMS schedule, soft-delete cascade,
audit event — is completely untested.

#### Implementation

Create `tests/unit/kms/erasure-workflow.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockKmsAdapter } from '../../adapters/kms-mock.js'

// Must test:

describe('runDataRemovalWorkflow', () => {
  it('rejects with LegalHoldActiveError when user is on legal hold', async () => {
    /* */
  })
  it('calls kmsService.scheduleKeyDestruction() with correct userId', async () => {
    /* */
  })
  it('soft-deletes all CRM records for the user after scheduling key destruction', async () => {
    /* */
  })
  it('writes a gdpr_erasure_requested audit event with requestedBy', async () => {
    /* */
  })
  it('does not soft-delete records if key scheduling fails (atomic failure)', async () => {
    /* */
  })
})

describe('DestructionScheduler', () => {
  it('calls deleteKey() for rows past effectiveAt', async () => {
    /* */
  })
  it('does not call deleteKey() for rows with future effectiveAt', async () => {
    /* */
  })
  it('writes DESTROYED lifecycle event after deleteKey() succeeds', async () => {
    /* */
  })
  it('stops polling on stop()', async () => {
    /* */
  })
})

describe('LegalHoldService', () => {
  it('placeHold prevents erasure', async () => {
    /* */
  })
  it('liftHold re-enables erasure', async () => {
    /* */
  })
  it('isUserOnHold returns false for unknown user', async () => {
    /* */
  })
})
```

---

### M-7 — No tests for `adapter-rxdb-couchdb` ✅ DONE 2026-05-25

**Severity:** MODERATE — alternative sync protocol is unverified
**File:** `packages/adapter-rxdb-couchdb/src/index.ts`

#### Implementation

Create `tests/adapters/rxdb-couchdb-adapter.test.ts` using the same shared contract suite
used by the other adapter tests:

```typescript
import { runAdapterContractSuite } from './adapter-contract.js'
import { RxDBCouchDBAdapter } from '../../packages/adapter-rxdb-couchdb/src/index.js'

runAdapterContractSuite(
  'RxDBCouchDBAdapter',
  () => new RxDBCouchDBAdapter({ couchDbUrl: 'http://localhost:5984', dbName: 'test' }),
  { isStub: false },
)
```

If the adapter requires a live CouchDB instance, guard the suite with
`describe.skipIf(!process.env.COUCHDB_URL, ...)` and document this in the test.

---

## §4 — LOW / NIT Issues

Implement after CRITICAL and MODERATE items. These do not block production deployment
but should be resolved within the same sprint to prevent compounding technical debt.

---

### L-1 — AI system prompt is a single unreadable line in source ✅ DONE 2026-05-25

**Severity:** LOW
**File:** `packages/core/src/ai/ai-tools.ts:170`

Extract the system prompt to a named constant using a template literal:

```typescript
const SYSTEM_PROMPT = `
You are the Task App AI assistant...
[full prompt here, line-wrapped at 100 characters]
`.trim()
```

This makes the prompt visible in diffs and avoids grep suppression (`[Omitted long matching line]`)
in future audits.

---

### L-2 — `DataverseAdapter.pull()` OData primary key normalization is a silent no-op ✅ DONE 2026-05-25

**Severity:** LOW but data-integrity risk for all Dataverse sync operations
**File:** `packages/adapter-dataverse/src/index.ts:77`

```typescript
// CURRENT (no-op — replaces 'tktaskapp_' with 'tktaskapp_'):
const pkField = `${entitySet.replace('tktaskapp_', 'tktaskapp_')}id`

// FIX:
const pkField = entitySet.replace('tktaskapp_', '') + 'id'
// Produces: 'tasksid', 'clientsid', etc.
```

Add a test in `tests/adapters/dataverse-adapter.test.ts` that verifies the `id` field is
correctly normalised after a `pull()` that returns a row with a Dataverse PK field.

---

### L-3 — Drizzle migration journal gap should be formally documented ✅ DONE 2026-05-25

**Severity:** LOW
**File:** `server/drizzle/meta/_journal.json`

After C-1 is resolved, verify the journal starts at `0001` and has no gaps. Add a comment
at the top of each migration file explaining what it does and why it is in that position.
This is housekeeping rather than a code change.

---

### L-4 — Duplicate accessibility tests as both `.test.ts` (vitest) and `.spec.ts` (Playwright) ✅ DONE 2026-05-25

**Severity:** LOW — test maintenance burden and potential drift
**Files:** `tests/accessibility/*.test.ts` (3 files) and `tests/e2e/accessibility/*.spec.ts` (3 files)

Audit whether the vitest accessibility tests (`tests/accessibility/`) run meaningful DOM
assertions or are effectively no-ops (mocked DOM in a Node environment cannot test real
keyboard focus). If they add no value over the Playwright specs, delete the vitest variants
and rely on the E2E specs exclusively. If they test static HTML structure independently of
the browser, keep both and add a comment explaining the distinction.

---

## §5 — Security Gaps Not in Original Analysis (Identified During Research)

These items surfaced during the standards review phase. They are not gaps in existing code
but are missing controls that 2026 standards now require.

---

### S-1 — NIST SP 800-63B-4 supersedes 800-63B: passkeys are now required for AAL2 ✅ DONE 2026-05-25 (items 1 and 3 gaps closed 2026-05-25)

> **Post-audit note (2026-05-25):** Item 2 (settings UX labelling) was complete. Items 1 and 3 were not:
>
> **Item 1 (first-run passkey enrollment):** `auth.ts` now calls `isWebAuthnAvailable()` after vault creation and, when the injected `_savePasskeyForAuth` hook is present, renders a passkey setup card inline in the auth screen before calling `onSuccess(key)`. The hook (wired in `bootstrap.ts` via `setAuthPasskeyHook`) writes the credential directly to `nexus_data_v1` using the freshly derived key, bypassing the hook-based webauthn.ts helpers which require `state.cryptoKey` to already be set.
>
> **Item 3 (re-auth modal verification):** The previous implementation accepted any non-empty password string as sufficient proof (`if (!pw) return; resolve()`). Fixed: now calls `initCrypto(pw)` → `verifyPassword(derivedKey)` (600k PBKDF2 rounds + AES-GCM tag check). Passkey option is rendered first when enrolled credentials exist. Failed attempts are subject to the same exponential-backoff lockout as the primary login (shared `nexus_auth_fail_count` / `nexus_auth_locked_until` via exported `getAuthLockedUntil`, `recordAuthFailure`, `resetAuthLockout`). `NotAllowedError` (user cancelled) aborts the passkey loop immediately rather than falling through to remaining credentials. All re-auth outcomes are audit-logged.

**Standard:** NIST SP 800-63B-4 (final, released July 2025; supersedes 800-63B which was
withdrawn August 1 2025)

The WebAuthn/passkey implementation in `packages/core/src/security/webauthn.ts` exists.
Verify that:

1. The app encourages passkey enrollment during onboarding (not just buried in Settings)
2. The TOTP fallback is positioned as a downgrade path (AAL1) not an equivalent to passkeys (AAL2)
3. The re-authentication modal (used by step-up auth in C-2) offers passkey authentication first

If TOTP is currently offered as the primary MFA method, update the UX priority order to
offer passkey first, TOTP second, per SP 800-63B-4 §5.1.7 (phishing-resistant authenticators
are the new baseline for AAL2).

---

### S-2 — RFC 9700 (OAuth 2.0 Security BCP) token binding requirements ✅ DONE 2026-05-25

**Standard:** RFC 9700 Best Current Practice for OAuth 2.0 Security (final)

Verify `server/src/auth/oidc-service.ts` and `server/src/auth/middleware.ts` implement:

- `state` parameter is validated on callback (PKCE flow)
- `nonce` is validated for ID tokens
- Access tokens are bound to the requesting client (via `azp` claim or audience validation)
- Refresh token rotation is enforced (single-use; `server/src/auth/state-store.ts` has
  `rememberRefreshTokenUse` — confirm it actually enforces rotation)

---

### S-3 — EDPB Guidelines 02/2025: audit log for erasure must include key destruction timestamp ✅ DONE 2026-05-25

**Standard:** EDPB Guidelines 02/2025 on Blockchain and GDPR (published 2026)

The existing `gdpr_erasure_requested` audit event does not currently capture the KMS key
destruction timestamp. Add a `keyDestructionScheduledAt` and `keyDestroyedAt` field to the
erasure audit event when those lifecycle events occur, so the audit trail can prove to
regulators that the key was destroyed within the stated retention window.

---

## §6 — Test Coverage Targets

After all CRITICAL and MODERATE items are implemented, the codebase should meet these
minimum coverage thresholds (enforced via `vitest.config.ts` `coverage.thresholds`):

| Module                        | Target branches | Target lines | Current                             |
| ----------------------------- | --------------- | ------------ | ----------------------------------- |
| `server/src/services/`        | 80%             | 80%          | ~0%                                 |
| `server/src/kms/`             | 80%             | 80%          | ~0%                                 |
| `packages/core/src/security/` | 80%             | 80%          | ~40% (crypto, master-password only) |
| `packages/core/src/storage/`  | 80%             | 80%          | ~50% (db only)                      |
| `packages/adapter-*/`         | 70%             | 70%          | varies                              |
| `server/src/auth/`            | 90%             | 90%          | ~60% (middleware, routes partial)   |

Run coverage: `pnpm test -- --coverage`

---

## §7 — Definition of Done

An issue is complete only when ALL of the following are true:

- [ ] The cited file no longer contains the described gap (confirmed by reading the file)
- [ ] A test covers the implemented behaviour (not just a smoke test — behavioural assertions)
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm test` passes with zero failures
- [ ] If the change touches server auth, crypto, or KMS: a second reviewer (or the user)
      has approved the change before merge
- [ ] The item heading in this document has been updated with `✅ DONE [date]`
- [ ] `CHANGELOG.md` has a new entry under the appropriate category
- [ ] If the change affects documented facts in CLAUDE.md, TECHNICAL-REFERENCE.md,
      SECURITY.md, or DECISIONS.md: those files have been updated

---

## §8 — Sprint Order

```
Sprint 1 — Security blockers (implement before any other work)
  C-1  Create 0001_rls_policies.sql; add FORCE RLS to 0002; add regression test
  S-2  Verify RFC 9700 token binding in oidc-service.ts and middleware.ts

Sprint 2 — Broken admin flows
  C-2  Implement requestStepUpToken() + performWithStepUp() + admin-console wiring
  S-1  Verify NIST SP 800-63B-4 passkey priority in re-auth modal UX

Sprint 3 — Service layer test coverage
  C-4a Create tests/unit/services/base.service.test.ts
  C-4b Create tests/unit/services/clients.service.test.ts
  C-4c Create tests/unit/services/tasks.service.test.ts
  C-4d Create tests/unit/services/audit.service.test.ts
  C-4e Add vitest coverage thresholds to vitest.config.ts

Sprint 4 — GDPR/KMS coverage
  M-6  Create tests/unit/kms/erasure-workflow.test.ts
  S-3  Add keyDestructionScheduledAt/keyDestroyedAt to erasure audit event

Sprint 5 — Runtime safety
  M-2  Harden ai-tools.ts routeToolCall() default case
  L-2  Fix OData PK normalization bug in DataverseAdapter.pull():77

Sprint 6 — Adapter completeness
  M-7  Create tests/adapters/rxdb-couchdb-adapter.test.ts
  M-5  Remove DataverseNotImplementedError dead export

Sprint 7 — CI & E2E
  M-3  Create .github/workflows/e2e.yml for Playwright accessibility suite
  L-4  Audit and consolidate duplicate accessibility test files

Sprint 8 — Mobile native (hardware-gated; run in parallel with Sprint 7 if device available)
  C-3a Implement CapacitorVaultAdapter
  C-3b Implement CapacitorBiometricAdapter
  C-3c Implement CapacitorBackupAdapter
  M-4  Replace it.todo atomic-write test with real mock-based test
  C-3d Wire adapters into apps/enterprise-web/src/entry.ts via Capacitor.isNativePlatform()

Sprint 9 — Cleanup
  M-1  Decide Phase 1 timebox for domain/application/platform placeholder directories
  L-1  Extract AI system prompt to named constant
  L-3  Document migration journal gap in each migration file header
```

---

## §9 — Issue Index (quick reference)

| ID  | Severity | File                                                                   | Status             |
| --- | -------- | ---------------------------------------------------------------------- | ------------------ |
| C-1 | CRITICAL | `server/drizzle/0001_rls_policies.sql` (missing)                       | ✅ DONE 2026-05-25 |
| C-2 | CRITICAL | `server/src/auth/routes.ts:261` + `packages/core/src/security/auth.ts` | ✅ DONE 2026-05-25 |
| C-3 | CRITICAL | `packages/adapter-mobile-native/src/*.ts` (all abstract)               | ✅ DONE 2026-05-25 |
| C-4 | CRITICAL | `server/src/services/*.ts` (zero tests)                                | ✅ DONE 2026-05-25 |
| M-1 | MODERATE | `packages/core/src/{application,domain,migrations,platform}/index.ts`  | ✅ DONE 2026-05-25 |
| M-2 | MODERATE | `packages/core/src/ai/ai-tools.ts:645`                                 | ✅ DONE 2026-05-25 |
| M-3 | MODERATE | `.github/workflows/accessibility.yml` (stub → real Playwright)         | ✅ DONE 2026-05-25 |
| M-4 | MODERATE | `tests/adapters/mobile-adapter.test.ts:33`                             | ✅ DONE 2026-05-25 |
| M-5 | MODERATE | `packages/adapter-dataverse/src/index.ts:198`                          | ✅ DONE 2026-05-25 |
| M-6 | MODERATE | `server/src/kms/erasure-workflow.ts` (no tests)                        | ✅ DONE 2026-05-25 |
| M-7 | MODERATE | `packages/adapter-rxdb-couchdb/src/index.ts` (no tests)                | ✅ DONE 2026-05-25 |
| S-1 | SECURITY | `packages/core/src/security/webauthn.ts` — NIST SP 800-63B-4 AAL2      | ✅ DONE 2026-05-25 |
| S-2 | SECURITY | `server/src/auth/oidc-service.ts` — RFC 9700 token binding             | ✅ DONE 2026-05-25 |
| S-3 | SECURITY | `server/src/kms/erasure-workflow.ts` — EDPB 02/2025 audit              | ✅ DONE 2026-05-25 |
| L-1 | LOW      | `packages/core/src/ai/ai-tools.ts:170`                                 | ✅ DONE 2026-05-25 |
| L-2 | LOW      | `packages/adapter-dataverse/src/index.ts:77`                           | ✅ DONE 2026-05-25 |
| L-3 | LOW      | `server/drizzle/` migration headers                                    | ✅ DONE 2026-05-25 |
| L-4 | LOW      | `tests/accessibility/*.test.ts` vs `tests/e2e/accessibility/*.spec.ts` | ✅ DONE 2026-05-25 |

---

_Standards sources verified 2026-05-25:_

- _[OWASP Top 10:2025](https://owasp.org/Top10/2025/)_
- _[NIST SP 800-63B-4](https://csrc.nist.gov/pubs/sp/800/63/b/4/final) (supersedes 800-63B, withdrawn Aug 2025)_
- _[RFC 9470 — OAuth 2.0 Step Up Authentication Challenge Protocol](https://www.rfc-editor.org/rfc/rfc9470.html)_
- _[RFC 9700 — Best Current Practice for OAuth 2.0 Security](https://datatracker.ietf.org/doc/rfc9700/)_
- _[EDPB Guidelines 02/2025 on Blockchain and GDPR](https://www.edpb.europa.eu/system/files/2026-02/edpb_cef-report_2025_right-to-erasure_en.pdf)_
- _[PostgreSQL RLS multi-tenant best practices](https://www.permit.io/blog/postgres-rls-implementation-guide)_
- _[Capacitor 7 biometric/secure storage](https://capgo.app/blog/biometric-authentication-in-capacitor-apps/)_
- _[Vitest 3.x coverage configuration](https://vitest.dev/config/coverage)_
