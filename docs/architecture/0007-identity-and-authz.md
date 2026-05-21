# ADR 0007 — Identity, Authentication, and Authorisation

**Status:** Accepted (design); Pending (implementation — Phase 9)  
**Date:** 2026-05-19  
**Authors:** Task App CRM team  
**Supersedes:** —  
**Related:** ADR 0006 (GDPR crypto-shredding), Phase 9 (server implementation)

---

## Context

The offline-first profile requires no server and uses a local password-derived key.
The enterprise profile adds multi-user, multi-tenant access with role-based controls
and audit requirements. This ADR establishes the identity and authorisation design for
the enterprise profile.

---

## 1. Authentication — OIDC / PKCE

### Protocol choice

**OpenID Connect (OIDC) with Proof Key for Code Exchange (PKCE)** is mandatory
for all interactive login flows. The implicit flow and password grant are prohibited.

```
Browser / App
    │
    │  1. Authorization Request (code_challenge, state, nonce)
    ▼
Identity Provider (IdP)
    │
    │  2. Auth code (short-lived, single-use)
    ▼
Browser / App
    │
    │  3. Token Request (code + code_verifier — PKCE proof)
    ▼
Identity Provider
    │
    │  4. id_token + access_token + refresh_token
    ▼
Browser / App
    │
    │  5. API calls (Bearer access_token)
    ▼
Task App API (server/)
```

### Required claims in `id_token`

| Claim   | Purpose                                                              |
| ------- | -------------------------------------------------------------------- |
| `sub`   | Immutable user identifier (maps to `userId` in KMS)                  |
| `tid`   | Tenant identifier for multi-tenant isolation                         |
| `email` | Display / DSAR identification                                        |
| `roles` | Application roles (see authorisation section)                        |
| `acr`   | Authentication context (e.g. `urn:mace:incommon:iap:silver` for MFA) |

### Supported Identity Providers

| Provider           | Notes                                      |
| ------------------ | ------------------------------------------ |
| Microsoft Entra ID | Primary enterprise target; OIDC + SAML 2.0 |
| Auth0              | SaaS; OIDC + social login                  |
| Keycloak           | Self-hosted; OIDC + SAML 2.0               |
| Google Workspace   | OIDC only                                  |

### Session management

- Access tokens: max 1-hour TTL; stored in memory only (never `localStorage`).
- Refresh tokens: max 8-hour sliding window; stored in `sessionStorage` at most.
- On `beforeunload`: access and refresh tokens are discarded.
- Step-up authentication (re-auth) required for sensitive operations:
  destructive bulk actions, key destruction scheduling, admin role assignment.

---

## 2. DPoP (Demonstrating Proof of Possession) — Roadmap

**Status: Planned.** DPoP (RFC 9449) binds access tokens to the client's
private key, preventing stolen token replay attacks.

When implemented:

1. Client generates an ephemeral EC P-256 key pair on each session.
2. Every API request includes a `DPoP` header: a signed JWT proving possession of
   the private key corresponding to the public key bound to the access token.
3. The server verifies the DPoP proof before accepting the access token.

This is a roadmap item for after the initial enterprise profile is functional.
Track in: `server/src/auth/oidc.ts` (TODO: DPoP proof verification middleware).

---

## 3. Authorisation — OPA vs Cedar

### Policy engines compared

| Dimension               | Open Policy Agent (OPA)                    | Cedar (Amazon Verified Permissions)                  |
| ----------------------- | ------------------------------------------ | ---------------------------------------------------- |
| **Language**            | Rego (Datalog-inspired)                    | Cedar (purpose-built, SQL-like)                      |
| **Evaluation model**    | General-purpose; Rego expresses any policy | Structured; Cedar enforces a strict schema           |
| **Performance**         | ~1 ms typical for small policies           | ~0.5 ms; optimised for large rule sets               |
| **Auditability**        | Policy as code; git-tracked                | Policy as data; versioned in AVP                     |
| **Formal verification** | Via OPA's policy testing framework         | Built-in formal verification (Cedar solver)          |
| **Multi-tenancy**       | Manual tenant isolation in Rego            | First-class `principal`, `resource`, `context` model |
| **Self-hosted**         | Yes (OPA sidecar or library)               | Via SDK + optional AVP cloud                         |
| **EU data residency**   | Self-hosted = full control                 | AVP hosted in chosen AWS region                      |

### Decision

Use **OPA** for the initial enterprise implementation:

- Self-hosted sidecar or library deployment ensures EU data residency.
- Policy-as-code in Rego integrates naturally with GitOps CI/CD.
- Existing operator familiarity.
- Cedar is the preferred migration target if formal verification becomes a compliance requirement.

### Policy model

```
Principals:  users (identified by sub + tid)
Resources:   records (store + id + tenant)
Actions:     read, write, delete, export, admin

Default:     DENY (explicit allow required)

Example rules:
  allow if principal.tid == resource.tid                  (same-tenant)
  allow if principal.roles includes "admin"               (admin override)
  deny  if resource.tenant != principal.tid               (cross-tenant block)
  allow if action == "read" and principal.roles includes "viewer"
```

Policy files: `server/src/authorization/policy-engine.ts` (Phase 9 stub).

---

## 4. BOLA / IDOR Control Points

**Broken Object Level Authorisation (BOLA)** and **Insecure Direct Object References (IDOR)**
are the top API security risk (OWASP API Security #1, 2023).

### Threat

A user in tenant A submits `GET /api/v1/clients/rec-123` where `rec-123` belongs to
tenant B. Without explicit tenant isolation checks, the server returns tenant B's data.

### Control architecture

```
Request → Auth middleware (verify access_token + extract tid + sub)
        → Tenant guard (assert resource.tenantId == token.tid)
        → OPA PDP (policy decision: allow / deny)
        → Handler (execute DB query scoped to tenantId)
        → Response
```

### Specific control points

| Endpoint pattern            | Control                                                   |
| --------------------------- | --------------------------------------------------------- |
| `GET /api/v1/:store/:id`    | Tenant guard: `SELECT ... WHERE id = ? AND tenant_id = ?` |
| `PUT /api/v1/:store/:id`    | Tenant guard + OPA write policy                           |
| `DELETE /api/v1/:store/:id` | Tenant guard + soft-delete audit log                      |
| `GET /api/v1/audit`         | Filter by `tenant_id` from token; no cross-tenant reads   |
| `POST /api/v1/admin/users`  | Require `admin` role claim AND step-up auth               |
| `POST /api/v1/kms/destroy`  | Require `admin` role + legal-hold check + 2-person rule   |

### Testing

Every control point must have a dedicated BOLA test:

- Cross-tenant object access → 403 Forbidden (never 200 or 404).
- Cross-user object access within same tenant → 403 if insufficient role.
- Admin endpoints without admin role → 403.
- See: `tests/security/bola-idor.test.ts` (Phase 10 stub).

---

## Consequences

**Positive:**

- PKCE mandatory closes the token interception attack surface.
- OPA policy-as-code enables audit, review, and formal testing of authorisation rules.
- Explicit tenant guard in every query prevents BOLA at the data layer.
- DPoP roadmap addresses token theft attacks when implemented.

**Negative:**

- OPA adds a dependency and a sidecar deployment concern.
- OIDC requires an external IdP for enterprise deployments.
- Step-up auth adds friction for admin operations.

---

## Implementation status

- [x] Design documented (this ADR)
- [ ] OIDC middleware — Phase 9 (`server/src/auth/oidc.ts`)
- [ ] OPA integration — Phase 9 (`server/src/authorization/policy-engine.ts`)
- [ ] Tenant guard middleware — Phase 9
- [ ] DPoP proof verification — post-Phase 9 roadmap
- [ ] BOLA tests — Phase 10 (`tests/security/bola-idor.test.ts`)
