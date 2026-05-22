export type AITier = 'browser' | 'ollama' | 'cloud'

// C.7 — mirror of state.ts LockdownLevel; defined here (no deps) so deployment-policy
// can be imported before state.ts without a circular dependency.
export type PolicyLockdownLevel = 'off' | 'standard' | 'strong' | 'strict'

export interface DeploymentPolicy {
  id: string
  label: string
  lockdownLevel?: PolicyLockdownLevel
  auditRetentionDays?: number
  ai: {
    allowedTiers: AITier[]
    allowOllamaModelPull: boolean
    allowPublicAIEndpoints: boolean
    allowedConnectSrc: string[]
  }
}

export const DEFAULT_DEPLOYMENT_POLICY: DeploymentPolicy = {
  id: 'default',
  label: 'Standard',
  ai: {
    allowedTiers: ['browser', 'ollama', 'cloud'],
    allowOllamaModelPull: true,
    allowPublicAIEndpoints: true,
    allowedConnectSrc: [],
  },
}

export const OT_ONLY_DEPLOYMENT_POLICY: DeploymentPolicy = {
  id: 'ot-only',
  label: 'OT Only',
  ai: {
    allowedTiers: ['browser'],
    allowOllamaModelPull: false,
    allowPublicAIEndpoints: false,
    allowedConnectSrc: [],
  },
}

export const deploymentPolicy: DeploymentPolicy = structuredClone(DEFAULT_DEPLOYMENT_POLICY)

export function setDeploymentPolicy(policy: DeploymentPolicy): void {
  deploymentPolicy.id = policy.id
  deploymentPolicy.label = policy.label
  if (policy.lockdownLevel !== undefined) deploymentPolicy.lockdownLevel = policy.lockdownLevel
  if (policy.auditRetentionDays !== undefined)
    deploymentPolicy.auditRetentionDays = policy.auditRetentionDays
  deploymentPolicy.ai = {
    ...deploymentPolicy.ai,
    ...policy.ai,
    allowedTiers: [...policy.ai.allowedTiers],
    allowedConnectSrc: [...policy.ai.allowedConnectSrc],
  }
}

export function getDeploymentLockdownLevel(): PolicyLockdownLevel {
  return deploymentPolicy.lockdownLevel ?? 'off'
}

export const ENTERPRISE_DEPLOYMENT_POLICY: DeploymentPolicy = {
  id: 'enterprise',
  label: 'Enterprise',
  lockdownLevel: 'standard',
  auditRetentionDays: 2190, // 6 years — HIPAA default
  ai: {
    allowedTiers: ['browser', 'ollama', 'cloud'],
    allowOllamaModelPull: true,
    allowPublicAIEndpoints: true,
    allowedConnectSrc: [],
  },
}

export const DATAVERSE_DEPLOYMENT_POLICY: DeploymentPolicy = {
  id: 'dataverse',
  label: 'Dataverse',
  lockdownLevel: 'standard',
  auditRetentionDays: 2190,
  ai: {
    allowedTiers: ['browser', 'cloud'],
    allowOllamaModelPull: false,
    allowPublicAIEndpoints: false,
    allowedConnectSrc: [],
  },
}

export function isAITierAllowed(tier: string | null | undefined): tier is AITier {
  return !!tier && deploymentPolicy.ai.allowedTiers.includes(tier as AITier)
}

export function allowedAITiers(): AITier[] {
  return [...deploymentPolicy.ai.allowedTiers]
}

export function isOTOnlyMode(): boolean {
  return deploymentPolicy.id === 'ot-only'
}

export function normalizeAIUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '')
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255))
    return false
  const [a, b] = parts as [number, number, number, number]
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 127
  )
}

function isInternalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return (
    h === 'localhost' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.lan') ||
    (!h.includes('.') && /^[a-z0-9-]+$/.test(h))
  )
}

export function isAllowedLocalAIEndpoint(raw: string): boolean {
  const urlText = normalizeAIUrl(raw)
  let url: URL
  try {
    url = new URL(urlText)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (deploymentPolicy.ai.allowPublicAIEndpoints) return true

  const host = url.hostname.toLowerCase()
  if (isPrivateIPv4(host) || isInternalHostname(host)) return true

  return deploymentPolicy.ai.allowedConnectSrc.some((src) => {
    try {
      const allowed = new URL(src)
      return allowed.origin === url.origin
    } catch {
      return false
    }
  })
}

export function assertLocalAIEndpointAllowed(raw: string): void {
  if (!isAllowedLocalAIEndpoint(raw)) {
    throw new Error(
      'Offline AI can only connect to localhost, private LAN IPs, or internal hostnames.',
    )
  }
}
