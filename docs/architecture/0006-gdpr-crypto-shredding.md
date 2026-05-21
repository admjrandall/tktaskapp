# ADR 0006 — GDPR Erasure via Crypto-Shredding

**Status:** Accepted  
**Date:** 2026-05-19  
**Authors:** Task App CRM team  
**Supersedes:** —  
**Related:** ADR 0007 (identity), Phase 9 (server KMS implementation)

---

## Context

Task App CRM stores all user data as AES-256-GCM ciphertext. When a user exercises
their GDPR Article 17 right to erasure, we must render their data permanently
unreadable across every storage location — including backups, exported `.vault` files,
IndexedDB, and any future cold storage.

Traditional deletion cannot satisfy this because:

- Backups are write-once; individual records cannot be removed retroactively.
- Exported files live on user devices outside our control.
- Database soft-deletes and log entries can retain personal data.

Crypto-shredding solves this by destroying the encryption key rather than the data.

---

## Decision

Implement a per-user DEK/KEK key hierarchy. User data is encrypted with a
Data Encryption Key (DEK). Each DEK is wrapped by a Key Encryption Key (KEK) that
lives exclusively inside a Hardware Security Module (HSM) backed KMS. To erase a user,
destroy their KEK — all wrapped DEKs become permanently unrecoverable.

---

## Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│  KMS boundary (HSM — key material never exported)               │
│                                                                   │
│   User A KEK  ─── wrap/unwrap ───► WrappedDEK_A  (stored in DB) │
│   User B KEK  ─── wrap/unwrap ───► WrappedDEK_B  (stored in DB) │
│   User C KEK  ─── wrap/unwrap ───► WrappedDEK_C  (stored in DB) │
│                                                                   │
│   ┌────────────────────────────────────────────────────────┐     │
│   │  On scheduleKeyDestruction(userId) + destroyAt reached │     │
│   │  KMS permanently deletes User A KEK from HSM           │     │
│   │  → WrappedDEK_A is now an opaque, unrecoverable blob   │     │
│   │  → vault ciphertext, backups, exports: all unreadable  │     │
│   └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘

App layer (outside KMS):

  [Vault blob] = AES-256-GCM( plaintext, DEK_A )
  [WrappedDEK] = KMS.wrap( DEK_A, KEK_A )   ← only this is stored

  Decrypt flow:
    DEK_A = KMS.unwrap( WrappedDEK, KEK_A )
    plaintext = AES-256-GCM.decrypt( vault_blob, DEK_A )

  After erasure (KEK_A destroyed):
    KMS.unwrap( WrappedDEK, KEK_A ) → REJECTED (key does not exist)
    plaintext is permanently inaccessible
```

---

## DSAR Workflow (Data Subject Access Request — Erasure)

### Step-by-step

1. **Request received** — user or DPA submits erasure request via support channel or
   automated DSAR portal. Ticket created with `userId`, timestamp, and legal basis.

2. **Identity verification** — confirm the request is from or on behalf of the data subject.
   Document verification method and outcome.

3. **Legal hold check** — query `getKeyStatus(userId)` to verify no active legal hold
   (`legalHold: false`). If a hold exists, inform the requestor and pause erasure.

4. **Schedule destruction** — call `scheduleKeyDestruction(userId, destroyAt)` where
   `destroyAt` is no later than 30 days from receipt (GDPR Art. 12(3) deadline).
   Log the scheduled date in the DSAR ticket.

5. **Cascade notification** — notify all integrated systems (audit log, SIEM, backup
   metadata) that a destruction is scheduled for `userId`.

6. **Key destruction executed** — at `destroyAt`, the KMS HSM destroys the KEK.
   The KMS emits a signed destruction receipt.

7. **Confirmation** — call `getKeyStatus(userId)` and assert `status === 'destroyed'`.
   Record `destroyedAt` timestamp and the destruction receipt in the DSAR ticket.

8. **Notify data subject** — send written confirmation of erasure within the GDPR
   deadline, including the `destroyedAt` timestamp as evidence.

9. **Audit retention** — retain the DSAR ticket and destruction receipt for 3 years
   (to demonstrate compliance). The ticket itself contains no personal data —
   only `userId` (pseudonym), timestamps, and the destruction receipt hash.

### Evidence artefacts

| Artefact                                      | Source            | Retained for |
| --------------------------------------------- | ----------------- | ------------ |
| DSAR ticket (userId, timestamps, legal basis) | DSAR portal       | 3 years      |
| KMS destruction receipt (signed)              | KMS HSM audit log | 3 years      |
| `getKeyStatus()` response at destruction      | API audit log     | 3 years      |
| Notification sent to data subject             | Email system      | 3 years      |

---

## EU DPA Legal Analysis

### GDPR Article 17 compliance

The GDPR requires that personal data be "erased without undue delay" upon a valid
request. Crypto-shredding satisfies this because:

**Recital 26** defines personal data as information relating to an identified or
identifiable natural person. Data encrypted with a destroyed key is no longer
identifiable — it is mathematically equivalent to random noise. The EDPB's
guidelines on encryption (Guidelines 01/2021) confirm that properly encrypted data
whose key has been destroyed falls outside the definition of personal data.

**Article 17(1)** requires erasure of personal data. Destroying the KEK renders
all personal data encrypted under it permanently unreadable, satisfying the
requirement without locating and deleting individual records across every medium.

**Article 5(1)(e)** (storage limitation) — once the key is destroyed, no personal
data is stored anywhere in the system, even in backups.

### National DPA positions

| Authority                         | Position                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **CNIL (France)**                 | Accepts crypto-shredding as valid erasure if the key cannot be recovered and destruction is auditable (Q&A on GDPR rights, 2021). |
| **BSI / BfDI (Germany)**          | Accepts destruction of encryption keys as a technical erasure measure (BSI TR-02102 and BfDI guidance).                           |
| **ICO (UK)**                      | Post-Brexit UK GDPR: ICO guidance accepts encryption key deletion as erasure where recovery is not technically feasible.          |
| **Datatilsynet (Denmark/Norway)** | Accepts crypto-shredding for backup data specifically, recognising the impracticality of selective deletion.                      |

### Limitations and mitigations

| Limitation                                           | Mitigation                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Key destruction is irreversible — no undo            | Legal hold check before scheduling; 30-day window before execution                            |
| KMS provider could theoretically retain key material | Use HSM-backed KMS with FIPS 140-2 Level 3 certification; contractual commitments             |
| Data subject may have exported their own copy        | Inform data subject in erasure confirmation that locally held copies are their responsibility |

---

## Consequences

**Positive:**

- True erasure across all storage tiers (IDB, backups, exports) with zero ciphertext modification.
- Scalable: O(1) erasure regardless of data volume.
- Auditable: `getKeyStatus().auditTrail` provides complete lifecycle evidence.
- Compatible with immutable backup policies.

**Negative:**

- Adds KMS dependency for enterprise deployments (offline/browser-only profile unaffected).
- Key destruction is permanent; operational errors cannot be reversed.
- Requires HSM-backed KMS to withstand key recovery attacks.

---

## Implementation status

- [x] KmsAdapter interface — `packages/adapter-kms/src/index.ts`
- [ ] Concrete server implementation — Phase 9 (`server/src/kms/key-service.ts`)
- [ ] DSAR portal integration
- [ ] Legal hold support
- [ ] Backup metadata cascade notification
