import type { BuildProfile } from './types.js'

/** Minimal DeploymentPolicy shape — mirrors packages/core/src/deployment-policy.ts. */
export interface PolicyShape {
  id: string
  label: string
  ai: {
    allowedTiers: ('browser' | 'ollama' | 'cloud')[]
    allowOllamaModelPull: boolean
    allowPublicAIEndpoints: boolean
    allowedConnectSrc: string[]
  }
}

/** Derives a runtime DeploymentPolicy from a typed BuildProfile. */
export function toPolicy(profile: BuildProfile, connectSrc: string[] = []): PolicyShape {
  const tiers: ('browser' | 'ollama' | 'cloud')[] = []
  if (profile.allowBrowserNano) tiers.push('browser')
  if (profile.allowOllama) tiers.push('ollama')
  if (profile.allowCloudAI) tiers.push('cloud')

  return {
    id: profile.id,
    label: profile.displayName,
    ai: {
      allowedTiers: tiers,
      allowOllamaModelPull: profile.allowOllama,
      allowPublicAIEndpoints: profile.allowExternalNetwork,
      allowedConnectSrc: connectSrc,
    },
  }
}
