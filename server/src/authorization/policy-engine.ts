// Authorization policy engine — interface stub.
// TODO: Implement with OPA (Open Policy Agent) or AWS Cedar when server is ready.
//
// Section 11.2 — Authorization: policy-as-code, deny-by-default
//
// Design:
//   - Deny-by-default: every request requires an explicit policy grant.
//     No implicit permission inheritance. No "catch-all" allow rules.
//   - Centralized Policy Decision Point (PDP): authorization logic never lives
//     in route handlers. All routes call evaluate() before any data access.
//   - Object-level enforcement: called in every service function, not only route
//     guards. Prevents BOLA/IDOR even when an attacker crafts a valid route call.
//   - Policy-as-code: policy definitions live in version control under
//     server/src/authorization/policies/; reviewed and approved like source code.
//
// OPA vs Cedar — both are acceptable; record the final choice as an ADR:
//   OPA:   General-purpose, Rego-based, embeds as library or sidecar. Best for
//          complex ABAC policies with contextual attributes.
//   Cedar: Formally verified, strongly typed, mathematically proven sound and
//          terminating. No policy can accidentally grant more access than intended.
//
// BOLA/IDOR requirement:
//   Every endpoint must have a test in tests/security/bola-idor.test.ts covering:
//     - Cross-tenant object access: user A cannot read tenant B's records.
//     - Cross-user object access: user A cannot read user B's records within the
//       same tenant, unless an explicit policy grants it (e.g. manager role).

export type PolicyEffect = 'allow' | 'deny'

export interface PolicySubject {
  readonly userId: string
  readonly tenantId: string
  readonly roles: readonly string[]
}

export interface PolicyResource {
  /** Resource type name — e.g. 'client', 'project', 'document'. */
  readonly type: string
  /** Opaque resource identifier. */
  readonly id: string
  /** Tenant that owns this resource. Cross-tenant access is always denied. */
  readonly tenantId: string
  /** User that created/owns this record (for owner-only policies). */
  readonly ownerId?: string
}

export interface PolicyAction {
  /** Action name — e.g. 'read', 'write', 'delete', 'export', 'admin'. */
  readonly name: string
}

export interface PolicyContext {
  /** Client IP for audit evidence — never used to make authorization decisions. */
  readonly ipAddress?: string
  /** Truncated user-agent string for audit evidence. */
  readonly userAgent?: string
  /** Correlation ID for the current request — links policy decision to request trace. */
  readonly requestId: string
  readonly timestamp: Date
}

export interface PolicyDecision {
  readonly effect: PolicyEffect
  /**
   * Human-readable identifier of the policy rule that produced this decision.
   * Used in audit evidence — must not contain PII or sensitive data.
   */
  readonly matchedRule?: string
  /**
   * Reason for a deny decision — audit-safe string, no PII.
   * Returned to the server log, not to the API client (return 403 without detail).
   */
  readonly reason?: string
}

export interface PolicyEngine {
  /**
   * Evaluate whether subject may perform action on resource in context.
   *
   * MUST be called:
   *   1. In every route handler (request-level gate).
   *   2. In every service function that mutates or reads tenant data (object-level gate).
   *
   * Never cache an allow decision across requests. Evaluate freshly each time.
   * A deny decision must never throw — return { effect: 'deny' }.
   */
  evaluate(
    subject: PolicySubject,
    action: PolicyAction,
    resource: PolicyResource,
    context: PolicyContext,
  ): Promise<PolicyDecision>

  /**
   * Load or hot-reload policy definitions from version-controlled source.
   * Called on server startup and on SIGHUP (policy hot-reload signal).
   * The policySource parameter is a file path or OPA bundle URL.
   */
  loadPolicies(policySource: string): Promise<void>
}

// TODO: implement OpaEngine implements PolicyEngine
//   - @open-policy-agent/opa-wasm (embedded) or OPA sidecar REST API
//   - Rego policies in server/src/authorization/policies/*.rego
//
// TODO: implement CedarEngine implements PolicyEngine
//   - @cedar-policy/cedar-wasm
//   - Cedar policies in server/src/authorization/policies/*.cedar
//
// TODO: implement PolicyMiddleware
//   Middleware chain: authenticate → resolveTenant → evaluate → enforce (403 on deny)
//   Tenant ID resolved from validated token claims, never from request body.
//
// TODO: implement object-level authorization guard
//   Utility: assertAllow(engine, subject, action, resource, ctx): Promise<void>
//   Throws 403-equivalent on deny; intended for service-layer calls.
