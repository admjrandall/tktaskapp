import type { BuildProfile } from './types.js'

export const OFFLINE_NO_AI_PROFILE = {
  id: 'offline-no-ai',
  displayName: 'Offline — No AI',
  allowExternalNetwork: false,
  allowCloudAI: false,
  allowOllama: false,
  allowBrowserNano: false,
  aiMode: 'none',
  adapter: 'null',
  storage: 'idb-vault',
  csp: 'strict-offline',
  requireServer: false,
  gdprErasureModel: 'local-vault-delete',
  kmsRequired: false,
  accessibilityTarget: 'WCAG-2.2-AA',
} as const satisfies BuildProfile
