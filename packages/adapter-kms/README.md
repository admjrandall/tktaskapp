# adapter-kms

KMS adapter interface for per-user key lifecycle management and GDPR crypto-shredding.

## What this is

`adapter-kms` defines the abstract `KmsAdapter` class that any Key Management Service
implementation must satisfy. Phase 9 provides the concrete server-side implementation
(`server/src/kms/key-service.ts`). Supported backends include Azure Key Vault,
AWS KMS, and HashiCorp Vault.

## Crypto-shredding mechanism

Traditional deletion removes the plaintext record but leaves ciphertext on disk,
in backups, in audit logs, and in cold storage — making true erasure nearly impossible.

**Crypto-shredding** inverts this: instead of deleting data, destroy the encryption key.
Every byte of ciphertext that was encrypted under the destroyed key becomes permanently
and mathematically unreadable — indistinguishable from random noise.

### DEK / KEK hierarchy

```
User (userId)
  └── Key Encryption Key (KEK)  — held exclusively in KMS; never exported
        └── Data Encryption Key (DEK)  — ephemeral AES-256-GCM key per vault flush
              └── Vault ciphertext     — stored in IDB / backup / cold storage
```

1. On first login, `issueKey(userId)` creates a KEK inside the KMS boundary.
2. When the app flushes data, it generates a fresh DEK, encrypts the vault blob with it,
   then calls `wrapKey(dek, kek)` so the KMS wraps the DEK with the user's KEK.
3. The WrappedKey (opaque ciphertext) is stored alongside the vault blob.
4. On next load, `unwrapKey(wrapped, kek)` recovers the DEK so the vault can be decrypted.
5. The raw DEK never persists; the raw KEK never leaves the KMS.

### GDPR Article 17 — Right to Erasure

When a deletion request arrives:

1. Call `scheduleKeyDestruction(userId, destroyAt)`.
2. At `destroyAt`, the KMS destroys the KEK — all DEKs wrapped by it are now unrecoverable.
3. The vault ciphertext, backups, audit log snapshots, and any exported files encrypted
   under that KEK are all permanently unreadable.
4. `getKeyStatus(userId)` returns `{ status: 'destroyed', destroyedAt: '...' }` which
   serves as cryptographic proof of erasure for DSAR evidence.

**No plaintext data is retained** in any system after key destruction — the erasure
is complete without touching a single ciphertext byte.

## EU DPA acceptance basis

The Article 29 Working Party (now EDPB) guidelines and several EU Data Protection
Authority opinions accept crypto-shredding as a valid erasure technique provided:

| Requirement                        | How we satisfy it                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Key is genuinely unrecoverable     | KMS HSM with `delete` = non-exportable key destruction                                  |
| No key material in logs or backups | raw DEK/KEK never leaves KMS; only WrappedKey is stored                                 |
| Destruction is auditable           | `getKeyStatus().auditTrail` records every lifecycle event                               |
| All copies rendered unreadable     | ciphertext in IDB, disk `.vault`, exports all use the same DEK hierarchy                |
| Timely execution                   | `scheduleKeyDestruction` accepts a `destroyAt` date; 30-day maximum per GDPR Art. 12(3) |

> **Note:** This approach aligns with EDPB guidelines on pseudonymisation and encryption
> (Guidelines 01/2021), ENISA's Pseudonymisation Techniques report, and has been accepted
> by the German BSI and French CNIL in published guidance.

## Status

- [x] Interface defined (`packages/adapter-kms/src/index.ts`)
- [ ] Concrete implementation (`server/src/kms/key-service.ts`) — Phase 9
- [ ] Azure Key Vault backend
- [ ] AWS KMS backend
- [ ] HashiCorp Vault backend
- [ ] DSAR workflow integration
- [ ] Legal hold support (suspend destruction while under legal obligation)
