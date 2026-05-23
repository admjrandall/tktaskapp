# Phase 4 Week 1 - Verification Report

Branch: claude/generate-offline-profile-html-CRKHK
Verifier: Agent F
Date: 2026-05-22
Commit range: HEAD~7..HEAD (7 Phase 4 commits)

---

## Gate Results

### Gate 1 - pnpm run typecheck: PASS

tsc --noEmit completed with zero errors. No type-level regressions.

---

### Gate 2 - pnpm run lint: PASS (warnings only)

ESLint: 362 problems (0 errors, 362 warnings). Zero errors. All warnings pre-existing.
Warning categories: @typescript-eslint/no-non-null-assertion,
@typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unused-vars.
No new error-level lint issues in Phase 4 files.

---

### Gate 3 - pnpm test: FAIL

40 of 44 tests FAILED in tests/adapters/rxdb-adapter.test.ts.

Root cause: RxDBAdapter constructor calls config.serverUrl.replace(...) but the test
harness (adapter-contract.ts:28) constructs new RxDBAdapter({}) with no serverUrl.
config.serverUrl is undefined.

    TypeError: Cannot read properties of undefined (reading replace)
      at new RxDBAdapter packages/adapter-rxdb/src/index.ts:78:35
      at isStub tests/adapters/rxdb-adapter.test.ts:75:46

Pre-existing regression. No Phase 4 file touches packages/adapter-rxdb/ or tests/.
4 tests passed. 1 test skipped.

Recommended fix: guard serverUrl in RxDBAdapter constructor:
this.\_base = (config.serverUrl ?? "").replace(...)
or supply a minimal valid config in the isStub() test helper.

---

### Gate 4 - Build targets: PASS

All three builds succeeded without errors.

| Target    | Outcome | Output size                |
| --------- | ------- | -------------------------- |
| offline   | PASS    | 472 kB (gzip 127 kB)       |
| sync      | PASS    | 63,845 kB (gzip 18,021 kB) |
| dataverse | PASS    | 938 kB JS + 23,567 kB WASM |

CSP hashes regenerated for offline and sync targets.
Dataverse build emits 4 pre-existing INEFFECTIVE_DYNAMIC_IMPORT warnings and one chunk-size
warning. Not regressions.

---

### Gate 5 - AI event types in audit.ts AND audit.schema.ts: FAIL

Two Phase 4 event types are in packages/core/src/security/audit.ts but ABSENT from
packages/core/src/schemas/audit.schema.ts:

| Event type              | audit.ts | audit.schema.ts |
| ----------------------- | -------- | --------------- |
| gdpr_erasure_requested  | line 65  | MISSING         |
| compliance_pack_changed | line 66  | MISSING         |

AuditEventTypeSchema is a v.picklist([...]) ending at persona_changed (line 59).
Any Valibot parse of an audit entry carrying these events fails at runtime, even though
AuditEntry.event is correctly typed via the re-exported AuditEventType from audit.ts.

admin-console.ts:466 calls auditLog(gdpr_erasure_requested, ...)
admin-console.ts:487 calls auditLog(compliance_pack_changed, ...)
Both produce entries that fail AuditEntrySchema validation.

Required fix: add gdpr_erasure_requested and compliance_pack_changed to v.picklist()
in packages/core/src/schemas/audit.schema.ts.

---

### Gate 6 - IDB stores in constants.ts AND \_dataDbOpen(): FAIL

IDB_STORES (constants.ts lines 43-56) lists 11 stores:
documents, conversations, customFieldDefs, aiAttributeDefs, aiAttributeValues,
extensionObjectDefs, extensionObjectInstances, workspaceLayouts, personaProfiles,
automationRules, agentInsights.

\_dataDbOpen() (idb-data.ts lines 10-27) only creates object stores for documents and
conversations. The 9 Phase 1 additions lack createObjectStore() calls. IDB version stays at 1.

Any transaction on the 9 missing stores throws:
DOMException: The operation failed because the requested database object could not be found.

Pre-existing carry-over from Phase 1 Week 1 report. Phase 4 did not add new IDB stores.

Required fix: increment IDB version in \_dataDbOpen() and add createObjectStore() for each
missing store in the onupgradeneeded handler.

---

### Gate 7 - New storage keys read/write consistency: PASS

Phase 4 introduces two new localStorage keys:

- tk*compliance*<id>: written and read exclusively in admin-console.ts
  (\_complianceEnabled() line 255, toggle handler lines 476-486). Self-consistent.

No new IDB keys or vault fields. lockdownLevel AppState field pre-dates Phase 4.
No orphaned read/write pairs detected.

---

### Gate 8 - renderX/bindX balance in views/: PASS (with notes)

All 20 view files checked. Two files have numeric imbalances, both structurally acceptable:

| File                | Renders | Binds | Status                                                               |
| ------------------- | ------- | ----- | -------------------------------------------------------------------- |
| sidebar.ts          | 2       | 1     | Intentional: renderBottomTabs shares bindSidebar()                   |
| workspace-canvas.ts | 2       | 1     | Intentional: renderCanvasBlock is a helper; bindCanvas covers canvas |

renderBottomTabs is embedded in renderSidebar DOM tree (no separate bind needed).
renderCanvasBlock is a pure string helper with no event listeners.
All 18 remaining view files have 1:1 balance. No new imbalance from Phase 4.

---

## Files Touched in This Merge

9 files across 7 Phase 4 commits:

- packages/core/src/deployment-policy.ts
  Added: PolicyLockdownLevel, lockdownLevel field, auditRetentionDays,
  ENTERPRISE_DEPLOYMENT_POLICY, DATAVERSE_DEPLOYMENT_POLICY, getDeploymentLockdownLevel()

- packages/core/src/security/audit.ts
  Added: hash-chain implementation, verifyAuditChain(),
  gdpr_erasure_requested and compliance_pack_changed event types

- packages/core/src/ui/components.ts
  Added: renderDLPWarning(), bindDLPWarning(), guardedAction()

- packages/core/src/views/admin-console.ts
  Added: chain-verify tab, lockdown level radios, compliance pack toggles, GDPR erasure form

- server/src/db/schema/audit-events.ts
  Added: chainPosition, prevHash, signedDigest columns (backward-compat nullable)

- server/src/middleware/lockdown.ts (NEW FILE)
  Added: lockdownMiddleware(), invalidateLockdownCache(); 30s TTL in-process cache

- server/src/ai-gateway/policy-engine.ts
  Added: lockdown tenant allowlist gate; DENY ALL when allowlist empty in strong/strict

- server/src/hono-types.ts
  Added: lockdownLevel: string to HonoEnv.Variables

- CHANGELOG.md
  Added: Phase 4 changelog entry

---

## Contract Violations

### CV-1 (CRITICAL) - Schema/type desync: gdpr_erasure_requested and compliance_pack_changed

AuditEventType (TypeScript union in audit.ts) and AuditEventTypeSchema (Valibot picklist in
audit.schema.ts) must stay in sync per Gate 5 contract. Two Phase 4 event types are missing
from the schema. Any code path parsing via AuditEntrySchema will silently reject GDPR erasure
and compliance pack toggle events at runtime.

Owning agent: Phase 4 dev agent that modified audit.ts must update audit.schema.ts.
The verifier does not modify packages/ files.

### CV-2 (CARRY-OVER, HIGH) - IDB_STORES entries without createObjectStore calls

9 of 11 IDB_STORES entries lack createObjectStore() in \_dataDbOpen(). First reported Phase 1
Week 1. Unresolved. Latent runtime crash vector for \_idbPutRecord/\_idbLoadStore on 9 stores.

---

## Regression Suggestions

1. Schema sync CI check: test or lint rule comparing AuditEventTypeSchema picklist against
   AuditEventType union members. A snapshot test catches Gate 5 violations before merge.

2. IDB version management: add IDB_DATA_VERSION constant in constants.ts; assert it matches
   the indexedDB.open() version; onupgradeneeded iterates IDB_STORES to create missing stores.
   Prevents the Gate 6 carry-over class of bugs.

3. RxDB adapter test guard: (config.serverUrl ?? "") in RxDBAdapter constructor fixes the
   40 pre-existing Gate 3 test failures.

4. Dedicated lockdownLevel audit event: admin-console.ts:385 uses workspace_layout_changed
   with context:lockdown_level. A lockdown_level_changed event type improves SIEM filtering.

5. Compliance pack encryption: tk*compliance*<id> is unencrypted localStorage, not vault-backed.
   Does not survive vault reset. Consider moving into the encrypted vault.

---

## Summary

| Gate                                              | Result                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| 1. typecheck                                      | PASS                                                             |
| 2. lint                                           | PASS (362 warnings, 0 errors)                                    |
| 3. test                                           | FAIL (40/44 - pre-existing RxDB constructor defect; not Phase 4) |
| 4. build:offline + build:sync + build:dataverse   | PASS                                                             |
| 5. AI event types in audit.ts AND audit.schema.ts | FAIL - CV-1: 2 events missing from schema                        |
| 6. IDB stores in constants.ts AND \_dataDbOpen()  | FAIL - CV-2: pre-existing carry-over                             |
| 7. Storage key read/write consistency             | PASS                                                             |
| 8. renderX/bindX balance in views/                | PASS                                                             |

Blocking before merge: Gate 5 (CV-1). Add gdpr_erasure_requested and compliance_pack_changed
to AuditEventTypeSchema in packages/core/src/schemas/audit.schema.ts.
Gate 6 (CV-2) is pre-existing; track separately.
