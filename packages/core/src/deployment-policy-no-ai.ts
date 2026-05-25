export type AITier = 'browser' | 'cloud'
export type PolicyLockdownLevel = 'off' | 'standard' | 'strong' | 'strict'

export interface DeploymentPolicy {
  id: string
  label: string
  lockdownLevel?: PolicyLockdownLevel
  auditRetentionDays?: number
  ai: {
    allowedTiers: AITier[]
    allowPublicAIEndpoints: boolean
    allowedConnectSrc: string[]
  }
}

export const deploymentPolicy: DeploymentPolicy = {
  id: 'offline-no-ai',
  label: 'Offline - No AI',
  ai: {
    allowedTiers: [],
    allowPublicAIEndpoints: false,
    allowedConnectSrc: [],
  },
}

export const DEFAULT_DEPLOYMENT_POLICY = deploymentPolicy
export const OT_ONLY_DEPLOYMENT_POLICY = deploymentPolicy
export const ENTERPRISE_DEPLOYMENT_POLICY = deploymentPolicy
export const DATAVERSE_DEPLOYMENT_POLICY = deploymentPolicy

export function setDeploymentPolicy(policy: DeploymentPolicy): void {
  deploymentPolicy.id = policy.id
  deploymentPolicy.label = policy.label
  if (policy.lockdownLevel !== undefined) deploymentPolicy.lockdownLevel = policy.lockdownLevel
  else delete deploymentPolicy.lockdownLevel
  if (policy.auditRetentionDays !== undefined)
    deploymentPolicy.auditRetentionDays = policy.auditRetentionDays
  else delete deploymentPolicy.auditRetentionDays
  deploymentPolicy.ai = {
    allowedTiers: [],
    allowPublicAIEndpoints: false,
    allowedConnectSrc: [],
  }
}

export function getDeploymentLockdownLevel(): PolicyLockdownLevel {
  return deploymentPolicy.lockdownLevel ?? 'off'
}

export function isAITierAllowed(_tier: string | null | undefined): _tier is AITier {
  return false
}

export function allowedAITiers(): AITier[] {
  return []
}

export function isOTOnlyMode(): boolean {
  return false
}

export function normalizeAIUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '')
}

export function isAllowedLocalAIEndpoint(_raw: string): boolean {
  return false
}

export function assertLocalAIEndpointAllowed(_raw: string): void {
  throw new Error('AI network access is disabled in this build.')
}
