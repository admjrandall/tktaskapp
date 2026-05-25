import type { MiddlewareHandler } from 'hono'
import { otel } from '../observability/otel.js'

export interface PolicyInput {
  userId?: string
  role: string
  action: string
  tenantId: string
  resourceType?: string
  resourceId?: string
  resourceTenantId?: string | null
  route?: {
    method: string
    path: string
  }
}

// OPA REST sidecar response shape
interface OpaQueryResult {
  result: boolean
}

// WASM OPA instance (lazy-loaded)
let _wasmInstance: WasmOpaInstance | null = null

interface WasmOpaInstance {
  evaluate(input: unknown): Promise<unknown>
}

async function _loadWasmPolicy(): Promise<WasmOpaInstance | null> {
  if (_wasmInstance !== null) return _wasmInstance
  try {
    // @open-policy-agent/opa-wasm does not ship a Wasm bundle — the consuming
    // project must compile crm.rego → crm.wasm via `opa build`. For dev, fall
    // back to the TypeScript policy engine if no bundle is present.
    const { loadPolicy } = await import('@open-policy-agent/opa-wasm')
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const policyPath = path.resolve(process.cwd(), 'policies', 'crm.wasm')
    const wasmBytes = await fs.readFile(policyPath)
    const policy = await loadPolicy(wasmBytes)
    _wasmInstance = {
      evaluate(input: unknown): Promise<unknown> {
        return Promise.resolve(policy.evaluate(input) as unknown)
      },
    }
    return _wasmInstance
  } catch {
    return null
  }
}

async function _evaluateViaRest(input: PolicyInput): Promise<boolean> {
  const opaUrl = process.env['OPA_URL']
  if (!opaUrl) throw new Error('OPA_URL not configured')
  const resp = await fetch(`${opaUrl}/v1/data/crm/allow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  if (!resp.ok) throw new Error(`OPA REST returned ${resp.status}`)
  const body = (await resp.json()) as OpaQueryResult
  return body.result
}

/** Actions that require owner or admin role. */
const _OPA_ADMIN_ACTIONS = new Set([
  'manage_users',
  'suspend_user',
  'manage_keys',
  'manage_ai_allowlist',
  'manage_integrations',
  'manage_org_settings',
  'view_audit',
  'export_audit',
  'admin:delete-user',
  'admin:manage-keys',
  'admin:view-audit',
])

/** Actions restricted to owner only. */
const _OPA_OWNER_ONLY_ACTIONS = new Set(['erase_user', 'ai:configure'])

/** Actions allowed for editors and above (not viewer-accessible). */
const _OPA_EDITOR_ONLY_ACTIONS = new Set([
  'create',
  'update',
  'delete',
  'sync:push',
  'ai:compute_attribute',
])

/** Actions any authenticated role may perform (viewer and above). */
const _OPA_VIEWER_ACTIONS = new Set(['read', 'sync:pull', 'sync:stream'])

function _evaluateInProcess(input: PolicyInput): boolean {
  const { role, action, tenantId, resourceTenantId } = input

  // Cross-tenant deny — always first, no exceptions
  if (resourceTenantId != null && resourceTenantId !== tenantId) return false

  if (_OPA_OWNER_ONLY_ACTIONS.has(action)) return role === 'owner'
  if (_OPA_ADMIN_ACTIONS.has(action)) return role === 'owner' || role === 'admin'
  if (_OPA_EDITOR_ONLY_ACTIONS.has(action))
    return role === 'owner' || role === 'admin' || role === 'editor'
  if (_OPA_VIEWER_ACTIONS.has(action)) return true // any authenticated role
  return false
}

export async function evaluatePolicy(input: PolicyInput): Promise<boolean> {
  const opaUrl = process.env['OPA_URL']
  try {
    if (opaUrl) {
      return await _evaluateViaRest(input)
    }
    const wasm = await _loadWasmPolicy()
    if (wasm) {
      const result = (await wasm.evaluate({ input })) as Array<{ result: boolean }>
      return result[0]?.result === true
    }
    return _evaluateInProcess(input)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId: input.tenantId,
      requestId: 'opa-eval',
      message: 'OPA evaluation failed — denying by default',
      extra: { error: err instanceof Error ? err.message : String(err) },
    })
    return false
  }
}

export function opaMiddleware(action: string): MiddlewareHandler {
  return async (c, next) => {
    const role = c.get('role') as string | undefined
    const tenantId = c.get('tenantId') as string | undefined
    const userId = c.get('userId') as string | undefined

    if (!role || !tenantId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const allowed = await evaluatePolicy({
      role,
      action,
      tenantId,
      ...(userId ? { userId } : {}),
      route: { method: c.req.method, path: c.req.path },
    })
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
}

export function resourcePolicyMiddleware(
  action: string,
  resourceType: string,
  resolveResourceTenantId: (
    c: Parameters<MiddlewareHandler>[0],
    tenantId: string,
    resourceId: string,
  ) => Promise<string | null>,
): MiddlewareHandler {
  return async (c, next) => {
    const role = c.get('role') as string | undefined
    const tenantId = c.get('tenantId') as string | undefined
    const userId = c.get('userId') as string | undefined
    const resourceId = c.req.param('id')

    if (!role || !tenantId || !resourceId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const resourceTenantId = await resolveResourceTenantId(c, tenantId, resourceId)
    if (!resourceTenantId) {
      return c.json({ error: 'Not found' }, 404)
    }

    const allowed = await evaluatePolicy({
      role,
      action,
      tenantId,
      ...(userId ? { userId } : {}),
      resourceType,
      resourceId,
      resourceTenantId,
      route: { method: c.req.method, path: c.req.path },
    })
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
}
