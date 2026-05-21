import { checkDbHealth } from '../../db/index.js'
import { DefaultAzureCredential } from '@azure/identity'
import { KeyClient } from '@azure/keyvault-keys'

export interface HealthStatus {
  readonly status: 'ok' | 'degraded' | 'error'
}

export interface ReadinessStatus {
  readonly status: 'ready' | 'not_ready'
  readonly db: 'connected' | 'disconnected'
  readonly kms: 'connected' | 'disconnected'
}

export interface HttpContext {
  json(statusCode: number, body: unknown): void
}

/**
 * GET /healthz — liveness probe.
 * Returns 200 as long as the process is alive. Never probes dependencies.
 */
export function handleHealthz(ctx: HttpContext): void {
  ctx.json(200, { status: 'ok' } satisfies HealthStatus)
}

const _KMS_PROBE_TIMEOUT_MS = 3_000
const _DB_PROBE_TIMEOUT_MS = 3_000
const _KMS_SENTINEL_KEY = 'tktaskapp-health-sentinel'

function _withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error('probe timeout'))
      }, ms),
    ),
  ])
}

async function _checkKmsHealth(): Promise<boolean> {
  const vaultUrl = process.env['AZURE_KEY_VAULT_URL']
  if (!vaultUrl) return false
  try {
    const credential = new DefaultAzureCredential()
    const client = new KeyClient(vaultUrl, credential)
    await client.getKey(_KMS_SENTINEL_KEY)
    return true
  } catch (e) {
    // If the key simply doesn't exist, vault is still reachable
    const msg = e instanceof Error ? e.message : ''
    return msg.includes('KeyNotFound') || msg.includes('404')
  }
}

/**
 * GET /readyz — readiness probe.
 * Probes DB and Azure Key Vault. Each probe has a 3000ms timeout.
 */
export async function handleReadyz(ctx: HttpContext): Promise<void> {
  const [dbOk, kmsOk] = await Promise.all([
    _withTimeout(checkDbHealth(), _DB_PROBE_TIMEOUT_MS).catch(() => false),
    _withTimeout(_checkKmsHealth(), _KMS_PROBE_TIMEOUT_MS).catch(() => false),
  ])

  const body: ReadinessStatus = {
    status: dbOk && kmsOk ? 'ready' : 'not_ready',
    db: dbOk ? 'connected' : 'disconnected',
    kms: kmsOk ? 'connected' : 'disconnected',
  }

  ctx.json(dbOk && kmsOk ? 200 : 503, body)
}
