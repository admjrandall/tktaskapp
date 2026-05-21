import type { Context, Next } from 'hono'
import { otel } from '../observability/otel.js'

export interface PolicyInput {
  role: string
  action: string
  tenantId: string
  resourceTenantId?: string | null
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
      async evaluate(input: unknown) {
        return policy.evaluate(input)
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
  return body.result === true
}

function _evaluateInProcess(input: PolicyInput): boolean {
  const { role, action, tenantId, resourceTenantId } = input

  // Cross-tenant deny
  if (resourceTenantId != null && resourceTenantId !== tenantId) return false

  if (role === 'owner' || role === 'admin') return true
  if (role === 'editor') return action === 'read' || action === 'create' || action === 'update'
  if (role === 'viewer') return action === 'read'
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
      traceId: 'none',
      spanId: 'none',
      tenantId: input.tenantId,
      requestId: 'opa-eval',
      message: 'OPA evaluation failed — denying by default',
      extra: { error: err instanceof Error ? err.message : String(err) },
    })
    return false
  }
}

export function opaMiddleware(action: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const role = c.get('role') as string | undefined
    const tenantId = c.get('tenantId') as string | undefined

    if (!role || !tenantId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const allowed = await evaluatePolicy({ role, action, tenantId })
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
}
