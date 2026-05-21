// Authorization policy engine — TypeScript-native implementation.
// Phase 9+: replace with OPA (Open Policy Agent) or AWS Cedar for full ABAC.
// Deny-by-default: every request requires an explicit policy grant.

import type { AuthenticatedContext } from '../auth/oidc.js'

export interface PolicyDecision {
  allowed: boolean
  reason?: string
}

export interface PolicyRequest {
  context: AuthenticatedContext
  action: string
  resource?: string
  resourceOrgId?: string
}

// Role-based action matrix
const _ADMIN_ACTIONS = new Set(['admin:delete-user', 'admin:manage-keys', 'admin:view-audit'])
const _EDITOR_ACTIONS = new Set([
  'tasks:create',
  'tasks:update',
  'tasks:delete',
  'records:create',
  'records:update',
])
const _VIEWER_ACTIONS = new Set(['tasks:read', 'records:read'])

/**
 * Evaluate whether the authenticated context may perform the requested action.
 * Cross-tenant access is always denied regardless of role.
 * Unknown actions are denied.
 */
export function evaluate(request: PolicyRequest): PolicyDecision {
  // Cross-tenant deny — must be first check, no exceptions
  if (request.resourceOrgId !== undefined && request.resourceOrgId !== request.context.orgId) {
    return { allowed: false, reason: 'Cross-tenant access denied' }
  }

  const { role } = request.context

  if (_ADMIN_ACTIONS.has(request.action)) {
    if (role === 'owner' || role === 'admin') return { allowed: true }
    return { allowed: false, reason: 'Insufficient role for admin action' }
  }

  if (_EDITOR_ACTIONS.has(request.action)) {
    if (role === 'owner' || role === 'admin' || role === 'editor') return { allowed: true }
    return { allowed: false, reason: 'Insufficient role for write action' }
  }

  if (_VIEWER_ACTIONS.has(request.action)) {
    return { allowed: true }
  }

  return { allowed: false, reason: `Unknown action: ${request.action}` }
}

// TODO(Phase 9+): OpaEngine implements full ABAC with Rego policies
// TODO(Phase 9+): CedarEngine — formally verified, strongly typed
// TODO: PolicyMiddleware — authenticate → resolveTenant → evaluate → enforce (403 on deny)
// TODO: assertAllow(request) — service-layer utility; throws 403-equivalent on deny
