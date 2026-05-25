// Authorization policy engine — deny-by-default ABAC.
// Evaluates all policy decisions. Three evaluation tiers (in order):
//   1. OPA REST sidecar (if OPA_URL env var is set)
//   2. WASM-compiled Rego policy (policies/crm.wasm, if present)
//   3. In-process TypeScript fallback (always available)
//
// Phase 9+ migration path: replace tier 3 with Cedar (formally verified,
// strongly typed) or extend the Rego policy for full ABAC attribute support.

import type { AuthenticatedContext } from '../auth/oidc.js'
import type { HonoEnv } from '../hono-types.js'
import type { MiddlewareHandler } from 'hono'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PolicyDecision {
  readonly allowed: boolean
  readonly reason?: string
}

export interface PolicyRequest {
  readonly context: AuthenticatedContext
  readonly action: Action
  readonly resourceType?: ResourceType
  readonly resourceId?: string
  /** Tenant ID of the resource being accessed. Used for cross-tenant check. */
  readonly resourceOrgId?: string
}

// ── Action catalogue ──────────────────────────────────────────────────────────
// Every action string used by any route or service layer MUST be listed here.
// Unknown actions → deny. This is the exhaustive set for the current delivery.

export type CrudAction = 'read' | 'create' | 'update' | 'delete'

export type AdminAction =
  | 'manage_users'
  | 'suspend_user'
  | 'erase_user'
  | 'manage_keys'
  | 'view_audit'
  | 'export_audit'
  | 'manage_ai_allowlist'
  | 'manage_integrations'
  | 'manage_org_settings'
  | 'admin:delete-user' // legacy alias — routes and OPA rego use this
  | 'admin:manage-keys' // legacy alias
  | 'admin:view-audit' // legacy alias

export type SyncAction = 'sync:pull' | 'sync:push' | 'sync:stream'

export type AiAction = 'ai:compute_attribute' | 'ai:configure'

export type Action = CrudAction | AdminAction | SyncAction | AiAction

// ── Resource type catalogue ───────────────────────────────────────────────────

export type ResourceType =
  | 'clients'
  | 'departments'
  | 'projects'
  | 'tasks'
  | 'people'
  | 'tags'
  | 'communications'
  | 'timeEntries'
  | 'notifications'
  | 'files'
  | 'documents'
  | 'standaloneNotes'
  | 'conversations'
  | 'deals'
  | 'pipelines'
  | 'audit'
  | 'sync'
  | 'users'
  | 'ai_attribute_definition'
  | 'ai_attribute_value'
  | 'org_settings'
  | 'integrations'
  | 'ai_allowlist'

// ── Role-based action matrix ──────────────────────────────────────────────────
// Deny-by-default: if an action is not in any set, it is denied for all roles.

/** Actions restricted to owner or admin roles. */
const _OWNER_ADMIN_ACTIONS = new Set<Action>([
  'manage_users',
  'suspend_user',
  'erase_user',
  'manage_keys',
  'view_audit',
  'export_audit',
  'manage_ai_allowlist',
  'manage_integrations',
  'manage_org_settings',
  'admin:delete-user',
  'admin:manage-keys',
  'admin:view-audit',
])

/** Actions allowed for editors (and above). Owners/admins inherit this set. */
const _EDITOR_ACTIONS = new Set<Action>([
  'read',
  'create',
  'update',
  'delete',
  'sync:pull',
  'sync:push',
  'sync:stream',
  'ai:compute_attribute',
])

/** Actions allowed for viewers (and above). All authenticated roles inherit. */
const _VIEWER_ACTIONS = new Set<Action>(['read', 'sync:pull', 'sync:stream'])

/** Actions restricted to owner role only. */
const _OWNER_ONLY_ACTIONS = new Set<Action>(['erase_user', 'manage_keys', 'ai:configure'])

// ── Core evaluation ───────────────────────────────────────────────────────────

/**
 * Evaluate whether the authenticated context may perform the requested action.
 *
 * Rules (applied in order, first match wins):
 *  1. Cross-tenant access is always denied regardless of role.
 *  2. Owner-only actions require role === 'owner'.
 *  3. Owner/admin actions require role === 'owner' | 'admin'.
 *  4. Editor actions require role === 'owner' | 'admin' | 'editor'.
 *  5. Viewer actions are allowed for any authenticated role.
 *  6. Unknown actions are denied.
 */
export function evaluate(request: PolicyRequest): PolicyDecision {
  const { action, context, resourceOrgId } = request
  const { role, orgId } = context

  // Rule 1: Cross-tenant deny — must be the very first check, no exceptions.
  if (resourceOrgId !== undefined && resourceOrgId !== orgId) {
    return { allowed: false, reason: 'cross-tenant access denied' }
  }

  // Rule 2: Owner-only actions.
  if (_OWNER_ONLY_ACTIONS.has(action)) {
    if (role === 'owner') return { allowed: true }
    return { allowed: false, reason: `action '${action}' requires owner role` }
  }

  // Rule 3: Owner or admin actions.
  if (_OWNER_ADMIN_ACTIONS.has(action)) {
    if (role === 'owner' || role === 'admin') return { allowed: true }
    return { allowed: false, reason: `action '${action}' requires admin or owner role` }
  }

  // Rule 4: Editor or higher.
  if (_EDITOR_ACTIONS.has(action)) {
    if (role === 'owner' || role === 'admin' || role === 'editor') return { allowed: true }
    return { allowed: false, reason: `action '${action}' requires editor role or higher` }
  }

  // Rule 5: Viewer or higher.
  if (_VIEWER_ACTIONS.has(action)) {
    return { allowed: true }
  }

  // Rule 6: Unknown action — deny with explanation.
  return { allowed: false, reason: `unknown action: '${action}'` }
}

// ── assertAllow — service-layer utility ───────────────────────────────────────

export class PolicyDeniedError extends Error {
  readonly statusCode = 403
  constructor(
    readonly action: string,
    readonly reason: string,
  ) {
    super(`Policy denied action '${action}': ${reason}`)
    this.name = 'PolicyDeniedError'
  }
}

/**
 * Assert that the policy allows the request.
 * Throws PolicyDeniedError (HTTP 403 equivalent) on deny.
 * Intended for service-layer guards where returning a response directly is not possible.
 *
 * @example
 *   assertAllow({ context: authCtx, action: 'erase_user', resourceOrgId: tenantId })
 */
export function assertAllow(request: PolicyRequest): void {
  const decision = evaluate(request)
  if (!decision.allowed) {
    throw new PolicyDeniedError(request.action, decision.reason ?? 'denied')
  }
}

// ── PolicyMiddleware factory ──────────────────────────────────────────────────

/**
 * Hono middleware that evaluates the policy engine for the given action.
 * Expects authMiddleware to have already set userId, tenantId, role, externalId, email.
 *
 * @example
 *   router.delete('/:id', policyMiddleware('delete'), handler)
 */
export function policyMiddleware(action: Action): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const role = c.get('role') as string | undefined
    const tenantId = c.get('tenantId') as string | undefined
    const userId = c.get('userId') as string | undefined
    const email = c.get('email') as string | undefined
    const externalId = c.get('externalId') as string | undefined

    if (!role || !tenantId || !userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const authCtx: AuthenticatedContext = {
      userId,
      orgId: tenantId,
      externalId: externalId ?? '',
      email: email ?? '',
      role: role as AuthenticatedContext['role'],
    }

    const decision = evaluate({ context: authCtx, action })
    if (!decision.allowed) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
}
